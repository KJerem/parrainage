import { EXAMPLE_SECRET_PREFIX, validateEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5433/db",
  S3_ENDPOINT: "http://localhost:9000",
  S3_PUBLIC_ENDPOINT: "http://localhost:9000",
  S3_ACCESS_KEY: "a",
  S3_SECRET_KEY: "b",
};
const exampleSecret = `${EXAMPLE_SECRET_PREFIX}-remplacer-par-un-secret-aleatoire`;

describe("validateEnv", () => {
  it("accepte le secret d'exemple en développement", () => {
    expect(validateEnv({ ...base, BETTER_AUTH_SECRET: exampleSecret }).APP_URL).toBe(
      "http://localhost:3000",
    );
  });

  it("refuse le secret d'exemple en production", () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: "production", BETTER_AUTH_SECRET: exampleSecret }),
    ).toThrow(/secret d'exemple est interdit en production/);
    expect(
      validateEnv({ ...base, NODE_ENV: "production", BETTER_AUTH_SECRET: "x".repeat(44) }).NODE_ENV,
    ).toBe("production");
  });

  it("exige un secret d'au moins 32 caractères", () => {
    expect(() => validateEnv({ ...base, BETTER_AUTH_SECRET: "court" })).toThrow(
      /au moins 32 caractères/,
    );
  });
});
