import { describe, expect, it } from "vitest";
import { detectAlerts } from "./detector.js";
import {
  automaticAlertLabel,
  charterRule,
  charterRuleForReason,
  MASKED_PLACEHOLDER,
  maskAlerts,
  moderationAlert,
  moderationContentLabel,
  moderationDecisionSchema,
  moderationQueueQuerySchema,
  splitByAlerts,
  suggestedReason,
} from "./moderation.js";

const attachment = (kind: "PHOTO" | "VIDEO" | "BULLETIN" | "DOCUMENT", extra = {}) => ({
  kind,
  label: null,
  durationSec: null,
  ...extra,
});

describe("moderationContentLabel", () => {
  it.each([
    [true, [], "Texte"],
    [true, [attachment("BULLETIN", { label: "Bulletin T1 — page 2" })], "Texte + bulletin T1"],
    [true, [attachment("BULLETIN", { label: "Bulletin annuel" })], "Texte + bulletin"],
    [false, [attachment("VIDEO", { durationSec: 35 })], "Vidéo 0:35"],
    [false, [attachment("VIDEO", { durationSec: 125 })], "Vidéo 2:05"],
    [false, [attachment("VIDEO")], "Vidéo"],
    [true, [attachment("PHOTO"), attachment("PHOTO")], "Texte + 2 photos"],
    [false, [attachment("VIDEO"), attachment("VIDEO")], "2 vidéos"],
    [false, [attachment("DOCUMENT")], "Document"],
    [false, [], "Message vide"],
  ])("%s, %j donne %s", (hasText, attachments, expected) => {
    expect(moderationContentLabel({ hasText, attachments })).toBe(expected);
  });
});

describe("moderationAlert", () => {
  it("regroupe les coordonnées, en danger, avec une version courte", () => {
    expect(moderationAlert(["PHONE"], [])).toEqual({
      label: "Coordonnées personnelles",
      shortLabel: "Coordonnées",
      tone: "danger",
      flagged: true,
    });
    expect(moderationAlert(["SOCIAL", "URL"], []).label).toBe("Coordonnées personnelles");
  });

  it("nomme l'argent et les rendez-vous", () => {
    expect(moderationAlert(["MONEY"], []).label).toBe("Argent ou transfert");
    expect(moderationAlert(["MEETING"], []).tone).toBe("danger");
  });

  it("montre un signalement manuel en avertissement", () => {
    expect(moderationAlert([], ["OTHER_CHILD_FACE"])).toMatchObject({
      label: "Visage d'un autre enfant",
      tone: "warning",
    });
  });

  it("fait passer ce qui expose l'enfant avant un signalement", () => {
    expect(moderationAlert(["PHONE"], ["OTHER_CHILD_FACE"]).tone).toBe("danger");
  });

  it("répond « Aucune » sans alerte", () => {
    expect(moderationAlert([], [])).toEqual({
      label: "Aucune",
      shortLabel: "Aucune",
      tone: "success",
      flagged: false,
    });
  });
});

describe("automaticAlertLabel", () => {
  it("reprend le libellé de la maquette", () => {
    expect(automaticAlertLabel(["PHONE"])).toBe("Alerte automatique : numéro de téléphone");
  });

  it("liste plusieurs alertes et ne dit rien sans alerte", () => {
    expect(automaticAlertLabel(["PHONE", "EMAIL"])).toBe(
      "Alerte automatique : numéro de téléphone, adresse e-mail",
    );
    expect(automaticAlertLabel([])).toBeNull();
  });
});

describe("suggestedReason et charterRule", () => {
  it("propose le motif qui correspond à l'alerte", () => {
    expect(suggestedReason(["PHONE"], [])).toBe("OFF_PLATFORM_CONTACT");
    expect(suggestedReason([], ["OTHER_CHILD_FACE"])).toBe("THIRD_PARTY_PHOTO");
    expect(suggestedReason([], ["INAPPROPRIATE_CONTENT"])).toBe("INAPPROPRIATE_CONTENT");
    expect(suggestedReason([], [])).toBe("OFF_PLATFORM_CONTACT");
  });

  it("choisit la règle de la charte d'après l'alerte", () => {
    expect(charterRule(["PHONE"], [])).toMatch(/hors plateforme/);
    expect(charterRule(["MONEY"], [])).toMatch(/argent/);
    expect(charterRule(["MEETING"], [])).toMatch(/rencontre/);
    expect(charterRule([], ["OTHER_CHILD_FACE"])).toMatch(/autorisation/);
    expect(charterRule([], ["INAPPROPRIATE_CONTENT"])).toMatch(/bienveillants/);
    expect(charterRule([], [])).toMatch(/hors plateforme/);
  });

  it("choisit la règle de la charte d'après le motif", () => {
    expect(charterRuleForReason("OFF_PLATFORM_CONTACT")).toMatch(/hors plateforme/);
    expect(charterRuleForReason("THIRD_PARTY_PHOTO")).toMatch(/autorisation/);
    expect(charterRuleForReason("INAPPROPRIATE_CONTENT")).toMatch(/bienveillants/);
    expect(charterRuleForReason("OTHER")).toMatch(/bienveillants/);
  });
});

describe("splitByAlerts et maskAlerts", () => {
  const text = "Je note le 06 39 98 12 34, à bientôt !";

  it("garde les positions du texte d'origine", () => {
    const { spans } = detectAlerts(text);
    const segments = splitByAlerts(text, spans);
    expect(segments.map((s) => s.text).join("")).toBe(text);
    expect(segments.find((s) => s.alert !== null)).toEqual({
      text: "06 39 98 12 34",
      alert: "PHONE",
    });
  });

  it("ne garde pas d'accent ni d'emoji décalé", () => {
    const accented = "🎉 Écris à léa@exemple.fr, s'il te plaît";
    const { spans } = detectAlerts(accented);
    expect(splitByAlerts(accented, spans).find((s) => s.alert)?.text).toBe("léa@exemple.fr");
  });

  it("masque chaque passage et laisse le reste", () => {
    expect(maskAlerts(text, detectAlerts(text).spans)).toBe(
      `Je note le ${MASKED_PLACEHOLDER}, à bientôt !`,
    );
  });

  it("fusionne deux passages qui se chevauchent", () => {
    const spans = [
      { type: "PHONE" as const, start: 2, end: 6 },
      { type: "EMAIL" as const, start: 4, end: 8 },
    ];
    expect(splitByAlerts("abcdefghij", spans)).toEqual([
      { text: "ab", alert: null },
      { text: "cdefgh", alert: "PHONE" },
      { text: "ij", alert: null },
    ]);
  });

  it("ignore un passage hors du texte", () => {
    const spans = [{ type: "PHONE" as const, start: 40, end: 50 }];
    expect(splitByAlerts("court", spans)).toEqual([{ text: "court", alert: null }]);
    expect(maskAlerts("court", spans)).toBe("court");
  });

  it("rend un texte vide sans segment", () => {
    expect(splitByAlerts("", [])).toEqual([]);
  });
});

describe("moderationDecisionSchema", () => {
  it("accepte une approbation sans motif", () => {
    expect(moderationDecisionSchema.parse({ decision: "APPROVE" })).toEqual({
      decision: "APPROVE",
    });
  });

  it("exige un motif pour masquer et retenir", () => {
    expect(moderationDecisionSchema.safeParse({ decision: "HOLD" }).success).toBe(false);
    expect(
      moderationDecisionSchema.safeParse({ decision: "MASK", redactedBody: "x" }).success,
    ).toBe(false);
  });

  it("nettoie la version masquée et ajoute la liste des pièces retirées", () => {
    expect(
      moderationDecisionSchema.parse({
        decision: "MASK",
        reason: "OFF_PLATFORM_CONTACT",
        redactedBody: "  Bonjour  ",
      }),
    ).toEqual({
      decision: "MASK",
      reason: "OFF_PLATFORM_CONTACT",
      redactedBody: "Bonjour",
      removedMediaIds: [],
    });
  });

  it("refuse une décision inconnue", () => {
    expect(moderationDecisionSchema.safeParse({ decision: "DELETE" }).success).toBe(false);
  });
});

describe("moderationQueueQuerySchema", () => {
  it("revient à « Tous » sans filtre ou avec un filtre inconnu", () => {
    expect(moderationQueueQuerySchema.parse({}).filtre).toBe("tous");
    expect(moderationQueueQuerySchema.parse({ filtre: "nimporte" }).filtre).toBe("tous");
    expect(moderationQueueQuerySchema.parse({ filtre: "signales" }).filtre).toBe("signales");
  });
});
