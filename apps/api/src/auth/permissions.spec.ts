import { can, type Permission, roles } from "./permissions.js";

describe("can (permissions par rôle)", () => {
  const matrix: [Permission, { parrain: boolean; relais: boolean; bureau: boolean }][] = [
    ["child:read", { parrain: true, relais: true, bureau: true }],
    ["child:create", { parrain: false, relais: true, bureau: false }],
    ["child:update", { parrain: false, relais: true, bureau: true }],
    ["child:submit", { parrain: false, relais: true, bureau: false }],
    ["child:validate", { parrain: false, relais: false, bureau: true }],
    ["news:publish", { parrain: false, relais: true, bureau: false }],
    ["results:write", { parrain: false, relais: true, bureau: false }],
    ["classSession:open", { parrain: false, relais: true, bureau: false }],
    ["moderation:review", { parrain: false, relais: false, bureau: true }],
    ["sponsorship:create", { parrain: false, relais: false, bureau: true }],
    ["finance:validate", { parrain: false, relais: false, bureau: true }],
    ["user:ban", { parrain: false, relais: false, bureau: true }],
    ["user:set-role", { parrain: false, relais: false, bureau: true }],
  ];

  it.each(matrix)("%s", (permission, expected) => {
    expect({
      parrain: can("parrain", permission),
      relais: can("relais", permission),
      bureau: can("bureau", permission),
    }).toEqual(expected);
  });

  it("refuse tout à un rôle absent ou inconnu", () => {
    expect(can(null, "child:read")).toBe(false);
    expect(can(undefined, "child:read")).toBe(false);
    expect(can("admin", "user:ban")).toBe(false);
    expect(can("toString", "child:read")).toBe(false);
  });

  it("déclare exactement les trois rôles de la plateforme", () => {
    expect(Object.keys(roles).sort()).toEqual(["bureau", "parrain", "relais"]);
  });
});
