import "server-only";
import {
  bureauChildSchema,
  bureauOverviewSchema,
  bureauParrainsSchema,
  type BureauSponsorshipsQuery,
  bureauSponsorshipsSchema,
  newSponsorshipSchema,
  parrainCandidatesSchema,
  roleHome,
} from "@parrainage/contracts";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { z } from "zod";
import { api } from "./api.server";
import { FORBIDDEN_PATH, loginPath } from "./auth-paths";

/** GET de l'espace bureau, validé par son contrat. Ressource inconnue : page introuvable. */
async function getBureau<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await api(path);
  if (response.status === 404) {
    notFound();
  }
  if (response.status === 401) {
    redirect(loginPath(roleHome.bureau));
  }
  if (response.status === 403) {
    redirect(FORBIDDEN_PATH);
  }
  if (!response.ok) {
    throw new Error(`GET ${path} a répondu ${response.status}`);
  }
  return schema.parse(await response.json());
}

const withQuery = (path: string, params: Record<string, string | undefined>) => {
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return query ? `${path}?${query}` : path;
};

export const getBureauOverview = () => getBureau("/api/bureau/overview", bureauOverviewSchema);

export const getBureauSponsorships = (query: BureauSponsorshipsQuery) =>
  getBureau(
    withQuery("/api/bureau/sponsorships", { relais: query.relais, etat: query.etat }),
    bureauSponsorshipsSchema,
  );

export const getNewSponsorship = (childId?: string) =>
  getBureau(withQuery("/api/bureau/sponsorships/new", { enfant: childId }), newSponsorshipSchema);

export const getParrainCandidates = (childId?: string) =>
  getBureau(
    withQuery("/api/bureau/parrains/candidates", { enfant: childId }),
    parrainCandidatesSchema,
  );

export const getBureauParrains = (q: string) =>
  getBureau(withQuery("/api/bureau/parrains", { q }), bureauParrainsSchema);

/** Dossier d'un enfant : mémorisé pour la requête (titre de l'onglet et page). */
export const getBureauChild = cache((id: string) =>
  getBureau(`/api/bureau/children/${encodeURIComponent(id)}`, bureauChildSchema),
);
