import type { Metadata } from "next";
import { TwoColumnParrain } from "@/components/layout";
import { FilleulSwitcher } from "@/components/parrain/filleul-switcher";
import { LatestNews } from "@/components/parrain/latest-news";
import { PaymentsCard } from "@/components/parrain/payments-card";
import { FilleulProfileCard } from "@/components/parrain/profile-card";
import { ResultsCard } from "@/components/parrain/results-card";
import { Button, Card, EmptyState, UsersIcon } from "@/components/ui";
import { firstParam } from "@/lib/auth-paths";
import { requireRole } from "@/lib/auth.server";
import { filleulPageTitle, getFilleulDashboard, resolveFilleul } from "@/lib/parrain.server";

export async function generateMetadata({ searchParams }: PageProps<"/parrain">): Promise<Metadata> {
  return {
    title: await filleulPageTitle(firstParam((await searchParams).filleul), "Vos filleuls"),
  };
}

// Main.dc.html. Sous lg : profil, nouvelles, résultats puis versements (la carte du prochain
// appel, phase 9, se glissera après le profil).
export default async function ParrainHomePage({ searchParams }: PageProps<"/parrain">) {
  const me = await requireRole("parrain");
  const firstName = (me.parrain?.displayName ?? me.user.name).split(/\s+/)[0];
  const { filleuls, childId } = await resolveFilleul(firstParam((await searchParams).filleul));
  const dashboard = childId ? await getFilleulDashboard(childId) : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 mb-1 text-15 text-muted">Bonjour {firstName}</p>
          <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-32">Vos filleuls</h1>
        </div>
        {dashboard ? (
          <FilleulSwitcher filleuls={filleuls} currentId={dashboard.child.id} basePath="/parrain" />
        ) : null}
      </div>
      {dashboard ? (
        <TwoColumnParrain
          asideLabel="Résultats et versements"
          aside={
            <>
              <ResultsCard
                childId={dashboard.child.id}
                firstName={dashboard.child.firstName}
                results={dashboard.results}
              />
              <PaymentsCard payments={dashboard.payments} />
            </>
          }
        >
          <FilleulProfileCard child={dashboard.child} conversationId={dashboard.conversationId} />
          <LatestNews dashboard={dashboard} />
        </TwoColumnParrain>
      ) : (
        <Card padding="none">
          <EmptyState
            icon={<UsersIcon size={26} />}
            title="Vous n'avez pas encore de filleul"
            description="L'association vous présentera bientôt un enfant à parrainer. Vous recevrez un e-mail dès que votre parrainage commencera."
            action={
              <Button href="/parrain/compte" variant="secondary">
                Voir mon compte
              </Button>
            }
          />
        </Card>
      )}
    </>
  );
}
