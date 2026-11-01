import "server-only";
import {
  bulletinListSchema,
  FEED_PAGE_DEFAULT_SIZE,
  feedPageSchema,
  feedQuerySchema,
  filleulDashboardSchema,
  filleulListSchema,
  type BulletinList,
  type FeedPage,
  type FilleulDashboard,
  type FilleulList,
  type FilleulSummary,
} from "@parrainage/contracts";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { z } from "zod";
import { api } from "./api.server";
import { FORBIDDEN_PATH, loginPath } from "./auth-paths";

/**
 * Taille d'une page de « Tout le fil » (1 à 50, 20 par défaut). Les tests E2E la réduisent
 * pour parcourir la pagination avec les quelques nouvelles du seed.
 */
export const feedPageSize: number = (() => {
  const parsed = feedQuerySchema.shape.limit.safeParse(process.env.FEED_PAGE_SIZE || undefined);
  return parsed.success ? parsed.data : FEED_PAGE_DEFAULT_SIZE;
})();

/**
 * GET de l'API parrain, validé par son contrat. Enfant hors des binômes du parrain : 404 de
 * l'API → page introuvable. Session expirée entre le layout et la page : retour à la connexion.
 */
async function getParrain<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await api(path);
  if (response.status === 404) {
    notFound();
  }
  if (response.status === 401) {
    redirect(loginPath("/parrain"));
  }
  if (response.status === 403) {
    redirect(FORBIDDEN_PATH);
  }
  if (!response.ok) {
    throw new Error(`GET ${path} a répondu ${response.status}`);
  }
  return schema.parse(await response.json());
}

const childPath = (childId: string) => `/api/parrain/filleuls/${encodeURIComponent(childId)}`;

/**
 * Filleuls des binômes actifs, du plus ancien au plus récent. Mémorisé pour la requête :
 * `generateMetadata` et la page partagent un seul appel.
 */
export const getFilleuls = cache((): Promise<FilleulList> =>
  getParrain("/api/parrain/filleuls", filleulListSchema),
);

/** Titre de la page introuvable de l'espace parrain (parrain/not-found.tsx). */
export const NOT_FOUND_TITLE = "Page introuvable";

/** Le filleul `childId` du parrain connecté, ou `undefined` s'il ne le parraine pas. */
export async function findFilleul(childId: string): Promise<FilleulSummary | undefined> {
  return (await getFilleuls()).find((filleul) => filleul.childId === childId);
}

/**
 * Titre d'une page `?filleul=` : le sien, ou celui de la page introuvable pour un enfant hors
 * des binômes. Le titre d'une page qui appelle `notFound()` resterait sinon le sien dans le
 * navigateur (métadonnées diffusées en streaming).
 */
export async function filleulPageTitle(
  requested: string | undefined,
  title: string,
): Promise<string> {
  return requested && !(await findFilleul(requested)) ? NOT_FOUND_TITLE : title;
}

export function getFilleulDashboard(childId: string): Promise<FilleulDashboard> {
  return getParrain(childPath(childId), filleulDashboardSchema);
}

export function getFeedPage(
  childId: string,
  query: { cursor?: string; limit?: number } = {},
): Promise<FeedPage> {
  const params = new URLSearchParams({ limit: String(query.limit ?? feedPageSize) });
  if (query.cursor) {
    params.set("cursor", query.cursor);
  }
  return getParrain(`${childPath(childId)}/nouvelles?${params}`, feedPageSchema);
}

export function getBulletins(childId: string): Promise<BulletinList> {
  return getParrain(`${childPath(childId)}/bulletins`, bulletinListSchema);
}

/**
 * Filleul affiché par une page `?filleul=` : celui demandé, sinon le premier de la liste.
 * Aucun binôme actif : `childId` vaut `null`. Un enfant absent de la liste : page introuvable.
 */
export async function resolveFilleul(
  requested: string | undefined,
): Promise<{ filleuls: FilleulList; childId: string | null }> {
  const filleuls = await getFilleuls();
  if (!requested) {
    return { filleuls, childId: filleuls[0]?.childId ?? null };
  }
  if (!filleuls.some((filleul) => filleul.childId === requested)) {
    notFound();
  }
  return { filleuls, childId: requested };
}
