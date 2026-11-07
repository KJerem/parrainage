import type { ModerationQueue, ModerationSummary } from "@parrainage/contracts";
import Link from "next/link";
import { Chip } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  alertChipVariant,
  moderationAlert,
  moderationContentLabel,
  partiesLabel,
  queueHeadline,
} from "./moderation-labels";

/** File d'attente de B-Moderation : l'alerte du message, sinon son contenu. */
export function ModerationQueueList({
  queue,
  summary,
  selectedId,
}: {
  queue: ModerationQueue;
  summary: ModerationSummary;
  selectedId?: string;
}) {
  const hidden = queue.total - queue.items.length;
  return (
    <aside
      aria-label="File d'attente"
      className="min-w-0 overflow-hidden rounded-16 border border-line bg-white"
    >
      <div className="px-4 py-3.5 text-14 font-bold">{queueHeadline(summary)}</div>
      <ul className="m-0 list-none p-0">
        {queue.items.map((item) => {
          const alert = moderationAlert(item.alertTypes, item.manualFlags);
          const selected = item.id === selectedId;
          const danger = alert.tone === "danger";
          return (
            <li key={item.id}>
              <Link
                href={`/bureau/moderation/${encodeURIComponent(item.id)}`}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex flex-col gap-1 border-t border-line-soft px-4 py-3.5 text-ink no-underline transition-colors hover:text-ink",
                  selected ? (danger ? "bg-danger-100" : "bg-brand-100") : "hover:bg-canvas",
                )}
              >
                <strong className="text-14 [overflow-wrap:anywhere]">{partiesLabel(item)}</strong>
                {alert.flagged ? (
                  <span>
                    <Chip
                      variant={
                        selected && danger ? "danger-on-white" : alertChipVariant[alert.tone]
                      }
                    >
                      {alert.shortLabel}
                    </Chip>
                  </span>
                ) : (
                  <span className="text-13 text-muted">{moderationContentLabel(item)}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? (
        <p className="m-0 border-t border-line-soft px-4 py-3 text-13 text-muted">
          Et {hidden} de plus, qui apparaîtront une fois ceux-ci traités.
        </p>
      ) : null}
    </aside>
  );
}
