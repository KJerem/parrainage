// Contrats de l'espace parrain « Mes filleuls » (GET /api/parrain/*). Dates en chaînes ISO,
// montants en centimes, moyennes en centièmes : la mise en forme revient au web.
import { z } from "zod";
import { avatarToneSchema } from "./avatar.js";
import { nextCallSchema } from "./calls.js";
import { mediaRefSchema } from "./media.js";

/** Éléments du fil affichés sur l'écran principal. */
export const FEED_PREVIEW_SIZE = 5;
export const FEED_PAGE_DEFAULT_SIZE = 20;
export const FEED_PAGE_MAX_SIZE = 50;

const id = z.string().min(1);
const isoDateTime = z.iso.datetime();
const isoDate = z.iso.date();

export const genderSchema = z.enum(["F", "M"]);

export type Gender = z.infer<typeof genderSchema>;

/** Poste d'envoi : SCHOOL_SESSION → « envoyé depuis l'école ». */
export const sentFromSchema = z.enum(["WEB", "MOBILE", "SCHOOL_SESSION"]);

export type SentFrom = z.infer<typeof sentFromSchema>;

// ─── Sélecteur de filleul ─────────────────────────────────────────────────────

export const filleulSummarySchema = z.object({
  childId: id,
  firstName: z.string(),
  /** Initiale du nom, sans point. */
  lastInitial: z.string(),
  avatarTone: avatarToneSchema,
});

export type FilleulSummary = z.infer<typeof filleulSummarySchema>;

/** GET /api/parrain/filleuls : binômes actifs, du plus ancien au plus récent. */
export const filleulListSchema = z.array(filleulSummarySchema);

export type FilleulList = z.infer<typeof filleulListSchema>;

// ─── Fil : messages de l'enfant et nouvelles du relais ────────────────────────

/** Message de l'enfant au parrain, approuvé (ou masqué en partie) par l'association. */
export const feedMessageItemSchema = z.object({
  type: z.literal("message"),
  id,
  date: isoDateTime,
  conversationId: id,
  sentFrom: sentFromSchema,
  /** Texte transmis : la version masquée quand `masked` est vrai. */
  body: z.string(),
  masked: z.boolean(),
  attachments: z.array(mediaRefSchema),
});

export type FeedMessageItem = z.infer<typeof feedMessageItemSchema>;

/** Nouvelle publiée par le relais. Sans consentement médias de l'enfant, `media` est vide. */
export const feedNewsItemSchema = z.object({
  type: z.literal("news"),
  id,
  date: isoDateTime,
  title: z.string(),
  body: z.string(),
  author: z.object({ displayName: z.string(), city: z.string() }),
  media: z.array(mediaRefSchema),
});

export type FeedNewsItem = z.infer<typeof feedNewsItemSchema>;

export const feedItemSchema = z.discriminatedUnion("type", [
  feedMessageItemSchema,
  feedNewsItemSchema,
]);

export type FeedItem = z.infer<typeof feedItemSchema>;

/** GET /api/parrain/filleuls/:childId/nouvelles : du plus récent au plus ancien. */
export const feedPageSchema = z.object({
  items: z.array(feedItemSchema),
  /** Curseur opaque de la page suivante, `null` en fin de fil. */
  nextCursor: z.string().nullable(),
});

export type FeedPage = z.infer<typeof feedPageSchema>;

export const feedQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(FEED_PAGE_MAX_SIZE).default(FEED_PAGE_DEFAULT_SIZE),
});

export type FeedQuery = z.infer<typeof feedQuerySchema>;

// ─── Résultats scolaires ──────────────────────────────────────────────────────

export const academicPeriodKindSchema = z.enum(["T1", "T2", "T3", "ANNUAL"]);

export type AcademicPeriodKind = z.infer<typeof academicPeriodKindSchema>;

export const resultPointSchema = z.object({
  id,
  /** « 2026-2027 ». */
  schoolYear: z.string(),
  periodKind: academicPeriodKindSchema,
  /** Libellé placé après la classe : « CM2 · 1er trimestre », « CM1 · moyenne annuelle ». */
  periodLabel: z.string(),
  className: z.string(),
  /** Moyenne sur 20, en centièmes (13,4 → 1340). */
  averageX100: z.number().int().nullable(),
});

export type ResultPoint = z.infer<typeof resultPointSchema>;

/** Les deux derniers résultats envoyés aux parrains ; `appreciation` est celle du plus récent. */
export const resultsSummarySchema = z.object({
  previous: resultPointSchema.nullable(),
  current: resultPointSchema.nullable(),
  appreciation: z.string().nullable(),
});

export type ResultsSummary = z.infer<typeof resultsSummarySchema>;

export const bulletinSchema = resultPointSchema.extend({
  rank: z.number().int().positive().nullable(),
  classSize: z.number().int().positive().nullable(),
  appreciation: z.string().nullable(),
  sentAt: isoDateTime.nullable(),
  /** Photos ou PDF du bulletin. */
  media: z.array(mediaRefSchema),
});

export type Bulletin = z.infer<typeof bulletinSchema>;

/** GET /api/parrain/filleuls/:childId/bulletins : du plus récent au plus ancien. */
export const bulletinListSchema = z.object({ items: z.array(bulletinSchema) });

export type BulletinList = z.infer<typeof bulletinListSchema>;

// ─── Versements ───────────────────────────────────────────────────────────────

export const paymentStatusSchema = z.enum(["SCHEDULED", "RECEIVED", "LATE", "FAILED", "CANCELLED"]);

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const monthlyPaymentSchema = z.object({
  id,
  /** Mois prélevé, « 2026-10 ». */
  periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  dueDate: isoDate,
  amountCents: z.number().int(),
  status: paymentStatusSchema,
});

export type MonthlyPayment = z.infer<typeof monthlyPaymentSchema>;

/** Versements du parrain connecté pour ce filleul (jamais ceux d'un co-parrain). */
export const paymentsSummarySchema = z.object({
  /** Année civile de `now`. */
  year: z.number().int(),
  /** Mensualité du binôme. */
  monthlyAmountCents: z.number().int().nonnegative(),
  /** Versements reçus cette année pour cet enfant, dons ponctuels compris. */
  paidThisYearCents: z.number().int().nonnegative(),
  /** Trois dernières mensualités échues, de la plus récente à la plus ancienne. */
  lastMonths: z.array(monthlyPaymentSchema),
});

export type PaymentsSummary = z.infer<typeof paymentsSummarySchema>;

// ─── Écran principal ──────────────────────────────────────────────────────────

export const filleulProfileSchema = z.object({
  id,
  firstName: z.string(),
  lastInitial: z.string(),
  gender: genderSchema,
  avatarTone: avatarToneSchema,
  /** Âge à `now` (la date de naissance n'est jamais transmise au parrain). */
  age: z.number().int().nonnegative(),
  className: z.string(),
  schoolFullName: z.string().nullable(),
  city: z.string(),
  country: z.string(),
  relaisDisplayName: z.string(),
  /** Début du binôme, « 2023-03-01 ». */
  sponsoredSince: isoDate,
  /** `null` sans photo ou sans consentement médias : afficher les initiales. */
  photo: mediaRefSchema.nullable(),
});

export type FilleulProfile = z.infer<typeof filleulProfileSchema>;

/** GET /api/parrain/filleuls/:childId. */
export const filleulDashboardSchema = z.object({
  /** Instant de référence du serveur (APP_NOW en démo) : « hier », « il y a 2 j »… */
  now: isoDateTime,
  /** Conversation du binôme (« Écrire à Aïcha »). */
  conversationId: id.nullable(),
  child: filleulProfileSchema,
  /** Les FEED_PREVIEW_SIZE éléments les plus récents du fil. */
  feed: z.array(feedItemSchema),
  results: resultsSummarySchema,
  payments: paymentsSummarySchema,
  /** Prochain appel vidéo avec ce filleul, ou la demande en cours. */
  nextCall: nextCallSchema.nullable(),
});

export type FilleulDashboard = z.infer<typeof filleulDashboardSchema>;
