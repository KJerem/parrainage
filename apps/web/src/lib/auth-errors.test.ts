import { describe, expect, it } from "vitest";
import { authErrorMessage, authMessages, emailError, newPasswordError } from "./auth-errors";

describe("authErrorMessage", () => {
  it.each([
    [{ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }, authMessages.invalidCredentials],
    [{ status: 401 }, authMessages.invalidCredentials],
    [{ status: 429, code: "TOO_MANY_REQUESTS" }, authMessages.tooManyAttempts],
    // Limite globale de Better Auth : 429 sans code.
    [{ status: 429 }, authMessages.tooManyAttempts],
    [{ status: 403, code: "BANNED_USER" }, authMessages.banned],
    [{ status: 400, code: "INVALID_EMAIL" }, authMessages.invalidEmail],
    [{ status: 400, code: "INVALID_TOKEN" }, authMessages.invalidResetLink],
    [{ status: 400, code: "PASSWORD_TOO_SHORT" }, authMessages.passwordTooShort],
    [{ status: 400, code: "PASSWORD_TOO_LONG" }, authMessages.passwordTooLong],
    [{ status: 500 }, authMessages.unavailable],
    [{ status: 502 }, authMessages.unavailable],
    [{ status: 403, code: "MISSING_OR_NULL_ORIGIN" }, authMessages.unexpected],
    [{}, authMessages.unexpected],
  ])("%j → message en français", (error, expected) => {
    expect(authErrorMessage(error)).toBe(expected);
  });

  it("ne reprend jamais le texte anglais de l'API", () => {
    const message = authErrorMessage({ status: 400, message: "Something went wrong" });
    expect(message).not.toContain("Something");
  });
});

describe("emailError", () => {
  it("exige une adresse", () => {
    expect(emailError("")).toBe(authMessages.missingEmail);
    expect(emailError("   ")).toBe(authMessages.missingEmail);
  });

  it.each(["claire", "claire@", "claire@exemple", "cl aire@exemple.fr"])("refuse %s", (value) => {
    expect(emailError(value)).toBe(authMessages.invalidEmail);
  });

  it("accepte une adresse bien formée, espaces autour compris", () => {
    expect(emailError(" claire.m@exemple.fr ")).toBeUndefined();
  });
});

describe("newPasswordError", () => {
  it("impose 8 à 128 caractères", () => {
    expect(newPasswordError("court")).toBe(authMessages.passwordTooShort);
    expect(newPasswordError("12345678")).toBeUndefined();
    expect(newPasswordError("x".repeat(129))).toBe(authMessages.passwordTooLong);
  });
});
