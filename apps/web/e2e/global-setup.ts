import { execSync } from "node:child_process";
import path from "node:path";
import { E2E_SEED_TODAY } from "./clock";

/**
 * Prépare la base de développement avant les tests.
 *
 * E2E_DB=seed (par défaut) : migrations en attente appliquées (`db:deploy`, sans perte de données)
 * puis `db:seed`, idempotent : comptes et mots de passe du seed rétablis, données ajoutées à la
 * main conservées.
 * E2E_DB=reset : `npm run db:reset`, la base est effacée puis recréée (à lancer soi-même).
 *
 * Dans les deux cas, le seed est calé sur le jour du design (SEED_TODAY, e2e/clock.ts), comme
 * l'horloge de l'API de test (APP_NOW).
 */
export default function globalSetup() {
  const mode = process.env.E2E_DB ?? "seed";
  if (mode !== "reset" && mode !== "seed") {
    throw new Error(`E2E_DB doit valoir « seed » ou « reset » (reçu : « ${mode} »)`);
  }
  const command =
    mode === "seed"
      ? "npm run db:deploy -w @parrainage/api && npm run db:seed -w @parrainage/api"
      : "npm run db:reset -w @parrainage/api";
  execSync(command, {
    cwd: path.join(__dirname, "..", "..", ".."),
    env: { ...process.env, SEED_TODAY: E2E_SEED_TODAY },
    stdio: "inherit",
  });
}
