import { bureauSponsorshipsQuerySchema } from "@parrainage/contracts";
import type { Metadata } from "next";
import { CreateSponsorship } from "@/components/bureau/create-sponsorship";
import { SponsorshipsTable } from "@/components/bureau/sponsorships-table";
import { firstParam } from "@/lib/auth-paths";
import { requireRole } from "@/lib/auth.server";
import {
  getBureauSponsorships,
  getNewSponsorship,
  getParrainCandidates,
} from "@/lib/bureau.server";

export const metadata: Metadata = { title: "Binômes" };

// B-Binomes.dc.html : créer un binôme pour un enfant en attente (`?enfant=`), puis tous les
// binômes, filtrés par relais et par état (`?relais=`, `?etat=`).
export default async function BureauBinomesPage({ searchParams }: PageProps<"/bureau/binomes">) {
  await requireRole("bureau");
  const params = await searchParams;
  const query = bureauSponsorshipsQuerySchema
    .catch({})
    .parse({ relais: firstParam(params.relais), etat: firstParam(params.etat) });
  const [creation, sponsorships] = await Promise.all([
    getNewSponsorship(firstParam(params.enfant)),
    getBureauSponsorships(query),
  ]);
  const candidates = creation.child ? await getParrainCandidates(creation.child.id) : null;
  return (
    <>
      <h1 className="m-0 text-30 font-extrabold max-sm:text-24">Binômes</h1>
      <CreateSponsorship
        key={creation.child?.id ?? "aucun"}
        data={creation}
        initialCandidates={candidates?.items ?? []}
      />
      <SponsorshipsTable data={sponsorships} query={query} />
    </>
  );
}
