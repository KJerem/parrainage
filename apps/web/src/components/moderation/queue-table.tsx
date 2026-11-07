import {
  MODERATION_QUEUE_PREVIEW_SIZE,
  moderationFilterLabels,
  moderationFilters,
  type ModerationFilter,
  type ModerationQueue,
} from "@parrainage/contracts";
import Link from "next/link";
import { Button, Chip, FilterPillLink, ShieldIcon } from "@/components/ui";
import { formatReceived } from "@/lib/format";
import { ApproveButton } from "./approve-button";
import {
  alertChipVariant,
  moderationAlert,
  moderationContentLabel,
  partiesLabel,
} from "./moderation-labels";

const filterHref = (filter: ModerationFilter) =>
  filter === "tous" ? "/bureau" : `/bureau?filtre=${filter}`;

const emptyMessages: Readonly<Record<ModerationFilter, string>> = {
  tous: "Aucun message à relire pour le moment.",
  enfant: "Aucun message d'enfant à relire.",
  parrain: "Aucun message de parrain à relire.",
  signales: "Aucun message signalé.",
};

/** « File de modération » de la vue d'ensemble : les premiers messages, décision sur place. */
export function ModerationQueueTable({
  queue,
  filter,
}: {
  queue: ModerationQueue;
  filter: ModerationFilter;
}) {
  const rows = queue.items.slice(0, MODERATION_QUEUE_PREVIEW_SIZE);
  return (
    <section aria-labelledby="file-moderation" className="rounded-16 border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-[18px]">
        <h2 id="file-moderation" className="m-0 text-18 font-bold">
          File de modération
        </h2>
        <nav aria-label="Filtrer la file" className="flex flex-wrap gap-1.5">
          {moderationFilters.map((value) => (
            <FilterPillLink
              key={value}
              href={filterHref(value)}
              scroll={false}
              active={value === filter}
            >
              {moderationFilterLabels[value]}
            </FilterPillLink>
          ))}
        </nav>
      </div>
      {rows.length === 0 ? (
        <p className="m-0 flex items-center gap-2 px-5 py-6 text-15 text-muted">
          <ShieldIcon size={20} />
          {emptyMessages[filter]}
        </p>
      ) : (
        <div
          className="overflow-x-auto"
          role="region"
          aria-labelledby="file-moderation"
          tabIndex={0}
        >
          <table className="w-full min-w-[760px] border-collapse text-14">
            <thead>
              <tr className="text-left text-13 text-muted">
                <th scope="col" className="px-5 py-3 font-semibold">
                  De → À
                </th>
                <th scope="col" className="px-2 py-3 font-semibold">
                  Contenu
                </th>
                <th scope="col" className="px-2 py-3 font-semibold">
                  Alerte
                </th>
                <th scope="col" className="px-2 py-3 font-semibold">
                  Reçu
                </th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">
                  Décision
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const alert = moderationAlert(item.alertTypes, item.manualFlags);
                const parties = partiesLabel(item);
                const href = `/bureau/moderation/${encodeURIComponent(item.id)}`;
                return (
                  <tr key={item.id} className="border-t border-line-soft">
                    <td className="px-5 py-3.5 font-semibold whitespace-nowrap">
                      <Link href={href}>{parties}</Link>
                    </td>
                    <td className="px-2 py-3.5 whitespace-nowrap text-ink-soft">
                      {moderationContentLabel(item)}
                    </td>
                    <td className="px-2 py-3.5 whitespace-nowrap">
                      <Chip variant={alertChipVariant[alert.tone]}>{alert.label}</Chip>
                    </td>
                    <td className="px-2 py-3.5 whitespace-nowrap text-muted">
                      {formatReceived(item.createdAt, queue.now)}
                    </td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      {/* Retenir demande un motif : la décision se prend sur la page du message. */}
                      <Button
                        href={href}
                        variant="secondary"
                        size="sm"
                        aria-label={`Retenir : ${parties}`}
                        className="mr-1.5"
                      >
                        Retenir
                      </Button>
                      <ApproveButton
                        messageId={item.id}
                        parties={parties}
                        alertLabel={alert.flagged ? alert.label : null}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {queue.total > rows.length ? (
        <div className="border-t border-line-soft px-5 py-3.5 text-14">
          <Link href="/bureau/moderation" className="font-semibold">
            Voir toute la file ({queue.total})
          </Link>
        </div>
      ) : null}
    </section>
  );
}
