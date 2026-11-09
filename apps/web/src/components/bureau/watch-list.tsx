import type { BureauOverview } from "@parrainage/contracts";
import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { watchChip, watchTitle } from "./bureau-labels";

/** « Binômes à surveiller » (Bureau.dc.html) : alertes, puis enfants à parrainer. */
export function WatchList({ watch }: { watch: BureauOverview["watch"] }) {
  const more = watch.total - watch.items.length;
  return (
    <Card as="section" aria-labelledby="veille" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="veille" className="m-0 text-18 font-bold">
          Binômes à surveiller
        </h2>
        <Link href="/bureau/binomes" className="text-14 font-semibold">
          Tous les binômes
        </Link>
      </div>
      {watch.items.length === 0 ? (
        <p className="m-0 text-15 text-muted">Aucun binôme ne demande d&apos;attention.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {watch.items.map((item) => {
            const chip = watchChip(item);
            const href =
              item.kind === "waiting"
                ? `/bureau/binomes?enfant=${encodeURIComponent(item.child.id)}`
                : `/bureau/enfants/${encodeURIComponent(item.child.id)}`;
            return (
              <li
                key={`${item.kind}-${item.id}`}
                className="flex items-center gap-3 border-b border-line-soft py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={href}
                    className="text-15 font-bold text-ink no-underline hover:underline"
                  >
                    {watchTitle(item)}
                  </Link>
                  <div className="text-13 text-muted">
                    Relais : {item.relais.displayName}, {item.relais.city}
                  </div>
                </div>
                <Chip variant={chip.variant} className="shrink-0">
                  {chip.label}
                </Chip>
              </li>
            );
          })}
        </ul>
      )}
      {more > 0 ? (
        <p className="m-0 text-13 text-muted">
          Et {more} autre{more > 1 ? "s" : ""} : voir tous les binômes.
        </p>
      ) : null}
    </Card>
  );
}
