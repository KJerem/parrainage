"use client";

import { usePathname } from "next/navigation";
import { Button, Notice } from "@/components/ui";
import { formatClock, RELAIS_TIME_ZONE } from "@/lib/format";
import { cn } from "@/lib/cn";
import { type OutboxNews, pendingMediaLabel, pendingSummary } from "@/lib/outbox/core";
import { useOutbox } from "./outbox-provider";

/** « Hors ligne · 2 publications seront envoyées au retour du réseau » */
function useOfflineMessage(): string | null {
  const { items, online } = useOutbox();
  if (online) {
    return null;
  }
  const summary = pendingSummary(items);
  if (!summary) {
    return "Hors ligne · vos saisies partiront au retour du réseau";
  }
  return `Hors ligne · ${summary.label} ${summary.plural ? "seront envoyées" : "sera envoyée"} au retour du réseau`;
}

/** Bandeau de l'en-tête vert de l'accueil mobile (Relais.dc.html). */
export function OfflineHeaderBanner() {
  const message = useOfflineMessage();
  return message ? (
    <Notice variant="offline-dark" size="sm" role="status">
      {message}
    </Notice>
  ) : null;
}

/**
 * Le même message sur les autres écrans : à partir de md partout ; en dessous, sauf sur l'accueil
 * (l'en-tête le porte) et la publication (elle a son propre encadré). Une session expirée le dit.
 */
export function OfflineNotice() {
  const message = useOfflineMessage();
  const { needsLogin } = useOutbox();
  const pathname = usePathname();
  const hasOwnMobileNotice = pathname === "/relais" || pathname === "/relais/publier";
  if (needsLogin) {
    return (
      <Notice role="status" title="Votre session a expiré">
        Reconnectez-vous pour envoyer ce qui attend sur ce poste.{" "}
        <a href="/connexion?next=/relais">Se reconnecter</a>
      </Notice>
    );
  }
  return message ? (
    <Notice role="status" className={cn(hasOwnMobileNotice && "max-md:hidden")}>
      {message}
    </Notice>
  ) : null;
}

function PendingNews({ item, onRemove }: { item: OutboxNews; onRemove: () => void }) {
  const at = formatClock(item.createdAt, RELAIS_TIME_ZONE);
  const recipients =
    item.parrainCount === 1
      ? "Pour 1 parrain"
      : item.parrainCount > 1
        ? `Pour ${item.parrainCount} parrains`
        : "Pour le relais";
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-10 bg-brand-100 px-1 text-center text-11 font-semibold text-brand-700">
        {pendingMediaLabel(item)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-15 font-bold [overflow-wrap:anywhere]">{item.payload.title}</div>
        {item.error ? (
          <div className="text-13 font-semibold text-danger-600">{item.error}</div>
        ) : (
          <div className="text-13 text-muted">
            {recipients} · enregistré à {at}
          </div>
        )}
      </div>
      {item.error ? (
        <Button size="sm" variant="secondary" onClick={onRemove}>
          Retirer
        </Button>
      ) : null}
    </div>
  );
}

/** « En attente d'envoi » : les publications de la file, et le nombre de saisies de résultats. */
export function PendingList({ className }: { className?: string }) {
  const { items, removeItem } = useOutbox();
  const news = items.filter((item) => item.type === "news");
  const results = items.length - news.length;
  if (items.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="en-attente" className={cn("flex flex-col gap-2.5", className)}>
      <h2 id="en-attente" className="m-0 text-17 font-bold">
        En attente d&apos;envoi
      </h2>
      <div className="divide-y divide-line-soft overflow-hidden rounded-14 border border-line bg-white">
        {news.map((item) => (
          <PendingNews key={item.seq} item={item} onRemove={() => void removeItem(item.seq)} />
        ))}
        {results > 0 ? (
          <div className="p-3 text-14 font-semibold">
            {results} {results > 1 ? "saisies" : "saisie"} de résultats
          </div>
        ) : null}
      </div>
    </section>
  );
}
