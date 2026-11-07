import type { Metadata } from "next";
import { Suspense } from "react";
import { ResultsSheet } from "@/components/relais/results-sheet";
import { firstParam } from "@/lib/auth-paths";
import { requireRole } from "@/lib/auth.server";
import { getRelaisResults } from "@/lib/relais.server";

export const metadata: Metadata = { title: "Résultats scolaires" };

// RW-Resultats.dc.html : `?periode=&ecole=` ; la clé repart d'un état neuf à chaque changement.
export default async function RelaisResultsPage({ searchParams }: PageProps<"/relais/resultats">) {
  await requireRole("relais");
  const params = await searchParams;
  const sheet = await getRelaisResults({
    periode: firstParam(params.periode),
    ecole: firstParam(params.ecole),
  });
  return (
    <Suspense>
      <ResultsSheet key={`${sheet.periodId}-${sheet.schoolId}`} sheet={sheet} />
    </Suspense>
  );
}
