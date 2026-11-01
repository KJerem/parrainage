import { bulletinListSchema, resultsSummarySchema } from "@parrainage/contracts";
import { type SentResultRow, summarizeResults, toBulletins } from "./results.js";

const row = (
  id: string,
  schoolYear: string,
  kind: SentResultRow["period"]["kind"],
  label: string,
  className: string,
  averageX100: number,
  appreciation: string | null = null,
): SentResultRow => ({
  id,
  className,
  averageX100,
  rank: null,
  classSize: null,
  appreciation,
  sentAt: new Date("2026-10-29T14:30:00Z"),
  period: { schoolYear, kind, label },
  media: [],
});

const annual = row("annual", "2025-2026", "ANNUAL", "moyenne annuelle", "CM1", 1180, "Bien.");
const t1 = row(
  "t1",
  "2026-2027",
  "T1",
  "1er trimestre",
  "CM2",
  1340,
  "Élève sérieuse, en net progrès en mathématiques.",
);
const t3Previous = row("t3", "2025-2026", "T3", "3e trimestre", "CM1", 1210);

describe("summarizeResults", () => {
  it("compare les deux derniers résultats envoyés : 11,8 puis 13,4", () => {
    const summary = summarizeResults([t1, annual]);
    expect(summary).toEqual({
      previous: {
        id: "annual",
        schoolYear: "2025-2026",
        periodKind: "ANNUAL",
        periodLabel: "moyenne annuelle",
        className: "CM1",
        averageX100: 1180,
      },
      current: {
        id: "t1",
        schoolYear: "2026-2027",
        periodKind: "T1",
        periodLabel: "1er trimestre",
        className: "CM2",
        averageX100: 1340,
      },
      appreciation: "Élève sérieuse, en net progrès en mathématiques.",
    });
    expect(resultsSummarySchema.safeParse(summary).success).toBe(true);
  });

  it("range le bilan annuel après le 3e trimestre de la même année", () => {
    const summary = summarizeResults([t3Previous, annual]);
    expect(summary.current?.id).toBe("annual");
    expect(summary.previous?.id).toBe("t3");
  });

  it("gère un seul résultat ou aucun", () => {
    expect(summarizeResults([annual])).toMatchObject({ current: { id: "annual" }, previous: null });
    expect(summarizeResults([])).toEqual({ previous: null, current: null, appreciation: null });
  });
});

describe("toBulletins", () => {
  it("liste les bulletins du plus récent au plus ancien", () => {
    const list = { items: toBulletins([annual, t3Previous, t1]) };
    expect(list.items.map((b) => b.id)).toEqual(["t1", "annual", "t3"]);
    expect(list.items[0]).toMatchObject({ sentAt: "2026-10-29T14:30:00.000Z", media: [] });
    expect(bulletinListSchema.safeParse(list).success).toBe(true);
  });
});
