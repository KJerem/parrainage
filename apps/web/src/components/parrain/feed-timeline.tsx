"use client";

import { feedPageSchema, type FeedItem } from "@parrainage/contracts";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { type FeedChild, FeedItemCard, feedItemKey } from "./feed-cards";

export type FeedTimelineProps = {
  childId: string;
  child: FeedChild;
  /** Instant de référence de l'API, gardé pour toutes les pages chargées. */
  now: string;
  initialItems: FeedItem[];
  initialCursor: string | null;
  pageSize: number;
};

type Status = "idle" | "loading" | "error";

/**
 * « Tout le fil » : la première page vient du serveur, « Charger plus » ajoute les suivantes
 * (curseur opaque de l'API). Le focus passe sur le premier élément ajouté.
 */
export function FeedTimeline({
  childId,
  child,
  now,
  initialItems,
  initialCursor,
  pageSize,
}: FeedTimelineProps) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [status, setStatus] = useState<Status>("idle");
  const [focusKey, setFocusKey] = useState<string | null>(null);

  useEffect(() => {
    if (focusKey) {
      document.getElementById(`fil-${focusKey}`)?.focus();
    }
  }, [focusKey]);

  async function loadMore() {
    if (!cursor || status === "loading") {
      return;
    }
    setStatus("loading");
    try {
      const params = new URLSearchParams({ cursor, limit: String(pageSize) });
      const response = await fetch(
        `/api/parrain/filleuls/${encodeURIComponent(childId)}/nouvelles?${params}`,
        { cache: "no-store", headers: { accept: "application/json" } },
      );
      if (!response.ok) {
        throw new Error(`Fil : ${response.status}`);
      }
      const page = feedPageSchema.parse(await response.json());
      setItems((previous) => {
        const known = new Set(previous.map(feedItemKey));
        return [...previous, ...page.items.filter((item) => !known.has(feedItemKey(item)))];
      });
      setCursor(page.nextCursor);
      setFocusKey(page.items[0] ? feedItemKey(page.items[0]) : null);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => {
        const key = feedItemKey(item);
        return (
          <FeedItemCard
            key={key}
            id={`fil-${key}`}
            tabIndex={-1}
            headingLevel="h2"
            item={item}
            child={child}
            now={now}
          />
        );
      })}
      {status === "error" ? (
        <p role="alert" className="m-0 text-center text-14 text-danger-600">
          La suite du fil n&apos;a pas pu être chargée. Vérifiez votre connexion puis réessayez.
        </p>
      ) : null}
      {cursor ? (
        <Button
          variant="secondary"
          className="self-center"
          loading={status === "loading"}
          onClick={loadMore}
        >
          Charger plus
        </Button>
      ) : (
        <p className="m-0 text-center text-14 text-muted">Vous êtes au début du fil.</p>
      )}
    </div>
  );
}
