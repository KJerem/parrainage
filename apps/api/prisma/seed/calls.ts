import { addDays, startOfDayUtc } from "./dates.js";
import type { SeedData } from "./data.js";

// Appels de démonstration (P-Video, RW-Messages) : créneaux des 14, 18 et 21 novembre, la demande
// de Claire pour Aïcha (le 14, en attente de M. Koffi), l'appel confirmé avec Kofi le 5, et deux
// appels passés. Les dates suivent le jour de référence du seed (31 octobre pour la démo).

export interface SeedCallSlot {
  id: string;
  relaisId: string;
  startsAt: Date;
  status: "OPEN" | "HELD" | "BOOKED";
  heldForId: string | null;
  createdById: string;
  createdAt: Date;
}

export interface SeedCallRequest {
  id: string;
  sponsorshipId: string;
  relaisId: string;
  status: "REQUESTED" | "CONFIRMED";
  slotId: string | null;
  durationMinutes: number;
  note: string;
  conversationId: string | null;
  createdById: string;
  createdAt: Date;
}

export interface SeedVideoCall {
  id: string;
  requestId: string | null;
  sponsorshipId: string;
  relaisId: string;
  slotId: string | null;
  startsAt: Date;
  durationMinutes: number;
  roomName: string;
  status: "SCHEDULED" | "ENDED";
  joinedRelaisAt: Date | null;
  joinedParrainAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

export interface SeedCalls {
  slots: SeedCallSlot[];
  requests: SeedCallRequest[];
  calls: SeedVideoCall[];
  /** Message de Claire devenu sa demande d'appel (bulle « Demande d'appel · samedi 14 nov. »). */
  requestMessage: { messageId: string; requestId: string };
}

const at = (date: Date, hours: number, minutes = 0) =>
  new Date(date.getTime() + (hours * 60 + minutes) * 60_000);

const minutesAfter = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

/** Le `day` du mois `month` (1 à 12) le plus récent avant `today`. */
function lastDate(today: Date, month: number, dayOfMonth: number): Date {
  const thisYear = new Date(Date.UTC(today.getUTCFullYear(), month - 1, dayOfMonth));
  return thisYear < today
    ? thisYear
    : new Date(Date.UTC(today.getUTCFullYear() - 1, month - 1, dayOfMonth));
}

export function buildSeedCalls(today: Date, data: SeedData): SeedCalls {
  const start = startOfDayUtc(today);
  const koffi = data.relais.find((relais) => relais.relais.id === "seed-relais-koffi")!;
  const relaisId = koffi.relais.id;
  const claire = data.parrains.find((parrain) => parrain.profile.id === "seed-parrain-claire")!;
  const sponsorshipOf = (childId: string) =>
    data.sponsorships.find(
      (s) => s.childId === childId && s.parrainId === claire.profile.id && s.status === "ACTIVE",
    )!.id;
  const aicha = sponsorshipOf("seed-child-aicha");
  const kofi = sponsorshipOf("seed-child-kofi");
  const createdAt = addDays(start, -12);

  const slot = (
    id: string,
    startsAt: Date,
    status: SeedCallSlot["status"] = "OPEN",
    heldForId: string | null = null,
  ): SeedCallSlot => ({
    id: `seed-call-slot-${id}`,
    relaisId,
    startsAt,
    status,
    heldForId,
    createdById: koffi.id,
    createdAt,
  });

  // 10 h UTC : 11 h à Paris (heure d'hiver), 10 h à Lomé.
  const aichaSlot = slot("14", at(addDays(start, 14), 10), "HELD", "seed-call-request-aicha");
  const kofiSlot = slot("5", at(addDays(start, 5), 17), "BOOKED", "seed-call-request-kofi");
  const slots = [
    aichaSlot,
    slot("18", at(addDays(start, 18), 16)),
    slot("21", at(addDays(start, 21), 9)),
    kofiSlot,
  ];

  const requests: SeedCallRequest[] = [
    {
      id: "seed-call-request-aicha",
      sponsorshipId: aicha,
      relaisId,
      status: "REQUESTED",
      slotId: aichaSlot.id,
      durationMinutes: 15,
      note: "Bonjour M. Koffi, serait-il possible d'organiser un appel avec Aïcha avant Noël ? Je suis disponible le week-end.",
      conversationId: "seed-conversation-claire-koffi",
      createdById: claire.id,
      createdAt: at(addDays(start, -3), 19),
    },
    {
      id: "seed-call-request-kofi",
      sponsorshipId: kofi,
      relaisId,
      status: "CONFIRMED",
      slotId: kofiSlot.id,
      durationMinutes: 30,
      note: "",
      conversationId: null,
      createdById: claire.id,
      createdAt: addDays(start, -10),
    },
  ];

  const pastAicha = at(lastDate(start, 6, 20), 10);
  const pastKofi = at(lastDate(start, 5, 3), 10);
  const calls: SeedVideoCall[] = [
    {
      id: "seed-video-call-kofi",
      requestId: "seed-call-request-kofi",
      sponsorshipId: kofi,
      relaisId,
      slotId: kofiSlot.id,
      startsAt: kofiSlot.startsAt,
      durationMinutes: 30,
      roomName: "lrt-seed-appel-kofi",
      status: "SCHEDULED",
      joinedRelaisAt: null,
      joinedParrainAt: null,
      endedAt: null,
      createdAt: addDays(start, -9),
    },
    {
      id: "seed-video-call-aicha-juin",
      requestId: null,
      sponsorshipId: aicha,
      relaisId,
      slotId: null,
      startsAt: pastAicha,
      durationMinutes: 30,
      roomName: "lrt-seed-appel-aicha-juin",
      status: "ENDED",
      joinedRelaisAt: pastAicha,
      joinedParrainAt: minutesAfter(pastAicha, 1),
      endedAt: minutesAfter(pastAicha, 22),
      createdAt: addDays(pastAicha, -7),
    },
    {
      id: "seed-video-call-kofi-mai",
      requestId: null,
      sponsorshipId: kofi,
      relaisId,
      slotId: null,
      startsAt: pastKofi,
      durationMinutes: 15,
      roomName: "lrt-seed-appel-kofi-mai",
      status: "ENDED",
      joinedRelaisAt: pastKofi,
      joinedParrainAt: minutesAfter(pastKofi, 1),
      endedAt: minutesAfter(pastKofi, 15),
      createdAt: addDays(pastKofi, -7),
    },
  ];

  return {
    slots,
    requests,
    calls,
    requestMessage: {
      messageId: "seed-message-claire-to-koffi",
      requestId: "seed-call-request-aicha",
    },
  };
}
