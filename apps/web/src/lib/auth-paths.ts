// Chemins de l'authentification, partagés par le proxy, les pages serveur et les formulaires.

export const LOGIN_PATH = "/connexion";
export const FORBIDDEN_PATH = "/interdit";

/** Espaces des comptes adultes : sans cookie de session, le proxy renvoie vers la connexion. */
/** Écran de connexion des enfants, et cookie posé par l'API à leur connexion (httpOnly). */
export const ELEVE_HOME = "/eleve";
export const CHILD_COOKIE = "kd_child";
export const DEVICE_COOKIE = "kd_device";

/** Pages d'un enfant connecté : tout l'espace, sauf l'écran de connexion. */
export function isChildPath(pathname: string): boolean {
  return pathname.startsWith(`${ELEVE_HOME}/`);
}

export const protectedSpaces = ["/parrain", "/relais", "/bureau"] as const;

export function isProtectedPath(pathname: string): boolean {
  return protectedSpaces.some((space) => pathname === space || pathname.startsWith(`${space}/`));
}

const BASE = "http://parrainage.invalid";
// Caractères de contrôle et barre oblique inverse : les navigateurs lisent « /\site » comme « //site ».
const UNSAFE = /[\u0000-\u001f\u007f\\]/;

function isSitePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !UNSAFE.test(value);
}

/** Routes de l'API (réécrites vers NestJS) : jamais une destination après connexion. */
function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Destination après connexion : uniquement une page du site (« /parrain?filleul=… »), jamais
 * « //autre-site » ni une adresse absolue (redirection ouverte). `null` si la valeur est refusée.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || !isSitePath(value)) {
    return null;
  }
  try {
    const url = new URL(value, BASE);
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Revérifié après normalisation : « /.//site » ou « /a/..//site » deviennent « //site ».
    return url.origin === BASE && isSitePath(path) && !isApiPath(url.pathname) ? path : null;
  } catch {
    return null;
  }
}

/** « /connexion?next=%2Fparrain » (ou « /connexion » si la destination est refusée). */
export function loginPath(next?: string | null): string {
  const target = safeNextPath(next);
  return target ? `${LOGIN_PATH}?${new URLSearchParams({ next: target })}` : LOGIN_PATH;
}

/** Première valeur d'un paramètre de recherche (`searchParams` d'une page). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
