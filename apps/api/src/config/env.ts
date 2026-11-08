import { config } from "dotenv";
import { z } from "zod";

/** Début du secret d'exemple de `.env.example`, connu de tous : refusé en production. */
export const EXAMPLE_SECRET_PREFIX = "dev-uniquement";

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().default(4000),
    /** Origine du web : les liens envoyés par e-mail et les redirections de Better Auth en partent. */
    APP_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET doit compter au moins 32 caractères"),
    S3_ENDPOINT: z.url(),
    S3_PUBLIC_ENDPOINT: z.url(),
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: z.string().default("media"),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().default(1025),
    MAIL_FROM: z.string().default("Parrainage LRT <no-reply@parrainage.local>"),
    /** Plafonds des fichiers joints aux messages, en Mo, et durée maximale d'une vidéo. */
    UPLOAD_MAX_PHOTO_MB: z.coerce.number().positive().max(100).default(10),
    UPLOAD_MAX_VIDEO_MB: z.coerce.number().positive().max(100).default(25),
    UPLOAD_MAX_DOC_MB: z.coerce.number().positive().max(100).default(10),
    VIDEO_MAX_SECONDS: z.coerce.number().int().positive().default(120),
    /** Messages (et encouragements) par utilisateur et par fenêtre glissante. */
    MESSAGE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    MESSAGE_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
    /** Poivre du code image des enfants (Argon2id) ; le secret d'exemple est refusé en production. */
    CHILD_CODE_PEPPER: z
      .string()
      .min(32, "CHILD_CODE_PEPPER doit compter au moins 32 caractères")
      .default(`${EXAMPLE_SECRET_PREFIX}-poivre-du-code-image-des-enfants`),
    /** Signature des cookies de session élève (jose) ; le secret d'exemple est refusé en production. */
    CHILD_SESSION_SECRET: z
      .string()
      .min(32, "CHILD_SESSION_SECRET doit compter au moins 32 caractères")
      .default(`${EXAMPLE_SECRET_PREFIX}-secret-des-sessions-eleves-a-changer`),
    /** Échecs du code image avant le verrou de l'enfant, puis avant la suspension de la session. */
    CHILD_CODE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
    CHILD_SESSION_MAX_FAILURES: z.coerce.number().int().positive().default(15),
    /** Durée maximale d'une vidéo envoyée par un enfant. */
    CHILD_VIDEO_MAX_SECONDS: z.coerce.number().int().positive().default(60),
    /**
     * Visio : « jaas » (salle 8x8.vc intégrée, jeton RS256) ou « link » (lien vers une salle Jitsi
     * publique au nom aléatoire : tests et repli). JaaS exige l'App ID, l'identifiant de la clé et
     * la clé privée (PEM, retours à la ligne écrits « \n » dans le fichier .env).
     */
    VISIO_PROVIDER: z.enum(["jaas", "link"]).default("link"),
    VISIO_LINK_BASE: z.url().default("https://meet.jit.si"),
    JAAS_APP_ID: z.string().default(""),
    JAAS_API_KEY_ID: z.string().default(""),
    JAAS_PRIVATE_KEY: z.string().default(""),
    /** La salle ouvre ce nombre de minutes avant l'appel. */
    VISIO_JOIN_EARLY_MINUTES: z.coerce.number().int().min(0).max(60).default(10),
    /** Tâches planifiées (publication programmée, purge des fichiers) : « false » pour les couper. */
    SCHEDULER_ENABLED: z.stringbool().default(true),
    /** Horloge figée (démo, e2e) : « 2026-10-31T10:00:00Z ». Vide : heure réelle. */
    APP_NOW: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.iso.datetime({ offset: true }).optional(),
    ),
  })
  .refine(
    (env) =>
      env.NODE_ENV !== "production" || !env.BETTER_AUTH_SECRET.startsWith(EXAMPLE_SECRET_PREFIX),
    {
      path: ["BETTER_AUTH_SECRET"],
      message: "BETTER_AUTH_SECRET : le secret d'exemple est interdit en production",
    },
  )
  .refine(
    (env) =>
      env.NODE_ENV !== "production" || !env.CHILD_CODE_PEPPER.startsWith(EXAMPLE_SECRET_PREFIX),
    {
      path: ["CHILD_CODE_PEPPER"],
      message: "CHILD_CODE_PEPPER : le secret d'exemple est interdit en production",
    },
  )
  .refine(
    (env) =>
      env.VISIO_PROVIDER !== "jaas" ||
      (env.JAAS_APP_ID !== "" && env.JAAS_API_KEY_ID !== "" && env.JAAS_PRIVATE_KEY !== ""),
    {
      path: ["VISIO_PROVIDER"],
      message: "VISIO_PROVIDER=jaas : JAAS_APP_ID, JAAS_API_KEY_ID et JAAS_PRIVATE_KEY sont requis",
    },
  )
  .refine(
    (env) =>
      env.NODE_ENV !== "production" || !env.CHILD_SESSION_SECRET.startsWith(EXAMPLE_SECRET_PREFIX),
    {
      path: ["CHILD_SESSION_SECRET"],
      message: "CHILD_SESSION_SECRET : le secret d'exemple est interdit en production",
    },
  );

export type Env = z.infer<typeof envSchema>;

/** Validation des variables d'environnement au démarrage (utilisée par ConfigModule). */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Variables d'environnement invalides :\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

/**
 * Variables validées, lisibles hors injection de dépendances (Better Auth, client Prisma, seed) :
 * ces modules sont évalués avant que ConfigModule ne charge le fichier .env.
 */
export function getEnv(): Env {
  if (!cached) {
    config({ quiet: true });
    cached = validateEnv(process.env);
  }
  return cached;
}
