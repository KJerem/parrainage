import { randomBytes } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type CreateDonation,
  donationLabel,
  type MonthlyAmountChange,
  monthlyAmountChangeSchema,
  type ParrainPayments,
  parrainPaymentsSchema,
  type PaymentHistoryItem,
  paymentHistoryItemSchema,
  type UpdateMonthlyAmount,
  type UpdatePaymentMethod,
} from "@parrainage/contracts";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import { monthlyAmountChangedEmail } from "../mail/templates.js";
import { sendMailInBackground } from "../mail/transport.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  debitDateOf,
  indexOfPeriodKey,
  monthIndexOf,
  nextDebitDate,
  periodKeyOfIndex,
} from "./monthly-payments.js";
import { buildParrainPayments, type OverviewPayment } from "./payments-overview.js";

/** Parrain connecté : ses versements seulement, jamais ceux d'un co-parrain. */
export interface ParrainActor {
  userId: string;
  parrainId: string;
}

export const PAYMENTS_PATH = "/parrain/versements";

const paymentSelect = {
  id: true,
  sponsorshipId: true,
  kind: true,
  status: true,
  amountCents: true,
  method: true,
  label: true,
  dueDate: true,
  paidAt: true,
  child: { select: { id: true, firstName: true, lastInitial: true } },
} satisfies Prisma.PaymentSelect;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";

const toHistoryItem = (payment: OverviewPayment): PaymentHistoryItem =>
  paymentHistoryItemSchema.parse({
    id: payment.id,
    date: isoDay(payment.dueDate),
    child: payment.child,
    kind: payment.kind,
    amountCents: payment.amountCents,
    method: payment.method,
    label: payment.label,
    status: payment.status,
  });

/** P-Versements : versements simulés, mensualités, moyen de paiement et dons ponctuels. */
@Injectable()
export class PaymentsService {
  private readonly appUrl: string;
  private readonly ratePercent: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
    this.ratePercent = Math.round(config.get("TAX_REDUCTION_RATE", { infer: true }) * 100);
  }

  async overview(actor: ParrainActor, selectedYear?: number): Promise<ParrainPayments> {
    const at = now();
    const [profile, sponsorships, payments, receipts] = await Promise.all([
      this.prisma.parrainProfile.findUniqueOrThrow({
        where: { id: actor.parrainId },
        select: {
          firstName: true,
          lastInitial: true,
          lastName: true,
          addressLine: true,
          postalCode: true,
          city: true,
          country: true,
          debitDay: true,
          paymentMethod: true,
        },
      }),
      this.prisma.sponsorship.findMany({
        where: { parrainId: actor.parrainId, status: "ACTIVE" },
        orderBy: [{ startDate: "asc" }, { id: "asc" }],
        select: {
          id: true,
          monthlyAmountCents: true,
          child: { select: { id: true, firstName: true, lastInitial: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { parrainId: actor.parrainId },
        select: paymentSelect,
      }),
      this.prisma.fiscalReceipt.findMany({
        where: { parrainId: actor.parrainId },
        select: { year: true, number: true, amountCents: true },
      }),
    ]);
    return parrainPaymentsSchema.parse(
      buildParrainPayments({
        at,
        ratePercent: this.ratePercent,
        selectedYear,
        profile,
        sponsorships: sponsorships.map((s) => ({
          id: s.id,
          childId: s.child.id,
          firstName: s.child.firstName,
          lastInitial: s.child.lastInitial,
          monthlyAmountCents: s.monthlyAmountCents,
        })),
        payments,
        receipts,
      }),
    );
  }

  /**
   * Nouvelle mensualité d'un binôme, à partir du prochain prélèvement (celui déjà programmé
   * change aussi). Enregistrée, auditée, et le parrain reçoit une confirmation par e-mail.
   */
  async changeMonthlyAmount(
    actor: ParrainActor,
    input: UpdateMonthlyAmount,
  ): Promise<MonthlyAmountChange> {
    const at = now();
    const result = await this.prisma.$transaction(async (tx) => {
      // Deux changements simultanés : le second attend le premier, puis part de son montant.
      const [sponsorship] = await tx.$queryRaw<{ id: string; monthlyAmountCents: number }[]>`
        SELECT "id", "monthlyAmountCents" FROM "Sponsorship"
        WHERE "parrainId" = ${actor.parrainId} AND "childId" = ${input.childId}
          AND "status" = 'ACTIVE'
        ORDER BY "startDate", "id"
        LIMIT 1
        FOR UPDATE`;
      if (!sponsorship) {
        throw new NotFoundException();
      }
      const [scheduled, profile] = await Promise.all([
        tx.payment.findFirst({
          where: { sponsorshipId: sponsorship.id, kind: "MONTHLY", status: "SCHEDULED" },
          orderBy: { dueDate: "asc" },
          select: { periodKey: true },
        }),
        tx.parrainProfile.findUniqueOrThrow({
          where: { id: actor.parrainId },
          select: { debitDay: true },
        }),
      ]);
      const effectivePeriodKey =
        scheduled?.periodKey ?? periodKeyOfIndex(monthIndexOf(nextDebitDate(at, profile.debitDay)));
      const fromCents = sponsorship.monthlyAmountCents;
      if (fromCents === input.amountCents) {
        return { effectivePeriodKey, changed: false };
      }
      await tx.sponsorship.update({
        where: { id: sponsorship.id },
        data: { monthlyAmountCents: input.amountCents },
      });
      await tx.payment.updateMany({
        where: { sponsorshipId: sponsorship.id, kind: "MONTHLY", status: "SCHEDULED" },
        data: { amountCents: input.amountCents },
      });
      await tx.monthlyAmountChange.create({
        data: {
          sponsorshipId: sponsorship.id,
          changedById: actor.userId,
          fromCents,
          toCents: input.amountCents,
          effectivePeriodKey,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "sponsorship.monthly_amount_changed",
          entityType: "Sponsorship",
          entityId: sponsorship.id,
          metadata: { fromCents, toCents: input.amountCents, effectivePeriodKey },
        },
      });
      return { effectivePeriodKey, changed: true };
    });
    if (result.changed) {
      await this.mailParrain(actor.userId);
    }
    return monthlyAmountChangeSchema.parse({
      childId: input.childId,
      amountCents: input.amountCents,
      effectivePeriodKey: result.effectivePeriodKey,
    });
  }

  /**
   * Moyen et jour des prochains prélèvements. Les mensualités déjà programmées suivent, sauf si
   * leur nouvelle date serait déjà passée : elles gardent alors la leur.
   */
  async changeMethod(
    actor: ParrainActor,
    input: UpdatePaymentMethod,
  ): Promise<UpdatePaymentMethod> {
    const today = isoDay(now());
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.parrainProfile.findUniqueOrThrow({
        where: { id: actor.parrainId },
        select: { paymentMethod: true, debitDay: true },
      });
      if (before.paymentMethod === input.method && before.debitDay === input.debitDay) {
        return;
      }
      await tx.parrainProfile.update({
        where: { id: actor.parrainId },
        data: { paymentMethod: input.method, debitDay: input.debitDay },
      });
      const scheduled = await tx.payment.findMany({
        where: { parrainId: actor.parrainId, kind: "MONTHLY", status: "SCHEDULED" },
        select: { id: true, periodKey: true },
      });
      for (const payment of scheduled) {
        const dueDate =
          payment.periodKey === null
            ? null
            : debitDateOf(indexOfPeriodKey(payment.periodKey), input.debitDay);
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            method: input.method,
            ...(dueDate && isoDay(dueDate) > today ? { dueDate } : {}),
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "parrain.payment_method_changed",
          entityType: "ParrainProfile",
          entityId: actor.parrainId,
          metadata: { from: before, to: input },
        },
      });
    });
    return input;
  }

  /**
   * Don ponctuel simulé, par carte, reçu aussitôt. Deux dons le même jour sont possibles ;
   * rejouer la même clé d'idempotence renvoie le même don.
   */
  async donate(actor: ParrainActor, input: CreateDonation): Promise<PaymentHistoryItem> {
    const key = `${actor.parrainId}:${input.idempotencyKey}`;
    const replay = await this.prisma.payment.findUnique({
      where: { idempotencyKey: key },
      select: paymentSelect,
    });
    if (replay) {
      return toHistoryItem(replay);
    }
    const sponsorship = await this.prisma.sponsorship.findFirst({
      where: { parrainId: actor.parrainId, childId: input.childId, status: "ACTIVE" },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    if (!sponsorship) {
      throw new NotFoundException();
    }
    const at = now();
    const day = isoDay(at);
    try {
      const donation = await this.prisma.payment.create({
        data: {
          parrainId: actor.parrainId,
          sponsorshipId: sponsorship.id,
          childId: input.childId,
          kind: "ONE_OFF",
          amountCents: input.amountCents,
          method: "CARD",
          label: donationLabel(input.note),
          dueDate: new Date(`${day}T00:00:00Z`),
          paidAt: at,
          status: "RECEIVED",
          reference: `DON-${day.replaceAll("-", "")}-${randomBytes(5).toString("hex").toUpperCase()}`,
          periodKey: null,
          idempotencyKey: key,
        },
        select: paymentSelect,
      });
      return toHistoryItem(donation);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const again = await this.prisma.payment.findUnique({
          where: { idempotencyKey: key },
          select: paymentSelect,
        });
        if (again) {
          return toHistoryItem(again);
        }
      }
      throw error;
    }
  }

  private async mailParrain(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, OR: [{ banned: null }, { banned: false }] },
      select: { email: true },
    });
    if (user) {
      sendMailInBackground({
        to: user.email,
        ...monthlyAmountChangedEmail(new URL(PAYMENTS_PATH, this.appUrl).toString()),
      });
    }
  }
}
