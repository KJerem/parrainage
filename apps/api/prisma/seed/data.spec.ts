import { avatarToneSchema } from "@parrainage/contracts";
import { buildSeedData, DEFAULT_MONTHLY_CENTS } from "./data.js";
import { day, schoolYearOf, seedToday } from "./dates.js";

const today = day("2026-10-31");
const data = buildSeedData(today);
const childOf = (firstName: string) => data.children.find((c) => c.firstName === firstName)!;
const parrainsOf = (childId: string) =>
  data.sponsorships
    .filter((s) => s.childId === childId && s.status === "ACTIVE")
    .map((s) => data.parrains.find((p) => p.profile.id === s.parrainId)!.email)
    .sort();

describe("données du seed", () => {
  it("est reproductible", () => {
    expect(buildSeedData(today)).toEqual(data);
  });

  it("répartit 18, 11 et 9 enfants entre les trois relais", () => {
    const counts = data.relais.map(
      (r) => data.children.filter((c) => c.relaisId === r.relais.id).length,
    );
    expect(counts).toEqual([18, 11, 9]);
    expect(data.relais.map((r) => r.email)).toEqual([
      "koffi@relais.exemple.tg",
      "diallo@relais.exemple.tg",
      "agbeko@relais.exemple.tg",
    ]);
  });

  it("laisse exactement 3 enfants sans binôme actif, dont Esther", () => {
    const sponsored = new Set(data.sponsorships.map((s) => s.childId));
    const waiting = data.children.filter((c) => !sponsored.has(c.id));
    expect(waiting).toHaveLength(3);
    expect(waiting.map((c) => c.firstName)).toContain("Esther");
  });

  it("reprend les binômes du design", () => {
    expect(parrainsOf(childOf("Aïcha").id)).toEqual(["claire.m@exemple.fr"]);
    expect(parrainsOf(childOf("Kofi").id)).toEqual(["claire.m@exemple.fr", "paul.d@exemple.fr"]);
    expect(parrainsOf(childOf("Mariam").id)).toEqual(["helene.r@exemple.fr"]);
    expect(parrainsOf(childOf("Yao").id)).toEqual(["marc.p@exemple.fr"]);
    expect(parrainsOf(childOf("Ibrahim").id)).toEqual(["sophie.l2@exemple.fr"]);
    const aicha = data.sponsorships.find((s) => s.childId === childOf("Aïcha").id)!;
    expect(aicha.startDate).toEqual(day("2023-03-01"));
    expect(data.sponsorships.every((s) => s.monthlyAmountCents === DEFAULT_MONTHLY_CENTS)).toBe(
      true,
    );
  });

  it("décrit Esther comme un dossier soumis, sans consentement médias", () => {
    const esther = childOf("Esther");
    expect(esther).toMatchObject({
      fileStatus: "SUBMITTED",
      className: "CE1",
      guardianName: "Mme N. (mère)",
      consentMedia: false,
      birthDate: day("2018-03-12"),
      validatedAt: null,
    });
  });

  it("donne aux enfants du design leur âge et leur classe", () => {
    const age = (birthDate: Date) =>
      Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 3600 * 1000));
    expect(
      [childOf("Aïcha"), childOf("Kofi"), childOf("Yao"), childOf("Mariam")].map((c) => [
        c.className,
        age(c.birthDate),
      ]),
    ).toEqual([
      ["CM2", 12],
      ["CE2", 10],
      ["5e", 14],
      ["CM1", 11],
    ]);
    expect(childOf("Aïcha").schoolYear).toBe("2026-2027");
  });

  it("ne contient que des téléphones masqués, des teintes valides et des e-mails uniques", () => {
    expect(new Set(data.children.map((c) => c.guardianPhone))).toEqual(
      new Set(["+228 ·· ·· ·· ··"]),
    );
    for (const tone of [...data.children, ...data.parrains.map((p) => p.profile)].map(
      (x) => x.avatarTone,
    )) {
      expect(avatarToneSchema.safeParse(tone).success).toBe(true);
    }
    const emails = [data.bureau, ...data.parrains, ...data.relais].map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
    expect(data.parrains).toHaveLength(31);
  });

  it("ne date aucun binôme dans le futur", () => {
    expect(data.sponsorships.every((s) => s.startDate.getTime() <= today.getTime())).toBe(true);
  });
});

describe("dates du seed", () => {
  it("lit SEED_TODAY au format AAAA-MM-JJ", () => {
    expect(seedToday("2026-10-31")).toEqual(day("2026-10-31"));
    expect(() => seedToday("31/10/2026")).toThrow(/SEED_TODAY invalide/);
  });

  it("calcule l'année scolaire à partir de la rentrée de septembre", () => {
    expect(schoolYearOf(day("2026-09-01"))).toBe("2026-2027");
    expect(schoolYearOf(day("2026-08-31"))).toBe("2025-2026");
  });
});
