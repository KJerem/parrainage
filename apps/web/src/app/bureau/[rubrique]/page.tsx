import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ComingSoon } from "@/components/layout/coming-soon";
import { BellIcon, ShieldIcon, UserIcon, UsersIcon, WalletIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";

/** Rubriques de la navigation du bureau qui ne sont pas encore livrées. */
const rubriques = new Map<string, { title: string; description: string; icon: ReactNode }>([
  [
    "binomes",
    {
      title: "Binômes",
      description: "Vous pourrez bientôt créer les binômes et suivre ceux qui demandent attention.",
      icon: <UsersIcon size={26} />,
    },
  ],
  [
    "reseau",
    {
      title: "Réseau et finances",
      description:
        "Les relais, les fonds reversés et les justificatifs à valider s'afficheront bientôt ici.",
      icon: <WalletIcon size={26} />,
    },
  ],
  [
    "parrains",
    {
      title: "Parrains",
      description: "Vous pourrez bientôt consulter les parrains et inviter de nouvelles personnes.",
      icon: <UsersIcon size={26} />,
    },
  ],
  [
    "parametres",
    {
      title: "Paramètres et accès",
      description: "Les réglages de la plateforme et les accès du bureau arriveront bientôt ici.",
      icon: <ShieldIcon size={26} />,
    },
  ],
  [
    "profil",
    {
      title: "Profil",
      description: "Vous pourrez bientôt consulter et modifier votre profil ici.",
      icon: <UserIcon size={26} />,
    },
  ],
  [
    "notifications",
    {
      title: "Notifications",
      description: "Les alertes destinées au bureau s'afficheront bientôt ici.",
      icon: <BellIcon size={26} />,
    },
  ],
]);

type Props = PageProps<"/bureau/[rubrique]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const rubrique = rubriques.get((await params).rubrique);
  return rubrique ? { title: rubrique.title } : {};
}

export default async function BureauRubriquePage({ params }: Props) {
  await requireRole("bureau");
  const rubrique = rubriques.get((await params).rubrique);
  if (!rubrique) {
    notFound();
  }
  return <ComingSoon {...rubrique} backHref="/bureau" backLabel="Retour à la vue d'ensemble" />;
}
