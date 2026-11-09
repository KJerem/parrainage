// Contrats de l'espace bureau hors modération : vue d'ensemble, binômes (B-Binomes), parrains,
// dossier d'un enfant. Dates en ISO, montants en centimes.
import { z } from "zod";
import { avatarToneSchema } from "./avatar.js";
import { mediaRefSchema } from "./media.js";
import { genderSchema } from "./parrain.js";
import { MONTHLY_AMOUNT_MAX_CENTS, MONTHLY_AMOUNT_MIN_CENTS } from "./payments.js";
import { childFileStatusSchema } from "./relais.js";

const id = z.string().min(1);
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime();

// ─── Santé des binômes (plan §8) ─────────────────────────────────────────────

/** Jours sans activité du parrain, sans nouvelle ni échange : seuil des alertes. */
export const SPONSORSHIP_ALERT_DAYS = 60;
/** Versements en retard qui font d'un parrain un « parrain inactif ». */
export const INACTIVE_PARRAIN_LATE_PAYMENTS = 2;

export const sponsorshipHealths = ["ACTIVE", "TO_FOLLOW_UP", "INACTIVE_PARRAIN"] as const;

export const sponsorshipHealthSchema = z.enum(sponsorshipHealths);

export type SponsorshipHealth = z.infer<typeof sponsorshipHealthSchema>;

/** Filtre « État » de B-Binomes, porté par l'adresse (`?etat=a-relancer`). */
export const sponsorshipHealthFilters = {
  actif: "ACTIVE",
  "a-relancer": "TO_FOLLOW_UP",
  "parrain-inactif": "INACTIVE_PARRAIN",
} as const satisfies Record<string, SponsorshipHealth>;

export type SponsorshipHealthFilter = keyof typeof sponsorshipHealthFilters;

const ref = z.object({ id, firstName: z.string(), lastInitial: z.string() });

const relaisRef = z.object({ id, displayName: z.string(), city: z.string() });

export const bureauSponsorshipSchema = z.object({
  id,
  child: ref,
  parrain: z.object({ id, displayName: z.string() }),
  relais: relaisRef,
  startDate: isoDate,
  monthlyAmountCents: z.number().int().nonnegative(),
  /** Dernière nouvelle de l'enfant ou dernier message remis dans le binôme. */
  lastExchangeAt: isoDateTime.nullable(),
  /** Mensualités en retard ou en échec. */
  latePayments: z.number().int().nonnegative(),
  health: sponsorshipHealthSchema,
});

export type BureauSponsorship = z.infer<typeof bureauSponsorshipSchema>;

/** GET /api/bureau/sponsorships?relais=&etat= : « Tous les binômes ». */
export const bureauSponsorshipsSchema = z.object({
  now: isoDateTime,
  items: z.array(bureauSponsorshipSchema),
  /** Options du filtre « Relais ». */
  relais: z.array(relaisRef),
});

export type BureauSponsorships = z.infer<typeof bureauSponsorshipsSchema>;

export const bureauSponsorshipsQuerySchema = z.object({
  relais: id.max(64).optional(),
  etat: z.enum(["actif", "a-relancer", "parrain-inactif"]).optional(),
});

export type BureauSponsorshipsQuery = z.infer<typeof bureauSponsorshipsQuerySchema>;

// ─── Créer un binôme ─────────────────────────────────────────────────────────

/** Enfant dont le dossier est envoyé ou validé, sans binôme actif. */
export const waitingChildSchema = z.object({
  id,
  firstName: z.string(),
  lastInitial: z.string(),
  gender: genderSchema,
  age: z.number().int().nonnegative(),
  className: z.string(),
  schoolName: z.string().nullable(),
  city: z.string(),
  avatarTone: avatarToneSchema,
  /** `null` sans photo ou sans consentement médias : les initiales. */
  photo: mediaRefSchema.nullable(),
  fileStatus: childFileStatusSchema,
  /** Relais qui a ouvert le dossier, « M. Koffi ». */
  addedBy: z.string(),
});

export type WaitingChild = z.infer<typeof waitingChildSchema>;

/** GET /api/bureau/sponsorships/new?enfant= : l'enfant à parrainer et les autres en attente. */
export const newSponsorshipSchema = z.object({
  now: isoDateTime,
  child: waitingChildSchema.nullable(),
  others: z.array(ref),
  defaultMonthlyCents: z.number().int(),
  /** Premier jour du mois suivant. */
  defaultStartDate: isoDate,
});

export type NewSponsorship = z.infer<typeof newSponsorshipSchema>;

export const newSponsorshipQuerySchema = z.object({ enfant: id.max(64).optional() });

export const PARRAIN_SEARCH_MAX_LENGTH = 60;
export const PARRAIN_CANDIDATES_LIMIT = 6;

export const parrainCandidateSchema = z.object({
  id,
  displayName: z.string(),
  city: z.string(),
  gender: genderSchema,
  wishes: z.string().nullable(),
  /** Filleuls actuels, « Yao D. ». */
  filleuls: z.array(z.string()),
});

export type ParrainCandidate = z.infer<typeof parrainCandidateSchema>;

/** GET /api/bureau/parrains/candidates?q=&enfant= : parrains à proposer (jamais un inactif). */
export const parrainCandidatesSchema = z.object({ items: z.array(parrainCandidateSchema) });

export type ParrainCandidates = z.infer<typeof parrainCandidatesSchema>;

export const parrainCandidatesQuerySchema = z.object({
  q: z.string().trim().max(PARRAIN_SEARCH_MAX_LENGTH).default(""),
  enfant: id.max(64).optional(),
});

export type ParrainCandidatesQuery = z.output<typeof parrainCandidatesQuerySchema>;

/** POST /api/bureau/sponsorships : « Créer et prévenir parrain et relais ». */
export const createSponsorshipSchema = z.object({
  childId: id.max(64),
  parrainId: id.max(64),
  monthlyAmountCents: z
    .number()
    .int()
    .min(MONTHLY_AMOUNT_MIN_CENTS, "La mensualité va de 10 € à 500 €")
    .max(MONTHLY_AMOUNT_MAX_CENTS, "La mensualité va de 10 € à 500 €")
    .multipleOf(100, "Indiquez un montant en euros, sans centimes"),
  startDate: isoDate,
});

export type CreateSponsorship = z.infer<typeof createSponsorshipSchema>;

export const createdSponsorshipSchema = z.object({
  id,
  childId: id,
  parrainId: id,
  conversationId: id,
});

export type CreatedSponsorship = z.infer<typeof createdSponsorshipSchema>;

// ─── Vue d'ensemble ──────────────────────────────────────────────────────────

export const watchItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sponsorship"),
    id,
    child: ref,
    parrainName: z.string(),
    relais: relaisRef,
    health: z.enum(["TO_FOLLOW_UP", "INACTIVE_PARRAIN"]),
    /** Jours sans nouvelle ni échange. */
    days: z.number().int().nonnegative(),
  }),
  z.object({ kind: z.literal("waiting"), id, child: ref, relais: relaisRef }),
]);

export type WatchItem = z.infer<typeof watchItemSchema>;

/** Binômes à surveiller affichés sur la vue d'ensemble. */
export const WATCH_LIST_SIZE = 6;

/** GET /api/bureau/overview : indicateurs et binômes à surveiller (Bureau.dc.html). */
export const bureauOverviewSchema = z.object({
  now: isoDateTime,
  activeSponsorships: z.number().int().nonnegative(),
  /** Pays distincts des parrains de ces binômes. */
  countries: z.number().int().nonnegative(),
  relaisCount: z.number().int().nonnegative(),
  /** Enfants parrainés sans nouvelle depuis 60 jours ou plus. */
  staleChildren: z.number().int().nonnegative(),
  collectedThisMonthCents: z.number().int().nonnegative(),
  latePayments: z.number().int().nonnegative(),
  watch: z.object({ items: z.array(watchItemSchema), total: z.number().int().nonnegative() }),
});

export type BureauOverview = z.infer<typeof bureauOverviewSchema>;

// ─── Parrains ────────────────────────────────────────────────────────────────

export const parrainStatuses = ["WITH_CHILD", "WAITING", "INACTIVE", "INVITED"] as const;

export const parrainStatusSchema = z.enum(parrainStatuses);

export type ParrainStatus = z.infer<typeof parrainStatusSchema>;

export const bureauParrainSchema = z.object({
  id,
  displayName: z.string(),
  /** Nom complet (reçus fiscaux). */
  fullName: z.string(),
  email: z.string(),
  gender: genderSchema,
  city: z.string(),
  country: z.string(),
  joinedAt: isoDateTime,
  /** `null` : invité, jamais connecté. */
  lastActiveAt: isoDateTime.nullable(),
  filleuls: z.array(z.string()),
  monthlyTotalCents: z.number().int().nonnegative(),
  latePayments: z.number().int().nonnegative(),
  wishes: z.string().nullable(),
  status: parrainStatusSchema,
});

export type BureauParrain = z.infer<typeof bureauParrainSchema>;

/** GET /api/bureau/parrains?q= : par ordre alphabétique. */
export const bureauParrainsSchema = z.object({
  now: isoDateTime,
  items: z.array(bureauParrainSchema),
});

export type BureauParrains = z.infer<typeof bureauParrainsSchema>;

export const bureauParrainsQuerySchema = z.object({
  q: z.string().trim().max(PARRAIN_SEARCH_MAX_LENGTH).default(""),
});

const requiredText = (label: string, max: number) => z.string().trim().min(1, label).max(max);

/** POST /api/bureau/parrains : compte créé, invitation envoyée par lien de connexion. */
export const inviteParrainSchema = z.object({
  firstName: requiredText("Indiquez le prénom", 60),
  lastName: requiredText("Indiquez le nom", 80),
  email: z.email("Adresse e-mail invalide").max(254),
  gender: genderSchema,
  city: requiredText("Indiquez la ville", 80),
  country: z.string().trim().min(1).max(80).default("France"),
  addressLine: z.string().trim().max(160).default(""),
  postalCode: z.string().trim().max(16).default(""),
  wishes: z.string().trim().max(200).default(""),
});

export type InviteParrain = z.output<typeof inviteParrainSchema>;

// ─── Dossier d'un enfant ─────────────────────────────────────────────────────

export const bureauChildSchema = z.object({
  now: isoDateTime,
  id,
  firstName: z.string(),
  lastInitial: z.string(),
  gender: genderSchema,
  birthDate: isoDate,
  age: z.number().int().nonnegative(),
  className: z.string(),
  schoolYear: z.string(),
  schoolName: z.string().nullable(),
  district: z.string(),
  avatarTone: avatarToneSchema,
  photo: mediaRefSchema.nullable(),
  relais: relaisRef,
  addedBy: z.string(),
  guardianName: z.string(),
  guardianPhone: z.string(),
  consentSponsorship: z.boolean(),
  consentMedia: z.boolean(),
  /** Autorisation signée, ouverte par /api/media/:id. */
  consentDocument: mediaRefSchema.nullable(),
  fileStatus: childFileStatusSchema,
  submittedAt: isoDateTime.nullable(),
  validatedAt: isoDateTime.nullable(),
  lastNewsAt: isoDateTime.nullable(),
  sponsorships: z.array(
    z.object({
      id,
      parrain: z.object({ id, displayName: z.string() }),
      startDate: isoDate,
      monthlyAmountCents: z.number().int().nonnegative(),
    }),
  ),
});

export type BureauChild = z.infer<typeof bureauChildSchema>;
