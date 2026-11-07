import type { RelaisChildRow, RelaisHome } from "@parrainage/contracts";
import { describe, expect, it } from "vitest";
import { defaultNewsTitle } from "./use-publish-form";
import {
  childAction,
  childStatusChip,
  childSummaryLabel,
  freshnessLabel,
  parrainsLabel,
  publishButtonLabel,
  quickChildren,
  relaisTodos,
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

const child = (overrides: Partial<RelaisChildRow> = {}): RelaisChildRow => ({
  id: "c",
  name: "Aïcha S.",
  age: 12,
  className: "CM2",
  schoolName: "EPP Bè",
  parrains: ["Claire M."],
  parrainIds: ["p-claire"],
  fileStatus: "VALIDATED",
  lastNewsAt: "2026-10-29T14:30:00Z",
  consentMedia: true,
  ...overrides,
});

describe("publication depuis le téléphone", () => {
  it("nomme le destinataire sur le bouton, comme RM-Publier", () => {
    expect(publishButtonLabel([])).toBe("Publier");
    expect(publishButtonLabel([child()])).toBe("Publier pour Claire M.");
    expect(publishButtonLabel([child(), child({ id: "k" })])).toBe("Publier pour Claire M.");
    expect(
      publishButtonLabel([child(), child({ id: "y", parrains: ["Marc P."], parrainIds: ["m"] })]),
    ).toBe("Publier pour 2 parrains");
    expect(publishButtonLabel([child({ parrains: [], parrainIds: [] })])).toBe("Publier");
  });

  it("propose d'abord les enfants qui attendent une nouvelle", () => {
    const list = [
      child({ id: "recent", lastNewsAt: "2026-10-29T00:00:00Z" }),
      child({ id: "vieux", lastNewsAt: "2026-07-01T00:00:00Z" }),
      child({ id: "jamais", lastNewsAt: null }),
      child({ id: "moyen", lastNewsAt: "2026-09-01T00:00:00Z" }),
      child({ id: "sans-parrain", lastNewsAt: null, parrains: [], parrainIds: [] }),
    ];
    expect(quickChildren(list, []).map((c) => c.id)).toEqual(["jamais", "vieux", "moyen"]);
  });

  it("garde visible l'enfant choisi, même récent", () => {
    const list = [
      child({ id: "recent", lastNewsAt: "2026-10-29T00:00:00Z" }),
      child({ id: "vieux", lastNewsAt: "2026-07-01T00:00:00Z" }),
      child({ id: "jamais", lastNewsAt: null }),
      child({ id: "moyen", lastNewsAt: "2026-09-01T00:00:00Z" }),
    ];
    expect(quickChildren(list, ["recent"]).map((c) => c.id)).toEqual(["recent", "jamais", "vieux"]);
  });

  it("déduit le titre des enfants choisis", () => {
    expect(defaultNewsTitle("ONE_CHILD", [child()])).toBe("Nouvelles d'Aïcha");
    expect(defaultNewsTitle("ONE_CHILD", [child({ name: "Kofi A." })])).toBe("Nouvelles de Kofi");
    expect(defaultNewsTitle("SEVERAL_CHILDREN", [child(), child()])).toBe("Nouvelles du relais");
    expect(defaultNewsTitle("RELAIS_LIFE", [])).toBe("Vie du relais");
  });
});

describe("relaisTodos", () => {
  const home = (overrides: Partial<RelaisHome> = {}): RelaisHome => ({
    stats: { childCount: 18, newsThisMonth: 11, unreadMessages: 0, bulletinsToEnter: 0 },
    bulletinsDue: null,
    draftCount: 0,
    children: [],
    now,
    ...overrides,
  });

  it("ne dit rien quand tout va bien", () => {
    expect(relaisTodos(home({ children: [child()] }))).toEqual([]);
  });

  it("classe les enfants sans nouvelle du plus ancien au plus récent", () => {
    const todos = relaisTodos(
      home({
        children: [
          child({ id: "k", name: "Kofi A.", lastNewsAt: "2026-08-28T09:00:00Z" }),
          child({ id: "e", name: "Elom Z.", lastNewsAt: "2026-07-03T09:00:00Z" }),
          child({ id: "y", name: "Yao D.", lastNewsAt: "2026-09-26T09:00:00Z" }),
        ],
      }),
    );
    expect(todos.map((todo) => [todo.title, todo.detail])).toEqual([
      ["Elom Z.", "Pas de nouvelle depuis 120 jours"],
      ["Kofi A.", "Pas de nouvelle depuis 64 jours"],
    ]);
    expect(todos[0]).toMatchObject({
      href: "/relais/publier?enfant=e",
      badge: "EZ",
      tone: "danger",
    });
  });

  it("ignore un dossier pas encore validé", () => {
    const todos = relaisTodos(
      home({ children: [child({ fileStatus: "SUBMITTED", lastNewsAt: null })] }),
    );
    expect(todos).toEqual([]);
  });

  it("annonce les bulletins, les dossiers et les messages", () => {
    const todos = relaisTodos(
      home({
        stats: { childCount: 18, newsThisMonth: 11, unreadMessages: 2, bulletinsToEnter: 7 },
        bulletinsDue: { term: "T1", label: "1er trimestre", dueDate: "2026-11-15" },
        draftCount: 1,
      }),
    );
    expect(todos.map((todo) => [todo.kind, todo.title, todo.detail])).toEqual([
      ["messages", "Messages non lus", "Dans vos conversations"],
      ["bulletins", "Bulletins du 1er trimestre", "7 enfants sur 18 restent à saisir"],
      ["drafts", "Dossier à terminer", "Pas encore envoyé au bureau"],
    ]);
  });

  it("accorde au singulier", () => {
    const [todo] = relaisTodos(
      home({
        stats: { childCount: 1, newsThisMonth: 0, unreadMessages: 0, bulletinsToEnter: 1 },
        bulletinsDue: { term: "T1", label: "1er trimestre", dueDate: null },
      }),
    );
    expect(todo?.detail).toBe("1 enfant sur 1 reste à saisir");
  });
});
