import { describe, expect, it } from "vitest";
import {
  childAction,
  childStatusChip,
  childSummaryLabel,
  freshnessLabel,
  parrainsLabel,
  schoolingLabel,
} from "./relais-labels";

const now = "2026-10-31T10:00:00Z";

describe("libellés de l'espace relais", () => {
  it.each([
    [0, "Aujourd'hui"],
    [1, "Hier"],
    [2, "il y a 2 j"],
    [6, "il y a 6 j"],
    [29, "il y a 29 j"],
    [30, "30 jours"],
    [35, "35 jours"],
    [64, "64 jours"],
  ])("%i jours : « %s »", (days, label) => {
    expect(freshnessLabel(days)).toBe(label);
  });

  it("colore la dernière nouvelle selon les seuils du plan", () => {
    const chip = (lastNewsAt: string | null) =>
      childStatusChip({ fileStatus: "VALIDATED", lastNewsAt }, now);
    expect(chip("2026-10-29T14:30:00Z")).toEqual({ label: "il y a 2 j", variant: "success" });
    expect(chip("2026-09-26T09:00:00Z")).toEqual({ label: "35 jours", variant: "warning" });
    expect(chip("2026-08-28T09:00:00Z")).toEqual({ label: "64 jours", variant: "danger" });
    expect(chip(null)).toEqual({ label: "Aucune nouvelle", variant: "danger" });
  });

  it("fait passer l'état du dossier avant la fraîcheur", () => {
    expect(childStatusChip({ fileStatus: "SUBMITTED", lastNewsAt: null }, now)).toEqual({
      label: "Nouveau dossier",
      variant: "info",
    });
    expect(childStatusChip({ fileStatus: "DRAFT", lastNewsAt: null }, now).label).toBe("Brouillon");
  });

  it("résume les parrains", () => {
    expect(parrainsLabel([])).toBeNull();
    expect(parrainsLabel(["Marc P."])).toBe("Marc P.");
    expect(parrainsLabel(["Claire M.", "Paul D."])).toBe("Claire M. +1");
  });

  it("résume la scolarité, même incomplète", () => {
    expect(schoolingLabel({ className: "CM2", schoolName: "EPP Bè" })).toBe("CM2 · EPP Bè");
    expect(schoolingLabel({ className: "", schoolName: "EPP Bè" })).toBe("EPP Bè");
    expect(schoolingLabel({ className: "", schoolName: null })).toBe("À compléter");
    expect(childSummaryLabel(8, "CE1", "EPP Bè")).toBe("8 ans · CE1 · EPP Bè");
    expect(childSummaryLabel(null, "", null)).toBe("À compléter");
  });

  it("propose de publier pour un enfant suivi, de compléter sinon", () => {
    expect(childAction({ id: "a b", fileStatus: "VALIDATED" })).toEqual({
      label: "Publier",
      href: "/relais/publier?enfant=a%20b",
    });
    expect(childAction({ id: "e", fileStatus: "SUBMITTED" })).toEqual({
      label: "Compléter",
      href: "/relais/enfants/e",
    });
  });
});
