// Curseur opaque des messages plus anciens : date et identifiant du plus ancien message affiché
// (ordre total : date décroissante, puis identifiant décroissant).

export interface MessageCursor {
  createdAt: Date;
  id: string;
}

export function encodeMessageCursor(message: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify([message.createdAt.toISOString(), message.id])).toString(
    "base64url",
  );
}

/** Curseur lu, ou `null` s'il est illisible (réponse 400). */
export function decodeMessageCursor(cursor: string): MessageCursor | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 2) {
      return null;
    }
    const [date, id] = value as unknown[];
    if (typeof date !== "string" || typeof id !== "string" || id === "") {
      return null;
    }
    const createdAt = new Date(date);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
  } catch {
    return null;
  }
}
