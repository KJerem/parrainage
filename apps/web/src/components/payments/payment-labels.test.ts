import { describe, expect, it } from "vitest";
import {
  childShortName,
  debitDayLabel,
  debitLine,
  historyDate,
  historyMethodLabel,
  monthlyChangedToast,
  monthlyTitle,
  paidLine,
} from "./payment-labels";

describe("libellés des versements", () => {
  it("résume la mensualité comme la maquette", () => {
    expect(monthlyTitle(2)).toBe("Mensualité · 2 filleuls");
    expect(monthlyTitle(1)).toBe("Mensualité · 1 filleul");
    expect(debitLine("SEPA_DEBIT", 5)).toBe("Prélèvement le 5 du mois");
    expect(debitLine("CARD", 1)).toBe("Carte bancaire, le 1er du mois");
  });

  it("compte les versements et les incidents", () => {
    expect(paidLine(10, 0)).toBe("10 versements, aucun incident");
    expect(paidLine(1, 2)).toBe("1 versement, 2 incidents");
    expect(paidLine(0, 1)).toBe("0 versement, 1 incident");
  });

  it("affiche le don ponctuel à la place du moyen", () => {
    expect(historyMethodLabel({ kind: "MONTHLY", label: null, method: "SEPA_DEBIT" })).toBe(
      "Prélèvement",
    );
    expect(
      historyMethodLabel({ kind: "ONE_OFF", label: "Don ponctuel · rentrée", method: "CARD" }),
    ).toBe("Don ponctuel · rentrée");
  });

  it("date les versements à la française", () => {
    expect(historyDate("2026-10-05")).toBe("5 oct. 2026");
    expect(historyDate("2026-09-15")).toBe("15 sept. 2026");
    expect(historyDate("2026-11-01")).toBe("1er nov. 2026");
    expect(debitDayLabel("2026-11-05")).toBe("5 novembre");
    expect(childShortName({ firstName: "Aïcha", lastInitial: "S" })).toBe("Aïcha S.");
  });

  it("confirme une nouvelle mensualité", () => {
    expect(monthlyChangedToast("Aïcha", 3000, "2026-11")).toBe(
      "Nouvelle mensualité pour Aïcha : 30 € à partir de novembre 2026",
    );
  });
});
