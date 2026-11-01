import type { INestApplication } from "@nestjs/common";
import { meSchema } from "@parrainage/contracts";
import request from "supertest";
import { EMAIL_ATTEMPT_RULES, emailAttemptKey } from "../src/auth/attempt-limit.js";
import { prisma } from "../src/prisma/client.js";
import { createTestApp, sessionCookie, WEB_ORIGIN } from "./app.js";
import { messageIds, waitForNewMessage } from "./mailpit.js";

// Base seedée requise (`npm run db:seed`) ; mot de passe de démonstration « motdepasse ».
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "motdepasse";
const CLAIRE = "claire.m@exemple.fr";
const KOFFI = "koffi@relais.exemple.tg";
const BUREAU = "bureau@exemple.fr";
const PARRAIN = "parrain24@exemple.fr";
const AGBEKO = "agbeko@relais.exemple.tg";
const RESET_USER = "parrain25@exemple.fr";
const THROTTLED = "limite.e2e@exemple.fr";
const UNKNOWN = "inconnu.e2e@exemple.fr";
const SIGN_UP = "inscription.e2e@exemple.fr";

describe("Authentification et rôles (e2e)", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  const signIn = (email: string, password = PASSWORD) =>
    http().post("/api/auth/sign-in/email").set("Origin", WEB_ORIGIN).send({ email, password });

  async function cookieFor(email: string): Promise<string> {
    const res = await signIn(email).expect(200);
    const cookie = sessionCookie(res.headers["set-cookie"]);
    if (!cookie) {
      throw new Error(`Pas de cookie de session pour ${email}`);
    }
    return cookie;
  }

  beforeAll(async () => {
    // Les compteurs par e-mail persistent en base : on repart de zéro à chaque exécution.
    const emails = [
      CLAIRE,
      KOFFI,
      BUREAU,
      PARRAIN,
      AGBEKO,
      RESET_USER,
      THROTTLED,
      UNKNOWN,
      SIGN_UP,
    ];
    const keys = emails.flatMap((email) =>
      Object.keys(EMAIL_ATTEMPT_RULES).map((path) => emailAttemptKey(path, email)),
    );
    await prisma.rateLimit.deleteMany({ where: { key: { in: keys } } });
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("sans session", () => {
    it("GET /api/me répond 401 en français", async () => {
      const res = await http().get("/api/me").expect(401);
      expect(res.body).toEqual({
        statusCode: 401,
        error: "Authentification requise",
        message: "Authentification requise",
      });
    });

    it("GET /api/admin/ping répond 401", async () => {
      await http().get("/api/admin/ping").expect(401);
    });

    it("GET /api/auth/get-session renvoie null", async () => {
      const res = await http().get("/api/auth/get-session").expect(200);
      expect(res.body).toBeNull();
    });
  });

  describe("connexion par e-mail et mot de passe", () => {
    it("connecte Claire (parrain) avec un cookie de session httpOnly", async () => {
      const res = await signIn(CLAIRE).expect(200);
      const setCookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
      const session = setCookie.find((c) => c.startsWith("better-auth.session_token="));
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Lax/i);
      expect(session).toMatch(/Max-Age=604800/);
      expect(session).not.toMatch(/Secure/i);
      expect(res.body.user).toMatchObject({ email: CLAIRE, role: "parrain" });

      const me = await http()
        .get("/api/me")
        .set("Cookie", sessionCookie(res.headers["set-cookie"])!)
        .expect(200);
      expect(me.headers["cache-control"]).toBe("private, no-store");
      expect(meSchema.parse(me.body)).toEqual({
        user: {
          id: "seed-user-claire",
          name: "Claire M.",
          email: CLAIRE,
          role: "parrain",
          initials: "CM",
        },
        parrain: { displayName: "Claire M.", avatarTone: "info-strong" },
        relais: null,
      });
    });

    it("connecte M. Koffi (relais) avec son profil de relais", async () => {
      const me = await http()
        .get("/api/me")
        .set("Cookie", await cookieFor(KOFFI))
        .expect(200);
      expect(me.body).toMatchObject({
        user: { role: "relais", name: "M. Koffi", initials: "MK" },
        parrain: null,
        relais: { displayName: "M. Koffi", city: "Lomé", district: "Bè" },
      });
    });

    it("connecte le bureau, sans profil métier", async () => {
      const me = await http()
        .get("/api/me")
        .set("Cookie", await cookieFor(BUREAU))
        .expect(200);
      expect(me.body).toMatchObject({
        user: { role: "bureau", name: "Bureau · trésorerie", initials: "BT" },
        parrain: null,
        relais: null,
      });
    });

    it("refuse un mauvais mot de passe (401 INVALID_EMAIL_OR_PASSWORD)", async () => {
      const res = await signIn(CLAIRE, "mauvais-mot-de-passe").expect(401);
      expect(res.body).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
      expect(sessionCookie(res.headers["set-cookie"])).toBeUndefined();
    });

    it("refuse l'inscription libre (400 EMAIL_PASSWORD_SIGN_UP_DISABLED)", async () => {
      const res = await http()
        .post("/api/auth/sign-up/email")
        .set("Origin", WEB_ORIGIN)
        .send({ email: SIGN_UP, password: "motdepasse", name: "Inscription" })
        .expect(400);
      expect(res.body).toMatchObject({ code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" });
      expect(await prisma.user.findUnique({ where: { email: SIGN_UP } })).toBeNull();
    });

    it("bloque une adresse au-delà de 5 tentatives par minute (429, message français)", async () => {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await signIn(THROTTLED, "mauvais-mot-de-passe").expect(401);
      }
      const res = await signIn(THROTTLED, "mauvais-mot-de-passe").expect(429);
      expect(res.body).toEqual({
        code: "TOO_MANY_REQUESTS",
        message: "Trop de tentatives. Réessayez dans quelques minutes.",
      });
      expect(Number(res.headers["x-retry-after"])).toBeGreaterThan(0);
      // Les autres adresses ne sont pas touchées.
      await signIn(BUREAU).expect(200);
    });

    it("refuse un POST porteur de cookie sans en-tête Origin (403)", async () => {
      const res = await http()
        .post("/api/auth/sign-out")
        .set("Cookie", await cookieFor(BUREAU))
        .send({})
        .expect(403);
      expect(res.body).toMatchObject({ code: "MISSING_OR_NULL_ORIGIN" });
    });

    it("déconnecte et invalide la session", async () => {
      const cookie = await cookieFor(KOFFI);
      await http()
        .post("/api/auth/sign-out")
        .set("Origin", WEB_ORIGIN)
        .set("Cookie", cookie)
        .send({})
        .expect(200);
      await http().get("/api/me").set("Cookie", cookie).expect(401);
    });
  });

  describe("garde de rôle", () => {
    it("GET /api/admin/ping : 403 pour un parrain ou un relais, 200 pour le bureau", async () => {
      const forbidden = await http()
        .get("/api/admin/ping")
        .set("Cookie", await cookieFor(CLAIRE))
        .expect(403);
      expect(forbidden.body).toEqual({
        statusCode: 403,
        error: "Accès refusé",
        message: "Accès refusé",
      });
      await http()
        .get("/api/admin/ping")
        .set("Cookie", await cookieFor(KOFFI))
        .expect(403);
      const ok = await http()
        .get("/api/admin/ping")
        .set("Cookie", await cookieFor(BUREAU))
        .expect(200);
      expect(ok.body).toEqual({ ok: true });
    });

    it("réserve les routes d'administration de Better Auth au bureau", async () => {
      const parrain = await cookieFor(PARRAIN);
      const setRole = await http()
        .post("/api/auth/admin/set-role")
        .set("Origin", WEB_ORIGIN)
        .set("Cookie", parrain)
        .send({ userId: "seed-user-parrain24", role: "bureau" })
        .expect(403);
      expect(setRole.body).toMatchObject({ code: "YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE" });
      await http()
        .get("/api/auth/admin/list-users")
        .set("Cookie", await cookieFor(AGBEKO))
        .expect(403);
      const me = await http().get("/api/me").set("Cookie", parrain).expect(200);
      expect(me.body.user.role).toBe("parrain");
    });

    it("ferme /api/auth/update-user : ni rôle, ni nom, ni photo modifiables par soi-même", async () => {
      const cookie = await cookieFor(PARRAIN);
      for (const body of [
        { role: "bureau" },
        { name: "Le bureau", image: "javascript:alert(1)" },
      ]) {
        await http()
          .post("/api/auth/update-user")
          .set("Origin", WEB_ORIGIN)
          .set("Cookie", cookie)
          .send(body)
          .expect(404);
      }
      expect(
        await prisma.user.findUnique({
          where: { email: PARRAIN },
          select: { name: true, image: true, role: true },
        }),
      ).toEqual({ name: "Damien P.", image: null, role: "parrain" });
    });
  });

  describe("e-mails (Mailpit)", () => {
    it("envoie un lien magique qui ouvre une session et redirige vers le web", async () => {
      const known = await messageIds(KOFFI);
      await http()
        .post("/api/auth/sign-in/magic-link")
        .set("Origin", WEB_ORIGIN)
        .send({ email: KOFFI, callbackURL: "/relais" })
        .expect(200, { status: true });

      const mail = await waitForNewMessage(KOFFI, known);
      expect(mail.subject).toBe("Votre lien de connexion");
      const link = mail.text.match(
        /http:\/\/localhost:3000\/api\/auth\/magic-link\/verify\S+/,
      )?.[0];
      expect(link).toBeDefined();
      // Rien d'autre que le lien : ni nom, ni adresse.
      expect(mail.text).not.toContain("Koffi");

      const verify = await http().get(link!.replace(WEB_ORIGIN, "")).expect(302);
      expect(verify.headers.location).toBe(`${WEB_ORIGIN}/relais`);
      const cookie = sessionCookie(verify.headers["set-cookie"]);
      const me = await http().get("/api/me").set("Cookie", cookie!).expect(200);
      expect(me.body.user.role).toBe("relais");

      // Un lien ne sert qu'une fois.
      const reused = await http().get(link!.replace(WEB_ORIGIN, "")).expect(302);
      expect(reused.headers.location).toBe(`${WEB_ORIGIN}/relais?error=INVALID_TOKEN`);
    });

    it("refuse un lien magique expiré", async () => {
      const known = await messageIds(AGBEKO);
      const requestedAt = new Date();
      await http()
        .post("/api/auth/sign-in/magic-link")
        .set("Origin", WEB_ORIGIN)
        .send({ email: AGBEKO, callbackURL: "/relais", errorCallbackURL: "/connexion" })
        .expect(200, { status: true });
      const mail = await waitForNewMessage(AGBEKO, known);
      const link = mail.text.match(
        /http:\/\/localhost:3000\/api\/auth\/magic-link\/verify\S+/,
      )?.[0];
      expect(link).toBeDefined();

      // Les jetons sont stockés hachés : on vieillit ceux créés par cette demande.
      const { count } = await prisma.verification.updateMany({
        where: { identifier: { startsWith: "magic-link:" }, createdAt: { gte: requestedAt } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(count).toBeGreaterThan(0);
      const expired = await http().get(link!.replace(WEB_ORIGIN, "")).expect(302);
      expect(expired.headers.location).toBe(`${WEB_ORIGIN}/connexion?error=INVALID_TOKEN`);
      expect(sessionCookie(expired.headers["set-cookie"])).toBeUndefined();
    });

    it("n'envoie rien et ne crée aucun compte pour une adresse inconnue", async () => {
      const known = await messageIds(UNKNOWN);
      await http()
        .post("/api/auth/sign-in/magic-link")
        .set("Origin", WEB_ORIGIN)
        .send({ email: UNKNOWN })
        .expect(200, { status: true });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(await messageIds(UNKNOWN)).toEqual(known);
      expect(await prisma.user.findUnique({ where: { email: UNKNOWN } })).toBeNull();
    });

    it("réinitialise le mot de passe par e-mail", async () => {
      const known = await messageIds(RESET_USER);
      await http()
        .post("/api/auth/request-password-reset")
        .set("Origin", WEB_ORIGIN)
        .send({ email: RESET_USER, redirectTo: "/reinitialiser-mot-de-passe" })
        .expect(200);

      const mail = await waitForNewMessage(RESET_USER, known);
      expect(mail.subject).toBe("Réinitialisation de votre mot de passe");
      const link = mail.text.match(/http:\/\/localhost:3000\/api\/auth\/reset-password\/\S+/)?.[0];
      expect(link).toBeDefined();

      const callback = await http().get(link!.replace(WEB_ORIGIN, "")).expect(302);
      const location = new URL(callback.headers.location as string);
      expect(location.pathname).toBe("/reinitialiser-mot-de-passe");
      const token = location.searchParams.get("token");
      expect(token).toBeTruthy();

      // Même mot de passe qu'au seed : les autres tests restent valides.
      await http()
        .post("/api/auth/reset-password")
        .set("Origin", WEB_ORIGIN)
        .send({ newPassword: PASSWORD, token })
        .expect(200);
      await signIn(RESET_USER).expect(200);

      // Le jeton ne sert qu'une fois, et le lien de l'e-mail ne redonne pas de jeton.
      const reused = await http()
        .post("/api/auth/reset-password")
        .set("Origin", WEB_ORIGIN)
        .send({ newPassword: "un-autre-mot-de-passe", token })
        .expect(400);
      expect(reused.body).toMatchObject({ code: "INVALID_TOKEN" });
      const again = await http().get(link!.replace(WEB_ORIGIN, "")).expect(302);
      expect(again.headers.location).toBe(
        `${WEB_ORIGIN}/reinitialiser-mot-de-passe?error=INVALID_TOKEN`,
      );
      await signIn(RESET_USER).expect(200);
    });
  });
});
