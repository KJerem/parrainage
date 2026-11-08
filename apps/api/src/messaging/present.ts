import {
  type AvatarTone,
  avatarToneSchema,
  type ConversationAccess,
  type ConversationMessage,
  type ConversationSummary,
  type Counterpart,
  initials,
  type MessageAuthor,
  type MessagePreview,
} from "@parrainage/contracts";
import type { Actor } from "../auth/actor.js";
import { callCardSelect, toCallCard } from "../calls/calls-common.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { Gender } from "../generated/prisma/enums.js";
import { listedMedia, toMediaRef } from "../media/media-ref.js";
import { messageStatus, presentedBody } from "./visibility.js";

// Projection des conversations et des messages vers les contrats, selon l'acteur qui les lit :
// jamais d'e-mail, d'adresse ni de téléphone, et le bureau reste « l'association » côté parrain.

export const BUREAU_NAME = "Bureau de l'association";
const BUREAU_INITIALS = "LRT";
const PREVIEW_LENGTH = 140;

/** Teinte enregistrée si elle fait partie de la palette, sinon `fallback`. */
export const tone = (value: string | null | undefined, fallback: AvatarTone): AvatarTone => {
  const parsed = avatarToneSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};

/** « Aïcha S. » */
export const childName = (child: { firstName: string; lastInitial: string }) =>
  `${child.firstName} ${child.lastInitial}.`;

/** « d'Aïcha », « d'Hélène », « de Kofi ». */
export function ofName(name: string): string {
  return /^[aeiouhàâäéèêëîïôöûü]/i.test(name) ? `d'${name}` : `de ${name}`;
}

/** « Aïcha », « Aïcha et Kofi », « Aïcha, Kofi et Yao ». */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
}

/** « Marraine d'Aïcha et Kofi », « Parrain de Yao » ; `null` sans filleul. */
export function sponsorTitle(gender: Gender, childFirstNames: readonly string[]): string | null {
  const unique = [...new Set(childFirstNames)];
  if (unique.length === 0) {
    return null;
  }
  return `${gender === "F" ? "Marraine" : "Parrain"} ${ofName(joinNames(unique))}`;
}

export const messageSelect = {
  id: true,
  kind: true,
  body: true,
  redactedBody: true,
  moderationStatus: true,
  deliveryStatus: true,
  moderationReason: true,
  sentFrom: true,
  createdAt: true,
  authorUserId: true,
  authorChildId: true,
  authorUser: {
    select: {
      name: true,
      role: true,
      parrainProfile: { select: { displayName: true, avatarTone: true } },
      relais: { select: { displayName: true } },
    },
  },
  authorChild: { select: { firstName: true, lastInitial: true, avatarTone: true } },
  media: listedMedia,
  callRequest: { select: callCardSelect },
} as const satisfies Prisma.MessageSelect;

export type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

/** Tout ce qu'il faut pour l'accès, l'interlocuteur et les non-lus (sauf l'aperçu). */
export function conversationSelect(actor: Actor) {
  return {
    id: true,
    kind: true,
    subject: true,
    childId: true,
    parrainId: true,
    relaisId: true,
    lastMessageAt: true,
    sponsorship: { select: { status: true } },
    child: {
      select: {
        id: true,
        firstName: true,
        lastInitial: true,
        avatarTone: true,
        relaisId: true,
        relais: { select: { displayName: true } },
      },
    },
    relais: { select: { id: true, displayName: true, city: true } },
    parrain: {
      select: {
        id: true,
        displayName: true,
        gender: true,
        avatarTone: true,
        // Pour le relais : les filleuls de ce parrain qu'il suit (« Marraine d'Aïcha et Kofi »).
        sponsorships: {
          where: { status: "ACTIVE", child: { relaisId: actor.relaisId ?? "" } },
          orderBy: [{ startDate: "asc" }, { id: "asc" }],
          take: actor.role === "relais" ? 10 : 0,
          select: { child: { select: { firstName: true } } },
        },
      },
    },
    participants: {
      select: { userId: true, lastReadAt: true, user: { select: { name: true, role: true } } },
    },
  } as const satisfies Prisma.ConversationSelect;
}

export type ConversationRow = Prisma.ConversationGetPayload<{
  select: ReturnType<typeof conversationSelect>;
}>;

export function accessFacts(row: ConversationRow) {
  return {
    kind: row.kind,
    parrainId: row.parrainId,
    relaisId: row.relaisId,
    participantUserIds: row.participants.flatMap((p) => (p.userId ? [p.userId] : [])),
    childRelaisId: row.child?.relaisId ?? null,
    sponsorshipActive: row.sponsorship?.status === "ACTIVE",
  };
}

const bureauCounterpart = (name: string): Counterpart => ({
  kind: "bureau",
  id: null,
  name,
  shortName: name,
  initials: BUREAU_INITIALS,
  avatarTone: "dark",
  subtitle: null,
});

/** L'interlocuteur vu par l'acteur. */
export function counterpartOf(actor: Actor, row: ConversationRow): Counterpart {
  const { child, relais, parrain } = row;
  if ((row.kind === "SPONSORSHIP" || row.kind === "CHILD_ASSOCIATION") && child) {
    const name = childName(child);
    let subtitle: string | null = null;
    if (actor.role === "parrain") {
      subtitle = `Écrit depuis l'école, avec son relais ${child.relais.displayName}`;
    } else if (row.kind === "CHILD_ASSOCIATION") {
      subtitle = "Avec l'association";
    } else if (parrain) {
      subtitle = `Avec ${parrain.gender === "F" ? "sa marraine" : "son parrain"} ${parrain.displayName}`;
    }
    return {
      kind: "child",
      id: child.id,
      name,
      shortName: child.firstName,
      initials: initials(name),
      avatarTone: tone(child.avatarTone, "amber"),
      subtitle,
    };
  }
  if (actor.role === "relais" && row.kind === "PARRAIN_RELAIS" && parrain) {
    return {
      kind: "parrain",
      id: parrain.id,
      name: parrain.displayName,
      shortName: parrain.displayName,
      initials: initials(parrain.displayName),
      avatarTone: tone(parrain.avatarTone, "info"),
      subtitle: sponsorTitle(
        parrain.gender,
        parrain.sponsorships.map((s) => s.child.firstName),
      ),
    };
  }
  if (actor.role === "parrain" && row.kind === "PARRAIN_RELAIS" && relais) {
    return {
      kind: "relais",
      id: relais.id,
      name: relais.displayName,
      shortName: relais.displayName,
      initials: initials(relais.displayName),
      avatarTone: "neutral",
      subtitle: `Relais à ${relais.city}`,
    };
  }
  if (actor.role === "relais") {
    // Le relais voit le nom du compte du bureau qui lui écrit (« Bureau · trésorerie »).
    const bureau = row.participants.find((p) => p.user?.role === "bureau")?.user?.name;
    return bureauCounterpart(bureau ?? BUREAU_NAME);
  }
  return bureauCounterpart(BUREAU_NAME);
}

/** Auteur d'un message, vu par l'acteur. */
export function authorOf(actor: Actor, row: MessageRow): MessageAuthor {
  if (row.authorChild) {
    const name = childName(row.authorChild);
    return {
      kind: "child",
      name,
      initials: initials(name),
      avatarTone: tone(row.authorChild.avatarTone, "amber"),
    };
  }
  const user = row.authorUser;
  if (user?.role === "parrain") {
    const name = user.parrainProfile?.displayName ?? user.name;
    return {
      kind: "parrain",
      name,
      initials: initials(name),
      avatarTone: tone(user.parrainProfile?.avatarTone, "info"),
    };
  }
  if (user?.role === "relais") {
    const name = user.relais?.displayName ?? user.name;
    return { kind: "relais", name, initials: initials(name), avatarTone: "neutral" };
  }
  const name = actor.role === "parrain" || !user ? BUREAU_NAME : user.name;
  return { kind: "bureau", name, initials: BUREAU_INITIALS, avatarTone: "dark" };
}

export function toConversationMessage(
  actor: Actor,
  access: ConversationAccess,
  row: MessageRow,
): ConversationMessage {
  const mine = row.authorUserId === actor.userId;
  const { body, masked } = presentedBody(access, mine, row);
  const reviewed = row.moderationStatus === "HELD" || row.moderationStatus === "MASKED";
  return {
    id: row.id,
    kind: row.kind,
    side: mine ? "me" : "them",
    author: authorOf(actor, row),
    body,
    masked,
    attachments: body === null ? [] : row.media.map(toMediaRef),
    sentFrom: row.sentFrom,
    createdAt: row.createdAt.toISOString(),
    status: mine || access === "supervisor" ? messageStatus(row) : null,
    moderationReason: mine && reviewed ? row.moderationReason : null,
    call: row.callRequest ? toCallCard(row.callRequest) : null,
  };
}

function truncate(text: string): string {
  const chars = [...text.replace(/\s+/g, " ").trim()];
  return chars.length <= PREVIEW_LENGTH
    ? chars.join("")
    : `${chars
        .slice(0, PREVIEW_LENGTH - 1)
        .join("")
        .trimEnd()}…`;
}

export function toPreview(
  actor: Actor,
  access: ConversationAccess,
  row: MessageRow,
): MessagePreview {
  const message = toConversationMessage(actor, access, row);
  return {
    body: message.body === null ? null : truncate(message.body),
    mine: message.side === "me",
    kind: message.kind,
    attachmentCount: message.attachments.length,
    createdAt: message.createdAt,
    status: message.status,
  };
}

export function toSummary(
  actor: Actor,
  access: ConversationAccess,
  row: ConversationRow,
  lastMessage: MessageRow | undefined,
  unreadCount: number,
): ConversationSummary {
  return {
    id: row.id,
    kind: row.kind,
    access,
    subject: row.subject,
    counterpart: counterpartOf(actor, row),
    childId: row.childId,
    lastMessage: lastMessage ? toPreview(actor, access, lastMessage) : null,
    lastMessageAt: row.lastMessageAt.toISOString(),
    unreadCount,
  };
}
