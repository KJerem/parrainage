import "server-only";
import {
  moderationDetailSchema,
  moderationQueueSchema,
  moderationSummarySchema,
  roleHome,
  type ModerationFilter,
} from "@parrainage/contracts";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { z } from "zod";
import { api } from "./api.server";
import { FORBIDDEN_PATH, loginPath } from "./auth-paths";

/** GET de la modération, validé par son contrat. Message inconnu : page introuvable. */
async function getModeration<T>(path: string, schema: z.ZodType<T>): Promise<T> {
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

/** Indicateurs de la file : mémorisés pour la requête (pastille du layout et page). */
export const getModerationSummary = cache(() =>
  getModeration("/api/moderation/summary", moderationSummarySchema),
);

export function getModerationQueue(filter: ModerationFilter = "tous") {
  return getModeration(`/api/moderation/queue?filtre=${filter}`, moderationQueueSchema);
}

/** Message relu : mémorisé pour la requête (titre de l'onglet et page). */
export const getModerationDetail = cache((messageId: string) =>
  getModeration(
    `/api/moderation/messages/${encodeURIComponent(messageId)}`,
    moderationDetailSchema,
  ),
);
