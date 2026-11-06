import { APIError, createAuthMiddleware } from "better-auth/api";
import { consumeAttempt } from "../common/rate-counter.js";
import { prisma } from "../prisma/client.js";
import {
  EMAIL_ATTEMPT_RULES,
  emailAttemptKey,
  TOO_MANY_ATTEMPTS_MESSAGE,
} from "./attempt-limit.js";

/** Crochet « before » de Better Auth : 429 au-delà de la limite de l'adresse e-mail. */
export const emailRateLimit = createAuthMiddleware(async (ctx) => {
  const rule = EMAIL_ATTEMPT_RULES[ctx.path];
  const email: unknown = ctx.body?.email;
  if (!rule || typeof email !== "string" || email.trim() === "") {
    return;
  }
  const retryAfter = await consumeAttempt(
    prisma,
    emailAttemptKey(ctx.path, email),
    rule,
    Date.now(),
  );
  if (retryAfter !== null) {
    throw new APIError(
      "TOO_MANY_REQUESTS",
      { code: "TOO_MANY_REQUESTS", message: TOO_MANY_ATTEMPTS_MESSAGE },
      { "X-Retry-After": String(retryAfter) },
    );
  }
});
