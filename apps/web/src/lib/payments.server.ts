import "server-only";
import { type ParrainPayments, parrainPaymentsSchema } from "@parrainage/contracts";
import { redirect } from "next/navigation";
import { api } from "./api.server";
import { FORBIDDEN_PATH, loginPath } from "./auth-paths";

const HOME = "/parrain/versements";

/** « 2025 » → 2025 ; toute autre valeur : l'année en cours (pas de paramètre). */
export const yearParam = (value: string | undefined): number | undefined =>
  value && /^\d{4}$/.test(value) ? Number(value) : undefined;

/** P-Versements du parrain connecté, pour l'année d'historique demandée. */
export async function getParrainPayments(year?: number): Promise<ParrainPayments> {
  const path = `/api/parrain/payments${year === undefined ? "" : `?annee=${year}`}`;
  const response = await api(path);
  if (response.status === 401) {
    redirect(loginPath(HOME));
  }
  if (response.status === 403) {
    redirect(FORBIDDEN_PATH);
  }
  if (!response.ok) {
    throw new Error(`GET ${path} a répondu ${response.status}`);
  }
  return parrainPaymentsSchema.parse(await response.json());
}
