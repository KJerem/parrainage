/* eslint-disable @next/next/no-img-element -- médias servis par /api/media (302 vers une URL
   présignée de 120 s) : l'optimiseur de next/image n'a pas la session du visiteur. */
import { mediaPath, type ConversationMessage, type MediaRef } from "@parrainage/contracts";
import type { HTMLAttributes, ReactNode } from "react";
import { CheckIcon, PlayCircleIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { mediaKindLabels } from "@/lib/labels";
import { statusLabel } from "./messaging-labels";

export type ChatBubbleProps = HTMLAttributes<HTMLDivElement> & {
  /** `me` : envoyé par le lecteur (à droite, vert), `them` : reçu (à gauche, gris). */
  side: "me" | "them";
};

/** Bulle d'un message d'adulte (P-Messages, RW-Messages) : 70 % au plus, coin pointu côté auteur. */
export function ChatBubble({ side, className, ...props }: ChatBubbleProps) {
  return (
    <div
      className={cn(
        "px-4 py-3 text-15 leading-[1.5] [overflow-wrap:anywhere] whitespace-pre-line",
        side === "me"
          ? "rounded-[16px_16px_4px_16px] bg-brand-700 text-white"
          : "rounded-[16px_16px_16px_4px] bg-canvas text-ink",
        className,
      )}
      {...props}
    />
  );
}

/** Séparateur de jour du fil : « 14 octobre », « Hier ». */
export function DaySeparator({ children, dateTime }: { children: ReactNode; dateTime?: string }) {
  return (
    <p className="m-0 self-center text-12 font-semibold text-muted">
      {dateTime ? <time dateTime={dateTime}>{children}</time> : children}
    </p>
  );
}

const tileBase =
  "flex h-24 w-[140px] shrink-0 items-center justify-center overflow-hidden rounded-12 px-2 text-center text-12 font-semibold";

function documentLabel(media: MediaRef): string {
  const label = media.label ?? mediaKindLabels[media.kind];
  return media.mimeType === "application/pdf" && !/pdf/i.test(label) ? `${label} (PDF)` : label;
}

/** Pièce jointe d'un message, 140 × 96 : photo, vidéo ou document (pointillés). */
export function AttachmentTile({
  media,
  srcOf,
}: {
  media: MediaRef;
  /** Autre chemin de lecture (espace enfant) ; sinon /api/media. */
  srcOf?: (media: MediaRef) => string | null;
}) {
  const src = srcOf ? srcOf(media) : mediaPath(media);
  const label = media.label ?? mediaKindLabels[media.kind];
  // Une page de bulletin photographiée s'affiche comme une photo.
  const isImage =
    media.kind === "PHOTO" ||
    media.kind === "AVATAR" ||
    (media.kind === "BULLETIN" && media.mimeType.startsWith("image/"));
  if (isImage) {
    return src ? (
      <a
        href={src}
        target="_blank"
        rel="noopener"
        className={cn(tileBase, "bg-brand-100 p-0 no-underline")}
      >
        <img
          src={src}
          alt={label}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
        <span className="sr-only"> (ouvrir en grand)</span>
      </a>
    ) : (
      <div className={cn(tileBase, "bg-brand-100 text-brand-700")}>{label}</div>
    );
  }
  if (media.kind === "VIDEO") {
    const duration = media.durationSec === null ? null : formatDuration(media.durationSec);
    return src ? (
      <video
        src={src}
        controls
        preload="metadata"
        playsInline
        aria-label={duration ? `${label} · ${duration}` : label}
        className={cn(tileBase, "bg-brand-700 object-cover p-0")}
      />
    ) : (
      <div className={cn(tileBase, "gap-1.5 bg-brand-700 text-white")}>
        <PlayCircleIcon size={20} />
        {duration ? `${label} · ${duration}` : label}
      </div>
    );
  }
  const document = documentLabel(media);
  const dashed = cn(tileBase, "border border-dashed border-line-strong text-ink");
  return src ? (
    <a
      href={srcOf ? src : (mediaPath(media, { download: true }) ?? src)}
      className={cn(dashed, "no-underline transition-colors hover:bg-canvas hover:text-ink")}
    >
      <span className="max-w-full break-words">{document}</span>
      <span className="sr-only"> (télécharger)</span>
    </a>
  ) : (
    <div className={dashed}>
      <span className="max-w-full break-words">{document}</span>
    </div>
  );
}

const statusTone = {
  en_relecture: "text-accent-700",
  remis: "text-muted",
  lu: "text-muted",
  retenu: "text-danger-600",
} as const;

export type MessageItemProps = {
  message: ConversationMessage;
  /** Prénom ou nom du destinataire : « Remis à Aïcha ». */
  recipient: string;
  /** Texte pour les lecteurs d'écran avant la bulle : « Vous, hier à 15:00 ». */
  srIntro: string;
  /**
   * « Remis » et « Lu » ne s'affichent que sous le dernier message du fil (une réponse les rend
   * évidents) ; « En relecture » et « Retenu » restent toujours visibles.
   */
  showDelivery?: boolean;
  /** Action sous le message (signalement par le relais). */
  actions?: ReactNode;
};

/** Un message du fil : bulle, pièces jointes, puis le suivi pour son auteur. */
export function MessageItem({
  message,
  recipient,
  srIntro,
  showDelivery = true,
  actions,
}: MessageItemProps) {
  const mine = message.side === "me";
  const status =
    message.status === "remis" || message.status === "lu"
      ? showDelivery
        ? message.status
        : null
      : message.status;
  // La confirmation d'un appel se lit sur sa carte : pas de bulle de texte en plus.
  const hasText =
    message.body !== null &&
    message.body.trim() !== "" &&
    !(message.kind === "SYSTEM" && message.call !== null);
  return (
    <article
      className={cn(
        "flex max-w-[70%] flex-col gap-2",
        mine ? "items-end self-end" : "items-start self-start",
      )}
    >
      <span className="sr-only">{srIntro}</span>
      {message.body === null ? (
        <ChatBubble side={message.side} className="italic opacity-80">
          Message en relecture par l&apos;association
        </ChatBubble>
      ) : hasText ? (
        <ChatBubble side={message.side}>{message.body}</ChatBubble>
      ) : null}
      {message.attachments.length > 0 ? (
        <div className={cn("flex flex-wrap gap-2", mine && "justify-end")}>
          {message.attachments.map((media) => (
            <AttachmentTile key={media.id} media={media} />
          ))}
        </div>
      ) : null}
      {message.masked ? (
        // Le motif n'est transmis qu'à l'auteur du message (l'API le retire pour les autres).
        <p className="m-0 text-12 text-muted">
          Un passage a été masqué par l&apos;association
          {message.moderationReason ? ` : ${message.moderationReason}` : ""}.
        </p>
      ) : null}
      {mine && status ? (
        <p
          className={cn(
            "m-0 inline-flex items-center gap-1 text-12 font-semibold",
            statusTone[status],
          )}
        >
          {status === "remis" || status === "lu" ? <CheckIcon size={14} /> : null}
          {statusLabel(status, recipient)}
          {status === "retenu" && message.moderationReason
            ? ` : ${message.moderationReason}`
            : null}
        </p>
      ) : null}
      {actions}
    </article>
  );
}
