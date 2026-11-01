// Horloge de démonstration des tests (plan, section 10) : l'API démarre avec APP_NOW et le seed
// avec SEED_TODAY, calés sur le jour du design. Les écrans affichent alors les valeurs de la
// maquette (« Hier », « 12 octobre », « Versé en 2026 », « Octobre 2026 »…).

/** Instant figé de l'API de test (playwright.config.ts). */
export const E2E_APP_NOW = "2026-10-31T10:00:00Z";

/** Jour de référence du seed lancé par e2e/global-setup.ts. */
export const E2E_SEED_TODAY = E2E_APP_NOW.slice(0, 10);
