"use client";

import type { ConversationSummary } from "@parrainage/contracts";
import Link from "next/link";
import { useDeferredValue, useId, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { CountBadge } from "@/components/ui/chip";
import { Input } from "@/components/ui/form-field";
import { cn } from "@/lib/cn";
import { formatListDate } from "@/lib/format";
import { listName, previewText } from "./messaging-labels";

export type ConversationListProps = {
  items: readonly ConversationSummary[];
  /** Instant de référence de l'API (« hier », « 2 sept. »). */
  now: string;
  timeZone: string;
  /** « /parrain/messages » : chaque conversation s'ouvre sur `${basePath}/${id}`. */
  basePath: string;
  selectedId?: string | null;
  /**
   * `page` : la conversation de l'adresse (aria-current) ; `md` : celle affichée à côté de la
   * liste à partir de md seulement (page de liste), simplement mise en évidence.
   */
  selection?: "page" | "md";
  /** Champ « Rechercher une conversation » (P-Messages). */
  searchable?: boolean;
  /** Au-dessus des conversations, par ex. les onglets de RW-Messages. */
  header?: ReactNode;
  /** Texte quand la liste est vide. */
  emptyText?: string;
  /** Avatars en 13 px (RW-Messages) plutôt qu'en 14 px (P-Messages). */
  compact?: boolean;
  className?: string;
};

const normalize = (text: string) =>
  text.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr-FR");

/** Liste des conversations : recherche locale, conversation ouverte en surbrillance. */
export function ConversationList({
  items,
  now,
  timeZone,
  basePath,
  selectedId,
  selection = "page",
  searchable = false,
  header,
  emptyText = "Aucune conversation pour l'instant.",
  compact = false,
  className,
}: ConversationListProps) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const needle = normalize(deferredQuery.trim());
  const shown = needle
    ? items.filter((item) =>
        normalize(
          [listName(item.counterpart), item.subject ?? "", item.lastMessage?.body ?? ""].join(" "),
        ).includes(needle),
      )
    : items;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-16 border border-line bg-white",
        className,
      )}
    >
      {searchable ? (
        <div className="border-b border-line-soft p-4">
          <label htmlFor={searchId} className="sr-only">
            Rechercher
          </label>
          <Input
            id={searchId}
            type="search"
            placeholder="Rechercher une conversation"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </div>
      ) : null}
      {header}
      <nav aria-label="Conversations" className="relative min-h-0 flex-1 overflow-y-auto">
        {shown.length > 0 ? (
          <ul
            className={cn(
              "m-0 list-none divide-y divide-line-soft p-0",
              !searchable && "border-t border-line-soft",
            )}
          >
            {shown.map((item) => (
              <li key={item.id}>
                <ConversationItem
                  item={item}
                  href={`${basePath}/${encodeURIComponent(item.id)}`}
                  selected={item.id === selectedId ? selection : null}
                  now={now}
                  timeZone={timeZone}
                  compact={compact}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 px-4 py-6 text-center text-14 text-muted">
            {needle ? "Aucune conversation ne correspond à votre recherche." : emptyText}
          </p>
        )}
      </nav>
    </div>
  );
}

type ConversationItemProps = {
  item: ConversationSummary;
  href: string;
  selected: "page" | "md" | null;
  now: string;
  timeZone: string;
  compact: boolean;
};

function ConversationItem({ item, href, selected, now, timeZone, compact }: ConversationItemProps) {
  const { counterpart } = item;
  const name = listName(counterpart);
  const unread = item.unreadCount > 0;
  const bureau = counterpart.kind === "bureau";
  return (
    <Link
      href={href}
      aria-current={selected === "page" ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 px-4 py-3.5 text-ink no-underline transition-colors hover:text-ink",
        selected === "page" && "bg-brand-100",
        selected === "md" && "md:bg-brand-100",
        selected !== "page" && "hover:bg-surface-alt",
      )}
    >
      <Avatar
        size={40}
        tone={counterpart.avatarTone}
        initials={counterpart.initials}
        className={cn(bureau ? (compact ? "text-11" : "text-12") : compact ? "text-13" : "text-14")}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="text-15 [overflow-wrap:anywhere]">{name}</strong>
        {item.access === "supervisor" && counterpart.subtitle ? (
          // Conversation d'un enfant suivie par le relais : avec quel parrain (Kofi en a deux).
          <span className="text-12 [overflow-wrap:anywhere] text-muted">
            {counterpart.subtitle}
          </span>
        ) : null}
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-13",
              selected === "page"
                ? "text-ink-soft"
                : selected === "md"
                  ? "text-muted md:text-ink-soft"
                  : "text-muted",
            )}
          >
            {previewText(item.lastMessage)}
          </span>
          {unread ? (
            <CountBadge
              count={item.unreadCount}
              srLabel={item.unreadCount > 1 ? "non lus" : "non lu"}
              className="shrink-0"
            />
          ) : item.lastMessage ? (
            <time dateTime={item.lastMessageAt} className="shrink-0 text-12 text-muted">
              {formatListDate(item.lastMessageAt, now, timeZone)}
            </time>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
