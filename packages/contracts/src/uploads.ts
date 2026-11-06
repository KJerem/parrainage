// Contrats des envois de fichiers (POST /api/uploads…) : le navigateur dépose le fichier
// directement dans le stockage S3 avec des URL présignées, puis l'API le vérifie et le nettoie.
import { z } from "zod";
import { mediaRefSchema } from "./media.js";

/** Types de médias qu'un adulte peut joindre à un message. */
export const uploadKinds = ["PHOTO", "VIDEO", "DOCUMENT"] as const;

export const uploadKindSchema = z.enum(uploadKinds);

export type UploadKind = z.infer<typeof uploadKindSchema>;

/** Types MIME acceptés, contrôlés aussi sur le contenu réel du fichier (magic bytes). */
export const uploadMimeTypes: Readonly<Record<UploadKind, readonly string[]>> = {
  PHOTO: ["image/jpeg", "image/png", "image/webp"],
  VIDEO: ["video/mp4", "video/webm"],
  DOCUMENT: ["application/pdf"],
};

/** Plafonds par défaut, en Mo (l'API lit UPLOAD_MAX_PHOTO_MB, UPLOAD_MAX_VIDEO_MB…). */
export const DEFAULT_UPLOAD_MAX_MB: Readonly<Record<UploadKind, number>> = {
  PHOTO: 10,
  VIDEO: 25,
  DOCUMENT: 10,
};

/** Durée maximale par défaut d'une vidéo d'adulte, en secondes (VIDEO_MAX_SECONDS). */
export const DEFAULT_VIDEO_MAX_SECONDS = 120;

/** Taille d'une part d'envoi multipart (minimum S3 : 5 Mo, sauf la dernière). */
export const UPLOAD_PART_SIZE = 5 * 1024 * 1024;

/** Jusqu'à cette taille, un seul PUT présigné ; au-delà, un envoi multipart reprenable. */
export const UPLOAD_SINGLE_MAX_BYTES = UPLOAD_PART_SIZE;

/** Le type d'envoi d'un type MIME accepté, sinon `null`. */
export function uploadKindOf(mimeType: string): UploadKind | null {
  const type = mimeType.trim().toLowerCase();
  return uploadKinds.find((kind) => uploadMimeTypes[kind].includes(type)) ?? null;
}

/** Nombre de parts d'un envoi multipart. */
export function uploadPartCount(sizeBytes: number): number {
  return Math.max(1, Math.ceil(sizeBytes / UPLOAD_PART_SIZE));
}

const id = z.string().min(1);

export const uploadPurposeSchema = z.enum(["message"]);

/** POST /api/uploads. Le nom du fichier n'est jamais conservé ni montré aux destinataires. */
export const createUploadSchema = z.object({
  purpose: uploadPurposeSchema,
  kind: uploadKindSchema,
  mimeType: z.string().trim().toLowerCase().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  fileName: z.string().trim().min(1).max(255),
});

export type CreateUpload = z.infer<typeof createUploadSchema>;

export const uploadPartUrlSchema = z.object({
  partNumber: z.number().int().min(1),
  /** PUT du contenu brut de la part, sans en-tête particulier. */
  url: z.url(),
});

export type UploadPartUrl = z.infer<typeof uploadPartUrlSchema>;

/**
 * Réponse de POST /api/uploads :
 * - `single` (jusqu'à 5 Mo) : PUT du fichier sur `url`, avec exactement les en-têtes `headers` ;
 * - `multipart` : PUT de chaque part de `partSize` octets (la dernière peut être plus courte)
 *   sur l'URL de son numéro. Aucune ETag à relire : l'API liste les parts reçues elle-même.
 * Les URL expirent à `expiresAt` ; GET /api/uploads/:id/parts en redonne pour les parts manquantes.
 */
export const uploadTicketSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("single"),
    mediaId: id,
    url: z.url(),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
  }),
  z.object({
    mode: z.literal("multipart"),
    mediaId: id,
    uploadId: id,
    partSize: z.number().int().positive(),
    partCount: z.number().int().positive(),
    parts: z.array(uploadPartUrlSchema),
    expiresAt: z.iso.datetime(),
  }),
]);

export type UploadTicket = z.infer<typeof uploadTicketSchema>;

/** GET /api/uploads/:id/parts : reprise d'un envoi multipart après une coupure. */
export const uploadPartsSchema = z.object({
  mediaId: id,
  uploadId: id,
  partSize: z.number().int().positive(),
  partCount: z.number().int().positive(),
  /** Parts déjà reçues par le stockage. */
  uploadedParts: z.array(
    z.object({ partNumber: z.number().int().min(1), sizeBytes: z.number().int().nonnegative() }),
  ),
  /** Nouvelles URL pour les parts manquantes seulement. */
  parts: z.array(uploadPartUrlSchema),
  expiresAt: z.iso.datetime(),
});

export type UploadParts = z.infer<typeof uploadPartsSchema>;

/** POST /api/uploads/:id/complete : le média vérifié, nettoyé et prêt à être joint. */
export const uploadedMediaSchema = mediaRefSchema.extend({
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

export type UploadedMedia = z.infer<typeof uploadedMediaSchema>;
