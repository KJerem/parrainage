import "server-only";
import {
  childCodeProposalSchema,
  relaisChildDetailSchema,
  relaisChildListSchema,
  relaisHomeSchema,
  relaisResultsSchema,
  roleHome,
  scheduledNewsListSchema,
  schoolListSchema,
} from "@parrainage/contracts";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { z } from "zod";
import { api } from "./api.server";
import { FORBIDDEN_PATH, loginPath } from "./auth-paths";

/** GET de l'espace relais, validé par son contrat. Enfant d'un autre relais : page introuvable. */
async function getRelais<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await api(path);
  if (response.status === 404) {
    notFound();
  }
  if (response.status === 401) {
    redirect(loginPath(roleHome.relais));
  }
  if (response.status === 403) {
    redirect(FORBIDDEN_PATH);
  }
  if (!response.ok) {
    throw new Error(`GET ${path} a répondu ${response.status}`);
  }
  return schema.parse(await response.json());
}

export const getRelaisHome = () => getRelais("/api/relais/home", relaisHomeSchema);

export const getRelaisChildren = () => getRelais("/api/relais/children", relaisChildListSchema);

/** Fiche d'un enfant : mémorisée pour la requête (titre de l'onglet et page). */
export const getRelaisChild = cache((id: string) =>
  getRelais(`/api/relais/children/${encodeURIComponent(id)}`, relaisChildDetailSchema),
);

export const getChildCodeProposal = () =>
  getRelais("/api/relais/child-code", childCodeProposalSchema);

export const getSchools = () => getRelais("/api/relais/schools", schoolListSchema);

export const getScheduledNews = () =>
  getRelais("/api/relais/news/scheduled", scheduledNewsListSchema);

export function getRelaisResults(query: { periode?: string; ecole?: string }) {
  const params = new URLSearchParams();
  if (query.periode) params.set("periode", query.periode);
  if (query.ecole) params.set("ecole", query.ecole);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return getRelais(`/api/relais/results${suffix}`, relaisResultsSchema);
}
