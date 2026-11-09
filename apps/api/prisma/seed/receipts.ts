// Reçus fiscaux déjà émis par l'association : un par parrain et par année close, le 15 janvier
// suivant. Numéros attribués dans l'ordre des identifiants : stables d'un seed à l'autre.
import {
  receiptHolderAddress,
  receiptHolderName,
  receiptNumber,
} from "../../src/finance/payments-overview.js";
import type { SeedPayment } from "./content.js";
import type { SeedParrain } from "./data.js";

export interface SeedReceipt {
  id: string;
  parrainId: string;
  year: number;
  sequence: number;
  number: string;
  amountCents: number;
  paymentCount: number;
  methods: SeedPayment["method"][];
  donorName: string;
  donorAddress: string | null;
  issuedAt: Date;
}

export function buildSeedReceipts(
  today: Date,
  parrains: readonly SeedParrain[],
  payments: readonly SeedPayment[],
): SeedReceipt[] {
  const profiles = new Map(parrains.map((p) => [p.profile.id, p.profile]));
  const byYear = new Map<number, Map<string, SeedPayment[]>>();
  for (const payment of payments) {
    if (payment.status !== "RECEIVED" || payment.paidAt === null) {
      continue;
    }
    const year = payment.paidAt.getUTCFullYear();
    const issuedAt = new Date(Date.UTC(year + 1, 0, 15, 9));
    // Seulement les reçus déjà émis à la date du seed (année close, mi-janvier passée).
    if (issuedAt.getTime() > today.getTime()) {
      continue;
    }
    const ofYear = byYear.get(year) ?? new Map<string, SeedPayment[]>();
    ofYear.set(payment.parrainId, [...(ofYear.get(payment.parrainId) ?? []), payment]);
    byYear.set(year, ofYear);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([year, ofYear]) =>
      [...ofYear.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([parrainId, own], index) => {
          const profile = profiles.get(parrainId)!;
          const sequence = index + 1;
          return {
            id: `seed-receipt-${parrainId.replace("seed-parrain-", "")}-${year}`,
            parrainId,
            year,
            sequence,
            number: receiptNumber(year, sequence),
            amountCents: own.reduce((sum, p) => sum + p.amountCents, 0),
            paymentCount: own.length,
            methods: [...new Set(own.map((p) => p.method))],
            donorName: receiptHolderName(profile),
            donorAddress: receiptHolderAddress(profile),
            issuedAt: new Date(Date.UTC(year + 1, 0, 15, 9)),
          };
        }),
    );
}
