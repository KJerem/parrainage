import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { WalletIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";

export const metadata: Metadata = { title: "Mes versements" };

export default async function ParrainVersementsPage() {
  await requireRole("parrain");
  return (
    <ComingSoon
      backHref="/parrain"
      backLabel="Retour à mes filleuls"
      title="Mes versements"
      icon={<WalletIcon size={26} />}
      description="L'historique complet de vos versements et vos reçus fiscaux seront bientôt disponibles ici. Vos dernières mensualités s'affichent déjà dans « Mes filleuls »."
    />
  );
}
