import type { Role } from "@parrainage/contracts";

/** Libellé du rôle affiché sur les pages de compte. */
export const roleLabels: Record<Role, string> = {
  parrain: "Parrain ou marraine",
  relais: "Relais",
  bureau: "Bureau de l'association",
};
