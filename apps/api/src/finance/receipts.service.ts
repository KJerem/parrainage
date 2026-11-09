import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import type { PaymentMethod } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ParrainActor } from "./payments.service.js";
import { receiptHolderAddress, receiptHolderName, receiptNumber } from "./payments-overview.js";
import { type AssociationIdentity, receiptPdf } from "./receipt-pdf.js";

/** Nouvelles tentatives quand deux reçus de la même année prennent le même rang. */
const MAX_ATTEMPTS = 5;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";

export interface IssuedReceipt {
  id: string;
  number: string;
  year: number;
  amountCents: number;
  paymentCount: number;
  methods: PaymentMethod[];
  donorName: string;
  donorAddress: string | null;
  issuedAt: Date;
}

const receiptSelect = {
  id: true,
  number: true,
  year: true,
  amountCents: true,
  paymentCount: true,
  methods: true,
  donorName: true,
  donorAddress: true,
  issuedAt: true,
} as const;

/**
 * Reçus fiscaux annuels. Un reçu est émis au premier téléchargement, une fois l'année close :
 * numéro, montant et identité du donateur sont alors figés.
 */
@Injectable()
export class ReceiptsService {
  private readonly ratePercent: number;
  private readonly association: AssociationIdentity;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ratePercent = Math.round(config.get("TAX_REDUCTION_RATE", { infer: true }) * 100);
    this.association = {
      name: config.get("ASSOCIATION_NAME", { infer: true }),
      address: config.get("ASSOCIATION_ADDRESS", { infer: true }),
      object: config.get("ASSOCIATION_OBJECT", { infer: true }),
      signatory: config.get("ASSOCIATION_SIGNATORY", { infer: true }),
    };
  }

  /** Le reçu d'une année en PDF ; chaque téléchargement est audité. */
  async download(
    actor: ParrainActor,
    year: number,
  ): Promise<{ filename: string; body: Uint8Array }> {
    const receipt = await this.issue(actor.parrainId, year, now());
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "receipt.downloaded",
        entityType: "FiscalReceipt",
        entityId: receipt.id,
        metadata: { year, number: receipt.number },
      },
    });
    const body = await receiptPdf({ ...receipt, ratePercent: this.ratePercent }, this.association);
    return { filename: `recu-fiscal-${year}.pdf`, body };
  }

  /** Reçu déjà émis, ou émis maintenant avec le rang suivant de l'année. */
  async issue(parrainId: string, year: number, at: Date): Promise<IssuedReceipt> {
    const existing = await this.prisma.fiscalReceipt.findUnique({
      where: { parrainId_year: { parrainId, year } },
      select: receiptSelect,
    });
    if (existing) {
      return existing;
    }
    const currentYear = at.getUTCFullYear();
    if (year >= currentYear) {
      throw new AppError(
        404,
        year === currentYear
          ? `Le reçu ${year} sera disponible en janvier ${year + 1}`
          : `Aucun reçu fiscal pour ${year}`,
      );
    }
    const [payments, profile] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          parrainId,
          status: "RECEIVED",
          paidAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
        },
        select: { amountCents: true, method: true },
      }),
      this.prisma.parrainProfile.findUniqueOrThrow({
        where: { id: parrainId },
        select: {
          firstName: true,
          lastInitial: true,
          lastName: true,
          addressLine: true,
          postalCode: true,
          city: true,
          country: true,
        },
      }),
    ]);
    if (payments.length === 0) {
      throw new AppError(
        404,
        `Aucun versement reçu en ${year} : pas de reçu fiscal pour cette année`,
      );
    }
    const data = {
      parrainId,
      year,
      amountCents: payments.reduce((sum, p) => sum + p.amountCents, 0),
      paymentCount: payments.length,
      methods: [...new Set(payments.map((p) => p.method))],
      donorName: receiptHolderName(profile),
      donorAddress: receiptHolderAddress(profile),
      issuedAt: at,
    };
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const concurrent = await tx.fiscalReceipt.findUnique({
            where: { parrainId_year: { parrainId, year } },
            select: receiptSelect,
          });
          if (concurrent) {
            return concurrent;
          }
          const { _max } = await tx.fiscalReceipt.aggregate({
            where: { year },
            _max: { sequence: true },
          });
          const sequence = (_max.sequence ?? 0) + 1;
          return tx.fiscalReceipt.create({
            data: { ...data, sequence, number: receiptNumber(year, sequence) },
            select: receiptSelect,
          });
        });
      } catch (error) {
        // Même parrain (le reçu existe désormais) ou même rang pris par un autre : on recommence.
        if (isUniqueViolation(error) && attempt < MAX_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
  }
}
