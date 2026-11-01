import type { Metadata } from "next";
import { Card, EmptyState, UsersIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";

export const metadata: Metadata = { title: "Accueil relais" };

export default async function RelaisHomePage() {
  const me = await requireRole("relais");
  const name = me.relais?.displayName ?? me.user.name;
  return (
    <>
      {/* Sous md, l'en-tête vert de la coquille porte le titre « Bonjour … ». */}
      <h1 className="m-0 hidden text-30 font-extrabold md:block">Bonjour {name}</h1>
      <Card padding="none">
        <EmptyState
          icon={<UsersIcon size={26} />}
          title="Votre tableau de bord arrive bientôt"
          description="La liste de vos enfants, les nouvelles à publier et la saisie des résultats scolaires seront disponibles à la prochaine étape de la plateforme."
        />
      </Card>
    </>
  );
}
