import type { INestApplication } from "@nestjs/common";
import {
  conversationListSchema,
  detectAlerts,
  MASKED_PLACEHOLDER,
  messagePageSchema,
  moderationDecisionResultSchema,
  moderationDetailSchema,
  moderationFlagResultSchema,
  moderationQueueSchema,
  moderationSummarySchema,
  unreadCountSchema,
} from "@parrainage/contracts";
import request from "supertest";
import type { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/prisma/client.js";
import { StorageService } from "../src/storage/storage.service.js";
import { createTestApp } from "./app.js";
import { messageIds, waitForNewMessage } from "./mailpit.js";
import { pngImage } from "./media-fixtures.js";
import { ACCOUNTS, type Account, signInAll, userIdOf } from "./session.js";

// Base remise dans l'état du seed par test/global-setup.ts. Chaque décision porte sur un message
// créé ici (supprimé à la fin) : les 12 messages en attente du seed restent intacts.
const AICHA_CLAIRE = "seed-conversation-aicha-claire";
const KOFI_PAUL = "seed-conversation-kofi-paul";
const MARIAM_HELENE = "seed-conversation-mariam-helene";
const CONVERSATIONS = [AICHA_CLAIRE, KOFI_PAUL, MARIAM_HELENE];
const PHONE_BODY = "Voici comment me joindre : 06 39 98 12 34, à bientôt";
const SECRET = "SECRET-du-message";

describe("Modération (e2e)", () => {
  let app: INestApplication;
  let storage: StorageService;
  let cookies: Record<Account, string>;
  let paulId: string;
  const createdMessages: string[] = [];
  const createdMedia: string[] = [];
  let snapshot: { id: string; lastMessageAt: Date }[];

  const get = (account: Account, path: string) =>
    request(app.getHttpServer()).get(path).set("Cookie", cookies[account]);
  const post = (account: Account, path: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set("Cookie", cookies[account])
      .set("Origin", "http://localhost:3000")
      .send(body);
  const decide = (id: string, body: object, account: Account = "bureau") =>
    post(account, `/api/moderation/messages/${id}/decision`, body);
  const thread = async (account: Account, conversationId: string) =>
    messagePageSchema.parse(
      (await get(account, `/api/conversations/${conversationId}/messages?limit=50`).expect(200))
        .body,
    ).items;
  const unread = async (account: Account) =>
    unreadCountSchema.parse(
      (await get(account, "/api/conversations/unread-count").expect(200)).body,
    ).total;
  const auditOf = (entityId: string) =>
    prisma.auditLog.findMany({
      where: { entityType: "Message", entityId },
      orderBy: { createdAt: "asc" },
    });

  /** Message en attente, écrit par un parrain (`authorUserId`) ou par un enfant (`childId`). */
  async function pendingMessage(
    conversationId: string,
    author: { authorUserId: string } | { childId: string },
    body = `Message de test ${SECRET}`,
    extra: Partial<Prisma.MessageUncheckedCreateInput> = {},
  ): Promise<string> {
    const detection = detectAlerts(body);
    const { id } = await prisma.message.create({
      data: {
        conversationId,
        kind: "TEXT",
        body,
        moderationStatus: "PENDING",
        deliveryStatus: "SENT",
        autoAlerts: detection.spans as unknown as Prisma.InputJsonValue,
        alertTypes: detection.types,
        sentFrom: "childId" in author ? "SCHOOL_SESSION" : "WEB",
        authorUserId: "authorUserId" in author ? author.authorUserId : null,
        authorChildId: "childId" in author ? author.childId : null,
        ...extra,
      },
      select: { id: true },
    });
    createdMessages.push(id);
    return id;
  }

  const fromAicha = (body?: string) =>
    pendingMessage(AICHA_CLAIRE, { childId: "seed-child-aicha" }, body);
  const fromPaul = (body?: string) =>
    pendingMessage(KOFI_PAUL, { authorUserId: paulId }, body ?? PHONE_BODY);

  /** Pièce jointe réelle, déposée dans le stockage. */
  async function attachedFile(
    messageId: string,
    name: string,
  ): Promise<{ id: string; key: string }> {
    const key = `e2e/moderation-${messageId}-${name}.png`;
    await storage.putObject(key, await pngImage(), "image/png");
    const { id } = await prisma.media.create({
      data: {
        kind: "PHOTO",
        status: "READY",
        storageKey: key,
        mimeType: "image/png",
        label: "Photo de test",
        uploadedByUserId: paulId,
        messageId,
      },
      select: { id: true },
    });
    createdMedia.push(id);
    return { id, key };
  }

  beforeAll(async () => {
    snapshot = await prisma.conversation.findMany({
      where: { id: { in: CONVERSATIONS } },
      select: { id: true, lastMessageAt: true },
    });
    expect(snapshot).toHaveLength(CONVERSATIONS.length);
    app = await createTestApp();
    storage = app.get(StorageService);
    cookies = await signInAll(app, ["claire", "paul", "helene", "koffi", "bureau"]);
    paulId = await userIdOf("paul");
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityType: "Message", entityId: { in: createdMessages } },
    });
    await prisma.media.deleteMany({ where: { id: { in: createdMedia } } });
    await prisma.message.deleteMany({ where: { id: { in: createdMessages } } });
    await prisma.$transaction(
      snapshot.map(({ id, lastMessageAt }) =>
        prisma.conversation.update({ where: { id }, data: { lastMessageAt } }),
      ),
    );
    await app.close();
  });

  describe("accès", () => {
    it.each(["claire", "koffi"] as const)("refuse la file à %s (403)", async (account) => {
      await get(account, "/api/moderation/summary").expect(403);
      await get(account, "/api/moderation/queue").expect(403);
      await get(account, "/api/moderation/messages/seed-message-attente-paul").expect(403);
      await decide("seed-message-attente-paul", { decision: "APPROVE" }, account).expect(403);
      await post(account, "/api/moderation/messages/seed-message-attente-paul/flag", {
        flag: "OTHER",
        active: true,
      }).expect(403);
      const untouched = await prisma.message.findUniqueOrThrow({
        where: { id: "seed-message-attente-paul" },
      });
      expect(untouched.moderationStatus).toBe("PENDING");
    });

    it("ne donne pas accès aux échanges entre adultes (404)", async () => {
      await get("bureau", "/api/moderation/messages/seed-message-claire-to-koffi").expect(404);
      await decide("seed-message-claire-to-koffi", { decision: "APPROVE" }).expect(404);
      await get("bureau", "/api/moderation/messages/inconnu").expect(404);
    });
  });

  describe("lecture", () => {
    it("résume la file et ne met rien en cache", async () => {
      const res = await get("bureau", "/api/moderation/summary").expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const summary = moderationSummarySchema.parse(res.body);
      expect(summary.pending).toBeGreaterThanOrEqual(12);
      expect(summary.withMedia).toBeGreaterThanOrEqual(3);
      expect(summary.oldestAt).not.toBeNull();
    });

    it("place les messages avec alerte d'abord, puis du plus ancien au plus récent", async () => {
      const res = await get("bureau", "/api/moderation/queue").expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const { items, total } = moderationQueueSchema.parse(res.body);
      const seeded = items.filter((item) => item.id.startsWith("seed-"));
      expect(seeded).toHaveLength(12);
      expect(total).toBeGreaterThanOrEqual(12);
      expect(seeded.slice(0, 4).map((item) => [item.from, item.to])).toEqual([
        ["Paul D.", "Kofi A."],
        ["Mariam T.", "Hélène R."],
        ["Aïcha S.", "Claire M."],
        ["Yao D.", "Marc P."],
      ]);
      expect(seeded[0]).toMatchObject({
        authorKind: "parrain",
        hasText: true,
        attachments: [],
        alertTypes: ["PHONE", "SOCIAL"],
      });
      expect(seeded[1]).toMatchObject({
        authorKind: "child",
        hasText: false,
        attachments: [{ kind: "VIDEO", durationSec: 35 }],
        manualFlags: ["OTHER_CHILD_FACE"],
      });
      const dates = seeded.slice(1).map((item) => item.createdAt);
      expect(dates).toEqual([...dates].sort());
      // La file ne transporte pas le texte des messages.
      expect(JSON.stringify(res.body)).not.toContain("06 39 98");
    });

    it.each([
      ["enfant", "child"],
      ["parrain", "parrain"],
    ])("filtre sur %s", async (filtre, authorKind) => {
      const { items } = moderationQueueSchema.parse(
        (await get("bureau", `/api/moderation/queue?filtre=${filtre}`).expect(200)).body,
      );
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.authorKind === authorKind)).toBe(true);
    });

    it("filtre sur les signalements, et ignore un filtre inconnu", async () => {
      const flagged = moderationQueueSchema.parse(
        (await get("bureau", "/api/moderation/queue?filtre=signales").expect(200)).body,
      );
      expect(flagged.items.map((item) => item.from)).toContain("Mariam T.");
      expect(flagged.items.every((item) => item.manualFlags.length > 0)).toBe(true);
      const unknown = moderationQueueSchema.parse(
        (await get("bureau", "/api/moderation/queue?filtre=nimporte").expect(200)).body,
      );
      expect(unknown.total).toBeGreaterThanOrEqual(12);
    });

    it("détaille le message de Paul : passages, contexte et historique du binôme", async () => {
      const res = await get("bureau", "/api/moderation/messages/seed-message-attente-paul").expect(
        200,
      );
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const detail = moderationDetailSchema.parse(res.body);
      expect(detail).toMatchObject({
        moderationStatus: "PENDING",
        authorKind: "parrain",
        from: "Paul D.",
        to: "Kofi A.",
        context: { sponsorSince: "Parrain depuis 2024", relaisName: "M. Koffi" },
        history: { messageCount: 23, heldCount: 1 },
      });
      expect(detail.spans.map((span) => detail.body.slice(span.start, span.end))).toEqual([
        "WhatsApp",
        "06 39 98 12 34",
      ]);
      expect(detail.history.lastHeldAt?.slice(5, 7)).toBe("03");
      const newsAge = Date.parse(detail.now) - Date.parse(detail.history.lastNewsAt!);
      expect(Math.round(newsAge / (24 * 3600 * 1000))).toBeGreaterThanOrEqual(64);
    });

    it("accorde « Marraine » et donne les pièces jointes", async () => {
      const detail = moderationDetailSchema.parse(
        (await get("bureau", "/api/moderation/messages/seed-message-attente-aicha").expect(200))
          .body,
      );
      expect(detail.context.sponsorSince).toMatch(/^Marraine depuis /);
      expect(detail.attachments.map((media) => media.kind)).toEqual(["BULLETIN"]);
      expect(detail.spans).toEqual([]);
    });

    it("ne montre pas un message en attente à son destinataire ni à Koffi", async () => {
      const id = await fromAicha();
      const claire = await thread("claire", AICHA_CLAIRE);
      expect(claire.map((message) => message.id)).not.toContain(id);
      const supervised = (await thread("koffi", AICHA_CLAIRE)).find((message) => message.id === id);
      expect(supervised).toMatchObject({ body: null, status: "en_relecture", attachments: [] });
    });
  });

  describe("approuver", () => {
    it("remet le message d'un enfant à son parrain et l'audite", async () => {
      const before = await unread("claire");
      const id = await fromAicha(`Bonjour Claire ${SECRET}`);
      expect(await unread("claire")).toBe(before);

      const res = await decide(id, { decision: "APPROVE" }).expect(200);
      const result = moderationDecisionResultSchema.parse(res.body);
      expect(result).toMatchObject({ id, moderationStatus: "APPROVED" });
      expect(result.nextId).not.toBe(id);
      expect(result.nextId).not.toBeNull();

      const delivered = (await thread("claire", AICHA_CLAIRE)).find((m) => m.id === id);
      expect(delivered).toMatchObject({ body: `Bonjour Claire ${SECRET}`, masked: false });
      expect(await unread("claire")).toBe(before + 1);

      const row = await prisma.message.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({
        moderationStatus: "APPROVED",
        deliveryStatus: "VERIFIED",
        reviewedById: await userIdOf("bureau"),
        moderationReason: null,
      });
      expect(row.reviewedAt).not.toBeNull();
      const [audit] = await auditOf(id);
      expect(audit).toMatchObject({ action: "moderation.approve", entityId: id });
      expect(JSON.stringify(audit!.metadata)).not.toContain(SECRET);
    });

    it("fait remonter la conversation chez le destinataire", async () => {
      const id = await fromAicha();
      const listBefore = conversationListSchema.parse(
        (await get("claire", "/api/conversations").expect(200)).body,
      );
      const lastBefore = listBefore.items.find((c) => c.id === AICHA_CLAIRE)!.lastMessageAt;
      await decide(id, { decision: "APPROVE" }).expect(200);
      const listAfter = conversationListSchema.parse(
        (await get("claire", "/api/conversations").expect(200)).body,
      );
      const after = listAfter.items.find((c) => c.id === AICHA_CLAIRE)!;
      expect(Date.parse(after.lastMessageAt)).toBeGreaterThanOrEqual(Date.parse(lastBefore));
      expect(after.lastMessage?.body).toBeTruthy();
    });

    it("prévient le parrain par un lien, sans une ligne du message", async () => {
      const id = await pendingMessage(
        MARIAM_HELENE,
        { childId: "seed-child-mariam" },
        `Bonjour Hélène ${SECRET}`,
      );
      const known = await messageIds(ACCOUNTS.helene);
      await decide(id, { decision: "APPROVE" }).expect(200);
      const mail = await waitForNewMessage(ACCOUNTS.helene, known);
      expect(mail.subject).toBe("Nouveau message sur Parrainage LRT");
      expect(mail.text).toContain(`/parrain/messages/${MARIAM_HELENE}`);
      expect(`${mail.text}${mail.html}`).not.toContain(SECRET);
      expect(`${mail.text}${mail.html}`).not.toContain("Mariam");
    });

    it("ne prévient pas deux fois un parrain qui a déjà des non-lus ici", async () => {
      // Le message d'Aïcha d'hier n'a pas été lu par Claire.
      const id = await fromAicha();
      const known = await messageIds(ACCOUNTS.claire);
      await decide(id, { decision: "APPROVE" }).expect(200);
      await expect(waitForNewMessage(ACCOUNTS.claire, known, 800)).rejects.toThrow(
        /Aucun nouvel e-mail/,
      );
    });
  });

  describe("masquer", () => {
    it("transmet la seule version masquée et prévient l'auteur, motif compris", async () => {
      const id = await fromPaul(`${PHONE_BODY} ${SECRET}`);
      const redacted = `Voici comment me joindre : ${MASKED_PLACEHOLDER}, à bientôt`;
      const known = await messageIds(ACCOUNTS.paul);
      const res = await decide(id, {
        decision: "MASK",
        reason: "OFF_PLATFORM_CONTACT",
        redactedBody: redacted,
      }).expect(200);
      expect(res.body.moderationStatus).toBe("MASKED");

      const supervised = (await thread("koffi", KOFI_PAUL)).find((m) => m.id === id);
      expect(supervised).toMatchObject({ body: redacted, masked: true, status: "remis" });
      expect(JSON.stringify(supervised)).not.toContain("06 39 98");
      const own = (await thread("paul", KOFI_PAUL)).find((m) => m.id === id);
      expect(own).toMatchObject({
        body: redacted,
        masked: true,
        moderationReason: "Contact direct hors plateforme",
      });

      const mail = await waitForNewMessage(ACCOUNTS.paul, known);
      expect(mail.subject).toBe("Votre message a été transmis en partie");
      expect(mail.text).toContain("Motif : Contact direct hors plateforme.");
      expect(mail.text).toContain(`/parrain/messages/${KOFI_PAUL}`);
      expect(`${mail.text}${mail.html}`).not.toMatch(/06 39 98|SECRET/);

      const [audit] = await auditOf(id);
      expect(audit).toMatchObject({
        action: "moderation.mask",
        metadata: { reason: "OFF_PLATFORM_CONTACT" },
      });
    });

    it("retire une pièce jointe : plus lisible, et effacée du stockage", async () => {
      const id = await fromAicha("Regarde ma photo");
      const kept = await attachedFile(id, "gardee");
      const dropped = await attachedFile(id, "retiree");

      await decide(id, {
        decision: "MASK",
        reason: "THIRD_PARTY_PHOTO",
        redactedBody: "Regarde ma photo",
        removedMediaIds: [dropped.id],
      }).expect(200);

      const delivered = (await thread("claire", AICHA_CLAIRE)).find((m) => m.id === id);
      expect(delivered?.attachments.map((media) => media.id)).toEqual([kept.id]);
      await get("claire", `/api/media/${dropped.id}`).expect(404);
      await get("bureau", `/api/media/${dropped.id}`).expect(404);
      expect(await prisma.media.findUniqueOrThrow({ where: { id: dropped.id } })).toMatchObject({
        status: "REJECTED",
        messageId: null,
        storageKey: null,
      });
      expect(await storage.objectSize(dropped.key)).toBeNull();
      expect(await storage.objectSize(kept.key)).not.toBeNull();
      await storage.deleteObject(kept.key);
    });

    it("refuse une version identique, vide, ou une pièce d'un autre message", async () => {
      const id = await fromPaul();
      const reason = "OFF_PLATFORM_CONTACT";
      const same = await decide(id, { decision: "MASK", reason, redactedBody: PHONE_BODY }).expect(
        422,
      );
      expect(same.body.message).toMatch(/Rien n'a été retiré/);
      const empty = await decide(id, { decision: "MASK", reason, redactedBody: "" }).expect(422);
      expect(empty.body.message).toMatch(/Il ne resterait rien/);
      await decide(id, {
        decision: "MASK",
        reason,
        redactedBody: "autre",
        removedMediaIds: ["seed-media-attente-aicha-bulletin"],
      }).expect(422);
      expect(await prisma.message.findUniqueOrThrow({ where: { id } })).toMatchObject({
        moderationStatus: "PENDING",
      });
      expect(await auditOf(id)).toEqual([]);
    });
  });

  describe("retenir", () => {
    it("exige un motif", async () => {
      const id = await fromPaul();
      await decide(id, { decision: "HOLD" }).expect(400);
      await decide(id, { decision: "HOLD", reason: "INCONNU" }).expect(400);
    });

    it("garde le message de Paul hors du fil de l'enfant et lui envoie le motif", async () => {
      const id = await fromPaul(`${PHONE_BODY} ${SECRET}`);
      const known = await messageIds(ACCOUNTS.paul);
      const res = await decide(id, { decision: "HOLD", reason: "OFF_PLATFORM_CONTACT" }).expect(
        200,
      );
      expect(res.body.moderationStatus).toBe("HELD");

      expect(await prisma.message.findUniqueOrThrow({ where: { id } })).toMatchObject({
        moderationStatus: "HELD",
        deliveryStatus: "SENT",
        moderationReason: "Contact direct hors plateforme",
      });
      const own = (await thread("paul", KOFI_PAUL)).find((m) => m.id === id);
      expect(own).toMatchObject({
        status: "retenu",
        moderationReason: "Contact direct hors plateforme",
      });
      const supervised = (await thread("koffi", KOFI_PAUL)).find((m) => m.id === id);
      expect(supervised).toMatchObject({ body: null, status: "retenu" });

      const mail = await waitForNewMessage(ACCOUNTS.paul, known);
      expect(mail.subject).toBe("Votre message n'a pas été transmis");
      expect(mail.text).toContain("Motif : Contact direct hors plateforme.");
      expect(mail.text).toMatch(/hors plateforme entre parrain et enfant/);
      expect(`${mail.text}${mail.html}`).not.toMatch(/06 39 98|SECRET/);
    });

    it("prévient le relais, et non le parrain, quand l'auteur est un enfant", async () => {
      const id = await fromAicha(`Texte ${SECRET}`);
      const knownRelais = await messageIds(ACCOUNTS.koffi);
      const knownClaire = await messageIds(ACCOUNTS.claire);
      await decide(id, { decision: "HOLD", reason: "INAPPROPRIATE_CONTENT" }).expect(200);

      const mail = await waitForNewMessage(ACCOUNTS.koffi, knownRelais);
      expect(mail.subject).toBe("Le message d'un enfant n'a pas été transmis");
      expect(mail.text).toContain("Motif : Contenu inadapté.");
      // La page Messages, tant que la conversation d'un enfant n'a pas son onglet (404 sinon).
      expect(mail.text).toContain("/relais/messages");
      expect(mail.text).not.toContain(AICHA_CLAIRE);
      expect(`${mail.text}${mail.html}`).not.toMatch(/SECRET|Aïcha/);
      await expect(waitForNewMessage(ACCOUNTS.claire, knownClaire, 500)).rejects.toThrow();
      expect((await thread("claire", AICHA_CLAIRE)).map((m) => m.id)).not.toContain(id);
    });

    it("ne dit rien de plus avec le motif « Autre »", async () => {
      const id = await fromPaul();
      await decide(id, { decision: "HOLD", reason: "OTHER" }).expect(200);
      expect(await prisma.message.findUniqueOrThrow({ where: { id } })).toMatchObject({
        moderationReason: null,
      });
      const [audit] = await auditOf(id);
      expect(audit).toMatchObject({ action: "moderation.hold", metadata: { reason: "OTHER" } });
    });
  });

  describe("décisions simultanées", () => {
    it("n'applique qu'une décision, l'autre reçoit 409", async () => {
      const id = await fromPaul();
      const responses = await Promise.all([
        decide(id, { decision: "APPROVE" }),
        decide(id, { decision: "HOLD", reason: "OFF_PLATFORM_CONTACT" }),
      ]);
      expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
      const winner = responses.find((res) => res.status === 200)!;
      const row = await prisma.message.findUniqueOrThrow({ where: { id } });
      expect(row.moderationStatus).toBe(winner.body.moderationStatus);
      expect(await auditOf(id)).toHaveLength(1);
    });

    it("refuse une décision sur un message déjà traité", async () => {
      const id = await fromPaul();
      await decide(id, { decision: "APPROVE" }).expect(200);
      const again = await decide(id, { decision: "HOLD", reason: "OTHER" }).expect(409);
      expect(again.body.message).toMatch(/déjà été traité/);
      await post("bureau", `/api/moderation/messages/${id}/flag`, {
        flag: "OTHER",
        active: true,
      }).expect(409);
    });
  });

  describe("signalements", () => {
    it("pose puis retire un signalement, audité, visible dans le filtre", async () => {
      const id = await fromAicha();
      const flag = (active: boolean) =>
        post("bureau", `/api/moderation/messages/${id}/flag`, {
          flag: "THIRD_PARTY_PHOTO",
          active,
        }).expect(200);
      expect(moderationFlagResultSchema.parse((await flag(true)).body).manualFlags).toEqual([
        "THIRD_PARTY_PHOTO",
      ]);
      // Le rejeu ne change rien et n'ajoute pas de trace.
      await flag(true);
      const flagged = moderationQueueSchema.parse(
        (await get("bureau", "/api/moderation/queue?filtre=signales").expect(200)).body,
      );
      expect(flagged.items.map((item) => item.id)).toContain(id);

      expect(moderationFlagResultSchema.parse((await flag(false)).body).manualFlags).toEqual([]);
      expect((await auditOf(id)).map((row) => row.action)).toEqual([
        "moderation.flag",
        "moderation.unflag",
      ]);
    });

    it("refuse un signalement inconnu", async () => {
      await post("bureau", "/api/moderation/messages/seed-message-attente-yao/flag", {
        flag: "INCONNU",
        active: true,
      }).expect(400);
    });
  });
});
