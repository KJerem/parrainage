import { meSchema } from "@parrainage/contracts";
import { type MeSource, toMe } from "./me.mapper.js";

const base: MeSource = {
  id: "u1",
  name: "Claire M.",
  email: "claire.m@exemple.fr",
  role: "parrain",
  parrainProfile: null,
  relais: null,
};

describe("toMe", () => {
  it("projette un parrain avec son profil", () => {
    const me = toMe({
      ...base,
      parrainProfile: { displayName: "Claire M.", avatarTone: "info-strong" },
    });
    expect(me).toEqual({
      user: {
        id: "u1",
        name: "Claire M.",
        email: "claire.m@exemple.fr",
        role: "parrain",
        initials: "CM",
      },
      parrain: { displayName: "Claire M.", avatarTone: "info-strong" },
      relais: null,
    });
    expect(meSchema.safeParse(me).success).toBe(true);
  });

  it("calcule les initiales depuis le nom affiché du relais", () => {
    const me = toMe({
      ...base,
      name: "Koffi",
      email: "koffi@relais.exemple.tg",
      role: "relais",
      relais: { displayName: "M. Koffi", city: "Lomé", district: "Bè" },
    });
    expect(me?.user.initials).toBe("MK");
    expect(me?.relais).toEqual({ displayName: "M. Koffi", city: "Lomé", district: "Bè" });
    expect(me?.parrain).toBeNull();
  });

  it("utilise le nom du compte sans profil métier (bureau)", () => {
    const me = toMe({ ...base, name: "Bureau · trésorerie", role: "bureau" });
    expect(me?.user).toMatchObject({ role: "bureau", initials: "BT" });
    expect(me?.parrain).toBeNull();
    expect(me?.relais).toBeNull();
  });

  it("rejette un rôle qui n'appartient pas à la plateforme", () => {
    expect(toMe({ ...base, role: null })).toBeNull();
    expect(toMe({ ...base, role: "admin" })).toBeNull();
  });

  it("refuse une teinte d'avatar inconnue", () => {
    expect(() =>
      toMe({ ...base, parrainProfile: { displayName: "Claire M.", avatarTone: "rose" } }),
    ).toThrow();
  });
});
