import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.url(),
  S3_PUBLIC_ENDPOINT: z.url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("media"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  MAIL_FROM: z.string().default("Parrainage LRT <no-reply@parrainage.local>"),
});

export type Env = z.infer<typeof envSchema>;

/** Validation des variables d'environnement au démarrage (utilisée par ConfigModule). */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Variables d'environnement invalides :\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
