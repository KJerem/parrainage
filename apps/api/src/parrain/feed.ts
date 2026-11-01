import type { FeedItem, FeedMessageItem, FeedNewsItem, FeedPage } from "@parrainage/contracts";
import type { ModerationStatus, SentFrom } from "../generated/prisma/enums.js";
import { type MediaRefRow, toMediaRef } from "../media/media-ref.js";

// Fil du parrain : messages de l'enfant et nouvelles du relais, du plus récent au plus ancien.
// Ordre total : date décroissante, puis les nouvelles avant les messages à date égale, puis
// l'identifiant décroissant (ordre de la base, pour que la pagination reste cohérente).

export type FeedType = FeedItem["type"];

const TYPE_RANK: Record<FeedType, number> = { news: 0, message: 1 };

export interface FeedCursor {
  date: Date;
  type: FeedType;
  id: string;
}

export function encodeFeedCursor(item: Pick<FeedItem, "date" | "type" | "id">): string {
  return Buffer.from(JSON.stringify([item.date, item.type, item.id])).toString("base64url");
}

/** Curseur lu, ou `null` s'il est illisible (réponse 400). */
export function decodeFeedCursor(cursor: string): FeedCursor | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 3) {
      return null;
    }
    const [date, type, id] = value as unknown[];
    if (typeof date !== "string" || typeof id !== "string" || id === "") {
      return null;
    }
    if (type !== "news" && type !== "message") {
      return null;
    }
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : { date: parsed, type, id };
  } catch {
    return null;
  }
}

/** Une condition « après le curseur » : date antérieure, ou même date (et identifiant inférieur). */
export type CursorCondition = { dateBefore: Date } | { dateEquals: Date; idBefore?: string };

/**
 * Conditions (à combiner en OU) qui sélectionnent, dans une source, les éléments situés après
 * le curseur dans l'ordre du fil. Sans curseur : aucune condition.
 */
export function conditionsAfter(cursor: FeedCursor | undefined, type: FeedType): CursorCondition[] {
  if (!cursor) {
    return [];
  }
  const conditions: CursorCondition[] = [{ dateBefore: cursor.date }];
  const rank = TYPE_RANK[type];
  const cursorRank = TYPE_RANK[cursor.type];
  if (rank > cursorRank) {
    conditions.push({ dateEquals: cursor.date });
  } else if (rank === cursorRank) {
    conditions.push({ dateEquals: cursor.date, idBefore: cursor.id });
  }
  return conditions;
}

const comesFirst = (a: FeedItem, b: FeedItem): boolean => {
  const diff = Date.parse(a.date) - Date.parse(b.date);
  return diff !== 0 ? diff > 0 : TYPE_RANK[a.type] <= TYPE_RANK[b.type];
};

/**
 * Fusionne deux sources déjà triées par la base (date décroissante, identifiant décroissant),
 * chacune lue avec `limit + 1` éléments après le même curseur, en une page du fil.
 */
export function buildFeedPage(
  news: readonly FeedNewsItem[],
  messages: readonly FeedMessageItem[],
  limit: number,
): FeedPage {
  const merged: FeedItem[] = [];
  let i = 0;
  let j = 0;
  while (merged.length <= limit && (i < news.length || j < messages.length)) {
    const a = news[i];
    const b = messages[j];
    if (a && (!b || comesFirst(a, b))) {
      merged.push(a);
      i += 1;
    } else if (b) {
      merged.push(b);
      j += 1;
    }
  }
  const items = merged.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: merged.length > limit && last ? encodeFeedCursor(last) : null,
  };
}

// ─── Projection des lignes de la base ─────────────────────────────────────────

export interface MessageRow {
  id: string;
  createdAt: Date;
  conversationId: string;
  sentFrom: SentFrom;
  body: string;
  redactedBody: string | null;
  moderationStatus: ModerationStatus;
  media: MediaRefRow[];
}

/** Message de l'enfant : la version masquée remplace le texte d'origine quand il y en a une. */
export function toMessageItem(row: MessageRow): FeedMessageItem {
  const masked = row.moderationStatus === "MASKED";
  return {
    type: "message",
    id: row.id,
    date: row.createdAt.toISOString(),
    conversationId: row.conversationId,
    sentFrom: row.sentFrom,
    body: masked ? (row.redactedBody ?? "") : row.body,
    masked,
    attachments: row.media.map(toMediaRef),
  };
}

export interface NewsRow {
  id: string;
  publishedAt: Date | null;
  title: string;
  body: string;
  relais: { displayName: string; city: string };
  media: MediaRefRow[];
}

/** Nouvelle du relais ; ses médias ne sont transmis qu'avec le consentement médias de l'enfant. */
export function toNewsItem(row: NewsRow, consentMedia: boolean): FeedNewsItem {
  if (!row.publishedAt) {
    throw new Error(`Nouvelle ${row.id} publiée sans date de publication`);
  }
  return {
    type: "news",
    id: row.id,
    date: row.publishedAt.toISOString(),
    title: row.title,
    body: row.body,
    author: { displayName: row.relais.displayName, city: row.relais.city },
    media: consentMedia ? row.media.map(toMediaRef) : [],
  };
}
