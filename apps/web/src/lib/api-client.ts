import { apiErrorSchema } from "@parrainage/contracts";
import type { z } from "zod";

// Appels de l'API depuis le navigateur (même origine : /api/* est réécrit vers NestJS).

/** Erreur d'un appel : message en français, prêt à afficher. `status` 0 : réseau coupé. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>;

  constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export const NETWORK_ERROR_MESSAGE = "Connexion impossible. Vérifiez votre réseau puis réessayez.";

function fallbackMessage(status: number): string {
  if (status === 401) return "Votre session a expiré. Reconnectez-vous puis réessayez.";
  if (status === 403) return "Cette action ne vous est pas permise.";
  if (status === 404) return "Cette page n'existe plus ou ne vous est pas accessible.";
  if (status === 429) return "Trop de demandes en peu de temps. Réessayez dans quelques minutes.";
  return "Le service est momentanément indisponible. Réessayez dans un instant.";
}

export type ApiFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Corps JSON. */
  body?: unknown;
  signal?: AbortSignal;
};

/** Appel JSON de l'API, validé par son contrat ; toute réponse en erreur lève ApiRequestError. */
export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  { method = "GET", body, signal }: ApiFetchOptions = {},
): Promise<{ data: T; status: number }> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      signal,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiRequestError(0, NETWORK_ERROR_MESSAGE);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    const message =
      parsed.success && response.status < 500
        ? parsed.data.message
        : fallbackMessage(response.status);
    throw new ApiRequestError(
      response.status,
      message,
      parsed.success ? (parsed.data.fieldErrors ?? {}) : {},
    );
  }
  return { data: schema.parse(payload), status: response.status };
}

/** Clé d'idempotence d'un envoi (gardée d'un essai à l'autre pour ne rien doubler). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
