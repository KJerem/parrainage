import { execSync } from "node:child_process";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import {
  callCardSchema,
  filleulDashboardSchema,
  messagePageSchema,
  parrainCallsSchema,
  relaisCallsSchema,
  relaisHomeSchema,
  visioAccessSchema,
  visioRoomSchema,
} from "@parrainage/contracts";
import request from "supertest";
import { now } from "../src/common/clock.js";
import { prisma } from "../src/prisma/client.js";
import { createTestApp, WEB_ORIGIN } from "./app.js";
import { messageIds, waitForNewMessage } from "./mailpit.js";
import { type Account, ACCOUNTS, signInAll } from "./session.js";

vi.setConfig({ testTimeout: 30_000 });

const AICHA = "seed-child-aicha";
const KOFI = "seed-child-kofi";
const MARIAM = "seed-child-mariam";
const YAO = "seed-child-yao";
const AICHA_REQUEST = "seed-call-request-aicha";
const KOFI_CALL = "seed-video-call-kofi";
const SLOT = (day: string) => `seed-call-slot-${day}`;

describe("Appels vidéo (e2e)", () => {
  let app: INestApplication;
  let cookies: Record<Account, string>;

  const server = () => app.getHttpServer();
  const get = (account: Account, url: string) =>
    request(server()).get(url).set("Cookie", cookies[account]);
  const post = (account: Account, url: string, body?: object) =>
    request(server())
      .post(url)
      .set("Cookie", cookies[account])
      .set("Origin", WEB_ORIGIN)
      .send(body ?? {});
  const del = (account: Account, url: string) =>
    request(server()).delete(url).set("Cookie", cookies[account]).set("Origin", WEB_ORIGIN);

  const overview = async (account: Account, childId: string) =>
    parrainCallsSchema.parse(
      (await get(account, `/api/parrain/calls?filleul=${childId}`).expect(200)).body,
    );
  const slotStatus = async (id: string) =>
    (await prisma.callSlot.findUniqueOrThrow({ where: { id } })).status;
  /** Nouveau créneau de M. Koffi, `minutes` après maintenant (arrondi à la minute). */
  const addSlot = async (minutes: number) => {
    const startsAt = new Date(Math.ceil((now().getTime() + minutes * 60_000) / 60_000) * 60_000);
    const res = await post("koffi", "/api/relais/calls/slots", {
      startsAt: [startsAt.toISOString()],
    }).expect(201);
    return (res.body as { items: { id: string }[] }).items[0]!.id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    cookies = await signInAll(app, ["claire", "paul", "helene", "marc", "koffi", "diallo"]);
  });

  afterAll(async () => {
    await app.close();
    // Les suites suivantes retrouvent les appels et les conversations du seed.
    execSync("npm run db:seed", {
      cwd: path.join(import.meta.dirname, ".."),
      env: { ...process.env, SEED_RESET_MESSAGES: "1" },
      stdio: "pipe",
    });
  }, 120_000);

  describe("lecture", () => {
    it("P-Video : créneaux libres du relais, demande en cours, appels de tous les filleuls", async () => {
      const res = await get("claire", `/api/parrain/calls?filleul=${AICHA}`).expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const data = parrainCallsSchema.parse(res.body);
      expect(data.relaisName).toBe("M. Koffi");
      expect(data.slots.map((slot) => slot.id)).toEqual([SLOT("18"), SLOT("21")]);
      expect(data.request).toMatchObject({
        requestId: AICHA_REQUEST,
        status: "REQUESTED",
        childFirstName: "Aïcha",
        durationMinutes: 15,
        slot: { id: SLOT("14") },
        proposedSlots: [],
        callId: null,
      });
      expect(data.upcoming.map((call) => [call.id, call.childFirstName])).toEqual([
        [KOFI_CALL, "Kofi"],
      ]);
      expect(data.past.map((call) => [call.childFirstName, call.minutes])).toEqual([
        ["Aïcha", 22],
        ["Kofi", 15],
      ]);
    });

    it("un co-parrain ne voit pas les appels de l'autre parrain", async () => {
      const data = await overview("paul", KOFI);
      expect(data.request).toBeNull();
      expect(data.upcoming).toEqual([]);
      expect(data.past).toEqual([]);
    });

    it("un enfant hors des binômes du parrain : 404", async () => {
      await get("marc", `/api/parrain/calls?filleul=${AICHA}`).expect(404);
      await get("claire", `/api/parrain/calls?filleul=${YAO}`).expect(404);
      await get("koffi", `/api/parrain/calls?filleul=${AICHA}`).expect(403);
    });

    it("la demande apparaît dans la conversation, l'accueil du relais et la carte de Main", async () => {
      const page = messagePageSchema.parse(
        (
          await get("koffi", "/api/conversations/seed-conversation-claire-koffi/messages").expect(
            200,
          )
        ).body,
      );
      expect(page.items.find((m) => m.kind === "CALL_REQUEST")?.call).toMatchObject({
        requestId: AICHA_REQUEST,
        status: "REQUESTED",
      });

      const home = relaisHomeSchema.parse(
        (await get("koffi", "/api/relais/home").expect(200)).body,
      );
      expect(home.callRequests).toEqual([
        {
          id: AICHA_REQUEST,
          parrainName: "Claire M.",
          childName: "Aïcha S.",
          conversationId: "seed-conversation-claire-koffi",
        },
      ]);

      const aicha = filleulDashboardSchema.parse(
        (await get("claire", `/api/parrain/filleuls/${AICHA}`).expect(200)).body,
      );
      expect(aicha.nextCall).toMatchObject({ state: "requested", relaisName: "M. Koffi" });
      const kofi = filleulDashboardSchema.parse(
        (await get("claire", `/api/parrain/filleuls/${KOFI}`).expect(200)).body,
      );
      expect(kofi.nextCall).toMatchObject({ state: "confirmed", callId: KOFI_CALL });
    });

    it("le relais voit ses créneaux, avec le binôme de ceux qui sont pris", async () => {
      const data = relaisCallsSchema.parse(
        (await get("koffi", "/api/relais/calls").expect(200)).body,
      );
      expect(data.requests.map((r) => [r.requestId, r.parrainName, r.childName])).toEqual([
        [AICHA_REQUEST, "Claire M.", "Aïcha S."],
      ]);
      expect(data.slots.map((slot) => [slot.id, slot.status, slot.heldFor])).toEqual([
        [SLOT("5"), "BOOKED", "Claire M. ↔ Kofi A."],
        [SLOT("14"), "HELD", "Claire M. ↔ Aïcha S."],
        [SLOT("18"), "OPEN", null],
        [SLOT("21"), "OPEN", null],
      ]);
      await get("claire", "/api/relais/calls").expect(403);
    });
  });

  describe("réponses du relais", () => {
    it("un autre relais ne répond pas aux demandes de M. Koffi", async () => {
      await post("diallo", `/api/relais/calls/requests/${AICHA_REQUEST}/confirm`).expect(404);
      await post("diallo", `/api/relais/calls/requests/${AICHA_REQUEST}/propose`, {
        slotIds: [SLOT("18")],
      }).expect(404);
    });

    it("confirmer : l'appel est créé, annoncé dans la conversation, l'agenda part par e-mail", async () => {
      const knownClaire = await messageIds(ACCOUNTS.claire);
      const res = await post("koffi", `/api/relais/calls/requests/${AICHA_REQUEST}/confirm`).expect(
        200,
      );
      const card = callCardSchema.parse(res.body);
      expect(card).toMatchObject({ status: "CONFIRMED", slot: { id: SLOT("14") } });
      expect(await slotStatus(SLOT("14"))).toBe("BOOKED");
      const call = await prisma.videoCall.findUniqueOrThrow({ where: { id: card.callId! } });
      expect(call.roomName).toMatch(/^lrt-[0-9a-f]{32}$/);
      expect(call.durationMinutes).toBe(15);

      const mail = await waitForNewMessage(ACCOUNTS.claire, knownClaire);
      expect(mail.subject).toBe("Appel vidéo confirmé");
      expect(mail.attachments).toEqual(["appel-video.ics"]);
      expect(`${mail.text}${mail.html}`).not.toMatch(/Aïcha|Aicha/);

      const page = messagePageSchema.parse(
        (await get("claire", "/api/conversations/seed-conversation-claire-koffi/messages")).body,
      );
      expect(page.items.at(-1)).toMatchObject({
        kind: "SYSTEM",
        call: { status: "CONFIRMED", callId: card.callId },
      });

      await post("koffi", `/api/relais/calls/requests/${AICHA_REQUEST}/confirm`).expect(409);
      const data = await overview("claire", AICHA);
      expect(data.request).toBeNull();
      expect(data.upcoming.map((c) => c.id)).toContain(card.callId);

      // Fichier agenda : pour les participants seulement, sans le prénom de l'enfant.
      const ics = await get("claire", `/api/calls/${card.callId}/ics`).expect(200);
      expect(ics.headers["content-type"]).toMatch(/^text\/calendar/);
      expect(ics.headers["content-disposition"]).toContain("appel-video.ics");
      expect(ics.text).toContain("DTSTART:");
      expect(ics.text).not.toMatch(/Aïcha|Aicha/);
      await get("koffi", `/api/calls/${card.callId}/ics`).expect(200);
      await get("paul", `/api/calls/${card.callId}/ics`).expect(404);
      await get("diallo", `/api/calls/${card.callId}/ics`).expect(404);

      // Un appel est prévu : pas de nouvelle demande pour ce binôme.
      const again = await post("claire", "/api/parrain/calls/requests", {
        childId: AICHA,
        slotId: SLOT("18"),
        durationMinutes: 15,
      }).expect(409);
      expect((again.body as { message: string }).message).toBe(
        "Un appel avec Aïcha est déjà prévu",
      );
    });

    it("proposer d'autres créneaux, puis le parrain en choisit un", async () => {
      const knownKoffi = await messageIds(ACCOUNTS.koffi);
      const created = await post("helene", "/api/parrain/calls/requests", {
        childId: MARIAM,
        slotId: SLOT("18"),
        durationMinutes: 30,
        note: "Mariam pourrait-elle me montrer son jardin ?",
      }).expect(201);
      const requestId = callCardSchema.parse(created.body).requestId;
      expect(await slotStatus(SLOT("18"))).toBe("HELD");
      const mail = await waitForNewMessage(ACCOUNTS.koffi, knownKoffi);
      expect(mail.subject).toBe("Une demande d'appel vidéo");
      expect(mail.text).toMatch(/\/relais\/messages\/\S+/);
      expect(`${mail.text}${mail.html}`).not.toMatch(/jardin|Mariam/);

      const twice = await post("helene", "/api/parrain/calls/requests", {
        childId: MARIAM,
        slotId: SLOT("21"),
        durationMinutes: 15,
      }).expect(409);
      expect((twice.body as { message: string }).message).toBe(
        "Une demande d'appel avec Mariam est déjà en cours",
      );

      const extra = await addSlot(25 * 24 * 60);
      const knownHelene = await messageIds(ACCOUNTS.helene);
      const proposed = callCardSchema.parse(
        (
          await post("koffi", `/api/relais/calls/requests/${requestId}/propose`, {
            slotIds: [SLOT("21"), extra],
          }).expect(200)
        ).body,
      );
      expect(proposed.status).toBe("SLOTS_PROPOSED");
      expect(proposed.proposedSlots.map((slot) => slot.id)).toEqual([SLOT("21"), extra]);
      expect(await slotStatus(SLOT("18"))).toBe("OPEN");
      expect((await waitForNewMessage(ACCOUNTS.helene, knownHelene)).subject).toBe(
        "Choisissez un créneau pour votre appel vidéo",
      );

      // Un créneau qui n'a pas été proposé est refusé.
      await post("helene", `/api/parrain/calls/requests/${requestId}/choose`, {
        slotId: SLOT("18"),
      }).expect(409);
      await post("claire", `/api/parrain/calls/requests/${requestId}/choose`, {
        slotId: extra,
      }).expect(404);
      const chosen = callCardSchema.parse(
        (
          await post("helene", `/api/parrain/calls/requests/${requestId}/choose`, {
            slotId: extra,
          }).expect(200)
        ).body,
      );
      expect(chosen).toMatchObject({ status: "CONFIRMED", slot: { id: extra } });
      expect(await slotStatus(SLOT("21"))).toBe("OPEN");
      expect(await slotStatus(extra)).toBe("BOOKED");

      const conversation = await prisma.callRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: { conversationId: true },
      });
      const kinds = await prisma.message.findMany({
        where: { conversationId: conversation.conversationId!, callRequestId: requestId },
        orderBy: { createdAt: "asc" },
        select: { kind: true },
      });
      expect(kinds.map((m) => m.kind)).toEqual(["CALL_REQUEST", "CALL_SLOTS", "SYSTEM"]);
    });

    it("deux confirmations simultanées : une seule passe", async () => {
      const created = await post("marc", "/api/parrain/calls/requests", {
        childId: YAO,
        slotId: SLOT("21"),
        durationMinutes: 15,
      }).expect(201);
      const requestId = callCardSchema.parse(created.body).requestId;
      const statuses = await Promise.all([
        post("koffi", `/api/relais/calls/requests/${requestId}/confirm`),
        post("koffi", `/api/relais/calls/requests/${requestId}/confirm`),
      ]);
      expect(statuses.map((res) => res.status).sort()).toEqual([200, 409]);
      expect(await prisma.videoCall.count({ where: { requestId } })).toBe(1);
    });

    it("le parrain annule sa demande : le créneau redevient libre", async () => {
      const slotId = await addSlot(26 * 24 * 60);
      const created = await post("paul", "/api/parrain/calls/requests", {
        childId: KOFI,
        slotId,
        durationMinutes: 15,
      }).expect(201);
      const requestId = callCardSchema.parse(created.body).requestId;
      await post("claire", `/api/parrain/calls/requests/${requestId}/cancel`).expect(404);
      const cancelled = callCardSchema.parse(
        (await post("paul", `/api/parrain/calls/requests/${requestId}/cancel`).expect(200)).body,
      );
      expect(cancelled.status).toBe("CANCELLED");
      expect(await slotStatus(slotId)).toBe("OPEN");
      await post("paul", `/api/parrain/calls/requests/${requestId}/cancel`).expect(409);
    });

    it("créneaux : à venir seulement, et seuls les libres se retirent", async () => {
      await post("koffi", "/api/relais/calls/slots", {
        startsAt: [new Date(now().getTime() - 60_000).toISOString()],
      }).expect(422);
      await post("koffi", "/api/relais/calls/slots", {
        startsAt: ["2030-01-01T10:00:00Z", "2030-01-01T10:00:00Z"],
      }).expect(400);
      await del("koffi", `/api/relais/calls/slots/${SLOT("14")}`).expect(409);
      await del("diallo", `/api/relais/calls/slots/${SLOT("21")}`).expect(409);
      const slotId = await addSlot(27 * 24 * 60);
      await del("koffi", `/api/relais/calls/slots/${slotId}`).expect(204);
      expect(await prisma.callSlot.count({ where: { id: slotId } })).toBe(0);
    });
  });

  describe("salle", () => {
    it("ouvre 10 minutes avant, et le parrain n'entre qu'après le relais", async () => {
      const slotId = await addSlot(5);
      const created = await post("paul", "/api/parrain/calls/requests", {
        childId: KOFI,
        slotId,
        durationMinutes: 15,
      }).expect(201);
      const card = callCardSchema.parse(
        (
          await post(
            "koffi",
            `/api/relais/calls/requests/${callCardSchema.parse(created.body).requestId}/confirm`,
          ).expect(200)
        ).body,
      );
      const callId = card.callId!;

      const waiting = visioRoomSchema.parse(
        (await get("paul", `/api/visio/${callId}`).expect(200)).body,
      );
      expect(waiting).toMatchObject({ role: "parrain", state: "waiting" });
      const refused = await post("paul", `/api/visio/${callId}/token`).expect(409);
      expect((refused.body as { message: string }).message).toMatch(/pas encore arrivé/);

      expect(
        visioRoomSchema.parse((await get("koffi", `/api/visio/${callId}`).expect(200)).body).state,
      ).toBe("open");
      const relais = visioAccessSchema.parse(
        (await post("koffi", `/api/visio/${callId}/token`).expect(200)).body,
      );
      expect(relais).toEqual({
        provider: "link",
        url: expect.stringMatching(/^https:\/\/meet\.jit\.si\/lrt-[0-9a-f]{32}$/),
      });
      const parrain = visioAccessSchema.parse(
        (await post("paul", `/api/visio/${callId}/token`).expect(200)).body,
      );
      expect(parrain).toEqual(relais);
      const stored = await prisma.videoCall.findUniqueOrThrow({ where: { id: callId } });
      expect(stored.joinedRelaisAt).not.toBeNull();
      expect(stored.joinedParrainAt).not.toBeNull();

      // L'autre parrain de Kofi et un autre relais n'ont pas accès à cette salle.
      await get("claire", `/api/visio/${callId}`).expect(404);
      await post("claire", `/api/visio/${callId}/token`).expect(404);
      await get("diallo", `/api/visio/${callId}`).expect(404);

      await post("koffi", `/api/visio/${callId}/events`, { type: "left" }).expect(204);
      expect(
        (await prisma.videoCall.findUniqueOrThrow({ where: { id: callId } })).endedAt,
      ).not.toBeNull();
      await post("koffi", `/api/visio/${callId}/events`, { type: "parti" }).expect(400);
    });

    it("refuse le jeton avant l'ouverture et après la fermeture", async () => {
      expect(
        visioRoomSchema.parse((await get("claire", `/api/visio/${KOFI_CALL}`).expect(200)).body)
          .state,
      ).toBe("early");
      const early = await post("koffi", `/api/visio/${KOFI_CALL}/token`).expect(409);
      expect((early.body as { message: string }).message).toBe("La salle n'est pas encore ouverte");
      expect(
        visioRoomSchema.parse(
          (await get("claire", "/api/visio/seed-video-call-aicha-juin").expect(200)).body,
        ).state,
      ).toBe("closed");
      await post("claire", "/api/visio/seed-video-call-aicha-juin/token").expect(409);
      await get("marc", `/api/visio/${KOFI_CALL}`).expect(404);
    });
  });
});
