import { describe, expect, it } from "vitest";
import {
  bureauSponsorshipsQuerySchema,
  createSponsorshipSchema,
  inviteParrainSchema,
  parrainCandidatesQuerySchema,
} from "./bureau.js";

describe("bureau", () => {
  it("crée un binôme avec une mensualité en euros entiers et une date de début", () => {
    const input = {
      childId: "c",
      parrainId: "p",
      monthlyAmountCents: 2500,
      startDate: "2026-11-01",
    };
    expect(createSponsorshipSchema.safeParse(input).success).toBe(true);
    expect(
      createSponsorshipSchema.safeParse({ ...input, monthlyAmountCents: 2550 }).error?.issues[0]
        ?.message,
    ).toBe("Indiquez un montant en euros, sans centimes");
    expect(createSponsorshipSchema.safeParse({ ...input, startDate: "1er novembre" }).success).toBe(
      false,
    );
  });

  it("filtre les binômes par état lisible dans l'adresse", () => {
    expect(bureauSponsorshipsQuerySchema.parse({ etat: "a-relancer" }).etat).toBe("a-relancer");
    expect(bureauSponsorshipsQuerySchema.safeParse({ etat: "TO_FOLLOW_UP" }).success).toBe(false);
  });

  it("invite un parrain : nom, e-mail et ville obligatoires, France par défaut", () => {
    const invite = inviteParrainSchema.parse({
      firstName: " Léa ",
      lastName: "Bernard",
      email: "lea.b@exemple.fr",
      gender: "F",
      city: "Rennes",
    });
    expect(invite).toMatchObject({ firstName: "Léa", country: "France", wishes: "" });
    const missing = inviteParrainSchema.safeParse({ email: "x", gender: "F" });
    expect(missing.error?.issues.map((issue) => issue.path[0])).toEqual([
      "firstName",
      "lastName",
      "email",
      "city",
    ]);
  });

  it("cherche un parrain avec un texte court", () => {
    expect(parrainCandidatesQuerySchema.parse({}).q).toBe("");
    expect(parrainCandidatesQuerySchema.safeParse({ q: "x".repeat(61) }).success).toBe(false);
  });
});
