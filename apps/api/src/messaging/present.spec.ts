import type { Actor } from "../auth/actor.js";
import {
  authorOf,
  BUREAU_NAME,
  type ConversationRow,
  counterpartOf,
  joinNames,
  type MessageRow,
  ofName,
  sponsorTitle,
  toConversationMessage,
  toPreview,
} from "./present.js";

const claire: Actor = {
  userId: "u-claire",
  role: "parrain",
  parrainId: "p-claire",
  relaisId: null,
};
const koffi: Actor = { userId: "u-koffi", role: "relais", parrainId: null, relaisId: "r-lome" };

const child = {
  id: "c-aicha",
  firstName: "Aïcha",
  lastInitial: "S",
  avatarTone: "amber",
  relaisId: "r-lome",
  relais: { displayName: "M. Koffi" },
};
const relais = { id: "r-lome", displayName: "M. Koffi", city: "Lomé" };
const parrain = {
  id: "p-claire",
  displayName: "Claire M.",
  gender: "F" as const,
  avatarTone: "info-strong",
  sponsorships: [{ child: { firstName: "Aïcha" } }, { child: { firstName: "Kofi" } }],
};
const bureauParticipant = {
  userId: "u-bureau",
  lastReadAt: null,
  user: { name: "Bureau · trésorerie", role: "bureau" },
};

const conversation = (overrides: Partial<ConversationRow>): ConversationRow => ({
  id: "conv",
  kind: "SPONSORSHIP",
  subject: null,
  childId: child.id,
  parrainId: parrain.id,
  relaisId: relais.id,
  lastMessageAt: new Date("2026-10-30T15:00:00Z"),
  sponsorship: { status: "ACTIVE" },
  child,
  relais,
  parrain,
  participants: [],
  ...overrides,
});

const message = (overrides: Partial<MessageRow>): MessageRow => ({
  id: "m1",
  kind: "TEXT",
  body: "Bonjour M. Koffi, serait-il possible d'organiser un appel ?",
  redactedBody: null,
  moderationStatus: "NOT_REQUIRED",
  deliveryStatus: "VERIFIED",
  moderationReason: null,
  sentFrom: "WEB",
  createdAt: new Date("2026-10-28T19:00:00Z"),
  callRequest: null,
  authorUserId: "u-claire",
  authorChildId: null,
  authorUser: {
    name: "Claire M.",
    role: "parrain",
    parrainProfile: { displayName: "Claire M.", avatarTone: "info-strong" },
    relais: null,
  },
  authorChild: null,
  media: [],
  ...overrides,
});

describe("libellés", () => {
  it("élide et énumère à la française", () => {
    expect(ofName("Aïcha et Kofi")).toBe("d'Aïcha et Kofi");
    expect(ofName("Hélène")).toBe("d'Hélène");
    expect(ofName("Yao")).toBe("de Yao");
    expect(joinNames(["Aïcha", "Kofi", "Yao"])).toBe("Aïcha, Kofi et Yao");
    expect(sponsorTitle("F", ["Aïcha", "Kofi", "Kofi"])).toBe("Marraine d'Aïcha et Kofi");
    expect(sponsorTitle("M", ["Kofi"])).toBe("Parrain de Kofi");
    expect(sponsorTitle("M", [])).toBeNull();
  });
});

describe("counterpartOf", () => {
  it("présente l'enfant au parrain, avec son relais", () => {
    expect(counterpartOf(claire, conversation({}))).toEqual({
      kind: "child",
      id: "c-aicha",
      name: "Aïcha S.",
      shortName: "Aïcha",
      initials: "AS",
      avatarTone: "amber",
      subtitle: "Écrit depuis l'école, avec son relais M. Koffi",
    });
  });

  it("présente l'enfant et sa marraine au relais qui suit la conversation", () => {
    expect(counterpartOf(koffi, conversation({})).subtitle).toBe("Avec sa marraine Claire M.");
  });

  it("présente le parrain au relais (« Marraine d'Aïcha et Kofi »), et le relais au parrain", () => {
    const row = conversation({ kind: "PARRAIN_RELAIS" });
    expect(counterpartOf(koffi, row)).toMatchObject({
      kind: "parrain",
      id: "p-claire",
      name: "Claire M.",
      initials: "CM",
      avatarTone: "info-strong",
      subtitle: "Marraine d'Aïcha et Kofi",
    });
    expect(counterpartOf(claire, row)).toMatchObject({
      kind: "relais",
      id: "r-lome",
      name: "M. Koffi",
      initials: "MK",
      avatarTone: "neutral",
      subtitle: "Relais à Lomé",
    });
  });

  it("le bureau reste « l'association » pour le parrain, et garde son nom pour le relais", () => {
    expect(
      counterpartOf(
        claire,
        conversation({ kind: "PARRAIN_BUREAU", child: null, participants: [bureauParticipant] }),
      ),
    ).toMatchObject({ kind: "bureau", id: null, name: BUREAU_NAME, initials: "LRT" });
    expect(
      counterpartOf(
        koffi,
        conversation({ kind: "RELAIS_BUREAU", child: null, participants: [bureauParticipant] }),
      ).name,
    ).toBe("Bureau · trésorerie");
  });
});

describe("toConversationMessage", () => {
  it("donne à l'auteur le suivi de son message en relecture", () => {
    const own = toConversationMessage(
      claire,
      "participant",
      message({ moderationStatus: "PENDING", deliveryStatus: "SENT" }),
    );
    expect(own).toMatchObject({ side: "me", status: "en_relecture", masked: false });
    expect(own.author).toEqual({
      kind: "parrain",
      name: "Claire M.",
      initials: "CM",
      avatarTone: "info-strong",
    });
  });

  it("ne donne pas de suivi au destinataire, mais le motif d'une retenue à l'auteur", () => {
    const delivered = toConversationMessage(koffi, "participant", message({}));
    expect(delivered).toMatchObject({ side: "them", status: null, moderationReason: null });
    const held = toConversationMessage(
      claire,
      "participant",
      message({ moderationStatus: "HELD", moderationReason: "Contact direct hors plateforme" }),
    );
    expect(held).toMatchObject({
      status: "retenu",
      moderationReason: "Contact direct hors plateforme",
    });
  });

  it("cache au superviseur texte et pièces jointes d'un message en relecture", () => {
    const attachment = {
      id: "media-1",
      kind: "PHOTO" as const,
      status: "READY" as const,
      label: "Photo",
      durationSec: null,
      mimeType: "image/jpeg",
    };
    const pending = message({ moderationStatus: "PENDING", media: [attachment] });
    expect(toConversationMessage(koffi, "supervisor", pending)).toMatchObject({
      body: null,
      attachments: [],
      status: "en_relecture",
    });
    expect(toConversationMessage(claire, "participant", pending).attachments).toHaveLength(1);
  });

  it("nomme l'enfant auteur et le bureau selon le lecteur", () => {
    const fromChild = message({
      authorUserId: null,
      authorUser: null,
      authorChildId: "c-aicha",
      authorChild: { firstName: "Aïcha", lastInitial: "S", avatarTone: "amber" },
    });
    expect(authorOf(claire, fromChild)).toEqual({
      kind: "child",
      name: "Aïcha S.",
      initials: "AS",
      avatarTone: "amber",
    });
    const fromBureau = message({
      authorUserId: "u-bureau",
      authorUser: {
        name: "Bureau · trésorerie",
        role: "bureau",
        parrainProfile: null,
        relais: null,
      },
    });
    expect(authorOf(claire, fromBureau).name).toBe(BUREAU_NAME);
    expect(authorOf(koffi, fromBureau).name).toBe("Bureau · trésorerie");
  });
});

describe("toPreview", () => {
  it("abrège un long message sur une ligne", () => {
    const preview = toPreview(
      claire,
      "participant",
      message({ body: `${"Bonjour ".repeat(40)}\nfin` }),
    );
    expect(preview.body!.length).toBeLessThanOrEqual(140);
    expect(preview.body!.endsWith("…")).toBe(true);
    expect(preview.body).not.toContain("\n");
    expect(preview).toMatchObject({ mine: true, kind: "TEXT", attachmentCount: 0 });
  });
});
