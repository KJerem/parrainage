import type { INestApplication } from "@nestjs/common";
import {
  bulletinListSchema,
  type FeedItem,
  feedPageSchema,
  filleulDashboardSchema,
  filleulListSchema,
} from "@parrainage/contracts";
import request from "supertest";
import { EMAIL_ATTEMPT_RULES, emailAttemptKey } from "../src/auth/attempt-limit.js";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/prisma/client.js";
import { createTestApp, sessionCookie, WEB_ORIGIN } from "./app.js";

// Base seedée requise (`npm run db:seed`) et stockage démarré (bulletin PDF déposé par le seed).
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "motdepasse";
const ACCOUNTS = {
  claire: "claire.m@exemple.fr",
  paul: "paul.d@exemple.fr",
  marc: "marc.p@exemple.fr",
  helene: "helene.r@exemple.fr",
  // Marraine de Komla, enfant généré sans consentement médias.
  komlaParrain: "parrain2@exemple.fr",
  koffi: "koffi@relais.exemple.tg",
  bureau: "bureau@exemple.fr",
} as const;
type Account = keyof typeof ACCOUNTS;

const AICHA = "seed-child-aicha";
const KOFI = "seed-child-kofi";
const YAO = "seed-child-yao";
const MARIAM = "seed-child-mariam";
const KOMLA = "seed-child-koffi-2";
const BULLETIN = "seed-media-aicha-bulletin-t1";
const CLASS_PHOTO = "seed-media-aicha-classe";
const NOT_FOUND = { statusCode: 404, error: "Introuvable", message: "Introuvable" };

describe("Espace parrain et médias (e2e)", () => {
  let app: INestApplication;
  const cookies = {} as Record<Account, string>;
  const get = (account: Account, path: string) =>
    request(app.getHttpServer()).get(path).set("Cookie", cookies[account]);

  beforeAll(async () => {
    const emails = Object.values(ACCOUNTS);
    await prisma.rateLimit.deleteMany({
      where: { key: { in: emails.map((e) => emailAttemptKey("/sign-in/email", e)) } },
    });
    expect(Object.keys(EMAIL_ATTEMPT_RULES)).toContain("/sign-in/email");
    app = await createTestApp();
    for (const [account, email] of Object.entries(ACCOUNTS) as [Account, string][]) {
      const res = await request(app.getHttpServer())
        .post("/api/auth/sign-in/email")
        .set("Origin", WEB_ORIGIN)
        .send({ email, password: PASSWORD })
        .expect(200);
      const cookie = sessionCookie(res.headers["set-cookie"]);
      if (!cookie) {
        throw new Error(`Pas de cookie de session pour ${email}`);
      }
      cookies[account] = cookie;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/parrain/filleuls", () => {
    it("liste Aïcha puis Kofi pour Claire (du plus ancien binôme au plus récent)", async () => {
      const res = await get("claire", "/api/parrain/filleuls").expect(200);
      const list = filleulListSchema.parse(res.body);
      expect(list).toEqual([
        { childId: AICHA, firstName: "Aïcha", lastInitial: "S", avatarTone: "amber" },
        { childId: KOFI, firstName: "Kofi", lastInitial: "A", avatarTone: "brand" },
      ]);
      expect(res.headers["cache-control"]).toBe("private, no-store");
    });

    it("refuse l'espace parrain aux relais et au bureau (403)", async () => {
      for (const account of ["koffi", "bureau"] as const) {
        for (const path of [
          "/api/parrain/filleuls",
          `/api/parrain/filleuls/${AICHA}`,
          `/api/parrain/filleuls/${AICHA}/nouvelles`,
          `/api/parrain/filleuls/${AICHA}/bulletins`,
        ]) {
          const res = await get(account, path);
          expect({ account, path, status: res.status }).toEqual({ account, path, status: 403 });
        }
      }
    });
  });

  describe("GET /api/parrain/filleuls/:childId", () => {
    it("assemble l'écran d'Aïcha : profil, fil, résultats et versements", async () => {
      const res = await get("claire", `/api/parrain/filleuls/${AICHA}`).expect(200);
      const dashboard = filleulDashboardSchema.parse(res.body);
      expect(dashboard.child).toEqual({
        id: AICHA,
        firstName: "Aïcha",
        lastInitial: "S",
        gender: "F",
        avatarTone: "amber",
        age: 12,
        className: "CM2",
        schoolFullName: "École primaire publique de Bè",
        city: "Lomé",
        country: "Togo",
        relaisDisplayName: "M. Koffi",
        sponsoredSince: "2023-03-01",
        photo: {
          id: "seed-media-photo-aicha",
          kind: "AVATAR",
          status: "PLACEHOLDER",
          label: "Photo d'Aïcha",
          durationSec: null,
          mimeType: "image/jpeg",
        },
      });
      expect(dashboard.conversationId).toBe("seed-conversation-aicha-claire");
      // Jamais de date de naissance ni de responsable légal.
      expect(JSON.stringify(res.body)).not.toMatch(/birthDate|guardian/);

      const [message, news] = dashboard.feed;
      expect(dashboard.feed).toHaveLength(2);
      expect(message).toMatchObject({
        type: "message",
        id: "seed-message-aicha-to-claire",
        sentFrom: "SCHOOL_SESSION",
        masked: false,
        body: "Bonjour tata Claire ! J'ai eu mon bulletin du premier trimestre. J'ai progressé en calcul grâce aux cours du soir. Je t'envoie aussi une photo de notre classe.",
        conversationId: "seed-conversation-aicha-claire",
      });
      expect(message?.type === "message" && message.attachments).toEqual([
        expect.objectContaining({
          id: CLASS_PHOTO,
          status: "PLACEHOLDER",
          label: "Photo de la classe",
        }),
        expect.objectContaining({
          id: BULLETIN,
          kind: "BULLETIN",
          status: "READY",
          label: "Bulletin T1 — 2026-27",
          mimeType: "application/pdf",
        }),
      ]);
      expect(news).toMatchObject({
        type: "news",
        title: "Nouvelle de rentrée",
        body: "Aïcha a fait sa rentrée en CM2. Son kit scolaire a été acheté grâce à votre parrainage : cahiers, uniforme et sandales. Elle est déléguée de classe cette année.",
        author: { displayName: "M. Koffi", city: "Lomé" },
        media: [expect.objectContaining({ kind: "VIDEO", durationSec: 42, label: "Vidéo · 0:42" })],
      });
      // Le message de Claire elle-même n'est pas dans le fil.
      expect(JSON.stringify(dashboard.feed)).not.toContain("Bravo pour ta rentrée");

      expect(dashboard.results).toEqual({
        previous: expect.objectContaining({
          className: "CM1",
          periodKind: "ANNUAL",
          periodLabel: "moyenne annuelle",
          averageX100: 1180,
        }),
        current: expect.objectContaining({
          className: "CM2",
          periodKind: "T1",
          periodLabel: "1er trimestre",
          averageX100: 1340,
        }),
        appreciation: "Élève sérieuse, en net progrès en mathématiques.",
      });
    });

    it("calcule les versements de Claire pour Aïcha à partir de la base", async () => {
      const res = await get("claire", `/api/parrain/filleuls/${AICHA}`).expect(200);
      const { now, payments } = filleulDashboardSchema.parse(res.body);
      const at = new Date(now);
      const year = at.getUTCFullYear();
      const received = await prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: {
          parrain: { user: { email: ACCOUNTS.claire } },
          childId: AICHA,
          status: "RECEIVED",
          paidAt: { gte: new Date(Date.UTC(year, 0, 1)), lte: at },
        },
      });
      expect(payments.year).toBe(year);
      expect(payments.monthlyAmountCents).toBe(2500);
      expect(payments.paidThisYearCents).toBe(received._sum.amountCents ?? 0);
      expect(payments.paidThisYearCents).toBeGreaterThanOrEqual(4000 + 2500);
      expect(payments.lastMonths).toHaveLength(3);
      expect(
        payments.lastMonths.every((p) => p.status === "RECEIVED" && p.amountCents === 2500),
      ).toBe(true);
      const keys = payments.lastMonths.map((p) => p.periodKey);
      expect([...keys].sort().reverse()).toEqual(keys);
      expect(payments.lastMonths.every((p) => p.dueDate.endsWith("-05"))).toBe(true);
    });

    it("ne montre pas à Paul (co-parrain de Kofi) les messages de Kofi à Claire", async () => {
      const claire = filleulDashboardSchema.parse(
        (await get("claire", `/api/parrain/filleuls/${KOFI}`).expect(200)).body,
      );
      const paul = filleulDashboardSchema.parse(
        (await get("paul", `/api/parrain/filleuls/${KOFI}`).expect(200)).body,
      );
      const summary = (feed: FeedItem[]) =>
        feed.map((item) => (item.type === "news" ? `news:${item.title}` : `message:${item.body}`));
      // L'ordre suit les dates du seed : seul compte ici ce que chacun voit.
      expect(summary(claire.feed).sort()).toEqual([
        "message:Merci pour le ballon !",
        "news:Fin des vacances",
      ]);
      expect(summary(paul.feed)).toEqual(["news:Fin des vacances"]);
      expect(paul.conversationId).toBe("seed-conversation-kofi-paul");
      expect(paul.child.sponsoredSince).toBe("2024-01-15");
      // Ses versements à lui seulement.
      expect(paul.payments.lastMonths.every((p) => p.id.includes("kofi-paul"))).toBe(true);
      expect(claire.payments.lastMonths.every((p) => p.id.includes("kofi-claire"))).toBe(true);
      // Kofi n'a pas encore de résultat envoyé (T1 en brouillon).
      expect(paul.results).toEqual({ previous: null, current: null, appreciation: null });
    });

    it("cache la photo et les médias d'un enfant sans consentement médias", async () => {
      const res = await get("komlaParrain", `/api/parrain/filleuls/${KOMLA}`).expect(200);
      const dashboard = filleulDashboardSchema.parse(res.body);
      expect(dashboard.child.photo).toBeNull();
      const news = dashboard.feed.filter((item) => item.type === "news");
      expect(news.length).toBeGreaterThan(0);
      expect(news.every((item) => item.media.length === 0)).toBe(true);
    });

    it("répond 404 pour l'enfant d'un autre parrain ou un enfant inconnu", async () => {
      for (const childId of [YAO, MARIAM, "inconnu"]) {
        for (const suffix of ["", "/nouvelles", "/bulletins"]) {
          const res = await get("claire", `/api/parrain/filleuls/${childId}${suffix}`);
          expect({ childId, suffix, status: res.status }).toEqual({ childId, suffix, status: 404 });
          expect(res.body).toEqual(NOT_FOUND);
        }
      }
      await get("paul", `/api/parrain/filleuls/${AICHA}`).expect(404);
    });
  });

  describe("GET /api/parrain/filleuls/:childId/nouvelles", () => {
    it("parcourt tout le fil d'Aïcha page par page", async () => {
      const first = feedPageSchema.parse(
        (await get("claire", `/api/parrain/filleuls/${AICHA}/nouvelles?limit=1`).expect(200)).body,
      );
      expect(first.items.map((i) => i.id)).toEqual(["seed-message-aicha-to-claire"]);
      expect(first.nextCursor).not.toBeNull();
      const second = feedPageSchema.parse(
        (
          await get(
            "claire",
            `/api/parrain/filleuls/${AICHA}/nouvelles?limit=1&cursor=${first.nextCursor}`,
          ).expect(200)
        ).body,
      );
      expect(second.items.map((i) => i.id)).toEqual(["seed-news-aicha-rentree"]);
      expect(second.nextCursor).toBeNull();
      const all = feedPageSchema.parse(
        (await get("claire", `/api/parrain/filleuls/${AICHA}/nouvelles`).expect(200)).body,
      );
      expect(all.items.map((i) => i.id)).toEqual([
        "seed-message-aicha-to-claire",
        "seed-news-aicha-rentree",
      ]);
    });

    it("refuse un curseur ou une taille de page invalides (400, en français)", async () => {
      const res = await get("claire", `/api/parrain/filleuls/${AICHA}/nouvelles?cursor=abc`).expect(
        400,
      );
      expect(res.body).toMatchObject({ message: "Curseur de pagination invalide" });
      const limit = await get("claire", `/api/parrain/filleuls/${AICHA}/nouvelles?limit=0`).expect(
        400,
      );
      expect(limit.body).toMatchObject({
        error: "Requête invalide",
        fieldErrors: { limit: [expect.any(String)] },
      });
    });
  });

  describe("GET /api/parrain/filleuls/:childId/bulletins", () => {
    it("liste les bulletins envoyés d'Aïcha, du plus récent au plus ancien", async () => {
      const res = await get("claire", `/api/parrain/filleuls/${AICHA}/bulletins`).expect(200);
      const { items } = bulletinListSchema.parse(res.body);
      expect(items.map((b) => [b.className, b.periodLabel, b.averageX100])).toEqual([
        ["CM2", "1er trimestre", 1340],
        ["CM1", "moyenne annuelle", 1180],
      ]);
      expect(items[0]).toMatchObject({
        rank: 5,
        classSize: 48,
        appreciation: "Élève sérieuse, en net progrès en mathématiques.",
        media: [expect.objectContaining({ id: BULLETIN, status: "READY" })],
      });
    });
  });

  describe("GET /api/media/:id", () => {
    const pendingMessageId = `e2e-message-${Date.now()}`;
    const pendingMediaId = `e2e-media-${Date.now()}`;

    beforeAll(async () => {
      // Message de Mariam à Hélène encore en relecture, avec une photo prête.
      await prisma.message.create({
        data: {
          id: pendingMessageId,
          conversationId: "seed-conversation-mariam-helene",
          body: "Message e2e en relecture",
          moderationStatus: "PENDING",
          sentFrom: "SCHOOL_SESSION",
          authorChildId: MARIAM,
          media: {
            create: {
              id: pendingMediaId,
              kind: "PHOTO",
              status: "READY",
              storageKey: `e2e/${pendingMediaId}.jpg`,
              mimeType: "image/jpeg",
            },
          },
        },
      });
    });

    afterAll(async () => {
      await prisma.media.deleteMany({ where: { id: pendingMediaId } });
      await prisma.message.deleteMany({ where: { id: pendingMessageId } });
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: [pendingMediaId, BULLETIN] }, actor: { email: ACCOUNTS.bureau } },
      });
    });

    it("redirige Claire vers une URL présignée du stockage, qui sert le PDF", async () => {
      const res = await get("claire", `/api/media/${BULLETIN}`).expect(302);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const location = new URL(res.headers.location!);
      const env = getEnv();
      expect(location.origin).toBe(new URL(env.S3_PUBLIC_ENDPOINT).origin);
      expect(location.pathname).toBe(`/${env.S3_BUCKET}/seed/bulletins/aicha-2026-2027-t1.pdf`);
      expect(location.searchParams.get("X-Amz-Expires")).toBe("120");
      const file = await fetch(location);
      expect(file.status).toBe(200);
      expect(file.headers.get("content-type")).toBe("application/pdf");
      expect(
        Buffer.from(await file.arrayBuffer())
          .subarray(0, 5)
          .toString(),
      ).toBe("%PDF-");
    });

    it("propose le PDF en téléchargement avec ?download=1", async () => {
      const res = await get("claire", `/api/media/${BULLETIN}?download=1`).expect(302);
      const disposition = new URL(res.headers.location!).searchParams.get(
        "response-content-disposition",
      );
      expect(disposition).toContain("attachment;");
      expect(disposition).toContain("Bulletin%20T1%20%E2%80%94%202026-27.pdf");
    });

    it("répond 404 (même réponse qu'un média inconnu) à Marc et à Paul", async () => {
      for (const account of ["marc", "paul"] as const) {
        const res = await get(account, `/api/media/${BULLETIN}`).expect(404);
        expect(res.body).toEqual(NOT_FOUND);
      }
      expect((await get("claire", "/api/media/inconnu").expect(404)).body).toEqual(NOT_FOUND);
    });

    it("sert le bulletin au relais de l'enfant et au bureau, qui est audité", async () => {
      await get("koffi", `/api/media/${BULLETIN}`).expect(302);
      await get("bureau", `/api/media/${BULLETIN}`).expect(302);
      const audit = await prisma.auditLog.findFirst({
        where: { action: "media.view", entityId: BULLETIN, actor: { email: ACCOUNTS.bureau } },
      });
      expect(audit).not.toBeNull();
    });

    it("ne sert jamais un média PLACEHOLDER", async () => {
      for (const account of ["claire", "bureau"] as const) {
        expect((await get(account, `/api/media/${CLASS_PHOTO}`).expect(404)).body).toEqual(
          NOT_FOUND,
        );
      }
    });

    it("cache au destinataire le média d'un message en relecture, jusqu'à son approbation", async () => {
      expect((await get("helene", `/api/media/${pendingMediaId}`).expect(404)).body).toEqual(
        NOT_FOUND,
      );
      await get("bureau", `/api/media/${pendingMediaId}`).expect(302);
      await prisma.message.update({
        where: { id: pendingMessageId },
        data: { moderationStatus: "APPROVED" },
      });
      await get("helene", `/api/media/${pendingMediaId}`).expect(302);
      await get("claire", `/api/media/${pendingMediaId}`).expect(404);
    });
  });
});
