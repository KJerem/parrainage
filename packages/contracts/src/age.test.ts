import { describe, expect, it } from "vitest";
import { ageAt } from "./age.js";

describe("ageAt", () => {
  it.each([
    ["2014-06-13", "2026-10-31", 12],
    ["2014-10-31", "2026-10-31", 12],
    ["2014-11-01", "2026-10-31", 11],
    ["2014-10-31", "2026-10-30T23:59:59Z", 11],
    ["2018-03-12", "2026-10-31T10:00:00Z", 8],
  ])("né le %s : %i ans le %s", (birthDate, at, expected) => {
    expect(ageAt(birthDate, at)).toBe(expected);
  });

  it("fête un 29 février le 1er mars les années non bissextiles", () => {
    expect(ageAt("2016-02-29", "2027-02-28")).toBe(10);
    expect(ageAt("2016-02-29", "2027-03-01")).toBe(11);
    expect(ageAt("2016-02-29", "2028-02-29")).toBe(12);
  });

  it("accepte des Date et ne descend jamais sous zéro", () => {
    expect(ageAt(new Date("2020-01-01T00:00:00Z"), new Date("2026-10-31T10:00:00Z"))).toBe(6);
    expect(ageAt("2027-01-01", "2026-10-31")).toBe(0);
  });

  it("refuse une date illisible", () => {
    expect(() => ageAt("hier", "2026-10-31")).toThrow(/Date invalide/);
  });
});
