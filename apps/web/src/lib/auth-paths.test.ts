import { describe, expect, it } from "vitest";
import { firstParam, isProtectedPath, loginPath, safeNextPath } from "./auth-paths";

describe("isProtectedPath", () => {
  it.each(["/parrain", "/parrain/compte", "/relais", "/relais/enfants/1", "/bureau", "/bureau/x"])(
    "protège %s",
    (path) => expect(isProtectedPath(path)).toBe(true),
  );

  it.each(["/", "/connexion", "/parrainage", "/relaisx", "/dev/ui/parrain", "/api/me", "/eleve"])(
    "laisse passer %s",
    (path) => expect(isProtectedPath(path)).toBe(false),
  );
});

describe("safeNextPath", () => {
  it.each([
    ["/parrain", "/parrain"],
    ["/parrain/messages?filleul=aicha", "/parrain/messages?filleul=aicha"],
    ["/bureau#file", "/bureau#file"],
    ["/parrain/../bureau", "/bureau"],
    ["/apiculture", "/apiculture"],
  ])("accepte %s", (value, expected) => expect(safeNextPath(value)).toBe(expected));

  it.each([
    undefined,
    null,
    42,
    "",
    "parrain",
    "//exemple.com",
    "//exemple.com/parrain",
    "/\\exemple.com",
    "/parrain\\..\\..",
    "https://exemple.com/parrain",
    "javascript:alert(1)",
    "/parrain\n/x",
    "/\tparrain",
    // Segments « . » et « .. » : une fois normalisés, ils donneraient « //exemple.com ».
    "/.//exemple.com",
    "/..//exemple.com",
    "/parrain/..//exemple.com",
    "/%2e//exemple.com",
    "/%2E%2E//exemple.com/parrain",
    "/api/auth/magic-link/verify?token=abc",
    "/api",
    "/parrain/../api/me",
  ])("refuse %j", (value) => expect(safeNextPath(value)).toBeNull());
});

describe("loginPath", () => {
  it("encode la destination", () => {
    expect(loginPath("/parrain")).toBe("/connexion?next=%2Fparrain");
    expect(loginPath("/parrain/compte?x=1")).toBe("/connexion?next=%2Fparrain%2Fcompte%3Fx%3D1");
  });

  it("ignore une destination absente ou refusée", () => {
    expect(loginPath()).toBe("/connexion");
    expect(loginPath(null)).toBe("/connexion");
    expect(loginPath("//exemple.com")).toBe("/connexion");
  });
});

describe("firstParam", () => {
  it("prend la première valeur", () => {
    expect(firstParam("a")).toBe("a");
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
});
