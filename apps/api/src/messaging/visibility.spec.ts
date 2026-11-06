import type { Actor } from "../auth/actor.js";
import type { ConversationKind, ModerationStatus } from "../generated/prisma/enums.js";
import {
  canEncourage,
  canWrite,
  type ConversationAccessFacts,
  conversationAccess,
  deliveredStatuses,
  isMessageVisible,
  messageStatus,
  nextMessageAt,
  presentedBody,
  readUpTo,
  unreadWhere,
} from "./visibility.js";

const claire: Actor = {
  userId: "u-claire",
  role: "parrain",
  parrainId: "p-claire",
  relaisId: null,
};
const paul: Actor = { userId: "u-paul", role: "parrain", parrainId: "p-paul", relaisId: null };
const koffi: Actor = { userId: "u-koffi", role: "relais", parrainId: null, relaisId: "r-lome" };
const diallo: Actor = { userId: "u-diallo", role: "relais", parrainId: null, relaisId: "r-kara" };
const bureau: Actor = { userId: "u-bureau", role: "bureau", parrainId: null, relaisId: null };

/** Conversation du binôme Claire ↔ Aïcha (Lomé). */
const aichaClaire: ConversationAccessFacts = {
  kind: "SPONSORSHIP",
  parrainId: "p-claire",
  relaisId: "r-lome",
  participantUserIds: ["u-claire"],
  childRelaisId: "r-lome",
  sponsorshipActive: true,
};

/** Échange Claire ↔ M. Koffi. */
const claireKoffi: ConversationAccessFacts = {
  kind: "PARRAIN_RELAIS",
  parrainId: "p-claire",
  relaisId: "r-lome",
  participantUserIds: ["u-claire", "u-koffi"],
  childRelaisId: "r-lome",
  sponsorshipActive: false,
};

describe("conversationAccess", () => {
  it("ouvre la conversation du binôme au parrain participant, tant que le binôme est actif", () => {
    expect(conversationAccess(claire, aichaClaire)).toBe("participant");
    expect(conversationAccess(claire, { ...aichaClaire, sponsorshipActive: false })).toBeNull();
  });

  it("ne la montre jamais au co-parrain ni au bureau (hors modération)", () => {
    expect(conversationAccess(paul, aichaClaire)).toBeNull();
    expect(conversationAccess(paul, { ...aichaClaire, participantUserIds: ["u-paul"] })).toBeNull();
    expect(conversationAccess(bureau, aichaClaire)).toBeNull();
  });

  it("laisse le relais de l'enfant la suivre, sans y participer", () => {
    expect(conversationAccess(koffi, aichaClaire)).toBe("supervisor");
    expect(conversationAccess(diallo, aichaClaire)).toBeNull();
    expect(conversationAccess(koffi, { ...aichaClaire, sponsorshipActive: false })).toBeNull();
    expect(
      conversationAccess(koffi, {
        ...aichaClaire,
        kind: "CHILD_ASSOCIATION",
        parrainId: null,
        sponsorshipActive: false,
      }),
    ).toBe("supervisor");
  });

  it("réserve un échange entre adultes à ses participants", () => {
    expect(conversationAccess(claire, claireKoffi)).toBe("participant");
    expect(conversationAccess(koffi, claireKoffi)).toBe("participant");
    expect(conversationAccess(paul, claireKoffi)).toBeNull();
    expect(conversationAccess(diallo, claireKoffi)).toBeNull();
    // Participant inscrit à tort sur la conversation d'un autre parrain ou relais : refusé.
    expect(
      conversationAccess(paul, { ...claireKoffi, participantUserIds: ["u-paul", "u-koffi"] }),
    ).toBeNull();
    expect(
      conversationAccess(diallo, { ...claireKoffi, participantUserIds: ["u-diallo"] }),
    ).toBeNull();
  });
});

describe("canWrite et canEncourage", () => {
  it("le parrain écrit et encourage dans la conversation de son filleul", () => {
    expect(canWrite(claire, "participant", "SPONSORSHIP")).toBe(true);
    expect(canEncourage(claire, "participant", "SPONSORSHIP")).toBe(true);
  });

  it("le relais qui suit un enfant ne fait que lire", () => {
    expect(canWrite(koffi, "supervisor", "SPONSORSHIP")).toBe(false);
    expect(canEncourage(koffi, "supervisor", "SPONSORSHIP")).toBe(false);
  });

  it("pas d'encouragement entre adultes", () => {
    expect(canWrite(koffi, "participant", "PARRAIN_RELAIS")).toBe(true);
    expect(canEncourage(claire, "participant", "PARRAIN_RELAIS")).toBe(false);
    expect(canEncourage(claire, "participant", "PARRAIN_BUREAU")).toBe(false);
  });
});

describe("isMessageVisible", () => {
  const statuses: ModerationStatus[] = ["NOT_REQUIRED", "PENDING", "APPROVED", "HELD", "MASKED"];
  const visibleTo = (
    actorUserId: string,
    access: "participant" | "supervisor",
    kind: ConversationKind,
    authorUserId: string | null,
  ) =>
    statuses.filter((moderationStatus) =>
      isMessageVisible(access, actorUserId, kind, { authorUserId, moderationStatus }),
    );

  it("montre à l'auteur tous ses messages, quel que soit leur statut", () => {
    expect(visibleTo("u-claire", "participant", "SPONSORSHIP", "u-claire")).toEqual(statuses);
  });

  it("ne remet au parrain que les messages approuvés ou masqués de l'enfant", () => {
    expect(visibleTo("u-claire", "participant", "SPONSORSHIP", null)).toEqual([
      "APPROVED",
      "MASKED",
    ]);
  });

  it("remet aussitôt les messages entre adultes, jamais ceux retenus", () => {
    expect(visibleTo("u-koffi", "participant", "PARRAIN_RELAIS", "u-claire")).toEqual([
      "NOT_REQUIRED",
      "APPROVED",
      "MASKED",
    ]);
  });

  it("laisse le relais superviseur voir l'existence de chaque message", () => {
    expect(visibleTo("u-koffi", "supervisor", "SPONSORSHIP", "u-claire")).toEqual(statuses);
  });
});

describe("presentedBody", () => {
  const message = (moderationStatus: ModerationStatus, redactedBody: string | null = null) => ({
    moderationStatus,
    body: "Mon numéro : 06 39 98 12 34",
    redactedBody,
  });

  it("montre la version masquée à tous, auteur compris", () => {
    const masked = message("MASKED", "Mon numéro : [masqué par l'association]");
    expect(presentedBody("participant", true, masked)).toEqual({
      body: "Mon numéro : [masqué par l'association]",
      masked: true,
    });
    expect(presentedBody("supervisor", false, masked).masked).toBe(true);
    expect(presentedBody("participant", false, message("MASKED")).body).toBe(
      "[masqué par l'association]",
    );
  });

  it("cache au relais superviseur le texte d'un message en relecture ou retenu", () => {
    expect(presentedBody("supervisor", false, message("PENDING"))).toEqual({
      body: null,
      masked: false,
    });
    expect(presentedBody("supervisor", false, message("HELD")).body).toBeNull();
    expect(presentedBody("supervisor", false, message("APPROVED")).body).toContain("06 39");
    expect(presentedBody("participant", true, message("PENDING")).body).toContain("06 39");
  });
});

describe("messageStatus", () => {
  it.each([
    ["PENDING", "SENT", "en_relecture"],
    ["HELD", "SENT", "retenu"],
    ["APPROVED", "VERIFIED", "remis"],
    ["MASKED", "VERIFIED", "remis"],
    ["NOT_REQUIRED", "VERIFIED", "remis"],
    ["APPROVED", "RECEIVED", "lu"],
    ["NOT_REQUIRED", "RECEIVED", "lu"],
  ] as const)("%s / %s → %s", (moderationStatus, deliveryStatus, status) => {
    expect(messageStatus({ moderationStatus, deliveryStatus })).toBe(status);
  });
});

describe("deliveredStatuses et unreadWhere", () => {
  it("distingue les conversations relues de celles entre adultes", () => {
    expect(deliveredStatuses("SPONSORSHIP")).toEqual(["APPROVED", "MASKED"]);
    expect(deliveredStatuses("RELAIS_BUREAU")).toEqual(["NOT_REQUIRED", "APPROVED", "MASKED"]);
  });

  it("compte les messages des autres (enfant compris) arrivés après la dernière lecture", () => {
    const lastReadAt = new Date("2026-10-30T10:00:00Z");
    expect(unreadWhere("u-claire", "SPONSORSHIP", lastReadAt)).toEqual({
      AND: [
        { OR: [{ authorUserId: null }, { authorUserId: { not: "u-claire" } }] },
        { moderationStatus: { in: ["APPROVED", "MASKED"] } },
        // Écrit avant la dernière lecture mais approuvé après : non lu.
        { OR: [{ createdAt: { gt: lastReadAt } }, { reviewedAt: { gt: lastReadAt } }] },
      ],
    });
    expect(unreadWhere("u-claire", "PARRAIN_BUREAU", null).AND).toHaveLength(2);
  });
});

describe("readUpTo", () => {
  it("avance jusqu'à la dernière arrivée quand elle dépasse l'horloge (horloge figée)", () => {
    const at = new Date("2026-10-31T10:00:00Z");
    const later = new Date(at.getTime() + 2);
    expect(readUpTo(at, [null, new Date("2026-10-30T10:00:00Z")])).toEqual(at);
    expect(readUpTo(at, [later, null])).toEqual(later);
  });
});

describe("nextMessageAt", () => {
  it("garde l'heure courante, sauf si le dernier message est au même instant ou après", () => {
    const at = new Date("2026-10-31T10:00:00Z");
    expect(nextMessageAt(at, new Date("2026-10-30T10:00:00Z"))).toEqual(at);
    expect(nextMessageAt(at, null)).toEqual(at);
    expect(nextMessageAt(at, at).getTime()).toBe(at.getTime() + 1);
    expect(nextMessageAt(at, new Date(at.getTime() + 5)).getTime()).toBe(at.getTime() + 6);
  });
});
