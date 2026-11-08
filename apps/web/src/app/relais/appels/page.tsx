import type { Metadata } from "next";
import { RelaisCallsView } from "@/components/calls/relais-calls";
import { requireRole } from "@/lib/auth.server";
import { getRelaisCalls } from "@/lib/calls.server";

export const metadata: Metadata = { title: "Appels vidéo" };

// Appels vidéo du relais : demandes à confirmer, appels prévus, créneaux publiés.
export default async function RelaisAppelsPage() {
  await requireRole("relais");
  const data = await getRelaisCalls();
  return (
    <>
      <div className="flex flex-col gap-1 max-md:hidden">
        <h1 className="m-0 text-30 font-extrabold">Appels vidéo</h1>
        <p className="m-0 text-15 text-muted">
          Les parrains demandent un appel sur vos créneaux ; vous le confirmez, ou en proposez
          d&apos;autres. L&apos;appel a lieu dans votre salle, avec l&apos;enfant.
        </p>
      </div>
      <RelaisCallsView data={data} />
    </>
  );
}
