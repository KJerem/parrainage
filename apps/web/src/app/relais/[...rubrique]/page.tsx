import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ComingSoon } from "@/components/layout/coming-soon";
import {
  BellIcon,
  FileLinesIcon,
  SendIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
} from "@/components/ui";
import { requireRole } from "@/lib/auth.server";

/** Rubriques de la navigation du relais qui ne sont pas encore livrées. */
const rubriques = new Map<string, { title: string; description: string; icon: ReactNode }>([
  [
    "enfants",
    {
      title: "Enfants",
      description: "La liste des enfants que vous suivez s'affichera bientôt ici.",
      icon: <UsersIcon size={26} />,
    },
  ],
  [
    "enfants/nouveau",
    {
      title: "Ajouter un enfant",
      description: "Vous pourrez bientôt créer ici le dossier d'un nouvel enfant.",
      icon: <UserPlusIcon size={26} />,
    },
  ],
  [
    "publier",
    {
      title: "Publier une nouvelle",
      description: "Vous pourrez bientôt publier ici des nouvelles pour les parrains.",
      icon: <SendIcon size={26} />,
    },
  ],
  [
    "resultats",
    {
      title: "Résultats scolaires",
      description: "Vous pourrez bientôt saisir ici les résultats et les bulletins des enfants.",
      icon: <FileLinesIcon size={26} />,
    },
  ],
  [
    "sessions",
    {
      title: "Sessions élèves",
      description: "Vous pourrez bientôt ouvrir ici les sessions où les enfants écrivent.",
      icon: <UsersIcon size={26} />,
    },
  ],
  [
    "profil",
    {
      title: "Profil",
      description: "Vous pourrez bientôt consulter votre profil et vos écoles ici.",
      icon: <UserIcon size={26} />,
    },
  ],
  [
    "notifications",
    {
      title: "Notifications",
      description: "Vos alertes s'afficheront bientôt ici.",
      icon: <BellIcon size={26} />,
    },
  ],
]);

type Props = PageProps<"/relais/[...rubrique]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const rubrique = rubriques.get((await params).rubrique.join("/"));
  return rubrique ? { title: rubrique.title } : {};
}

export default async function RelaisRubriquePage({ params }: Props) {
  await requireRole("relais");
  const rubrique = rubriques.get((await params).rubrique.join("/"));
  if (!rubrique) {
    notFound();
  }
  return <ComingSoon {...rubrique} backHref="/relais" backLabel="Retour à l'accueil" />;
}
