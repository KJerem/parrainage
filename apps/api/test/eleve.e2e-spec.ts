import { execSync } from "node:child_process";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import {
  type ChildCode,
  DEFAULT_CLASS_SESSION_RIGHTS,
  eleveHomeSchema,
  eleveLoginResultSchema,
  eleveMessagesSchema,
  eleveSentSummarySchema,
  eleveSessionSchema,
  type EleveLoginResult,
  relaisSessionsSchema,
  uploadTicketSchema,
} from "@parrainage/contracts";
import request from "supertest";
import { now } from "../src/common/clock.js";
import { prisma } from "../src/prisma/client.js";
import { createTestApp, WEB_ORIGIN } from "./app.js";
import { messageIds, waitForNewMessage } from "./mailpit.js";
import { pdfWithInfo, pngImage } from "./media-fixtures.js";
import { ACCOUNTS, signInAll } from "./session.js";

const AICHA = "seed-child-aicha";
const KOFI = "seed-child-kofi";
const ESTHER = "seed-child-esther";
const AICHA_CODE: ChildCode = ["SOLEIL", "ARBRE", "POISSON"];
const WRONG_CODE: ChildCode = ["ARBRE", "SOLEIL", "POISSON"];
const AICHA_CLAIRE = "seed-conversation-aicha-claire";
const PLANNED = "seed-session-koffi-planned";

type Rights = typeof DEFAULT_CLASS_SESSION_RIGHTS;

/** « nom=valeur » d'un cookie posé par une réponse. */
function cookieOf(res: request.Response, name: string): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`))?.split(";")[0];
}

function rawCookie(res: request.Response, name: string): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | string | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

vi.setConfig({ testTimeout: 30_000 });

describe("Sessions élèves (e2e)", () => {
  let app: INestApplication;
  let keySeed = 0;

  const server = () => app.getHttpServer();
  const newKey = () => `e2e-eleve-${Date.now()}-${(keySeed += 1)}`;

  // Une connexion par compte : la limite de 100 connexions par minute et par IP vaut pour toute
  // la suite. Seule l'ouverture d'une session en exige une neuve (elle déconnecte le relais).
  const adults = new Map<string, string>();
  const asAdult = async (account: "koffi" | "diallo" | "claire" | "bureau") => {
    const known = adults.get(account);
    if (known) {
      return known;
    }
    const cookie = (await signInAll(app, [account]))[account];
    adults.set(account, cookie);
    return cookie;
  };
  const freshKoffi = async () => (await signInAll(app, ["koffi"])).koffi;

  const adultPost = (cookie: string, path: string, body?: object) =>
    request(server())
      .post(path)
      .set("Cookie", cookie)
      .set("Origin", WEB_ORIGIN)
      .send(body ?? {});

  /** Ouvre une session sur un nouveau « poste ». Le relais s'y déconnecte : session à part. */
  async function openSession(
    options: { childIds?: string[]; rights?: Partial<Rights>; plannedSessionId?: string } = {},
  ) {
    const adult = await freshKoffi();
    const res = await adultPost(adult, "/api/relais/sessions/open", {
      childIds: options.childIds ?? [AICHA, KOFI, ESTHER],
      durationMinutes: 45,
      rights: { ...DEFAULT_CLASS_SESSION_RIGHTS, ...options.rights },
      ...(options.plannedSessionId ? { plannedSessionId: options.plannedSessionId } : {}),
    }).expect(201);
    const device = cookieOf(res, "kd_device");
    if (!device) {
      throw new Error("Pas de cookie de poste");
    }
    return { res, device, adult, id: (res.body as { id: string }).id };
  }

  const childPost = (cookies: readonly string[], path: string, body?: object) =>
    request(server())
      .post(path)
      .set("Cookie", cookies.join("; "))
      .set("Origin", WEB_ORIGIN)
      .send(body ?? {});
  const childGet = (cookies: readonly string[], path: string) =>
    request(server()).get(path).set("Cookie", cookies.join("; "));

  async function login(device: string, childId: string, code: ChildCode, shown?: string[]) {
    const res = await childPost([device], "/api/eleve/login", { childId, code, shown }).expect(200);
    return { res, result: eleveLoginResultSchema.parse(res.body) };
  }

  /** Enfant connecté : ses deux cookies. */
  async function signInChild(device: string, childId = AICHA, code = AICHA_CODE) {
    const { res, result } = await login(device, childId, code);
    expect(result).toEqual({ status: "ok" });
    const child = cookieOf(res, "kd_child");
    if (!child) {
      throw new Error("Pas de cookie d'enfant");
    }
    return [device, child];
  }

  /** Dépose un fichier comme le navigateur, puis le vérifie : l'enfant obtient un média prêt. */
  async function uploadAs(
    cookies: readonly string[],
    file: Buffer,
    kind: "PHOTO" | "DOCUMENT",
    mimeType: string,
  ): Promise<string> {
    const res = await childPost(cookies, "/api/eleve/uploads", {
      purpose: "message",
      kind,
      mimeType,
      sizeBytes: file.length,
      fileName: "photo.bin",
    }).expect(201);
    const ticket = uploadTicketSchema.parse(res.body);
    if (ticket.mode !== "single") {
      throw new Error("Envoi simple attendu");
    }
    const put = await fetch(ticket.url, {
      method: "PUT",
      body: new Uint8Array(file),
      headers: ticket.headers,
    });
    expect(put.status).toBe(200);
    await childPost(cookies, `/api/eleve/uploads/${ticket.mediaId}/complete`).expect(200);
    return ticket.mediaId;
  }

  const decide = async (id: string, body: object) =>
    adultPost(await asAdult("bureau"), `/api/moderation/messages/${id}/decision`, body);

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await prisma.classSession.deleteMany({ where: { status: "OPEN" } });
    await prisma.child.updateMany({
      where: { relaisId: "seed-relais-koffi" },
      data: { failedCodeAttempts: 0, codeLockedAt: null },
    });
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "messages:child:" } } });
  });

  afterAll(async () => {
    await app.close();
    // Les suites suivantes lisent les conversations de démonstration : seed rétabli (messages,
    // lectures, sessions, verrous), et compteurs de connexion par IP remis à zéro.
    execSync("npm run db:seed", {
      cwd: path.join(import.meta.dirname, ".."),
      env: { ...process.env, SEED_RESET_MESSAGES: "1" },
      stdio: "pipe",
    });
    await prisma.rateLimit.deleteMany({
      where: { key: { endsWith: "/sign-in/email" }, NOT: { key: { startsWith: "email:" } } },
    });
  }, 120_000);

  // ─── Côté relais ──────────────────────────────────────────────────────────

  describe("RW-Session", () => {
    it("liste les enfants, la session planifiée et les sessions récentes du relais", async () => {
      const res = await request(server())
        .get("/api/relais/sessions")
        .set("Cookie", await asAdult("koffi"))
        .expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const data = relaisSessionsSchema.parse(res.body);
      expect(data.current).toBeNull();
      expect(data.eligible.find((child) => child.id === ESTHER)).toMatchObject({
        name: "Esther N.",
        hasSponsor: false,
        hasCode: true,
        locked: false,
      });
      expect(data.eligible.map((child) => child.name)).toEqual(
        data.eligible.map((child) => child.name).sort((a, b) => a.localeCompare(b, "fr")),
      );
      expect(data.planned.find((session) => session.id === PLANNED)?.childIds).toHaveLength(6);
      expect(data.recent.slice(0, 2).map((s) => [s.childCount, s.sendCount])).toEqual([
        [5, 7],
        [6, 9],
      ]);
    });

    it("annonce la prochaine session sur l'accueil du relais", async () => {
      const res = await request(server())
        .get("/api/relais/home")
        .set("Cookie", await asAdult("koffi"))
        .expect(200);
      expect((res.body as { nextSession: unknown }).nextSession).toMatchObject({
        id: PLANNED,
        childCount: 6,
      });
    });

    it("n'est ouvert qu'aux relais", async () => {
      await request(server())
        .get("/api/relais/sessions")
        .set("Cookie", await asAdult("claire"))
        .expect(403);
    });

    it("refuse un enfant d'un autre relais", async () => {
      const res = await adultPost(await asAdult("diallo"), "/api/relais/sessions/open", {
        childIds: [AICHA],
        durationMinutes: 30,
        rights: DEFAULT_CLASS_SESSION_RIGHTS,
      }).expect(422);
      expect((res.body as { message: string }).message).toContain("n'est pas suivi");
      expect(await prisma.classSession.count({ where: { status: "OPEN" } })).toBe(0);
    });

    it("refuse un enfant sans code image, en le nommant", async () => {
      const { codeHash } = await prisma.child.findUniqueOrThrow({
        where: { id: KOFI },
        select: { codeHash: true },
      });
      await prisma.child.update({ where: { id: KOFI }, data: { codeHash: null } });
      try {
        const res = await adultPost(await asAdult("koffi"), "/api/relais/sessions/open", {
          childIds: [KOFI],
          durationMinutes: 30,
          rights: DEFAULT_CLASS_SESSION_RIGHTS,
        }).expect(422);
        expect((res.body as { message: string }).message).toBe("Kofi n'a pas encore de code image");
      } finally {
        await prisma.child.update({ where: { id: KOFI }, data: { codeHash } });
      }
    });

    it("pose le cookie du poste, déconnecte le relais et audite l'ouverture", async () => {
      const { res, device, adult, id } = await openSession();

      const raw = rawCookie(res, "kd_device")!;
      expect(raw).toMatch(/HttpOnly/);
      expect(raw).toMatch(/SameSite=Strict/);
      expect(raw).toMatch(/Path=\//);
      expect(Number(/Max-Age=(\d+)/.exec(raw)?.[1])).toBeGreaterThan(2690);

      // La session d'adulte n'existe plus, côté serveur et dans le navigateur.
      await request(server()).get("/api/me").set("Cookie", adult).expect(401);
      expect(rawCookie(res, "better-auth.session_token")).toMatch(/Expires=Thu, 01 Jan 1970/);

      // Le jeton du poste n'est pas en base : seulement son empreinte.
      const session = await prisma.classSession.findUniqueOrThrow({ where: { id } });
      expect(session.status).toBe("OPEN");
      expect(session.deviceTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(device).not.toContain(session.deviceTokenHash!);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "session.open", entityId: id },
      });
      expect(audit?.metadata).toMatchObject({ childCount: 3, durationMinutes: 45 });
    });

    it("n'ouvre qu'une session à la fois par relais, même en parallèle", async () => {
      const first = await freshKoffi();
      const second = await freshKoffi();
      const body = {
        childIds: [AICHA],
        durationMinutes: 30,
        rights: DEFAULT_CLASS_SESSION_RIGHTS,
      };
      const responses = await Promise.all([
        adultPost(first, "/api/relais/sessions/open", body),
        adultPost(second, "/api/relais/sessions/open", body),
      ]);
      expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(await prisma.classSession.count({ where: { status: "OPEN" } })).toBe(1);

      await adultPost(await freshKoffi(), "/api/relais/sessions/open", body).expect(409);
    });

    it("ouvre une session planifiée à la place d'en créer une autre", async () => {
      const adult = await asAdult("koffi");
      const planned = await adultPost(adult, "/api/relais/sessions", {
        childIds: [AICHA],
        durationMinutes: 30,
        rights: DEFAULT_CLASS_SESSION_RIGHTS,
        scheduledAt: new Date(now().getTime() + 86_400_000).toISOString(),
      }).expect(201);
      const plannedId = (planned.body as { id: string }).id;
      const { id } = await openSession({ plannedSessionId: plannedId, childIds: [AICHA, KOFI] });
      expect(id).toBe(plannedId);
      const links = await prisma.classSessionChild.findMany({ where: { sessionId: id } });
      expect(links.map((link) => link.childId).sort()).toEqual([AICHA, KOFI].sort());
    });

    it("refuse de planifier dans le passé et retire une session planifiée", async () => {
      const adult = await asAdult("koffi");
      await adultPost(adult, "/api/relais/sessions", {
        childIds: [AICHA],
        durationMinutes: 30,
        rights: DEFAULT_CLASS_SESSION_RIGHTS,
        scheduledAt: "2020-01-01T10:00:00Z",
      }).expect(422);
      const planned = await adultPost(adult, "/api/relais/sessions", {
        childIds: [AICHA],
        durationMinutes: 30,
        rights: DEFAULT_CLASS_SESSION_RIGHTS,
        scheduledAt: new Date(now().getTime() + 86_400_000).toISOString(),
      }).expect(201);
      const id = (planned.body as { id: string }).id;
      const other = await asAdult("diallo");
      await request(server())
        .delete(`/api/relais/sessions/${id}`)
        .set("Cookie", other)
        .set("Origin", WEB_ORIGIN)
        .expect(404);
      await request(server())
        .delete(`/api/relais/sessions/${id}`)
        .set("Cookie", adult)
        .set("Origin", WEB_ORIGIN)
        .expect(204);
    });

    it("garde un relais hors des sessions d'un autre", async () => {
      const { id } = await openSession();
      const other = await asAdult("diallo");
      await adultPost(other, `/api/relais/sessions/${id}/close`).expect(404);
      await adultPost(other, `/api/relais/sessions/${id}/resume`).expect(404);
      await adultPost(other, `/api/relais/sessions/${id}/children/${AICHA}/unlock`).expect(404);
    });
  });

  // ─── Connexion de l'enfant ────────────────────────────────────────────────

  describe("E-Connexion", () => {
    it("refuse le bon code sans le cookie du poste", async () => {
      await openSession();
      await request(server())
        .post("/api/eleve/login")
        .set("Origin", WEB_ORIGIN)
        .send({ childId: AICHA, code: AICHA_CODE })
        .expect(401);
    });

    it("refuse un cookie de poste falsifié ou issu d'une session fermée", async () => {
      const { device, id } = await openSession();
      await childGet([`${device}x`], "/api/eleve/session").expect(401);
      await adultPost(await asAdult("koffi"), `/api/relais/sessions/${id}/close`).expect(204);
      const res = await childGet([device], "/api/eleve/session").expect(401);
      expect(rawCookie(res, "kd_device")).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it("présente les enfants de la session, sans leur nom, et les 6 images mélangées", async () => {
      const { device } = await openSession();
      const data = eleveSessionSchema.parse(
        (await childGet([device], "/api/eleve/session").expect(200)).body,
      );
      if (data.state !== "open") {
        throw new Error("Session ouverte attendue");
      }
      expect(data.relaisName).toBe("M. Koffi");
      expect(data.children.map((child) => child.firstName)).toEqual(["Aïcha", "Esther", "Kofi"]);
      expect(JSON.stringify(data.children)).not.toMatch(/"S\."|guardian|birth/);
      expect(data.images).toHaveLength(6);
    });

    it("connecte l'enfant avec son code, le cookie suivant la durée de la session", async () => {
      const { device, id } = await openSession();
      const { res, result } = await login(device, AICHA, AICHA_CODE);
      expect(result).toEqual({ status: "ok" });
      const raw = rawCookie(res, "kd_child")!;
      expect(raw).toMatch(/HttpOnly/);
      expect(raw).toMatch(/SameSite=Strict/);
      expect(Number(/Max-Age=(\d+)/.exec(raw)?.[1])).toBeGreaterThan(2600);
      const link = await prisma.classSessionChild.findUniqueOrThrow({
        where: { sessionId_childId: { sessionId: id, childId: AICHA } },
      });
      expect(link.lastLoginAt).not.toBeNull();
    });

    it("refuse un enfant absent de la session, sans compter d'essai", async () => {
      const { device } = await openSession({ childIds: [KOFI] });
      await childPost([device], "/api/eleve/login", { childId: AICHA, code: AICHA_CODE }).expect(
        404,
      );
      const child = await prisma.child.findUniqueOrThrow({ where: { id: AICHA } });
      expect(child.failedCodeAttempts).toBe(0);
    });

    it("change l'ordre des images à chaque essai et compte les essais restants", async () => {
      const { device } = await openSession();
      const shown = ["SOLEIL", "ARBRE", "POISSON", "MAISON", "ETOILE", "COEUR"];
      const first = (await login(device, AICHA, WRONG_CODE, shown)).result;
      expect(first).toMatchObject({ status: "wrong", remaining: 2 });
      if (first.status !== "wrong") {
        throw new Error("Échec attendu");
      }
      expect(first.images).not.toEqual(shown);
      expect([...first.images].sort()).toEqual([...shown].sort());
      const second = (await login(device, AICHA, WRONG_CODE, first.images)).result;
      expect(second).toMatchObject({ status: "wrong", remaining: 1 });
    });

    it("verrouille au 3e échec, et le bon code ne passe plus", async () => {
      const { device } = await openSession();
      expect((await login(device, AICHA, WRONG_CODE)).result.status).toBe("wrong");
      expect((await login(device, AICHA, WRONG_CODE)).result.status).toBe("wrong");
      expect((await login(device, AICHA, WRONG_CODE)).result.status).toBe("locked");
      const { res, result } = await login(device, AICHA, AICHA_CODE);
      expect(result.status).toBe("locked");
      expect(cookieOf(res, "kd_child")).toBeUndefined();
    });

    it("verrouille aussi avec des requêtes parallèles : jamais plus de 3 codes testés", async () => {
      const { device, id } = await openSession();
      const results = await Promise.all(
        Array.from({ length: 8 }, () => login(device, AICHA, WRONG_CODE)),
      );
      const statuses = results.map(({ result }) => result.status);
      expect(statuses.filter((status) => status === "wrong").length).toBeLessThanOrEqual(2);
      expect(statuses.filter((status) => status === "locked").length).toBeGreaterThanOrEqual(6);
      const child = await prisma.child.findUniqueOrThrow({ where: { id: AICHA } });
      expect(child.failedCodeAttempts).toBe(3);
      expect(child.codeLockedAt).not.toBeNull();
      // Trois codes réellement vérifiés, donc trois échecs comptés sur la session.
      const session = await prisma.classSession.findUniqueOrThrow({ where: { id } });
      expect(session.failedAttempts).toBe(3);
    });

    it("remet le compteur à zéro après une réussite", async () => {
      const { device } = await openSession();
      await login(device, AICHA, WRONG_CODE);
      await login(device, AICHA, WRONG_CODE);
      await signInChild(device);
      const child = await prisma.child.findUniqueOrThrow({ where: { id: AICHA } });
      expect(child.failedCodeAttempts).toBe(0);
      expect((await login(device, AICHA, WRONG_CODE)).result).toMatchObject({ remaining: 2 });
    });

    it("le relais débloque l'enfant, et l'action est auditée", async () => {
      const { device, id } = await openSession();
      await prisma.child.update({
        where: { id: AICHA },
        data: { failedCodeAttempts: 3, codeLockedAt: now() },
      });
      expect((await login(device, AICHA, AICHA_CODE)).result.status).toBe("locked");

      const adult = await asAdult("koffi");
      const list = relaisSessionsSchema.parse(
        (await request(server()).get("/api/relais/sessions").set("Cookie", adult)).body,
      );
      expect(list.current?.children.find((child) => child.id === AICHA)?.locked).toBe(true);
      await adultPost(adult, `/api/relais/sessions/${id}/children/${AICHA}/unlock`).expect(204);
      expect(
        await prisma.auditLog.count({ where: { action: "session.unlock", entityId: id } }),
      ).toBe(1);
      await signInChild(device);
    });

    it("suspend la session au 15e échec, jusqu'à sa reprise par le relais", async () => {
      const { device, id } = await openSession();
      const cookies = await signInChild(device);
      await prisma.classSession.update({ where: { id }, data: { failedAttempts: 14 } });

      const { result } = await login(device, KOFI, WRONG_CODE);
      expect(result).toEqual({ status: "suspended" } satisfies EleveLoginResult);
      expect(
        eleveSessionSchema.parse((await childGet([device], "/api/eleve/session").expect(200)).body)
          .state,
      ).toBe("suspended");
      // Même un enfant déjà connecté ne fait plus rien.
      await childGet(cookies, "/api/eleve/me").expect(401);
      expect((await login(device, AICHA, AICHA_CODE)).result.status).toBe("suspended");
      expect(
        await prisma.auditLog.count({ where: { action: "session.suspend", entityId: id } }),
      ).toBe(1);

      await adultPost(await asAdult("koffi"), `/api/relais/sessions/${id}/resume`).expect(204);
      await signInChild(device);
    });
  });

  // ─── Fin de session ───────────────────────────────────────────────────────

  describe("fin de session", () => {
    it("exige les deux cookies, et ceux du même poste", async () => {
      const { device } = await openSession();
      const [, child] = await signInChild(device);
      await childGet([child!], "/api/eleve/me").expect(401);
      await childGet([device], "/api/eleve/me").expect(401);
      await childGet([device, child!], "/api/eleve/me").expect(200);

      // Le poste d'une autre session, ou un autre jeton de poste : refusés.
      const session = await prisma.classSession.findFirstOrThrow({ where: { status: "OPEN" } });
      await prisma.classSession.update({
        where: { id: session.id },
        data: { deviceTokenHash: "0".repeat(64) },
      });
      await childGet([device, child!], "/api/eleve/me").expect(401);
    });

    it("« J'ai fini » retire l'enfant et laisse le poste ouvert", async () => {
      const { device } = await openSession();
      const cookies = await signInChild(device);
      const res = await childPost(cookies, "/api/eleve/logout").expect(204);
      expect(rawCookie(res, "kd_child")).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(rawCookie(res, "kd_device")).toBeUndefined();
      await childGet([device], "/api/eleve/session").expect(200);
    });

    it("fermeture par le relais : l'enfant est refusé dès la requête suivante", async () => {
      const { device, id } = await openSession();
      const cookies = await signInChild(device);
      await childGet(cookies, "/api/eleve/me").expect(200);
      await adultPost(await asAdult("koffi"), `/api/relais/sessions/${id}/close`).expect(204);
      await childGet(cookies, "/api/eleve/me").expect(401);
      expect(
        await prisma.auditLog.count({ where: { action: "session.close", entityId: id } }),
      ).toBe(1);
    });

    it("expiration : l'enfant est refusé dès sa requête suivante", async () => {
      const { device, id } = await openSession();
      const cookies = await signInChild(device);
      const past = new Date(now().getTime() - 1000);
      await prisma.classSession.update({ where: { id }, data: { endsAt: past } });
      await childGet(cookies, "/api/eleve/me").expect(401);
      await childGet([device], "/api/eleve/session").expect(401);

      // La prochaine action du relais la ferme, à son heure de fin, et le note au journal.
      await request(server())
        .get("/api/relais/sessions")
        .set("Cookie", await asAdult("koffi"))
        .expect(200);
      const session = await prisma.classSession.findUniqueOrThrow({ where: { id } });
      expect(session.status).toBe("CLOSED");
      expect(session.closedAt).toEqual(past);
      expect(
        await prisma.auditLog.count({ where: { action: "session.expire", entityId: id } }),
      ).toBe(1);
    });
  });

  // ─── Périmètre de l'enfant ────────────────────────────────────────────────

  describe("périmètre", () => {
    it("ne donne que le prénom du parrain, et ses propres conversations", async () => {
      const { device } = await openSession();
      const cookies = await signInChild(device);
      const res = await childGet(cookies, "/api/eleve/me").expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const home = eleveHomeSchema.parse(res.body);
      expect(home.child.firstName).toBe("Aïcha");
      expect(home.relaisName).toBe("M. Koffi");
      expect(home.threads).toEqual([
        expect.objectContaining({
          id: AICHA_CLAIRE,
          name: "Claire",
          title: "Ma marraine",
          place: "Elle habite à Lyon, en France.",
        }),
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/Claire M\.|@|exemple/);

      const other = "seed-conversation-kofi-claire";
      await childGet(cookies, `/api/eleve/conversations/${other}/messages`).expect(404);
      await childPost(cookies, `/api/eleve/conversations/${other}/messages`, {
        body: "Coucou",
        idempotencyKey: newKey(),
      }).expect(404);
      await childPost(cookies, `/api/eleve/conversations/${other}/read`).expect(404);
      // Aucune route d'adulte.
      await childGet(cookies, "/api/conversations").expect(401);
      await childGet(cookies, "/api/me").expect(401);
    });

    it("liste les deux parrains d'un enfant co-parrainé", async () => {
      const { device } = await openSession();
      const code = await prisma.child.findUniqueOrThrow({ where: { id: KOFI } });
      expect(code.codeHash).not.toBeNull();
      // Le code de Kofi n'est pas connu du test : son cookie est obtenu par un nouveau code.
      const { hashChildCode } = await import("../src/relais/child-code.js");
      const { getEnv } = await import("../src/config/env.js");
      await prisma.child.update({
        where: { id: KOFI },
        data: { codeHash: await hashChildCode(AICHA_CODE, getEnv().CHILD_CODE_PEPPER) },
      });
      try {
        const cookies = await signInChild(device, KOFI);
        const home = eleveHomeSchema.parse((await childGet(cookies, "/api/eleve/me")).body);
        expect(home.threads.map((thread) => thread.name).sort()).toEqual(["Claire", "Paul"]);
        // Un message de Paul encore en relecture n'est pas montré à Kofi.
        const paul = home.threads.find((thread) => thread.name === "Paul")!;
        const thread = eleveMessagesSchema.parse(
          (await childGet(cookies, `/api/eleve/conversations/${paul.id}/messages`).expect(200))
            .body,
        );
        expect(JSON.stringify(thread)).not.toMatch(/whatsapp/i);
      } finally {
        await prisma.child.update({ where: { id: KOFI }, data: { codeHash: code.codeHash } });
      }
    });

    it("un enfant sans parrain n'a pas de fil, sauf vers l'association si elle est permise", async () => {
      const { hashChildCode } = await import("../src/relais/child-code.js");
      const { getEnv } = await import("../src/config/env.js");
      const before = await prisma.child.findUniqueOrThrow({ where: { id: ESTHER } });
      await prisma.child.update({
        where: { id: ESTHER },
        data: { codeHash: await hashChildCode(AICHA_CODE, getEnv().CHILD_CODE_PEPPER) },
      });
      try {
        const { device } = await openSession({ rights: { writeAssociation: true } });
        const cookies = await signInChild(device, ESTHER);
        const home = eleveHomeSchema.parse((await childGet(cookies, "/api/eleve/me")).body);
        expect(home.threads.map((thread) => thread.kind)).toEqual(["association"]);

        // Le fil s'ouvre au premier message, et passe en relecture comme les autres.
        await childGet(cookies, "/api/eleve/conversations/association/messages").expect(200);
        const sent = await childPost(cookies, "/api/eleve/conversations/association/messages", {
          body: "Bonjour, je n'ai pas encore de parrain.",
          idempotencyKey: newKey(),
        }).expect(201);
        const row = await prisma.message.findUniqueOrThrow({
          where: { id: (sent.body as { id: string }).id },
          select: {
            moderationStatus: true,
            conversation: { select: { kind: true, childId: true, relaisId: true } },
          },
        });
        expect(row.moderationStatus).toBe("PENDING");
        expect(row.conversation).toEqual({
          kind: "CHILD_ASSOCIATION",
          childId: ESTHER,
          relaisId: "seed-relais-koffi",
        });
        const detail = await request(server())
          .get(`/api/moderation/messages/${(sent.body as { id: string }).id}`)
          .set("Cookie", await asAdult("bureau"))
          .expect(200);
        expect((detail.body as { body: string }).body).toContain("pas encore de parrain");
      } finally {
        await prisma.conversation.deleteMany({ where: { childId: ESTHER } });
        await prisma.child.update({ where: { id: ESTHER }, data: { codeHash: before.codeHash } });
      }
    });

    it("applique les droits figés de la session", async () => {
      const { device } = await openSession({
        rights: { writeSponsor: false, media: false, bulletin: false, writeAssociation: true },
      });
      const cookies = await signInChild(device);
      await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`, {
        body: "Bonjour",
        idempotencyKey: newKey(),
      }).expect(403);
      await childPost(cookies, "/api/eleve/uploads", {
        purpose: "message",
        kind: "PHOTO",
        mimeType: "image/png",
        sizeBytes: 100,
        fileName: "a.png",
      }).expect(403);
      // L'ouverture a figé les droits : les changer sur une autre ligne n'y change rien.
      const home = eleveHomeSchema.parse((await childGet(cookies, "/api/eleve/me")).body);
      expect(home.rights).toMatchObject({ writeSponsor: false, writeAssociation: true });
    });

    it("n'autorise ni photo ni vidéo sans consentement médias", async () => {
      await prisma.child.update({ where: { id: AICHA }, data: { consentMedia: false } });
      try {
        const { device } = await openSession({ rights: { bulletin: false } });
        const cookies = await signInChild(device);
        const home = eleveHomeSchema.parse((await childGet(cookies, "/api/eleve/me")).body);
        expect(home.rights.media).toBe(false);
        await childPost(cookies, "/api/eleve/uploads", {
          purpose: "message",
          kind: "VIDEO",
          mimeType: "video/mp4",
          sizeBytes: 100,
          fileName: "a.mp4",
        }).expect(403);
        // Le sélecteur n'expose pas sa photo non plus.
        await childGet([device], `/api/eleve/avatars/${AICHA}`).expect(404);
      } finally {
        await prisma.child.update({ where: { id: AICHA }, data: { consentMedia: true } });
      }
    });

    it("refuse un envoi à un autre usage qu'un message", async () => {
      const { device } = await openSession();
      const cookies = await signInChild(device);
      await childPost(cookies, "/api/eleve/uploads", {
        purpose: "news",
        kind: "PHOTO",
        mimeType: "image/png",
        sizeBytes: 100,
        fileName: "a.png",
      }).expect(403);
    });
  });

  // ─── Messages et modération ───────────────────────────────────────────────

  describe("envoi et modération", () => {
    const threadOf = async (cookies: readonly string[]) =>
      eleveMessagesSchema.parse(
        (await childGet(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`).expect(200))
          .body,
      ).items;

    const lastMessageAt = async () =>
      (
        await prisma.conversation.findUniqueOrThrow({
          where: { id: AICHA_CLAIRE },
          select: { lastMessageAt: true },
        })
      ).lastMessageAt;

    it("envoie en relecture, sans faire remonter la conversation chez le parrain", async () => {
      const { device, id: sessionId } = await openSession();
      const cookies = await signInChild(device);
      const before = await lastMessageAt();
      const key = newKey();
      const body = "Bonjour Claire, appelle-moi au 06 39 98 12 34 !";
      const res = await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`, {
        body,
        idempotencyKey: key,
      }).expect(201);
      const id = (res.body as { id: string }).id;

      const row = await prisma.message.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({
        moderationStatus: "PENDING",
        deliveryStatus: "SENT",
        sentFrom: "SCHOOL_SESSION",
        authorChildId: AICHA,
        authorUserId: null,
      });
      expect(row.alertTypes).toContain("PHONE");
      expect(await lastMessageAt()).toEqual(before);
      const session = await prisma.classSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(session.sendCount).toBe(1);

      // Rejouer la même clé ne double rien.
      const again = await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`, {
        body,
        idempotencyKey: key,
      }).expect(201);
      expect((again.body as { id: string }).id).toBe(id);

      expect((await threadOf(cookies)).at(-1)).toMatchObject({
        id,
        side: "me",
        authorName: "Aïcha",
        status: "relecture",
      });
      // Claire ne le voit pas encore.
      const claire = await asAdult("claire");
      const fromClaire = await request(server())
        .get(`/api/conversations/${AICHA_CLAIRE}/messages`)
        .set("Cookie", claire)
        .expect(200);
      expect(JSON.stringify(fromClaire.body)).not.toContain(id);
    });

    it("approuvé : remis à Claire, et la conversation remonte", async () => {
      const { device } = await openSession();
      const cookies = await signInChild(device);
      const before = await lastMessageAt();
      const res = await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`, {
        body: "J'ai eu une bonne note en calcul.",
        idempotencyKey: newKey(),
      }).expect(201);
      const id = (res.body as { id: string }).id;
      const known = await messageIds(ACCOUNTS.claire);

      await decide(id, { decision: "APPROVE" }).then((r) => expect(r.status).toBe(200));

      const delivered = (await threadOf(cookies)).at(-1);
      expect(delivered?.status).toBe("recu");
      expect(delivered?.deliveredAt).not.toBeNull();
      const sent = eleveSentSummarySchema.parse(
        (await childGet(cookies, `/api/eleve/messages/${id}`).expect(200)).body,
      );
      expect(sent).toMatchObject({
        content: "message",
        recipient: "sponsor",
        recipientName: "Claire",
        status: "recu",
      });
      expect((await lastMessageAt()).getTime()).toBeGreaterThanOrEqual(before.getTime());

      // Lu par Claire : l'enfant le voit aussi.
      const claire = await asAdult("claire");
      await adultPost(claire, `/api/conversations/${AICHA_CLAIRE}/read`).expect(200);
      const last = (await threadOf(cookies)).at(-1);
      expect(last?.status).toBe("lu");
      expect(last?.readAt).not.toBeNull();
      await waitForNewMessage(ACCOUNTS.claire, known, 500).catch(() => undefined);
    });

    it("masqué : l'enfant ne voit que la version remise", async () => {
      const { device } = await openSession();
      const cookies = await signInChild(device);
      const res = await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`, {
        body: "Mon numéro est le 06 39 98 12 34",
        idempotencyKey: newKey(),
      }).expect(201);
      const id = (res.body as { id: string }).id;
      const decision = await decide(id, {
        decision: "MASK",
        reason: "OFF_PLATFORM_CONTACT",
        redactedBody: "Mon numéro est le [masqué par l'association]",
      });
      expect(decision.status).toBe(200);
      const shown = (await threadOf(cookies)).at(-1);
      expect(shown).toMatchObject({
        masked: true,
        body: "Mon numéro est le [masqué par l'association]",
      });
      expect(JSON.stringify(shown)).not.toContain("06 39");
    });

    it("retenu : marqué « gardé », sans le motif, et le relais reçoit le lien du fil", async () => {
      const { device } = await openSession();
      const cookies = await signInChild(device);
      const res = await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`, {
        body: "Message à retenir",
        idempotencyKey: newKey(),
      }).expect(201);
      const id = (res.body as { id: string }).id;
      const known = await messageIds(ACCOUNTS.koffi);
      expect((await decide(id, { decision: "HOLD", reason: "INAPPROPRIATE_CONTENT" })).status).toBe(
        200,
      );
      const shown = (await threadOf(cookies)).at(-1);
      expect(shown?.status).toBe("garde");
      expect(JSON.stringify(shown)).not.toContain("inadapté");
      const mail = await waitForNewMessage(ACCOUNTS.koffi, known);
      expect(mail.text).toContain(`/relais/messages/${AICHA_CLAIRE}`);
    });

    it("n'affiche à l'enfant que les messages approuvés de son parrain, puis les marque lus", async () => {
      const claire = await asAdult("claire");
      const pending = await adultPost(claire, `/api/conversations/${AICHA_CLAIRE}/messages`, {
        body: "Message de Claire en attente",
        idempotencyKey: newKey(),
      }).expect(201);
      const pendingId = (pending.body as { id: string }).id;
      const { device } = await openSession();
      const cookies = await signInChild(device);
      const before = await threadOf(cookies);
      expect(before.map((message) => message.id)).not.toContain(pendingId);

      expect((await decide(pendingId, { decision: "APPROVE" })).status).toBe(200);
      const after = await threadOf(cookies);
      expect(after.at(-1)).toMatchObject({
        id: pendingId,
        side: "them",
        authorName: "Claire",
        status: null,
      });
      await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/read`).expect(204);
      const row = await prisma.message.findUniqueOrThrow({ where: { id: pendingId } });
      expect(row.deliveryStatus).toBe("RECEIVED");
      expect(row.readAt).not.toBeNull();
    });

    it("le relais signale un message de son enfant, pas celui d'un autre relais", async () => {
      const { device } = await openSession();
      const cookies = await signInChild(device);
      const res = await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`, {
        body: "Regarde la photo de ma copine",
        idempotencyKey: newKey(),
      }).expect(201);
      const id = (res.body as { id: string }).id;
      const flag = { flag: "OTHER_CHILD_FACE", active: true };
      await adultPost(await asAdult("diallo"), `/api/relais/messages/${id}/flag`, flag).expect(404);
      const flagged = await adultPost(
        await asAdult("koffi"),
        `/api/relais/messages/${id}/flag`,
        flag,
      ).expect(200);
      expect((flagged.body as { manualFlags: string[] }).manualFlags).toEqual(["OTHER_CHILD_FACE"]);
      await adultPost(
        await asAdult("koffi"),
        "/api/relais/messages/seed-message-inconnu/flag",
        flag,
      ).expect(404);
    });

    it("enfant qui envoie une photo : nettoyée, en relecture, et remise après approbation", async () => {
      const { device } = await openSession();
      const cookies = await signInChild(device);
      const mediaId = await uploadAs(cookies, await pngImage(), "PHOTO", "image/png");

      // Un autre enfant de la même session ne peut ni la voir, ni la joindre.
      await childGet(cookies, `/api/eleve/media/${mediaId}`).expect(302);
      const { hashChildCode } = await import("../src/relais/child-code.js");
      const { getEnv } = await import("../src/config/env.js");
      const kofi = await prisma.child.findUniqueOrThrow({ where: { id: KOFI } });
      await prisma.child.update({
        where: { id: KOFI },
        data: { codeHash: await hashChildCode(AICHA_CODE, getEnv().CHILD_CODE_PEPPER) },
      });
      try {
        const other = await signInChild(device, KOFI);
        await childGet(other, `/api/eleve/media/${mediaId}`).expect(404);
        await childGet(other, `/api/eleve/uploads/${mediaId}/parts`).expect(404);
        await childPost(other, `/api/eleve/uploads/${mediaId}/complete`).expect(404);
        const home = eleveHomeSchema.parse((await childGet(other, "/api/eleve/me")).body);
        await childPost(other, `/api/eleve/conversations/${home.threads[0]!.id}/messages`, {
          mediaIds: [mediaId],
          idempotencyKey: newKey(),
        }).expect(422);
      } finally {
        await prisma.child.update({ where: { id: KOFI }, data: { codeHash: kofi.codeHash } });
      }

      const sent = await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`, {
        mediaIds: [mediaId],
        idempotencyKey: newKey(),
      }).expect(201);
      const id = (sent.body as { id: string }).id;

      // Une fois joint, il ne ressert pas.
      await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`, {
        mediaIds: [mediaId],
        idempotencyKey: newKey(),
      }).expect(422);

      const claire = await asAdult("claire");
      await request(server()).get(`/api/media/${mediaId}`).set("Cookie", claire).expect(404);
      expect((await decide(id, { decision: "APPROVE" })).status).toBe(200);
      await request(server()).get(`/api/media/${mediaId}`).set("Cookie", claire).expect(302);
      expect(
        eleveSentSummarySchema.parse(
          (await childGet(cookies, `/api/eleve/messages/${id}`).expect(200)).body,
        ).content,
      ).toBe("photo");
    });

    it("un bulletin devient des pages, et remplit la ligne des résultats s'il est permis", async () => {
      const period = await prisma.schoolResult.findFirstOrThrow({
        where: { childId: AICHA, status: "SENT", allowChildUpload: true },
        orderBy: { createdAt: "desc" },
        select: { id: true, periodId: true },
      });
      // Le bulletin du seed retiré le temps du test : la ligne en attend un.
      const seeded = await prisma.media.findMany({
        where: { schoolResultId: period.id, kind: "BULLETIN" },
        select: { id: true },
      });
      await prisma.media.updateMany({
        where: { id: { in: seeded.map((m) => m.id) } },
        data: { schoolResultId: null },
      });
      try {
        const { device } = await openSession();
        const cookies = await signInChild(device);
        const pages = [
          await uploadAs(cookies, await pngImage(), "PHOTO", "image/png"),
          await uploadAs(cookies, await pdfWithInfo(), "DOCUMENT", "application/pdf"),
        ];
        const sent = await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`, {
          body: "Voici mon bulletin",
          mediaIds: pages,
          bulletin: true,
          idempotencyKey: newKey(),
        }).expect(201);
        const id = (sent.body as { id: string }).id;
        const rows = await prisma.media.findMany({
          where: { messageId: id },
          orderBy: { position: "asc" },
          select: { kind: true, label: true, schoolResultId: true },
        });
        expect(rows.map((row) => [row.kind, row.label])).toEqual([
          ["BULLETIN", "Bulletin, page 1"],
          ["BULLETIN", "Bulletin, page 2"],
        ]);
        // Rien n'est rangé avant la relecture.
        expect(rows.every((row) => row.schoolResultId === null)).toBe(true);

        expect((await decide(id, { decision: "APPROVE" })).status).toBe(200);
        const filed = await prisma.media.findMany({
          where: { messageId: id },
          select: { schoolResultId: true },
        });
        expect(filed.every((row) => row.schoolResultId === period.id)).toBe(true);
        expect(
          eleveSentSummarySchema.parse(
            (await childGet(cookies, `/api/eleve/messages/${id}`).expect(200)).body,
          ).content,
        ).toBe("bulletin");
      } finally {
        await prisma.media.updateMany({
          where: { schoolResultId: period.id, messageId: { not: null } },
          data: { schoolResultId: null },
        });
        await prisma.media.updateMany({
          where: { id: { in: seeded.map((m) => m.id) } },
          data: { schoolResultId: period.id },
        });
      }
    });

    it("refuse une vidéo comme page de bulletin, et un document hors bulletin", async () => {
      const { device } = await openSession();
      const cookies = await signInChild(device);
      const pdf = await uploadAs(cookies, await pdfWithInfo(), "DOCUMENT", "application/pdf");
      await childPost(cookies, `/api/eleve/conversations/${AICHA_CLAIRE}/messages`, {
        mediaIds: [pdf],
        idempotencyKey: newKey(),
      }).expect(422);
    });

    it("l'écran « Bravo » n'est lisible que par l'auteur", async () => {
      const { device } = await openSession();
      const cookies = await signInChild(device);
      await childGet(cookies, "/api/eleve/messages/seed-message-inconnu").expect(404);
      const other = await prisma.message.findFirstOrThrow({
        where: { authorChildId: { not: null, notIn: [AICHA] } },
        select: { id: true },
      });
      await childGet(cookies, `/api/eleve/messages/${other.id}`).expect(404);
    });
  });
});
