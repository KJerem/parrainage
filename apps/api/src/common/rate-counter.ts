import { randomUUID } from "node:crypto";
import { type AttemptRule, retryAfterSeconds } from "../auth/attempt-limit.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * Consomme une tentative du compteur `key` (table « rateLimit » de Better Auth), en une seule
 * requête SQL atomique. `lastRequest` y contient le début de la fenêtre : elle repart à zéro une
 * fois expirée. Renvoie `null` si la tentative passe, sinon le délai d'attente en secondes.
 * Horloge réelle (`now` en ms), comme les limites de Better Auth.
 */
export async function consumeAttempt(
  prisma: Pick<PrismaClient, "$queryRaw">,
  key: string,
  rule: AttemptRule,
  now: number,
): Promise<number | null> {
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
