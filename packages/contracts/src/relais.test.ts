import { describe, expect, it } from "vitest";
import {
  childCodeSchema,
  childFieldsSchema,
  childSubmissionIssues,
  createNewsSchema,
  daysSince,
  formatAverageInput,
  formatRankInput,
  newsFreshness,
  parseAverage,
  parseRank,
  saveResultSchema,
  schoolYearOf,
} from "./relais.js";

describe("schoolYearOf", () => {
  it("change d'année en septembre", () => {
    expect(schoolYearOf(new Date("2026-08-31T12:00:00Z"))).toBe("2025-2026");
    expect(schoolYearOf(new Date("2026-09-01T00:00:00Z"))).toBe("2026-2027");
    expect(schoolYearOf(new Date("2027-01-15T00:00:00Z"))).toBe("2026-2027");
  });
});

describe("fraîcheur des nouvelles", () => {
  it.each([
    [0, "fresh"],
    [29, "fresh"],
    [30, "aging"],
    [59, "aging"],
    [60, "stale"],
    [400, "stale"],
  ])("%i jours : %s", (days, expected) => {
    expect(newsFreshness(days)).toBe(expected);
  });

  it("compte les jours civils, jamais négatifs", () => {
    expect(daysSince("2026-08-28T23:00:00Z", "2026-10-31T01:00:00Z")).toBe(64);
    expect(daysSince("2026-10-31T23:00:00Z", "2026-10-31T01:00:00Z")).toBe(0);
    expect(daysSince("2026-11-02T00:00:00Z", "2026-10-31T01:00:00Z")).toBe(0);
  });
});

describe("moyenne", () => {
  it.each([
    ["13,4", 1340],
    ["13.4", 1340],
    [" 12 ", 1200],
    ["13,45", 1345],
    ["0", 0],
    ["20", 2000],
    ["", null],
  ])("« %s » donne %s", (text, expected) => {
    expect(parseAverage(text)).toBe(expected);
  });

  it.each(["20,5", "abc", "13,456", "-3", "1 3", "13,4 / 20"])("refuse « %s »", (text) => {
    expect(parseAverage(text)).toBeUndefined();
  });

  it("se réaffiche à la française", () => {
    expect(formatAverageInput(1340)).toBe("13,4");
    expect(formatAverageInput(1200)).toBe("12");
    expect(formatAverageInput(1345)).toBe("13,45");
    expect(formatAverageInput(null)).toBe("");
  });

  it("revient à la même valeur après un aller-retour", () => {
    for (const x100 of [1090, 1180, 1340, 1999, 5]) {
      expect(parseAverage(formatAverageInput(x100))).toBe(x100);
    }
  });
});

describe("rang", () => {
  it("lit le rang, avec ou sans effectif", () => {
    expect(parseRank("5 / 48")).toEqual({ rank: 5, classSize: 48 });
    expect(parseRank("5/48")).toEqual({ rank: 5, classSize: 48 });
    expect(parseRank("21")).toEqual({ rank: 21, classSize: null });
    expect(parseRank("  ")).toEqual({ rank: null, classSize: null });
  });

  it.each(["0", "49 / 48", "cinq", "5 / ", "5 / 48 / 2"])("refuse « %s »", (text) => {
    expect(parseRank(text)).toBeUndefined();
  });

  it("se réaffiche", () => {
    expect(formatRankInput({ rank: 5, classSize: 48 })).toBe("5 / 48");
    expect(formatRankInput({ rank: 5, classSize: null })).toBe("5");
    expect(formatRankInput({ rank: null, classSize: null })).toBe("");
  });
});

describe("saveResultSchema", () => {
  const base = {
    averageX100: 1340,
    rank: 5,
    classSize: 48,
    appreciation: "  Bien  ",
    clientUpdatedAt: "2026-10-31T10:00:00Z",
  };

  it("nettoie l'appréciation, une chaîne vide devient nulle", () => {
    expect(saveResultSchema.parse(base).appreciation).toBe("Bien");
    expect(saveResultSchema.parse({ ...base, appreciation: "  " }).appreciation).toBeNull();
  });

  it("refuse une moyenne hors barème et un rang au-delà de l'effectif", () => {
    expect(saveResultSchema.safeParse({ ...base, averageX100: 2050 }).success).toBe(false);
    expect(saveResultSchema.safeParse({ ...base, rank: 49 }).success).toBe(false);
  });
});

describe("code image", () => {
  it("exige trois images différentes", () => {
    expect(childCodeSchema.safeParse(["SOLEIL", "ARBRE", "POISSON"]).success).toBe(true);
    expect(childCodeSchema.safeParse(["SOLEIL", "SOLEIL", "POISSON"]).success).toBe(false);
    expect(childCodeSchema.safeParse(["SOLEIL", "ARBRE"]).success).toBe(false);
    expect(childCodeSchema.safeParse(["SOLEIL", "ARBRE", "LICORNE"]).success).toBe(false);
  });
});

describe("dossier d'un enfant", () => {
  const identity = {
    firstName: " Esther ",
    lastInitial: "n.",
    gender: "F",
    birthDate: "2018-03-12",
    schoolYear: "2026-2027",
  };

  it("accepte un brouillon avec la seule identité", () => {
    const fields = childFieldsSchema.parse(identity);
    expect(fields).toMatchObject({
      firstName: "Esther",
      lastInitial: "N",
      district: "",
      schoolId: null,
      consentSponsorship: false,
    });
  });

  it.each(["", "Nd", "12", "."])("refuse l'initiale « %s »", (lastInitial) => {
    expect(childFieldsSchema.safeParse({ ...identity, lastInitial }).success).toBe(false);
  });

  it("accepte une initiale accentuée", () => {
    expect(childFieldsSchema.parse({ ...identity, lastInitial: "é" }).lastInitial).toBe("É");
  });

  it("liste ce qui manque pour l'envoi au bureau", () => {
    const issues = childSubmissionIssues(childFieldsSchema.parse(identity));
    expect(Object.keys(issues).sort()).toEqual([
      "className",
      "consentSponsorship",
      "district",
      "guardianName",
      "guardianPhone",
      "schoolId",
    ]);
  });

  it("n'exige ni le consentement médias ni la photo", () => {
    const issues = childSubmissionIssues(
      childFieldsSchema.parse({
        ...identity,
        district: "Bè, Lomé",
        schoolId: "seed-school-be",
        className: "CE1",
        guardianName: "Mme N.",
        guardianPhone: "+228 90 12 34 56",
        consentSponsorship: true,
      }),
    );
    expect(issues).toEqual({});
  });

  it("refuse un téléphone illisible", () => {
    const issues = childSubmissionIssues(
      childFieldsSchema.parse({ ...identity, guardianPhone: "pas de téléphone" }),
    );
    expect(issues.guardianPhone).toBeDefined();
  });
});

describe("createNewsSchema", () => {
  const base = {
    type: "SEVERAL_CHILDREN",
    childIds: ["a", "b"],
    title: " Remise des kits ",
    body: "Merci !",
    idempotencyKey: "e2e-12345678",
  };

  it("nettoie et complète une nouvelle valide", () => {
    expect(createNewsSchema.parse(base)).toMatchObject({
      title: "Remise des kits",
      notifyParrains: true,
      notifyBureau: false,
      visibleToChildren: false,
      scheduledAt: null,
      mediaIds: [],
    });
  });

  it("vérifie le nombre d'enfants selon le type", () => {
    const issue = (input: object) =>
      createNewsSchema.safeParse({ ...base, ...input }).error?.issues[0]?.message;
    expect(issue({ type: "ONE_CHILD", childIds: ["a", "b"] })).toBe("Choisissez un enfant");
    expect(issue({ childIds: ["a"] })).toBe("Choisissez au moins deux enfants");
    expect(issue({ childIds: ["a", "a"] })).toBe("Le même enfant est choisi deux fois");
    expect(issue({ type: "RELAIS_LIFE", childIds: [] })).toBeUndefined();
  });

  it("exige au moins un destinataire", () => {
    const result = createNewsSchema.safeParse({ ...base, notifyParrains: false });
    expect(result.error?.issues[0]?.message).toBe("Choisissez au moins un destinataire");
  });

  it("refuse une clé d'idempotence douteuse", () => {
    expect(createNewsSchema.safeParse({ ...base, idempotencyKey: "a b" }).success).toBe(false);
  });
});
