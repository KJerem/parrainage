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
      validateEnv({
        ...base,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "x".repeat(44),
        CHILD_CODE_PEPPER: "y".repeat(44),
        CHILD_SESSION_SECRET: "z".repeat(44),
      }).NODE_ENV,
    ).toBe("production");
  });

  it("exige en production un vrai poivre pour le code des enfants", () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: "production", BETTER_AUTH_SECRET: "x".repeat(44) }),
    ).toThrow(/CHILD_CODE_PEPPER : le secret d'exemple est interdit en production/);
    const dev = { ...base, BETTER_AUTH_SECRET: exampleSecret };
    expect(validateEnv(dev).CHILD_CODE_PEPPER.length).toBeGreaterThanOrEqual(32);
    expect(() => validateEnv({ ...dev, CHILD_CODE_PEPPER: "court" })).toThrow(
      /au moins 32 caractères/,
    );
  });

  it("exige en production un vrai secret pour les sessions élèves", () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "x".repeat(44),
        CHILD_CODE_PEPPER: "y".repeat(44),
      }),
    ).toThrow(/CHILD_SESSION_SECRET : le secret d'exemple est interdit en production/);
    const dev = validateEnv({ ...base, BETTER_AUTH_SECRET: exampleSecret });
    expect(dev.CHILD_SESSION_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(dev.CHILD_CODE_MAX_ATTEMPTS).toBe(3);
    expect(dev.CHILD_SESSION_MAX_FAILURES).toBe(15);
    expect(dev.CHILD_VIDEO_MAX_SECONDS).toBe(60);
  });

  it("ouvre les appels par lien, sauf si JaaS est entièrement configuré", () => {
    const dev = { ...base, BETTER_AUTH_SECRET: exampleSecret };
    expect(validateEnv(dev).VISIO_PROVIDER).toBe("link");
    expect(validateEnv(dev).VISIO_JOIN_EARLY_MINUTES).toBe(10);
    expect(() => validateEnv({ ...dev, VISIO_PROVIDER: "jaas" })).toThrow(/JAAS_APP_ID/);
    expect(
      validateEnv({
        ...dev,
        VISIO_PROVIDER: "jaas",
        JAAS_APP_ID: "vpaas-magic-cookie-test",
        JAAS_API_KEY_ID: "vpaas-magic-cookie-test/abc",
        JAAS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
      }).VISIO_PROVIDER,
    ).toBe("jaas");
  });

  it("prépare les reçus fiscaux : taux de 66 % et adresse sur plusieurs lignes", () => {
    const dev = { ...base, BETTER_AUTH_SECRET: exampleSecret };
    expect(validateEnv(dev)).toMatchObject({
      TAX_REDUCTION_RATE: 0.66,
      ASSOCIATION_NAME: "Association LRT",
      ASSOCIATION_ADDRESS: "",
    });
    expect(
      validateEnv({ ...dev, ASSOCIATION_ADDRESS: "4 rue de l'Exemple\\n69001 Lyon" })
        .ASSOCIATION_ADDRESS,
    ).toBe("4 rue de l'Exemple\n69001 Lyon");
    expect(() => validateEnv({ ...dev, TAX_REDUCTION_RATE: "66" })).toThrow(/TAX_REDUCTION_RATE/);
  });

  it("garde les tâches planifiées actives, sauf si on les coupe", () => {
    const dev = { ...base, BETTER_AUTH_SECRET: exampleSecret };
    expect(validateEnv(dev).SCHEDULER_ENABLED).toBe(true);
    expect(validateEnv({ ...dev, SCHEDULER_ENABLED: "false" }).SCHEDULER_ENABLED).toBe(false);
  });

  it("exige un secret d'au moins 32 caractères", () => {
    expect(() => validateEnv({ ...base, BETTER_AUTH_SECRET: "court" })).toThrow(
      /au moins 32 caractères/,
    );
  });
});
