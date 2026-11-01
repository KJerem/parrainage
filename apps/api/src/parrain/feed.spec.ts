import { feedPageSchema, type FeedMessageItem, type FeedNewsItem } from "@parrainage/contracts";
import {
  buildFeedPage,
  conditionsAfter,
  decodeFeedCursor,
  encodeFeedCursor,
  type FeedCursor,
  toMessageItem,
  toNewsItem,
} from "./feed.js";

const news = (id: string, date: string): FeedNewsItem => ({
  type: "news",
  id,
  date,
  title: "Nouvelle",
  body: "…",
  author: { displayName: "M. Koffi", city: "Lomé" },
  media: [],
});

const message = (id: string, date: string): FeedMessageItem => ({
  type: "message",
  id,
  date,
  conversationId: "c1",
  sentFrom: "SCHOOL_SESSION",
  body: "…",
  masked: false,
  attachments: [],
});

const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("curseur du fil", () => {
  it("se relit à l'identique", () => {
    const cursor = encodeFeedCursor(message("m1", "2026-10-30T15:00:00.000Z"));
    expect(decodeFeedCursor(cursor)).toEqual({
      date: new Date("2026-10-30T15:00:00.000Z"),
      type: "message",
      id: "m1",
    });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ["n'importe quoi", "pas du base64 !"],
    ["un objet", Buffer.from('{"a":1}').toString("base64url")],
    ["une date invalide", Buffer.from('["hier","news","n1"]').toString("base64url")],
    ["un type inconnu", Buffer.from('["2026-10-30T15:00:00Z","call","x"]').toString("base64url")],
    [
      "un identifiant vide",
      Buffer.from('["2026-10-30T15:00:00Z","news",""]').toString("base64url"),
    ],
  ])("refuse %s", (_label, cursor) => {
    expect(decodeFeedCursor(cursor)).toBeNull();
  });
});

describe("conditionsAfter", () => {
  const at = new Date("2026-10-12T09:00:00.000Z");
  const newsCursor: FeedCursor = { date: at, type: "news", id: "n5" };
  const messageCursor: FeedCursor = { date: at, type: "message", id: "m5" };

  it("ne filtre rien sans curseur", () => {
    expect(conditionsAfter(undefined, "news")).toEqual([]);
  });

  it("prend, dans la même source, la date antérieure ou la même date et un identifiant inférieur", () => {
    expect(conditionsAfter(newsCursor, "news")).toEqual([
      { dateBefore: at },
      { dateEquals: at, idBefore: "n5" },
    ]);
  });

  it("garde les messages de même date après une nouvelle (les nouvelles passent d'abord)", () => {
    expect(conditionsAfter(newsCursor, "message")).toEqual([
      { dateBefore: at },
      { dateEquals: at },
    ]);
    expect(conditionsAfter(messageCursor, "news")).toEqual([{ dateBefore: at }]);
  });
});

describe("buildFeedPage", () => {
  it("fusionne les deux sources du plus récent au plus ancien", () => {
    const page = buildFeedPage(
      [news("n1", "2026-10-12T09:00:00.000Z"), news("n2", "2026-08-28T10:00:00.000Z")],
      [message("m1", "2026-10-30T15:00:00.000Z"), message("m2", "2026-09-02T15:00:00.000Z")],
      5,
    );
    expect(ids(page.items)).toEqual(["m1", "n1", "m2", "n2"]);
    expect(page.nextCursor).toBeNull();
    expect(feedPageSchema.safeParse(page).success).toBe(true);
  });

  it("place une nouvelle avant un message de même date", () => {
    const date = "2026-10-12T09:00:00.000Z";
    expect(ids(buildFeedPage([news("n1", date)], [message("m1", date)], 5).items)).toEqual([
      "n1",
      "m1",
    ]);
  });

  it("donne un curseur quand il reste des éléments", () => {
    const page = buildFeedPage(
      [news("n1", "2026-10-12T09:00:00.000Z"), news("n2", "2026-08-28T10:00:00.000Z")],
      [message("m1", "2026-10-30T15:00:00.000Z")],
      2,
    );
    expect(ids(page.items)).toEqual(["m1", "n1"]);
    expect(decodeFeedCursor(page.nextCursor!)).toMatchObject({ type: "news", id: "n1" });
  });

  it("ne donne pas de curseur quand la page est pile pleine", () => {
    const page = buildFeedPage([news("n1", "2026-10-12T09:00:00.000Z")], [], 1);
    expect(page.nextCursor).toBeNull();
  });

  it("parcourt tout le fil page par page, sans doublon ni oubli", () => {
    // Simulation des deux requêtes (même ordre que la base) avec des dates en double.
    const allNews = ["n9", "n8", "n7", "n6"].map((id, i) =>
      news(id, `2026-10-${String(20 - i * 2).padStart(2, "0")}T09:00:00.000Z`),
    );
    const allMessages = ["m9", "m8", "m7"].map((id, i) =>
      message(id, `2026-10-${String(20 - i * 3).padStart(2, "0")}T09:00:00.000Z`),
    );
    const after = <T extends FeedNewsItem | FeedMessageItem>(
      items: T[],
      cursor: FeedCursor | undefined,
    ) =>
      items.filter((item) =>
        conditionsAfter(cursor, item.type).length === 0
          ? true
          : conditionsAfter(cursor, item.type).some((c) =>
              "dateBefore" in c
                ? Date.parse(item.date) < c.dateBefore.getTime()
                : Date.parse(item.date) === c.dateEquals.getTime() &&
                  (c.idBefore === undefined || item.id < c.idBefore),
            ),
      );
    const seen: string[] = [];
    let cursor: FeedCursor | undefined;
    for (let pages = 0; pages < 10; pages += 1) {
      const page = buildFeedPage(
        after(allNews, cursor).slice(0, 3),
        after(allMessages, cursor).slice(0, 3),
        2,
      );
      seen.push(...ids(page.items));
      if (!page.nextCursor) {
        break;
      }
      cursor = decodeFeedCursor(page.nextCursor)!;
    }
    expect(seen).toEqual(["n9", "m9", "n8", "m8", "n7", "n6", "m7"]);
  });
});

describe("projection des lignes", () => {
  const ref = {
    id: "media1",
    kind: "PHOTO" as const,
    status: "PLACEHOLDER" as const,
    label: "Photo de la classe",
    durationSec: null,
    mimeType: "image/jpeg",
  };

  it("transmet la version masquée d'un message", () => {
    const row = {
      id: "m1",
      createdAt: new Date("2026-10-30T15:00:00.000Z"),
      conversationId: "c1",
      sentFrom: "SCHOOL_SESSION" as const,
      body: "Mon numéro est le 90 00 00 00",
      redactedBody: "Mon numéro est le [masqué par l'association]",
      media: [ref],
    };
    expect(toMessageItem({ ...row, moderationStatus: "MASKED" })).toMatchObject({
      body: "Mon numéro est le [masqué par l'association]",
      masked: true,
      date: "2026-10-30T15:00:00.000Z",
      attachments: [ref],
    });
    expect(toMessageItem({ ...row, moderationStatus: "APPROVED" })).toMatchObject({
      body: "Mon numéro est le 90 00 00 00",
      masked: false,
    });
  });

  it("retire les médias d'une nouvelle sans consentement médias", () => {
    const row = {
      id: "n1",
      publishedAt: new Date("2026-10-12T09:00:00.000Z"),
      title: "Nouvelle de rentrée",
      body: "…",
      relais: { displayName: "M. Koffi", city: "Lomé" },
      media: [ref],
    };
    expect(toNewsItem(row, true).media).toEqual([ref]);
    expect(toNewsItem(row, false).media).toEqual([]);
    expect(toNewsItem(row, true).author).toEqual({ displayName: "M. Koffi", city: "Lomé" });
    expect(() => toNewsItem({ ...row, publishedAt: null }, true)).toThrow(/sans date/);
  });
});
