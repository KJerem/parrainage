import type { RelaisHome } from "@parrainage/contracts";
import Link from "next/link";
import { Button, StatTile } from "@/components/ui";
import { formatDayMonth, formatWeekdayDate, RELAIS_TIME_ZONE } from "@/lib/format";
import { ChildrenTable } from "./children-table";
import { PendingList } from "./offline-status";
import { RelaisHomeMobile } from "./relais-home-mobile";

const plural = (count: number, one: string, many: string) => (count > 1 ? many : one);

function TodoCard({ home }: { home: RelaisHome }) {
  const { bulletinsToEnter } = home.stats;
  const { bulletinsDue, draftCount } = home;
  return (
    <section
      aria-labelledby="a-faire"
      className="flex flex-col gap-2.5 rounded-16 border border-line bg-white p-[18px]"
    >
      <h2 id="a-faire" className="m-0 text-17 font-bold">
        À faire
      </h2>
      {bulletinsToEnter > 0 && bulletinsDue ? (
        <Link
          href="/relais/resultats"
          className="flex flex-col rounded-10 bg-accent-100 p-3 text-ink no-underline hover:text-ink"
        >
          <strong className="text-14">
            Saisir {bulletinsToEnter} {plural(bulletinsToEnter, "bulletin", "bulletins")} du{" "}
            {bulletinsDue.term}
          </strong>
          {bulletinsDue.dueDate ? (
            <span className="text-13 text-accent-900">
              Avant le{" "}
              {formatDayMonth(`${bulletinsDue.dueDate}T12:00:00Z`, {
                month: "long",
                withYear: false,
                timeZone: RELAIS_TIME_ZONE,
              })}
            </span>
          ) : null}
        </Link>
      ) : null}
      {draftCount > 0 ? (
        <Link
          href="/relais/enfants"
          className="flex flex-col rounded-10 bg-info-100 p-3 text-ink no-underline hover:text-ink"
        >
          <strong className="text-14">
            Terminer {draftCount} {plural(draftCount, "dossier", "dossiers")}
          </strong>
          <span className="text-13 text-info-600">
            {plural(draftCount, "Brouillon pas encore envoyé", "Brouillons pas encore envoyés")} au
            bureau
          </span>
        </Link>
      ) : null}
      {bulletinsToEnter === 0 && draftCount === 0 ? (
        <p className="m-0 text-14 text-ink-soft">Rien d&apos;urgent pour le moment.</p>
      ) : null}
    </section>
  );
}

/** L'accueil du relais : RW-Accueil à partir de md, Relais.dc.html en dessous (CSS). */
export function RelaisHomeView({ home, name }: { home: RelaisHome; name: string }) {
  const { stats } = home;
  const dayLabel = formatWeekdayDate(home.now, RELAIS_TIME_ZONE);
  return (
    <>
      <RelaisHomeMobile home={home} />
      <div className="hidden flex-col gap-6 md:flex">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="m-0 mb-1 text-15 text-muted">{dayLabel}</p>
            <h1 className="m-0 text-30 font-extrabold">Bonjour {name}</h1>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button href="/relais/enfants/nouveau" variant="secondary">
              Ajouter un enfant
            </Button>
            <Button href="/relais/publier" variant="accent" className="font-bold">
              Publier une nouvelle
            </Button>
          </div>
        </div>
        <section
          aria-label="Indicateurs"
          className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5"
        >
          <StatTile size="sm" label="Enfants suivis" value={stats.childCount} />
          <StatTile size="sm" label="Nouvelles ce mois" value={stats.newsThisMonth} />
          <StatTile
            size="sm"
            label="Messages non lus"
            value={stats.unreadMessages}
            tone={stats.unreadMessages > 0 ? "warning" : "default"}
          />
          <StatTile
            size="sm"
            label="Bulletins à saisir"
            value={stats.bulletinsToEnter}
            tone={stats.bulletinsToEnter > 0 ? "danger" : "default"}
          />
        </section>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section
            aria-labelledby="mes-enfants"
            className="relative min-w-0 overflow-hidden rounded-16 border border-line bg-white"
          >
            <h2
              id="mes-enfants"
              className="m-0 px-3.5 pt-4 pb-2 text-18 font-bold md:min-h-[58px] md:pb-0"
            >
              Mes enfants
            </h2>
            <ChildrenTable rows={home.children} now={home.now} headingId="mes-enfants" />
          </section>
          <div className="flex min-w-0 flex-col gap-5">
            <TodoCard home={home} />
            <PendingList />
          </div>
        </div>
      </div>
    </>
  );
}
