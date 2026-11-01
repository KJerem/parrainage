import { createHash } from "node:crypto";

export interface AttemptRule {
  /** Durée de la fenêtre, en secondes. */
  window: number;
  max: number;
}

/**
 * Limites par adresse e-mail. Les compteurs par IP de Better Auth ne distinguent personne :
 * la réécriture /api/* du web n'ajoute pas X-Forwarded-For.
 */
export const EMAIL_ATTEMPT_RULES: Readonly<Record<string, AttemptRule>> = {
  "/sign-in/email": { window: 60, max: 5 },
  "/sign-in/magic-link": { window: 300, max: 3 },
  "/request-password-reset": { window: 300, max: 3 },
};

export const TOO_MANY_ATTEMPTS_MESSAGE = "Trop de tentatives. Réessayez dans quelques minutes.";

/** Clé du compteur : l'adresse est hachée, elle n'est jamais stockée en clair. */
export function emailAttemptKey(path: string, email: string): string {
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `email:${digest}|${path}`;
}

/**
 * Décision pour un compteur à jour (`windowStart` = début de la fenêtre, en ms) :
 * `null` si la tentative passe, sinon le délai d'attente en secondes.
 */
export function retryAfterSeconds(
  counter: { count: number; windowStart: number },
  rule: AttemptRule,
  now: number,
): number | null {
  if (counter.count <= rule.max) {
    return null;
  }
  return Math.max(1, Math.ceil((counter.windowStart + rule.window * 1000 - now) / 1000));
}
