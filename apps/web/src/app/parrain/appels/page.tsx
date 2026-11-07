import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { VideoIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";

export const metadata: Metadata = { title: "Appels vidéo" };

export default async function ParrainAppelsPage() {
  await requireRole("parrain");
  return (
    <ComingSoon
      backHref="/parrain"
      backLabel="Retour à mes filleuls"
      title="Appels vidéo"
      icon={<VideoIcon size={26} />}
      description="Vous pourrez bientôt demander un appel vidéo avec votre filleul, depuis la salle de son relais, et choisir un créneau ici."
    />
  );
}
