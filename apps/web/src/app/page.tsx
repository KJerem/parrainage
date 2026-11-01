import { roleHome } from "@parrainage/contracts";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/api.server";
import { LOGIN_PATH } from "@/lib/auth-paths";

/** Accueil : oriente vers l'espace du rôle connecté, sinon vers la connexion. */
export default async function Home() {
  const me = await getMe();
  redirect(me ? roleHome[me.user.role] : LOGIN_PATH);
}
