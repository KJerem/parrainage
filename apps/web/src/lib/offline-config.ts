// Réglages partagés par le service worker et les pages du relais.

/** Script du service worker, servi depuis `public/` (généré par `serwist build`). */
export const SERVICE_WORKER_URL = "/sw.js";

/**
 * Portée du service worker : sans barre finale, sinon la page `/relais` elle-même resterait hors
 * de sa portée (une portée se compare comme un préfixe d'URL).
 */
export const SERVICE_WORKER_SCOPE = "/relais";

/** Pages du relais ouvertes hors ligne ; toutes les autres restent réservées au réseau. */
export const OFFLINE_PAGES = ["/relais", "/relais/publier"] as const;

/** Page montrée hors ligne à la place de toute autre page du relais. */
export const OFFLINE_FALLBACK_PAGE = "/hors-ligne";

/** Cache des pages hors ligne : vidé à la déconnexion, et par chaque nouvelle version. */
export const OFFLINE_PAGES_CACHE = "relais-pages";

/** Message des pages au service worker : remets en cache les pages hors ligne. */
export const WARM_PAGES_MESSAGE = "relais:warm-pages";

/** Base IndexedDB de la file d'attente. */
export const OUTBOX_DB_NAME = "parrainage-outbox";
