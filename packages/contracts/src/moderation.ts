// Contrats de la modération par le bureau (GET/POST /api/moderation…) et règles d'affichage
// partagées : libellés, alertes, version masquée. Dates en chaînes ISO.
import { z } from "zod";
import {
  type AlertSpan,
  alertSpanSchema,
  type AlertType,
  alertTypeLabels,
  alertTypeSchema,
} from "./detector.js";
import { type MediaKind, mediaKindSchema, mediaRefSchema } from "./media.js";
import { MESSAGE_BODY_MAX_LENGTH } from "./messaging.js";

/** Texte qui remplace un passage retiré par l'association. */
export const MASKED_PLACEHOLDER = "[masqué par l'association]";

export const MODERATION_QUEUE_PREVIEW_SIZE = 5;
export const MODERATION_QUEUE_MAX_SIZE = 100;

const id = z.string().min(1);
const isoDateTime = z.iso.datetime();

// ─── Motifs, signalements, filtres ───────────────────────────────────────────

export const moderationReasons = [
  "OFF_PLATFORM_CONTACT",
  "INAPPROPRIATE_CONTENT",
  "THIRD_PARTY_PHOTO",
  "OTHER",
] as const;

export const moderationReasonSchema = z.enum(moderationReasons);

export type ModerationReason = z.infer<typeof moderationReasonSchema>;

export const moderationReasonLabels: Readonly<Record<ModerationReason, string>> = {
  OFF_PLATFORM_CONTACT: "Contact direct hors plateforme",
  INAPPROPRIATE_CONTENT: "Contenu inadapté",
  THIRD_PARTY_PHOTO: "Photo d'un tiers",
  OTHER: "Autre",
};

export const manualFlags = [
  "OTHER_CHILD_FACE",
  "THIRD_PARTY_PHOTO",
  "INAPPROPRIATE_CONTENT",
  "DIRECT_CONTACT",
  "OTHER",
] as const;

export const manualFlagSchema = z.enum(manualFlags);

export type ManualFlag = z.infer<typeof manualFlagSchema>;

export const manualFlagLabels: Readonly<Record<ManualFlag, string>> = {
  OTHER_CHILD_FACE: "Visage d'un autre enfant",
  THIRD_PARTY_PHOTO: "Photo d'un tiers",
  INAPPROPRIATE_CONTENT: "Contenu inadapté",
  DIRECT_CONTACT: "Contact direct",
  OTHER: "Autre signalement",
};

export const moderationFilters = ["tous", "enfant", "parrain", "signales"] as const;

export const moderationFilterSchema = z.enum(moderationFilters);

export type ModerationFilter = z.infer<typeof moderationFilterSchema>;

export const moderationFilterLabels: Readonly<Record<ModerationFilter, string>> = {
  tous: "Tous",
  enfant: "Enfant → parrain",
  parrain: "Parrain → enfant",
  signales: "Signalés",
};

/** `?filtre=` : une valeur inconnue revient à « Tous » plutôt que de casser la page. */
export const moderationQueueQuerySchema = z.object({
  filtre: moderationFilterSchema.catch("tous").default("tous"),
});

export type ModerationQueueQuery = z.infer<typeof moderationQueueQuerySchema>;

// ─── Lecture ─────────────────────────────────────────────────────────────────

const authorKindSchema = z.enum(["child", "parrain"]);

const attachmentSummarySchema = z.object({
  kind: mediaKindSchema,
  label: z.string().nullable(),
  durationSec: z.number().int().nonnegative().nullable(),
});

export type AttachmentSummary = z.infer<typeof attachmentSummarySchema>;

export const moderationQueueItemSchema = z.object({
  id,
  authorKind: authorKindSchema,
  /** « Paul D. », « Aïcha S. ». */
  from: z.string(),
  /** « Kofi A. », « Claire M. ». */
  to: z.string(),
  /** Le message a un texte (et non seulement des pièces jointes). */
  hasText: z.boolean(),
  attachments: z.array(attachmentSummarySchema),
  alertTypes: z.array(alertTypeSchema),
  manualFlags: z.array(manualFlagSchema),
  createdAt: isoDateTime,
});

export type ModerationQueueItem = z.infer<typeof moderationQueueItemSchema>;

/** GET /api/moderation/queue : messages avec alerte d'abord, puis du plus ancien au plus récent. */
export const moderationQueueSchema = z.object({
  items: z.array(moderationQueueItemSchema),
  /** Nombre total de messages du filtre, au-delà des `items` renvoyés. */
  total: z.number().int().nonnegative(),
  now: isoDateTime,
});

export type ModerationQueue = z.infer<typeof moderationQueueSchema>;

/** GET /api/moderation/summary : indicateurs de la file entière (sans filtre). */
export const moderationSummarySchema = z.object({
  pending: z.number().int().nonnegative(),
  /** Messages en attente avec au moins une pièce jointe. */
  withMedia: z.number().int().nonnegative(),
  oldestAt: isoDateTime.nullable(),
  now: isoDateTime,
});

export type ModerationSummary = z.infer<typeof moderationSummarySchema>;

export const moderationDetailSchema = z.object({
  id,
  moderationStatus: z.enum(["NOT_REQUIRED", "PENDING", "APPROVED", "HELD", "MASKED"]),
  authorKind: authorKindSchema,
  from: z.string(),
  to: z.string(),
  /** Texte d'origine, jamais montré au destinataire avant décision. */
  body: z.string(),
  /** Version transmise, si le message a été masqué. */
  redactedBody: z.string().nullable(),
  /** Passages repérés, en positions dans `body`. */
  spans: z.array(alertSpanSchema),
  alertTypes: z.array(alertTypeSchema),
  manualFlags: z.array(manualFlagSchema),
  attachments: z.array(mediaRefSchema),
  /** Motif enregistré (libellé) d'un message déjà traité. */
  moderationReason: z.string().nullable(),
  reviewedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  context: z.object({
    /** « Parrain depuis 2024 », « Marraine depuis 2023 ». */
    sponsorSince: z.string().nullable(),
    /** « M. Koffi ». */
    relaisName: z.string().nullable(),
  }),
  history: z.object({
    messageCount: z.number().int().nonnegative(),
    heldCount: z.number().int().nonnegative(),
    lastHeldAt: isoDateTime.nullable(),
    lastNewsAt: isoDateTime.nullable(),
  }),
  now: isoDateTime,
});

export type ModerationDetail = z.infer<typeof moderationDetailSchema>;

// ─── Décisions ───────────────────────────────────────────────────────────────

const reasonSchema = moderationReasonSchema;

/** POST /api/moderation/messages/:id/decision. Masquer et retenir exigent un motif. */
export const moderationDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("APPROVE") }),
  z.object({
    decision: z.literal("MASK"),
    reason: reasonSchema,
    redactedBody: z.string().trim().max(MESSAGE_BODY_MAX_LENGTH),
    removedMediaIds: z.array(id.max(64)).max(20).default([]),
  }),
  z.object({ decision: z.literal("HOLD"), reason: reasonSchema }),
]);

export type ModerationDecision = z.output<typeof moderationDecisionSchema>;

export const moderationDecisionResultSchema = z.object({
  id,
  moderationStatus: z.enum(["APPROVED", "HELD", "MASKED"]),
  /** Message suivant de la file, `null` si elle est vide. */
  nextId: z.string().nullable(),
});

export type ModerationDecisionResult = z.infer<typeof moderationDecisionResultSchema>;

/** POST /api/moderation/messages/:id/flag : pose ou retire un signalement. */
export const moderationFlagSchema = z.object({
  flag: manualFlagSchema,
  active: z.boolean(),
});

export type ModerationFlag = z.infer<typeof moderationFlagSchema>;

export const moderationFlagResultSchema = z.object({
  id,
  manualFlags: z.array(manualFlagSchema),
});

export type ModerationFlagResult = z.infer<typeof moderationFlagResultSchema>;

// ─── Règles d'affichage ──────────────────────────────────────────────────────

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** « bulletin T1 » si la légende indique le trimestre, sinon « bulletin ». */
function bulletinLabel(label: string | null): string {
  const term = label?.match(/\bT[1-3]\b/)?.[0];
  return term ? `bulletin ${term}` : "bulletin";
}

function attachmentLabels(attachments: readonly AttachmentSummary[]): string[] {
  const group = (kind: MediaKind) => attachments.filter((a) => a.kind === kind);
  const plural = (count: number, one: string, many: string) =>
    count === 1 ? one : `${count} ${many}`;
  const photos = group("PHOTO");
  const videos = group("VIDEO");
  const bulletins = group("BULLETIN");
  const documents = attachments.filter(
    (a) => a.kind !== "PHOTO" && a.kind !== "VIDEO" && a.kind !== "BULLETIN",
  );
  const video = videos[0];
  return [
    ...(bulletins.length > 0
      ? [plural(bulletins.length, bulletinLabel(bulletins[0]?.label ?? null), "bulletins")]
      : []),
    ...(photos.length > 0 ? [plural(photos.length, "photo", "photos")] : []),
    ...(video
      ? [
          videos.length === 1 && video.durationSec !== null
            ? `vidéo ${clock(video.durationSec)}`
            : plural(videos.length, "vidéo", "vidéos"),
        ]
      : []),
    ...(documents.length > 0 ? [plural(documents.length, "document", "documents")] : []),
  ];
}

/** Contenu d'un message : « Texte + bulletin T1 », « Vidéo 0:35 », « Texte ». */
export function moderationContentLabel(
  message: Pick<ModerationQueueItem, "hasText" | "attachments">,
): string {
  const parts = [...(message.hasText ? ["texte"] : []), ...attachmentLabels(message.attachments)];
  return capitalize(parts.join(" + ") || "message vide");
}

const CONTACT_ALERTS: readonly AlertType[] = ["PHONE", "EMAIL", "URL", "SOCIAL", "ADDRESS"];

export type ModerationAlertTone = "success" | "warning" | "danger";

export interface ModerationAlertSummary {
  /** « Coordonnées personnelles », « Visage d'un autre enfant », « Aucune ». */
  label: string;
  /** Version courte, pour la file (« Coordonnées »). */
  shortLabel: string;
  tone: ModerationAlertTone;
  /** Quelque chose à signaler (sinon la file affiche le contenu du message). */
  flagged: boolean;
}

/**
 * Alerte principale d'un message : ce qui expose l'enfant (coordonnées, argent, rendez-vous) passe
 * avant les signalements manuels.
 */
export function moderationAlert(
  alerts: readonly AlertType[],
  flags: readonly ManualFlag[],
): ModerationAlertSummary {
  if (alerts.some((type) => CONTACT_ALERTS.includes(type))) {
    return {
      label: "Coordonnées personnelles",
      shortLabel: "Coordonnées",
      tone: "danger",
      flagged: true,
    };
  }
  const other = alerts[0];
  if (other) {
    const label = alertTypeLabels[other];
    return { label, shortLabel: label, tone: "danger", flagged: true };
  }
  const flag = flags[0];
  if (flag) {
    const label = manualFlagLabels[flag];
    return { label, shortLabel: label, tone: "warning", flagged: true };
  }
  return { label: "Aucune", shortLabel: "Aucune", tone: "success", flagged: false };
}

/** « Alerte automatique : numéro de téléphone » ; `null` si le détecteur n'a rien repéré. */
export function automaticAlertLabel(alerts: readonly AlertType[]): string | null {
  if (alerts.length === 0) {
    return null;
  }
  const labels = alerts.map((type) => alertTypeLabels[type].toLowerCase());
  return `Alerte automatique : ${labels.join(", ")}`;
}

/** Motif proposé d'emblée : celui qui correspond à l'alerte du message. */
export function suggestedReason(
  alerts: readonly AlertType[],
  flags: readonly ManualFlag[],
): ModerationReason {
  if (alerts.length > 0 || flags.includes("DIRECT_CONTACT")) {
    return "OFF_PLATFORM_CONTACT";
  }
  if (flags.includes("OTHER_CHILD_FACE") || flags.includes("THIRD_PARTY_PHOTO")) {
    return "THIRD_PARTY_PHOTO";
  }
  return flags.includes("INAPPROPRIATE_CONTENT") ? "INAPPROPRIATE_CONTENT" : "OFF_PLATFORM_CONTACT";
}

const RULE_CONTACT =
  "Aucun échange direct hors plateforme entre parrain et enfant (téléphone, réseaux sociaux, adresse).";
const RULE_MONEY = "Aucun échange d'argent ni de cadeau en dehors de l'association.";
const RULE_MEETING =
  "Aucune rencontre entre parrain et enfant en dehors du cadre de l'association.";
const RULE_IMAGE = "Aucune image d'un autre enfant ou d'un tiers sans son autorisation.";
const RULE_CONTENT = "Les échanges restent bienveillants et adaptés à l'âge de l'enfant.";

/** Règle de la charte concernée par les alertes du message. */
export function charterRule(alerts: readonly AlertType[], flags: readonly ManualFlag[]): string {
  if (alerts.some((type) => CONTACT_ALERTS.includes(type)) || flags.includes("DIRECT_CONTACT")) {
    return RULE_CONTACT;
  }
  if (alerts.includes("MONEY")) {
    return RULE_MONEY;
  }
  if (alerts.includes("MEETING")) {
    return RULE_MEETING;
  }
  if (flags.includes("OTHER_CHILD_FACE") || flags.includes("THIRD_PARTY_PHOTO")) {
    return RULE_IMAGE;
  }
  return flags.length > 0 ? RULE_CONTENT : RULE_CONTACT;
}

/** Règle de la charte correspondant au motif retenu (e-mail à l'auteur). */
export function charterRuleForReason(reason: ModerationReason): string {
  switch (reason) {
    case "OFF_PLATFORM_CONTACT":
      return RULE_CONTACT;
    case "THIRD_PARTY_PHOTO":
      return RULE_IMAGE;
    default:
      return RULE_CONTENT;
  }
}

/** Passages triés et fusionnés (deux alertes peuvent se chevaucher), bornés au texte. */
function mergedSpans(text: string, spans: readonly AlertSpan[]): AlertSpan[] {
  const sorted = spans
    .map((span) => ({
      ...span,
      start: Math.max(0, span.start),
      end: Math.min(text.length, span.end),
    }))
    .filter((span) => span.start < span.end)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: AlertSpan[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

export interface AlertSegment {
  text: string;
  /** Type de l'alerte pour un passage à surligner ; `null` pour le texte ordinaire. */
  alert: AlertType | null;
}

/** Découpe un texte pour le rendu : texte ordinaire et passages à surligner, dans l'ordre. */
export function splitByAlerts(text: string, spans: readonly AlertSpan[]): AlertSegment[] {
  const segments: AlertSegment[] = [];
  let position = 0;
  for (const span of mergedSpans(text, spans)) {
    if (span.start > position) {
      segments.push({ text: text.slice(position, span.start), alert: null });
    }
    segments.push({ text: text.slice(span.start, span.end), alert: span.type });
    position = span.end;
  }
  if (position < text.length) {
    segments.push({ text: text.slice(position), alert: null });
  }
  return segments;
}

/** Version masquée proposée : chaque passage repéré remplacé par « [masqué par l'association] ». */
export function maskAlerts(text: string, spans: readonly AlertSpan[]): string {
  return splitByAlerts(text, spans)
    .map((segment) => (segment.alert === null ? segment.text : MASKED_PLACEHOLDER))
    .join("");
}
