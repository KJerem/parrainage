import type { Metadata } from "next";
import { RelaisHomeView } from "@/components/relais/relais-home";
import { requireRole } from "@/lib/auth.server";
import { getRelaisHome } from "@/lib/relais.server";

export const metadata: Metadata = { title: "Accueil relais" };

export default async function RelaisHomePage() {
  const me = await requireRole("relais");
  const home = await getRelaisHome();
  return <RelaisHomeView home={home} name={me.relais?.displayName ?? me.user.name} />;
}
