import type { Metadata } from "next";
import { PaymentsView } from "@/components/payments/payments-view";
import { Button, Card, EmptyState, WalletIcon } from "@/components/ui";
import { firstParam } from "@/lib/auth-paths";
import { requireRole } from "@/lib/auth.server";
import { getParrainPayments, yearParam } from "@/lib/payments.server";

export const metadata: Metadata = { title: "Mes versements" };

// P-Versements.dc.html : mensualité, versé dans l'année, réduction estimée, historique, reçus.
export default async function ParrainVersementsPage({
  searchParams,
}: PageProps<"/parrain/versements">) {
  await requireRole("parrain");
  const data = await getParrainPayments(yearParam(firstParam((await searchParams).annee)));
  if (data.monthly.filleuls.length === 0 && data.history.years.length === 0) {
    return (
      <>
        <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-30">Mes versements</h1>
        <Card padding="none">
          <EmptyState
            icon={<WalletIcon size={26} />}
            title="Aucun versement pour l'instant"
            description="Vos mensualités et vos reçus fiscaux apparaîtront ici dès que l'association vous aura présenté un enfant."
            action={
              <Button href="/parrain" variant="secondary">
                Retour à mes filleuls
              </Button>
            }
          />
        </Card>
      </>
    );
  }
  return <PaymentsView data={data} />;
}
