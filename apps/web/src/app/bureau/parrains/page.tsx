import { PARRAIN_SEARCH_MAX_LENGTH } from "@parrainage/contracts";
import type { Metadata } from "next";
import { InviteParrainButton } from "@/components/bureau/invite-parrain";
import { ParrainsTable } from "@/components/bureau/parrains-table";
import { firstParam } from "@/lib/auth-paths";
import { requireRole } from "@/lib/auth.server";
import { getBureauParrains } from "@/lib/bureau.server";

export const metadata: Metadata = { title: "Parrains" };

// Rubrique « Parrains » de la navigation du bureau (sans maquette) : liste, recherche (`?q=`),
// invitation d'une nouvelle personne.
export default async function BureauParrainsPage({ searchParams }: PageProps<"/bureau/parrains">) {
  await requireRole("bureau");
  const query = (firstParam((await searchParams).q) ?? "")
    .trim()
    .slice(0, PARRAIN_SEARCH_MAX_LENGTH);
  const data = await getBureauParrains(query);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 text-30 font-extrabold max-sm:text-24">Parrains</h1>
        <InviteParrainButton />
      </div>
      <ParrainsTable data={data} query={query} />
    </>
  );
}
