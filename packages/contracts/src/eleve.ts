// Contrats des sessions élèves : côté relais (/api/relais/sessions, RW-Session) et côté enfant
// (/api/eleve/*, écrans E-Connexion, Enfant, E-Bulletin et E-Envoye). Un enfant ne reçoit que le
// prénom des adultes, jamais de nom complet, d'adresse ni de moyen de contact.
import { z } from "zod";
import { avatarToneSchema } from "./avatar.js";
import { mediaRefSchema, type MediaRef } from "./media.js";
import {
  idempotencyKeySchema,
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_MAX_ATTACHMENTS,
} from "./messaging.js";
import { childCodeImageSchema, childCodeSchema } from "./relais.js";

const id = z.string().min(1);
const isoDateTime = z.iso.datetime();

// ─── Côté relais ─────────────────────────────────────────────────────────────

export const classSessionDurations = [30, 45, 60] as const;

export const classSessionDurationSchema = z.union([z.literal(30), z.literal(45), z.literal(60)]);

export type ClassSessionDuration = z.infer<typeof classSessionDurationSchema>;

export const DEFAULT_CLASS_SESSION_DURATION: ClassSessionDuration = 45;

export function classSessionDurationLabel(minutes: ClassSessionDuration): string {
  return minutes === 60 ? "1 h" : `${minutes} min`;
}

/** Ce que les enfants peuvent faire pendant la session (figé à l'ouverture). */
export const classSessionRightsSchema = z.object({
  writeSponsor: z.boolean(),
  media: z.boolean(),
  bulletin: z.boolean(),
  writeAssociation: z.boolean(),
});

export type ClassSessionRights = z.infer<typeof classSessionRightsSchema>;

export const classSessionRightKeys = [
  "writeSponsor",
  "media",
  "bulletin",
  "writeAssociation",
] as const satisfies readonly (keyof ClassSessionRights)[];

export const classSessionRightLabels: Readonly<Record<keyof ClassSessionRights, string>> = {
  writeSponsor: "Écrire à leur parrain",
  media: "Ajouter une photo ou une vidéo (webcam)",
  bulletin: "Envoyer leur bulletin",
  writeAssociation: "Écrire à l'association",
};

export const DEFAULT_CLASS_SESSION_RIGHTS: ClassSessionRights = {
  writeSponsor: true,
  media: true,
  bulletin: true,
  writeAssociation: false,
};

export const CLASS_SESSION_MAX_CHILDREN = 40;

const sessionFields = {
  childIds: z
    .array(id.max(64))
    .min(1, "Choisissez au moins un enfant")
    .max(CLASS_SESSION_MAX_CHILDREN)
    .refine((ids) => new Set(ids).size === ids.length, "Le même enfant est choisi deux fois"),
  durationMinutes: classSessionDurationSchema,
  rights: classSessionRightsSchema.refine(
    (rights) => classSessionRightKeys.some((key) => rights[key]),
    "Laissez au moins une chose à faire aux enfants",
  ),
};

/** POST /api/relais/sessions/open. `plannedSessionId` : la session planifiée que l'on ouvre. */
export const openClassSessionSchema = z.object({
  ...sessionFields,
  plannedSessionId: id.max(64).optional(),
});

export type OpenClassSession = z.infer<typeof openClassSessionSchema>;

/** POST /api/relais/sessions : une session planifiée, ouverte plus tard sur le poste de l'école. */
export const planClassSessionSchema = z.object({
  ...sessionFields,
  scheduledAt: z.iso.datetime({ offset: true }),
});

export type PlanClassSession = z.infer<typeof planClassSessionSchema>;

/** Réponse à l'ouverture : le poste reçoit son cookie et le relais en est déconnecté. */
export const openedClassSessionSchema = z.object({ id, endsAt: isoDateTime });

export type OpenedClassSession = z.infer<typeof openedClassSessionSchema>;

/** Enfant proposé dans le formulaire d'ouverture. */
export const sessionEligibleChildSchema = z.object({
  id,
  /** « Esther N. » */
  name: z.string(),
  initials: z.string().min(1).max(3),
  avatarTone: avatarToneSchema,
  hasSponsor: z.boolean(),
  /** Sans code image, l'enfant ne pourrait pas se connecter. */
  hasCode: z.boolean(),
  /** Bloqué par trop d'erreurs : à débloquer pendant la session. */
  locked: z.boolean(),
  /** Sans consentement médias, ni photo ni vidéo pendant la session. */
  consentMedia: z.boolean(),
});

export type SessionEligibleChild = z.infer<typeof sessionEligibleChildSchema>;

export const plannedClassSessionSchema = z.object({
  id,
  scheduledAt: isoDateTime,
  durationMinutes: classSessionDurationSchema,
  rights: classSessionRightsSchema,
  childIds: z.array(id),
});

export type PlannedClassSession = z.infer<typeof plannedClassSessionSchema>;

export const currentSessionChildSchema = z.object({
  id,
  name: z.string(),
  initials: z.string().min(1).max(3),
  avatarTone: avatarToneSchema,
  lastLoginAt: isoDateTime.nullable(),
  locked: z.boolean(),
});

export type CurrentSessionChild = z.infer<typeof currentSessionChildSchema>;

export const currentClassSessionSchema = z.object({
  id,
  openedAt: isoDateTime,
  endsAt: isoDateTime,
  durationMinutes: classSessionDurationSchema,
  rights: classSessionRightsSchema,
  /** Trop de codes faux sur la session : plus aucun enfant n'y accède avant sa reprise. */
  suspended: z.boolean(),
  sendCount: z.number().int().nonnegative(),
  children: z.array(currentSessionChildSchema),
});

export type CurrentClassSession = z.infer<typeof currentClassSessionSchema>;

export const recentClassSessionSchema = z.object({
  id,
  openedAt: isoDateTime,
  childCount: z.number().int().nonnegative(),
  sendCount: z.number().int().nonnegative(),
});

export type RecentClassSession = z.infer<typeof recentClassSessionSchema>;

/** GET /api/relais/sessions. */
export const relaisSessionsSchema = z.object({
  now: isoDateTime,
  eligible: z.array(sessionEligibleChildSchema),
  /** Du plus proche au plus lointain. */
  planned: z.array(plannedClassSessionSchema),
  current: currentClassSessionSchema.nullable(),
  recent: z.array(recentClassSessionSchema),
});

export type RelaisSessions = z.infer<typeof relaisSessionsSchema>;

// ─── Côté enfant : connexion ─────────────────────────────────────────────────

export const eleveLoginChildSchema = z.object({
  id,
  firstName: z.string(),
  initials: z.string().min(1).max(3),
  avatarTone: avatarToneSchema,
  /** Photo montrée dans le sélecteur : seulement avec le consentement médias. */
  hasPhoto: z.boolean(),
});

export type EleveLoginChild = z.infer<typeof eleveLoginChildSchema>;

/** GET /api/eleve/session : la session ouverte sur ce poste (401 s'il n'y en a pas). */
export const eleveSessionSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("open"),
    relaisName: z.string(),
    endsAt: isoDateTime,
    now: isoDateTime,
    children: z.array(eleveLoginChildSchema),
    /** Les 6 images, dans un ordre tiré par le serveur à chaque tentative. */
    images: z.array(childCodeImageSchema),
  }),
  z.object({ state: z.literal("suspended"), relaisName: z.string() }),
]);

export type EleveSession = z.infer<typeof eleveSessionSchema>;

/** POST /api/eleve/login. `shown` : l'ordre affiché, pour que le suivant en diffère. */
export const eleveLoginSchema = z.object({
  childId: id.max(64),
  code: childCodeSchema,
  shown: z.array(childCodeImageSchema).max(6).optional(),
});

export type EleveLogin = z.infer<typeof eleveLoginSchema>;

export const eleveLoginResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok") }),
  z.object({
    status: z.literal("wrong"),
    remaining: z.number().int().positive(),
    images: z.array(childCodeImageSchema),
  }),
  z.object({ status: z.literal("locked"), images: z.array(childCodeImageSchema) }),
  z.object({ status: z.literal("suspended") }),
]);

export type EleveLoginResult = z.infer<typeof eleveLoginResultSchema>;

// ─── Côté enfant : messages ──────────────────────────────────────────────────

/** Fil vers l'association : la conversation n'existe qu'à partir du premier message. */
export const ELEVE_ASSOCIATION_THREAD = "association";

export const eleveThreadSchema = z.object({
  /** Conversation avec le parrain, ou `ELEVE_ASSOCIATION_THREAD`. */
  id,
  kind: z.enum(["sponsor", "association"]),
  /** Prénom du parrain (« Claire »), ou « L'association ». */
  name: z.string(),
  /** « Ma marraine », « Mon parrain » ; `null` pour l'association. */
  title: z.string().nullable(),
  /** « Elle habite à Lyon, en France. » */
  place: z.string().nullable(),
  initials: z.string().min(1).max(3),
  avatarTone: avatarToneSchema,
});

export type EleveThread = z.infer<typeof eleveThreadSchema>;

export const eleveNewsSchema = z.object({
  id,
  title: z.string(),
  body: z.string(),
  publishedAt: isoDateTime,
  media: z.array(mediaRefSchema),
});

export type EleveNews = z.infer<typeof eleveNewsSchema>;

/** GET /api/eleve/me. `rights` : ceux de la session, moins ce que le dossier de l'enfant exclut. */
export const eleveHomeSchema = z.object({
  now: isoDateTime,
  endsAt: isoDateTime,
  relaisName: z.string(),
  child: z.object({
    id,
    firstName: z.string(),
    initials: z.string().min(1).max(3),
    avatarTone: avatarToneSchema,
  }),
  rights: classSessionRightsSchema,
  threads: z.array(eleveThreadSchema),
  news: z.array(eleveNewsSchema),
});

export type EleveHome = z.infer<typeof eleveHomeSchema>;

/**
 * Suivi d'un message d'enfant : relu par l'association, gardé par elle, reçu par le parrain (remis
 * après relecture), puis lu. Un message gardé ne dit pas pourquoi : c'est le relais, prévenu, qui
 * en parle à l'enfant.
 */
export const eleveMessageStatusSchema = z.enum(["relecture", "garde", "recu", "lu"]);

export type EleveMessageStatus = z.infer<typeof eleveMessageStatusSchema>;

export const eleveMessageSchema = z.object({
  id,
  side: z.enum(["me", "them"]),
  /** Prénom de l'auteur (« Claire ») ; « Moi » n'est jamais écrit : `side` suffit. */
  authorName: z.string(),
  body: z.string(),
  masked: z.boolean(),
  attachments: z.array(mediaRefSchema),
  createdAt: isoDateTime,
  /** Instant où l'association l'a remis au parrain (message de l'enfant). */
  deliveredAt: isoDateTime.nullable(),
  /** Instant où le parrain l'a lu. */
  readAt: isoDateTime.nullable(),
  /** Pour les messages de l'enfant ; `null` pour ceux qu'il reçoit. */
  status: eleveMessageStatusSchema.nullable(),
});

export type EleveMessage = z.infer<typeof eleveMessageSchema>;

/** GET /api/eleve/conversations/:id/messages : du plus ancien au plus récent. */
export const eleveMessagesSchema = z.object({
  items: z.array(eleveMessageSchema),
  now: isoDateTime,
});

export type EleveMessages = z.infer<typeof eleveMessagesSchema>;

/** Une session se partage : un fil court, sans remonter à des années d'échanges. */
export const ELEVE_THREAD_LENGTH = 30;

/** Durée maximale d'une vidéo d'enfant (l'API lit CHILD_VIDEO_MAX_SECONDS). */
export const ELEVE_VIDEO_MAX_SECONDS = 60;

/** Pages d'un bulletin envoyées d'un coup. */
export const ELEVE_BULLETIN_MAX_PAGES = MESSAGE_MAX_ATTACHMENTS;

/** POST /api/eleve/conversations/:id/messages. `bulletin` : les fichiers sont ses pages. */
export const eleveSendMessageSchema = z
  .object({
    body: z.string().trim().max(MESSAGE_BODY_MAX_LENGTH).default(""),
    mediaIds: z.array(id.max(64)).max(MESSAGE_MAX_ATTACHMENTS).default([]),
    bulletin: z.boolean().default(false),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine((input) => input.body !== "" || input.mediaIds.length > 0, {
    path: ["body"],
    message: "Écris un message ou ajoute un fichier",
  })
  .refine((input) => new Set(input.mediaIds).size === input.mediaIds.length, {
    path: ["mediaIds"],
    message: "Le même fichier est ajouté deux fois",
  })
  .refine((input) => !input.bulletin || input.mediaIds.length > 0, {
    path: ["mediaIds"],
    message: "Ajoute au moins une page de ton bulletin",
  });

export type EleveSendMessage = z.output<typeof eleveSendMessageSchema>;

export const eleveSentMessageSchema = z.object({ id });

export type EleveSentMessage = z.infer<typeof eleveSentMessageSchema>;

/** Ce qu'un enfant vient d'envoyer, pour l'écran « Bravo ». */
export const eleveSentContents = ["message", "photo", "video", "bulletin"] as const;

export const eleveSentContentSchema = z.enum(eleveSentContents);

export type EleveSentContent = z.infer<typeof eleveSentContentSchema>;

/** GET /api/eleve/messages/:id (auteur seulement, 404 sinon). */
export const eleveSentSummarySchema = z.object({
  id,
  content: eleveSentContentSchema,
  recipient: z.enum(["sponsor", "association"]),
  /** « Claire », « l'association ». */
  recipientName: z.string(),
  status: eleveMessageStatusSchema,
});

export type EleveSentSummary = z.infer<typeof eleveSentSummarySchema>;

/**
 * Chemin de lecture d'un média par un enfant, ou `null` sans fichier à servir (l'API vérifie que
 * l'enfant y a droit, cookie de session élève à l'appui).
 */
export function eleveMediaPath(ref: Pick<MediaRef, "id" | "status">): string | null {
  return ref.status === "READY" ? `/api/eleve/media/${encodeURIComponent(ref.id)}` : null;
}
