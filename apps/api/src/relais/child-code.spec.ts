import { childCodeImages, childCodeSchema } from "@parrainage/contracts";
import {
  hashChildCode,
  randomChildCode,
  readChildCodeToken,
  signChildCode,
  verifyChildCode,
} from "./child-code.js";

const PEPPER = "poivre-de-test-suffisamment-long-pour-le-schema";
const AT = new Date("2026-10-31T10:00:00Z");
const CODE = ["SOLEIL", "ARBRE", "POISSON"] as const;
const code = [...CODE];

describe("code image", () => {
  it("tire 3 images différentes parmi les 6", () => {
    for (let run = 0; run < 50; run += 1) {
      expect(childCodeSchema.safeParse(randomChildCode()).success).toBe(true);
    }
  });

  it("finit par proposer chaque image", () => {
    const seen = new Set(Array.from({ length: 200 }, randomChildCode).flat());
    expect([...seen].sort()).toEqual([...childCodeImages].sort());
  });

  it("vérifie le code haché, dans l'ordre et avec le poivre", async () => {
    const stored = await hashChildCode(code, PEPPER);
    expect(stored).toMatch(/^\$argon2id\$/);
    expect(stored).not.toContain("SOLEIL");
    expect(await verifyChildCode(stored, code, PEPPER)).toBe(true);
    expect(await verifyChildCode(stored, ["ARBRE", "SOLEIL", "POISSON"], PEPPER)).toBe(false);
    expect(
      await verifyChildCode(stored, code, "un-autre-poivre-tout-aussi-long-que-le-premier"),
    ).toBe(false);
  });
});

describe("jeton de proposition", () => {
  const token = signChildCode(code, PEPPER, AT);

  it("rend le code proposé", () => {
    expect(readChildCodeToken(token, PEPPER, AT)).toEqual(code);
  });

  it("refuse un code modifié par le navigateur", () => {
    const forged = token.replace("SOLEIL", "COEUR");
    expect(readChildCodeToken(forged, PEPPER, AT)).toBeNull();
  });

  it("refuse une signature d'un autre poivre, ou un jeton illisible", () => {
    const other = signChildCode(code, "un-autre-poivre-tout-aussi-long-que-le-premier", AT);
    expect(readChildCodeToken(other, PEPPER, AT)).toBeNull();
    expect(readChildCodeToken("n'importe quoi", PEPPER, AT)).toBeNull();
    expect(readChildCodeToken("", PEPPER, AT)).toBeNull();
  });

  it("expire au bout de 24 h", () => {
    const later = new Date(AT.getTime() + 24 * 3600 * 1000 + 1);
    expect(readChildCodeToken(token, PEPPER, later)).toBeNull();
  });
});
