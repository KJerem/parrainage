// Banque simulée : les mensualités des binômes actifs sont créées mois après mois, puis passent
// à « reçu » le jour du prélèvement. `periodKey` (AAAA-MM) est unique par binôme : relancer la
// simulation ne crée jamais de doublon.
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PaymentMethod } from "../generated/prisma/enums.js";

const HOUR = 3_600_000;

/** Mois numérotés en continu : année × 12 + mois (0 à 11), en UTC. */
export const monthIndexOf = (date: Date): number => date.getUTCFullYear() * 12 + date.getUTCMonth();

export const periodKeyOfIndex = (index: number): string =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

export const indexOfPeriodKey = (periodKey: string): number => {
  const [year, month] = periodKey.split("-").map(Number);
  return year! * 12 + month! - 1;
};

export const debitDateOf = (index: number, debitDay: number): Date =>
  new Date(Date.UTC(Math.floor(index / 12), index % 12, debitDay));

/** Premier mois prélevé : celui du début du binôme, si son jour de prélèvement n'est pas passé. */
export function firstDebitMonth(startDate: Date, debitDay: number): number {
  const start = monthIndexOf(startDate);
  return debitDateOf(start, debitDay).getTime() < startDate.getTime() ? start + 1 : start;
}

/** Prochain jour de prélèvement après la date du jour (celui du jour est réputé passé). */
export function nextDebitDate(at: Date, debitDay: number): Date {
  const index = monthIndexOf(at);
  return at.getUTCDate() < debitDay
    ? debitDateOf(index, debitDay)
    : debitDateOf(index + 1, debitDay);
}

/** Heure d'encaissement simulée : 8 h (UTC) le jour du prélèvement, jamais après `at`. */
export const settledAt = (dueDate: Date, at: Date): Date =>
  new Date(Math.min(dueDate.getTime() + 8 * HOUR, at.getTime()));

export interface SponsorshipToBill {
  id: string;
  parrainId: string;
  childId: string;
  startDate: Date;
  monthlyAmountCents: number;
  debitDay: number;
  method: PaymentMethod;
  /** Dernière mensualité déjà créée pour ce binôme. */
  lastPeriodKey: string | null;
}

export interface PlannedPayment {
  sponsorshipId: string;
  parrainId: string;
  childId: string;
  kind: "MONTHLY";
  periodKey: string;
  dueDate: Date;
  amountCents: number;
  method: PaymentMethod;
  status: "RECEIVED" | "SCHEDULED";
  paidAt: Date | null;
  reference: string;
}

/** Mensualités manquantes, jusqu'au mois de `at` compris : échues reçues, la suivante prévue. */
export function planMonthlyPayments(
  sponsorships: readonly SponsorshipToBill[],
  at: Date,
): PlannedPayment[] {
  const current = monthIndexOf(at);
  return sponsorships.flatMap((s) => {
    const from =
      s.lastPeriodKey === null
        ? firstDebitMonth(s.startDate, s.debitDay)
        : indexOfPeriodKey(s.lastPeriodKey) + 1;
    const planned: PlannedPayment[] = [];
    for (let index = from; index <= current; index += 1) {
      const dueDate = debitDateOf(index, s.debitDay);
      const due = dueDate.getTime() <= at.getTime();
      const periodKey = periodKeyOfIndex(index);
      planned.push({
        sponsorshipId: s.id,
        parrainId: s.parrainId,
        childId: s.childId,
        kind: "MONTHLY",
        periodKey,
        dueDate,
        amountCents: s.monthlyAmountCents,
        method: s.method,
        status: due ? "RECEIVED" : "SCHEDULED",
        paidAt: due ? settledAt(dueDate, at) : null,
        reference: `PRL-${periodKey.replace("-", "")}-${s.id}`,
      });
    }
    return planned;
  });
}

/**
 * Un passage de la banque simulée (`npm run simulate:payments`) : crée les mensualités manquantes
 * et encaisse celles dont le jour est venu. Sans effet si rien n'est dû.
 */
export async function simulateBank(
  prisma: PrismaClient,
  at: Date,
): Promise<{ created: number; settled: number }> {
  const sponsorships = await prisma.sponsorship.findMany({
    where: { status: "ACTIVE", startDate: { lte: at } },
    select: {
      id: true,
      parrainId: true,
      childId: true,
      startDate: true,
      monthlyAmountCents: true,
      parrain: { select: { debitDay: true, paymentMethod: true } },
      payments: {
        where: { kind: "MONTHLY", periodKey: { not: null } },
        orderBy: { periodKey: "desc" },
        take: 1,
        select: { periodKey: true },
      },
    },
  });
  const planned = planMonthlyPayments(
    sponsorships.map((s) => ({
      id: s.id,
      parrainId: s.parrainId,
      childId: s.childId,
      startDate: s.startDate,
      monthlyAmountCents: s.monthlyAmountCents,
      debitDay: s.parrain.debitDay,
      method: s.parrain.paymentMethod,
      lastPeriodKey: s.payments[0]?.periodKey ?? null,
    })),
    at,
  );
  const { count: created } = await prisma.payment.createMany({
    data: planned,
    skipDuplicates: true,
  });

  const due = await prisma.payment.findMany({
    where: { status: "SCHEDULED", dueDate: { lte: at } },
    select: { id: true, dueDate: true },
  });
  let settled = 0;
  for (const payment of due) {
    const { count } = await prisma.payment.updateMany({
      where: { id: payment.id, status: "SCHEDULED" },
      data: { status: "RECEIVED", paidAt: settledAt(payment.dueDate, at) },
    });
    settled += count;
  }
  return { created, settled };
}
