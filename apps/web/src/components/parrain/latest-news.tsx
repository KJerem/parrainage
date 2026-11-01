import type { FilleulDashboard } from "@parrainage/contracts";
import Link from "next/link";
import { Card, EmptyState, MessageIcon } from "@/components/ui";
import { ofName } from "@/lib/labels";
import { FeedItemCard, feedItemKey } from "./feed-cards";
import { filleulHref } from "./filleul-switcher";

/** « Dernières nouvelles » de l'écran principal : les éléments les plus récents du fil. */
export function LatestNews({ dashboard }: { dashboard: FilleulDashboard }) {
  const { child, feed, now } = dashboard;
  return (
    <section aria-labelledby="fil-titre" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="fil-titre" className="m-0 text-20 font-bold">
          Dernières nouvelles
        </h2>
        {feed.length > 0 ? (
          <Link
            href={filleulHref("/parrain/nouvelles", child.id)}
            className="text-14 font-semibold underline"
          >
            Tout le fil
          </Link>
        ) : null}
      </div>
      {feed.length > 0 ? (
        feed.map((item) => (
          <FeedItemCard key={feedItemKey(item)} item={item} child={child} now={now} />
        ))
      ) : (
        <NoNewsYet firstName={child.firstName} />
      )}
    </section>
  );
}

export function NoNewsYet({
  firstName,
  headingLevel = "h3",
}: {
  firstName: string;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <Card padding="none">
      <EmptyState
        headingLevel={headingLevel}
        icon={<MessageIcon size={26} />}
        title="Pas encore de nouvelles"
        description={`Les messages ${ofName(firstName)} et les nouvelles de son relais apparaîtront ici.`}
      />
    </Card>
  );
}
