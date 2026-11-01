import "server-only";
import { roleHome, type Me, type Role } from "@parrainage/contracts";
import { redirect } from "next/navigation";
import { getMe } from "./api.server";
import { FORBIDDEN_PATH, loginPath } from "./auth-paths";

/**
 * Garde d'un espace, appelée par son layout et par chaque page (défense en profondeur) :
 * sans session → connexion, autre rôle → page « Accès refusé ».
 */
export async function requireRole(role: Role): Promise<Me> {
  const me = await getMe();
  if (!me) {
    redirect(loginPath(roleHome[role]));
  }
  if (me.user.role !== role) {
    redirect(FORBIDDEN_PATH);
  }
  return me;
}
