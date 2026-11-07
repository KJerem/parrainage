import { buildSeedContent, photoOf } from "./content.js";
import { buildSeedData } from "./data.js";
import { addDays, day, startOfDayUtc } from "./dates.js";

const today = day("2026-10-31");
const data = buildSeedData(today);
const content = buildSeedContent(today, data);
const DAY_MS = 24 * 3600 * 1000;
const childId = (slug: string) => `seed-child-${slug}`;
/** Jours civils entre la date et le jour du seed. */
const daysBefore = (date: Date) => (today.getTime() - startOfDayUtc(date).getTime()) / DAY_MS;

describe("contenus du seed", () => {
  it("est reproductible et n'emploie que des identifiants uniques préfixés « seed- »", () => {
    expect(buildSeedContent(today, data)).toEqual(content);
    const ids = [
      ...content.periods,
      ...content.results,
      ...content.news,
      ...content.conversations,
      ...content.conversations.flatMap((c) => c.participants),
      ...content.messages,
      ...content.media,
      ...content.payments,
    ].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("seed-"))).toBe(true);
    const references = content.payments.map((p) => p.reference);
    expect(new Set(references).size).toBe(references.length);
  });

  it("crée l'année 2025-26 (bilan annuel) et les trois trimestres de 2026-27", () => {
    expect(content.periods.map((p) => [p.schoolYear, p.kind, p.label])).toEqual([
      ["2025-2026", "ANNUAL", "moyenne annuelle"],
      ["2026-2027", "T1", "1er trimestre"],
      ["2026-2027", "T2", "2e trimestre"],
      ["2026-2027", "T3", "3e trimestre"],
    ]);
    expect(content.periods[1]!.dueDate).toEqual(day("2026-11-15"));
  });

  it("reprend les résultats du design : Aïcha 11,8 puis 13,4 (5/48), Kofi en brouillon", () => {
    const of = (slug: string) => content.results.filter((r) => r.childId === childId(slug));
    expect(of("aicha").map((r) => [r.className, r.averageX100, r.status])).toEqual([
      ["CM1", 1180, "SENT"],
      ["CM2", 1340, "SENT"],
    ]);
    expect(of("aicha")[1]).toMatchObject({
      rank: 5,
      classSize: 48,
      appreciation: "Élève sérieuse, en net progrès en mathématiques.",
      sentAt: new Date("2026-10-29T14:30:00Z"),
    });
    expect(of("kofi")).toEqual([
      expect.objectContaining({ averageX100: 1090, rank: 21, classSize: 52, status: "DRAFT" }),
    ]);
    const others = content.results.filter(
      (r) => r.childId !== childId("aicha") && r.childId !== childId("kofi"),
    );
    expect(others).toHaveLength(data.children.length - 2);
    const toEnter = others.filter((r) => r.status === "TO_ENTER");
    expect(toEnter.every((r) => r.averageX100 === null && r.sentAt === null)).toBe(true);
    // « Saisir 7 bulletins du T1 » chez M. Koffi, dont Esther, Yao et Mariam.
    const koffiChildren = new Set(
      data.children.filter((c) => c.relaisId === "seed-relais-koffi").map((c) => c.id),
    );
    const koffiToEnter = toEnter.filter((r) => koffiChildren.has(r.childId));
    expect(koffiToEnter).toHaveLength(7);
    expect(koffiToEnter.map((r) => r.childId)).toEqual(
      expect.arrayContaining([childId("esther"), childId("yao"), childId("mariam")]),
    );
    const sent = others.filter((r) => r.status === "SENT");
    expect(sent).toHaveLength(9);
    expect(sent.every((r) => r.averageX100 !== null && r.sentAt !== null)).toBe(true);
  });

  it("ouvre une conversation par binôme actif, avec le parrain et l'enfant", () => {
    const sponsorship = content.conversations.filter((c) => c.kind === "SPONSORSHIP");
    expect(sponsorship).toHaveLength(data.sponsorships.length);
    for (const conversation of sponsorship) {
      expect(conversation.participants).toHaveLength(2);
      expect(conversation.participants.filter((p) => p.userId !== null)).toHaveLength(1);
      expect(
        conversation.participants.filter((p) => p.childId === conversation.childId),
      ).toHaveLength(1);
    }
  });

  it("ouvre les conversations entre adultes de RW-Messages et P-Messages", () => {
    const adults = content.conversations.filter((c) => c.kind !== "SPONSORSHIP");
    expect(adults.map((c) => [c.id, c.kind])).toEqual([
      ["seed-conversation-claire-koffi", "PARRAIN_RELAIS"],
      ["seed-conversation-paul-koffi", "PARRAIN_RELAIS"],
      ["seed-conversation-helene-koffi", "PARRAIN_RELAIS"],
      ["seed-conversation-koffi-bureau", "RELAIS_BUREAU"],
      ["seed-conversation-claire-bureau", "PARRAIN_BUREAU"],
    ]);
    for (const conversation of adults) {
      expect(conversation.participants).toHaveLength(2);
      expect(conversation.participants.every((p) => p.userId !== null && p.childId === null)).toBe(
        true,
      );
      const own = content.messages.filter((m) => m.conversationId === conversation.id);
      expect(own.length).toBeGreaterThan(0);
      expect(own.every((m) => m.moderationStatus === "NOT_REQUIRED")).toBe(true);
      expect(conversation.lastMessageAt).toEqual(own.at(-1)!.createdAt);
    }
    const bodies = content.messages.map((m) => m.body);
    expect(bodies).toContain("Des nouvelles de Kofi ?");
    expect(bodies).toContain("Merci pour la vidéo !");
    expect(bodies.some((b) => b.startsWith("Reçus d'octobre"))).toBe(true);
    expect(content.messages.find((m) => m.kind === "NEWSLETTER")?.body).toMatch(
      /^Lettre d'information d'octobre/,
    );
  });

  it("laisse 2 messages non lus à Claire et 1 à M. Koffi", () => {
    const unreadFor = (userId: string) =>
      content.conversations.flatMap((c) => {
        const me = c.participants.find((p) => p.userId === userId);
        if (!me) {
          return [];
        }
        return content.messages
          .filter(
            (m) =>
              m.conversationId === c.id &&
              m.authorUserId !== userId &&
              // Un message en file de modération n'est pas encore remis.
              m.moderationStatus !== "PENDING" &&
              (!me.lastReadAt || m.createdAt > me.lastReadAt),
          )
          .map((m) => m.id);
      });
    const claire = data.parrains.find((p) => p.email === "claire.m@exemple.fr")!.id;
    expect(unreadFor(claire).sort()).toEqual([
      "seed-message-aicha-to-claire",
      "seed-message-koffi-to-claire",
    ]);
    expect(unreadFor(data.relais[0]!.id)).toEqual(["seed-message-claire-to-koffi"]);
  });

  describe("file de modération", () => {
    const pending = content.messages.filter((m) => m.moderationStatus === "PENDING");
    const pendingBy = (slug: string) =>
      content.messages.find((m) => m.id === `seed-message-attente-${slug}`)!;
    const mediaOf = (messageId: string) => content.media.filter((m) => m.messageId === messageId);

    it("contient 12 messages, dont 3 avec un média", () => {
      expect(pending).toHaveLength(12);
      const withMedia = pending.filter((m) => mediaOf(m.id).length > 0);
      expect(withMedia.map((m) => m.id).sort()).toEqual([
        "seed-message-attente-aicha",
        "seed-message-attente-mariam",
        "seed-message-attente-relais-4",
      ]);
      expect(pending.every((m) => m.reviewedAt === null && m.deliveryStatus === "SENT")).toBe(true);
    });

    it("n'a de coordonnées que dans le message de Paul, au bon endroit", () => {
      const paul = pendingBy("paul");
      expect(paul.alertTypes).toEqual(["PHONE", "SOCIAL"]);
      expect(paul.autoAlerts.map((span) => paul.body.slice(span.start, span.end))).toEqual([
        "WhatsApp",
        "06 39 98 12 34",
      ]);
      expect(pending.filter((m) => m.alertTypes.length > 0).map((m) => m.id)).toEqual([paul.id]);
    });

    it("reprend les exemples du design : Aïcha, Mariam et Yao", () => {
      expect(mediaOf(pendingBy("aicha").id).map((m) => [m.kind, m.label])).toEqual([
        ["BULLETIN", "Bulletin T1 : page 2"],
      ]);
      expect(pendingBy("mariam")).toMatchObject({
        body: "",
        manualFlags: ["OTHER_CHILD_FACE"],
        authorChildId: childId("mariam"),
      });
      expect(mediaOf(pendingBy("mariam").id)[0]).toMatchObject({ kind: "VIDEO", durationSec: 35 });
      expect(mediaOf(pendingBy("yao").id)).toEqual([]);
    });

    it("ne fait pas remonter une conversation pour le message en attente d'un enfant", () => {
      const thread = content.conversations.find((c) => c.id === "seed-conversation-aicha-claire")!;
      expect(thread.lastMessageAt).toEqual(new Date("2026-10-30T15:00:00Z"));
    });

    it("reconstitue l'historique de Paul et Kofi : 23 messages, 1 retenu en mars 2025", () => {
      const own = content.messages.filter(
        (m) => m.conversationId === "seed-conversation-kofi-paul",
      );
      expect(own).toHaveLength(23);
      const held = own.filter((m) => m.moderationStatus === "HELD");
      expect(held).toHaveLength(1);
      expect(held[0]!.createdAt.toISOString().slice(0, 7)).toBe("2025-03");
      expect(held[0]!.moderationReason).toBe("Contact direct hors plateforme");
      const paulThread = content.conversations.find((c) => c.id === "seed-conversation-kofi-paul")!;
      const lastApproved = own
        .filter((m) => m.moderationStatus === "APPROVED")
        .map((m) => m.createdAt)
        .sort((a, b) => a.getTime() - b.getTime())
        .at(-1)!;
      // Paul a tout lu : pas de non-lu laissé par l'historique.
      expect(paulThread.participants[0]!.lastReadAt!.getTime()).toBeGreaterThan(
        lastApproved.getTime(),
      );
    });
  });

  it("reprend les échanges du design, dans les conversations de Claire", () => {
    const byId = new Map(content.messages.map((m) => [m.id, m]));
    expect(byId.get("seed-message-claire-to-aicha")).toMatchObject({
      conversationId: "seed-conversation-aicha-claire",
      createdAt: new Date("2026-10-14T17:30:00Z"),
      moderationStatus: "APPROVED",
      deliveryStatus: "RECEIVED",
    });
    expect(byId.get("seed-message-aicha-to-claire")).toMatchObject({
      authorChildId: childId("aicha"),
      sentFrom: "SCHOOL_SESSION",
      createdAt: new Date("2026-10-30T15:00:00Z"),
    });
    expect(byId.get("seed-message-kofi-to-claire")).toMatchObject({
      conversationId: "seed-conversation-kofi-claire",
      body: "Merci pour le ballon !",
      createdAt: new Date("2026-09-02T15:00:00Z"),
      deliveryStatus: "RECEIVED",
    });
    // Lu au plus tard à la dernière lecture de Claire.
    const kofiThread = content.conversations.find((c) => c.id === "seed-conversation-kofi-claire");
    const claireRead = kofiThread?.participants.find((p) => p.userId !== null)?.lastReadAt;
    expect(byId.get("seed-message-kofi-to-claire")!.readAt).toEqual(claireRead);
    const attachments = content.media.filter((m) => m.messageId === "seed-message-aicha-to-claire");
    expect(attachments.map((m) => [m.kind, m.status, m.label])).toEqual([
      ["PHOTO", "PLACEHOLDER", "Photo de la classe"],
      ["BULLETIN", "READY", "Bulletin T1 — 2026-27"],
    ]);
    // Le bulletin du message est aussi celui du résultat envoyé.
    expect(attachments[1]!.schoolResultId).toBe("seed-result-aicha-2026-2027-t1");
  });

  it("dépose un vrai PDF pour le bulletin, de la taille enregistrée", () => {
    expect(content.uploads).toHaveLength(1);
    const [upload] = content.uploads;
    expect(upload!.body.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    const bulletin = content.media.find((m) => m.id === upload!.mediaId)!;
    expect(bulletin).toMatchObject({
      storageKey: "seed/bulletins/aicha-2026-2027-t1.pdf",
      sizeBytes: upload!.body.length,
    });
  });

  it("publie la nouvelle de rentrée d'Aïcha et les dernières nouvelles de Kofi, Yao et Mariam", () => {
    const rentree = content.news.find((n) => n.id === "seed-news-aicha-rentree")!;
    expect(rentree).toMatchObject({
      title: "Nouvelle de rentrée",
      publishedAt: new Date("2026-10-12T09:00:00Z"),
      authorUserId: "seed-user-koffi",
      childIds: [childId("aicha")],
    });
    expect(content.media.find((m) => m.newsPostId === rentree.id)).toMatchObject({
      kind: "VIDEO",
      status: "PLACEHOLDER",
      durationSec: 42,
      label: "Vidéo · 0:42",
    });
    const lastNews = (slug: string) =>
      Math.min(
        ...content.news
          .filter((n) => n.childIds.includes(childId(slug)))
          .map((n) => daysBefore(n.publishedAt)),
      );
    expect([lastNews("kofi"), lastNews("yao"), lastNews("mariam")]).toEqual([64, 35, 6]);
  });

  it("compte 11 nouvelles de M. Koffi ce mois-ci et 5 enfants sans nouvelle depuis 60 jours", () => {
    const thisMonth = content.news.filter(
      (n) => n.relaisId === "seed-relais-koffi" && n.publishedAt.getUTCMonth() === 9,
    );
    expect(thisMonth).toHaveLength(11);
    const sponsored = new Set(data.sponsorships.map((s) => s.childId));
    const stale = [...sponsored].filter((id) => {
      const dates = content.news.filter((n) => n.childIds.includes(id)).map((n) => n.publishedAt);
      return dates.length === 0 || Math.min(...dates.map(daysBefore)) >= 60;
    });
    expect(stale).toHaveLength(5);
    expect(stale).toContain(childId("kofi"));
  });

  it("publie une nouvelle avec photo pour un enfant sans consentement médias", () => {
    const withoutConsent = data.children.filter(
      (c) => !c.consentMedia && c.id !== childId("esther"),
    );
    expect(withoutConsent.length).toBeGreaterThan(0);
    const komla = content.news.find((n) => n.childIds.includes(childId("koffi-2")))!;
    expect(withoutConsent.map((c) => c.id)).toContain(childId("koffi-2"));
    expect(content.media.some((m) => m.newsPostId === komla.id)).toBe(true);
  });

  it("trace les accords recueillis pour chaque enfant", () => {
    const of = (slug: string) =>
      content.consents.filter((c) => c.childId === childId(slug)).map((c) => c.type);
    expect(of("aicha")).toEqual(["SPONSORSHIP", "MEDIA"]);
    expect(of("koffi-2")).toEqual(["SPONSORSHIP"]);
    expect(content.consents.every((c) => c.textVersion === "2026-10")).toBe(true);
    const ids = content.consents.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("seed-"))).toBe(true);
  });

  it("donne à chaque enfant une photo de profil réservée", () => {
    expect(content.childPhotos).toHaveLength(data.children.length);
    expect(content.media.find((m) => m.id === "seed-media-photo-aicha")).toMatchObject({
      kind: "AVATAR",
      status: "PLACEHOLDER",
      label: "Photo d'Aïcha",
    });
  });

  it("ne date aucun contenu après le jour du seed", () => {
    const dates = [
      ...content.news.map((n) => n.publishedAt),
      ...content.messages.filter((m) => m.moderationStatus !== "PENDING").map((m) => m.createdAt),
      ...content.results.flatMap((r) => (r.sentAt ? [r.sentAt] : [])),
    ];
    expect(dates.every((d) => d.getTime() < today.getTime())).toBe(true);
    // Sauf la file de modération, du matin même (« il y a 2 h »), jamais après 10 h.
    const queue = content.messages.filter((m) => m.moderationStatus === "PENDING");
    expect(queue.every((m) => m.createdAt.getTime() <= today.getTime() + 10 * 3600 * 1000)).toBe(
      true,
    );
  });
});

describe("versements du seed", () => {
  const ofSponsorship = (id: string) => content.payments.filter((p) => p.sponsorshipId === id);

  it("prélève chaque binôme actif le 5, de son début (ou janvier 2024) au mois en cours", () => {
    const aicha = ofSponsorship("seed-sponsorship-aicha-claire").filter(
      (p) => p.kind === "MONTHLY",
    );
    expect(aicha[0]!.periodKey).toBe("2024-01");
    expect(aicha.at(-1)!.periodKey).toBe("2026-10");
    expect(aicha).toHaveLength(34);
    expect(aicha.every((p) => p.dueDate.getUTCDate() === 5 && p.method === "SEPA_DEBIT")).toBe(
      true,
    );
    const paul = ofSponsorship("seed-sponsorship-kofi-paul");
    expect(paul[0]!.periodKey).toBe("2024-02");
    for (const s of data.sponsorships) {
      const own = ofSponsorship(s.id).filter((p) => p.kind === "MONTHLY");
      expect(own.length).toBeGreaterThan(0);
      expect(own.every((p) => p.dueDate.getTime() >= s.startDate.getTime())).toBe(true);
    }
  });

  it("verse à Claire 290 € en 2026 pour Aïcha : 10 mensualités et un don de rentrée", () => {
    const paid = content.payments.filter(
      (p) =>
        p.childId === childId("aicha") &&
        p.status === "RECEIVED" &&
        p.paidAt!.getUTCFullYear() === 2026,
    );
    expect(paid.reduce((sum, p) => sum + p.amountCents, 0)).toBe(29000);
    expect(content.payments.find((p) => p.kind === "ONE_OFF")).toMatchObject({
      amountCents: 4000,
      label: "Don ponctuel · rentrée",
      dueDate: day("2026-09-15"),
      periodKey: null,
    });
  });

  it("met en retard les mensualités de septembre et d'octobre de l'homonyme", () => {
    const late = content.payments.filter((p) => p.status === "LATE");
    expect(late.map((p) => [p.sponsorshipId, p.periodKey])).toEqual([
      ["seed-sponsorship-ibrahim-sophie2", "2026-09"],
      ["seed-sponsorship-ibrahim-sophie2", "2026-10"],
    ]);
  });

  it("programme la mensualité du mois quand le prélèvement est encore à venir", () => {
    const early = buildSeedContent(day("2026-11-02"), buildSeedData(day("2026-11-02")));
    const november = early.payments.filter((p) => p.periodKey === "2026-11");
    expect(november.length).toBe(data.sponsorships.length);
    expect(november.every((p) => p.status === "SCHEDULED" && p.paidAt === null)).toBe(true);
    expect(addDays(day("2026-11-02"), 3)).toEqual(november[0]!.dueDate);
  });
});

describe("photoOf", () => {
  it("élide devant une voyelle", () => {
    expect(photoOf("Aïcha")).toBe("Photo d'Aïcha");
    expect(photoOf("Elom")).toBe("Photo d'Elom");
    expect(photoOf("Kofi")).toBe("Photo de Kofi");
    expect(photoOf("Yao")).toBe("Photo de Yao");
  });
});
