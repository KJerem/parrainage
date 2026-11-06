import {
  canViewMedia,
  isChildMedia,
  type MediaActor,
  type MediaChildFacts,
  type MediaFacts,
} from "./can-view-media.js";

const claire: MediaActor = {
  userId: "u-claire",
  role: "parrain",
  parrainId: "p-claire",
  relaisId: null,
};
const paul: MediaActor = { userId: "u-paul", role: "parrain", parrainId: "p-paul", relaisId: null };
const marc: MediaActor = { userId: "u-marc", role: "parrain", parrainId: "p-marc", relaisId: null };
const koffi: MediaActor = {
  userId: "u-koffi",
  role: "relais",
  parrainId: null,
  relaisId: "r-lome",
};
const diallo: MediaActor = {
  userId: "u-diallo",
  role: "relais",
  parrainId: null,
  relaisId: "r-kara",
};
const bureau: MediaActor = { userId: "u-bureau", role: "bureau", parrainId: null, relaisId: null };
const orphanParrain: MediaActor = { ...claire, parrainId: null };

const aicha: MediaChildFacts = {
  relaisId: "r-lome",
  consentMedia: true,
  activeParrainIds: ["p-claire"],
};
const kofi: MediaChildFacts = {
  relaisId: "r-lome",
  consentMedia: true,
  activeParrainIds: ["p-claire", "p-paul"],
};
const withoutConsent: MediaChildFacts = { ...aicha, consentMedia: false };

const base: MediaFacts = {
  status: "READY",
  hasStorage: true,
  uploadedByUserId: null,
  message: null,
  newsPost: null,
  schoolResult: null,
  avatarOf: null,
};

/** Pièce jointe d'un message de l'enfant dans la conversation du binôme Claire ↔ Aïcha. */
const childMessage = (moderationStatus: NonNullable<MediaFacts["message"]>["moderationStatus"]) =>
  ({
    ...base,
    message: {
      moderationStatus,
      conversationKind: "SPONSORSHIP",
      activeSponsorParrainId: "p-claire",
      parrainId: "p-claire",
      relaisIds: ["r-lome"],
    },
  }) satisfies MediaFacts;

const news = (status: "DRAFT" | "SCHEDULED" | "PUBLISHED", children: MediaChildFacts[]) =>
  ({ ...base, newsPost: { status, relaisId: "r-lome", children } }) satisfies MediaFacts;

const bulletin = (status: "TO_ENTER" | "DRAFT" | "SENT", child: MediaChildFacts = aicha) =>
  ({ ...base, schoolResult: { status, child } }) satisfies MediaFacts;

const viewers = (media: MediaFacts) =>
  Object.entries({ claire, paul, marc, koffi, diallo, bureau })
    .filter(([, actor]) => canViewMedia(actor, media))
    .map(([name]) => name);

describe("canViewMedia : messages", () => {
  it("montre un message approuvé au parrain du binôme, au relais et au bureau", () => {
    expect(viewers(childMessage("APPROVED"))).toEqual(["claire", "koffi", "bureau"]);
  });

  it("montre aussi un message masqué en partie", () => {
    expect(viewers(childMessage("MASKED"))).toEqual(["claire", "koffi", "bureau"]);
  });

  it("ne traite pas NOT_REQUIRED comme transmis dans un binôme (relecture obligatoire)", () => {
    expect(viewers(childMessage("NOT_REQUIRED"))).toEqual(["bureau"]);
  });

  it.each(["PENDING", "HELD"] as const)(
    "cache un message %s au destinataire et au relais (le bureau modère)",
    (status) => {
      expect(viewers(childMessage(status))).toEqual(["bureau"]);
    },
  );

  it("ne montre pas la conversation d'un co-parrain", () => {
    const paulsConversation = {
      ...childMessage("APPROVED"),
      message: {
        ...childMessage("APPROVED").message,
        activeSponsorParrainId: "p-paul",
        parrainId: "p-paul",
      },
    };
    expect(canViewMedia(claire, paulsConversation)).toBe(false);
    expect(canViewMedia(paul, paulsConversation)).toBe(true);
  });

  it("ferme la conversation d'un binôme qui n'est plus actif", () => {
    const ended = {
      ...childMessage("APPROVED"),
      message: { ...childMessage("APPROVED").message, activeSponsorParrainId: null },
    };
    expect(canViewMedia(claire, ended)).toBe(false);
  });

  it("ouvre une conversation parrain ↔ relais à ses deux parties", () => {
    const media: MediaFacts = {
      ...base,
      message: {
        moderationStatus: "NOT_REQUIRED",
        conversationKind: "PARRAIN_RELAIS",
        activeSponsorParrainId: null,
        parrainId: "p-marc",
        relaisIds: ["r-lome"],
      },
    };
    expect(viewers(media)).toEqual(["marc", "koffi", "bureau"]);
  });

  it("réserve les échanges avec le bureau au relais ou au parrain concerné", () => {
    const adult = (conversationKind: "RELAIS_BUREAU" | "PARRAIN_BUREAU") =>
      ({
        ...base,
        uploadedByUserId: "u-bureau",
        message: {
          moderationStatus: "NOT_REQUIRED",
          conversationKind,
          activeSponsorParrainId: null,
          parrainId: conversationKind === "PARRAIN_BUREAU" ? "p-claire" : null,
          relaisIds: conversationKind === "RELAIS_BUREAU" ? ["r-lome"] : [],
        },
      }) satisfies MediaFacts;
    expect(viewers(adult("RELAIS_BUREAU"))).toEqual(["koffi", "bureau"]);
    expect(viewers(adult("PARRAIN_BUREAU"))).toEqual(["claire", "bureau"]);
    expect(isChildMedia(adult("PARRAIN_BUREAU"))).toBe(false);
  });

  it("ne montre une pièce jointe en cours d'envoi qu'à son auteur", () => {
    const uploading: MediaFacts = {
      ...base,
      status: "PENDING_UPLOAD",
      uploadedByUserId: "u-claire",
    };
    expect(viewers(uploading)).toEqual(["claire"]);
    expect(viewers({ ...uploading, status: "REJECTED" })).toEqual([]);
  });

  it("laisse toujours l'auteur voir sa pièce jointe, même en relecture", () => {
    const own = { ...childMessage("PENDING"), uploadedByUserId: "u-paul" };
    expect(canViewMedia(paul, own)).toBe(true);
    expect(canViewMedia(claire, own)).toBe(false);
  });
});

describe("canViewMedia : nouvelles", () => {
  it("montre une nouvelle publiée aux parrains actifs de l'enfant, co-parrains compris", () => {
    expect(viewers(news("PUBLISHED", [kofi]))).toEqual(["claire", "paul", "koffi", "bureau"]);
  });

  it("bloque les médias d'un enfant sans consentement pour son parrain", () => {
    expect(viewers(news("PUBLISHED", [withoutConsent]))).toEqual(["koffi", "bureau"]);
  });

  it("ne bloque, dans une nouvelle collective, que l'enfant sans consentement", () => {
    const yao: MediaChildFacts = {
      relaisId: "r-lome",
      consentMedia: false,
      activeParrainIds: ["p-marc"],
    };
    expect(viewers(news("PUBLISHED", [kofi, yao]))).toEqual(["claire", "paul", "koffi", "bureau"]);
  });

  it.each(["DRAFT", "SCHEDULED"] as const)(
    "réserve une nouvelle %s au relais et au bureau",
    (status) => {
      expect(viewers(news(status, [aicha]))).toEqual(["koffi", "bureau"]);
    },
  );

  it("ouvre une nouvelle d'un autre relais à ce relais s'il suit un des enfants", () => {
    const shared: MediaFacts = {
      ...base,
      newsPost: {
        status: "PUBLISHED",
        relaisId: "r-lome",
        children: [{ ...aicha, relaisId: "r-kara" }],
      },
    };
    expect(canViewMedia(diallo, shared)).toBe(true);
  });
});

describe("canViewMedia : bulletins et photos de profil", () => {
  it("montre un bulletin envoyé aux parrains actifs, même sans consentement médias", () => {
    expect(viewers(bulletin("SENT"))).toEqual(["claire", "koffi", "bureau"]);
    expect(viewers(bulletin("SENT", withoutConsent))).toEqual(["claire", "koffi", "bureau"]);
  });

  it.each(["TO_ENTER", "DRAFT"] as const)(
    "réserve un bulletin %s au relais et au bureau",
    (status) => {
      expect(viewers(bulletin(status))).toEqual(["koffi", "bureau"]);
    },
  );

  it("montre la photo de profil au parrain seulement avec le consentement médias", () => {
    expect(viewers({ ...base, avatarOf: aicha })).toEqual(["claire", "koffi", "bureau"]);
    expect(viewers({ ...base, avatarOf: withoutConsent })).toEqual(["koffi", "bureau"]);
  });
});

describe("canViewMedia : fichiers absents ou non prêts", () => {
  it("ne sert jamais un média PLACEHOLDER ou sans clé de stockage, même au bureau", () => {
    expect(viewers({ ...childMessage("APPROVED"), status: "PLACEHOLDER" })).toEqual([]);
    expect(viewers({ ...childMessage("APPROVED"), hasStorage: false })).toEqual([]);
    expect(
      canViewMedia(bureau, { ...base, status: "PLACEHOLDER", uploadedByUserId: "u-bureau" }),
    ).toBe(false);
  });

  it("réserve un média en cours d'envoi à son auteur", () => {
    const pending: MediaFacts = {
      ...childMessage("APPROVED"),
      status: "PENDING_UPLOAD",
      uploadedByUserId: "u-koffi",
    };
    expect(viewers(pending)).toEqual(["koffi"]);
  });

  it("ne sert à personne un média refusé", () => {
    const rejected: MediaFacts = {
      ...childMessage("APPROVED"),
      status: "REJECTED",
      uploadedByUserId: "u-koffi",
    };
    expect(viewers(rejected)).toEqual([]);
  });

  it("refuse un média orphelin à tous sauf au bureau et à l'auteur", () => {
    expect(viewers(base)).toEqual(["bureau"]);
    expect(canViewMedia(marc, { ...base, uploadedByUserId: "u-marc" })).toBe(true);
  });

  it("refuse un parrain sans profil ou un relais sans relais", () => {
    expect(canViewMedia(orphanParrain, childMessage("APPROVED"))).toBe(false);
    expect(canViewMedia({ ...koffi, relaisId: null }, childMessage("APPROVED"))).toBe(false);
  });
});

describe("isChildMedia", () => {
  it("repère les médias d'enfants (audit des consultations du bureau)", () => {
    expect(isChildMedia(childMessage("APPROVED"))).toBe(true);
    expect(isChildMedia(news("PUBLISHED", [aicha]))).toBe(true);
    expect(isChildMedia(bulletin("SENT"))).toBe(true);
    expect(isChildMedia({ ...base, avatarOf: aicha })).toBe(true);
    expect(isChildMedia(news("PUBLISHED", []))).toBe(false);
    expect(isChildMedia(base)).toBe(false);
  });
});
