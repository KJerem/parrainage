import {
  type CreateUpload,
  type Role,
  type UploadKind,
  uploadMimeTypes,
  type UploadPurpose,
} from "@parrainage/contracts";
import { AppError } from "../common/app-error.js";
import type { Env } from "../config/env.js";

export const TYPE_REJECTED_MESSAGE = "Type de fichier non autorisé";

export interface UploadLimits {
  maxBytes: Readonly<Record<UploadKind, number>>;
  videoMaxSeconds: number;
}

const MB = 1024 * 1024;

export function uploadLimitsFrom(
  env: Pick<
    Env,
    "UPLOAD_MAX_PHOTO_MB" | "UPLOAD_MAX_VIDEO_MB" | "UPLOAD_MAX_DOC_MB" | "VIDEO_MAX_SECONDS"
  >,
): UploadLimits {
  return {
    maxBytes: {
      PHOTO: Math.floor(env.UPLOAD_MAX_PHOTO_MB * MB),
      VIDEO: Math.floor(env.UPLOAD_MAX_VIDEO_MB * MB),
      DOCUMENT: Math.floor(env.UPLOAD_MAX_DOC_MB * MB),
    },
    videoMaxSeconds: env.VIDEO_MAX_SECONDS,
  };
}

/** Qui peut envoyer un fichier, selon son usage (le bureau écrira en phase ultérieure). */
const UPLOADERS: Readonly<Record<UploadPurpose, readonly Role[]>> = {
  message: ["parrain", "relais"],
  news: ["relais"],
  child: ["relais"],
  result: ["relais"],
};

const KIND_LABELS: Readonly<Record<UploadKind, string>> = {
  PHOTO: "une photo",
  VIDEO: "une vidéo",
  DOCUMENT: "un document",
};

/** « 10 Mo », « 2,5 Mo ». */
export function formatMegabytes(bytes: number): string {
  const value = Math.round((bytes / MB) * 10) / 10;
  return `${String(value).replace(".", ",")} Mo`;
}

export function tooLargeMessage(kind: UploadKind, maxBytes: number): string {
  return `Fichier trop volumineux : ${formatMegabytes(maxBytes)} maximum pour ${KIND_LABELS[kind]}`;
}

export function tooLongMessage(maxSeconds: number): string {
  const minutes = maxSeconds / 60;
  const limit = Number.isInteger(minutes)
    ? `${minutes} minute${minutes > 1 ? "s" : ""}`
    : `${maxSeconds} secondes`;
  return `Vidéo trop longue : ${limit} maximum`;
}

/** Contrôles de POST /api/uploads, avant tout appel au stockage. */
export function validateUploadRequest(input: CreateUpload, role: Role, limits: UploadLimits): void {
  if (!UPLOADERS[input.purpose].includes(role)) {
    throw new AppError(
      403,
      input.purpose === "message"
        ? "Vous ne pouvez pas joindre de fichier à un message"
        : "Vous ne pouvez pas envoyer ce fichier",
    );
  }
  validateUploadFile(input, limits);
}

/** Un enfant ne joint un fichier qu'à un message, avec les mêmes plafonds qu'un adulte. */
export function validateChildUploadRequest(input: CreateUpload, limits: UploadLimits): void {
  if (input.purpose !== "message") {
    throw new AppError(403, "Tu ne peux pas envoyer ce fichier");
  }
  validateUploadFile(input, limits);
}

function validateUploadFile(input: CreateUpload, limits: UploadLimits): void {
  if (!uploadMimeTypes[input.kind].includes(input.mimeType)) {
    throw new AppError(422, TYPE_REJECTED_MESSAGE, { mimeType: [TYPE_REJECTED_MESSAGE] });
  }
  const maxBytes = limits.maxBytes[input.kind];
  if (input.sizeBytes > maxBytes) {
    const message = tooLargeMessage(input.kind, maxBytes);
    throw new AppError(413, message, { sizeBytes: [message] });
  }
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

/** Clé de stockage déterministe : uploads/2026/11/{mediaId}.jpg (mois de l'envoi, en UTC). */
export function storageKeyFor(mediaId: string, mimeType: string, at: Date): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `uploads/${year}/${month}/${mediaId}.${EXTENSIONS[mimeType] ?? "bin"}`;
}

/** Légende neutre : le nom du fichier n'est jamais montré (il peut contenir nom ou numéro). */
export const DEFAULT_LABELS: Readonly<Record<UploadKind, string>> = {
  PHOTO: "Photo",
  VIDEO: "Vidéo",
  DOCUMENT: "Document",
};

/** Un envoi jamais terminé est purgé après ce délai. */
export const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

export function staleUploadCutoff(at: Date): Date {
  return new Date(at.getTime() - STALE_UPLOAD_MS);
}
