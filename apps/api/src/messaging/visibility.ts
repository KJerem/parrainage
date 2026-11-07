import {
  type ConversationAccess,
  MASKED_PLACEHOLDER,
  type MessageStatus,
} from "@parrainage/contracts";
import type { Actor } from "../auth/actor.js";
import type { Prisma } from "../generated/prisma/client.js";
import type {
  ConversationKind,
  DeliveryStatus,
  ModerationStatus,
} from "../generated/prisma/enums.js";

// Règles de visibilité de la messagerie (plan §4.4 et §8), pures et testées.

/** Conversations avec un enfant : chaque message est relu par l'association avant d'être remis. */
export const MODERATED_KINDS: readonly ConversationKind[] = ["SPONSORSHIP", "CHILD_ASSOCIATION"];

export const isModerated = (kind: ConversationKind) => MODERATED_KINDS.includes(kind);

/** Statuts qui rendent un message visible par ses destinataires. */
export function deliveredStatuses(kind: ConversationKind): ModerationStatus[] {
  return isModerated(kind) ? ["APPROVED", "MASKED"] : ["NOT_REQUIRED", "APPROVED", "MASKED"];
}

/** Ce qu'il faut savoir d'une conversation pour décider de l'accès d'un adulte. */
export interface ConversationAccessFacts {
  kind: ConversationKind;
  parrainId: string | null;
  relaisId: string | null;
  /** Adultes participants (ConversationParticipant.userId). */
  participantUserIds: readonly string[];
  /** Relais de l'enfant concerné. */
  childRelaisId: string | null;
  /** Binôme de la conversation (SPONSORSHIP) toujours actif. */
  sponsorshipActive: boolean;
}

/**
 * Accès d'un adulte à une conversation, ou `null` (réponse 404) :
 * - parrain : participant d'une conversation à son nom ; pour celle d'un binôme, seulement tant
 *   que le binôme est actif (un co-parrain n'a jamais accès à celle de l'autre) ;
 * - relais : participant d'une conversation de son relais, ou « superviseur » des
 *   conversations de ses enfants (lecture seule, pas de participation) ;
 * - bureau : participant (lecture de ses conversations : phase ultérieure).
 */
export function conversationAccess(
  actor: Actor,
  facts: ConversationAccessFacts,
): ConversationAccess | null {
  const participant = facts.participantUserIds.includes(actor.userId);
  if (isModerated(facts.kind)) {
    const live = facts.kind !== "SPONSORSHIP" || facts.sponsorshipActive;
    if (actor.role === "parrain") {
      return participant && live && actor.parrainId !== null && facts.parrainId === actor.parrainId
        ? "participant"
        : null;
    }
    if (actor.role === "relais") {
      return live && actor.relaisId !== null && facts.childRelaisId === actor.relaisId
        ? "supervisor"
        : null;
    }
    return null;
  }
  if (!participant) {
    return null;
  }
  if (actor.role === "parrain") {
    return actor.parrainId !== null && facts.parrainId === actor.parrainId ? "participant" : null;
  }
  if (actor.role === "relais") {
    return actor.relaisId !== null && facts.relaisId === actor.relaisId ? "participant" : null;
  }
  return "participant";
}

/** Peut-il écrire ? Le relais ne fait que suivre les conversations de ses enfants. */
export function canWrite(
  actor: Actor,
  access: ConversationAccess,
  kind: ConversationKind,
): boolean {
  if (access !== "participant") {
    return false;
  }
  return isModerated(kind) ? actor.role === "parrain" && kind === "SPONSORSHIP" : true;
}

export function canEncourage(
  actor: Actor,
  access: ConversationAccess,
  kind: ConversationKind,
): boolean {
  return access === "participant" && actor.role === "parrain" && kind === "SPONSORSHIP";
}

export interface MessageFacts {
  authorUserId: string | null;
  moderationStatus: ModerationStatus;
}

/** Le message apparaît-il dans le fil de l'acteur ? */
export function isMessageVisible(
  access: ConversationAccess,
  actorUserId: string,
  kind: ConversationKind,
  message: MessageFacts,
): boolean {
  if (message.authorUserId === actorUserId || access === "supervisor") {
    return true;
  }
  return deliveredStatuses(kind).includes(message.moderationStatus);
}

/** Messages écrits par un autre que l'acteur (y compris par un enfant : auteur adulte NULL). */
export const notAuthoredBy = (userId: string): Prisma.MessageWhereInput => ({
  OR: [{ authorUserId: null }, { authorUserId: { not: userId } }],
});

/**
 * Filtre SQL de `isMessageVisible`, valable pour toute conversation dont l'acteur est
 * participant (le type est lu par jointure : utilisable dans un `include` de conversations).
 */
export function participantVisibleWhere(actorUserId: string): Prisma.MessageWhereInput {
  return {
    OR: [
      { authorUserId: actorUserId },
      { moderationStatus: { in: ["APPROVED", "MASKED"] } },
      {
        moderationStatus: "NOT_REQUIRED",
        conversation: { kind: { notIn: [...MODERATED_KINDS] } },
      },
    ],
  };
}

export function visibleWhere(
  access: ConversationAccess,
  actorUserId: string,
): Prisma.MessageWhereInput {
  return access === "supervisor" ? {} : participantVisibleWhere(actorUserId);
}

/**
 * Messages non lus d'un participant : des autres, remis, arrivés après sa dernière lecture.
 * Un message relu compte à partir de sa remise (`reviewedAt`) : écrit avant la dernière lecture
 * mais approuvé après, il est bien nouveau pour son destinataire.
 */
export function unreadWhere(
  actorUserId: string,
  kind: ConversationKind,
  lastReadAt: Date | null,
): Prisma.MessageWhereInput {
  return {
    AND: [
      notAuthoredBy(actorUserId),
      { moderationStatus: { in: deliveredStatuses(kind) } },
      ...(lastReadAt
        ? [{ OR: [{ createdAt: { gt: lastReadAt } }, { reviewedAt: { gt: lastReadAt } }] }]
        : []),
    ],
  };
}

/** Instant jusqu'où une lecture vaut : maintenant, ou la dernière arrivée si elle est après. */
export function readUpTo(at: Date, latest: readonly (Date | null)[]): Date {
  return latest.reduce<Date>((max, date) => (date && date > max ? date : max), at);
}

/** Suivi d'un message : en relecture, retenu, remis, puis lu (RECEIVED). */
export function messageStatus(message: {
  moderationStatus: ModerationStatus;
  deliveryStatus: DeliveryStatus;
}): MessageStatus {
  switch (message.moderationStatus) {
    case "PENDING":
      return "en_relecture";
    case "HELD":
      return "retenu";
    default:
      return message.deliveryStatus === "RECEIVED" ? "lu" : "remis";
  }
}

/**
 * Texte montré à l'acteur. Un message masqué n'est montré que dans sa version masquée (à son
 * auteur aussi : c'est ce qui a été remis). Un relais qui suit la conversation d'un enfant ne
 * lit pas un message en relecture ou retenu : il n'en voit que l'existence et le statut.
 */
export function presentedBody(
  access: ConversationAccess,
  mine: boolean,
  message: { moderationStatus: ModerationStatus; body: string; redactedBody: string | null },
): { body: string | null; masked: boolean } {
  if (message.moderationStatus === "MASKED") {
    return { body: message.redactedBody ?? MASKED_PLACEHOLDER, masked: true };
  }
  const reviewing = message.moderationStatus === "PENDING" || message.moderationStatus === "HELD";
  if (!mine && access === "supervisor" && reviewing) {
    return { body: null, masked: false };
  }
  return { body: message.body, masked: false };
}

/** Instant d'un nouveau message : jamais avant le dernier (horloge figée des tests, dérive). */
export function nextMessageAt(at: Date, lastMessageAt: Date | null): Date {
  if (lastMessageAt && lastMessageAt.getTime() >= at.getTime()) {
    return new Date(lastMessageAt.getTime() + 1);
  }
  return at;
}
