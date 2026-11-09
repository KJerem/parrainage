import { execSync } from "node:child_process";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import {
  bureauChildSchema,
  bureauOverviewSchema,
  bureauParrainSchema,
  bureauParrainsSchema,
  bureauSponsorshipsSchema,
  createdSponsorshipSchema,
  filleulListSchema,
  newSponsorshipSchema,
  parrainCandidatesSchema,
} from "@parrainage/contracts";
import request from "supertest";
import { now } from "../src/common/clock.js";
import { prisma } from "../src/prisma/client.js";
import { createTestApp, sessionCookie, WEB_ORIGIN } from "./app.js";
import { messageIds, waitForNewMessage } from "./mailpit.js";
import { type Account, ACCOUNTS, signInAll, userIdOf } from "./session.js";

vi.setConfig({ testTimeout: 30_000 });

const ESTHER = "seed-child-esther";
const SOPHIE = "seed-parrain-sophie";
const MARC = "seed-parrain-marc";
const INVITED = "lea.bernard@e2e.exemple.fr";

describe("Bureau : binômes, parrains et dossiers (e2e)", () => {
  let app: INestApplication;
  let cookies: Record<Account, string>;
  const today = now();
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);

  const server = () => app.getHttpServer();
  const get = (account: Account, url: string) =>
    request(server()).get(url).set("Cookie", cookies[account]);
  const post = (account: Account, url: string, body: object = {}) =>
    request(server())
      .post(url)
      .set("Cookie", cookies[account])
      .set("Origin", WEB_ORIGIN)
      .send(body);
  const waitingIds = async () =>
    (
      await prisma.child.findMany({
        where: {
          fileStatus: { in: ["SUBMITTED", "VALIDATED"] },
          sponsorships: { none: { status: "ACTIVE" } },
        },
        select: { id: true },
      })
    ).map((c) => c.id);

  beforeAll(async () => {
    app = await createTestApp();
    cookies = await signInAll(app, ["bureau", "claire", "koffi", "sophie"]);
  });

  afterAll(async () => {
    await app.close();
    // Binômes créés, dossiers validés et parrains invités : le seed repart de la démonstration.
    execSync("npm run db:seed", {
      cwd: path.join(import.meta.dirname, ".."),
      env: { ...process.env, SEED_RESET_MESSAGES: "1" },
      stdio: "pipe",
    });
  }, 120_000);

  describe("lecture", () => {
    it("vue d'ensemble : indicateurs et binômes à surveiller", async () => {
      const res = await get("bureau", "/api/bureau/overview").expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const data = bureauOverviewSchema.parse(res.body);
      const active = await prisma.sponsorship.findMany({
        where: { status: "ACTIVE" },
        select: { parrain: { select: { country: true } } },
      });
      expect(data).toMatchObject({
        activeSponsorships: active.length,
        countries: new Set(active.map((s) => s.parrain.country)).size,
        relaisCount: 3,
        latePayments: 2,
      });
      expect(data.staleChildren).toBe(5);
      expect(data.collectedThisMonthCents).toBeGreaterThan(0);

      // Parrain inactif d'abord, puis les plus longs silences ; deux enfants à parrainer à la fin.
      expect(data.watch.items).toHaveLength(6);
      expect(data.watch.items[0]).toMatchObject({
        kind: "sponsorship",
        id: "seed-sponsorship-ibrahim-sophie2",
        health: "INACTIVE_PARRAIN",
        parrainName: "Sophie L.",
        relais: { displayName: "Mme Diallo", city: "Kara" },
      });
      const silences = data.watch.items
        .filter((item) => item.kind === "sponsorship" && item.health === "TO_FOLLOW_UP")
        .map((item) => (item.kind === "sponsorship" ? item.days : 0));
      expect(silences).toEqual([...silences].sort((a, b) => b - a));
      expect(silences.every((days) => days >= 60)).toBe(true);
      expect(data.watch.items.slice(-2)).toMatchObject([
        { kind: "waiting", child: { firstName: "Esther" }, relais: { city: "Lomé" } },
        { kind: "waiting" },
      ]);
      expect(data.watch.total).toBeGreaterThanOrEqual(data.watch.items.length);
    });

    it("tous les binômes : dernier échange, retards et santé, filtrables", async () => {
      const all = bureauSponsorshipsSchema.parse(
        (await get("bureau", "/api/bureau/sponsorships").expect(200)).body,
      );
      const row = (id: string) => all.items.find((item) => item.id === id);
      expect(row("seed-sponsorship-aicha-claire")).toMatchObject({ health: "ACTIVE" });
      const sixtyFourDaysAgo = new Date(today.getTime() - 64 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      expect(row("seed-sponsorship-kofi-paul")).toMatchObject({
        health: "TO_FOLLOW_UP",
        latePayments: 0,
      });
      expect(row("seed-sponsorship-kofi-paul")!.lastExchangeAt!.slice(0, 10)).toBe(
        sixtyFourDaysAgo,
      );
      expect(row("seed-sponsorship-ibrahim-sophie2")).toMatchObject({
        health: "INACTIVE_PARRAIN",
        latePayments: 2,
        relais: { city: "Kara" },
      });
      expect(all.relais.map((r) => r.city)).toEqual(["Kara", "Kpalimé", "Lomé"]);

      const toFollow = bureauSponsorshipsSchema.parse(
        (await get("bureau", "/api/bureau/sponsorships?etat=a-relancer").expect(200)).body,
      );
      expect(toFollow.items.every((item) => item.health === "TO_FOLLOW_UP")).toBe(true);
      const kara = bureauSponsorshipsSchema.parse(
        (await get("bureau", "/api/bureau/sponsorships?relais=seed-relais-diallo").expect(200))
          .body,
      );
      expect(kara.items.length).toBeGreaterThan(0);
      expect(kara.items.every((item) => item.relais.city === "Kara")).toBe(true);
      await get("bureau", "/api/bureau/sponsorships?etat=TO_FOLLOW_UP").expect(400);
    });

    it("l'espace bureau est fermé aux parrains et aux relais", async () => {
      await get("claire", "/api/bureau/overview").expect(403);
      await get("koffi", "/api/bureau/sponsorships").expect(403);
      await post("koffi", "/api/bureau/sponsorships", {}).expect(403);
      await get("claire", `/api/bureau/children/${ESTHER}`).expect(403);
    });
  });

  describe("dossier d'un enfant", () => {
    it("le bureau lit le dossier envoyé par le relais, jamais un brouillon", async () => {
      const dossier = bureauChildSchema.parse(
        (await get("bureau", `/api/bureau/children/${ESTHER}`).expect(200)).body,
      );
      expect(dossier).toMatchObject({
        firstName: "Esther",
        className: "CE1",
        age: 8,
        fileStatus: "SUBMITTED",
        guardianName: "Mme N. (mère)",
        consentMedia: false,
        addedBy: "M. Koffi",
        sponsorships: [],
      });
      const draft = await prisma.child.findFirst({ where: { fileStatus: "DRAFT" } });
      if (draft) {
        await get("bureau", `/api/bureau/children/${draft.id}`).expect(404);
      }
      await get("bureau", "/api/bureau/children/inconnu").expect(404);
    });
  });

  describe("créer un binôme", () => {
    it("propose Esther, puis les autres enfants en attente", async () => {
      const data = newSponsorshipSchema.parse(
        (await get("bureau", "/api/bureau/sponsorships/new").expect(200)).body,
      );
      expect(data.child).toMatchObject({
        id: ESTHER,
        firstName: "Esther",
        age: 8,
        className: "CE1",
        schoolName: "EPP Bè",
        city: "Lomé",
        addedBy: "M. Koffi",
        photo: null,
      });
      expect(data.others).toHaveLength(2);
      expect(data).toMatchObject({ defaultMonthlyCents: 2500, defaultStartDate: nextMonth });
      const other = data.others[0]!;
      const chosen = newSponsorshipSchema.parse(
        (await get("bureau", `/api/bureau/sponsorships/new?enfant=${other.id}`).expect(200)).body,
      );
      expect(chosen.child?.id).toBe(other.id);
      expect(chosen.others.map((c) => c.id)).toContain(ESTHER);
    });

    it("cherche les parrains : celle qui attend un filleul d'abord, jamais un parrain inactif", async () => {
      const suggested = parrainCandidatesSchema.parse(
        (await get("bureau", `/api/bureau/parrains/candidates?enfant=${ESTHER}`).expect(200)).body,
      );
      expect(suggested.items[0]).toMatchObject({
        id: SOPHIE,
        displayName: "Sophie L.",
        city: "Nantes",
        filleuls: [],
        wishes: "Souhaite parrainer une fille en primaire",
      });
      expect(suggested.items.some((p) => p.id === "seed-parrain-sophie2")).toBe(false);
      expect(suggested.items.length).toBeLessThanOrEqual(6);

      const marc = parrainCandidatesSchema.parse(
        (await get("bureau", "/api/bureau/parrains/candidates?q=marc.p@").expect(200)).body,
      );
      expect(marc.items).toEqual([
        expect.objectContaining({ id: MARC, displayName: "Marc P.", filleuls: ["Yao D."] }),
      ]);
      const homonyms = parrainCandidatesSchema.parse(
        (await get("bureau", "/api/bureau/parrains/candidates?q=sophie").expect(200)).body,
      );
      expect(homonyms.items.map((p) => p.id)).toEqual([SOPHIE]);
    });

    it("Esther + Sophie L. : le binôme, sa conversation et les e-mails au parrain et au relais", async () => {
      const knownSophie = await messageIds(ACCOUNTS.sophie);
      const knownKoffi = await messageIds(ACCOUNTS.koffi);
      const res = await post("bureau", "/api/bureau/sponsorships", {
        childId: ESTHER,
        parrainId: SOPHIE,
        monthlyAmountCents: 3000,
        startDate: nextMonth,
      }).expect(201);
      const created = createdSponsorshipSchema.parse(res.body);
      const sponsorship = await prisma.sponsorship.findUniqueOrThrow({
        where: { id: created.id },
        include: { conversation: { include: { participants: true } } },
      });
      expect(sponsorship).toMatchObject({
        childId: ESTHER,
        parrainId: SOPHIE,
        status: "ACTIVE",
        monthlyAmountCents: 3000,
        startDate: new Date(`${nextMonth}T00:00:00Z`),
      });
      expect(sponsorship.conversation).toMatchObject({
        id: created.conversationId,
        kind: "SPONSORSHIP",
        relaisId: "seed-relais-koffi",
      });
      expect(
        sponsorship.conversation!.participants.map((p) => p.userId ?? p.childId).sort(),
      ).toEqual([ESTHER, await userIdOf("sophie")].sort());
      expect(
        await prisma.auditLog.count({
          where: { action: "sponsorship.create", entityId: created.id },
        }),
      ).toBe(1);

      const toSophie = await waitForNewMessage(ACCOUNTS.sophie, knownSophie);
      expect(toSophie.subject).toBe("Un enfant vous a été présenté");
      expect(toSophie.text).toContain(`/parrain?filleul=${ESTHER}`);
      expect(toSophie.text).not.toContain("Esther");
      const toKoffi = await waitForNewMessage(ACCOUNTS.koffi, knownKoffi);
      expect(toKoffi.subject).toBe("Un parrain pour un de vos enfants");
      expect(toKoffi.text).toContain(`/relais/enfants/${ESTHER}`);
      expect(toKoffi.text).not.toMatch(/Esther|Sophie/);

      // Sophie voit Esther ; M. Koffi voit Sophie.
      const filleuls = filleulListSchema.parse(
        (await get("sophie", "/api/parrain/filleuls").expect(200)).body,
      );
      expect(filleuls.map((f) => f.firstName)).toEqual(["Esther"]);
      await get("sophie", `/api/parrain/filleuls/${ESTHER}`).expect(200);
      const child = await get("koffi", `/api/relais/children/${ESTHER}`).expect(200);
      expect(child.body.parrains).toEqual(["Sophie L."]);

      // Esther n'attend plus ; un second binôme est refusé.
      expect(await waitingIds()).not.toContain(ESTHER);
      const twice = await post("bureau", "/api/bureau/sponsorships", {
        childId: ESTHER,
        parrainId: MARC,
        monthlyAmountCents: 2500,
        startDate: nextMonth,
      }).expect(409);
      expect(twice.body.message).toBe("Esther a déjà un parrain");
    });

    it("un dossier seulement envoyé est validé avec le binôme ; deux créations simultanées : une seule", async () => {
      const [childId] = await waitingIds();
      await prisma.child.update({
        where: { id: childId! },
        data: { fileStatus: "SUBMITTED", validatedAt: null },
      });
      const attempts = await Promise.all(
        [SOPHIE, MARC].map((parrainId) =>
          post("bureau", "/api/bureau/sponsorships", {
            childId,
            parrainId,
            monthlyAmountCents: 2500,
            startDate: nextMonth,
          }),
        ),
      );
      expect(attempts.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(await prisma.sponsorship.count({ where: { childId, status: "ACTIVE" } })).toBe(1);
      const child = await prisma.child.findUniqueOrThrow({ where: { id: childId! } });
      expect(child.fileStatus).toBe("VALIDATED");
      expect(child.validatedAt).not.toBeNull();
    });

    it("refuse une date passée, un parrain inconnu et un enfant sans dossier prêt", async () => {
      const [childId] = await waitingIds();
      const base = { childId, parrainId: MARC, monthlyAmountCents: 2500, startDate: nextMonth };
      const past = await post("bureau", "/api/bureau/sponsorships", {
        ...base,
        startDate: "2020-01-01",
      }).expect(400);
      expect(past.body.fieldErrors).toEqual({
        startDate: ["Le binôme commence aujourd'hui ou plus tard"],
      });
      await post("bureau", "/api/bureau/sponsorships", { ...base, parrainId: "inconnu" }).expect(
        404,
      );
      const draft = await prisma.child.findFirst({ where: { fileStatus: "DRAFT" } });
      if (draft) {
        await post("bureau", "/api/bureau/sponsorships", { ...base, childId: draft.id }).expect(
          404,
        );
      }
    });
  });

  describe("validation d'un dossier", () => {
    it("valider un dossier envoyé une fois, audité, son relais prévenu par un lien", async () => {
      // Le dernier enfant en attente, remis à l'état « envoyé ».
      const [childId] = await waitingIds();
      const relaisUser = await prisma.child.findUniqueOrThrow({
        where: { id: childId! },
        select: { relais: { select: { user: { select: { email: true } } } } },
      });
      const relaisEmail = relaisUser.relais.user.email;
      await prisma.child.update({
        where: { id: childId! },
        data: { fileStatus: "SUBMITTED", validatedAt: null },
      });
      const known = await messageIds(relaisEmail);
      const audits = () =>
        prisma.auditLog.count({ where: { action: "child.validate", entityId: childId } });
      const before = await audits();
      const validated = bureauChildSchema.parse(
        (await post("bureau", `/api/bureau/children/${childId}/validate`).expect(200)).body,
      );
      expect(validated.fileStatus).toBe("VALIDATED");
      expect(validated.validatedAt).not.toBeNull();
      const mail = await waitForNewMessage(relaisEmail, known);
      expect(mail.subject).toBe("Dossier validé par le bureau");
      expect(mail.text).toContain(`/relais/enfants/${childId}`);
      expect(await audits()).toBe(before + 1);
      const again = await post("bureau", `/api/bureau/children/${childId}/validate`).expect(409);
      expect(again.body.message).toBe("Ce dossier est déjà validé");
    });
  });

  describe("parrains", () => {
    it("liste les parrains avec leur état", async () => {
      const data = bureauParrainsSchema.parse(
        (await get("bureau", "/api/bureau/parrains").expect(200)).body,
      );
      const byEmail = (email: string) => data.items.find((p) => p.email === email);
      expect(byEmail(ACCOUNTS.claire)).toMatchObject({
        fullName: "Claire Martin",
        filleuls: ["Aïcha S.", "Kofi A."],
        monthlyTotalCents: 5000,
        status: "WITH_CHILD",
      });
      expect(byEmail("sophie.l2@exemple.fr")).toMatchObject({
        status: "INACTIVE",
        latePayments: 2,
      });
      const search = bureauParrainsSchema.parse(
        (await get("bureau", "/api/bureau/parrains?q=nantes").expect(200)).body,
      );
      expect(search.items.map((p) => p.displayName)).toEqual(["Sophie L."]);
    });

    it("invite une marraine : compte créé, lien d'invitation, connexion, activité suivie", async () => {
      const known = await messageIds(INVITED);
      const res = await post("bureau", "/api/bureau/parrains", {
        firstName: "Léa",
        lastName: "Bernard",
        email: INVITED,
        gender: "F",
        city: "Rennes",
        wishes: "Souhaite parrainer un collégien",
      }).expect(201);
      const invited = bureauParrainSchema.parse(res.body);
      expect(invited).toMatchObject({
        displayName: "Léa B.",
        fullName: "Léa Bernard",
        city: "Rennes",
        country: "France",
        status: "INVITED",
        lastActiveAt: null,
      });
      expect(
        await prisma.auditLog.count({
          where: { action: "user.invite", metadata: { equals: { role: "parrain" } } },
        }),
      ).toBeGreaterThan(0);

      const mail = await waitForNewMessage(INVITED, known);
      expect(mail.subject).toBe("Invitation à la plateforme de parrainage LRT");
      const link = mail.text.match(
        /http:\/\/localhost:3000\/api\/auth\/magic-link\/verify\S+/,
      )?.[0];
      expect(link).toBeDefined();
      const verified = await request(server()).get(link!.replace(WEB_ORIGIN, "")).expect(302);
      expect(verified.headers.location).toBe(`${WEB_ORIGIN}/parrain`);
      const cookie = sessionCookie(verified.headers["set-cookie"]);
      expect(cookie).toBeDefined();
      const me = await request(server()).get("/api/me").set("Cookie", cookie!).expect(200);
      expect(me.body.user).toMatchObject({ email: INVITED, role: "parrain" });

      const after = bureauParrainsSchema.parse(
        (await get("bureau", "/api/bureau/parrains?q=bernard").expect(200)).body,
      );
      expect(after.items[0]).toMatchObject({ status: "WAITING" });
      expect(after.items[0]!.lastActiveAt).not.toBeNull();

      const duplicate = await post("bureau", "/api/bureau/parrains", {
        firstName: "Léa",
        lastName: "Bernard",
        email: "LEA.BERNARD@e2e.exemple.fr",
        gender: "F",
        city: "Rennes",
      }).expect(409);
      expect(duplicate.body.fieldErrors).toEqual({
        email: ["Un compte existe déjà avec cette adresse"],
      });
    });
  });
});
