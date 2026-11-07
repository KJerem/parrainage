import type { Prisma } from "../generated/prisma/client.js";

/** Tout ce que `canChildViewMedia` doit savoir d'un média (l'enfant fixe le lien avec ses nouvelles). */
export function childMediaSelect(childId: string) {
  return {
    id: true,
    status: true,
    storageKey: true,
    mimeType: true,
    uploadedByChildId: true,
    message: {
      select: {
        moderationStatus: true,
        conversation: { select: { childId: true } },
      },
    },
    newsPost: {
      select: {
        status: true,
        type: true,
        relaisId: true,
        visibleToChildren: true,
        publishedAt: true,
        children: { where: { childId }, select: { childId: true } },
      },
    },
  } as const satisfies Prisma.MediaSelect;
}

export type ChildMediaRow = Prisma.MediaGetPayload<{
  select: ReturnType<typeof childMediaSelect>;
}>;

export interface MediaChild {
  childId: string;
  relaisId: string;
  consentMedia: boolean;
}

/**
 * Accès d'un enfant à un média (plan §4.4), pur et testé : ses propres envois, les fichiers remis
 * dans ses conversations (relus par l'association), et les nouvelles de son relais marquées
 * « visible par les enfants », s'il a le consentement médias.
 */
export function canChildViewMedia(child: MediaChild, media: ChildMediaRow, at: Date): boolean {
  if (!media.storageKey) {
    return false;
  }
  if (media.uploadedByChildId === child.childId) {
    return media.status === "READY" || media.status === "PENDING_UPLOAD";
  }
  if (media.status !== "READY") {
    return false;
  }
  const { message, newsPost } = media;
  if (
    message?.conversation.childId === child.childId &&
    (message.moderationStatus === "APPROVED" || message.moderationStatus === "MASKED")
  ) {
    return true;
  }
  return (
    newsPost !== null &&
    newsPost.status === "PUBLISHED" &&
    newsPost.visibleToChildren &&
    newsPost.publishedAt !== null &&
    newsPost.publishedAt <= at &&
    newsPost.relaisId === child.relaisId &&
    child.consentMedia &&
    (newsPost.type === "RELAIS_LIFE" || newsPost.children.length > 0)
  );
}
