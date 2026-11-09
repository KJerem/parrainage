// Contrats de P-Versements (GET /api/parrain/payments et reçus fiscaux). Les versements sont
// simulés : aucune coordonnée bancaire n'est demandée ni gardée. Montants en centimes.
import { z } from "zod";
import { idempotencyKeySchema } from "./messaging.js";
import { paymentStatusSchema } from "./parrain.js";

const id = z.string().min(1);
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime();
const periodKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const paymentKindSchema = z.enum(["MONTHLY", "ONE_OFF"]);

export type PaymentKind = z.infer<typeof paymentKindSchema>;

export const paymentMethodSchema = z.enum(["SEPA_DEBIT", "CARD", "TRANSFER", "CHEQUE"]);

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Moyens proposés au parrain pour ses mensualités. */
export const monthlyPaymentMethods = ["SEPA_DEBIT", "CARD"] as const;

export const monthlyPaymentMethodSchema = z.enum(monthlyPaymentMethods);

export type MonthlyPaymentMethod = z.infer<typeof monthlyPaymentMethodSchema>;

export const MONTHLY_AMOUNT_MIN_CENTS = 1000;
export const MONTHLY_AMOUNT_MAX_CENTS = 50000;
export const monthlyAmountPresetsCents = [2500, 3000, 5000] as const;

export const DONATION_MIN_CENTS = 500;
export const DONATION_MAX_CENTS = 100000;
export const donationPresetsCents = [2000, 4000, 8000] as const;
export const DONATION_NOTE_MAX_LENGTH = 40;

/** Jour du prélèvement : 1 à 28, présent dans tous les mois. */
export const DEBIT_DAY_MAX = 28;

const euros = (cents: number) => `${cents / 100} €`;

/** Un montant en euros entiers, entre deux bornes. */
const wholeEuros = (min: number, max: number, what: string) =>
  z
    .number()
    .int()
    .min(min, `${what} va de ${euros(min)} à ${euros(max)}`)
    .max(max, `${what} va de ${euros(min)} à ${euros(max)}`)
    .multipleOf(100, "Indiquez un montant en euros, sans centimes");

/** Libellé d'un don ponctuel : « Don ponctuel · rentrée ». */
export const donationLabel = (note: string): string =>
  note.trim() === "" ? "Don ponctuel" : `Don ponctuel · ${note.trim()}`;

/** Reçu fiscal d'une année, téléchargé tel quel (PDF). */
export const receiptPath = (year: number): string => `/api/parrain/receipts/${year}`;

export const paymentHistoryItemSchema = z.object({
  id,
  /** Date du prélèvement ou du don. */
  date: isoDate,
  child: z.object({ id, firstName: z.string(), lastInitial: z.string() }).nullable(),
  kind: paymentKindSchema,
  amountCents: z.number().int().nonnegative(),
  method: paymentMethodSchema,
  /** Don ponctuel : « Don ponctuel · rentrée ». */
  label: z.string().nullable(),
  status: paymentStatusSchema,
});

export type PaymentHistoryItem = z.infer<typeof paymentHistoryItemSchema>;

export const fiscalReceiptSummarySchema = z.object({
  year: z.number().int(),
  amountCents: z.number().int().positive(),
  /** `null` tant que le reçu n'a jamais été téléchargé : le numéro est attribué à l'émission. */
  number: z.string().nullable(),
});

export type FiscalReceiptSummary = z.infer<typeof fiscalReceiptSummarySchema>;

/** GET /api/parrain/payments?annee= : P-Versements du parrain connecté (jamais d'un co-parrain). */
export const parrainPaymentsSchema = z.object({
  now: isoDateTime,
  /** Année civile en cours. */
  year: z.number().int(),
  monthly: z.object({
    /** Somme des mensualités des binômes actifs. */
    totalCents: z.number().int().nonnegative(),
    method: paymentMethodSchema,
    debitDay: z.number().int().min(1).max(DEBIT_DAY_MAX),
    filleuls: z.array(
      z.object({
        childId: id,
        firstName: z.string(),
        lastInitial: z.string(),
        amountCents: z.number().int().nonnegative(),
      }),
    ),
    /** Prochain prélèvement programmé, s'il est déjà connu. */
    nextDebitDate: isoDate.nullable(),
  }),
  paidThisYear: z.object({
    amountCents: z.number().int().nonnegative(),
    /** Dates de prélèvement mensuel distinctes (dons ponctuels exclus). */
    debitCount: z.number().int().nonnegative(),
    /** Versements en retard ou en échec cette année. */
    incidentCount: z.number().int().nonnegative(),
  }),
  taxReduction: z.object({
    ratePercent: z.number().int().min(0).max(100),
    /** Versé cette année × taux. */
    estimatedCents: z.number().int().nonnegative(),
  }),
  history: z.object({
    /** Année affichée (`?annee=`, l'année en cours par défaut). */
    year: z.number().int(),
    /** Années qui ont des versements, de la plus récente à la plus ancienne. */
    years: z.array(z.number().int()),
    /** Du plus récent au plus ancien. */
    items: z.array(paymentHistoryItemSchema),
  }),
  receipts: z.object({
    /** Années closes avec des versements reçus, de la plus récente à la plus ancienne. */
    items: z.array(fiscalReceiptSummarySchema),
    /** Année en cours, si elle a déjà des versements : « Le reçu 2026 sera disponible en janvier ». */
    pendingYear: z.number().int().nullable(),
    /** Identité imprimée sur les reçus (nom complet et adresse). */
    holder: z.object({ name: z.string(), address: z.string().nullable() }),
  }),
});

export type ParrainPayments = z.infer<typeof parrainPaymentsSchema>;

export const parrainPaymentsQuerySchema = z.object({
  annee: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type ParrainPaymentsQuery = z.infer<typeof parrainPaymentsQuerySchema>;

/** POST /api/parrain/payments/monthly-amount : à partir du prochain prélèvement. */
export const updateMonthlyAmountSchema = z.object({
  childId: id.max(64),
  amountCents: wholeEuros(MONTHLY_AMOUNT_MIN_CENTS, MONTHLY_AMOUNT_MAX_CENTS, "La mensualité"),
});

export type UpdateMonthlyAmount = z.infer<typeof updateMonthlyAmountSchema>;

export const monthlyAmountChangeSchema = z.object({
  childId: id,
  amountCents: z.number().int(),
  /** Premier mois prélevé au nouveau montant, « 2026-11 ». */
  effectivePeriodKey: periodKey,
});

export type MonthlyAmountChange = z.infer<typeof monthlyAmountChangeSchema>;

/** PUT /api/parrain/payments/method : moyen et jour des prochains prélèvements. */
export const updatePaymentMethodSchema = z.object({
  method: monthlyPaymentMethodSchema,
  debitDay: z
    .number()
    .int()
    .min(1, `Choisissez un jour entre 1 et ${DEBIT_DAY_MAX}`)
    .max(DEBIT_DAY_MAX, `Choisissez un jour entre 1 et ${DEBIT_DAY_MAX}`),
});

export type UpdatePaymentMethod = z.infer<typeof updatePaymentMethodSchema>;

export const paymentMethodSettingsSchema = updatePaymentMethodSchema;

/** POST /api/parrain/payments/donations : don ponctuel simulé, reçu aussitôt. */
export const createDonationSchema = z.object({
  childId: id.max(64),
  amountCents: wholeEuros(DONATION_MIN_CENTS, DONATION_MAX_CENTS, "Le don"),
  /** Complément du libellé : « rentrée » → « Don ponctuel · rentrée ». */
  note: z.string().trim().max(DONATION_NOTE_MAX_LENGTH).default(""),
  idempotencyKey: idempotencyKeySchema,
});

export type CreateDonation = z.output<typeof createDonationSchema>;
