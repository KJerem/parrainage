import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Remet la base dans l'état du seed avant la suite : ces tests lisent les conversations et les
 * non-lus de démonstration, que d'autres exécutions ont pu changer. Seuls les messages ajoutés
 * dans ces conversations sont effacés (SEED_RESET_MESSAGES), rien d'autre.
 */
export default function setup() {
  execSync("npm run db:deploy && npm run db:seed", {
    cwd: path.join(import.meta.dirname, ".."),
    env: { ...process.env, SEED_RESET_MESSAGES: "1" },
    stdio: "pipe",
  });
}
