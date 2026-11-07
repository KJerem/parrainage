import "server-only";
import {
  type EleveHome,
  eleveHomeSchema,
  type EleveMessages,
  eleveMessagesSchema,
  type EleveSentSummary,
  eleveSentSummarySchema,
  type EleveSession,
  eleveSessionSchema,
} from "@parrainage/contracts";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { z } from "zod";
import { api } from "./api.server";
import { ELEVE_HOME } from "./auth-paths";

/**
 * GET de l'espace enfant, validé par son contrat. Session fermée, expirée ou suspendue : retour à
 * l'écran de connexion dès cette requête. Ce qui n'appartient pas à l'enfant : page introuvable.
 */
async function getEleve<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await api(path);
  if (response.status === 401) {
    redirect(ELEVE_HOME);
  }
  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    throw new Error(`GET ${path} a répondu ${response.status}`);
  }
  return schema.parse(await response.json());
}

/** La session ouverte sur ce poste, ou `null` s'il n'y en a pas. */
export async function getEleveSession(): Promise<EleveSession | null> {
  const response = await api("/api/eleve/session");
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GET /api/eleve/session a répondu ${response.status}`);
  }
  return eleveSessionSchema.parse(await response.json());
}

/** Un enfant est-il déjà connecté sur ce poste ? */
export async function isChildSignedIn(): Promise<boolean> {
  return (await api("/api/eleve/me")).ok;
}

export const getEleveHome = cache((): Promise<EleveHome> =>
  getEleve("/api/eleve/me", eleveHomeSchema),
);

export const getEleveMessages = (threadId: string): Promise<EleveMessages> =>
  getEleve(
    `/api/eleve/conversations/${encodeURIComponent(threadId)}/messages`,
    eleveMessagesSchema,
  );

export const getEleveSent = (messageId: string): Promise<EleveSentSummary> =>
  getEleve(`/api/eleve/messages/${encodeURIComponent(messageId)}`, eleveSentSummarySchema);
