import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Prépare la base de développement avant les tests.
 *
 * E2E_DB=seed (par défaut) : migrations en attente appliquées (`db:deploy`, sans perte de données)
 * puis `db:seed`, idempotent : comptes et mots de passe du seed rétablis, données ajoutées à la
 * main conservées.
 * E2E_DB=reset : `npm run db:reset`, la base est effacée puis recréée (à lancer soi-même).
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
    stdio: "inherit",
  });
}
