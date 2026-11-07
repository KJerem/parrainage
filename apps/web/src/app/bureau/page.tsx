import { moderationFilterSchema } from "@parrainage/contracts";
import type { Metadata } from "next";
import { pendingMediaLabel } from "@/components/moderation/moderation-labels";
import { ModerationQueueTable } from "@/components/moderation/queue-table";
import { StatTile } from "@/components/ui";
import { firstParam } from "@/lib/auth-paths";
import { requireRole } from "@/lib/auth.server";
import { formatPeriodKey } from "@/lib/format";
import { getModerationQueue, getModerationSummary } from "@/lib/moderation.server";

export const metadata: Metadata = { title: "Vue d'ensemble" };

// Bureau.dc.html : les autres indicateurs, les binômes à surveiller et les finances arrivent avec
// les rubriques qui les calculent. Grille auto-fill : une tuile seule ne s'étire pas.
export default async function BureauHomePage({ searchParams }: PageProps<"/bureau">) {
  await requireRole("bureau");
  const filter = moderationFilterSchema
    .catch("tous")
    .parse(firstParam((await searchParams).filtre));
  const [summary, queue] = await Promise.all([getModerationSummary(), getModerationQueue(filter)]);
  return (
    <>
      <div>
        <p className="m-0 mb-1 text-15 text-muted">{formatPeriodKey(summary.now.slice(0, 7))}</p>
        <h1 className="m-0 text-30 font-extrabold max-sm:text-24">Vue d&apos;ensemble</h1>
      </div>
      <section
        aria-label="Indicateurs"
        className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4"
      >
        <StatTile
          size="lg"
          label="Messages à relire"
          value={summary.pending}
          tone={summary.pending > 0 ? "warning" : "default"}
          sub={pendingMediaLabel(summary)}
        />
      </section>
      <ModerationQueueTable queue={queue} filter={filter} />
    </>
  );
}
