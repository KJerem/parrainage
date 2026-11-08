import "server-only";
import {
  type ParrainCalls,
  parrainCallsSchema,
  type RelaisCalls,
  relaisCallsSchema,
  type VisioRoom,
  visioRoomSchema,
} from "@parrainage/contracts";
import { notFound, redirect } from "next/navigation";
import type { z } from "zod";
import { api } from "./api.server";
import { FORBIDDEN_PATH, loginPath } from "./auth-paths";

/** GET des appels, validé par son contrat. Appel ou enfant d'un autre : page introuvable. */
async function getCalls<T>(path: string, schema: z.ZodType<T>, home: string): Promise<T> {
  const response = await api(path);
  if (response.status === 404) {
    notFound();
  }
  if (response.status === 401) {
    redirect(loginPath(home));
  }
  if (response.status === 403) {
    redirect(FORBIDDEN_PATH);
  }
  if (!response.ok) {
    throw new Error(`GET ${path} a répondu ${response.status}`);
  }
  return schema.parse(await response.json());
}

export const getParrainCalls = (childId: string): Promise<ParrainCalls> =>
  getCalls(
    `/api/parrain/calls?filleul=${encodeURIComponent(childId)}`,
    parrainCallsSchema,
    "/parrain/appels",
  );

export const getRelaisCalls = (): Promise<RelaisCalls> =>
  getCalls("/api/relais/calls", relaisCallsSchema, "/relais/appels");

export const getVisioRoom = (callId: string, home: string): Promise<VisioRoom> =>
  getCalls(`/api/visio/${encodeURIComponent(callId)}`, visioRoomSchema, home);
