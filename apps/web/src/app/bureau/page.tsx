import type { Metadata } from "next";
import { Card, EmptyState, ShieldIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default async function BureauHomePage() {
  await requireRole("bureau");
  return (
    <>
      <h1 className="m-0 text-30 font-extrabold">Vue d&apos;ensemble</h1>
      <Card padding="none">
        <EmptyState
          icon={<ShieldIcon size={26} />}
          title="Les indicateurs arrivent bientôt"
          description="Binômes, file de modération et finances par relais s'afficheront ici au fil des prochaines étapes de la plateforme."
        />
      </Card>
    </>
  );
}
