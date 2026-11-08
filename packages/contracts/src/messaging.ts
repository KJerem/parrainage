// Contrats de la messagerie (GET/POST /api/conversations…). Dates en chaînes ISO ; les
// textes visibles dépendent de l'acteur : un message en relecture n'est montré qu'à son auteur.
import { z } from "zod";
import { avatarToneSchema } from "./avatar.js";
import { callCardSchema } from "./calls.js";
import { mediaRefSchema } from "./media.js";
import type { Role } from "./roles.js";

export const conversationKinds = [
  "SPONSORSHIP",
  "PARRAIN_RELAIS",
  "RELAIS_BUREAU",
  "PARRAIN_BUREAU",
  "CHILD_ASSOCIATION",
] as const;

export const conversationKindSchema = z.enum(conversationKinds);

export type ConversationKind = z.infer<typeof conversationKindSchema>;

/** Conversations qu'un adulte peut ouvrir lui-même (POST /api/conversations). */
export const startableConversationKinds = [
  "PARRAIN_RELAIS",
  "RELAIS_BUREAU",
  "PARRAIN_BUREAU",
] as const;

export const startableConversationKindSchema = z.enum(startableConversationKinds);

export type StartableConversationKind = z.infer<typeof startableConversationKindSchema>;

export const messageKinds = [
  "TEXT",
  "ENCOURAGEMENT",
  "CALL_REQUEST",
  "CALL_SLOTS",
  "SYSTEM",
  "NEWSLETTER",
] as const;

export const messageKindSchema = z.enum(messageKinds);

export type MessageKind = z.infer<typeof messageKindSchema>;

/**
 * Suivi d'un message, montré à son auteur (et au relais qui suit la conversation d'un enfant) :
 * en relecture par l'association, remis au destinataire, lu par lui, ou retenu.
 */
export const messageStatuses = ["en_relecture", "remis", "lu", "retenu"] as const;

export const messageStatusSchema = z.enum(messageStatuses);

export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const messageStatusLabels: Readonly<Record<MessageStatus, string>> = {
  en_relecture: "En relecture",
  remis: "Remis",
  lu: "Lu",
  retenu: "Retenu par l'association",
};

/** Texte de l'encouragement prédéfini, approuvé automatiquement. */
export const ENCOURAGEMENT_TEXT = "Bravo, continue comme ça ! Je pense bien à toi.";

export const MESSAGE_BODY_MAX_LENGTH = 4000;
export const MESSAGE_MAX_ATTACHMENTS = 4;
export const MESSAGE_PAGE_DEFAULT_SIZE = 30;
export const MESSAGE_PAGE_MAX_SIZE = 50;

const id = z.string().min(1);
const isoDateTime = z.iso.datetime();

/** Accès de l'acteur : partie à la conversation, ou relais qui suit celle d'un de ses enfants. */
export const conversationAccessSchema = z.enum(["participant", "supervisor"]);

export type ConversationAccess = z.infer<typeof conversationAccessSchema>;

export const personKindSchema = z.enum(["child", "parrain", "relais", "bureau"]);

export type PersonKind = z.infer<typeof personKindSchema>;

/** L'interlocuteur, tel que l'acteur le voit (jamais d'e-mail ni d'adresse). */
export const counterpartSchema = z.object({
  kind: personKindSchema,
  /** Enfant, profil parrain ou relais ; `null` pour le bureau. */
  id: z.string().nullable(),
  /** « Aïcha S. », « M. Koffi », « Claire M. », « Bureau de l'association ». */
  name: z.string(),
  /** Prénom seul pour un enfant (« Aïcha »), sinon le nom. */
  shortName: z.string(),
  initials: z.string().min(1).max(3),
  avatarTone: avatarToneSchema,
  /** « Écrit depuis l'école, avec son relais M. Koffi », « Marraine d'Aïcha et Kofi »… */
  subtitle: z.string().nullable(),
});

export type Counterpart = z.infer<typeof counterpartSchema>;

export const messagePreviewSchema = z.object({
  /** Texte remis (version masquée le cas échéant) ; `null` s'il n'est pas montré à l'acteur. */
  body: z.string().nullable(),
  mine: z.boolean(),
  kind: messageKindSchema,
  attachmentCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  status: messageStatusSchema.nullable(),
});

export type MessagePreview = z.infer<typeof messagePreviewSchema>;

export const conversationSummarySchema = z.object({
  id,
  kind: conversationKindSchema,
  access: conversationAccessSchema,
  /** Objet éventuel (« Demande d'appel vidéo avec Aïcha S. »). */
  subject: z.string().nullable(),
  counterpart: counterpartSchema,
  /** Enfant concerné (conversation d'un binôme, ou échange au sujet d'un enfant). */
  childId: z.string().nullable(),
  /** Dernier message visible par l'acteur. */
  lastMessage: messagePreviewSchema.nullable(),
  lastMessageAt: isoDateTime,
  /** Messages des autres, visibles par l'acteur, arrivés après sa dernière lecture. */
  unreadCount: z.number().int().nonnegative(),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** GET /api/conversations : de la plus récente à la plus ancienne. */
export const conversationListSchema = z.object({
  items: z.array(conversationSummarySchema),
  /** Instant de référence de l'API (« hier », « 2 sept. »), horloge figée comprise. */
  now: isoDateTime,
});

export type ConversationList = z.infer<typeof conversationListSchema>;

/** `?kind=PARRAIN_RELAIS,RELAIS_BUREAU` : filtre par type (onglets de RW-Messages). */
export const conversationListQuerySchema = z.object({
  kind: z
    .string()
    .max(200)
    .optional()
    .transform((value) =>
      value === undefined
        ? undefined
        : value
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part !== ""),
    )
    .pipe(z.array(conversationKindSchema).min(1).optional()),
});

export type ConversationListQuery = z.output<typeof conversationListQuerySchema>;

/** GET /api/conversations/:id : en-tête et règles d'écriture de la conversation. */
export const conversationDetailSchema = conversationSummarySchema.extend({
  /** Messages relus par l'association avant d'être remis (conversation avec un enfant). */
  moderated: z.boolean(),
  canWrite: z.boolean(),
  canEncourage: z.boolean(),
});

export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const messageAuthorSchema = z.object({
  kind: personKindSchema,
  name: z.string(),
  initials: z.string().min(1).max(3),
  avatarTone: avatarToneSchema,
});

export type MessageAuthor = z.infer<typeof messageAuthorSchema>;

export const conversationMessageSchema = z.object({
  id,
  kind: messageKindSchema,
  /** `me` : écrit par l'acteur. */
  side: z.enum(["me", "them"]),
  author: messageAuthorSchema,
  /** Texte remis (version masquée quand `masked`) ; `null` s'il n'est pas montré à l'acteur. */
  body: z.string().nullable(),
  masked: z.boolean(),
  attachments: z.array(mediaRefSchema),
  sentFrom: z.enum(["WEB", "MOBILE", "SCHOOL_SESSION"]),
  createdAt: isoDateTime,
  /** Suivi, pour l'auteur (et le relais qui suit un enfant) ; sinon `null`. */
  status: messageStatusSchema.nullable(),
  /** Motif de l'association pour un message retenu ou masqué, montré à son auteur seulement. */
  moderationReason: z.string().nullable(),
  /** Demande d'appel dont parle le message (demande, créneaux proposés, confirmation). */
  call: callCardSchema.nullable(),
});

export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

/** GET /api/conversations/:id/messages : une page, du plus ancien au plus récent. */
export const messagePageSchema = z.object({
  items: z.array(conversationMessageSchema),
  /** Curseur des messages plus anciens, `null` au début de la conversation. */
  nextCursor: z.string().nullable(),
  /** Instant de référence de l'API (séparateurs « Hier », « 14 octobre »). */
  now: isoDateTime,
});

export type MessagePage = z.infer<typeof messagePageSchema>;

export const messagePageQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MESSAGE_PAGE_MAX_SIZE)
    .default(MESSAGE_PAGE_DEFAULT_SIZE),
});

export type MessagePageQuery = z.infer<typeof messagePageQuerySchema>;

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, "Clé d'idempotence invalide");

/** POST /api/conversations/:id/messages. Rejouer la même clé renvoie le même message. */
export const sendMessageSchema = z
  .object({
    body: z.string().trim().max(MESSAGE_BODY_MAX_LENGTH).default(""),
    mediaIds: z.array(id.max(64)).max(MESSAGE_MAX_ATTACHMENTS).default([]),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine((input) => input.body !== "" || input.mediaIds.length > 0, {
    path: ["body"],
    message: "Écrivez un message ou joignez un fichier",
  })
  .refine((input) => new Set(input.mediaIds).size === input.mediaIds.length, {
    path: ["mediaIds"],
    message: "Le même fichier est joint deux fois",
  });

export type SendMessage = z.output<typeof sendMessageSchema>;

/** POST /api/conversations/:id/encouragement (corps facultatif). */
export const sendEncouragementSchema = z
  .object({ idempotencyKey: idempotencyKeySchema.optional() })
  .default({});

export type SendEncouragement = z.infer<typeof sendEncouragementSchema>;

/**
 * POST /api/conversations : ouvre (ou retrouve) une conversation. `counterpartId` : le relais
 * (Relais.id) pour un parrain, le parrain (profil) pour un relais ; inutile avec le bureau.
 */
export const startConversationSchema = z.object({
  kind: startableConversationKindSchema,
  counterpartId: id.max(64).optional(),
});

export type StartConversation = z.infer<typeof startConversationSchema>;

/** Personne à qui l'acteur peut écrire (« Nouveau message »). */
export const contactSchema = z.object({
  kind: startableConversationKindSchema,
  counterpartId: z.string().nullable(),
  name: z.string(),
  initials: z.string().min(1).max(3),
  avatarTone: avatarToneSchema,
  subtitle: z.string().nullable(),
  /** Conversation déjà ouverte avec cette personne. */
  conversationId: z.string().nullable(),
});

export type Contact = z.infer<typeof contactSchema>;

/** GET /api/conversations/contacts. */
export const contactListSchema = z.object({ items: z.array(contactSchema) });

export type ContactList = z.infer<typeof contactListSchema>;

/** GET /api/conversations/unread-count (pastilles de navigation). */
export const unreadCountSchema = z.object({ total: z.number().int().nonnegative() });

export type UnreadCount = z.infer<typeof unreadCountSchema>;

/** Page Messages de chaque rôle (liens des e-mails et de la navigation). */
export function messagesPath(role: Role, conversationId?: string): string {
  const suffix = conversationId ? `/${encodeURIComponent(conversationId)}` : "";
  switch (role) {
    case "parrain":
      return `/parrain/messages${suffix}`;
    case "relais":
      return `/relais/messages${suffix}`;
    case "bureau":
      return "/bureau";
  }
}
