import { Injectable, Logger } from "@nestjs/common";
import { uploadKinds } from "@parrainage/contracts";
import { now } from "../common/clock.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { isNotFound, StorageService } from "../storage/storage.service.js";
import { staleUploadCutoff } from "./upload-rules.js";

/**
 * Purge des fichiers sans usage après 24 h : envois jamais terminés (PENDING_UPLOAD) et fichiers
 * vérifiés mais jamais joints à un contenu (brouillon retiré, onglet fermé). Une photo d'enfant
 * ne doit pas rester dans le stockage sans raison. Appelée par le planificateur (phase ultérieure).
 */
@Injectable()
export class UploadsCleanupService {
  private readonly logger = new Logger(UploadsCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async purgeStale(at: Date = now(), batchSize = 100): Promise<number> {
    const stale = await this.prisma.media.findMany({
      where: {
        createdAt: { lt: staleUploadCutoff(at) },
        uploadedByUserId: { not: null },
        kind: { in: [...uploadKinds] },
        messageId: null,
        newsPostId: null,
        schoolResultId: null,
        avatarOf: { is: null },
        OR: [
          { status: "PENDING_UPLOAD" },
          { status: "READY" },
          // Réservé par une purge précédente dont le stockage était indisponible.
          { status: "REJECTED", storageKey: { not: null } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: batchSize,
      select: { id: true, status: true, storageKey: true, uploadId: true },
    });
    let purged = 0;
    for (const media of stale) {
      // Réservation : si le fichier vient d'être joint à un message, c'est le message qui gagne.
      const { count } = await this.prisma.media.updateMany({
        where: { id: media.id, status: media.status, messageId: null },
        data: { status: "REJECTED" },
      });
      if (count === 0) {
        continue;
      }
      if (!(await this.removeObject(media))) {
        // La ligne reste : sans elle, plus rien ne permettrait de retrouver l'objet.
        continue;
      }
      await this.prisma.media.delete({ where: { id: media.id } });
      purged += 1;
    }
    return purged;
  }

  private async removeObject(media: {
    id: string;
    storageKey: string | null;
    uploadId: string | null;
  }): Promise<boolean> {
    const { storageKey, uploadId } = media;
    if (!storageKey) {
      return true;
    }
    try {
      if (uploadId) {
        await this.ignoringAbsent(() => this.storage.abortMultipartUpload(storageKey, uploadId));
      }
      await this.ignoringAbsent(() => this.storage.deleteObject(storageKey));
      return true;
    } catch (error) {
      this.logger.warn(
        `Purge de ${media.id} reportée : ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private async ignoringAbsent(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }
}
