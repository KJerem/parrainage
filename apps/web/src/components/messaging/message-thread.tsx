"use client";

import {
  messagePageSchema,
  unreadCountSchema,
  type ConversationDetail,
  type ConversationMessage,
  type MessagePage,
} from "@parrainage/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, VideoIcon } from "@/components/ui/icons";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { features } from "@/lib/features";
import { civilDayKey, formatClock, formatDaySeparator } from "@/lib/format";
import { DaySeparator, MessageItem } from "./chat-bubble";
import { Composer } from "./composer";
import { recipientName, threadSubtitle } from "./messaging-labels";

export type MessageThreadProps = {
  conversation: ConversationDetail;
  /** Dernière page de messages, lue par le serveur. */
  page: MessagePage;
  timeZone: string;
  variant: "parrain" | "relais";
  /** Nom de la personne en titre de la page (P-Messages) ou sous le titre « Messages » (RW). */
  titleAs?: "h1" | "h2";
  /** Retour à la liste, sous md (fil en plein écran). */
  backHref?: string;
  /**
   * « md » : le fil n'est visible qu'à partir de md (page de liste) ; plus petit, l'ouvrir ne
   * le marque pas comme lu.
   */
  markReadFrom?: "always" | "md";
  className?: string;
};

const byDate = (a: ConversationMessage, b: ConversationMessage) =>
  a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);

/**
 * Fusionne les pages sans doublon, du plus ancien au plus récent ; pour un même message, la
 * dernière version passée l'emporte (celle du serveur, relue après un envoi).
 */
function mergeMessages(...groups: readonly (readonly ConversationMessage[])[]) {
  const byId = new Map<string, ConversationMessage>();
  for (const group of groups) for (const message of group) byId.set(message.id, message);
  return [...byId.values()].sort(byDate);
}

/** « Vous, hier à 15:00 », « Aïcha S., le 14 octobre à 17:30 ». */
function srIntro(message: ConversationMessage, now: string, timeZone: string) {
  const day = formatDaySeparator(message.createdAt, now, timeZone);
  const when = day === "Aujourd'hui" ? "aujourd'hui" : day === "Hier" ? "hier" : `le ${day}`;
  const who = message.side === "me" ? "Vous" : message.author.name;
  return `${who}, ${when} à ${formatClock(message.createdAt, timeZone)} :`;
}

/**
 * Fil d'une conversation : en-tête, messages (hauteur fixe, défilement vers le plus récent,
 * « Plus anciens »), puis la zone de réponse. L'ouvrir le marque comme lu.
 */
export function MessageThread({
  conversation,
  page,
  timeZone,
  variant,
  titleAs: Title = "h1",
  backHref,
  markReadFrom = "always",
  className,
}: MessageThreadProps) {
  const router = useRouter();
  const logRef = useRef<HTMLDivElement>(null);
  const [older, setOlder] = useState<ConversationMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(undefined);
  const [sent, setSent] = useState<ConversationMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const pendingScroll = useRef<{ mode: "bottom" } | { mode: "keep"; height: number } | null>({
    mode: "bottom",
  });

  const messages = mergeMessages(older, sent, page.items);
  const cursor = olderCursor === undefined ? page.nextCursor : olderCursor;
  const lastId = messages.at(-1)?.id;
  const recipient = recipientName(conversation.counterpart);
  const subtitle = threadSubtitle(conversation);
  const parrain = variant === "parrain";

  // Défilement : en bas à l'ouverture et à chaque nouveau message, position gardée quand des
  // messages plus anciens s'ajoutent au-dessus.
  useLayoutEffect(() => {
    const log = logRef.current;
    const request = pendingScroll.current;
    if (!log || !request) return;
    pendingScroll.current = null;
    log.scrollTop =
      request.mode === "bottom" ? log.scrollHeight : log.scrollHeight - request.height;
  });

  const lastSeen = useRef(lastId);
  useEffect(() => {
    if (lastId === lastSeen.current) return;
    lastSeen.current = lastId;
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }, [lastId]);

  // Lu à l'ouverture : pastilles de la navigation et de la liste remises à jour.
  const unread = conversation.unreadCount;
  useEffect(() => {
    if (markReadFrom === "md" && !window.matchMedia("(min-width: 768px)").matches) return;
    const controller = new AbortController();
    apiFetch(`/api/conversations/${encodeURIComponent(conversation.id)}/read`, unreadCountSchema, {
      method: "POST",
      signal: controller.signal,
    })
      .then(() => {
        if (unread > 0) router.refresh();
      })
      .catch(() => {});
    return () => controller.abort();
    // Une seule fois par conversation ouverte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  async function loadOlder() {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(false);
    try {
      const params = new URLSearchParams({ cursor });
      const { data } = await apiFetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/messages?${params}`,
        messagePageSchema,
      );
      pendingScroll.current = { mode: "keep", height: logRef.current?.scrollHeight ?? 0 };
      setOlder((previous) => mergeMessages(data.items, previous));
      setOlderCursor(data.nextCursor);
    } catch {
      setOlderError(true);
    } finally {
      setLoadingOlder(false);
    }
  }

  function handleSent(message: ConversationMessage) {
    setSent((previous) => [...previous, message]);
    // Liste des conversations (aperçu, ordre) relue par le serveur.
    router.refresh();
  }

  const rows = messages.map((message, index) => {
    const day = civilDayKey(message.createdAt, timeZone);
    const previous = messages[index - 1];
    return {
      message,
      day,
      separator: !previous || civilDayKey(previous.createdAt, timeZone) !== day,
    };
  });

  return (
    <section
      aria-label={`Conversation avec ${conversation.counterpart.shortName}`}
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-16 border border-line bg-white",
        className,
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line-soft px-4 py-4 md:px-5">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Retour aux conversations"
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-12 text-ink transition-colors hover:bg-canvas hover:text-ink md:hidden"
          >
            <ChevronLeftIcon size={22} />
          </Link>
        ) : null}
        {parrain ? (
          <Avatar
            size={44}
            tone={conversation.counterpart.avatarTone}
            initials={conversation.counterpart.initials}
            className={conversation.counterpart.kind === "bureau" ? "text-13" : undefined}
          />
        ) : null}
        <div className="min-w-0 flex-[1_1_8rem]">
          <Title className="m-0 text-18 font-bold">{conversation.counterpart.name}</Title>
          {subtitle ? <p className="m-0 text-13 text-muted">{subtitle}</p> : null}
        </div>
        {features.calls &&
        parrain &&
        conversation.kind === "SPONSORSHIP" &&
        conversation.childId ? (
          <Button
            href={`/parrain/appels?filleul=${encodeURIComponent(conversation.childId)}`}
            variant="secondary"
            leftIcon={<VideoIcon size={18} />}
          >
            Proposer un appel vidéo
          </Button>
        ) : null}
      </header>

      <div
        ref={logRef}
        role="log"
        aria-label="Messages"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={loadingOlder || undefined}
        tabIndex={0}
        className={cn(
          // `relative` : les textes « sr-only » (absolus) restent dans la zone qui défile.
          "relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface-alt focus-visible:-outline-offset-2",
          parrain ? "gap-4 p-6 max-md:p-4" : "gap-3.5 p-5 max-md:p-4",
        )}
      >
        {cursor ? (
          <div className="flex flex-col items-center gap-2 self-center">
            <Button variant="secondary" size="md" loading={loadingOlder} onClick={loadOlder}>
              Plus anciens
            </Button>
            {olderError ? (
              <p role="alert" className="m-0 text-13 text-danger-600">
                Les messages plus anciens n&apos;ont pas pu être chargés. Réessayez.
              </p>
            ) : null}
          </div>
        ) : null}
        {messages.length === 0 ? (
          <p className="m-auto max-w-[360px] text-center text-14 leading-[1.5] text-muted">
            Aucun message pour l&apos;instant.{" "}
            {conversation.canWrite ? `Écrivez le premier à ${recipient} !` : null}
          </p>
        ) : null}
        {rows.map(({ message, day, separator }) => (
          <Fragment key={message.id}>
            {separator ? (
              <DaySeparator dateTime={day}>
                {formatDaySeparator(message.createdAt, page.now, timeZone)}
              </DaySeparator>
            ) : null}
            <MessageItem
              message={message}
              recipient={recipient}
              srIntro={srIntro(message, page.now, timeZone)}
              showDelivery={message.id === lastId}
            />
          </Fragment>
        ))}
      </div>

      {conversation.canWrite ? (
        <Composer
          conversationId={conversation.id}
          recipient={recipient}
          moderated={conversation.moderated}
          variant={variant}
          onSent={handleSent}
        />
      ) : (
        <p className="m-0 border-t border-line-soft px-5 py-4 text-14 text-muted">
          Vous suivez cette conversation : vous ne pouvez pas y écrire.
        </p>
      )}
    </section>
  );
}
