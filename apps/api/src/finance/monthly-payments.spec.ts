import {
  firstDebitMonth,
  monthIndexOf,
  nextDebitDate,
  periodKeyOfIndex,
  planMonthlyPayments,
  settledAt,
  type SponsorshipToBill,
} from "./monthly-payments.js";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const aicha: SponsorshipToBill = {
  id: "s-aicha",
  parrainId: "p-claire",
  childId: "c-aicha",
  startDate: day("2023-03-01"),
  monthlyAmountCents: 2500,
  debitDay: 5,
  method: "SEPA_DEBIT",
  lastPeriodKey: "2026-09",
};

describe("banque simulée", () => {
  it("numérote les mois en continu", () => {
    expect(periodKeyOfIndex(monthIndexOf(day("2026-12-31")))).toBe("2026-12");
    expect(periodKeyOfIndex(monthIndexOf(day("2027-01-01")))).toBe("2027-01");
  });

  it("commence au mois du binôme si le jour du prélèvement n'est pas passé", () => {
    expect(periodKeyOfIndex(firstDebitMonth(day("2025-09-01"), 5))).toBe("2025-09");
    expect(periodKeyOfIndex(firstDebitMonth(day("2025-09-06"), 5))).toBe("2025-10");
  });

  it("crée les mensualités manquantes : échues reçues, celle du mois prévue", () => {
    const planned = planMonthlyPayments([aicha], new Date("2026-11-02T10:00:00Z"));
    expect(planned.map((p) => [p.periodKey, p.status])).toEqual([
      ["2026-10", "RECEIVED"],
      ["2026-11", "SCHEDULED"],
    ]);
    expect(planned[0]).toMatchObject({
      dueDate: day("2026-10-05"),
      paidAt: new Date("2026-10-05T08:00:00Z"),
      amountCents: 2500,
      reference: "PRL-202610-s-aicha",
    });
    expect(planned[1]!.paidAt).toBeNull();
  });

  it("ne crée rien quand le mois en cours existe déjà", () => {
    expect(
      planMonthlyPayments([{ ...aicha, lastPeriodKey: "2026-11" }], day("2026-11-20")),
    ).toEqual([]);
  });

  it("facture un nouveau binôme dès son premier mois", () => {
    const planned = planMonthlyPayments(
      [{ ...aicha, startDate: day("2026-11-10"), lastPeriodKey: null }],
      day("2026-11-20"),
    );
    expect(planned).toEqual([]);
    const december = planMonthlyPayments(
      [{ ...aicha, startDate: day("2026-11-10"), lastPeriodKey: null }],
      day("2026-12-01"),
    );
    expect(december.map((p) => [p.periodKey, p.status])).toEqual([["2026-12", "SCHEDULED"]]);
  });

  it("encaisse à 8 h, ou à l'instant présent s'il est plus tôt", () => {
    expect(settledAt(day("2026-11-05"), new Date("2026-11-05T06:00:00Z"))).toEqual(
      new Date("2026-11-05T06:00:00Z"),
    );
    expect(settledAt(day("2026-11-05"), day("2026-11-09"))).toEqual(
      new Date("2026-11-05T08:00:00Z"),
    );
  });

  it("donne le prochain jour de prélèvement après aujourd'hui", () => {
    expect(nextDebitDate(new Date("2026-10-31T10:00:00Z"), 5)).toEqual(day("2026-11-05"));
    expect(nextDebitDate(new Date("2026-11-02T10:00:00Z"), 5)).toEqual(day("2026-11-05"));
    expect(nextDebitDate(new Date("2026-11-05T10:00:00Z"), 5)).toEqual(day("2026-12-05"));
    expect(nextDebitDate(new Date("2026-12-09T10:00:00Z"), 5)).toEqual(day("2027-01-05"));
  });
});
