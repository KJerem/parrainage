import type { INestApplication } from "@nestjs/common";
import {
  contactListSchema,
  conversationDetailSchema,
  conversationListSchema,
  conversationMessageSchema,
  conversationSummarySchema,
  ENCOURAGEMENT_TEXT,
  messagePageSchema,
  unreadCountSchema,
} from "@parrainage/contracts";
import request from "supertest";
import { getEnv } from "../src/config/env.js";
import { RATE_LIMITED_MESSAGE } from "../src/messaging/messaging.service.js";
import { prisma } from "../src/prisma/client.js";
import { createTestApp } from "./app.js";
import { messageIds, waitForNewMessage } from "./mailpit.js";
import { type Account, ACCOUNTS, signInAll, userIdOf } from "./session.js";

// Base remise dans l'état du seed par test/global-setup.ts. Les conversations du seed retrouvent
// leur état d'origine à la fin (lectures, statuts, dates), les messages créés sont supprimés.
const AICHA_CLAIRE = "seed-conversation-aicha-claire";
const KOFI_CLAIRE = "seed-conversation-kofi-claire";
const KOFI_PAUL = "seed-conversation-kofi-paul";
const CLAIRE_KOFFI = "seed-conversation-claire-koffi";
const PAUL_KOFFI = "seed-conversation-paul-koffi";
const HELENE_KOFFI = "seed-conversation-helene-koffi";
const KOFFI_BUREAU = "seed-conversation-koffi-bureau";
const CLAIRE_BUREAU = "seed-conversation-claire-bureau";
const SEED_CONVERSATIONS = [
  AICHA_CLAIRE,
  KOFI_CLAIRE,
  KOFI_PAUL,
  CLAIRE_KOFFI,
  PAUL_KOFFI,
  HELENE_KOFFI,
  KOFFI_BUREAU,
  CLAIRE_BUREAU,
];
const NOT_FOUND = { statusCode: 404, error: "Introuvable", message: "Introuvable" };
const PHONE_MESSAGE = "Coucou Aïcha ! Voici mon numéro : 06 39 98 12 34";

describe("Messagerie (e2e)", () => {
  let app: INestApplication;
  let cookies: Record<Account, string>;
  const createdMessages: string[] = [];
  const createdMedia: string[] = [];
  const createdConversations: string[] = [];
  let snapshot: {
    participants: { id: string; lastReadAt: Date | null }[];
    messages: {
      id: string;
      deliveryStatus: "SENT" | "VERIFIED" | "RECEIVED";
      readAt: Date | null;
    }[];
    conversations: { id: string; lastMessageAt: Date }[];
  };
  let key = 0;
  const nextKey = () => `e2e-${Date.now()}-${(key += 1)}`;

  const get = (account: Account, path: string) =>
    request(app.getHttpServer()).get(path).set("Cookie", cookies[account]);
  const post = (account: Account, path: string, body?: object) =>
    request(app.getHttpServer())
      .post(path)
      .set("Cookie", cookies[account])
      .set("Origin", "http://localhost:3000")
      .send(body ?? {});
  const unread = async (account: Account) =>
    unreadCountSchema.parse(
      (await get(account, "/api/conversations/unread-count").expect(200)).body,
    ).total;
  const page = async (account: Account, conversationId: string) =>
    messagePageSchema.parse(
      (await get(account, `/api/conversations/${conversationId}/messages`).expect(200)).body,
    );
  async function send(account: Account, conversationId: string, body: object, status = 201) {
    const res = await post(account, `/api/conversations/${conversationId}/messages`, body).expect(
      status,
    );
    if (res.status === 201) {
      createdMessages.push(res.body.id);
    }
    return res;
  }

  beforeAll(async () => {
    expect(await prisma.conversation.count({ where: { id: { in: SEED_CONVERSATIONS } } })).toBe(
      SEED_CONVERSATIONS.length,
    );
    snapshot = {
      participants: await prisma.conversationParticipant.findMany({
        where: { conversationId: { in: SEED_CONVERSATIONS } },
        select: { id: true, lastReadAt: true },
      }),
      messages: await prisma.message.findMany({
        where: { conversationId: { in: SEED_CONVERSATIONS } },
        select: { id: true, deliveryStatus: true, readAt: true },
      }),
      conversations: await prisma.conversation.findMany({
        where: { id: { in: SEED_CONVERSATIONS } },
        select: { id: true, lastMessageAt: true },
      }),
    };
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "messages:" } } });
    app = await createTestApp();
    cookies = await signInAll(app, ["claire", "paul", "helene", "koffi", "diallo", "bureau"]);
  });

  afterAll(async () => {
    await prisma.media.deleteMany({ where: { id: { in: createdMedia } } });
    await prisma.message.deleteMany({ where: { id: { in: createdMessages } } });
    await prisma.conversation.deleteMany({ where: { id: { in: createdConversations } } });
    await prisma.$transaction([
      ...snapshot.participants.map(({ id, lastReadAt }) =>
        prisma.conversationParticipant.update({ where: { id }, data: { lastReadAt } }),
      ),
      ...snapshot.messages.map(({ id, deliveryStatus, readAt }) =>
        prisma.message.update({ where: { id }, data: { deliveryStatus, readAt } }),
      ),
      ...snapshot.conversations.map(({ id, lastMessageAt }) =>
        prisma.conversation.update({ where: { id }, data: { lastMessageAt } }),
      ),
    ]);
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "messages:" } } });
    await app.close();
  });

  describe("listes et accès", () => {
    it("liste les conversations de Claire, avec 2 non-lus comme sur la maquette", async () => {
      const res = await get("claire", "/api/conversations").expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const { items } = conversationListSchema.parse(res.body);
      expect(items.map((c) => c.id).sort()).toEqual(
        [AICHA_CLAIRE, KOFI_CLAIRE, CLAIRE_KOFFI, CLAIRE_BUREAU].sort(),
      );
      const byId = new Map(items.map((c) => [c.id, c]));
      expect(byId.get(AICHA_CLAIRE)).toMatchObject({
        kind: "SPONSORSHIP",
        access: "participant",
        counterpart: {
          kind: "child",
          name: "Aïcha S.",
          shortName: "Aïcha",
          subtitle: "Écrit depuis l'école, avec son relais M. Koffi",
        },
        unreadCount: 1,
        lastMessage: { mine: false, attachmentCount: 2 },
      });
      expect(byId.get(CLAIRE_KOFFI)).toMatchObject({
        counterpart: { kind: "relais", name: "M. Koffi", initials: "MK" },
        subject: "Demande d'appel vidéo avec Aïcha S.",
        unreadCount: 1,
      });
      expect(byId.get(CLAIRE_KOFFI)!.lastMessage!.body).toMatch(/^Créneau proposé pour l'appel/);
      expect(byId.get(CLAIRE_BUREAU)).toMatchObject({
        counterpart: { kind: "bureau", name: "Bureau de l'association", initials: "LRT" },
        lastMessage: { kind: "NEWSLETTER" },
        unreadCount: 0,
      });
      expect(byId.get(KOFI_CLAIRE)).toMatchObject({ unreadCount: 0 });
      expect(await unread("claire")).toBe(2);
      // Jamais d'e-mail ni d'adresse d'un parrain.
      expect(JSON.stringify(res.body)).not.toMatch(/@|rue des Tilleuls|69003/);
    });

    it("liste celles de M. Koffi par onglet, et les conversations de ses enfants à part", async () => {
      // Base de développement partagée : seules les conversations du seed sont comparées (une
      // conversation ouverte à la main depuis « Nouveau message » ne fait pas échouer le test).
      const parrains = conversationListSchema
        .parse((await get("koffi", "/api/conversations?kind=PARRAIN_RELAIS").expect(200)).body)
        .items.filter((c) => SEED_CONVERSATIONS.includes(c.id));
      expect(
        parrains.map((c) => [c.counterpart.name, c.counterpart.subtitle, c.unreadCount]),
      ).toEqual([
        ["Claire M.", "Marraine d'Aïcha et Kofi", 1],
        ["Paul D.", "Parrain de Kofi", 0],
        ["Hélène R.", "Marraine de Mariam", 0],
      ]);
      expect(parrains[1]!.lastMessage!.body).toBe("Des nouvelles de Kofi ?");
      const bureau = conversationListSchema.parse(
        (await get("koffi", "/api/conversations?kind=RELAIS_BUREAU").expect(200)).body,
      ).items;
      expect(bureau).toEqual([
        expect.objectContaining({
          id: KOFFI_BUREAU,
          counterpart: expect.objectContaining({ name: "Bureau · trésorerie" }),
        }),
      ]);
      expect(bureau[0]!.lastMessage!.body).toMatch(/^Reçus d/);
      const children = conversationListSchema.parse(
        (await get("koffi", "/api/conversations?kind=SPONSORSHIP").expect(200)).body,
      ).items;
      expect(children.length).toBeGreaterThan(5);
      expect(children.every((c) => c.access === "supervisor" && c.unreadCount === 0)).toBe(true);
      expect(children.find((c) => c.id === AICHA_CLAIRE)!.counterpart.subtitle).toBe(
        "Avec sa marraine Claire M.",
      );
      expect(await unread("koffi")).toBe(1);
      await get("koffi", "/api/conversations?kind=INCONNU").expect(400);
    });

    it("répond 404 sur la conversation d'un autre (co-parrain, autre relais), 403 au bureau", async () => {
      for (const [account, id] of [
        ["paul", AICHA_CLAIRE],
        ["paul", KOFI_CLAIRE],
        ["paul", CLAIRE_KOFFI],
        ["claire", KOFI_PAUL],
        ["diallo", AICHA_CLAIRE],
        ["diallo", CLAIRE_KOFFI],
        ["helene", "inconnue"],
      ] as const) {
        expect((await get(account, `/api/conversations/${id}/messages`).expect(404)).body).toEqual(
          NOT_FOUND,
        );
        await get(account, `/api/conversations/${id}`).expect(404);
        await post(account, `/api/conversations/${id}/read`).expect(404);
      }
      await send("paul", AICHA_CLAIRE, { body: "Bonjour", idempotencyKey: nextKey() }, 404);
      await get("bureau", "/api/conversations").expect(403);
      await get("bureau", "/api/conversations/unread-count").expect(403);
    });

    it("décrit la conversation et ses règles d'écriture", async () => {
      const own = conversationDetailSchema.parse(
        (await get("claire", `/api/conversations/${AICHA_CLAIRE}`).expect(200)).body,
      );
      expect(own).toMatchObject({ moderated: true, canWrite: true, canEncourage: true });
      const supervised = conversationDetailSchema.parse(
        (await get("koffi", `/api/conversations/${AICHA_CLAIRE}`).expect(200)).body,
      );
      expect(supervised).toMatchObject({
        access: "supervisor",
        canWrite: false,
        canEncourage: false,
      });
      const adult = conversationDetailSchema.parse(
        (await get("koffi", `/api/conversations/${CLAIRE_KOFFI}`).expect(200)).body,
      );
      expect(adult).toMatchObject({ moderated: false, canWrite: true, canEncourage: false });
    });

    it("pagine du plus récent au plus ancien, chaque page dans l'ordre chronologique", async () => {
      const first = messagePageSchema.parse(
        (await get("claire", `/api/conversations/${AICHA_CLAIRE}/messages?limit=1`).expect(200))
          .body,
      );
      expect(first.items.map((m) => m.body)).toEqual([
        expect.stringMatching(/^Bonjour tata Claire/),
      ]);
      expect(first.items[0]).toMatchObject({
        side: "them",
        author: { kind: "child", name: "Aïcha S." },
        sentFrom: "SCHOOL_SESSION",
        status: null,
      });
      expect(first.nextCursor).not.toBeNull();
      const older = messagePageSchema.parse(
        (
          await get(
            "claire",
            `/api/conversations/${AICHA_CLAIRE}/messages?limit=1&cursor=${first.nextCursor}`,
          ).expect(200)
        ).body,
      );
      expect(older.items[0]).toMatchObject({ side: "me", status: "lu" });
      expect(older.items[0]!.body).toMatch(/^Bravo pour ta rentrée/);
      expect(older.nextCursor).toBeNull();
      const full = await page("claire", AICHA_CLAIRE);
      expect(full.items.map((m) => m.id)).toEqual([older.items[0]!.id, first.items[0]!.id]);
      const invalid = await get("claire", `/api/conversations/${AICHA_CLAIRE}/messages?cursor=x`);
      expect(invalid.status).toBe(400);
      expect(invalid.body.message).toBe("Curseur de pagination invalide");
    });
  });

  describe("message à un enfant", () => {
    let pendingId: string;

    it("marque lu le message d'Aïcha à l'ouverture (RECEIVED)", async () => {
      const res = await post("claire", `/api/conversations/${AICHA_CLAIRE}/read`).expect(200);
      // Reste le créneau proposé par M. Koffi.
      expect(res.body).toEqual({ total: 1 });
      expect(
        await prisma.message.findUniqueOrThrow({ where: { id: "seed-message-aicha-to-claire" } }),
      ).toMatchObject({ deliveryStatus: "RECEIVED" });
      // Le relais qui suit la conversation ne la marque pas comme lue.
      await post("koffi", `/api/conversations/${AICHA_CLAIRE}/read`).expect(200);
    });

    it("compte comme non lu un message de l'enfant approuvé après la dernière lecture", async () => {
      // Écrit avant la lecture de Claire, encore en relecture : invisible et non compté.
      const id = `e2e-message-aicha-${Date.now()}`;
      createdMessages.push(id);
      await prisma.message.create({
        data: {
          id,
          conversationId: AICHA_CLAIRE,
          body: "J'ai joué au foot avec Kofi.",
          moderationStatus: "PENDING",
          authorChildId: "seed-child-aicha",
          sentFrom: "SCHOOL_SESSION",
          createdAt: new Date(Date.now() - 3600 * 1000),
        },
      });
      expect(await unread("claire")).toBe(1);
      expect((await page("claire", AICHA_CLAIRE)).items.some((m) => m.id === id)).toBe(false);
      // Approuvé maintenant (phase 5 : décision du bureau) : il devient non lu.
      await prisma.message.update({
        where: { id },
        data: { moderationStatus: "APPROVED", reviewedAt: new Date(), deliveryStatus: "VERIFIED" },
      });
      expect(await unread("claire")).toBe(2);
      await post("claire", `/api/conversations/${AICHA_CLAIRE}/read`).expect(200);
      expect(await unread("claire")).toBe(1);
    });

    it("part en relecture avec l'alerte PHONE, sans e-mail", async () => {
      const knownKoffi = await messageIds(ACCOUNTS.koffi);
      const res = await send("claire", AICHA_CLAIRE, {
        body: PHONE_MESSAGE,
        idempotencyKey: nextKey(),
      });
      const message = conversationMessageSchema.parse(res.body);
      pendingId = message.id;
      expect(message).toMatchObject({
        side: "me",
        kind: "TEXT",
        body: PHONE_MESSAGE,
        status: "en_relecture",
        author: { kind: "parrain", name: "Claire M." },
      });
      const row = await prisma.message.findUniqueOrThrow({ where: { id: pendingId } });
      expect(row).toMatchObject({
        moderationStatus: "PENDING",
        deliveryStatus: "SENT",
        alertTypes: ["PHONE"],
      });
      // Positions dans le texte d'origine : l'annonce « mon numéro » et le numéro lui-même.
      const spans = row.autoAlerts as { type: string; start: number; end: number }[];
      expect(spans.map((s) => [s.type, PHONE_MESSAGE.slice(s.start, s.end)])).toEqual([
        ["PHONE", "mon numéro"],
        ["PHONE", "06 39 98 12 34"],
      ]);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(await messageIds(ACCOUNTS.koffi)).toEqual(knownKoffi);
    });

    it("reste visible par Claire (en relecture) et par le relais sans son texte", async () => {
      const own = (await page("claire", AICHA_CLAIRE)).items.at(-1)!;
      expect(own).toMatchObject({ id: pendingId, status: "en_relecture", body: PHONE_MESSAGE });
      const supervised = (await page("koffi", AICHA_CLAIRE)).items.find((m) => m.id === pendingId);
      expect(supervised).toMatchObject({ body: null, attachments: [], status: "en_relecture" });
      // Le non-lu de Claire ne compte pas ses propres messages.
      expect(await unread("claire")).toBe(1);
    });

    it("rejoue la même clé sans doublon (200), refuse la clé ailleurs (409)", async () => {
      const idempotencyKey = nextKey();
      const first = await send("claire", AICHA_CLAIRE, { body: "Bonne semaine !", idempotencyKey });
      const replay = await send(
        "claire",
        AICHA_CLAIRE,
        { body: "Bonne semaine !", idempotencyKey },
        200,
      );
      expect(replay.body).toEqual(first.body);
      expect(
        await prisma.message.count({
          where: { idempotencyKey: { endsWith: `:${idempotencyKey}` } },
        }),
      ).toBe(1);
      const elsewhere = await send("claire", CLAIRE_KOFFI, { body: "x", idempotencyKey }, 409);
      expect(elsewhere.body.message).toBe("Cette clé d'envoi a déjà servi pour un autre message");
      const invalid = await send("claire", AICHA_CLAIRE, { body: "   " }, 400);
      expect(invalid.body.fieldErrors).toHaveProperty("idempotencyKey");
    });

    it("envoie un encouragement approuvé d'office, refusé hors d'un binôme", async () => {
      const res = await post("claire", `/api/conversations/${AICHA_CLAIRE}/encouragement`).expect(
        201,
      );
      createdMessages.push(res.body.id);
      expect(res.body).toMatchObject({
        kind: "ENCOURAGEMENT",
        body: ENCOURAGEMENT_TEXT,
        status: "remis",
      });
      expect(await prisma.message.findUniqueOrThrow({ where: { id: res.body.id } })).toMatchObject({
        moderationStatus: "APPROVED",
        autoApproved: true,
        deliveryStatus: "VERIFIED",
      });
      const supervised = (await page("koffi", AICHA_CLAIRE)).items.find(
        (m) => m.id === res.body.id,
      );
      expect(supervised).toMatchObject({ body: ENCOURAGEMENT_TEXT, status: "remis" });
      await post("claire", `/api/conversations/${CLAIRE_KOFFI}/encouragement`).expect(403);
      await post("koffi", `/api/conversations/${AICHA_CLAIRE}/encouragement`).expect(403);
      await send("koffi", AICHA_CLAIRE, { body: "Bonjour", idempotencyKey: nextKey() }, 403);
    });
  });

  describe("échanges entre adultes", () => {
    it("remet aussitôt le message du relais, déplace les non-lus et prévient par un lien", async () => {
      // Claire lit d'abord le créneau proposé : plus rien de non lu chez elle.
      expect(
        (await post("claire", `/api/conversations/${CLAIRE_KOFFI}/read`).expect(200)).body,
      ).toEqual({
        total: 0,
      });
      expect(
        (await page("claire", CLAIRE_KOFFI)).items.find((m) => m.side === "them")?.status,
      ).toBe(null);
      // M. Koffi lit la demande de Claire, qui la voit « lue ».
      expect(
        (await post("koffi", `/api/conversations/${CLAIRE_KOFFI}/read`).expect(200)).body,
      ).toEqual({
        total: 0,
      });
      const asked = (await page("claire", CLAIRE_KOFFI)).items.find((m) =>
        m.body?.startsWith("Bonjour M. Koffi"),
      );
      expect(asked).toMatchObject({ side: "me", status: "lu" });

      const known = await messageIds(ACCOUNTS.claire);
      const reply = conversationMessageSchema.parse(
        (
          await send("koffi", CLAIRE_KOFFI, {
            body: "Je vous propose samedi à 10 h, avec Aïcha.",
            idempotencyKey: nextKey(),
          })
        ).body,
      );
      expect(reply).toMatchObject({ side: "me", status: "remis", author: { kind: "relais" } });
      expect(await prisma.message.findUniqueOrThrow({ where: { id: reply.id } })).toMatchObject({
        moderationStatus: "NOT_REQUIRED",
        deliveryStatus: "VERIFIED",
      });
      expect(await unread("claire")).toBe(1);
      const seen = (await page("claire", CLAIRE_KOFFI)).items.at(-1)!;
      expect(seen).toMatchObject({ id: reply.id, side: "them", status: null });

      const mail = await waitForNewMessage(ACCOUNTS.claire, known);
      expect(mail.subject).toBe("Nouveau message sur Parrainage LRT");
      expect(mail.text).toContain(`${getEnv().APP_URL}/parrain/messages/${CLAIRE_KOFFI}`);
      expect(mail.text).not.toContain("samedi");
      expect(mail.html).not.toContain("Aïcha");

      await post("claire", `/api/conversations/${CLAIRE_KOFFI}/read`).expect(200);
      expect(await unread("claire")).toBe(0);
      expect((await page("koffi", CLAIRE_KOFFI)).items.at(-1)).toMatchObject({
        id: reply.id,
        status: "lu",
      });
    });

    it("joint ses propres fichiers prêts, jamais ceux d'un autre ni déjà utilisés (422)", async () => {
      const claireId = await userIdOf("claire");
      const media = async (
        id: string,
        status: "READY" | "PENDING_UPLOAD",
        uploadedByUserId: string,
      ) => {
        createdMedia.push(id);
        await prisma.media.create({
          data: {
            id,
            kind: "PHOTO",
            status,
            mimeType: "image/jpeg",
            label: "Photo",
            uploadedByUserId,
          },
        });
        return id;
      };
      const stamp = Date.now();
      const mine = await media(`e2e-photo-${stamp}`, "READY", claireId);
      const pending = await media(`e2e-pending-${stamp}`, "PENDING_UPLOAD", claireId);
      const fromKoffi = await send(
        "koffi",
        CLAIRE_KOFFI,
        { body: "Voici la photo", mediaIds: [mine], idempotencyKey: nextKey() },
        422,
      );
      expect(fromKoffi.body.message).toBe("Pièce jointe introuvable ou déjà utilisée");
      await send(
        "claire",
        CLAIRE_KOFFI,
        { body: "x", mediaIds: [pending], idempotencyKey: nextKey() },
        422,
      );
      await send(
        "claire",
        CLAIRE_KOFFI,
        { body: "x", mediaIds: ["inconnu"], idempotencyKey: nextKey() },
        422,
      );

      const sent = await send("claire", CLAIRE_KOFFI, {
        mediaIds: [mine],
        idempotencyKey: nextKey(),
      });
      expect(sent.body).toMatchObject({ body: "", attachments: [{ id: mine, kind: "PHOTO" }] });
      const received = (await page("koffi", CLAIRE_KOFFI)).items.at(-1)!;
      expect(received.attachments.map((a) => a.id)).toEqual([mine]);
      await send(
        "claire",
        CLAIRE_KOFFI,
        { body: "encore", mediaIds: [mine], idempotencyKey: nextKey() },
        422,
      );
    });

    it("ouvre ou retrouve une conversation avec le relais ou le bureau", async () => {
      const contacts = contactListSchema.parse(
        (await get("claire", "/api/conversations/contacts").expect(200)).body,
      ).items;
      expect(contacts).toEqual([
        expect.objectContaining({
          kind: "PARRAIN_RELAIS",
          counterpartId: "seed-relais-koffi",
          name: "M. Koffi",
          subtitle: "Relais d'Aïcha et Kofi",
          conversationId: CLAIRE_KOFFI,
        }),
        expect.objectContaining({ kind: "PARRAIN_BUREAU", conversationId: CLAIRE_BUREAU }),
      ]);
      const relaisContacts = contactListSchema.parse(
        (await get("koffi", "/api/conversations/contacts").expect(200)).body,
      ).items;
      expect(relaisContacts).toContainEqual(
        expect.objectContaining({
          counterpartId: "seed-parrain-claire",
          subtitle: "Marraine d'Aïcha et Kofi",
          conversationId: CLAIRE_KOFFI,
        }),
      );

      const reused = await post("claire", "/api/conversations", { kind: "PARRAIN_RELAIS" }).expect(
        200,
      );
      expect(conversationSummarySchema.parse(reused.body).id).toBe(CLAIRE_KOFFI);
      const fromKoffi = await post("koffi", "/api/conversations", {
        kind: "PARRAIN_RELAIS",
        counterpartId: "seed-parrain-claire",
      }).expect(200);
      expect(fromKoffi.body.id).toBe(CLAIRE_KOFFI);

      const opened = await post("paul", "/api/conversations", { kind: "PARRAIN_BUREAU" }).expect(
        201,
      );
      createdConversations.push(opened.body.id);
      expect(opened.body).toMatchObject({
        kind: "PARRAIN_BUREAU",
        counterpart: { kind: "bureau", name: "Bureau de l'association" },
        lastMessage: null,
        unreadCount: 0,
      });
      const again = await post("paul", "/api/conversations", { kind: "PARRAIN_BUREAU" }).expect(
        200,
      );
      expect(again.body.id).toBe(opened.body.id);
      // Ouverte mais encore vide : elle n'encombre aucune liste, jusqu'au premier message.
      const listed = async () =>
        conversationListSchema
          .parse((await get("paul", "/api/conversations").expect(200)).body)
          .items.map((c) => c.id);
      expect(await listed()).not.toContain(opened.body.id);
      await get("paul", `/api/conversations/${opened.body.id}`).expect(200);
      const first = await post("paul", `/api/conversations/${opened.body.id}/messages`, {
        body: "Bonjour, une question sur mon reçu.",
        idempotencyKey: nextKey(),
      }).expect(201);
      createdMessages.push(first.body.id);
      expect(await listed()).toContain(opened.body.id);
      // Celle d'un binôme reste listée même vide : c'est par elle qu'on écrit au filleul.
      expect(await listed()).toContain(KOFI_PAUL);
      // Paul ne voit toujours pas les conversations de Claire avec le bureau.
      await get("paul", `/api/conversations/${CLAIRE_BUREAU}`).expect(404);

      await post("claire", "/api/conversations", { kind: "RELAIS_BUREAU" }).expect(403);
      await post("koffi", "/api/conversations", {
        kind: "PARRAIN_RELAIS",
        counterpartId: "seed-parrain-sophie",
      }).expect(404);
      await post("diallo", "/api/conversations", {
        kind: "PARRAIN_RELAIS",
        counterpartId: "seed-parrain-claire",
      }).expect(404);
      await post("koffi", "/api/conversations", { kind: "SPONSORSHIP" }).expect(400);
    });

    it("limite le nombre de messages par utilisateur (429)", async () => {
      const { MESSAGE_RATE_LIMIT_MAX } = getEnv();
      await prisma.rateLimit.deleteMany({
        where: { key: `messages:${await userIdOf("helene")}` },
      });
      for (let index = 0; index < MESSAGE_RATE_LIMIT_MAX; index += 1) {
        await send("helene", HELENE_KOFFI, {
          body: `Message ${index + 1}`,
          idempotencyKey: nextKey(),
        });
      }
      const limited = await send(
        "helene",
        HELENE_KOFFI,
        { body: "Un de trop", idempotencyKey: nextKey() },
        429,
      );
      expect(limited.body).toEqual({
        statusCode: 429,
        error: "Trop de requêtes",
        message: RATE_LIMITED_MESSAGE,
      });
      // M. Koffi n'a qu'une conversation non lue de plus, même avec 20 messages.
      const list = conversationListSchema.parse(
        (await get("koffi", "/api/conversations?kind=PARRAIN_RELAIS").expect(200)).body,
      ).items;
      expect(list[0]).toMatchObject({ id: HELENE_KOFFI, unreadCount: MESSAGE_RATE_LIMIT_MAX });
    });
  });
});
