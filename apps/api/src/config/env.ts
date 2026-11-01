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
  })
  .refine(
    (env) =>
      env.NODE_ENV !== "production" || !env.BETTER_AUTH_SECRET.startsWith(EXAMPLE_SECRET_PREFIX),
    {
      path: ["BETTER_AUTH_SECRET"],
      message: "BETTER_AUTH_SECRET : le secret d'exemple est interdit en production",
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
