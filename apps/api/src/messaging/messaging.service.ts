import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type Contact,
  type ContactList,
  contactListSchema,
  type ConversationAccess,
  type ConversationDetail,
  conversationDetailSchema,
  type ConversationList,
  type ConversationListQuery,
  conversationListSchema,
  type ConversationMessage,
  conversationMessageSchema,
  type ConversationSummary,
  conversationSummarySchema,
  detectAlerts,
  ENCOURAGEMENT_TEXT,
  initials,
  type MessagePage,
  type MessagePageQuery,
  messagePageSchema,
  messagesPath,
  roleSchema,
  type SendEncouragement,
  type SendMessage,
  type StartConversation,
  type UnreadCount,
  unreadCountSchema,
  uploadKinds,
} from "@parrainage/contracts";
import type { AttemptRule } from "../auth/attempt-limit.js";
import type { Actor } from "../auth/actor.js";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import { consumeAttempt } from "../common/rate-counter.js";
import type { Env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { ConversationKind, MessageKind } from "../generated/prisma/enums.js";
import { newMessageEmail } from "../mail/templates.js";
import { sendMailInBackground } from "../mail/transport.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { decodeMessageCursor, encodeMessageCursor } from "./cursor.js";
import {
  accessFacts,
  BUREAU_NAME,
  conversationSelect,
  type ConversationRow,
  joinNames,
  type MessageRow,
  messageSelect,
  ofName,
  sponsorTitle,
  tone,
  toConversationMessage,
  toSummary,
} from "./present.js";
import {
  canEncourage,
  canWrite,
  conversationAccess,
  deliveredStatuses,
  isModerated,
  MODERATED_KINDS,
  nextMessageAt,
  notAuthoredBy,
  readUpTo,
  unreadWhere,
  visibleWhere,
} from "./visibility.js";

export const RATE_LIMITED_MESSAGE =
  "Vous avez envoyé beaucoup de messages en peu de temps. Réessayez dans quelques minutes.";
export const INVALID_ATTACHMENT_MESSAGE = "Pièce jointe introuvable ou déjà utilisée";

interface Accessible {
  row: ConversationRow;
  access: ConversationAccess;
}

interface NewMessage {
  kind: MessageKind;
  body: string;
  mediaIds: readonly string[];
  idempotencyKey: string | undefined;
}

const lastReadOf = (row: ConversationRow, userId: string) =>
  row.participants.find((p) => p.userId === userId)?.lastReadAt ?? null;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";

/** Comptes du bureau joignables (participants des conversations avec l'association). */
const activeBureauWhere = {
  role: "bureau",
  OR: [{ banned: null }, { banned: false }],
} satisfies Prisma.UserWhereInput;

/**
 * Messagerie des adultes (parrains et relais). Propriété vérifiée à chaque appel : une
 * conversation inaccessible répond 404, sans révéler son existence. Les messages destinés à un
 * enfant partent en relecture (PENDING) ; ceux entre adultes sont remis aussitôt.
 */
@Injectable()
export class MessagingService {
  private readonly rateRule: AttemptRule;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.rateRule = {
      max: config.get("MESSAGE_RATE_LIMIT_MAX", { infer: true }),
      window: config.get("MESSAGE_RATE_LIMIT_WINDOW_SECONDS", { infer: true }),
    };
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  // ─── Lecture ────────────────────────────────────────────────────────────────

  async list(actor: Actor, query: ConversationListQuery): Promise<ConversationList> {
    const conversations = await this.accessibleConversations(actor, query.kind, {
      hideEmpty: true,
    });
    const [previews, unread] = await Promise.all([
      this.lastMessages(actor, conversations),
      this.unreadCounts(actor, conversations),
    ]);
    return conversationListSchema.parse({
      items: conversations.map(({ row, access }) =>
        toSummary(actor, access, row, previews.get(row.id), unread.get(row.id) ?? 0),
      ),
      now: now().toISOString(),
    });
  }

  async unreadTotal(actor: Actor): Promise<UnreadCount> {
    const conversations = await this.accessibleConversations(actor, undefined, {
      participantOnly: true,
    });
    const unread = await this.unreadCounts(actor, conversations);
    const total = [...unread.values()].reduce((sum, count) => sum + count, 0);
    return unreadCountSchema.parse({ total });
  }

  async detail(actor: Actor, conversationId: string): Promise<ConversationDetail> {
    return conversationDetailSchema.parse(
      await this.summaryOf(actor, await this.requireConversation(actor, conversationId)),
    );
  }

  async messages(
    actor: Actor,
    conversationId: string,
    query: MessagePageQuery,
  ): Promise<MessagePage> {
    const cursor = query.cursor === undefined ? undefined : decodeMessageCursor(query.cursor);
    if (cursor === null) {
      throw new AppError(400, "Curseur de pagination invalide", {
        cursor: ["Curseur de pagination invalide"],
      });
    }
    const { access } = await this.requireConversation(actor, conversationId);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        AND: [
          visibleWhere(access, actor.userId),
          cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {},
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: messageSelect,
    });
    const page = rows.slice(0, query.limit);
    const oldest = page.at(-1);
    return messagePageSchema.parse({
      items: page.reverse().map((row) => toConversationMessage(actor, access, row)),
      nextCursor: rows.length > query.limit && oldest ? encodeMessageCursor(oldest) : null,
      now: now().toISOString(),
    });
  }

  /**
   * Lecture par un participant : `lastReadAt` avance (jamais ne recule) jusqu'au dernier message
   * visible, et les messages remis des autres passent en RECEIVED (« lu » pour leur auteur).
   * Le relais qui suit la conversation d'un enfant ne la marque pas comme lue.
   */
  async markRead(actor: Actor, conversationId: string): Promise<UnreadCount> {
    const { row, access } = await this.requireConversation(actor, conversationId);
    if (access === "participant") {
      const at = now();
      const { _max: latest } = await this.prisma.message.aggregate({
        where: { conversationId, ...visibleWhere(access, actor.userId) },
        _max: { createdAt: true, reviewedAt: true },
      });
      const upTo = readUpTo(at, [latest.createdAt, latest.reviewedAt]);
      const lastRead = lastReadOf(row, actor.userId);
      if (!lastRead || lastRead < upTo) {
        await this.prisma.$transaction([
          this.prisma.conversationParticipant.updateMany({
            where: { conversationId, userId: actor.userId },
            data: { lastReadAt: upTo },
          }),
          this.prisma.message.updateMany({
            where: this.receivableWhere(actor, row.kind, conversationId, upTo),
            data: { deliveryStatus: "RECEIVED", readAt: at },
          }),
        ]);
      }
    }
    return this.unreadTotal(actor);
  }

  // ─── Écriture ───────────────────────────────────────────────────────────────

  async send(
    actor: Actor,
    conversationId: string,
    input: SendMessage,
  ): Promise<{ message: ConversationMessage; replayed: boolean }> {
    const target = await this.requireConversation(actor, conversationId);
    if (!canWrite(actor, target.access, target.row.kind)) {
      throw new AppError(403, "Vous ne pouvez pas écrire dans cette conversation");
    }
    return this.createMessage(actor, target, {
      kind: "TEXT",
      body: input.body,
      mediaIds: input.mediaIds,
      idempotencyKey: input.idempotencyKey,
    });
  }

  /** Encouragement prédéfini d'un parrain à son filleul : approuvé automatiquement. */
  async encourage(
    actor: Actor,
    conversationId: string,
    input: SendEncouragement,
  ): Promise<{ message: ConversationMessage; replayed: boolean }> {
    const target = await this.requireConversation(actor, conversationId);
    if (!canEncourage(actor, target.access, target.row.kind)) {
      throw new AppError(403, "L'encouragement s'envoie à un filleul, depuis sa conversation");
    }
    return this.createMessage(actor, target, {
      kind: "ENCOURAGEMENT",
      body: ENCOURAGEMENT_TEXT,
      mediaIds: [],
      idempotencyKey: input.idempotencyKey,
    });
  }

  /** Ouvre une conversation avec le relais ou le bureau, ou retrouve celle qui existe. */
  async start(
    actor: Actor,
    input: StartConversation,
  ): Promise<{ conversation: ConversationSummary; created: boolean }> {
    const target = await this.resolveStart(actor, input);
    let conversationId = (
      await this.prisma.conversation.findFirst({
        where: target.where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      })
    )?.id;
    const created = conversationId === undefined;
    if (conversationId === undefined) {
      const at = now();
      conversationId = (
        await this.prisma.conversation.create({
          data: {
            ...target.data,
            lastMessageAt: at,
            createdAt: at,
            participants: { create: target.participantUserIds.map((userId) => ({ userId })) },
          },
          select: { id: true },
        })
      ).id;
    } else {
      // Participant ajouté s'il manque (nouveau compte du bureau…).
      await this.prisma.conversationParticipant.createMany({
        data: target.participantUserIds.map((userId) => ({
          conversationId: conversationId!,
          userId,
        })),
        skipDuplicates: true,
      });
    }
    const conversation = conversationSummarySchema.parse(
      await this.summaryOf(actor, await this.requireConversation(actor, conversationId)),
    );
    return { conversation, created };
  }

  /** Personnes à qui l'acteur peut écrire, avec la conversation déjà ouverte le cas échéant. */
  async contacts(actor: Actor): Promise<ContactList> {
    const items: Contact[] = [];
    if (actor.role === "parrain" && actor.parrainId) {
      const [sponsorships, existing] = await Promise.all([
        this.prisma.sponsorship.findMany({
          where: { parrainId: actor.parrainId, status: "ACTIVE" },
          orderBy: [{ startDate: "asc" }, { id: "asc" }],
          select: {
            child: {
              select: {
                firstName: true,
                relais: { select: { id: true, displayName: true } },
              },
            },
          },
        }),
        this.prisma.conversation.findMany({
          where: { parrainId: actor.parrainId, kind: { in: ["PARRAIN_RELAIS", "PARRAIN_BUREAU"] } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, kind: true, relaisId: true },
        }),
      ]);
      const relais = new Map<string, { displayName: string; children: string[] }>();
      for (const { child } of sponsorships) {
        const entry = relais.get(child.relais.id) ?? {
          displayName: child.relais.displayName,
          children: [],
        };
        entry.children.push(child.firstName);
        relais.set(child.relais.id, entry);
      }
      for (const [relaisId, entry] of relais) {
        items.push({
          kind: "PARRAIN_RELAIS",
          counterpartId: relaisId,
          name: entry.displayName,
          initials: initials(entry.displayName),
          avatarTone: "neutral",
          subtitle: `Relais ${ofName(joinNames([...new Set(entry.children)]))}`,
          conversationId:
            existing.find((c) => c.kind === "PARRAIN_RELAIS" && c.relaisId === relaisId)?.id ??
            null,
        });
      }
      items.push(
        this.bureauContact(
          "PARRAIN_BUREAU",
          existing.find((c) => c.kind === "PARRAIN_BUREAU"),
        ),
      );
    } else if (actor.role === "relais" && actor.relaisId) {
      const [sponsorships, existing] = await Promise.all([
        this.prisma.sponsorship.findMany({
          where: { status: "ACTIVE", child: { relaisId: actor.relaisId } },
          orderBy: [{ startDate: "asc" }, { id: "asc" }],
          select: {
            parrain: { select: { id: true, displayName: true, gender: true, avatarTone: true } },
            child: { select: { firstName: true } },
          },
        }),
        this.prisma.conversation.findMany({
          where: { relaisId: actor.relaisId, kind: { in: ["PARRAIN_RELAIS", "RELAIS_BUREAU"] } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, kind: true, parrainId: true },
        }),
      ]);
      const parrains = new Map<
        string,
        { parrain: (typeof sponsorships)[number]["parrain"]; children: string[] }
      >();
      for (const { parrain, child } of sponsorships) {
        const entry = parrains.get(parrain.id) ?? { parrain, children: [] };
        entry.children.push(child.firstName);
        parrains.set(parrain.id, entry);
      }
      const sorted = [...parrains.values()].sort((a, b) =>
        a.parrain.displayName.localeCompare(b.parrain.displayName, "fr"),
      );
      for (const { parrain, children } of sorted) {
        items.push({
          kind: "PARRAIN_RELAIS",
          counterpartId: parrain.id,
          name: parrain.displayName,
          initials: initials(parrain.displayName),
          avatarTone: tone(parrain.avatarTone, "info"),
          subtitle: sponsorTitle(parrain.gender, children),
          conversationId:
            existing.find((c) => c.kind === "PARRAIN_RELAIS" && c.parrainId === parrain.id)?.id ??
            null,
        });
      }
      items.push(
        this.bureauContact(
          "RELAIS_BUREAU",
          existing.find((c) => c.kind === "RELAIS_BUREAU"),
        ),
      );
    }
    return contactListSchema.parse({ items });
  }

  // ─── Interne ────────────────────────────────────────────────────────────────

  private bureauContact(
    kind: "PARRAIN_BUREAU" | "RELAIS_BUREAU",
    existing: { id: string } | undefined,
  ): Contact {
    return {
      kind,
      counterpartId: null,
      name: BUREAU_NAME,
      initials: "LRT",
      avatarTone: "dark",
      subtitle: null,
      conversationId: existing?.id ?? null,
    };
  }

  /**
   * Conversations accessibles, de la plus récente à la plus ancienne. `participantOnly` : sans
   * celles que le relais suit pour ses enfants (elles n'ont jamais de non-lus pour lui).
   */
  private async accessibleConversations(
    actor: Actor,
    kinds?: readonly ConversationKind[],
    { participantOnly = false, hideEmpty = false } = {},
  ): Promise<Accessible[]> {
    const scopes: Prisma.ConversationWhereInput[] = [];
    if (actor.role === "parrain" && actor.parrainId) {
      scopes.push({
        parrainId: actor.parrainId,
        participants: { some: { userId: actor.userId } },
      });
    }
    if (actor.role === "relais" && actor.relaisId) {
      scopes.push({
        relaisId: actor.relaisId,
        kind: { notIn: [...MODERATED_KINDS] },
        participants: { some: { userId: actor.userId } },
      });
      if (!participantOnly) {
        scopes.push({ kind: { in: [...MODERATED_KINDS] }, child: { relaisId: actor.relaisId } });
      }
    }
    if (scopes.length === 0) {
      return [];
    }
    const rows = await this.prisma.conversation.findMany({
      where: {
        OR: scopes,
        ...(kinds ? { kind: { in: [...kinds] } } : {}),
        // Une conversation d'adultes ouverte puis abandonnée n'apparaît chez personne. Celle d'un
        // binôme reste listée : c'est par elle qu'un nouveau parrain écrit à son filleul.
        ...(hideEmpty
          ? { AND: [{ OR: [{ kind: { in: [...MODERATED_KINDS] } }, { messages: { some: {} } }] }] }
          : {}),
      },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      select: conversationSelect(actor),
    });
    return rows.flatMap((row) => {
      const access = conversationAccess(actor, accessFacts(row));
      return access ? [{ row, access }] : [];
    });
  }

  private async requireConversation(actor: Actor, conversationId: string): Promise<Accessible> {
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: conversationSelect(actor),
    });
    const access = row ? conversationAccess(actor, accessFacts(row)) : null;
    if (!row || !access) {
      throw new NotFoundException();
    }
    return { row, access };
  }

  private async summaryOf(actor: Actor, { row, access }: Accessible) {
    const [previews, unread] = await Promise.all([
      this.lastMessages(actor, [{ row, access }]),
      this.unreadCounts(actor, [{ row, access }]),
    ]);
    return {
      ...toSummary(actor, access, row, previews.get(row.id), unread.get(row.id) ?? 0),
      moderated: isModerated(row.kind),
      canWrite: canWrite(actor, access, row.kind),
      canEncourage: canEncourage(actor, access, row.kind),
    };
  }

  /** Dernier message visible de chaque conversation (une requête indexée par conversation). */
  private async lastMessages(
    actor: Actor,
    conversations: readonly Accessible[],
  ): Promise<Map<string, MessageRow>> {
    const entries = await Promise.all(
      conversations.map(async ({ row, access }) => {
        const last = await this.prisma.message.findFirst({
          where: { conversationId: row.id, ...visibleWhere(access, actor.userId) },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: messageSelect,
        });
        return [row.id, last] as const;
      }),
    );
    return new Map(entries.flatMap(([id, last]) => (last ? [[id, last] as const] : [])));
  }

  /** Non-lus des conversations où l'acteur est participant, en une requête. */
  private async unreadCounts(
    actor: Actor,
    conversations: readonly Accessible[],
  ): Promise<Map<string, number>> {
    const participant = conversations.filter((c) => c.access === "participant");
    if (participant.length === 0) {
      return new Map();
    }
    const groups = await this.prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        OR: participant.map(({ row }) => ({
          conversationId: row.id,
          ...unreadWhere(actor.userId, row.kind, lastReadOf(row, actor.userId)),
        })),
      },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.conversationId, g._count._all]));
  }

  /** Messages remis des autres, pas encore lus, arrivés au plus tard à `upTo`. */
  private receivableWhere(
    actor: Actor,
    kind: ConversationKind,
    conversationId: string,
    upTo: Date,
  ): Prisma.MessageWhereInput {
    return {
      conversationId,
      AND: [
        notAuthoredBy(actor.userId),
        { moderationStatus: { in: deliveredStatuses(kind) } },
        { deliveryStatus: { not: "RECEIVED" } },
        { createdAt: { lte: upTo } },
      ],
    };
  }

  private async consumeRateLimit(actor: Actor): Promise<void> {
    const retryAfter = await consumeAttempt(
      this.prisma,
      `messages:${actor.userId}`,
      this.rateRule,
      Date.now(),
    );
    if (retryAfter !== null) {
      throw new AppError(429, RATE_LIMITED_MESSAGE);
    }
  }

  /** Message déjà créé avec cette clé : le même (rejeu), ou 409 s'il est ailleurs. */
  private async replay(
    actor: Actor,
    target: Accessible,
    key: string,
  ): Promise<ConversationMessage | null> {
    const existing = await this.prisma.message.findUnique({
      where: { idempotencyKey: key },
      select: { ...messageSelect, conversationId: true },
    });
    if (!existing) {
      return null;
    }
    if (existing.conversationId !== target.row.id) {
      throw new AppError(409, "Cette clé d'envoi a déjà servi pour un autre message");
    }
    return toConversationMessage(actor, target.access, existing);
  }

  /** Pièces jointes : envoyées par l'acteur, prêtes, jamais jointes ailleurs (sinon 422). */
  private async checkAttachments(actor: Actor, mediaIds: readonly string[]): Promise<void> {
    if (mediaIds.length === 0) {
      return;
    }
    const media = await this.prisma.media.findMany({
      where: { id: { in: [...mediaIds] } },
      select: {
        uploadedByUserId: true,
        status: true,
        kind: true,
        messageId: true,
        newsPostId: true,
        schoolResultId: true,
        avatarOf: { select: { id: true } },
        consentOf: { select: { id: true } },
      },
    });
    const usable = media.filter(
      (m) =>
        m.uploadedByUserId === actor.userId &&
        m.status === "READY" &&
        (uploadKinds as readonly string[]).includes(m.kind) &&
        m.messageId === null &&
        m.newsPostId === null &&
        m.schoolResultId === null &&
        m.avatarOf === null &&
        m.consentOf === null,
    );
    if (usable.length !== mediaIds.length) {
      throw new AppError(422, INVALID_ATTACHMENT_MESSAGE, {
        mediaIds: [INVALID_ATTACHMENT_MESSAGE],
      });
    }
  }

  private async createMessage(
    actor: Actor,
    target: Accessible,
    input: NewMessage,
  ): Promise<{ message: ConversationMessage; replayed: boolean }> {
    const key = input.idempotencyKey ? `${actor.userId}:${input.idempotencyKey}` : null;
    if (key) {
      const replayed = await this.replay(actor, target, key);
      if (replayed) {
        return { message: replayed, replayed: true };
      }
    }
    await this.consumeRateLimit(actor);
    await this.checkAttachments(actor, input.mediaIds);

    const { row } = target;
    const moderated = isModerated(row.kind);
    const encouragement = input.kind === "ENCOURAGEMENT";
    const detection = encouragement ? { types: [], spans: [] } : detectAlerts(input.body);
    const at = nextMessageAt(now(), row.lastMessageAt);
    let messageId: string;
    try {
      messageId = await this.prisma.$transaction(async (tx) => {
        const { id } = await tx.message.create({
          data: {
            conversationId: row.id,
            kind: input.kind,
            body: input.body,
            ...(encouragement
              ? {
                  moderationStatus: "APPROVED",
                  autoApproved: true,
                  reviewedAt: at,
                  deliveryStatus: "VERIFIED",
                }
              : moderated
                ? { moderationStatus: "PENDING", deliveryStatus: "SENT" }
                : { moderationStatus: "NOT_REQUIRED", deliveryStatus: "VERIFIED" }),
            autoAlerts: detection.spans as unknown as Prisma.InputJsonValue,
            alertTypes: detection.types,
            sentFrom: "WEB",
            idempotencyKey: key,
            authorUserId: actor.userId,
            createdAt: at,
          },
          select: { id: true },
        });
        if (input.mediaIds.length > 0) {
          const { count } = await tx.media.updateMany({
            where: {
              id: { in: [...input.mediaIds] },
              uploadedByUserId: actor.userId,
              status: "READY",
              messageId: null,
            },
            data: { messageId: id },
          });
          if (count !== input.mediaIds.length) {
            throw new AppError(422, INVALID_ATTACHMENT_MESSAGE, {
              mediaIds: [INVALID_ATTACHMENT_MESSAGE],
            });
          }
          for (const [position, mediaId] of input.mediaIds.entries()) {
            await tx.media.update({ where: { id: mediaId }, data: { position } });
          }
        }
        await tx.conversation.update({ where: { id: row.id }, data: { lastMessageAt: at } });
        // Écrire, c'est avoir lu la conversation jusque-là (comme POST /read).
        await tx.conversationParticipant.updateMany({
          where: {
            conversationId: row.id,
            userId: actor.userId,
            OR: [{ lastReadAt: null }, { lastReadAt: { lt: at } }],
          },
          data: { lastReadAt: at },
        });
        await tx.message.updateMany({
          where: this.receivableWhere(actor, row.kind, row.id, at),
          data: { deliveryStatus: "RECEIVED", readAt: at },
        });
        return id;
      });
    } catch (error) {
      // Deux envois simultanés avec la même clé : le second renvoie le premier.
      if (key && isUniqueViolation(error)) {
        const replayed = await this.replay(actor, target, key);
        if (replayed) {
          return { message: replayed, replayed: true };
        }
      }
      throw error;
    }

    const created = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      select: messageSelect,
    });
    if (!moderated) {
      await this.notifyRecipients(actor, row, at);
    }
    return {
      message: conversationMessageSchema.parse(
        toConversationMessage(actor, target.access, created),
      ),
      replayed: false,
    };
  }

  /**
   * E-mail « Nouveau message » (lien seulement) aux autres participants adultes. Un destinataire
   * qui a déjà des messages non lus dans cette conversation n'est pas prévenu une seconde fois.
   */
  private async notifyRecipients(actor: Actor, row: ConversationRow, at: Date): Promise<void> {
    const recipients = row.participants.filter(
      (p): p is typeof p & { userId: string } => p.userId !== null && p.userId !== actor.userId,
    );
    if (recipients.length === 0) {
      return;
    }
    const alreadyUnread = await Promise.all(
      recipients.map((p) =>
        this.prisma.message.count({
          where: {
            conversationId: row.id,
            AND: [unreadWhere(p.userId, row.kind, p.lastReadAt), { createdAt: { lt: at } }],
          },
        }),
      ),
    );
    const toNotify = recipients.filter((_, index) => alreadyUnread[index] === 0);
    if (toNotify.length === 0) {
      return;
    }
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: toNotify.map((p) => p.userId) },
        OR: [{ banned: null }, { banned: false }],
      },
      select: { email: true, role: true },
    });
    for (const user of users) {
      const role = roleSchema.safeParse(user.role);
      if (!role.success) {
        continue;
      }
      const url = new URL(messagesPath(role.data, row.id), this.appUrl).toString();
      sendMailInBackground({ to: user.email, ...newMessageEmail(url) });
    }
  }

  /** Conversation à retrouver ou à créer, selon le rôle et le type demandés. */
  private async resolveStart(
    actor: Actor,
    input: StartConversation,
  ): Promise<{
    where: Prisma.ConversationWhereInput;
    data: Pick<Prisma.ConversationUncheckedCreateInput, "kind" | "parrainId" | "relaisId">;
    participantUserIds: string[];
  }> {
    const bureauUserIds = async () => {
      const users = await this.prisma.user.findMany({
        where: activeBureauWhere,
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (users.length === 0) {
        throw new AppError(503, "Le bureau de l'association n'est pas joignable pour le moment");
      }
      return users.map((u) => u.id);
    };

    if (actor.role === "parrain" && actor.parrainId) {
      if (input.kind === "PARRAIN_BUREAU") {
        return {
          where: { kind: "PARRAIN_BUREAU", parrainId: actor.parrainId },
          data: { kind: "PARRAIN_BUREAU", parrainId: actor.parrainId },
          participantUserIds: [actor.userId, ...(await bureauUserIds())],
        };
      }
      if (input.kind === "PARRAIN_RELAIS") {
        const sponsorships = await this.prisma.sponsorship.findMany({
          where: { parrainId: actor.parrainId, status: "ACTIVE" },
          select: { child: { select: { relais: { select: { id: true, userId: true } } } } },
        });
        const relais = new Map(sponsorships.map((s) => [s.child.relais.id, s.child.relais]));
        const relaisId =
          input.counterpartId ?? (relais.size === 1 ? [...relais.keys()][0] : undefined);
        if (relaisId === undefined) {
          throw new AppError(422, "Choisissez le relais à qui écrire", {
            counterpartId: ["Choisissez le relais à qui écrire"],
          });
        }
        const chosen = relais.get(relaisId);
        if (!chosen) {
          throw new NotFoundException();
        }
        return {
          where: { kind: "PARRAIN_RELAIS", parrainId: actor.parrainId, relaisId: chosen.id },
          data: { kind: "PARRAIN_RELAIS", parrainId: actor.parrainId, relaisId: chosen.id },
          participantUserIds: [actor.userId, chosen.userId],
        };
      }
    }

    if (actor.role === "relais" && actor.relaisId) {
      if (input.kind === "RELAIS_BUREAU") {
        return {
          where: { kind: "RELAIS_BUREAU", relaisId: actor.relaisId },
          data: { kind: "RELAIS_BUREAU", relaisId: actor.relaisId },
          participantUserIds: [actor.userId, ...(await bureauUserIds())],
        };
      }
      if (input.kind === "PARRAIN_RELAIS") {
        if (!input.counterpartId) {
          throw new AppError(422, "Choisissez le parrain ou la marraine à qui écrire", {
            counterpartId: ["Choisissez le parrain ou la marraine à qui écrire"],
          });
        }
        // Seulement le parrain d'un binôme actif avec un enfant de ce relais.
        const parrain = await this.prisma.parrainProfile.findFirst({
          where: {
            id: input.counterpartId,
            sponsorships: { some: { status: "ACTIVE", child: { relaisId: actor.relaisId } } },
          },
          select: { id: true, userId: true },
        });
        if (!parrain) {
          throw new NotFoundException();
        }
        return {
          where: { kind: "PARRAIN_RELAIS", parrainId: parrain.id, relaisId: actor.relaisId },
          data: { kind: "PARRAIN_RELAIS", parrainId: parrain.id, relaisId: actor.relaisId },
          participantUserIds: [actor.userId, parrain.userId],
        };
      }
    }
    throw new AppError(403, "Vous ne pouvez pas ouvrir ce type de conversation");
  }
}
