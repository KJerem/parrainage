import "server-only";
import { meSchema, type Me } from "@parrainage/contracts";
import { getSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import { cache } from "react";

/** Adresse interne de l'API NestJS : jamais exposée au navigateur. */
export const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Origine du web, seule origine de confiance pour l'API (exigée sur les POST /api/auth/*). */
export const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").origin;

/**
 * Appel de l'API depuis le serveur Next, au nom du visiteur : cookie de la requête entrante,
 * `Origin` du web, jamais de cache.
 */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const cookie = (await headers()).get("cookie");
  const requestHeaders = new Headers(init.headers);
  if (cookie) {
    requestHeaders.set("cookie", cookie);
  }
  requestHeaders.set("origin", appOrigin);
  return fetch(new URL(path, apiInternalUrl), {
    ...init,
    headers: requestHeaders,
    cache: "no-store",
  });
}

/**
 * Utilisateur connecté (GET /api/me), ou `null` sans session valide. Mémorisé pour la requête :
 * layout et page partagent un seul appel. Toute autre erreur de l'API remonte.
 */
export const getMe = cache(async (): Promise<Me | null> => {
  if (!getSessionCookie(await headers())) {
    return null;
  }
  const response = await api("/api/me");
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GET /api/me a répondu ${response.status}`);
  }
  return meSchema.parse(await response.json());
});
