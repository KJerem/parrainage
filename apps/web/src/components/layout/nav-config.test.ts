import { describe, expect, it } from "vitest";
import {
  bureauNav,
  countLabelFor,
  findActiveKey,
  parrainNav,
  relaisNav,
  withCounts,
} from "./nav-config";

describe("findActiveKey", () => {
  it.each([
    ["/parrain", "filleuls"],
    ["/parrain/nouvelles", "filleuls"],
    ["/parrain/filleuls/seed-child-aicha/bulletins", "filleuls"],
    ["/parrain/messages", "messages"],
    ["/parrain/messages/conv-1", "messages"],
    ["/parrain/appels", "appels"],
    ["/parrain/versements", "versements"],
  ])("espace parrain : %s → %s", (pathname, key) => {
    expect(findActiveKey(parrainNav, pathname)).toBe(key);
  });

  it("n'active aucune entrée hors des rubriques (compte, préfixe partiel)", () => {
    expect(findActiveKey(parrainNav, "/parrain/compte")).toBeUndefined();
    expect(findActiveKey(parrainNav, "/parrain/nouvelles-anciennes")).toBeUndefined();
    expect(findActiveKey(parrainNav, null)).toBeUndefined();
  });

  it("préfère le plus long préfixe (relais, bureau)", () => {
    expect(findActiveKey(relaisNav, "/relais")).toBe("accueil");
    expect(findActiveKey(relaisNav, "/relais/enfants/nouveau")).toBe("ajouter");
    expect(findActiveKey(relaisNav, "/relais/enfants/e1")).toBe("enfants");
    expect(findActiveKey(bureauNav, "/bureau/moderation/m1")).toBe("moderation");
    expect(findActiveKey(bureauNav, "/bureau/profil")).toBeUndefined();
  });
});

describe("compteurs de la navigation", () => {
  it("accorde le complément lu après le compteur", () => {
    const [messages] = withCounts(
      parrainNav.filter((item) => item.key === "messages"),
      { messages: 1 },
    );
    expect(countLabelFor(messages!)).toBe("non lu");
    expect(countLabelFor({ ...messages!, count: 2 })).toBe("non lus");
    const moderation = bureauNav.find((item) => item.key === "moderation")!;
    expect(countLabelFor({ ...moderation, count: 1 })).toBe("message à relire");
    expect(countLabelFor({ ...moderation, count: 12 })).toBe("messages à relire");
  });
});
