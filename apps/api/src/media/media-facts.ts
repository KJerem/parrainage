import type { Prisma } from "../generated/prisma/client.js";
import type { MediaChildFacts, MediaFacts } from "./can-view-media.js";

const childFactsSelect = {
  relaisId: true,
  consentMedia: true,
  sponsorships: { where: { status: "ACTIVE" }, select: { parrainId: true } },
} as const satisfies Prisma.ChildSelect;

/** Tout ce que `canViewMedia` doit savoir, en une requête. */
export const mediaFactsSelect = {
  id: true,
  kind: true,
  status: true,
  storageKey: true,
  mimeType: true,
  label: true,
  uploadedByUserId: true,
  message: {
    select: {
      moderationStatus: true,
      conversation: {
        select: {
          kind: true,
          parrainId: true,
          relaisId: true,
          sponsorship: { select: { parrainId: true, status: true } },
          child: { select: { relaisId: true } },
        },
      },
    },
  },
  newsPost: {
    select: {
      status: true,
      relaisId: true,
      children: { select: { child: { select: childFactsSelect } } },
    },
  },
  schoolResult: { select: { status: true, child: { select: childFactsSelect } } },
  avatarOf: { select: childFactsSelect },
} as const satisfies Prisma.MediaSelect;

export type MediaFactsRow = Prisma.MediaGetPayload<{ select: typeof mediaFactsSelect }>;

type ChildFactsRow = Prisma.ChildGetPayload<{ select: typeof childFactsSelect }>;

function toChildFacts(child: ChildFactsRow): MediaChildFacts {
  return {
    relaisId: child.relaisId,
    consentMedia: child.consentMedia,
    activeParrainIds: child.sponsorships.map((s) => s.parrainId),
  };
}

export function toMediaFacts(row: MediaFactsRow): MediaFacts {
  const conversation = row.message?.conversation;
  const sponsorship = conversation?.sponsorship;
  return {
    status: row.status,
    hasStorage: row.storageKey !== null && row.storageKey !== "",
    uploadedByUserId: row.uploadedByUserId,
    message:
      row.message && conversation
        ? {
            moderationStatus: row.message.moderationStatus,
            conversationKind: conversation.kind,
            activeSponsorParrainId: sponsorship?.status === "ACTIVE" ? sponsorship.parrainId : null,
            parrainId: conversation.parrainId,
            relaisIds: [conversation.relaisId, conversation.child?.relaisId].filter(
              (id): id is string => typeof id === "string",
            ),
          }
        : null,
    newsPost: row.newsPost
      ? {
          status: row.newsPost.status,
          relaisId: row.newsPost.relaisId,
          children: row.newsPost.children.map((c) => toChildFacts(c.child)),
        }
      : null,
    schoolResult: row.schoolResult
      ? { status: row.schoolResult.status, child: toChildFacts(row.schoolResult.child) }
      : null,
    avatarOf: row.avatarOf ? toChildFacts(row.avatarOf) : null,
  };
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** Nom proposé au téléchargement : la légende du média, sans caractère interdit. */
export function downloadName(media: { label: string | null; mimeType: string }): string {
  const base =
    [...(media.label ?? "")]
      .map((c) => (c < " " || '\\/:*?"<>|'.includes(c) ? "-" : c))
      .join("")
      .trim() || "document";
  const extension = EXTENSIONS[media.mimeType.toLowerCase()];
  return extension ? `${base}.${extension}` : base;
}
