import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ComingSoon } from "@/components/layout/coming-soon";
import { UsersIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";

/** Rubriques de la navigation du relais qui ne sont pas encore livrées. */
const rubriques = new Map<string, { title: string; description: string; icon: ReactNode }>([
  [
    "sessions",
    {
      title: "Sessions élèves",
      description: "Vous pourrez bientôt ouvrir ici les sessions où les enfants écrivent.",
      icon: <UsersIcon size={26} />,
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
  return (
    <ComingSoon
      {...rubrique}
      backHref="/relais"
      backLabel="Retour à l'accueil"
      titleClassName="max-md:hidden"
    />
  );
}
