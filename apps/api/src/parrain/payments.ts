import type { PaymentsSummary } from "@parrainage/contracts";
import type { PaymentKind, PaymentStatus } from "../generated/prisma/enums.js";

export interface PaymentRow {
  id: string;
  sponsorshipId: string | null;
  kind: PaymentKind;
  status: PaymentStatus;
  amountCents: number;
  dueDate: Date;
  paidAt: Date | null;
  periodKey: string | null;
}

/** Mensualités affichées sur l'écran principal. */
export const LAST_MONTHS_COUNT = 3;

/**
 * Mini-versements d'un binôme, calculés à `now` à partir des versements du parrain connecté
 * pour cet enfant (ceux d'un co-parrain ne sont jamais chargés) :
 * - versé cette année : versements reçus (dons ponctuels compris) payés dans l'année civile ;
 * - dernières mensualités : celles du binôme déjà échues, de la plus récente à la plus ancienne.
 */
export function summarizePayments(input: {
  sponsorshipId: string;
  monthlyAmountCents: number;
  payments: readonly PaymentRow[];
  now: Date;
}): PaymentsSummary {
  const { now } = input;
  const year = now.getUTCFullYear();
  const paidThisYearCents = input.payments
    .filter(
      (p) =>
        p.status === "RECEIVED" &&
        p.paidAt !== null &&
        p.paidAt.getUTCFullYear() === year &&
        p.paidAt.getTime() <= now.getTime(),
    )
    .reduce((total, p) => total + p.amountCents, 0);
  const lastMonths = input.payments
    .filter(
      (p): p is PaymentRow & { periodKey: string } =>
        p.kind === "MONTHLY" &&
        p.sponsorshipId === input.sponsorshipId &&
        p.periodKey !== null &&
        p.dueDate.getTime() <= now.getTime(),
    )
    .sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime())
    .slice(0, LAST_MONTHS_COUNT)
    .map((p) => ({
      id: p.id,
      periodKey: p.periodKey,
      dueDate: p.dueDate.toISOString().slice(0, 10),
      amountCents: p.amountCents,
      status: p.status,
    }));
  return { year, monthlyAmountCents: input.monthlyAmountCents, paidThisYearCents, lastMonths };
}
