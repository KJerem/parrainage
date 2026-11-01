// Messages des formulaires d'authentification. Better Auth répond en anglais : on traduit
// d'après le code (et le statut HTTP), jamais d'après le texte.

export const authMessages = {
  invalidCredentials: "Adresse e-mail ou mot de passe incorrect.",
  tooManyAttempts: "Trop de tentatives. Réessayez dans quelques minutes.",
  network: "Connexion impossible. Vérifiez votre réseau.",
  banned: "Ce compte est suspendu. Contactez l'association.",
  invalidEmail: "Saisissez une adresse e-mail valide, par exemple nom@exemple.fr.",
  missingEmail: "Saisissez votre adresse e-mail.",
  missingPassword: "Saisissez votre mot de passe.",
  passwordTooShort: "Le mot de passe doit contenir au moins 8 caractères.",
  passwordTooLong: "Le mot de passe ne doit pas dépasser 128 caractères.",
  passwordMismatch: "Les deux mots de passe ne correspondent pas.",
  invalidResetLink:
    "Ce lien de réinitialisation n'est plus valable : il a expiré ou a déjà servi. Demandez-en un nouveau.",
  invalidMagicLink:
    "Ce lien de connexion n'est plus valable : il a expiré ou a déjà servi. Demandez-en un nouveau ci-dessous.",
  unavailable: "Le service est momentanément indisponible. Réessayez dans quelques instants.",
  unexpected: "Une erreur est survenue. Réessayez.",
} as const;

/** Longueurs acceptées par l'API (Better Auth, `minPasswordLength`). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Erreur renvoyée par le client Better Auth (`{ data, error }`). */
export type AuthClientError = { code?: string; status?: number; message?: string };

export function authErrorMessage(error: AuthClientError): string {
  const status = error.status ?? 0;
  if (status === 429 || error.code === "TOO_MANY_REQUESTS") {
    return authMessages.tooManyAttempts;
  }
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return authMessages.invalidCredentials;
    case "BANNED_USER":
      return authMessages.banned;
    case "INVALID_EMAIL":
      return authMessages.invalidEmail;
    case "INVALID_TOKEN":
      return authMessages.invalidResetLink;
    case "PASSWORD_TOO_SHORT":
      return authMessages.passwordTooShort;
    case "PASSWORD_TOO_LONG":
      return authMessages.passwordTooLong;
  }
  if (status === 401) {
    return authMessages.invalidCredentials;
  }
  if (status >= 500) {
    return authMessages.unavailable;
  }
  return authMessages.unexpected;
}

// Contrôle de forme seulement : l'API reste seule juge.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Message d'erreur du champ e-mail, ou `undefined` s'il est correct. */
export function emailError(value: string): string | undefined {
  const email = value.trim();
  if (email === "") {
    return authMessages.missingEmail;
  }
  return EMAIL.test(email) ? undefined : authMessages.invalidEmail;
}

/** Message d'erreur d'un nouveau mot de passe, ou `undefined` s'il est accepté. */
export function newPasswordError(value: string): string | undefined {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return authMessages.passwordTooShort;
  }
  return value.length > PASSWORD_MAX_LENGTH ? authMessages.passwordTooLong : undefined;
}
