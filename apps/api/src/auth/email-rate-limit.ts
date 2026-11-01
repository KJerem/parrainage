import { randomUUID } from "node:crypto";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma } from "../prisma/client.js";
import {
  type AttemptRule,
  EMAIL_ATTEMPT_RULES,
  emailAttemptKey,
  retryAfterSeconds,
  TOO_MANY_ATTEMPTS_MESSAGE,
} from "./attempt-limit.js";

/**
 * Incrément atomique (une seule requête SQL) dans la table de Better Auth. Ici `lastRequest`
 * contient le début de la fenêtre : elle repart à zéro une fois expirée.
 */
async function consumeAttempt(key: string, rule: AttemptRule, now: number): Promise<number | null> {
  const expiredBefore = BigInt(now - rule.window * 1000);
  const current = BigInt(now);
  const rows = await prisma.$queryRaw<{ count: number; lastRequest: bigint }[]>`
    INSERT INTO "rateLimit" ("id", "key", "count", "lastRequest")
    VALUES (${randomUUID()}, ${key}, 1, ${current})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rateLimit"."lastRequest" <= ${expiredBefore} THEN 1
                     ELSE "rateLimit"."count" + 1 END,
      "lastRequest" = CASE WHEN "rateLimit"."lastRequest" <= ${expiredBefore} THEN ${current}
                           ELSE "rateLimit"."lastRequest" END
    RETURNING "count", "lastRequest"`;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return retryAfterSeconds({ count: row.count, windowStart: Number(row.lastRequest) }, rule, now);
}

/** Crochet « before » de Better Auth : 429 au-delà de la limite de l'adresse e-mail. */
export const emailRateLimit = createAuthMiddleware(async (ctx) => {
  const rule = EMAIL_ATTEMPT_RULES[ctx.path];
  const email: unknown = ctx.body?.email;
  if (!rule || typeof email !== "string" || email.trim() === "") {
    return;
  }
  const retryAfter = await consumeAttempt(emailAttemptKey(ctx.path, email), rule, Date.now());
  if (retryAfter !== null) {
    throw new APIError(
      "TOO_MANY_REQUESTS",
      { code: "TOO_MANY_REQUESTS", message: TOO_MANY_ATTEMPTS_MESSAGE },
      { "X-Retry-After": String(retryAfter) },
    );
  }
});
