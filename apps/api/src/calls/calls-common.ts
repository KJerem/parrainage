import {
  type CallCard,
  callDurationSchema,
  callWindow,
  type NextCall,
  type VideoCall,
} from "@parrainage/contracts";
import type { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";

// Projections communes des appels : la carte d'une demande, un appel, le prochain appel d'un binôme.

/** Demandes encore en cours : le relais doit répondre, ou le parrain choisir. */
export const ACTIVE_REQUEST_STATUSES = ["REQUESTED", "SLOTS_PROPOSED"] as const;

export const callCardSelect = {
  id: true,
  status: true,
  durationMinutes: true,
  slot: { select: { id: true, startsAt: true } },
  heldSlots: {
    where: { status: "HELD" },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true },
  },
  call: { select: { id: true } },
  sponsorship: { select: { childId: true, child: { select: { firstName: true } } } },
} as const satisfies Prisma.CallRequestSelect;

export type CallCardRow = Prisma.CallRequestGetPayload<{ select: typeof callCardSelect }>;

const slotOf = (slot: { id: string; startsAt: Date }) => ({
  id: slot.id,
  startsAt: slot.startsAt.toISOString(),
});

export function toCallCard(row: CallCardRow): CallCard {
  return {
    requestId: row.id,
    status: row.status,
    childId: row.sponsorship.childId,
    childFirstName: row.sponsorship.child.firstName,
    slot: row.slot ? slotOf(row.slot) : null,
    durationMinutes: callDurationSchema.parse(row.durationMinutes),
    proposedSlots: row.status === "SLOTS_PROPOSED" ? row.heldSlots.map(slotOf) : [],
    callId: row.call?.id ?? null,
  };
}

export const videoCallSelect = {
  id: true,
  startsAt: true,
  durationMinutes: true,
  status: true,
  joinedRelaisAt: true,
  endedAt: true,
  relais: { select: { displayName: true } },
  sponsorship: {
    select: {
      childId: true,
      parrainId: true,
      child: { select: { firstName: true } },
      parrain: { select: { displayName: true } },
    },
  },
} as const satisfies Prisma.VideoCallSelect;

export type VideoCallRow = Prisma.VideoCallGetPayload<{ select: typeof videoCallSelect }>;

export function toVideoCall(row: VideoCallRow, earlyMinutes: number): VideoCall {
  const { opensAt, closesAt } = callWindow(row.startsAt, row.durationMinutes, earlyMinutes);
  const minutes =
    row.joinedRelaisAt && row.endedAt && row.endedAt > row.joinedRelaisAt
      ? Math.round((row.endedAt.getTime() - row.joinedRelaisAt.getTime()) / 60_000)
      : null;
  return {
    id: row.id,
    childId: row.sponsorship.childId,
    childFirstName: row.sponsorship.child.firstName,
    parrainName: row.sponsorship.parrain.displayName,
    relaisName: row.relais.displayName,
    startsAt: row.startsAt.toISOString(),
    durationMinutes: row.durationMinutes,
    joinOpensAt: opensAt.toISOString(),
    joinClosesAt: closesAt.toISOString(),
    minutes,
  };
}

/** Un appel est passé quand sa salle est fermée (ou qu'il a été marqué terminé). */
export function isPastCall(
  row: { status: string; startsAt: Date; durationMinutes: number },
  at: Date,
) {
  if (row.status === "ENDED") {
    return true;
  }
  return callWindow(row.startsAt, row.durationMinutes, 0).closesAt <= at;
}

/** Appels d'un ensemble de binômes : à venir (du plus proche) et passés (du plus récent). */
export function splitCalls(
  rows: readonly VideoCallRow[],
  at: Date,
  earlyMinutes: number,
  pastLimit = 5,
): { upcoming: VideoCall[]; past: VideoCall[] } {
  const live = rows.filter((row) => row.status !== "CANCELLED");
  const upcoming = live
    .filter((row) => !isPastCall(row, at))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = live
    .filter((row) => isPastCall(row, at))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, pastLimit);
  return {
    upcoming: upcoming.map((row) => toVideoCall(row, earlyMinutes)),
    past: past.map((row) => toVideoCall(row, earlyMinutes)),
  };
}

/**
 * Carte « Prochain appel vidéo » d'un binôme : l'appel confirmé le plus proche, sinon la demande
 * en cours (créneau demandé, ou créneaux à choisir).
 */
export async function loadNextCall(
  prisma: PrismaService,
  sponsorshipId: string,
  at: Date,
): Promise<NextCall | null> {
  const [calls, request] = await Promise.all([
    prisma.videoCall.findMany({
      where: {
        sponsorshipId,
        status: "SCHEDULED",
        startsAt: { gte: new Date(at.getTime() - 3 * 3_600_000) },
      },
      orderBy: { startsAt: "asc" },
      take: 3,
      select: {
        id: true,
        startsAt: true,
        durationMinutes: true,
        status: true,
        relais: { select: { displayName: true } },
      },
    }),
    prisma.callRequest.findFirst({
      where: { sponsorshipId, status: { in: [...ACTIVE_REQUEST_STATUSES] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        durationMinutes: true,
        slot: { select: { startsAt: true } },
        relais: { select: { displayName: true } },
      },
    }),
  ]);
  const call = calls.find((row) => !isPastCall(row, at));
  if (call) {
    return {
      state: "confirmed",
      requestId: null,
      callId: call.id,
      startsAt: call.startsAt.toISOString(),
      durationMinutes: call.durationMinutes,
      relaisName: call.relais.displayName,
    };
  }
  if (request) {
    return {
      state: request.status === "SLOTS_PROPOSED" ? "proposed" : "requested",
      requestId: request.id,
      callId: null,
      startsAt:
        request.status === "REQUESTED" ? (request.slot?.startsAt.toISOString() ?? null) : null,
      durationMinutes: request.durationMinutes,
      relaisName: request.relais.displayName,
    };
  }
  return null;
}
