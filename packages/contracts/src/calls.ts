// Contrats des appels vidéo (P-Video, RW-Messages, salles) : le relais publie des créneaux, le
// parrain en demande un, le relais confirme ou en propose d'autres. Heures en UTC (ISO 8601),
// affichées à Paris et à Lomé par le web.
import { z } from "zod";

const id = z.string().min(1);
const isoDateTime = z.iso.datetime();

export const callDurations = [15, 30] as const;

export const callDurationSchema = z.union([z.literal(15), z.literal(30)]);

export type CallDuration = z.infer<typeof callDurationSchema>;

export const DEFAULT_CALL_DURATION: CallDuration = 15;

/** Créneaux qu'un relais peut proposer d'un coup à un parrain. */
export const CALL_MAX_PROPOSED_SLOTS = 3;

/** Créneaux à venir qu'un relais peut publier. */
export const CALL_MAX_OPEN_SLOTS = 30;

export const CALL_NOTE_MAX_LENGTH = 500;

/** La salle reste ouverte ce temps-là après la fin prévue. */
export const CALL_JOIN_LATE_MINUTES = 15;

export const callRequestStatuses = [
  "REQUESTED",
  "SLOTS_PROPOSED",
  "CONFIRMED",
  "CANCELLED",
  "DECLINED",
] as const;

export const callRequestStatusSchema = z.enum(callRequestStatuses);

export type CallRequestStatus = z.infer<typeof callRequestStatusSchema>;

export const callSlotSchema = z.object({ id, startsAt: isoDateTime });

export type CallSlot = z.infer<typeof callSlotSchema>;

/** Une demande d'appel, telle que la montrent P-Video et les messages qui en parlent. */
export const callCardSchema = z.object({
  requestId: id,
  status: callRequestStatusSchema,
  childId: id,
  childFirstName: z.string(),
  /** Créneau demandé (REQUESTED) ou retenu (CONFIRMED). */
  slot: callSlotSchema.nullable(),
  durationMinutes: callDurationSchema,
  /** Créneaux proposés par le relais, tant que le parrain n'a pas choisi (SLOTS_PROPOSED). */
  proposedSlots: z.array(callSlotSchema),
  /** Appel créé à la confirmation. */
  callId: id.nullable(),
});

export type CallCard = z.infer<typeof callCardSchema>;

/** Un appel vidéo confirmé, à venir ou passé. */
export const videoCallSchema = z.object({
  id,
  childId: id,
  childFirstName: z.string(),
  /** « Claire M. » (vu par le relais) */
  parrainName: z.string(),
  /** « M. Koffi » */
  relaisName: z.string(),
  startsAt: isoDateTime,
  durationMinutes: z.number().int().positive(),
  /** Fenêtre d'accès à la salle : 10 min avant, jusqu'à 15 min après la fin prévue. */
  joinOpensAt: isoDateTime,
  joinClosesAt: isoDateTime,
  /** Durée réelle d'un appel passé, en minutes (sinon la durée prévue). */
  minutes: z.number().int().nonnegative().nullable(),
});

export type VideoCall = z.infer<typeof videoCallSchema>;

/** Carte « Prochain appel vidéo » de Main : l'appel confirmé, ou la demande en cours. */
export const nextCallSchema = z.object({
  state: z.enum(["confirmed", "requested", "proposed"]),
  requestId: id.nullable(),
  callId: id.nullable(),
  /** Heure de l'appel, ou du créneau demandé ; `null` quand le parrain doit choisir. */
  startsAt: isoDateTime.nullable(),
  durationMinutes: z.number().int().positive(),
  relaisName: z.string(),
});

export type NextCall = z.infer<typeof nextCallSchema>;

/** GET /api/parrain/calls?filleul= : P-Video pour un filleul. */
export const parrainCallsSchema = z.object({
  now: isoDateTime,
  child: z.object({ id, firstName: z.string(), gender: z.enum(["F", "M"]) }),
  relaisName: z.string(),
  /** Créneaux libres de son relais, à venir. */
  slots: z.array(callSlotSchema),
  /** Demande en cours pour ce filleul (en attente du relais, ou créneaux à choisir). */
  request: callCardSchema.nullable(),
  /** Appels à venir de tous les filleuls du parrain, du plus proche au plus lointain. */
  upcoming: z.array(videoCallSchema),
  /** Derniers appels passés, du plus récent au plus ancien. */
  past: z.array(videoCallSchema),
});

export type ParrainCalls = z.infer<typeof parrainCallsSchema>;

/** POST /api/parrain/calls/requests */
export const createCallRequestSchema = z.object({
  childId: id.max(64),
  slotId: id.max(64),
  durationMinutes: callDurationSchema,
  note: z.string().trim().max(CALL_NOTE_MAX_LENGTH).default(""),
});

export type CreateCallRequest = z.output<typeof createCallRequestSchema>;

/** POST /api/parrain/calls/requests/:id/choose : un des créneaux proposés par le relais. */
export const chooseCallSlotSchema = z.object({ slotId: id.max(64) });

export type ChooseCallSlot = z.infer<typeof chooseCallSlotSchema>;

export const relaisCallSlotSchema = callSlotSchema.extend({
  status: z.enum(["OPEN", "HELD", "BOOKED"]),
  /** « Claire M. ↔ Aïcha S. » pour un créneau réservé. */
  heldFor: z.string().nullable(),
});

export type RelaisCallSlot = z.infer<typeof relaisCallSlotSchema>;

export const relaisCallRequestSchema = callCardSchema.extend({
  parrainName: z.string(),
  childName: z.string(),
  note: z.string(),
  conversationId: z.string().nullable(),
  createdAt: isoDateTime,
});

export type RelaisCallRequest = z.infer<typeof relaisCallRequestSchema>;

/** GET /api/relais/calls : créneaux, demandes à traiter, appels. */
export const relaisCallsSchema = z.object({
  now: isoDateTime,
  slots: z.array(relaisCallSlotSchema),
  requests: z.array(relaisCallRequestSchema),
  upcoming: z.array(videoCallSchema),
  past: z.array(videoCallSchema),
});

export type RelaisCalls = z.infer<typeof relaisCallsSchema>;

/** POST /api/relais/calls/slots : de nouvelles disponibilités. */
export const createCallSlotsSchema = z.object({
  startsAt: z
    .array(z.iso.datetime({ offset: true }))
    .min(1)
    .max(10)
    .refine((dates) => new Set(dates).size === dates.length, "Le même créneau est donné deux fois"),
});

export type CreateCallSlots = z.infer<typeof createCallSlotsSchema>;

export const createdCallSlotsSchema = z.object({ items: z.array(callSlotSchema) });

/** POST /api/relais/calls/requests/:id/propose */
export const proposeCallSlotsSchema = z.object({
  slotIds: z
    .array(id.max(64))
    .min(1, "Choisissez au moins un créneau")
    .max(CALL_MAX_PROPOSED_SLOTS, `${CALL_MAX_PROPOSED_SLOTS} créneaux au plus`)
    .refine((ids) => new Set(ids).size === ids.length, "Le même créneau est choisi deux fois"),
});

export type ProposeCallSlots = z.infer<typeof proposeCallSlotsSchema>;

// ─── Salle ───────────────────────────────────────────────────────────────────

/**
 * État de la salle : pas encore ouverte, ouverte (le parrain attend l'arrivée du relais), ou
 * fermée. Le jeton ne se demande qu'une fois la salle ouverte.
 */
export const visioStateSchema = z.enum(["early", "waiting", "open", "closed"]);

export type VisioState = z.infer<typeof visioStateSchema>;

/** GET /api/visio/:callId */
export const visioRoomSchema = z.object({
  call: videoCallSchema,
  role: z.enum(["parrain", "relais"]),
  state: visioStateSchema,
  now: isoDateTime,
});

export type VisioRoom = z.infer<typeof visioRoomSchema>;

/** POST /api/visio/:callId/token : de quoi entrer dans la salle. */
export const visioAccessSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("jaas"),
    appId: z.string().min(1),
    roomName: z.string().min(1),
    jwt: z.string().min(1),
  }),
  z.object({ provider: z.literal("link"), url: z.url() }),
]);

export type VisioAccess = z.infer<typeof visioAccessSchema>;

/** POST /api/visio/:callId/events : arrivée dans la salle, ou départ. */
export const visioEventSchema = z.object({ type: z.enum(["joined", "left"]) });

export type VisioEvent = z.infer<typeof visioEventSchema>;

/** Chemin du fichier agenda d'un appel. */
export function callIcsPath(callId: string): string {
  return `/api/calls/${encodeURIComponent(callId)}/ics`;
}

/** Fenêtre d'accès à la salle d'un appel. */
export function callWindow(
  startsAt: Date,
  durationMinutes: number,
  earlyMinutes: number,
): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: new Date(startsAt.getTime() - earlyMinutes * 60_000),
    closesAt: new Date(startsAt.getTime() + (durationMinutes + CALL_JOIN_LATE_MINUTES) * 60_000),
  };
}
