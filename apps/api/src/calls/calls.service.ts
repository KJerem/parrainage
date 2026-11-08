import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CALL_MAX_OPEN_SLOTS,
  type CallCard,
  callCardSchema,
  type ChooseCallSlot,
  type CreateCallRequest,
  type CreateCallSlots,
  messagesPath,
  type ParrainCalls,
  parrainCallsSchema,
  type ProposeCallSlots,
  type RelaisCalls,
  relaisCallsSchema,
} from "@parrainage/contracts";
import type { Actor } from "../auth/actor.js";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { MessageKind } from "../generated/prisma/enums.js";
import {
  callConfirmedEmail,
  callRequestedEmail,
  callSlotsProposedEmail,
} from "../mail/templates.js";
import { sendMailInBackground } from "../mail/transport.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { childName } from "../messaging/present.js";
import { nextMessageAt } from "../messaging/visibility.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  ACTIVE_REQUEST_STATUSES,
  callCardSelect,
  splitCalls,
  toCallCard,
  videoCallSelect,
} from "./calls-common.js";
import { callIcs } from "./ics.js";

export interface ParrainCallActor {
  userId: string;
  parrainId: string;
}

export interface RelaisCallActor {
  userId: string;
  relaisId: string;
}

const CHILD_NOT_FOUND = "Cet enfant n'est pas votre filleul";
const REQUEST_NOT_FOUND = "Cette demande d'appel n'existe pas ou n'est pas la vôtre";
const REQUEST_DONE = "Cette demande a déjà reçu une réponse";
const SLOT_TAKEN = "Ce créneau n'est plus libre : choisissez-en un autre";

/** Les appels passés gardés à l'écran. */
const PAST_CALLS = 5;

/** Créneaux libres proposés au parrain. */
const LISTED_SLOTS = 12;

/** Nom de salle imprévisible : la salle ne se devine pas. */
const newRoomName = () => `lrt-${randomBytes(16).toString("hex")}`;

/**
 * Appels vidéo. Le relais publie des créneaux ; le parrain en demande un pour un filleul de son
 * binôme actif ; le relais confirme, ou propose d'autres créneaux parmi les siens. Chaque étape
 * laisse un message dans la conversation parrain ↔ relais et prévient l'autre par un lien.
 */
@Injectable()
export class CallsService {
  private readonly appUrl: string;
  private readonly earlyMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
    this.earlyMinutes = config.get("VISIO_JOIN_EARLY_MINUTES", { infer: true });
  }

  // ─── Parrain ────────────────────────────────────────────────────────────────

  private async sponsorship(actor: ParrainCallActor, childId: string) {
    const sponsorship = await this.prisma.sponsorship.findFirst({
      where: { parrainId: actor.parrainId, childId, status: "ACTIVE" },
      select: {
        id: true,
        parrainId: true,
        child: {
          select: {
            id: true,
            firstName: true,
            lastInitial: true,
            gender: true,
            relaisId: true,
            relais: { select: { displayName: true, userId: true } },
          },
        },
      },
    });
    if (!sponsorship) {
      throw new AppError(404, CHILD_NOT_FOUND);
    }
    return sponsorship;
  }

  async parrainOverview(actor: ParrainCallActor, childId: string): Promise<ParrainCalls> {
    const at = now();
    const sponsorship = await this.sponsorship(actor, childId);
    const [slots, request, calls] = await Promise.all([
      this.prisma.callSlot.findMany({
        where: { relaisId: sponsorship.child.relaisId, status: "OPEN", startsAt: { gt: at } },
        orderBy: { startsAt: "asc" },
        take: LISTED_SLOTS,
        select: { id: true, startsAt: true },
      }),
      this.prisma.callRequest.findFirst({
        where: { sponsorshipId: sponsorship.id, status: { in: [...ACTIVE_REQUEST_STATUSES] } },
        orderBy: { createdAt: "desc" },
        select: callCardSelect,
      }),
      this.prisma.videoCall.findMany({
        where: { sponsorship: { parrainId: actor.parrainId } },
        select: videoCallSelect,
      }),
    ]);
    return parrainCallsSchema.parse({
      now: at.toISOString(),
      child: {
        id: sponsorship.child.id,
        firstName: sponsorship.child.firstName,
        gender: sponsorship.child.gender,
      },
      relaisName: sponsorship.child.relais.displayName,
      slots: slots.map((slot) => ({ id: slot.id, startsAt: slot.startsAt.toISOString() })),
      request: request ? toCallCard(request) : null,
      ...splitCalls(calls, at, this.earlyMinutes, PAST_CALLS),
    });
  }

  /** Une demande à la fois par binôme, et pas de nouvelle demande avant l'appel prévu. */
  private async ensureNothingPending(
    tx: Prisma.TransactionClient,
    sponsorshipId: string,
    firstName: string,
    at: Date,
  ): Promise<void> {
    const [active, upcoming] = await Promise.all([
      tx.callRequest.count({
        where: { sponsorshipId, status: { in: [...ACTIVE_REQUEST_STATUSES] } },
      }),
      tx.videoCall.count({
        where: { sponsorshipId, status: "SCHEDULED", startsAt: { gt: at } },
      }),
    ]);
    if (active > 0) {
      throw new AppError(409, `Une demande d'appel avec ${firstName} est déjà en cours`);
    }
    if (upcoming > 0) {
      throw new AppError(409, `Un appel avec ${firstName} est déjà prévu`);
    }
  }

  async request(actor: ParrainCallActor, input: CreateCallRequest): Promise<CallCard> {
    const at = now();
    const sponsorship = await this.sponsorship(actor, input.childId);
    const { child } = sponsorship;
    const { conversation } = await this.messaging.start(
      { userId: actor.userId, role: "parrain", parrainId: actor.parrainId, relaisId: null },
      { kind: "PARRAIN_RELAIS", counterpartId: child.relaisId },
    );
    const requestId = await this.prisma.$transaction(async (tx) => {
      // Deux demandes simultanées pour le même binôme : la seconde attend, puis trouve la première.
      await tx.$queryRaw`SELECT "id" FROM "Sponsorship" WHERE "id" = ${sponsorship.id} FOR UPDATE`;
      await this.ensureNothingPending(tx, sponsorship.id, child.firstName, at);
      const request = await tx.callRequest.create({
        data: {
          sponsorshipId: sponsorship.id,
          relaisId: child.relaisId,
          status: "REQUESTED",
          slotId: input.slotId,
          durationMinutes: input.durationMinutes,
          note: input.note,
          conversationId: conversation.id,
          createdById: actor.userId,
          createdAt: at,
        },
        select: { id: true },
      });
      const { count } = await tx.callSlot.updateMany({
        where: {
          id: input.slotId,
          relaisId: child.relaisId,
          status: "OPEN",
          startsAt: { gt: at },
        },
        data: { status: "HELD", heldForId: request.id },
      });
      if (count === 0) {
        throw new AppError(409, SLOT_TAKEN, { slotId: [SLOT_TAKEN] });
      }
      await this.postMessage(tx, {
        conversationId: conversation.id,
        authorUserId: actor.userId,
        kind: "CALL_REQUEST",
        body: input.note || `Je souhaite organiser un appel vidéo avec ${child.firstName}.`,
        requestId: request.id,
        at,
      });
      return request.id;
    });
    await this.mailUser(
      child.relais.userId,
      messagesPath("relais", conversation.id),
      callRequestedEmail,
    );
    return this.card(requestId);
  }

  private async parrainRequest(actor: ParrainCallActor, requestId: string) {
    const request = await this.prisma.callRequest.findFirst({
      where: { id: requestId, sponsorship: { parrainId: actor.parrainId, status: "ACTIVE" } },
      select: {
        id: true,
        status: true,
        conversationId: true,
        relais: { select: { userId: true } },
        sponsorship: { select: { childId: true, child: { select: { firstName: true } } } },
      },
    });
    if (!request) {
      throw new AppError(404, REQUEST_NOT_FOUND);
    }
    return request;
  }

  /** Le parrain retient un des créneaux proposés : l'appel est confirmé. */
  async choose(
    actor: ParrainCallActor,
    requestId: string,
    input: ChooseCallSlot,
  ): Promise<CallCard> {
    const at = now();
    const request = await this.parrainRequest(actor, requestId);
    if (request.status !== "SLOTS_PROPOSED") {
      throw new AppError(409, REQUEST_DONE);
    }
    const callId = await this.prisma.$transaction(async (tx) =>
      this.book(tx, {
        requestId,
        slotId: input.slotId,
        expectedStatus: "SLOTS_PROPOSED",
        authorUserId: actor.userId,
        conversationId: request.conversationId,
        at,
      }),
    );
    await this.mailConfirmed(callId, request.sponsorship.childId);
    return this.card(requestId);
  }

  async cancel(actor: ParrainCallActor, requestId: string): Promise<CallCard> {
    const request = await this.parrainRequest(actor, requestId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.callRequest.updateMany({
        where: { id: request.id, status: { in: [...ACTIVE_REQUEST_STATUSES] } },
        data: { status: "CANCELLED", slotId: null },
      });
      if (count === 0) {
        throw new AppError(409, REQUEST_DONE);
      }
      await tx.callSlot.updateMany({
        where: { heldForId: request.id, status: "HELD" },
        data: { status: "OPEN", heldForId: null },
      });
    });
    return this.card(requestId);
  }

  // ─── Relais ─────────────────────────────────────────────────────────────────

  async relaisOverview(actor: RelaisCallActor): Promise<RelaisCalls> {
    const at = now();
    const [slots, requests, calls] = await Promise.all([
      this.prisma.callSlot.findMany({
        where: {
          relaisId: actor.relaisId,
          status: { in: ["OPEN", "HELD", "BOOKED"] },
          startsAt: { gt: at },
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          status: true,
          heldFor: { select: { sponsorship: { select: binomeSelect } } },
          call: { select: { sponsorship: { select: binomeSelect } } },
        },
      }),
      this.prisma.callRequest.findMany({
        where: { relaisId: actor.relaisId, status: { in: [...ACTIVE_REQUEST_STATUSES] } },
        orderBy: { createdAt: "asc" },
        select: {
          ...callCardSelect,
          note: true,
          conversationId: true,
          createdAt: true,
          sponsorship: { select: { ...callCardSelect.sponsorship.select, ...binomeSelect } },
        },
      }),
      this.prisma.videoCall.findMany({
        where: { relaisId: actor.relaisId },
        select: videoCallSelect,
      }),
    ]);
    return relaisCallsSchema.parse({
      now: at.toISOString(),
      slots: slots.map((slot) => {
        const binome = slot.heldFor?.sponsorship ?? slot.call?.sponsorship ?? null;
        return {
          id: slot.id,
          startsAt: slot.startsAt.toISOString(),
          status: slot.status,
          heldFor: binome ? binomeLabel(binome) : null,
        };
      }),
      requests: requests.map((row) => ({
        ...toCallCard(row),
        parrainName: row.sponsorship.parrain.displayName,
        childName: childName(row.sponsorship.child),
        note: row.note,
        conversationId: row.conversationId,
        createdAt: row.createdAt.toISOString(),
      })),
      ...splitCalls(calls, at, this.earlyMinutes, PAST_CALLS),
    });
  }

  async addSlots(actor: RelaisCallActor, input: CreateCallSlots) {
    const at = now();
    const dates = input.startsAt.map((value) => new Date(value));
    if (dates.some((date) => date <= at)) {
      const message = "Choisissez une date à venir";
      throw new AppError(422, message, { startsAt: [message] });
    }
    const open = await this.prisma.callSlot.count({
      where: { relaisId: actor.relaisId, status: "OPEN", startsAt: { gt: at } },
    });
    if (open + dates.length > CALL_MAX_OPEN_SLOTS) {
      throw new AppError(
        422,
        `${CALL_MAX_OPEN_SLOTS} créneaux libres au plus : retirez-en d'abord`,
      );
    }
    await this.prisma.callSlot.createMany({
      data: dates.map((startsAt) => ({
        relaisId: actor.relaisId,
        startsAt,
        createdById: actor.userId,
        createdAt: at,
      })),
      skipDuplicates: true,
    });
    const items = await this.prisma.callSlot.findMany({
      where: { relaisId: actor.relaisId, startsAt: { in: dates } },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true },
    });
    return { items: items.map((slot) => ({ id: slot.id, startsAt: slot.startsAt.toISOString() })) };
  }

  /** Seul un créneau libre se retire : un créneau réservé engage déjà un parrain. */
  async removeSlot(actor: RelaisCallActor, slotId: string): Promise<void> {
    const { count } = await this.prisma.callSlot.deleteMany({
      where: { id: slotId, relaisId: actor.relaisId, status: "OPEN" },
    });
    if (count === 0) {
      throw new AppError(409, "Ce créneau n'est plus libre : il ne peut pas être retiré");
    }
  }

  private async relaisRequest(actor: RelaisCallActor, requestId: string) {
    const request = await this.prisma.callRequest.findFirst({
      where: { id: requestId, relaisId: actor.relaisId },
      select: {
        id: true,
        status: true,
        slotId: true,
        conversationId: true,
        sponsorship: {
          select: {
            childId: true,
            child: { select: { firstName: true } },
            parrain: { select: { userId: true } },
          },
        },
      },
    });
    if (!request) {
      throw new AppError(404, REQUEST_NOT_FOUND);
    }
    return request;
  }

  /** « Confirmer le créneau » : celui que le parrain a demandé. */
  async confirm(actor: RelaisCallActor, requestId: string): Promise<CallCard> {
    const at = now();
    const request = await this.relaisRequest(actor, requestId);
    if (request.status !== "REQUESTED" || !request.slotId) {
      throw new AppError(409, REQUEST_DONE);
    }
    const slotId = request.slotId;
    const callId = await this.prisma.$transaction(async (tx) =>
      this.book(tx, {
        requestId,
        slotId,
        expectedStatus: "REQUESTED",
        authorUserId: actor.userId,
        conversationId: request.conversationId,
        at,
      }),
    );
    await this.mailConfirmed(callId, request.sponsorship.childId);
    return this.card(requestId);
  }

  /** « Proposer d'autres créneaux » : le parrain choisira parmi ceux-là. */
  async propose(
    actor: RelaisCallActor,
    requestId: string,
    input: ProposeCallSlots,
  ): Promise<CallCard> {
    const at = now();
    const request = await this.relaisRequest(actor, requestId);
    if (request.status !== "REQUESTED" && request.status !== "SLOTS_PROPOSED") {
      throw new AppError(409, REQUEST_DONE);
    }
    await this.prisma.$transaction(async (tx) => {
      const { count: updated } = await tx.callRequest.updateMany({
        where: { id: requestId, status: { in: [...ACTIVE_REQUEST_STATUSES] } },
        data: { status: "SLOTS_PROPOSED", slotId: null },
      });
      if (updated === 0) {
        throw new AppError(409, REQUEST_DONE);
      }
      await tx.callSlot.updateMany({
        where: { heldForId: requestId, status: "HELD" },
        data: { status: "OPEN", heldForId: null },
      });
      const { count } = await tx.callSlot.updateMany({
        where: {
          id: { in: input.slotIds },
          relaisId: actor.relaisId,
          status: "OPEN",
          startsAt: { gt: at },
        },
        data: { status: "HELD", heldForId: requestId },
      });
      if (count !== input.slotIds.length) {
        const message = "Un créneau choisi n'est plus libre";
        throw new AppError(409, message, { slotIds: [message] });
      }
      if (request.conversationId) {
        await this.postMessage(tx, {
          conversationId: request.conversationId,
          authorUserId: actor.userId,
          kind: "CALL_SLOTS",
          body: `Je vous propose d'autres créneaux pour l'appel avec ${request.sponsorship.child.firstName}.`,
          requestId,
          at,
        });
      }
    });
    await this.mailUser(
      request.sponsorship.parrain.userId,
      `/parrain/appels?filleul=${encodeURIComponent(request.sponsorship.childId)}`,
      callSlotsProposedEmail,
    );
    return this.card(requestId);
  }

  // ─── Commun ─────────────────────────────────────────────────────────────────

  /**
   * Réserve le créneau, libère les autres, confirme la demande et crée l'appel (salle au nom
   * aléatoire). Atomique : une réponse concurrente ne trouve plus la demande dans son état.
   */
  private async book(
    tx: Prisma.TransactionClient,
    options: {
      requestId: string;
      slotId: string;
      expectedStatus: "REQUESTED" | "SLOTS_PROPOSED";
      authorUserId: string;
      conversationId: string | null;
      at: Date;
    },
  ): Promise<string> {
    const { requestId, slotId, at } = options;
    const { count: confirmed } = await tx.callRequest.updateMany({
      where: { id: requestId, status: options.expectedStatus },
      data: { status: "CONFIRMED", slotId },
    });
    if (confirmed === 0) {
      throw new AppError(409, REQUEST_DONE);
    }
    const { count: booked } = await tx.callSlot.updateMany({
      where: { id: slotId, heldForId: requestId, status: "HELD", startsAt: { gt: at } },
      data: { status: "BOOKED" },
    });
    if (booked === 0) {
      throw new AppError(409, SLOT_TAKEN, { slotId: [SLOT_TAKEN] });
    }
    await tx.callSlot.updateMany({
      where: { heldForId: requestId, status: "HELD" },
      data: { status: "OPEN", heldForId: null },
    });
    const request = await tx.callRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        durationMinutes: true,
        sponsorshipId: true,
        relaisId: true,
        slot: { select: { startsAt: true } },
      },
    });
    const call = await tx.videoCall.create({
      data: {
        requestId,
        sponsorshipId: request.sponsorshipId,
        relaisId: request.relaisId,
        slotId,
        startsAt: request.slot!.startsAt,
        durationMinutes: request.durationMinutes,
        roomName: newRoomName(),
        createdAt: at,
      },
      select: { id: true },
    });
    if (options.conversationId) {
      await this.postMessage(tx, {
        conversationId: options.conversationId,
        authorUserId: options.authorUserId,
        kind: "SYSTEM",
        body: "Appel vidéo confirmé.",
        requestId,
        at,
      });
    }
    return call.id;
  }

  /** Message de la conversation parrain ↔ relais (remis aussitôt : entre adultes). */
  private async postMessage(
    tx: Prisma.TransactionClient,
    message: {
      conversationId: string;
      authorUserId: string;
      kind: MessageKind;
      body: string;
      requestId: string;
      at: Date;
    },
  ): Promise<void> {
    const conversation = await tx.conversation.findUniqueOrThrow({
      where: { id: message.conversationId },
      select: { lastMessageAt: true },
    });
    const at = nextMessageAt(message.at, conversation.lastMessageAt);
    await tx.message.create({
      data: {
        conversationId: message.conversationId,
        kind: message.kind,
        body: message.body,
        moderationStatus: "NOT_REQUIRED",
        deliveryStatus: "VERIFIED",
        sentFrom: "WEB",
        authorUserId: message.authorUserId,
        callRequestId: message.requestId,
        createdAt: at,
      },
    });
    await tx.conversation.update({
      where: { id: message.conversationId },
      data: { lastMessageAt: at },
    });
    await tx.conversationParticipant.updateMany({
      where: { conversationId: message.conversationId, userId: message.authorUserId },
      data: { lastReadAt: at },
    });
  }

  private async card(requestId: string): Promise<CallCard> {
    const row = await this.prisma.callRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: callCardSelect,
    });
    return callCardSchema.parse(toCallCard(row));
  }

  /** E-mail « Appel confirmé » au parrain et au relais, avec le fichier agenda. */
  private async mailConfirmed(callId: string, childId: string): Promise<void> {
    const call = await this.prisma.videoCall.findUniqueOrThrow({
      where: { id: callId },
      select: {
        startsAt: true,
        durationMinutes: true,
        relais: { select: { userId: true } },
        sponsorship: { select: { parrain: { select: { userId: true } } } },
      },
    });
    const recipients = [
      {
        userId: call.sponsorship.parrain.userId,
        path: `/parrain/appels?filleul=${encodeURIComponent(childId)}`,
      },
      { userId: call.relais.userId, path: "/relais/appels" },
    ];
    for (const { userId, path } of recipients) {
      const url = new URL(path, this.appUrl).toString();
      const ics = callIcs({
        id: callId,
        startsAt: call.startsAt,
        durationMinutes: call.durationMinutes,
        url,
        earlyMinutes: this.earlyMinutes,
      });
      await this.mailUser(userId, path, callConfirmedEmail, [
        { filename: "appel-video.ics", content: ics, contentType: "text/calendar" },
      ]);
    }
  }

  private async mailUser(
    userId: string,
    path: string,
    build: (url: string) => { subject: string; text: string; html: string },
    attachments?: { filename: string; content: string; contentType: "text/calendar" }[],
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, OR: [{ banned: null }, { banned: false }] },
      select: { email: true },
    });
    if (!user) {
      return;
    }
    sendMailInBackground({
      to: user.email,
      ...build(new URL(path, this.appUrl).toString()),
      ...(attachments ? { attachments } : {}),
    });
  }

  /** Fichier agenda d'un appel, pour un participant (404 sinon). */
  async ics(actor: Actor, callId: string): Promise<string> {
    const call = await this.prisma.videoCall.findFirst({
      where: {
        id: callId,
        status: { not: "CANCELLED" },
        OR: [
          ...(actor.parrainId ? [{ sponsorship: { parrainId: actor.parrainId } }] : []),
          ...(actor.relaisId ? [{ relaisId: actor.relaisId }] : []),
        ],
      },
      select: {
        id: true,
        startsAt: true,
        durationMinutes: true,
        sponsorship: { select: { childId: true } },
      },
    });
    if (!call) {
      throw new AppError(404, "Cet appel n'existe pas ou n'est pas le vôtre");
    }
    const path =
      actor.role === "relais"
        ? `/relais/appels/${encodeURIComponent(call.id)}`
        : `/parrain/appels/${encodeURIComponent(call.id)}`;
    return callIcs({
      id: call.id,
      startsAt: call.startsAt,
      durationMinutes: call.durationMinutes,
      url: new URL(path, this.appUrl).toString(),
      earlyMinutes: this.earlyMinutes,
    });
  }
}

const binomeSelect = {
  parrain: { select: { displayName: true } },
  child: { select: { firstName: true, lastInitial: true } },
} as const satisfies Prisma.SponsorshipSelect;

/** « Claire M. ↔ Aïcha S. » */
function binomeLabel(binome: Prisma.SponsorshipGetPayload<{ select: typeof binomeSelect }>) {
  return `${binome.parrain.displayName} ↔ ${childName(binome.child)}`;
}
