import type { Metadata } from "next";
import { ParrainCallsView } from "@/components/calls/parrain-calls";
import { FilleulSwitcher } from "@/components/parrain/filleul-switcher";
import { Button, Card, EmptyState, VideoIcon } from "@/components/ui";
import { firstParam } from "@/lib/auth-paths";
import { requireRole } from "@/lib/auth.server";
import { getParrainCalls } from "@/lib/calls.server";
import { filleulPageTitle, resolveFilleul } from "@/lib/parrain.server";

export async function generateMetadata({
  searchParams,
}: PageProps<"/parrain/appels">): Promise<Metadata> {
  return {
    title: await filleulPageTitle(firstParam((await searchParams).filleul), "Appels vidéo"),
  };
}

// P-Video.dc.html : demander un appel avec un filleul, l'appel confirmé, les appels passés.
export default async function ParrainAppelsPage({ searchParams }: PageProps<"/parrain/appels">) {
  await requireRole("parrain");
  const { filleuls, childId } = await resolveFilleul(firstParam((await searchParams).filleul));
  const data = childId ? await getParrainCalls(childId) : null;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-30">Appels vidéo</h1>
        {data && filleuls.length > 1 ? (
          <FilleulSwitcher
            filleuls={filleuls}
            currentId={data.child.id}
            basePath="/parrain/appels"
          />
        ) : null}
      </div>
      {data ? (
        <ParrainCallsView data={data} />
      ) : (
        <Card padding="none">
          <EmptyState
            icon={<VideoIcon size={26} />}
            title="Pas encore d'appel possible"
            description="Les appels vidéo se font avec votre filleul, depuis la salle de son relais. Ils seront possibles dès que l'association vous aura présenté un enfant."
            action={
              <Button href="/parrain" variant="secondary">
                Retour à mes filleuls
              </Button>
            }
          />
        </Card>
      )}
    </>
  );
}
