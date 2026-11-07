import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  charterRuleForReason,
  detectAlerts,
  type ManualFlag,
  messagesPath,
  MODERATION_QUEUE_MAX_SIZE,
  type ModerationDecision,
  type ModerationDecisionResult,
  type ModerationDetail,
  type ModerationFilter,
  type ModerationFlag,
  type ModerationFlagResult,
  type ModerationQueue,
  type ModerationQueueItem,
  type ModerationReason,
  moderationReasonLabels,
  type ModerationSummary,
} from "@parrainage/contracts";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { ModerationStatus } from "../generated/prisma/enums.js";
import {
  messageHeldEmail,
  messageMaskedEmail,
  type ModerationNoticeAudience,
  newMessageEmail,
} from "../mail/templates.js";
import { sendMailInBackground } from "../mail/transport.js";
import { listedMedia, listedMediaWhere, toMediaRef } from "../media/media-ref.js";
import { BUREAU_NAME, childName } from "../messaging/present.js";
import { MODERATED_KINDS, unreadWhere } from "../messaging/visibility.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { isNotFound, StorageService } from "../storage/storage.service.js";

const NOT_FOUND_MESSAGE = "Ce message est introuvable";
const ALREADY_DECIDED_MESSAGE = "Ce message a déjà été traité par un autre membre du bureau";

const PENDING = { moderationStatus: "PENDING" } as const satisfies Prisma.MessageWhereInput;

/** Seuls les messages relus sont du ressort de la modération, pas les échanges entre adultes. */
const moderatedConversation = {
  conversation: { kind: { in: [...MODERATED_KINDS] } },
} satisfies Prisma.MessageWhereInput;

const queueOrder = [
  { createdAt: "asc" },
  { id: "asc" },
] as const satisfies Prisma.MessageOrderByWithRelationInput[];

const partiesSelect = {
  authorChild: { select: { firstName: true, lastInitial: true } },
  authorUser: {
    select: { name: true, parrainProfile: { select: { displayName: true } } },
  },
  conversation: {
    select: {
      kind: true,
      child: { select: { firstName: true, lastInitial: true } },
      parrain: { select: { displayName: true } },
    },
  },
} as const satisfies Prisma.MessageSelect;

type PartiesRow = Prisma.MessageGetPayload<{ select: typeof partiesSelect }>;

const queueSelect = {
  ...partiesSelect,
  id: true,
  body: true,
  alertTypes: true,
  manualFlags: true,
  createdAt: true,
  media: { ...listedMedia, select: { kind: true, label: true, durationSec: true } },
} as const satisfies Prisma.MessageSelect;

type QueueRow = Prisma.MessageGetPayload<{ select: typeof queueSelect }>;

const detailSelect = {
  ...partiesSelect,
  id: true,
  body: true,
  redactedBody: true,
  moderationStatus: true,
  moderationReason: true,
  reviewedAt: true,
  alertTypes: true,
  manualFlags: true,
  createdAt: true,
  conversationId: true,
  media: listedMedia,
  conversation: {
    select: {
      ...partiesSelect.conversation.select,
      childId: true,
      parrain: { select: { displayName: true, gender: true } },
      sponsorship: { select: { startDate: true } },
      child: {
        select: {
          firstName: true,
          lastInitial: true,
          relais: { select: { displayName: true } },
        },
      },
    },
  },
} as const satisfies Prisma.MessageSelect;

const decisionSelect = {
  id: true,
  body: true,
  moderationStatus: true,
  authorUserId: true,
  authorChildId: true,
  conversationId: true,
  media: { ...listedMedia, select: { id: true, storageKey: true } },
  conversation: {
    select: {
      kind: true,
      child: { select: { relais: { select: { userId: true } } } },
      participants: { select: { userId: true, lastReadAt: true } },
    },
  },
} as const satisfies Prisma.MessageSelect;

type DecisionRow = Prisma.MessageGetPayload<{ select: typeof decisionSelect }>;

/** Qui écrit à qui : « Paul D. → Kofi A. », « Aïcha S. → Claire M. ». */
function partiesOf(row: PartiesRow): Pick<ModerationQueueItem, "authorKind" | "from" | "to"> {
  const { conversation } = row;
  if (row.authorChild) {
    return {
      authorKind: "child",
      from: childName(row.authorChild),
      to: conversation.parrain?.displayName ?? BUREAU_NAME,
    };
  }
  return {
    authorKind: "parrain",
    from: row.authorUser?.parrainProfile?.displayName ?? row.authorUser?.name ?? "Parrain",
    to: conversation.child ? childName(conversation.child) : BUREAU_NAME,
  };
}

function queueWhere(filter: ModerationFilter): Prisma.MessageWhereInput {
  const base = { ...PENDING, ...moderatedConversation };
  switch (filter) {
    case "enfant":
      return { ...base, authorChildId: { not: null } };
    case "parrain":
      return { ...base, authorChildId: null };
    case "signales":
      return { ...base, manualFlags: { isEmpty: false } };
    case "tous":
      return base;
  }
}

const decidedStatus = {
  APPROVE: "APPROVED",
  MASK: "MASKED",
  HOLD: "HELD",
} as const satisfies Record<ModerationDecision["decision"], ModerationStatus>;

/** Libellé enregistré sur le message et montré à son auteur ; rien à dire pour « Autre ». */
const reasonLabel = (reason: ModerationReason): string | null =>
  reason === "OTHER" ? null : moderationReasonLabels[reason];

/**
 * Décisions du bureau sur les messages relus : atomiques (une seule s'applique si deux membres
 * décident en même temps), auditées, et notifiées par un lien seul, sans aucun contenu d'enfant.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  async summary(): Promise<ModerationSummary> {
    const where = { ...PENDING, ...moderatedConversation };
    const [pending, withMedia, oldest] = await Promise.all([
      this.prisma.message.count({ where }),
      this.prisma.message.count({ where: { ...where, media: { some: listedMediaWhere } } }),
      this.prisma.message.findFirst({
        where,
        orderBy: queueOrder,
        select: { createdAt: true },
      }),
    ]);
    return {
      pending,
      withMedia,
      oldestAt: oldest?.createdAt.toISOString() ?? null,
      now: now().toISOString(),
    };
  }

  /** Messages avec une alerte du détecteur d'abord, puis du plus ancien au plus récent. */
  async queue(filter: ModerationFilter): Promise<ModerationQueue> {
    const where = queueWhere(filter);
    const [total, alerted] = await Promise.all([
      this.prisma.message.count({ where }),
      this.prisma.message.findMany({
        where: { ...where, alertTypes: { isEmpty: false } },
        orderBy: queueOrder,
        take: MODERATION_QUEUE_MAX_SIZE,
        select: queueSelect,
      }),
    ]);
    const others = await this.prisma.message.findMany({
      where: { ...where, alertTypes: { isEmpty: true } },
      orderBy: queueOrder,
      take: MODERATION_QUEUE_MAX_SIZE - alerted.length,
      select: queueSelect,
    });
    return {
      items: [...alerted, ...others].map((row) => this.toQueueItem(row)),
      total,
      now: now().toISOString(),
    };
  }

  async detail(id: string): Promise<ModerationDetail> {
    const at = now();
    const row = await this.prisma.message.findFirst({
      where: { id, ...moderatedConversation },
      select: detailSelect,
    });
    if (!row) {
      throw new AppError(404, NOT_FOUND_MESSAGE);
    }
    const { conversation } = row;
    const held = { conversationId: row.conversationId, moderationStatus: "HELD" } as const;
    const [messageCount, heldCount, lastHeld, lastNews] = await Promise.all([
      this.prisma.message.count({ where: { conversationId: row.conversationId } }),
      this.prisma.message.count({ where: held }),
      this.prisma.message.findFirst({
        where: held,
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      conversation.childId
        ? this.prisma.newsPost.findFirst({
            where: {
              status: "PUBLISHED",
              publishedAt: { not: null, lte: at },
              children: { some: { childId: conversation.childId } },
            },
            orderBy: { publishedAt: "desc" },
            select: { publishedAt: true },
          })
        : null,
    ]);
    const { sponsorship, parrain } = conversation;
    return {
      ...partiesOf(row),
      id: row.id,
      moderationStatus: row.moderationStatus,
      body: row.body,
      redactedBody: row.redactedBody,
      // Recalculés plutôt que relus : un détecteur amélioré profite aux messages déjà en file.
      spans: detectAlerts(row.body).spans,
      alertTypes: row.alertTypes,
      manualFlags: row.manualFlags,
      attachments: row.media.map(toMediaRef),
      moderationReason: row.moderationReason,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      context: {
        sponsorSince:
          sponsorship && parrain
            ? `${parrain.gender === "F" ? "Marraine" : "Parrain"} depuis ${sponsorship.startDate.getUTCFullYear()}`
            : null,
        relaisName: conversation.child?.relais.displayName ?? null,
      },
      history: {
        messageCount,
        heldCount,
        lastHeldAt: lastHeld?.createdAt.toISOString() ?? null,
        lastNewsAt: lastNews?.publishedAt?.toISOString() ?? null,
      },
      now: at.toISOString(),
    };
  }

  async decide(
    reviewerId: string,
    id: string,
    input: ModerationDecision,
  ): Promise<ModerationDecisionResult> {
    const message = await this.prisma.message.findFirst({
      where: { id, ...moderatedConversation },
      select: decisionSelect,
    });
    if (!message) {
      throw new AppError(404, NOT_FOUND_MESSAGE);
    }
    if (message.moderationStatus !== "PENDING") {
      throw new AppError(409, ALREADY_DECIDED_MESSAGE);
    }
    const removed = input.decision === "MASK" ? this.checkMask(message, input) : [];
    const status = decidedStatus[input.decision];
    const reason = input.decision === "APPROVE" ? null : input.reason;
    const at = now();

    await this.prisma.$transaction(async (tx) => {
      // Le verrou de ligne fait attendre une décision concurrente, qui ne trouve alors plus rien.
      const { count } = await tx.message.updateMany({
        where: { id, ...PENDING },
        data: {
          moderationStatus: status,
          deliveryStatus: status === "HELD" ? "SENT" : "VERIFIED",
          reviewedById: reviewerId,
          reviewedAt: at,
          moderationReason: reason ? reasonLabel(reason) : null,
          redactedBody: input.decision === "MASK" ? input.redactedBody : null,
        },
      });
      if (count === 0) {
        throw new AppError(409, ALREADY_DECIDED_MESSAGE);
      }
      if (status !== "HELD") {
        // Remis maintenant : la conversation remonte chez son destinataire.
        await tx.conversation.updateMany({
          where: { id: message.conversationId, lastMessageAt: { lt: at } },
          data: { lastMessageAt: at },
        });
      }
      if (removed.length > 0) {
        await tx.media.updateMany({
          where: { id: { in: removed.map((m) => m.id) }, messageId: id },
          data: { status: "REJECTED", messageId: null },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: reviewerId,
          action: `moderation.${input.decision.toLowerCase()}`,
          entityType: "Message",
          entityId: id,
          metadata: {
            ...(reason ? { reason } : {}),
            ...(removed.length > 0 ? { removedMediaIds: removed.map((m) => m.id) } : {}),
          },
          createdAt: at,
        },
      });
    });

    await this.dropFiles(removed);
    await this.notify(message, status, reason);
    return { id, moderationStatus: status, nextId: await this.nextPendingId() };
  }

  async flag(reviewerId: string, id: string, input: ModerationFlag): Promise<ModerationFlagResult> {
    const message = await this.prisma.message.findFirst({
      where: { id, ...moderatedConversation },
      select: { moderationStatus: true, manualFlags: true },
    });
    if (!message) {
      throw new AppError(404, NOT_FOUND_MESSAGE);
    }
    if (message.moderationStatus !== "PENDING") {
      throw new AppError(409, ALREADY_DECIDED_MESSAGE);
    }
    const present = message.manualFlags.includes(input.flag);
    if (present === input.active) {
      return { id, manualFlags: message.manualFlags };
    }
    const manualFlags: ManualFlag[] = input.active
      ? [...message.manualFlags, input.flag]
      : message.manualFlags.filter((flag) => flag !== input.flag);
    const at = now();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.message.updateMany({
        where: { id, ...PENDING },
        data: { manualFlags },
      });
      if (count === 0) {
        throw new AppError(409, ALREADY_DECIDED_MESSAGE);
      }
      await tx.auditLog.create({
        data: {
          actorUserId: reviewerId,
          action: input.active ? "moderation.flag" : "moderation.unflag",
          entityType: "Message",
          entityId: id,
          metadata: { flag: input.flag },
          createdAt: at,
        },
      });
    });
    return { id, manualFlags };
  }

  private toQueueItem(row: QueueRow): ModerationQueueItem {
    return {
      ...partiesOf(row),
      id: row.id,
      hasText: row.body.trim() !== "",
      attachments: row.media,
      alertTypes: row.alertTypes,
      manualFlags: row.manualFlags,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Vérifie une version masquée et renvoie les pièces jointes qu'elle retire. */
  private checkMask(
    message: DecisionRow,
    input: Extract<ModerationDecision, { decision: "MASK" }>,
  ): DecisionRow["media"] {
    const removed = message.media.filter((media) => input.removedMediaIds.includes(media.id));
    if (removed.length !== new Set(input.removedMediaIds).size) {
      throw new AppError(422, "Une pièce jointe à retirer ne fait pas partie de ce message", {
        removedMediaIds: ["Pièce jointe inconnue"],
      });
    }
    if (input.redactedBody === message.body.trim() && removed.length === 0) {
      const issue =
        "Rien n'a été retiré : modifiez le texte, retirez une pièce jointe ou approuvez";
      throw new AppError(422, issue, { redactedBody: [issue] });
    }
    if (input.redactedBody === "" && removed.length === message.media.length) {
      const issue = "Il ne resterait rien à transmettre : retenez plutôt le message";
      throw new AppError(422, issue, { redactedBody: [issue] });
    }
    return removed;
  }

  /**
   * Retire les fichiers refusés du stockage. En cas d'échec, la clé reste sur le média : la purge
   * des fichiers sans usage réessaiera (UploadsCleanupService).
   */
  private async dropFiles(media: DecisionRow["media"]): Promise<void> {
    for (const { id, storageKey } of media) {
      if (!storageKey) {
        continue;
      }
      try {
        await this.storage.deleteObject(storageKey).catch((error: unknown) => {
          if (!isNotFound(error)) {
            throw error;
          }
        });
        await this.prisma.media.update({ where: { id }, data: { storageKey: null } });
      } catch (error) {
        this.logger.warn(
          `Fichier de ${id} à retirer plus tard : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Un message d'enfant remis prévient son parrain, sauf s'il a déjà des non-lus dans cette
   * conversation (comme l'envoi d'un message entre adultes). Un message retenu ou masqué prévient
   * son auteur, avec le motif ; pour un enfant, c'est son relais. Un enfant ne reçoit aucun e-mail.
   */
  private async notify(
    message: DecisionRow,
    status: (typeof decidedStatus)[keyof typeof decidedStatus],
    reason: ModerationReason | null,
  ): Promise<void> {
    const { conversation } = message;
    const authorIsChild = message.authorChildId !== null;
    const parrainPath = messagesPath("parrain", message.conversationId);

    // Conversation d'un binôme seulement : un message à l'association reste dans sa file.
    if (authorIsChild && status !== "HELD" && conversation.kind === "SPONSORSHIP") {
      const recipients = conversation.participants.filter(
        (p): p is typeof p & { userId: string } => p.userId !== null,
      );
      for (const participant of recipients) {
        const unread = await this.prisma.message.count({
          where: {
            conversationId: message.conversationId,
            id: { not: message.id },
            AND: [unreadWhere(participant.userId, conversation.kind, participant.lastReadAt)],
          },
        });
        if (unread === 0) {
          await this.mail(participant.userId, parrainPath, (url) => newMessageEmail(url));
        }
      }
    }

    if (status === "APPROVED" || !reason) {
      return;
    }
    const notice = status === "HELD" ? messageHeldEmail : messageMaskedEmail;
    const content = (audience: ModerationNoticeAudience) => (url: string) =>
      notice({
        url,
        audience,
        reason: reasonLabel(reason),
        rule: reason === "OTHER" ? null : charterRuleForReason(reason),
      });
    if (authorIsChild) {
      const relaisUserId = conversation.child?.relais.userId;
      if (relaisUserId) {
        // Page Messages, sans la conversation : son onglet « Enfants » arrive avec les sessions.
        await this.mail(relaisUserId, messagesPath("relais"), content("relais"));
      }
    } else if (message.authorUserId) {
      await this.mail(message.authorUserId, parrainPath, content("parrain"));
    }
  }

  private async mail(
    userId: string,
    path: string,
    build: (url: string) => ReturnType<typeof newMessageEmail>,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, OR: [{ banned: null }, { banned: false }] },
      select: { email: true },
    });
    if (!user) {
      return;
    }
    sendMailInBackground({ to: user.email, ...build(new URL(path, this.appUrl).toString()) });
  }

  private async nextPendingId(): Promise<string | null> {
    const where = { ...PENDING, ...moderatedConversation };
    const next =
      (await this.prisma.message.findFirst({
        where: { ...where, alertTypes: { isEmpty: false } },
        orderBy: queueOrder,
        select: { id: true },
      })) ??
      (await this.prisma.message.findFirst({
        where,
        orderBy: queueOrder,
        select: { id: true },
      }));
    return next?.id ?? null;
  }
}
