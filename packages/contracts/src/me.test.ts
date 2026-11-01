import { describe, expect, it } from "vitest";
import { meSchema } from "./me.js";
import { roleSchema } from "./roles.js";

describe("meSchema", () => {
  const base = {
    user: {
      id: "u1",
      name: "Claire M.",
      email: "claire.m@exemple.fr",
      role: "parrain",
      initials: "CM",
    },
    parrain: { displayName: "Claire M.", avatarTone: "info-strong" },
    relais: null,
  };

  it("accepte un parrain avec son profil", () => {
    expect(meSchema.parse(base)).toEqual(base);
  });

  it("refuse un rôle ou une teinte inconnus", () => {
    expect(meSchema.safeParse({ ...base, user: { ...base.user, role: "admin" } }).success).toBe(
      false,
    );
    expect(
      meSchema.safeParse({ ...base, parrain: { displayName: "Claire M.", avatarTone: "rose" } })
        .success,
    ).toBe(false);
  });

  it("connaît exactement les trois rôles", () => {
    expect(roleSchema.options).toEqual(["parrain", "relais", "bureau"]);
  });
});
