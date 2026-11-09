import type { ParrainPayments } from "@parrainage/contracts";
import type { PaymentKind, PaymentMethod, PaymentStatus } from "../generated/prisma/enums.js";
import { nextDebitDate } from "./monthly-payments.js";

export interface OverviewPayment {
  id: string;
  child: { id: string; firstName: string; lastInitial: string } | null;
  sponsorshipId: string | null;
  kind: PaymentKind;
  status: PaymentStatus;
  amountCents: number;
  method: PaymentMethod;
  label: string | null;
  dueDate: Date;
  paidAt: Date | null;
}

export interface OverviewProfile {
  firstName: string;
  lastInitial: string;
  lastName: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string;
  country: string;
  debitDay: number;
  paymentMethod: PaymentMethod;
}

export interface OverviewInput {
  at: Date;
  ratePercent: number;
  /** `?annee=` ; l'année en cours sinon. */
  selectedYear?: number | undefined;
  profile: OverviewProfile;
  /** Binômes actifs du parrain. */
  sponsorships: readonly {
    id: string;
    childId: string;
    firstName: string;
    lastInitial: string;
    monthlyAmountCents: number;
  }[];
  /** Tous les versements du parrain (jamais ceux d'un co-parrain). */
  payments: readonly OverviewPayment[];
  /** Reçus déjà émis : montant et numéro figés. */
  receipts: readonly { year: number; number: string; amountCents: number }[];
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const yearOf = (date: Date) => date.getUTCFullYear();

/** Numéro d'un reçu : année et rang d'émission dans l'année, « 2025-00012 ». */
export const receiptNumber = (year: number, sequence: number): string =>
  `${year}-${String(sequence).padStart(5, "0")}`;

/** Nom imprimé sur les reçus : « Claire Martin », ou « Claire M. » sans nom complet. */
export const receiptHolderName = (
  profile: Pick<OverviewProfile, "firstName" | "lastName" | "lastInitial">,
): string => `${profile.firstName} ${profile.lastName ?? `${profile.lastInitial}.`}`;

/** Adresse imprimée sur les reçus, une ligne par élément ; le pays seulement hors de France. */
export function receiptHolderAddress(
  profile: Pick<OverviewProfile, "addressLine" | "postalCode" | "city" | "country">,
): string | null {
  const lines = [
    profile.addressLine,
    [profile.postalCode, profile.city].filter(Boolean).join(" "),
    profile.country === "France" ? null : profile.country,
  ].filter((line): line is string => Boolean(line?.trim()));
  return profile.addressLine ? lines.join("\n") : null;
}

/** Réduction d'impôt estimée : versé × taux, au centime. */
export const estimateTaxReduction = (amountCents: number, ratePercent: number): number =>
  Math.round((amountCents * ratePercent) / 100);

const received = (p: OverviewPayment, year: number, at: Date) =>
  p.status === "RECEIVED" &&
  p.paidAt !== null &&
  yearOf(p.paidAt) === year &&
  p.paidAt.getTime() <= at.getTime();

/** P-Versements, calculé à `at` à partir des versements du parrain connecté. */
export function buildParrainPayments(input: OverviewInput): ParrainPayments {
  const { at, profile } = input;
  const year = yearOf(at);
  const active = new Set(input.sponsorships.map((s) => s.id));

  const paidThisYear = input.payments.filter((p) => received(p, year, at));
  const amountCents = paidThisYear.reduce((sum, p) => sum + p.amountCents, 0);
  const debitCount = new Set(
    paidThisYear.filter((p) => p.kind === "MONTHLY").map((p) => isoDay(p.dueDate)),
  ).size;
  const incidentCount = input.payments.filter(
    (p) => (p.status === "LATE" || p.status === "FAILED") && yearOf(p.dueDate) === year,
  ).length;

  const today = isoDay(at);
  const scheduled = input.payments
    .filter(
      (p) =>
        p.kind === "MONTHLY" &&
        p.status === "SCHEDULED" &&
        p.sponsorshipId !== null &&
        active.has(p.sponsorshipId) &&
        isoDay(p.dueDate) >= today,
    )
    .map((p) => isoDay(p.dueDate))
    .sort();
  const nextDebit =
    input.sponsorships.length === 0
      ? null
      : (scheduled[0] ?? isoDay(nextDebitDate(at, profile.debitDay)));

  const years = [...new Set(input.payments.map((p) => yearOf(p.dueDate)))].sort((a, b) => b - a);
  const shownYear = input.selectedYear ?? year;
  const collator = new Intl.Collator("fr");
  const history = input.payments
    .filter((p) => yearOf(p.dueDate) === shownYear)
    .sort(
      (a, b) =>
        b.dueDate.getTime() - a.dueDate.getTime() ||
        collator.compare(a.child?.firstName ?? "", b.child?.firstName ?? "") ||
        a.kind.localeCompare(b.kind) ||
        a.id.localeCompare(b.id),
    )
    .map((p) => ({
      id: p.id,
      date: isoDay(p.dueDate),
      child: p.child,
      kind: p.kind,
      amountCents: p.amountCents,
      method: p.method,
      label: p.label,
      status: p.status,
    }));

  const issued = new Map(input.receipts.map((r) => [r.year, r]));
  const receiptYears = [
    ...new Set(
      input.payments
        .filter((p) => p.status === "RECEIVED" && p.paidAt !== null && yearOf(p.paidAt) < year)
        .map((p) => yearOf(p.paidAt!)),
    ),
  ].sort((a, b) => b - a);
  const receipts = receiptYears.map((receiptYear) => {
    const receipt = issued.get(receiptYear);
    return {
      year: receiptYear,
      amountCents:
        receipt?.amountCents ??
        input.payments
          .filter((p) => received(p, receiptYear, at))
          .reduce((sum, p) => sum + p.amountCents, 0),
      number: receipt?.number ?? null,
    };
  });

  return {
    now: at.toISOString(),
    year,
    monthly: {
      totalCents: input.sponsorships.reduce((sum, s) => sum + s.monthlyAmountCents, 0),
      method: profile.paymentMethod,
      debitDay: profile.debitDay,
      filleuls: input.sponsorships.map((s) => ({
        childId: s.childId,
        firstName: s.firstName,
        lastInitial: s.lastInitial,
        amountCents: s.monthlyAmountCents,
      })),
      nextDebitDate: nextDebit,
    },
    paidThisYear: { amountCents, debitCount, incidentCount },
    taxReduction: {
      ratePercent: input.ratePercent,
      estimatedCents: estimateTaxReduction(amountCents, input.ratePercent),
    },
    history: { year: shownYear, years, items: history },
    receipts: {
      items: receipts,
      pendingYear: paidThisYear.length > 0 ? year : null,
      holder: { name: receiptHolderName(profile), address: receiptHolderAddress(profile) },
    },
  };
}
