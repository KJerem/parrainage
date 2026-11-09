import { buildSeedContent } from "./content.js";
import { buildSeedData } from "./data.js";
import { day } from "./dates.js";
import { buildSeedReceipts } from "./receipts.js";

const today = day("2026-10-31");
const data = buildSeedData(today);
const content = buildSeedContent(today, data);
const receipts = buildSeedReceipts(today, data.parrains, content.payments);

describe("reçus fiscaux du seed", () => {
  it("émet les reçus 2024 et 2025 de Claire, au 15 janvier suivant", () => {
    const claire = receipts.filter((r) => r.parrainId === "seed-parrain-claire");
    expect(claire.map((r) => [r.year, r.number, r.amountCents, r.paymentCount])).toEqual([
      [2024, "2024-00001", 30000, 12],
      [2025, "2025-00001", 40000, 16],
    ]);
    expect(claire[1]).toMatchObject({
      donorName: "Claire Martin",
      donorAddress: "12 rue des Tilleuls\n69003 Lyon",
      methods: ["SEPA_DEBIT"],
      issuedAt: new Date("2026-01-15T09:00:00Z"),
    });
  });

  it("numérote chaque année sans trou ni doublon", () => {
    for (const year of [2024, 2025]) {
      const sequences = receipts.filter((r) => r.year === year).map((r) => r.sequence);
      expect(sequences).toEqual(sequences.map((_, index) => index + 1));
    }
    expect(new Set(receipts.map((r) => r.number)).size).toBe(receipts.length);
    expect(receipts.some((r) => r.year === 2026)).toBe(false);
  });

  it("attend la mi-janvier pour émettre le reçu de l'année close", () => {
    const early = buildSeedReceipts(day("2027-01-10"), data.parrains, content.payments);
    expect(early.some((r) => r.year === 2026)).toBe(false);
    const later = buildSeedReceipts(day("2027-01-20"), data.parrains, content.payments);
    expect(later.some((r) => r.year === 2026)).toBe(true);
  });
});
