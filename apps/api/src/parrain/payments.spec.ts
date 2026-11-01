import { paymentsSummarySchema } from "@parrainage/contracts";
import { type PaymentRow, summarizePayments } from "./payments.js";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const monthly = (
  sponsorshipId: string,
  periodKey: string,
  status: PaymentRow["status"] = "RECEIVED",
): PaymentRow => {
  const dueDate = day(`${periodKey}-05`);
  return {
    id: `${sponsorshipId}-${periodKey}`,
    sponsorshipId,
    kind: "MONTHLY",
    status,
    amountCents: 2500,
    dueDate,
    paidAt: status === "RECEIVED" ? new Date(dueDate.getTime() + 8 * 3600 * 1000) : null,
    periodKey,
  };
};

const months = (sponsorshipId: string, from: string, count: number): PaymentRow[] => {
  const [year, month] = from.split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 + i, 5));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return monthly(sponsorshipId, key);
  });
};

const don: PaymentRow = {
  id: "don",
  sponsorshipId: "s-aicha",
  kind: "ONE_OFF",
  status: "RECEIVED",
  amountCents: 4000,
  dueDate: day("2026-09-15"),
  paidAt: new Date("2026-09-15T10:00:00Z"),
  periodKey: null,
};

describe("summarizePayments", () => {
  const now = new Date("2026-10-31T10:00:00Z");

  it("calcule le versé de l'année (don compris) et les trois dernières mensualités", () => {
    const summary = summarizePayments({
      sponsorshipId: "s-aicha",
      monthlyAmountCents: 2500,
      payments: [...months("s-aicha", "2025-11", 12), don],
      now,
    });
    expect(summary).toEqual({
      year: 2026,
      monthlyAmountCents: 2500,
      paidThisYearCents: 10 * 2500 + 4000,
      lastMonths: [
        {
          id: "s-aicha-2026-10",
          periodKey: "2026-10",
          dueDate: "2026-10-05",
          amountCents: 2500,
          status: "RECEIVED",
        },
        {
          id: "s-aicha-2026-09",
          periodKey: "2026-09",
          dueDate: "2026-09-05",
          amountCents: 2500,
          status: "RECEIVED",
        },
        {
          id: "s-aicha-2026-08",
          periodKey: "2026-08",
          dueDate: "2026-08-05",
          amountCents: 2500,
          status: "RECEIVED",
        },
      ],
    });
    expect(paymentsSummarySchema.safeParse(summary).success).toBe(true);
  });

  it("ignore les mensualités à venir et celles d'un autre binôme", () => {
    const summary = summarizePayments({
      sponsorshipId: "s-aicha",
      monthlyAmountCents: 2500,
      payments: [
        monthly("s-aicha", "2026-09"),
        monthly("s-aicha", "2026-11", "SCHEDULED"),
        monthly("s-ancien", "2026-10"),
      ],
      now,
    });
    expect(summary.lastMonths.map((p) => p.periodKey)).toEqual(["2026-09"]);
    // Un ancien binôme avec le même enfant compte dans le versé de l'année, pas dans la liste.
    expect(summary.paidThisYearCents).toBe(5000);
  });

  it("montre les retards sans les compter comme versés", () => {
    const summary = summarizePayments({
      sponsorshipId: "s-ibrahim",
      monthlyAmountCents: 2500,
      payments: [
        monthly("s-ibrahim", "2026-08"),
        monthly("s-ibrahim", "2026-09", "LATE"),
        monthly("s-ibrahim", "2026-10", "LATE"),
      ],
      now,
    });
    expect(summary.lastMonths.map((p) => p.status)).toEqual(["LATE", "LATE", "RECEIVED"]);
    expect(summary.paidThisYearCents).toBe(2500);
  });

  it("s'arrête aux versements de l'année civile de `now`", () => {
    const summary = summarizePayments({
      sponsorshipId: "s-aicha",
      monthlyAmountCents: 2500,
      payments: months("s-aicha", "2025-10", 4),
      now: new Date("2026-01-03T10:00:00Z"),
    });
    expect(summary.year).toBe(2026);
    expect(summary.paidThisYearCents).toBe(0);
    expect(summary.lastMonths.map((p) => p.periodKey)).toEqual(["2025-12", "2025-11", "2025-10"]);
  });

  it("renvoie des totaux nuls sans versement", () => {
    expect(
      summarizePayments({ sponsorshipId: "s", monthlyAmountCents: 3000, payments: [], now }),
    ).toEqual({ year: 2026, monthlyAmountCents: 3000, paidThisYearCents: 0, lastMonths: [] });
  });
});
