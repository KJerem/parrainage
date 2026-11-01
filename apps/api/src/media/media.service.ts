import { Injectable, NotFoundException } from "@nestjs/common";
import type { Actor } from "../auth/actor.js";
import { now } from "../common/clock.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import { canViewMedia, isChildMedia } from "./can-view-media.js";
import { downloadName, mediaFactsSelect, toMediaFacts } from "./media-facts.js";

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * URL présignée (120 s) d'un média que l'acteur a le droit de voir. Média inconnu, interdit
   * ou sans fichier : la même erreur 404, pour ne rien révéler de son existence.
   */
  async signedUrl(actor: Actor, mediaId: string, options: { download: boolean }): Promise<string> {
    const row = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: mediaFactsSelect,
    });
    if (!row?.storageKey) {
      throw new NotFoundException();
    }
    const facts = toMediaFacts(row);
    if (!canViewMedia(actor, facts)) {
      throw new NotFoundException();
    }
    // Liste fermée de l'audit : consultation d'un média d'enfant par le bureau.
    if (actor.role === "bureau" && isChildMedia(facts)) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "media.view",
          entityType: "Media",
          entityId: row.id,
          metadata: { kind: row.kind },
          createdAt: now(),
        },
      });
    }
    return this.storage.presignGet(row.storageKey, {
      contentType: row.mimeType,
      ...(options.download ? { downloadName: downloadName(row) } : {}),
    });
  }
}
