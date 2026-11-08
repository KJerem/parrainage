import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type ClassSessionRights,
  type CreateUpload,
  detectAlerts,
  ELEVE_ASSOCIATION_THREAD,
  ELEVE_THREAD_LENGTH,
  type EleveHome,
  eleveHomeSchema,
  type EleveLogin,
  type EleveLoginResult,
  type EleveMessage,
  type EleveMessages,
  eleveMessagesSchema,
  type EleveMessageStatus,
  type EleveNews,
  type EleveSendMessage,
  type EleveSentContent,
  type EleveSentMessage,
  type EleveSentSummary,
  eleveSentSummarySchema,
  type EleveSession,
  eleveSessionSchema,
  type EleveThread,
  initials,
  MASKED_PLACEHOLDER,
  type UploadedMedia,
  type UploadParts,
  type UploadTicket,
  uploadKinds,
} from "@parrainage/contracts";
import type { Response } from "express";
import type { AttemptRule } from "../auth/attempt-limit.js";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import { consumeAttempt } from "../common/rate-counter.js";
import type { Env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { ModerationStatus } from "../generated/prisma/enums.js";
import { listedMedia, toMediaRef } from "../media/media-ref.js";
import { childName, tone } from "../messaging/present.js";
import { nextMessageAt } from "../messaging/visibility.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { verifyChildCode } from "../relais/child-code.js";
import { StorageService } from "../storage/storage.service.js";
import { UploadsService } from "../uploads/uploads.service.js";
import { canChildViewMedia, childMediaSelect } from "./child-media.js";
import { canUploadKind, childRights, shuffledImages } from "./child-session.js";
import {
  type ChildContext,
  ChildSessionService,
  type DeviceContext,
} from "./child-session.service.js";

const THREAD_NOT_FOUND = "Cette conversation n'est pas la tienne";
const RATE_LIMITED = "Tu as envoyé beaucoup de messages. Attends un peu avant de réécrire.";
const RIGHT_REFUSED = "Cette session ne permet pas de faire cela. Demande à ton relais.";
const INVALID_MEDIA = "Un fichier n'a pas pu être ajouté. Envoie-le de nouveau.";

/** Conversation avec l'association, créée au premier message : une seule par enfant. */
const associationConversationId = (childId: string) => `child-assoc-${childId}`;

const ASSOCIATION_NAME = "L'association";

/** « en France », « au Canada » : le nom du pays, tel qu'il est saisi au profil du parrain. */
function inCountry(country: string): string {
  return /e$/i.test(country) ? `en ${country}` : `au ${country}`;
}

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";

const threadMessageSelect = {
  id: true,
  body: true,
  redactedBody: true,
  moderationStatus: true,
  deliveryStatus: true,
  createdAt: true,
  reviewedAt: true,
  readAt: true,
  authorChildId: true,
  authorUser: {
    select: {
      name: true,
      parrainProfile: { select: { firstName: true } },
      relais: { select: { displayName: true } },
    },
  },
  media: listedMedia,
} as const satisfies Prisma.MessageSelect;

type ThreadMessageRow = Prisma.MessageGetPayload<{ select: typeof threadMessageSelect }>;

function statusOf(row: {
  moderationStatus: ModerationStatus;
  deliveryStatus: string;
}): EleveMessageStatus {
  if (row.moderationStatus === "PENDING") {
    return "relecture";
  }
  if (row.moderationStatus === "HELD") {
    return "garde";
  }
  return row.deliveryStatus === "RECEIVED" ? "lu" : "recu";
}

/** Fil d'un enfant : son parrain, ou l'association. */
interface Thread {
  kind: EleveThread["kind"];
  conversationId: string;
  exists: boolean;
  /** Dernier message du fil, pour garder les dates dans l'ordre. */
  name: string;
}

/**
 * Espace enfant. Tout est borné à l'enfant connecté : une conversation ou un fichier qui n'est pas
 * le sien répond 404. Ses messages partent en relecture et ne font remonter la conversation chez
 * son parrain qu'une fois approuvés.
 */
@Injectable()
export class EleveService {
  private readonly pepper: string;
  private readonly maxAttempts: number;
  private readonly maxSessionFailures: number;
  private readonly rateRule: AttemptRule;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly uploads: UploadsService,
    private readonly sessions: ChildSessionService,
    config: ConfigService<Env, true>,
  ) {
    this.pepper = config.get("CHILD_CODE_PEPPER", { infer: true });
    this.maxAttempts = config.get("CHILD_CODE_MAX_ATTEMPTS", { infer: true });
    this.maxSessionFailures = config.get("CHILD_SESSION_MAX_FAILURES", { infer: true });
    this.rateRule = {
      max: config.get("MESSAGE_RATE_LIMIT_MAX", { infer: true }),
      window: config.get("MESSAGE_RATE_LIMIT_WINDOW_SECONDS", { infer: true }),
    };
  }

  // ─── Connexion ──────────────────────────────────────────────────────────────

  async session(device: DeviceContext): Promise<EleveSession> {
    if (device.suspended) {
      return eleveSessionSchema.parse({ state: "suspended", relaisName: device.relaisName });
    }
    const links = await this.prisma.classSessionChild.findMany({
      where: { sessionId: device.sessionId },
      select: {
        child: {
          select: {
            id: true,
            firstName: true,
            lastInitial: true,
            avatarTone: true,
            consentMedia: true,
            photo: { select: { status: true, storageKey: true } },
          },
        },
      },
    });
    const children = links
      .map(({ child }) => ({
        id: child.id,
        firstName: child.firstName,
        initials: initials(childName(child)),
        avatarTone: tone(child.avatarTone, "amber"),
        hasPhoto:
          child.consentMedia && child.photo?.status === "READY" && Boolean(child.photo.storageKey),
      }))
      .sort((a, b) => a.firstName.localeCompare(b.firstName, "fr"));
    return eleveSessionSchema.parse({
      state: "open",
      relaisName: device.relaisName,
      endsAt: device.endsAt.toISOString(),
      now: now().toISOString(),
      children,
      images: shuffledImages(),
    });
  }

  /**
   * Connexion d'un enfant. Le compteur d'échecs est en base : chaque essai réserve sa place d'un
   * seul UPDATE atomique avant Argon2, si bien que des requêtes parallèles ne peuvent pas tester
   * plus de codes que le plafond. Une réussite remet le compteur à zéro. Jamais de compteur par IP :
   * sur un poste d'école, tous les enfants partagent la même.
   */
  async login(
    device: DeviceContext,
    input: EleveLogin,
    response: Response,
  ): Promise<EleveLoginResult> {
    if (device.suspended) {
      return { status: "suspended" };
    }
    const { childId, code, shown } = input;
    const link = await this.prisma.classSessionChild.findUnique({
      where: { sessionId_childId: { sessionId: device.sessionId, childId } },
      select: { child: { select: { codeHash: true } } },
    });
    const codeHash = link?.child.codeHash;
    if (!codeHash) {
      throw new AppError(404, "Tu ne fais pas partie de cette session. Demande à ton relais.");
    }
    const rows = await this.prisma.$queryRaw<{ failedCodeAttempts: number }[]>`
      UPDATE "Child" SET "failedCodeAttempts" = "failedCodeAttempts" + 1
      WHERE "id" = ${childId} AND "codeLockedAt" IS NULL AND "failedCodeAttempts" < ${this.maxAttempts}
      RETURNING "failedCodeAttempts"`;
    const attempt = rows[0]?.failedCodeAttempts;
    if (attempt === undefined) {
      return { status: "locked", images: shuffledImages(shown) };
    }

    if (await verifyChildCode(codeHash, code, this.pepper)) {
      const at = now();
      await this.prisma.$transaction([
        this.prisma.child.updateMany({
          where: { id: childId, codeLockedAt: null },
          data: { failedCodeAttempts: 0 },
        }),
        this.prisma.classSessionChild.update({
          where: { sessionId_childId: { sessionId: device.sessionId, childId } },
          data: { lastLoginAt: at },
        }),
      ]);
      await this.sessions.issueChild(response, device, childId);
      return { status: "ok" };
    }

    if (await this.countSessionFailure(device)) {
      return { status: "suspended" };
    }
    if (attempt >= this.maxAttempts) {
      await this.lockChild(device, childId);
      return { status: "locked", images: shuffledImages(shown) };
    }
    return {
      status: "wrong",
      remaining: this.maxAttempts - attempt,
      images: shuffledImages(shown),
    };
  }

  private async lockChild(device: DeviceContext, childId: string): Promise<void> {
    const at = now();
    const { count } = await this.prisma.child.updateMany({
      where: { id: childId, codeLockedAt: null },
      data: { codeLockedAt: at },
    });
    if (count > 0) {
      await this.prisma.auditLog.create({
        data: {
          action: "session.lock",
          entityType: "ClassSession",
          entityId: device.sessionId,
          metadata: { childId },
          createdAt: at,
        },
      });
    }
  }

  /** Compte l'échec sur la session ; `true` si elle vient d'atteindre la suspension. */
  private async countSessionFailure(device: DeviceContext): Promise<boolean> {
    const at = now();
    await this.prisma.classSession.update({
      where: { id: device.sessionId },
      data: { failedAttempts: { increment: 1 } },
    });
    const { count } = await this.prisma.classSession.updateMany({
      where: {
        id: device.sessionId,
        suspendedAt: null,
        failedAttempts: { gte: this.maxSessionFailures },
      },
      data: { suspendedAt: at },
    });
    if (count === 0) {
      return false;
    }
    await this.prisma.auditLog.create({
      data: {
        action: "session.suspend",
        entityType: "ClassSession",
        entityId: device.sessionId,
        createdAt: at,
      },
    });
    return true;
  }

  /** Photo d'un enfant de la session, pour le sélecteur : avec son consentement médias. */
  async avatarUrl(device: DeviceContext, childId: string): Promise<string> {
    const child = await this.prisma.child.findFirst({
      where: {
        id: childId,
        consentMedia: true,
        classSessions: { some: { sessionId: device.sessionId } },
      },
      select: { photo: { select: { status: true, storageKey: true, mimeType: true } } },
    });
    if (child?.photo?.status !== "READY" || !child.photo.storageKey) {
      throw new NotFoundException();
    }
    return this.storage.presignGet(child.photo.storageKey, { contentType: child.photo.mimeType });
  }

  // ─── Accueil ────────────────────────────────────────────────────────────────

  async home(child: ChildContext): Promise<EleveHome> {
    const at = now();
    const [sponsorships, association, news, nextCall] = await Promise.all([
      this.prisma.sponsorship.findMany({
        where: {
          childId: child.childId,
          status: "ACTIVE",
          conversation: { isNot: null },
        },
        orderBy: [{ startDate: "asc" }, { id: "asc" }],
        select: {
          conversation: { select: { id: true } },
          parrain: {
            select: {
              firstName: true,
              displayName: true,
              gender: true,
              city: true,
              country: true,
              avatarTone: true,
            },
          },
        },
      }),
      this.prisma.conversation.findUnique({
        where: { id: associationConversationId(child.childId) },
        select: { id: true },
      }),
      this.news(child, at),
      this.prisma.videoCall.findFirst({
        where: {
          status: "SCHEDULED",
          startsAt: { gt: at },
          sponsorship: { childId: child.childId, status: "ACTIVE" },
        },
        orderBy: { startsAt: "asc" },
        select: {
          startsAt: true,
          sponsorship: { select: { parrain: { select: { firstName: true } } } },
        },
      }),
    ]);
    const rights = childRights(child.rights, child);
    const threads: EleveThread[] = sponsorships.flatMap(({ conversation, parrain }) =>
      conversation
        ? [
            {
              id: conversation.id,
              kind: "sponsor" as const,
              name: parrain.firstName,
              title: parrain.gender === "F" ? "Ma marraine" : "Mon parrain",
              place: `${parrain.gender === "F" ? "Elle" : "Il"} habite à ${parrain.city}, ${inCountry(parrain.country)}.`,
              initials: initials(parrain.displayName),
              avatarTone: tone(parrain.avatarTone, "info"),
            },
          ]
        : [],
    );
    if (rights.writeAssociation || association) {
      threads.push({
        id: ELEVE_ASSOCIATION_THREAD,
        kind: "association",
        name: ASSOCIATION_NAME,
        title: null,
        place: null,
        initials: "LRT",
        avatarTone: "brand",
      });
    }
    return eleveHomeSchema.parse({
      now: at.toISOString(),
      endsAt: child.endsAt.toISOString(),
      relaisName: child.relaisName,
      child: {
        id: child.childId,
        firstName: child.firstName,
        initials: initials(childName(child)),
        avatarTone: tone(child.avatarTone, "amber"),
      },
      rights,
      threads,
      news,
      nextCall: nextCall
        ? {
            startsAt: nextCall.startsAt.toISOString(),
            parrainName: nextCall.sponsorship.parrain.firstName,
          }
        : null,
    });
  }

  /** Nouvelles marquées « visibles par les enfants » : la vie du relais, et celles qui le citent. */
  private async news(child: ChildContext, at: Date): Promise<EleveNews[]> {
    const posts = await this.prisma.newsPost.findMany({
      where: {
        relaisId: child.relaisId,
        status: "PUBLISHED",
        visibleToChildren: true,
        publishedAt: { lte: at },
        OR: [{ type: "RELAIS_LIFE" }, { children: { some: { childId: child.childId } } }],
      },
      orderBy: { publishedAt: "desc" },
      take: 3,
      select: { id: true, title: true, body: true, publishedAt: true, media: listedMedia },
    });
    return posts.map((post) => ({
      id: post.id,
      title: post.title,
      body: post.body,
      publishedAt: (post.publishedAt ?? at).toISOString(),
      media: child.consentMedia ? post.media.map(toMediaRef) : [],
    }));
  }

  // ─── Messages ───────────────────────────────────────────────────────────────

  /** Fil demandé, s'il appartient à cet enfant (404 sinon). */
  private async thread(child: ChildContext, threadId: string): Promise<Thread> {
    if (threadId === ELEVE_ASSOCIATION_THREAD) {
      const conversationId = associationConversationId(child.childId);
      const existing = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true },
      });
      return {
        kind: "association",
        conversationId,
        exists: existing !== null,
        name: "l'association",
      };
    }
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: threadId,
        kind: "SPONSORSHIP",
        childId: child.childId,
        sponsorship: { status: "ACTIVE" },
      },
      select: { id: true, parrain: { select: { firstName: true } } },
    });
    if (!conversation) {
      throw new AppError(404, THREAD_NOT_FOUND);
    }
    return {
      kind: "sponsor",
      conversationId: conversation.id,
      exists: true,
      name: conversation.parrain?.firstName ?? "ton parrain",
    };
  }

  async messages(child: ChildContext, threadId: string): Promise<EleveMessages> {
    const thread = await this.thread(child, threadId);
    const at = now();
    if (!thread.exists) {
      return { items: [], now: at.toISOString() };
    }
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: thread.conversationId,
        kind: { in: ["TEXT", "ENCOURAGEMENT"] },
        OR: [
          { authorChildId: child.childId },
          { authorChildId: null, moderationStatus: { in: ["APPROVED", "MASKED"] } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ELEVE_THREAD_LENGTH,
      select: threadMessageSelect,
    });
    return eleveMessagesSchema.parse({
      items: rows.reverse().map((row) => this.toMessage(child, row)),
      now: at.toISOString(),
    });
  }

  private toMessage(child: ChildContext, row: ThreadMessageRow): EleveMessage {
    const mine = row.authorChildId === child.childId;
    const masked = row.moderationStatus === "MASKED";
    const profile = row.authorUser?.parrainProfile;
    return {
      id: row.id,
      side: mine ? "me" : "them",
      authorName: mine
        ? child.firstName
        : (profile?.firstName ?? row.authorUser?.relais?.displayName ?? ASSOCIATION_NAME),
      body: masked ? (row.redactedBody ?? MASKED_PLACEHOLDER) : row.body,
      masked,
      attachments: row.media.map(toMediaRef),
      createdAt: row.createdAt.toISOString(),
      deliveredAt: mine ? (row.reviewedAt?.toISOString() ?? null) : null,
      readAt: mine ? (row.readAt?.toISOString() ?? null) : null,
      status: mine ? statusOf(row) : null,
    };
  }

  /** L'enfant a ouvert le fil : les messages reçus passent à « Lu » chez leur auteur. */
  async markRead(child: ChildContext, threadId: string): Promise<void> {
    const thread = await this.thread(child, threadId);
    if (!thread.exists) {
      return;
    }
    const at = now();
    await this.prisma.$transaction([
      this.prisma.conversationParticipant.updateMany({
        where: { conversationId: thread.conversationId, childId: child.childId },
        data: { lastReadAt: at },
      }),
      this.prisma.message.updateMany({
        where: {
          conversationId: thread.conversationId,
          authorChildId: null,
          moderationStatus: { in: ["APPROVED", "MASKED"] },
          deliveryStatus: { not: "RECEIVED" },
        },
        data: { deliveryStatus: "RECEIVED", readAt: at },
      }),
    ]);
  }

  async send(
    child: ChildContext,
    threadId: string,
    input: EleveSendMessage,
  ): Promise<EleveSentMessage> {
    const thread = await this.thread(child, threadId);
    this.checkRights(childRights(child.rights, child), thread, input);
    const key = `child:${child.childId}:${input.idempotencyKey}`;
    const replayed = await this.replay(thread, key);
    if (replayed) {
      return replayed;
    }
    const retryAfter = await consumeAttempt(
      this.prisma,
      `messages:child:${child.childId}`,
      this.rateRule,
      Date.now(),
    );
    if (retryAfter !== null) {
      throw new AppError(429, RATE_LIMITED);
    }
    await this.checkAttachments(child, input);

    const detection = detectAlerts(input.body);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!thread.exists) {
          await this.createAssociationConversation(tx, child, thread.conversationId);
        }
        const last = await tx.message.findFirst({
          where: { conversationId: thread.conversationId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        const at = nextMessageAt(now(), last?.createdAt ?? null);
        const { id } = await tx.message.create({
          data: {
            conversationId: thread.conversationId,
            kind: "TEXT",
            body: input.body,
            moderationStatus: "PENDING",
            deliveryStatus: "SENT",
            autoAlerts: detection.spans as unknown as Prisma.InputJsonValue,
            alertTypes: detection.types,
            sentFrom: "SCHOOL_SESSION",
            idempotencyKey: key,
            authorChildId: child.childId,
            createdAt: at,
          },
          select: { id: true },
        });
        await this.attach(tx, child, id, input);
        await tx.classSession.update({
          where: { id: child.sessionId },
          data: { sendCount: { increment: 1 } },
        });
        return { id };
      });
    } catch (error) {
      // Deux envois simultanés avec la même clé : le second renvoie le premier.
      if (isUniqueViolation(error)) {
        const again = await this.replay(thread, key);
        if (again) {
          return again;
        }
      }
      throw error;
    }
  }

  /**
   * Écrire à son parrain demande le droit d'écrire ; un petit mot joint à un fichier suit le droit
   * du fichier. Vers l'association : du texte seulement.
   */
  private checkRights(rights: ClassSessionRights, thread: Thread, input: EleveSendMessage): void {
    const hasFiles = input.mediaIds.length > 0;
    if (thread.kind === "association") {
      if (!rights.writeAssociation || hasFiles) {
        throw new AppError(403, RIGHT_REFUSED);
      }
      return;
    }
    const allowed = !hasFiles
      ? rights.writeSponsor
      : input.bulletin
        ? rights.bulletin
        : rights.media;
    if (!allowed) {
      throw new AppError(403, RIGHT_REFUSED);
    }
  }

  private async replay(thread: Thread, key: string): Promise<EleveSentMessage | null> {
    const existing = await this.prisma.message.findUnique({
      where: { idempotencyKey: key },
      select: { id: true, conversationId: true },
    });
    if (!existing) {
      return null;
    }
    if (existing.conversationId !== thread.conversationId) {
      throw new AppError(409, "Ce message a déjà été envoyé ailleurs");
    }
    return { id: existing.id };
  }

  /** Fichiers envoyés par cet enfant, prêts, jamais joints ailleurs, et du bon type. */
  private async checkAttachments(child: ChildContext, input: EleveSendMessage): Promise<void> {
    if (input.mediaIds.length === 0) {
      return;
    }
    const usable = await this.prisma.media.count({
      where: {
        id: { in: input.mediaIds },
        uploadedByChildId: child.childId,
        status: "READY",
        kind: {
          in: uploadKinds.filter((kind) =>
            input.bulletin ? kind !== "VIDEO" : kind !== "DOCUMENT",
          ),
        },
        messageId: null,
        newsPostId: null,
        schoolResultId: null,
      },
    });
    if (usable !== input.mediaIds.length) {
      throw new AppError(422, INVALID_MEDIA, { mediaIds: [INVALID_MEDIA] });
    }
  }

  private async attach(
    tx: Prisma.TransactionClient,
    child: ChildContext,
    messageId: string,
    input: EleveSendMessage,
  ): Promise<void> {
    if (input.mediaIds.length === 0) {
      return;
    }
    const { count } = await tx.media.updateMany({
      where: {
        id: { in: input.mediaIds },
        uploadedByChildId: child.childId,
        status: "READY",
        messageId: null,
      },
      data: { messageId },
    });
    if (count !== input.mediaIds.length) {
      throw new AppError(422, INVALID_MEDIA, { mediaIds: [INVALID_MEDIA] });
    }
    for (const [position, mediaId] of input.mediaIds.entries()) {
      await tx.media.update({
        where: { id: mediaId },
        data: {
          position,
          ...(input.bulletin
            ? {
                kind: "BULLETIN",
                label: input.mediaIds.length > 1 ? `Bulletin, page ${position + 1}` : "Bulletin",
              }
            : {}),
        },
      });
    }
  }

  private async createAssociationConversation(
    tx: Prisma.TransactionClient,
    child: ChildContext,
    id: string,
  ): Promise<void> {
    await tx.conversation.upsert({
      where: { id },
      update: {},
      create: {
        id,
        kind: "CHILD_ASSOCIATION",
        childId: child.childId,
        relaisId: child.relaisId,
        lastMessageAt: now(),
        participants: { create: { childId: child.childId } },
      },
    });
  }

  /** Écran « Bravo » : réservé à l'auteur du message. */
  async sent(child: ChildContext, messageId: string): Promise<EleveSentSummary> {
    const row = await this.prisma.message.findFirst({
      where: { id: messageId, authorChildId: child.childId },
      select: {
        id: true,
        moderationStatus: true,
        deliveryStatus: true,
        media: { select: { kind: true } },
        conversation: {
          select: { kind: true, parrain: { select: { firstName: true } } },
        },
      },
    });
    if (!row) {
      throw new AppError(404, "Ce message n'est pas le tien");
    }
    const kinds = row.media.map((media) => media.kind);
    const content: EleveSentContent = kinds.includes("BULLETIN")
      ? "bulletin"
      : kinds.includes("VIDEO")
        ? "video"
        : kinds.includes("PHOTO")
          ? "photo"
          : "message";
    const association = row.conversation.kind === "CHILD_ASSOCIATION";
    return eleveSentSummarySchema.parse({
      id: row.id,
      content,
      recipient: association ? "association" : "sponsor",
      recipientName: association
        ? "l'association"
        : (row.conversation.parrain?.firstName ?? "ton parrain"),
      status: statusOf(row),
    });
  }

  // ─── Fichiers ───────────────────────────────────────────────────────────────

  createUpload(child: ChildContext, input: CreateUpload): Promise<UploadTicket> {
    if (!canUploadKind(childRights(child.rights, child), input.kind)) {
      throw new AppError(403, RIGHT_REFUSED);
    }
    return this.uploads.createForChild(child.childId, input);
  }

  uploadParts(child: ChildContext, mediaId: string): Promise<UploadParts> {
    return this.uploads.parts({ childId: child.childId }, mediaId);
  }

  completeUpload(child: ChildContext, mediaId: string): Promise<UploadedMedia> {
    return this.uploads.complete({ childId: child.childId }, mediaId);
  }

  /** URL présignée d'un média que cet enfant a le droit de voir ; 404 sinon, sans rien révéler. */
  async mediaUrl(child: ChildContext, mediaId: string): Promise<string> {
    const row = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: childMediaSelect(child.childId),
    });
    if (!row?.storageKey || !canChildViewMedia(child, row, now())) {
      throw new NotFoundException();
    }
    return this.storage.presignGet(row.storageKey, { contentType: row.mimeType });
  }
}
