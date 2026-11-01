import { EMAIL_ATTEMPT_RULES, emailAttemptKey, retryAfterSeconds } from "./attempt-limit.js";

describe("limites de tentatives par adresse e-mail", () => {
  it("applique 5 connexions par minute et 3 envois de lien par 5 minutes", () => {
    expect(EMAIL_ATTEMPT_RULES["/sign-in/email"]).toEqual({ window: 60, max: 5 });
    expect(EMAIL_ATTEMPT_RULES["/sign-in/magic-link"]).toEqual({ window: 300, max: 3 });
    expect(EMAIL_ATTEMPT_RULES["/request-password-reset"]).toEqual({ window: 300, max: 3 });
  });

  it("hache l'adresse normalisée (casse et espaces ignorés)", () => {
    const key = emailAttemptKey("/sign-in/email", " Claire.M@Exemple.fr ");
    expect(key).toBe(emailAttemptKey("/sign-in/email", "claire.m@exemple.fr"));
    expect(key).toMatch(/^email:[0-9a-f]{64}\|\/sign-in\/email$/);
    expect(key).not.toContain("claire");
  });

  it("sépare les compteurs par chemin", () => {
    expect(emailAttemptKey("/sign-in/email", "a@b.fr")).not.toBe(
      emailAttemptKey("/sign-in/magic-link", "a@b.fr"),
    );
  });

  it("laisse passer jusqu'à la limite puis indique le délai restant", () => {
    const rule = { window: 60, max: 5 };
    const start = 1_000_000;
    expect(retryAfterSeconds({ count: 5, windowStart: start }, rule, start + 10_000)).toBeNull();
    expect(retryAfterSeconds({ count: 6, windowStart: start }, rule, start + 10_000)).toBe(50);
    expect(retryAfterSeconds({ count: 9, windowStart: start }, rule, start + 59_900)).toBe(1);
  });
});
