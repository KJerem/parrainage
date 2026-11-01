import { z } from "zod";

export const mediaKinds = [
  "PHOTO",
  "VIDEO",
  "BULLETIN",
  "DOCUMENT",
  "CONSENT",
  "RECEIPT",
  "AVATAR",
] as const;

export const mediaKindSchema = z.enum(mediaKinds);

export type MediaKind = z.infer<typeof mediaKindSchema>;

/** PLACEHOLDER : média de démonstration sans fichier, affiché comme un emplacement réservé. */
export const mediaStatuses = ["PENDING_UPLOAD", "READY", "REJECTED", "PLACEHOLDER"] as const;

export const mediaStatusSchema = z.enum(mediaStatuses);

export type MediaStatus = z.infer<typeof mediaStatusSchema>;

/**
 * Référence à un média, sans URL : un média READY se lit via `mediaPath()` (GET /api/media/:id,
 * qui vérifie les droits puis redirige vers une URL présignée de 120 s).
 */
export const mediaRefSchema = z.object({
  id: z.string().min(1),
  kind: mediaKindSchema,
  status: mediaStatusSchema,
  /** Légende (« Photo de la classe », « Bulletin T1 — 2026-27 »). */
  label: z.string().nullable(),
  /** Durée d'une vidéo, en secondes. */
  durationSec: z.number().int().nonnegative().nullable(),
  mimeType: z.string(),
});

export type MediaRef = z.infer<typeof mediaRefSchema>;

/**
 * Chemin de lecture d'un média (même origine que le web), ou `null` s'il n'a pas de fichier
 * à servir (PLACEHOLDER, envoi en cours, refusé). `download` demande un téléchargement.
 */
export function mediaPath(
  ref: Pick<MediaRef, "id" | "status">,
  options: { download?: boolean } = {},
): string | null {
  if (ref.status !== "READY") {
    return null;
  }
  const path = `/api/media/${encodeURIComponent(ref.id)}`;
  return options.download ? `${path}?download=1` : path;
}
