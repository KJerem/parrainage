import { describe, expect, it } from "vitest";
import {
  agree,
  followedByLabel,
  mediaKindLabels,
  ofName,
  paymentStatusLabels,
  sentFromLabels,
  sponsoredSinceLabel,
} from "./labels";

describe("accords en genre", () => {
  it("choisit la forme féminine ou masculine", () => {
    expect(agree("F", "Suivie", "Suivi")).toBe("Suivie");
    expect(agree("M", "Suivie", "Suivi")).toBe("Suivi");
  });

  it("accorde « Parrainée depuis » et « Suivie par »", () => {
    expect(sponsoredSinceLabel("F", "2023-03-01")).toBe("Parrainée depuis mars 2023");
    expect(sponsoredSinceLabel("M", "2025-09-01")).toBe("Parrainé depuis septembre 2025");
    expect(followedByLabel("F")).toBe("Suivie par");
    expect(followedByLabel("M")).toBe("Suivi par");
  });
});

describe("ofName", () => {
  it("élide devant une voyelle", () => {
    expect(ofName("Aïcha")).toBe("d'Aïcha");
    expect(ofName("Esther")).toBe("d'Esther");
    expect(ofName("Ibrahim")).toBe("d'Ibrahim");
    expect(ofName("Yvette")).toBe("d'Yvette");
  });

  it("garde « de » devant une consonne, y compris le y consonne", () => {
    expect(ofName("Kofi")).toBe("de Kofi");
    expect(ofName("Mariam")).toBe("de Mariam");
    expect(ofName("Yao")).toBe("de Yao");
  });
});

describe("libellés d'énumérations", () => {
  it("couvre chaque statut de versement et type de média", () => {
    expect(paymentStatusLabels.RECEIVED).toBe("Reçu");
    expect(paymentStatusLabels.LATE).toBe("En retard");
    expect(Object.keys(paymentStatusLabels)).toHaveLength(5);
    expect(mediaKindLabels.VIDEO).toBe("Vidéo");
    expect(Object.keys(mediaKindLabels)).toHaveLength(7);
  });

  it("ne signale que l'envoi depuis l'école", () => {
    expect(sentFromLabels.SCHOOL_SESSION).toBe("envoyé depuis l'école");
    expect(sentFromLabels.WEB).toBeUndefined();
  });
});
