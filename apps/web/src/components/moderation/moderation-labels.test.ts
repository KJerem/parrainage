import type { ModerationDetail, ModerationSummary } from "@parrainage/contracts";
import { describe, expect, it } from "vitest";
import {
  decidedLabel,
  detailContextLabel,
  historyLabel,
  lastNewsLabel,
  partiesLabel,
  pendingMediaLabel,
  queueHeadline,
} from "./moderation-labels";

const now = "2026-10-31T10:00:00Z";

const summary = (overrides: Partial<ModerationSummary> = {}): ModerationSummary => ({
  pending: 12,
  withMedia: 3,
  oldestAt: "2026-10-30T22:00:00Z",
  now,
  ...overrides,
});

const detail = (overrides: Partial<ModerationDetail> = {}): ModerationDetail => ({
  id: "m1",
  moderationStatus: "PENDING",
  authorKind: "parrain",
  from: "Paul D.",
  to: "Kofi A.",
  body: "Bonjour",
  redactedBody: null,
  spans: [],
  alertTypes: [],
  manualFlags: [],
  attachments: [],
  moderationReason: null,
  reviewedAt: null,
  createdAt: "2026-10-31T05:00:00Z",
  context: { sponsorSince: "Parrain depuis 2024", relaisName: "M. Koffi" },
  history: {
    messageCount: 23,
    heldCount: 1,
    lastHeldAt: "2025-03-12T18:00:00Z",
    lastNewsAt: "2026-08-28T09:00:00Z",
  },
  now,
  ...overrides,
});

describe("libellés de la modération", () => {
  it("écrit les parties d'un message", () => {
    expect(partiesLabel({ from: "Paul D.", to: "Kofi A." })).toBe("Paul D. → Kofi A.");
  });

  it("résume la file, y compris vide", () => {
    expect(queueHeadline(summary())).toBe("12 en attente · plus ancien : 12 h");
    expect(queueHeadline(summary({ pending: 0, oldestAt: null }))).toBe("Aucun message en attente");
  });

  it("compte les messages avec média", () => {
    expect(pendingMediaLabel(summary())).toBe("dont 3 contenant des photos");
    expect(pendingMediaLabel(summary({ withMedia: 0 }))).toBe("aucun ne contient de photo");
  });

  it("reprend le sous-titre de la maquette", () => {
    expect(detailContextLabel(detail())).toBe(
      "Parrain depuis 2024 · relais M. Koffi · reçu il y a 5 h",
    );
  });

  it("omet ce qu'une conversation sans binôme n'a pas", () => {
    expect(detailContextLabel(detail({ context: { sponsorSince: null, relaisName: null } }))).toBe(
      "reçu il y a 5 h",
    );
  });

  it("résume l'historique du binôme", () => {
    expect(historyLabel(detail().history)).toBe("23 messages · 1 retenu (mars 2025)");
    expect(
      historyLabel({ messageCount: 1, heldCount: 0, lastHeldAt: null, lastNewsAt: null }),
    ).toBe("1 message · aucun retenu");
    expect(
      historyLabel({
        messageCount: 9,
        heldCount: 2,
        lastHeldAt: "2026-01-02T10:00:00Z",
        lastNewsAt: null,
      }),
    ).toBe("9 messages · 2 retenus (janvier 2026)");
  });

  it("date la dernière nouvelle du relais", () => {
    expect(lastNewsLabel(detail())).toBe("Dernière nouvelle du relais : il y a 64 jours");
    expect(
      lastNewsLabel(
        detail({
          history: { messageCount: 1, heldCount: 0, lastHeldAt: null, lastNewsAt: null },
        }),
      ),
    ).toBe("Aucune nouvelle du relais pour le moment");
  });

  it("explique l'issue d'un message déjà relu", () => {
    expect(decidedLabel("APPROVED")).toMatch(/approuvé/);
    expect(decidedLabel("MASKED")).toMatch(/masquée/);
    expect(decidedLabel("HELD")).toMatch(/retenu/);
    expect(decidedLabel("NOT_REQUIRED")).toMatch(/plus en attente/);
  });
});
