import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Remet la base dans l'état du seed avant la suite (rien d'autre n'est effacé) : ces tests lisent
 * les conversations et les non-lus de démonstration, que d'autres exécutions ont pu changer.
 */
export default function setup() {
  execSync("npm run db:deploy && npm run db:seed", {
    cwd: path.join(import.meta.dirname, ".."),
    stdio: "pipe",
  });
}
