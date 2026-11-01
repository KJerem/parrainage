import { describe, expect, it } from "vitest";
import { initials } from "./initials.js";

describe("initials", () => {
  it.each([
    ["Claire M.", "CM"],
    ["M. Koffi", "MK"],
    ["Mme Diallo", "MD"],
    ["Bureau · trésorerie", "BT"],
    ["Aïcha S.", "AS"],
    ["Élodie", "É"],
    ["  jean   pierre  martin ", "JM"],
  ])("« %s » donne « %s »", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it("renvoie un repère quand le nom ne contient aucune lettre", () => {
    expect(initials(" · ")).toBe("?");
  });
});
