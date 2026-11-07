import type { Logger } from "@nestjs/common";
import { uploadKinds } from "@parrainage/contracts";
import type { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { isNotFound, type StorageService } from "../storage/storage.service.js";

/** Message d'erreur quand un fichier n'est pas joignable (déjà utilisé, ou d'un autre compte). */
export const INVALID_MEDIA_MESSAGE =
  "Un fichier n'a pas pu être joint : envoyez-le de nouveau, puis réessayez";

/**
 * Médias joignables par cet utilisateur : envoyés par lui, vérifiés, et attachés à rien. Un fichier
 * ne sert qu'une fois : ses règles d'accès découlent du contenu auquel il est joint.
 */
export function attachableMediaWhere(
  userId: string,
  ids: readonly string[],
): Prisma.MediaWhereInput {
  return {
    id: { in: [...ids] },
    uploadedByUserId: userId,
    status: "READY",
    kind: { in: [...uploadKinds] },
    messageId: null,
    newsPostId: null,
    schoolResultId: null,
    avatarOf: { is: null },
    consentOf: { is: null },
  };
}

/**
 * Retire du stockage des fichiers déjà refusés et détachés. En cas d'échec, la clé reste sur le
 * média : la purge des fichiers sans usage réessaiera (UploadsCleanupService).
 */
export async function removeStoredFiles(
  prisma: PrismaService,
  storage: StorageService,
  logger: Logger,
  media: readonly { id: string; storageKey: string | null }[],
): Promise<void> {
  for (const { id, storageKey } of media) {
    if (!storageKey) {
      continue;
    }
    try {
      await storage.deleteObject(storageKey).catch((error: unknown) => {
        if (!isNotFound(error)) {
          throw error;
        }
      });
      await prisma.media.update({ where: { id }, data: { storageKey: null } });
    } catch (error) {
      logger.warn(
        `Fichier de ${id} à retirer plus tard : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
