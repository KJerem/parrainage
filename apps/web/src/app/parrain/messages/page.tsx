import type { Metadata } from "next";
import { ComingSoon } from "@/components/parrain/coming-soon";
import { MessageIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";

export const metadata: Metadata = { title: "Messages" };

export default async function ParrainMessagesPage() {
  await requireRole("parrain");
  return (
    <ComingSoon
      title="Messages"
      icon={<MessageIcon size={26} />}
      description="Vous pourrez bientôt écrire à vos filleuls ici. Chaque message est relu par l'association avant d'être remis. En attendant, leurs messages s'affichent dans « Mes filleuls »."
    />
  );
}
