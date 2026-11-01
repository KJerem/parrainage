import { downloadName, type MediaFactsRow, toMediaFacts } from "./media-facts.js";

const child = (consentMedia: boolean, parrainIds: string[]) => ({
  relaisId: "r-lome",
  consentMedia,
  sponsorships: parrainIds.map((parrainId) => ({ parrainId })),
});

const base: MediaFactsRow = {
  id: "m1",
  kind: "BULLETIN",
  status: "READY",
  storageKey: "seed/bulletins/a.pdf",
  mimeType: "application/pdf",
  label: "Bulletin T1 — 2026-27",
  uploadedByUserId: "u-koffi",
  message: null,
  newsPost: null,
  schoolResult: null,
  avatarOf: null,
};

describe("toMediaFacts", () => {
  it("ne retient le parrain d'une conversation de binôme que si le binôme est actif", () => {
    const row = (status: "ACTIVE" | "ENDED"): MediaFactsRow => ({
      ...base,
      message: {
        moderationStatus: "APPROVED",
        conversation: {
          kind: "SPONSORSHIP",
          parrainId: "p-claire",
          relaisId: null,
          sponsorship: { parrainId: "p-claire", status },
          child: { relaisId: "r-lome" },
        },
      },
    });
    expect(toMediaFacts(row("ACTIVE")).message).toEqual({
      moderationStatus: "APPROVED",
      conversationKind: "SPONSORSHIP",
      activeSponsorParrainId: "p-claire",
      parrainId: "p-claire",
      relaisIds: ["r-lome"],
    });
    expect(toMediaFacts(row("ENDED")).message?.activeSponsorParrainId).toBeNull();
  });

  it("résume les enfants d'une nouvelle, d'un bulletin et d'une photo de profil", () => {
    const facts = toMediaFacts({
      ...base,
      newsPost: {
        status: "PUBLISHED",
        relaisId: "r-lome",
        children: [{ child: child(false, ["p-marc"]) }],
      },
      schoolResult: { status: "SENT", child: child(true, ["p-claire"]) },
      avatarOf: child(true, ["p-claire", "p-paul"]),
    });
    expect(facts.newsPost?.children).toEqual([
      { relaisId: "r-lome", consentMedia: false, activeParrainIds: ["p-marc"] },
    ]);
    expect(facts.schoolResult?.child.activeParrainIds).toEqual(["p-claire"]);
    expect(facts.avatarOf?.activeParrainIds).toEqual(["p-claire", "p-paul"]);
    expect(facts.hasStorage).toBe(true);
  });

  it("signale l'absence de fichier", () => {
    expect(toMediaFacts({ ...base, storageKey: null }).hasStorage).toBe(false);
    expect(toMediaFacts({ ...base, storageKey: "" }).hasStorage).toBe(false);
  });
});

describe("downloadName", () => {
  it("part de la légende et du type du média", () => {
    expect(downloadName(base)).toBe("Bulletin T1 — 2026-27.pdf");
    expect(downloadName({ ...base, label: "a/b:c", mimeType: "image/jpeg" })).toBe("a-b-c.jpg");
    expect(downloadName({ ...base, label: null, mimeType: "application/x-inconnu" })).toBe(
      "document",
    );
  });
});
