import { canChildViewMedia, type ChildMediaRow, type MediaChild } from "./child-media.js";

const at = new Date("2026-10-31T10:00:00Z");
const child: MediaChild = { childId: "c1", relaisId: "r1", consentMedia: true };

const media = (overrides: Partial<ChildMediaRow> = {}): ChildMediaRow => ({
  id: "m",
  status: "READY",
  storageKey: "uploads/m.jpg",
  mimeType: "image/jpeg",
  uploadedByChildId: null,
  message: null,
  newsPost: null,
  ...overrides,
});

const messageOf = (
  childId: string,
  moderationStatus: "PENDING" | "APPROVED" | "MASKED" | "HELD" | "NOT_REQUIRED",
): ChildMediaRow["message"] => ({ moderationStatus, conversation: { childId } });

const news = (overrides: Partial<NonNullable<ChildMediaRow["newsPost"]>> = {}) => ({
  status: "PUBLISHED" as const,
  type: "ONE_CHILD" as const,
  relaisId: "r1",
  visibleToChildren: true,
  publishedAt: new Date("2026-10-30T10:00:00Z"),
  children: [{ childId: "c1" }],
  ...overrides,
});

describe("canChildViewMedia", () => {
  it("laisse voir à l'enfant ce qu'il a envoyé, même en cours d'envoi", () => {
    expect(canChildViewMedia(child, media({ uploadedByChildId: "c1" }), at)).toBe(true);
    expect(
      canChildViewMedia(child, media({ uploadedByChildId: "c1", status: "PENDING_UPLOAD" }), at),
    ).toBe(true);
    expect(
      canChildViewMedia(child, media({ uploadedByChildId: "c1", status: "REJECTED" }), at),
    ).toBe(false);
  });

  it("ne montre rien sans fichier", () => {
    expect(canChildViewMedia(child, media({ uploadedByChildId: "c1", storageKey: null }), at)).toBe(
      false,
    );
  });

  it("ne montre pas l'envoi d'un autre enfant", () => {
    expect(canChildViewMedia(child, media({ uploadedByChildId: "c2" }), at)).toBe(false);
  });

  it.each([
    ["APPROVED", true],
    ["MASKED", true],
    ["PENDING", false],
    ["HELD", false],
    ["NOT_REQUIRED", false],
  ] as const)("fichier d'un message de sa conversation, %s : %s", (status, expected) => {
    expect(canChildViewMedia(child, media({ message: messageOf("c1", status) }), at)).toBe(
      expected,
    );
  });

  it("ne montre jamais un fichier de la conversation d'un autre enfant", () => {
    expect(canChildViewMedia(child, media({ message: messageOf("c2", "APPROVED") }), at)).toBe(
      false,
    );
  });

  it("montre les nouvelles qui le citent, marquées pour les enfants", () => {
    expect(canChildViewMedia(child, media({ newsPost: news() }), at)).toBe(true);
    expect(canChildViewMedia(child, media({ newsPost: news({ children: [] }) }), at)).toBe(false);
    expect(
      canChildViewMedia(
        child,
        media({ newsPost: news({ type: "RELAIS_LIFE", children: [] }) }),
        at,
      ),
    ).toBe(true);
  });

  it("refuse une nouvelle non publiée, à venir, réservée aux adultes ou d'un autre relais", () => {
    const refused = [
      news({ status: "DRAFT" }),
      news({ publishedAt: null }),
      news({ publishedAt: new Date("2026-11-02T10:00:00Z") }),
      news({ visibleToChildren: false }),
      news({ relaisId: "r2" }),
    ];
    for (const newsPost of refused) {
      expect(canChildViewMedia(child, media({ newsPost }), at)).toBe(false);
    }
  });

  it("ne montre aucune nouvelle en image sans consentement médias", () => {
    expect(
      canChildViewMedia({ ...child, consentMedia: false }, media({ newsPost: news() }), at),
    ).toBe(false);
  });

  it("refuse un média qui ne se rattache à rien", () => {
    expect(canChildViewMedia(child, media(), at)).toBe(false);
  });
});
