import { parrainPaymentsSchema } from "@parrainage/contracts";
import {
  buildParrainPayments,
  estimateTaxReduction,
  type OverviewInput,
  type OverviewPayment,
  type OverviewProfile,
  receiptHolderAddress,
  receiptHolderName,
} from "./payments-overview.js";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const AICHA = { id: "c-aicha", firstName: "Aïcha", lastInitial: "S" };
const KOFI = { id: "c-kofi", firstName: "Kofi", lastInitial: "A" };

const monthly = (
  child: typeof AICHA,
  dueDate: string,
  status: OverviewPayment["status"] = "RECEIVED",
): OverviewPayment => ({
  id: `${child.id}-${dueDate}`,
  child,
  sponsorshipId: `s-${child.id}`,
  kind: "MONTHLY",
  status,
  amountCents: 2500,
  method: "SEPA_DEBIT",
  label: null,
  dueDate: day(dueDate),
  paidAt: status === "RECEIVED" ? new Date(`${dueDate}T08:00:00Z`) : null,
});

const months = (child: typeof AICHA, year: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) =>
    monthly(child, `${year}-${String(from + i).padStart(2, "0")}-05`),
  );

const don: OverviewPayment = {
  id: "don",
  child: AICHA,
  sponsorshipId: "s-c-aicha",
  kind: "ONE_OFF",
  status: "RECEIVED",
  amountCents: 4000,
  method: "CARD",
  label: "Don ponctuel · rentrée",
  dueDate: day("2026-09-15"),
  paidAt: new Date("2026-09-15T10:00:00Z"),
};

const profile: OverviewProfile = {
  firstName: "Claire",
  lastInitial: "M",
  lastName: "Martin",
  addressLine: "12 rue des Tilleuls",
  postalCode: "69003",
  city: "Lyon",
  country: "France",
  debitDay: 5,
  paymentMethod: "SEPA_DEBIT",
};

const input = (overrides: Partial<OverviewInput> = {}): OverviewInput => ({
  at: new Date("2026-10-31T10:00:00Z"),
  ratePercent: 66,
  profile,
  sponsorships: [
    {
      id: "s-c-aicha",
      childId: AICHA.id,
      firstName: "Aïcha",
      lastInitial: "S",
      monthlyAmountCents: 2500,
    },
    {
      id: "s-c-kofi",
      childId: KOFI.id,
      firstName: "Kofi",
      lastInitial: "A",
      monthlyAmountCents: 2500,
    },
  ],
  payments: [
    ...months(AICHA, 2024, 1, 12),
    ...months(AICHA, 2025, 1, 12),
    ...months(KOFI, 2025, 9, 12),
    ...months(AICHA, 2026, 1, 10),
    ...months(KOFI, 2026, 1, 10),
    don,
  ],
  receipts: [{ year: 2024, number: "2024-00001", amountCents: 30000 }],
  ...overrides,
});

describe("buildParrainPayments", () => {
  it("résume l'année : mensualité, versé, prélèvements distincts et réduction estimée", () => {
    const overview = buildParrainPayments(input());
    expect(parrainPaymentsSchema.safeParse(overview).success).toBe(true);
    expect(overview.monthly).toMatchObject({
      totalCents: 5000,
      debitDay: 5,
      method: "SEPA_DEBIT",
      nextDebitDate: "2026-11-05",
    });
    expect(overview.paidThisYear).toEqual({ amountCents: 54000, debitCount: 10, incidentCount: 0 });
    expect(overview.taxReduction).toEqual({ ratePercent: 66, estimatedCents: 35640 });
  });

  it("liste l'historique de l'année, du plus récent, par prénom à date égale", () => {
    const { history } = buildParrainPayments(input());
    expect(history.year).toBe(2026);
    expect(history.years).toEqual([2026, 2025, 2024]);
    expect(history.items.slice(0, 5).map((p) => [p.date, p.child?.firstName, p.kind])).toEqual([
      ["2026-10-05", "Aïcha", "MONTHLY"],
      ["2026-10-05", "Kofi", "MONTHLY"],
      ["2026-09-15", "Aïcha", "ONE_OFF"],
      ["2026-09-05", "Aïcha", "MONTHLY"],
      ["2026-09-05", "Kofi", "MONTHLY"],
    ]);
    expect(history.items).toHaveLength(21);
    expect(buildParrainPayments(input({ selectedYear: 2025 })).history.items).toHaveLength(16);
  });

  it("propose les reçus des années closes, avec le numéro déjà attribué", () => {
    const { receipts } = buildParrainPayments(input());
    expect(receipts.items).toEqual([
      { year: 2025, amountCents: 40000, number: null },
      { year: 2024, amountCents: 30000, number: "2024-00001" },
    ]);
    expect(receipts.pendingYear).toBe(2026);
    expect(receipts.holder).toEqual({
      name: "Claire Martin",
      address: "12 rue des Tilleuls\n69003 Lyon",
    });
  });

  it("compte les retards de l'année et garde la mensualité prévue comme prochain prélèvement", () => {
    const overview = buildParrainPayments(
      input({
        at: new Date("2026-11-02T10:00:00Z"),
        payments: [
          monthly(AICHA, "2026-09-05", "LATE"),
          monthly(AICHA, "2026-10-05", "LATE"),
          monthly(AICHA, "2026-11-05", "SCHEDULED"),
        ],
      }),
    );
    expect(overview.paidThisYear).toEqual({ amountCents: 0, debitCount: 0, incidentCount: 2 });
    expect(overview.monthly.nextDebitDate).toBe("2026-11-05");
    expect(overview.receipts.pendingYear).toBeNull();
    expect(overview.history.items[0]!.status).toBe("SCHEDULED");
  });

  it("n'annonce aucun prélèvement sans binôme actif", () => {
    const overview = buildParrainPayments(input({ sponsorships: [], payments: [], receipts: [] }));
    expect(overview.monthly).toMatchObject({ totalCents: 0, nextDebitDate: null, filleuls: [] });
    expect(overview.history).toEqual({ year: 2026, years: [], items: [] });
    expect(overview.receipts.items).toEqual([]);
  });
});

describe("identité des reçus", () => {
  it("se replie sur l'initiale et n'imprime le pays qu'hors de France", () => {
    expect(receiptHolderName({ ...profile, lastName: null })).toBe("Claire M.");
    expect(
      receiptHolderAddress({
        ...profile,
        country: "Belgique",
        postalCode: "1000",
        city: "Bruxelles",
      }),
    ).toBe("12 rue des Tilleuls\n1000 Bruxelles\nBelgique");
    expect(receiptHolderAddress({ ...profile, addressLine: null })).toBeNull();
  });

  it("arrondit la réduction au centime", () => {
    expect(estimateTaxReduction(2500, 66)).toBe(1650);
    expect(estimateTaxReduction(1001, 66)).toBe(661);
  });
});
