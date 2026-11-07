import { describe, expect, it } from "vitest";
import {
  classSessionDurationLabel,
  DEFAULT_CLASS_SESSION_RIGHTS,
  eleveLoginSchema,
  eleveMediaPath,
  eleveSendMessageSchema,
  openClassSessionSchema,
  planClassSessionSchema,
} from "./eleve.js";

const open = {
  childIds: ["a", "b"],
  durationMinutes: 45,
  rights: DEFAULT_CLASS_SESSION_RIGHTS,
};

describe("ouverture d'une session", () => {
  it("accepte 30, 45 ou 60 minutes, et rien d'autre", () => {
    for (const durationMinutes of [30, 45, 60]) {
      expect(openClassSessionSchema.safeParse({ ...open, durationMinutes }).success).toBe(true);
    }
    expect(openClassSessionSchema.safeParse({ ...open, durationMinutes: 90 }).success).toBe(false);
  });

  it("exige au moins un enfant, sans doublon", () => {
    expect(openClassSessionSchema.safeParse({ ...open, childIds: [] }).success).toBe(false);
    expect(openClassSessionSchema.safeParse({ ...open, childIds: ["a", "a"] }).success).toBe(false);
  });

  it("exige au moins un droit", () => {
    const rights = { writeSponsor: false, media: false, bulletin: false, writeAssociation: false };
    expect(openClassSessionSchema.safeParse({ ...open, rights }).success).toBe(false);
  });

  it("planifie à une date précise", () => {
    expect(
      planClassSessionSchema.safeParse({ ...open, scheduledAt: "2026-11-03T15:15:00Z" }).success,
    ).toBe(true);
    expect(planClassSessionSchema.safeParse(open).success).toBe(false);
  });

  it("nomme les durées comme la maquette", () => {
    expect(classSessionDurationLabel(30)).toBe("30 min");
    expect(classSessionDurationLabel(60)).toBe("1 h");
  });
});

describe("connexion d'un enfant", () => {
  it("attend trois images différentes", () => {
    const login = { childId: "c", code: ["SOLEIL", "ARBRE", "POISSON"] };
    expect(eleveLoginSchema.safeParse(login).success).toBe(true);
    expect(eleveLoginSchema.safeParse({ ...login, code: ["SOLEIL", "ARBRE"] }).success).toBe(false);
    expect(
      eleveLoginSchema.safeParse({ ...login, code: ["SOLEIL", "SOLEIL", "ARBRE"] }).success,
    ).toBe(false);
    expect(eleveLoginSchema.safeParse({ ...login, code: ["A", "B", "C"] }).success).toBe(false);
  });
});

describe("message d'un enfant", () => {
  const key = { idempotencyKey: "cle-de-test-1" };

  it("accepte un texte seul, ou un fichier sans texte", () => {
    expect(eleveSendMessageSchema.safeParse({ ...key, body: "Bonjour" }).success).toBe(true);
    expect(eleveSendMessageSchema.safeParse({ ...key, mediaIds: ["m"] }).success).toBe(true);
  });

  it("refuse un message vide", () => {
    expect(eleveSendMessageSchema.safeParse({ ...key, body: "   " }).success).toBe(false);
  });

  it("exige une page pour un bulletin", () => {
    expect(
      eleveSendMessageSchema.safeParse({ ...key, body: "Coucou", bulletin: true }).success,
    ).toBe(false);
    expect(
      eleveSendMessageSchema.safeParse({ ...key, mediaIds: ["m"], bulletin: true }).success,
    ).toBe(true);
  });

  it("refuse le même fichier deux fois et plus de 4 fichiers", () => {
    expect(eleveSendMessageSchema.safeParse({ ...key, mediaIds: ["m", "m"] }).success).toBe(false);
    expect(
      eleveSendMessageSchema.safeParse({ ...key, mediaIds: ["a", "b", "c", "d", "e"] }).success,
    ).toBe(false);
  });
});

describe("eleveMediaPath", () => {
  it("passe par l'espace enfant, et seulement pour un fichier prêt", () => {
    expect(eleveMediaPath({ id: "a b", status: "READY" })).toBe("/api/eleve/media/a%20b");
    expect(eleveMediaPath({ id: "a", status: "PLACEHOLDER" })).toBeNull();
  });
});
