import { validateEnv } from "../config/env.js";
import { createClock } from "./clock.js";

describe("createClock", () => {
  it("fige l'heure sur APP_NOW", () => {
    const clock = createClock("2026-10-31T10:00:00Z");
    expect(clock().toISOString()).toBe("2026-10-31T10:00:00.000Z");
    expect(clock()).toEqual(clock());
  });

  it("renvoie une nouvelle instance à chaque appel", () => {
    const clock = createClock("2026-10-31T10:00:00+01:00");
    const first = clock();
    first.setUTCFullYear(2000);
    expect(clock().toISOString()).toBe("2026-10-31T09:00:00.000Z");
  });

  it("suit l'heure réelle sans APP_NOW", () => {
    const before = Date.now();
    const value = createClock(undefined)().getTime();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
    expect(createClock("")().getTime()).toBeGreaterThanOrEqual(before);
  });

  it("refuse une valeur illisible", () => {
    expect(() => createClock("demain")).toThrow(/APP_NOW invalide/);
  });
});

describe("APP_NOW dans l'environnement", () => {
  const base = {
    DATABASE_URL: "postgresql://u:p@localhost:5433/db",
    S3_ENDPOINT: "http://localhost:9000",
    S3_PUBLIC_ENDPOINT: "http://localhost:9000",
    S3_ACCESS_KEY: "a",
    S3_SECRET_KEY: "b",
    BETTER_AUTH_SECRET: "x".repeat(32),
  };

  it("est facultatif, et une valeur vide vaut une absence", () => {
    expect(validateEnv(base).APP_NOW).toBeUndefined();
    expect(validateEnv({ ...base, APP_NOW: "" }).APP_NOW).toBeUndefined();
    expect(validateEnv({ ...base, APP_NOW: "2026-10-31T10:00:00Z" }).APP_NOW).toBe(
      "2026-10-31T10:00:00Z",
    );
  });

  it("exige une date et une heure ISO 8601", () => {
    expect(() => validateEnv({ ...base, APP_NOW: "2026-10-31" })).toThrow(/APP_NOW/);
  });
});
