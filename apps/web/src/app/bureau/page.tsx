import { moderationFilterSchema } from "@parrainage/contracts";
import type { Metadata } from "next";
import { activeSponsorshipsSub } from "@/components/bureau/bureau-labels";
import { WatchList } from "@/components/bureau/watch-list";
import { pendingMediaLabel } from "@/components/moderation/moderation-labels";
import { ModerationQueueTable } from "@/components/moderation/queue-table";
import { Button, StatTile } from "@/components/ui";
import { firstParam } from "@/lib/auth-paths";
import { requireRole } from "@/lib/auth.server";
import { getBureauOverview } from "@/lib/bureau.server";
import { formatEuros, formatPeriodKey } from "@/lib/format";
import { getModerationQueue, getModerationSummary } from "@/lib/moderation.server";

export const metadata: Metadata = { title: "Vue d'ensemble" };

// Bureau.dc.html : « Exporter le rapport » et les finances par relais arrivent avec la phase 12.
export default async function BureauHomePage({ searchParams }: PageProps<"/bureau">) {
  await requireRole("bureau");
  const filter = moderationFilterSchema
    .catch("tous")
    .parse(firstParam((await searchParams).filtre));
  const [summary, queue, overview] = await Promise.all([
    getModerationSummary(),
    getModerationQueue(filter),
    getBureauOverview(),
  ]);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 mb-1 text-15 text-muted">{formatPeriodKey(summary.now.slice(0, 7))}</p>
          <h1 className="m-0 text-30 font-extrabold max-sm:text-24">Vue d&apos;ensemble</h1>
        </div>
        <Button href="/bureau/binomes">Créer un binôme</Button>
      </div>
      <section
        aria-label="Indicateurs"
        className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4"
      >
        <StatTile
          size="lg"
          label="Binômes actifs"
          value={overview.activeSponsorships}
          sub={activeSponsorshipsSub(overview.countries, overview.relaisCount)}
        />
        <StatTile
          size="lg"
          label="Messages à relire"
          value={summary.pending}
          tone={summary.pending > 0 ? "warning" : "default"}
          sub={pendingMediaLabel(summary)}
        />
        <StatTile
          size="lg"
          label="Sans nouvelle > 60 j"
          value={overview.staleChildren}
          tone={overview.staleChildren > 0 ? "danger" : "default"}
          sub={overview.staleChildren > 1 ? "enfants parrainés" : "enfant parrainé"}
        />
        <StatTile
          size="lg"
          label="Collecté ce mois"
          value={formatEuros(overview.collectedThisMonthCents)}
          sub={
            overview.latePayments === 0
              ? "aucun versement en retard"
              : `${overview.latePayments} versement${overview.latePayments > 1 ? "s" : ""} en retard`
          }
        />
      </section>
      <ModerationQueueTable queue={queue} filter={filter} />
      <WatchList watch={overview.watch} />
    </>
  );
}
