import {
  initials,
  type FeedItem,
  type FeedMessageItem,
  type FeedNewsItem,
  type FilleulProfile,
} from "@parrainage/contracts";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { features } from "@/lib/features";
import { formatRelativeDay } from "@/lib/format";
import { sentFromLabels } from "@/lib/labels";
import { MediaGallery } from "./media";

/** L'enfant auteur des messages du fil. */
export type FeedChild = Pick<FilleulProfile, "firstName" | "lastInitial" | "avatarTone">;

type HeadingLevel = "h2" | "h3";

type CardProps = {
  /** Instant de référence de l'API (« Hier », « il y a 2 j »). */
  now: string;
  /** h3 sous « Dernières nouvelles », h2 sur la page « Tout le fil ». */
  headingLevel?: HeadingLevel;
  id?: string;
  tabIndex?: number;
};

/** Identifiant stable d'un élément du fil (messages et nouvelles ont chacun leurs id). */
export function feedItemKey(item: FeedItem): string {
  return `${item.type}-${item.id}`;
}

function FeedCardHeader({
  avatar,
  title,
  meta,
  badge,
  headingLevel: Heading = "h3",
}: {
  avatar: ReactNode;
  title: string;
  meta: ReactNode;
  badge?: ReactNode;
  headingLevel?: HeadingLevel;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {avatar}
      <div className="min-w-0 flex-[1_1_10rem]">
        <Heading className="m-0 text-15 font-bold">{title}</Heading>
        <p className="m-0 text-13 text-muted">{meta}</p>
      </div>
      {badge}
    </div>
  );
}

const bodyClass = "m-0 text-16 leading-[1.55] break-words whitespace-pre-line";

/** Message de l'enfant, approuvé (ou masqué en partie) par l'association. */
export function FeedMessageCard({
  item,
  child,
  now,
  headingLevel,
  ...props
}: CardProps & { item: FeedMessageItem; child: FeedChild }) {
  const sentFrom = sentFromLabels[item.sentFrom];
  const bulletin = item.attachments.some((media) => media.kind === "BULLETIN");
  const conversation = `/parrain/messages/${encodeURIComponent(item.conversationId)}`;
  return (
    <Card as="article" className="flex flex-col gap-3.5" {...props}>
      <FeedCardHeader
        headingLevel={headingLevel}
        avatar={
          <Avatar
            size={40}
            tone={child.avatarTone}
            initials={initials(`${child.firstName} ${child.lastInitial}`)}
          />
        }
        title={`${child.firstName} vous a écrit`}
        meta={
          <>
            <time dateTime={item.date}>{formatRelativeDay(item.date, now)}</time>
            {sentFrom ? ` · ${sentFrom}` : null}
          </>
        }
        badge={
          bulletin ? (
            <Chip variant="info" size="md" className="text-12">
              Bulletin joint
            </Chip>
          ) : null
        }
      />
      <p className={bodyClass}>{item.body}</p>
      {item.masked ? (
        <p className="m-0 text-13 text-muted">
          Un passage de ce message a été masqué par l&apos;association.
        </p>
      ) : null}
      <MediaGallery media={item.attachments} />
      {features.messaging ? (
        <div className="flex flex-wrap gap-2.5">
          <Button href={conversation} variant="secondary">
            Répondre
          </Button>
          <Button href={`${conversation}?encouragement=1`} variant="soft-accent">
            Envoyer un encouragement
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/** Nouvelle publiée par le relais. */
export function FeedNewsCard({
  item,
  now,
  headingLevel,
  ...props
}: CardProps & { item: FeedNewsItem }) {
  const { author } = item;
  return (
    <Card as="article" className="flex flex-col gap-3.5" {...props}>
      <FeedCardHeader
        headingLevel={headingLevel}
        avatar={<Avatar size={40} tone="brand" initials={initials(author.displayName)} />}
        title={`${author.displayName}, relais à ${author.city}`}
        meta={
          <>
            <time dateTime={item.date}>{formatRelativeDay(item.date, now)}</time> · {item.title}
          </>
        }
      />
      <p className={bodyClass}>{item.body}</p>
      <MediaGallery media={item.media} layout="feature" />
    </Card>
  );
}

export function FeedItemCard({
  item,
  child,
  ...props
}: CardProps & { item: FeedItem; child: FeedChild }) {
  return item.type === "message" ? (
    <FeedMessageCard item={item} child={child} {...props} />
  ) : (
    <FeedNewsCard item={item} {...props} />
  );
}
