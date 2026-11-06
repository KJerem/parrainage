import { randomUUID } from "node:crypto";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type CreateUpload,
  UPLOAD_PART_SIZE,
  UPLOAD_SINGLE_MAX_BYTES,
  type UploadedMedia,
  uploadedMediaSchema,
  type UploadParts,
  uploadPartCount,
  uploadPartsSchema,
  type UploadKind,
  uploadKinds,
  type UploadTicket,
  uploadTicketSchema,
} from "@parrainage/contracts";
import type { Actor } from "../auth/actor.js";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  PRESIGNED_PUT_TTL_SECONDS,
  type StoredPart,
  StorageService,
} from "../storage/storage.service.js";
import { detectMimeType, RejectedFileError, sanitize, type SanitizedFile } from "./sanitize.js";
import {
  DEFAULT_LABELS,
  storageKeyFor,
  TYPE_REJECTED_MESSAGE,
  tooLargeMessage,
  tooLongMessage,
  type UploadLimits,
  uploadLimitsFrom,
  validateUploadRequest,
} from "./upload-rules.js";

/** Envois en cours (non terminés) autorisés par utilisateur. */
const MAX_PENDING_UPLOADS = 20;

const uploadSelect = {
  id: true,
  kind: true,
  status: true,
  storageKey: true,
  uploadId: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  durationSec: true,
  label: true,
  uploadedByUserId: true,
} as const satisfies Prisma.MediaSelect;

type UploadRow = Prisma.MediaGetPayload<{ select: typeof uploadSelect }>;

/** Taille attendue d'une part : 5 Mo, sauf la dernière qui porte le reste. */
export function expectedPartSize(partNumber: number, sizeBytes: number): number {
  const count = uploadPartCount(sizeBytes);
  return partNumber < count ? UPLOAD_PART_SIZE : sizeBytes - UPLOAD_PART_SIZE * (count - 1);
}

/** Parts attendues d'un envoi multipart, reçues entières. */
export function checkParts(
  parts: readonly StoredPart[],
  sizeBytes: number,
): { complete: StoredPart[]; missing: number[] } {
  const count = uploadPartCount(sizeBytes);
  const complete: StoredPart[] = [];
  const missing: number[] = [];
  for (let partNumber = 1; partNumber <= count; partNumber += 1) {
    const part = parts.find((p) => p.partNumber === partNumber);
    if (part && part.sizeBytes === expectedPartSize(partNumber, sizeBytes)) {
      complete.push(part);
    } else {
      missing.push(partNumber);
    }
  }
  return { complete, missing };
}

/**
 * Envois de fichiers : le navigateur dépose le fichier dans le stockage avec des URL présignées
 * (PUT simple jusqu'à 5 Mo, multipart au-delà), puis `complete` vérifie le contenu réel (magic
 * bytes), retire les métadonnées et rend le média joignable à un message. Seul l'auteur de
 * l'envoi y a accès (404 pour les autres).
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly limits: UploadLimits;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.limits = uploadLimitsFrom({
      UPLOAD_MAX_PHOTO_MB: config.get("UPLOAD_MAX_PHOTO_MB", { infer: true }),
      UPLOAD_MAX_VIDEO_MB: config.get("UPLOAD_MAX_VIDEO_MB", { infer: true }),
      UPLOAD_MAX_DOC_MB: config.get("UPLOAD_MAX_DOC_MB", { infer: true }),
      VIDEO_MAX_SECONDS: config.get("VIDEO_MAX_SECONDS", { infer: true }),
    });
  }

  async create(actor: Actor, input: CreateUpload): Promise<UploadTicket> {
    validateUploadRequest(input, actor.role, this.limits);
    const pending = await this.prisma.media.count({
      where: { uploadedByUserId: actor.userId, status: "PENDING_UPLOAD" },
    });
    if (pending >= MAX_PENDING_UPLOADS) {
      throw new AppError(429, "Trop d'envois en cours. Terminez-les ou réessayez plus tard.");
    }
    const mediaId = randomUUID();
    const key = storageKeyFor(mediaId, input.mimeType, now());
    const multipart = input.sizeBytes > UPLOAD_SINGLE_MAX_BYTES;
    const uploadId = multipart
      ? await this.storage.createMultipartUpload(key, input.mimeType)
      : null;
    await this.prisma.media.create({
      data: {
        id: mediaId,
        kind: input.kind,
        status: "PENDING_UPLOAD",
        storageKey: key,
        uploadId,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        label: DEFAULT_LABELS[input.kind],
        uploadedByUserId: actor.userId,
        createdAt: now(),
      },
    });
    // Les signatures suivent l'heure réelle (celle que vérifie le stockage).
    const expiresAt = new Date(Date.now() + PRESIGNED_PUT_TTL_SECONDS * 1000).toISOString();
    if (!uploadId) {
      return uploadTicketSchema.parse({
        mode: "single",
        mediaId,
        url: await this.storage.presignPut(key, input.mimeType, input.sizeBytes),
        headers: { "Content-Type": input.mimeType },
        expiresAt,
      });
    }
    const partCount = uploadPartCount(input.sizeBytes);
    const partNumbers = Array.from({ length: partCount }, (_, index) => index + 1);
    return uploadTicketSchema.parse({
      mode: "multipart",
      mediaId,
      uploadId,
      partSize: UPLOAD_PART_SIZE,
      partCount,
      parts: await this.signParts(key, uploadId, partNumbers, input.sizeBytes),
      expiresAt,
    });
  }

  /** Reprise : parts déjà reçues, et de nouvelles URL pour les parts manquantes. */
  async parts(actor: Actor, mediaId: string): Promise<UploadParts> {
    const row = await this.ownUpload(actor, mediaId);
    if (row.status !== "PENDING_UPLOAD" || !row.storageKey || row.sizeBytes === null) {
      throw new AppError(409, "Cet envoi n'est plus en cours");
    }
    if (!row.uploadId) {
      throw new AppError(409, "Cet envoi se fait en une seule fois : relancez le dépôt du fichier");
    }
    const { complete, missing } = checkParts(
      await this.storage.listParts(row.storageKey, row.uploadId),
      row.sizeBytes,
    );
    return uploadPartsSchema.parse({
      mediaId: row.id,
      uploadId: row.uploadId,
      partSize: UPLOAD_PART_SIZE,
      partCount: uploadPartCount(row.sizeBytes),
      uploadedParts: complete.map((p) => ({ partNumber: p.partNumber, sizeBytes: p.sizeBytes })),
      parts: await this.signParts(row.storageKey, row.uploadId, missing, row.sizeBytes),
      expiresAt: new Date(Date.now() + PRESIGNED_PUT_TTL_SECONDS * 1000).toISOString(),
    });
  }

  /**
   * Fin de l'envoi : assemblage des parts, taille, magic bytes, nettoyage des métadonnées, puis
   * READY. Un fichier refusé est supprimé du stockage et le média passe en REJECTED.
   */
  async complete(actor: Actor, mediaId: string): Promise<UploadedMedia> {
    const row = await this.ownUpload(actor, mediaId);
    if (row.status === "READY") {
      return this.toUploaded(row);
    }
    const kind = row.kind as UploadKind;
    if (
      row.status !== "PENDING_UPLOAD" ||
      !row.storageKey ||
      row.sizeBytes === null ||
      !uploadKinds.includes(kind)
    ) {
      throw new AppError(409, "Cet envoi n'est plus disponible : recommencez avec le fichier");
    }
    const key = row.storageKey;
    if (row.uploadId) {
      const { complete, missing } = checkParts(
        await this.storage.listParts(key, row.uploadId),
        row.sizeBytes,
      );
      if (missing.length > 0) {
        throw new AppError(409, "Envoi incomplet : reprenez l'envoi des parties manquantes", {
          parts: missing.map(String),
        });
      }
      // Un seul assemblage : un second appel simultané (double envoi, nouvel essai du
      // navigateur) attend la fin du premier au lieu d'assembler, puis de refuser, le fichier.
      const { count: claimed } = await this.prisma.media.updateMany({
        where: { id: row.id, status: "PENDING_UPLOAD", uploadId: row.uploadId },
        data: { uploadId: null },
      });
      if (claimed === 0) {
        throw new AppError(409, "Ce fichier est déjà en cours de vérification : patientez");
      }
      try {
        await this.storage.completeMultipartUpload(key, row.uploadId, complete);
      } catch (error) {
        this.logger.warn(`Assemblage refusé (${row.id}) : ${String(error)}`);
        return this.reject(row, 422, "Fichier incomplet ou invalide");
      }
    }

    const maxBytes = this.limits.maxBytes[kind];
    const size = await this.storage.objectSize(key);
    if (size === null) {
      throw new AppError(409, "Le fichier n'a pas encore été reçu : relancez son envoi");
    }
    if (size > maxBytes) {
      return this.reject(row, 413, tooLargeMessage(kind, maxBytes));
    }
    const original = await this.storage.getObject(key);
    if ((await detectMimeType(original)) !== row.mimeType) {
      return this.reject(row, 422, TYPE_REJECTED_MESSAGE);
    }
    let clean: SanitizedFile;
    try {
      clean = await sanitize(original, row.mimeType);
    } catch (error) {
      if (error instanceof RejectedFileError) {
        this.logger.warn(`Fichier illisible (${row.id}) : ${error.message}`);
        return this.reject(row, 422, "Fichier illisible ou endommagé");
      }
      throw error;
    }
    if (kind === "VIDEO" && (clean.durationSec ?? 0) > this.limits.videoMaxSeconds) {
      return this.reject(row, 422, tooLongMessage(this.limits.videoMaxSeconds));
    }
    if (clean.body.length > maxBytes) {
      return this.reject(row, 413, tooLargeMessage(kind, maxBytes));
    }
    await this.storage.putObject(key, clean.body, row.mimeType);
    const { count } = await this.prisma.media.updateMany({
      where: { id: row.id, status: "PENDING_UPLOAD" },
      data: {
        status: "READY",
        uploadId: null,
        sizeBytes: clean.body.length,
        width: clean.width,
        height: clean.height,
        durationSec: clean.durationSec,
      },
    });
    const ready = await this.prisma.media.findUniqueOrThrow({
      where: { id: row.id },
      select: uploadSelect,
    });
    if (count === 0 && ready.status !== "READY") {
      throw new AppError(409, "Cet envoi n'est plus disponible : recommencez avec le fichier");
    }
    return this.toUploaded(ready);
  }

  private async ownUpload(actor: Actor, mediaId: string): Promise<UploadRow> {
    const row = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: uploadSelect,
    });
    // Média inconnu ou envoyé par un autre : même réponse.
    if (!row || row.uploadedByUserId !== actor.userId) {
      throw new NotFoundException();
    }
    return row;
  }

  private async signParts(
    key: string,
    uploadId: string,
    partNumbers: readonly number[],
    sizeBytes: number,
  ) {
    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignUploadPart(
          key,
          uploadId,
          partNumber,
          expectedPartSize(partNumber, sizeBytes),
        ),
      })),
    );
  }

  /** Refus définitif : fichier supprimé du stockage, média REJECTED, erreur en français. */
  private async reject(row: UploadRow, status: number, message: string): Promise<never> {
    if (row.storageKey) {
      try {
        if (row.uploadId) {
          await this.storage.abortMultipartUpload(row.storageKey, row.uploadId).catch(() => {});
        }
        await this.storage.deleteObject(row.storageKey);
      } catch (error) {
        this.logger.warn(`Suppression de ${row.id} impossible : ${String(error)}`);
      }
    }
    await this.prisma.media.update({
      where: { id: row.id },
      data: { status: "REJECTED", storageKey: null, uploadId: null },
    });
    throw new AppError(status, message);
  }

  private toUploaded(row: UploadRow): UploadedMedia {
    return uploadedMediaSchema.parse({
      id: row.id,
      kind: row.kind,
      status: row.status,
      label: row.label,
      durationSec: row.durationSec,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes ?? 0,
      width: row.width,
      height: row.height,
    });
  }
}
