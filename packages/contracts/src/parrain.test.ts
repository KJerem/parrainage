import { describe, expect, it } from "vitest";
import { mediaPath, type MediaRef } from "./media.js";
import {
  feedItemSchema,
  feedQuerySchema,
  filleulDashboardSchema,
  FEED_PAGE_DEFAULT_SIZE,
} from "./parrain.js";

const bulletin: MediaRef = {
  id: "m1",
  kind: "BULLETIN",
  status: "READY",
  label: "Bulletin T1 — 2026-27",
  durationSec: null,
  mimeType: "application/pdf",
};

describe("mediaPath", () => {
  it("donne le chemin de lecture d'un média prêt", () => {
    expect(mediaPath(bulletin)).toBe("/api/media/m1");
    expect(mediaPath(bulletin, { download: true })).toBe("/api/media/m1?download=1");
  });

  it("ne donne aucun chemin sans fichier à servir", () => {
    for (const status of ["PLACEHOLDER", "PENDING_UPLOAD", "REJECTED"] as const) {
      expect(mediaPath({ ...bulletin, status })).toBeNull();
    }
  });
});

describe("feedItemSchema", () => {
  it("distingue les messages et les nouvelles", () => {
    const message = feedItemSchema.parse({
      type: "message",
      id: "msg1",
      date: "2026-10-30T15:00:00.000Z",
      conversationId: "c1",
      sentFrom: "SCHOOL_SESSION",
      body: "Bonjour tata Claire !",
      masked: false,
      attachments: [bulletin],
    });
    expect(message.type).toBe("message");
    const news = feedItemSchema.parse({
      type: "news",
      id: "n1",
      date: "2026-10-12T09:00:00.000Z",
      title: "Nouvelle de rentrée",
      body: "Aïcha a fait sa rentrée en CM2.",
      author: { displayName: "M. Koffi", city: "Lomé" },
      media: [],
    });
    expect(news.type).toBe("news");
  });

  it("refuse un type inconnu ou une date sans fuseau", () => {
    expect(feedItemSchema.safeParse({ type: "call", id: "x" }).success).toBe(false);
    expect(
      feedItemSchema.safeParse({
        type: "news",
        id: "n1",
        date: "2026-10-12T09:00:00",
        title: "t",
        body: "b",
        author: { displayName: "M. Koffi", city: "Lomé" },
        media: [],
      }).success,
    ).toBe(false);
  });
});

describe("feedQuerySchema", () => {
  it("lit la taille de page depuis la chaîne de requête", () => {
    expect(feedQuerySchema.parse({})).toEqual({ limit: FEED_PAGE_DEFAULT_SIZE });
    expect(feedQuerySchema.parse({ limit: "5", cursor: "abc" })).toEqual({
      limit: 5,
      cursor: "abc",
    });
  });

  it("borne la taille de page", () => {
    expect(feedQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(feedQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(feedQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
  });
});

describe("filleulDashboardSchema", () => {
  it("accepte un écran sans résultat ni versement", () => {
    const dashboard = {
      now: "2026-10-31T10:00:00.000Z",
      conversationId: null,
      child: {
        id: "c1",
        firstName: "Aïcha",
        lastInitial: "S",
        gender: "F",
        avatarTone: "amber",
        age: 12,
        className: "CM2",
        schoolFullName: null,
        city: "Lomé",
        country: "Togo",
        relaisDisplayName: "M. Koffi",
        sponsoredSince: "2023-03-01",
        photo: null,
      },
      feed: [],
      results: { previous: null, current: null, appreciation: null },
      payments: { year: 2026, monthlyAmountCents: 2500, paidThisYearCents: 0, lastMonths: [] },
    };
    expect(filleulDashboardSchema.parse(dashboard)).toEqual(dashboard);
    expect(
      filleulDashboardSchema.safeParse({
        ...dashboard,
        child: { ...dashboard.child, sponsoredSince: "mars 2023" },
      }).success,
    ).toBe(false);
  });
});
