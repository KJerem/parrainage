import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import {
  childCodeProposalSchema,
  childCodeResetSchema,
  createdNewsSchema,
  feedPageSchema,
  filleulDashboardSchema,
  relaisChildListSchema,
  relaisHomeSchema,
  relaisResultsSchema,
  resultRowSchema,
  saveChildResultSchema,
  scheduledNewsListSchema,
  schoolListSchema,
  schoolYearOf,
  sendResultsResultSchema,
} from "@parrainage/contracts";
import request from "supertest";
import { now } from "../src/common/clock.js";
import { prisma } from "../src/prisma/client.js";
import { verifyChildCode } from "../src/relais/child-code.js";
import { NewsService } from "../src/relais/news.service.js";
import { getEnv } from "../src/config/env.js";
import { createTestApp } from "./app.js";
import { messageIds, waitForNewMessage } from "./mailpit.js";
import { ACCOUNTS, type Account, signInAll, userIdOf } from "./session.js";

// Base remise dans l'état du seed par test/global-setup.ts. Ce que les tests créent (enfants,
// nouvelles, écoles, médias) est supprimé à la fin, et les résultats du seed sont rétablis.
const AICHA = "seed-child-aicha";
const KOFI = "seed-child-kofi";
const ESTHER = "seed-child-esther";
const YAO = "seed-child-yao";
const MARIAM = "seed-child-mariam";
const WITHOUT_CONSENT = "seed-child-koffi-2";
const KARA_CHILD = "seed-child-ibrahim";

const identity = {
  firstName: "Test",
  lastInitial: "T",
  gender: "F",
  birthDate: "2017-05-02",
  schoolYear: "2026-2027",
};

describe("Espace relais (e2e)", () => {
  let app: INestApplication;
  let cookies: Record<Account, string>;
  let koffiId: string;
  let eppBe: string;
  const startedAt = new Date();
  const createdChildren: string[] = [];
  const createdNews: string[] = [];
  const createdSchools: string[] = [];
  const createdMedia: string[] = [];
  let snapshotResults: {
    id: string;
    status: "TO_ENTER" | "DRAFT" | "SENT";
    averageX100: number | null;
    rank: number | null;
    classSize: number | null;
    appreciation: string | null;
    sentAt: Date | null;
    clientUpdatedAt: Date | null;
    allowChildUpload: boolean;
    enteredById: string | null;
  }[];
  let key = 0;
  const nextKey = () => `e2e-${Date.now()}-${(key += 1)}`;

  const get = (account: Account, path: string) =>
    request(app.getHttpServer()).get(path).set("Cookie", cookies[account]);
  const post = (account: Account, path: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set("Cookie", cookies[account])
      .set("Origin", "http://localhost:3000")
      .send(body);
  const put = (account: Account, path: string, body: object) =>
    request(app.getHttpServer())
      .put(path)
      .set("Cookie", cookies[account])
      .set("Origin", "http://localhost:3000")
      .send(body);
  const del = (account: Account, path: string) =>
    request(app.getHttpServer())
      .delete(path)
      .set("Cookie", cookies[account])
      .set("Origin", "http://localhost:3000");

  const home = async () =>
    relaisHomeSchema.parse((await get("koffi", "/api/relais/home").expect(200)).body);
  const childRow = async (id: string) => {
    const { items } = relaisChildListSchema.parse(
      (await get("koffi", "/api/relais/children").expect(200)).body,
    );
    return items.find((item) => item.id === id);
  };
  async function createChild(body: object) {
    const res = await post("koffi", "/api/relais/children", { ...identity, ...body });
    if (res.status === 201) {
      createdChildren.push(res.body.child.id);
    }
    return res;
  }
  /** Fichier déjà vérifié, envoyé par ce compte, sans contenu dans le stockage. */
  async function readyMedia(userId: string): Promise<string> {
    const { id } = await prisma.media.create({
      data: {
        kind: "PHOTO",
        status: "READY",
        storageKey: `e2e/relais-${randomUUID()}.png`,
        mimeType: "image/png",
        label: "Photo",
        uploadedByUserId: userId,
      },
      select: { id: true },
    });
    createdMedia.push(id);
    return id;
  }
  async function publish(body: object, status = 201) {
    const res = await post("koffi", "/api/relais/news", {
      type: "SEVERAL_CHILDREN",
      childIds: [AICHA, KOFI],
      title: "Nouvelle de test",
      body: "Texte de la nouvelle de test",
      idempotencyKey: nextKey(),
      ...body,
    }).expect(status);
    if (res.status === 201) {
      createdNews.push(res.body.id);
    }
    return res;
  }
  const feedOf = async (account: Account, childId: string) =>
    feedPageSchema.parse(
      (await get(account, `/api/parrain/filleuls/${childId}/nouvelles?limit=50`).expect(200)).body,
    ).items;

  const currentPeriodId = async () => {
    const { periodId } = relaisResultsSchema.parse(
      (await get("koffi", "/api/relais/results").expect(200)).body,
    );
    return periodId!;
  };
  const saveResult = (period: string, childId: string, body: object) =>
    put("koffi", `/api/relais/results/${period}/${childId}`, {
      averageX100: null,
      rank: null,
      classSize: null,
      appreciation: null,
      clientUpdatedAt: new Date().toISOString(),
      ...body,
    });

  beforeAll(async () => {
    snapshotResults = await prisma.schoolResult.findMany({
      where: { childId: { in: [AICHA, KOFI, ESTHER, MARIAM, YAO] } },
      select: {
        id: true,
        status: true,
        averageX100: true,
        rank: true,
        classSize: true,
        appreciation: true,
        sentAt: true,
        clientUpdatedAt: true,
        allowChildUpload: true,
        enteredById: true,
      },
    });
    app = await createTestApp();
    cookies = await signInAll(app, [
      "claire",
      "paul",
      "helene",
      "marc",
      "koffi",
      "diallo",
      "bureau",
    ]);
    koffiId = await userIdOf("koffi");
    const school = await prisma.school.findFirstOrThrow({
      where: { relaisId: "seed-relais-koffi", shortName: "EPP Bè" },
      select: { id: true },
    });
    eppBe = school.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityType: "Child", entityId: { in: createdChildren } },
    });
    await prisma.schoolResult.deleteMany({ where: { childId: { in: createdChildren } } });
    // Lignes créées par ces tests sur une période sans résultat du seed.
    await prisma.schoolResult.deleteMany({
      where: {
        child: { relaisId: "seed-relais-koffi" },
        createdAt: { gte: startedAt },
        NOT: { id: { startsWith: "seed-" } },
      },
    });
    await prisma.newsPost.deleteMany({ where: { id: { in: createdNews } } });
    await prisma.child.deleteMany({ where: { id: { in: createdChildren } } });
    await prisma.media.deleteMany({ where: { id: { in: createdMedia } } });
    await prisma.school.deleteMany({ where: { id: { in: createdSchools } } });
    await prisma.$transaction(
      snapshotResults.map(({ id, ...data }) => prisma.schoolResult.update({ where: { id }, data })),
    );
    await app.close();
  });

  describe("accès", () => {
    it.each(["claire", "bureau"] as const)("refuse l'espace à %s (403)", async (account) => {
      await get(account, "/api/relais/home").expect(403);
      await get(account, "/api/relais/children").expect(403);
      await get(account, `/api/relais/children/${AICHA}`).expect(403);
      await get(account, "/api/relais/results").expect(403);
      await post(account, "/api/relais/news", {}).expect(403);
    });

    it("cache l'enfant d'un autre relais (404), sans rien révéler", async () => {
      await get("koffi", `/api/relais/children/${KARA_CHILD}`).expect(404);
      await post("koffi", `/api/relais/children/${KARA_CHILD}/code`).expect(404);
      await get("diallo", `/api/relais/children/${AICHA}`).expect(404);
      const period = await currentPeriodId();
      await saveResult(period, KARA_CHILD, { averageX100: 1200 }).expect(404);
    });

    it("ne liste que ses enfants, sans e-mail ni adresse de parrain", async () => {
      const res = await get("koffi", "/api/relais/children").expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const { items } = relaisChildListSchema.parse(res.body);
      expect(items.map((item) => item.id)).toContain(AICHA);
      expect(items.map((item) => item.id)).not.toContain(KARA_CHILD);
      expect(JSON.stringify(res.body)).not.toMatch(/@|rue des Tilleuls|\+228/);
    });
  });

  describe("accueil", () => {
    it("compte les enfants et donne la fraîcheur des nouvelles", async () => {
      const data = await home();
      const followed = data.children.filter((c) => c.fileStatus !== "DRAFT");
      expect(data.stats.childCount).toBe(followed.length);
      expect(data.stats.childCount).toBeGreaterThanOrEqual(18);
      expect(data.stats.unreadMessages).toBe(1);
      expect(data.bulletinsDue).not.toBeNull();

      const kofi = data.children.find((c) => c.id === KOFI)!;
      expect(kofi).toMatchObject({
        name: "Kofi A.",
        className: "CE2",
        schoolName: "EPP Bè",
        parrains: ["Claire M.", "Paul D."],
        consentMedia: true,
      });
      const esther = data.children.find((c) => c.id === ESTHER)!;
      expect(esther).toMatchObject({ fileStatus: "SUBMITTED", parrains: [], parrainIds: [] });
      // Par ordre alphabétique.
      const names = data.children.map((c) => c.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "fr")));
    });

    it("prend en compte un résultat envoyé comme une nouvelle", async () => {
      const aicha = await childRow(AICHA);
      const result = await prisma.schoolResult.findFirstOrThrow({
        where: { childId: AICHA, status: "SENT" },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      });
      expect(aicha!.lastNewsAt).toBe(result.sentAt!.toISOString());
    });
  });

  describe("dossier d'un enfant", () => {
    it("enregistre un brouillon avec la seule identité, sans code", async () => {
      const res = await createChild({ action: "draft" });
      expect(res.status).toBe(201);
      const { child, code } = saveChildResultSchema.parse(res.body);
      expect(code).toBeNull();
      expect(child).toMatchObject({ fileStatus: "DRAFT", firstName: "Test", hasCode: false });
      const row = await prisma.child.findUniqueOrThrow({ where: { id: child.id } });
      expect(row).toMatchObject({ createdById: koffiId, relaisId: "seed-relais-koffi" });
      expect(row.codeHash).toBeNull();
      expect((await childRow(child.id))?.fileStatus).toBe("DRAFT");
    });

    it("refuse d'envoyer un dossier incomplet, et dit quoi compléter", async () => {
      const res = await createChild({ action: "submit" });
      expect(res.status).toBe(422);
      expect(Object.keys(res.body.fieldErrors).sort()).toEqual([
        "className",
        "consentSponsorship",
        "district",
        "guardianName",
        "guardianPhone",
        "schoolId",
      ]);
    });

    it("refuse une date de naissance impossible", async () => {
      const future = await createChild({ action: "draft", birthDate: "2090-01-01" });
      expect(future.status).toBe(422);
      expect(future.body.fieldErrors.birthDate).toBeDefined();
      const tooOld = await createChild({ action: "draft", birthDate: "1950-01-01" });
      expect(tooOld.status).toBe(422);
    });

    it("refuse l'école d'un autre relais", async () => {
      const other = await prisma.school.findFirstOrThrow({
        where: { relaisId: { not: "seed-relais-koffi" } },
        select: { id: true },
      });
      const res = await createChild({ action: "draft", schoolId: other.id });
      expect(res.status).toBe(422);
      expect(res.body.fieldErrors.schoolId).toBeDefined();
    });

    const complete = () => ({
      district: "Bè, Lomé",
      schoolId: eppBe,
      className: "CE1",
      guardianName: "Mme T.",
      guardianPhone: "+228 90 12 34 56",
      consentSponsorship: true,
    });

    it("envoie le dossier : code du serveur, haché, bureau prévenu, accords tracés", async () => {
      const proposalRes = await get("koffi", "/api/relais/child-code").expect(200);
      expect(proposalRes.headers["cache-control"]).toBe("private, no-store");
      const proposal = childCodeProposalSchema.parse(proposalRes.body);
      const known = await messageIds(ACCOUNTS.bureau);

      const res = await createChild({
        ...complete(),
        firstName: "Secretine",
        consentMedia: true,
        action: "submit",
        codeToken: proposal.token,
      });
      expect(res.status).toBe(201);
      const { child, code } = saveChildResultSchema.parse(res.body);
      expect(code).toEqual(proposal.images);
      expect(child).toMatchObject({ fileStatus: "SUBMITTED", hasCode: true });

      // Le code ne se relit jamais, et son empreinte ne sort pas de l'API.
      const detail = await get("koffi", `/api/relais/children/${child.id}`).expect(200);
      expect(JSON.stringify(detail.body)).not.toMatch(/argon2|codeHash|SOLEIL|ARBRE/);
      const row = await prisma.child.findUniqueOrThrow({ where: { id: child.id } });
      expect(row.codeHash).toMatch(/^\$argon2id\$/);
      expect(await verifyChildCode(row.codeHash!, code!, getEnv().CHILD_CODE_PEPPER)).toBe(true);

      const mail = await waitForNewMessage(ACCOUNTS.bureau, known);
      expect(mail.subject).toBe("Un dossier d'enfant à vérifier");
      expect(`${mail.text}${mail.html}`).not.toContain("Secretine");

      const consents = await prisma.consentRecord.findMany({ where: { childId: child.id } });
      expect(consents.map((c) => c.type).sort()).toEqual(["MEDIA", "SPONSORSHIP"]);
      expect(consents.every((c) => c.recordedById === koffiId && c.textVersion === "2026-10")).toBe(
        true,
      );
      const actions = await prisma.auditLog.findMany({
        where: { entityType: "Child", entityId: child.id },
        select: { action: true, metadata: true },
      });
      expect(actions.map((a) => a.action).sort()).toEqual([
        "child.consent",
        "child.consent",
        "child.submit",
      ]);
      expect(JSON.stringify(actions)).not.toMatch(/\+228|Secretine/);
    });

    it("ne se laisse pas imposer un code : un jeton trafiqué est remplacé", async () => {
      const proposal = childCodeProposalSchema.parse(
        (await get("koffi", "/api/relais/child-code").expect(200)).body,
      );
      const forged = `COEUR.ETOILE.MAISON.${proposal.token.split(".").slice(3).join(".")}`;
      const res = await createChild({ ...complete(), action: "submit", codeToken: forged });
      expect(res.status).toBe(201);
      const { code, child } = saveChildResultSchema.parse(res.body);
      const row = await prisma.child.findUniqueOrThrow({ where: { id: child.id } });
      expect(await verifyChildCode(row.codeHash!, code!, getEnv().CHILD_CODE_PEPPER)).toBe(true);
      expect(
        await verifyChildCode(row.codeHash!, ["COEUR", "ETOILE", "MAISON"], "x".repeat(40)),
      ).toBe(false);
    });

    it("trace le retrait d'un accord et garde le dossier complet", async () => {
      const created = await createChild({
        ...complete(),
        consentMedia: true,
        action: "submit",
      });
      const { child } = saveChildResultSchema.parse(created.body);
      const update = (body: object) =>
        post("koffi", `/api/relais/children/${child.id}`, {
          ...identity,
          ...complete(),
          action: "submit",
          ...body,
        });

      const withdrawn = await update({ consentMedia: false }).expect(200);
      expect(withdrawn.body.child.consentMedia).toBe(false);
      expect(withdrawn.body.code).toBeNull();
      const media = await prisma.consentRecord.findFirstOrThrow({
        where: { childId: child.id, type: "MEDIA" },
      });
      expect(media.withdrawnAt).not.toBeNull();

      // Un nouvel accord ouvre une nouvelle ligne.
      await update({ consentMedia: true }).expect(200);
      const records = await prisma.consentRecord.findMany({
        where: { childId: child.id, type: "MEDIA" },
      });
      expect(records).toHaveLength(2);

      // Un dossier envoyé ne peut pas redevenir incomplet.
      const broken = await update({ consentSponsorship: false, action: "draft" }).expect(422);
      expect(broken.body.fieldErrors.consentSponsorship).toBeDefined();
    });

    it("joint photo et autorisation, et remplace l'ancienne photo", async () => {
      const photo = await readyMedia(koffiId);
      const document = await readyMedia(koffiId);
      const res = await createChild({
        action: "draft",
        photoMediaId: photo,
        consentDocumentId: document,
      });
      expect(res.status).toBe(201);
      const { child } = saveChildResultSchema.parse(res.body);
      expect(child.photo).toMatchObject({ id: photo, kind: "AVATAR", label: "Photo de Test" });
      expect(child.consentDocument).toMatchObject({ id: document, kind: "CONSENT" });

      const replacement = await readyMedia(koffiId);
      const updated = await post("koffi", `/api/relais/children/${child.id}`, {
        ...identity,
        action: "draft",
        photoMediaId: replacement,
        consentDocumentId: document,
      }).expect(200);
      expect(updated.body.child.photo.id).toBe(replacement);
      const old = await prisma.media.findUniqueOrThrow({ where: { id: photo } });
      expect(old.status).toBe("REJECTED");
    });

    it("refuse un fichier d'un autre compte, ou déjà utilisé", async () => {
      const foreign = await readyMedia(await userIdOf("diallo"));
      expect((await createChild({ action: "draft", photoMediaId: foreign })).status).toBe(422);
      const used = await readyMedia(koffiId);
      expect((await createChild({ action: "draft", photoMediaId: used })).status).toBe(201);
      expect((await createChild({ action: "draft", consentDocumentId: used })).status).toBe(422);
    });

    it("attribue un nouveau code une fois, et invalide l'ancien", async () => {
      const created = await createChild({ ...complete(), action: "submit" });
      const { child, code } = saveChildResultSchema.parse(created.body);
      const reset = childCodeResetSchema.parse(
        (await post("koffi", `/api/relais/children/${child.id}/code`).expect(200)).body,
      );
      const row = await prisma.child.findUniqueOrThrow({ where: { id: child.id } });
      const pepper = getEnv().CHILD_CODE_PEPPER;
      expect(await verifyChildCode(row.codeHash!, reset.images, pepper)).toBe(true);
      if (reset.images.join() !== code!.join()) {
        expect(await verifyChildCode(row.codeHash!, code!, pepper)).toBe(false);
      }
      const audit = await prisma.auditLog.count({
        where: { entityType: "Child", entityId: child.id, action: "child.code_reset" },
      });
      expect(audit).toBe(1);

      const draft = await createChild({ action: "draft" });
      await post("koffi", `/api/relais/children/${draft.body.child.id}/code`).expect(409);
    });

    it("ajoute une école, sans doublon", async () => {
      const name = `École e2e ${Date.now()}`;
      const res = await post("koffi", "/api/relais/schools", {
        shortName: name,
        level: "PRIMAIRE",
      }).expect(201);
      createdSchools.push(res.body.id);
      expect(res.body).toMatchObject({ shortName: name, fullName: name, city: "Lomé" });
      const { items } = schoolListSchema.parse(
        (await get("koffi", "/api/relais/schools").expect(200)).body,
      );
      expect(items.map((s) => s.shortName)).toContain(name);
      await post("koffi", "/api/relais/schools", { shortName: name, level: "PRIMAIRE" }).expect(
        409,
      );
    });
  });

  describe("nouvelles", () => {
    it("atteint les parrains de chaque enfant, une fois chacun, par un lien", async () => {
      const photos = [await readyMedia(koffiId), await readyMedia(koffiId)];
      const known = {
        claire: await messageIds(ACCOUNTS.claire),
        paul: await messageIds(ACCOUNTS.paul),
        marc: await messageIds(ACCOUNTS.marc),
        helene: await messageIds(ACCOUNTS.helene),
      };
      const title = "Remise des kits scolaires e2e";
      const res = await publish({
        title,
        body: "SECRET-de-la-nouvelle : les enfants ont reçu leurs cahiers.",
        childIds: [AICHA, KOFI, YAO, MARIAM, "seed-child-koffi-1", "seed-child-koffi-3"],
        mediaIds: photos,
      });
      const news = createdNewsSchema.parse(res.body);
      expect(news).toMatchObject({ status: "PUBLISHED", childCount: 6 });
      expect(news.parrainCount).toBeGreaterThanOrEqual(5);

      for (const [account, childId] of [
        ["claire", AICHA],
        ["paul", KOFI],
        ["marc", YAO],
        ["helene", MARIAM],
      ] as const) {
        const feed = await feedOf(account, childId);
        const item = feed.find((entry) => entry.type === "news" && entry.title === title);
        expect(item, account).toBeDefined();
        expect(item).toMatchObject({ media: [{ kind: "PHOTO" }, { kind: "PHOTO" }] });
        const mail = await waitForNewMessage(ACCOUNTS[account], known[account]);
        expect(mail.subject).toBe("Une nouvelle de votre relais sur Parrainage LRT");
        expect(`${mail.text}${mail.html}`).not.toContain("SECRET-de-la-nouvelle");
      }
    });

    it("ne rejoue pas une publication (même clé : même nouvelle, sans second e-mail)", async () => {
      const idempotencyKey = nextKey();
      const before = await messageIds(ACCOUNTS.claire);
      const first = await publish({ idempotencyKey, childIds: [AICHA, YAO] });
      await waitForNewMessage(ACCOUNTS.claire, before);
      const known = await messageIds(ACCOUNTS.claire);
      const again = await post("koffi", "/api/relais/news", {
        type: "SEVERAL_CHILDREN",
        childIds: [AICHA, YAO],
        title: "Nouvelle de test",
        body: "Texte de la nouvelle de test",
        idempotencyKey,
      }).expect(200);
      expect(again.body.id).toBe(first.body.id);
      await expect(waitForNewMessage(ACCOUNTS.claire, known, 600)).rejects.toThrow();
    });

    it("refuse un enfant d'un autre relais, un brouillon, ou un fichier étranger", async () => {
      await publish({ childIds: [AICHA, KARA_CHILD] }, 422);
      const draft = await createChild({ action: "draft" });
      await publish({ childIds: [AICHA, draft.body.child.id] }, 422);
      const foreign = await readyMedia(await userIdOf("diallo"));
      await publish({ mediaIds: [foreign] }, 422);
      const missing = await post("koffi", "/api/relais/news", {
        type: "SEVERAL_CHILDREN",
        childIds: [AICHA],
        title: "x",
        body: "y",
        idempotencyKey: nextKey(),
      }).expect(400);
      expect(JSON.stringify(missing.body)).toMatch(/au moins deux enfants/);
    });

    it("cache les médias au parrain d'un enfant sans consentement, pas le texte", async () => {
      const row = await prisma.sponsorship.findFirstOrThrow({
        where: { childId: WITHOUT_CONSENT, status: "ACTIVE" },
        select: { parrain: { select: { user: { select: { email: true } } } } },
      });
      expect(row.parrain.user.email).toBeTruthy();
      const photo = await readyMedia(koffiId);
      const res = await publish({
        type: "ONE_CHILD",
        childIds: [WITHOUT_CONSENT],
        mediaIds: [photo],
      });
      const media = await prisma.media.findUniqueOrThrow({
        where: { id: photo },
        select: { newsPostId: true },
      });
      expect(media.newsPostId).toBe(res.body.id);
    });

    it("n'affiche pas aux parrains une nouvelle qui ne leur est pas adressée", async () => {
      const title = `Pour le bureau ${Date.now()}`;
      const known = await messageIds(ACCOUNTS.claire);
      await publish({ title, notifyParrains: false, notifyBureau: true });
      const feed = await feedOf("claire", AICHA);
      expect(feed.some((entry) => entry.type === "news" && entry.title === title)).toBe(false);
      await expect(waitForNewMessage(ACCOUNTS.claire, known, 500)).rejects.toThrow();
      await publish({ notifyParrains: false, notifyBureau: false, visibleToChildren: false }, 400);
    });

    it("« Vie du relais » concerne tous ses enfants suivis", async () => {
      const res = await publish({ type: "RELAIS_LIFE", childIds: [] });
      const links = await prisma.newsPostChild.findMany({
        where: { newsPostId: res.body.id },
        select: { child: { select: { relaisId: true, fileStatus: true } } },
      });
      expect(links.length).toBeGreaterThanOrEqual(18);
      expect(links.every((l) => l.child.relaisId === "seed-relais-koffi")).toBe(true);
      expect(links.every((l) => l.child.fileStatus !== "DRAFT")).toBe(true);
    });

    it("paraît à l'heure programmée, une seule fois, puis prévient les parrains", async () => {
      const at = now();
      const scheduledAt = new Date(at.getTime() + 2 * 3600 * 1000);
      const title = `Programmée ${Date.now()}`;
      const res = await publish({
        title,
        childIds: [AICHA, YAO],
        scheduledAt: scheduledAt.toISOString(),
      });
      expect(createdNewsSchema.parse(res.body)).toMatchObject({
        status: "SCHEDULED",
        publishedAt: null,
      });
      const list = scheduledNewsListSchema.parse(
        (await get("koffi", "/api/relais/news/scheduled").expect(200)).body,
      );
      expect(list.items.map((i) => i.title)).toContain(title);
      const shownToClaire = async () =>
        (await feedOf("claire", AICHA)).some((e) => e.type === "news" && e.title === title);
      expect(await shownToClaire()).toBe(false);

      const publisher = app.get(NewsService);
      const known = await messageIds(ACCOUNTS.claire);
      await publisher.publishDue(new Date(scheduledAt.getTime() - 1000));
      expect(await prisma.newsPost.findUniqueOrThrow({ where: { id: res.body.id } })).toMatchObject(
        { status: "SCHEDULED" },
      );

      expect(await publisher.publishDue(scheduledAt)).toBeGreaterThanOrEqual(1);
      expect(await prisma.newsPost.findUniqueOrThrow({ where: { id: res.body.id } })).toMatchObject(
        { status: "PUBLISHED", publishedAt: scheduledAt },
      );
      const mail = await waitForNewMessage(ACCOUNTS.claire, known);
      expect(mail.subject).toBe("Une nouvelle de votre relais sur Parrainage LRT");
      expect(await publisher.publishDue(scheduledAt)).toBe(0);
    });

    it("refuse une date passée ou trop lointaine, et annule une nouvelle programmée", async () => {
      const at = now();
      await publish({ scheduledAt: new Date(at.getTime() - 60_000).toISOString() }, 422);
      await publish(
        { scheduledAt: new Date(at.getTime() + 400 * 24 * 3600 * 1000).toISOString() },
        422,
      );
      const photo = await readyMedia(koffiId);
      const res = await publish({
        scheduledAt: new Date(at.getTime() + 3600 * 1000).toISOString(),
        mediaIds: [photo],
      });
      await del("diallo", `/api/relais/news/${res.body.id}`).expect(404);
      await del("koffi", `/api/relais/news/${res.body.id}`).expect(204);
      await del("koffi", `/api/relais/news/${res.body.id}`).expect(404);
      // Le fichier, détaché, est de nouveau sans usage (purge après 24 h).
      const media = await prisma.media.findUniqueOrThrow({ where: { id: photo } });
      expect(media.newsPostId).toBeNull();
    });
  });

  describe("résultats", () => {
    const sheet = async (query = "") =>
      relaisResultsSchema.parse(
        (await get("koffi", `/api/relais/results${query}`).expect(200)).body,
      );

    it("ouvre la période en cours et l'école la plus nombreuse", async () => {
      const data = await sheet();
      expect(data.periods.length).toBeGreaterThanOrEqual(3);
      expect(data.periods[0]!.label).toBe(
        `1er trimestre ${schoolYearOf(now()).replace(/^(\d{4})-\d{2}/, "$1-")}`,
      );
      expect(data.schoolId).toBe(eppBe);
      expect(data.schools.find((s) => s.id === eppBe)?.childCount).toBe(data.rows.length);
      const aicha = data.rows.find((r) => r.childId === AICHA);
      expect(aicha).toMatchObject({ name: "Aïcha S.", className: "CM2", status: "SENT" });
      expect(aicha?.bulletins.map((b) => b.kind)).toEqual(["BULLETIN"]);
    });

    it("passe de « À saisir » à « Brouillon », et revient en arrière si tout est vidé", async () => {
      const period = await currentPeriodId();
      const row = await saveResult(period, ESTHER, {
        averageX100: 1275,
        rank: 3,
        classSize: 40,
        appreciation: "  Très bien  ",
      }).expect(200);
      expect(resultRowSchema.parse(row.body)).toMatchObject({
        status: "DRAFT",
        averageX100: 1275,
        rank: 3,
        classSize: 40,
        appreciation: "Très bien",
      });
      const emptied = await saveResult(period, ESTHER, {}).expect(200);
      expect(emptied.body.status).toBe("TO_ENTER");
    });

    it("refuse une saisie plus ancienne que l'enregistrée (409)", async () => {
      const period = await currentPeriodId();
      const later = new Date(Date.now() + 60_000).toISOString();
      const earlier = new Date(Date.now() - 60_000).toISOString();
      await saveResult(period, ESTHER, { averageX100: 1100, clientUpdatedAt: later }).expect(200);
      const stale = await saveResult(period, ESTHER, {
        averageX100: 900,
        clientUpdatedAt: earlier,
      }).expect(409);
      expect(stale.body.message).toMatch(/plus récente/);
      const { rows } = await sheet();
      expect(rows.find((r) => r.childId === ESTHER)?.averageX100).toBe(1100);
      // La même saisie rejouée passe, sans rien changer.
      await saveResult(period, ESTHER, { averageX100: 1100, clientUpdatedAt: later }).expect(200);
      await saveResult(period, ESTHER, {
        clientUpdatedAt: new Date(Date.now() + 120_000).toISOString(),
      }).expect(200);
    });

    it("refuse une note hors barème et un rang au-delà de l'effectif", async () => {
      const period = await currentPeriodId();
      await saveResult(period, ESTHER, { averageX100: 2500 }).expect(400);
      await saveResult(period, ESTHER, { rank: 50, classSize: 40 }).expect(400);
    });

    it("n'envoie rien tant que ce n'est pas demandé, puis Claire voit le résultat", async () => {
      const period = await currentPeriodId();
      const dashboard = async () =>
        filleulDashboardSchema.parse(
          (await get("claire", `/api/parrain/filleuls/${KOFI}`).expect(200)).body,
        );
      await saveResult(period, KOFI, {
        averageX100: 1090,
        rank: 21,
        classSize: 52,
        appreciation: "Doit participer davantage à l'oral.",
      }).expect(200);
      expect((await dashboard()).results.current).toBeNull();

      const known = await messageIds(ACCOUNTS.claire);
      const sent = sendResultsResultSchema.parse(
        (await post("koffi", `/api/relais/results/${period}/send`, { schoolId: eppBe }).expect(200))
          .body,
      );
      expect(sent.sent).toBeGreaterThanOrEqual(1);
      const results = (await dashboard()).results;
      expect(results.current?.averageX100).toBe(1090);
      const mail = await waitForNewMessage(ACCOUNTS.claire, known);
      expect(mail.subject).toBe("De nouveaux résultats scolaires sur Parrainage LRT");
      expect(`${mail.text}${mail.html}`).not.toMatch(/10,9|oral/);

      // Corrigé après l'envoi : reste envoyé, mais ne peut pas perdre sa moyenne.
      const corrected = await saveResult(period, KOFI, { averageX100: 1120 }).expect(200);
      expect(corrected.body.status).toBe("SENT");
      await saveResult(period, KOFI, { averageX100: null }).expect(422);
    });

    it("joint et retire une page de bulletin, sans dépasser 4 pages", async () => {
      const period = await currentPeriodId();
      const first = await readyMedia(koffiId);
      const attached = await post("koffi", `/api/relais/results/${period}/${MARIAM}/bulletin`, {
        mediaId: first,
      }).expect(200);
      expect(attached.body.bulletins.map((b: { id: string }) => b.id)).toEqual([first]);
      expect(attached.body.status).toBe("DRAFT");
      const removed = await del(
        "koffi",
        `/api/relais/results/${period}/${MARIAM}/bulletin/${first}`,
      ).expect(200);
      expect(removed.body.bulletins).toEqual([]);
      expect((await prisma.media.findUniqueOrThrow({ where: { id: first } })).status).toBe(
        "REJECTED",
      );
      const foreign = await readyMedia(await userIdOf("diallo"));
      await post("koffi", `/api/relais/results/${period}/${MARIAM}/bulletin`, {
        mediaId: foreign,
      }).expect(422);

      const pages = await Promise.all(Array.from({ length: 4 }, () => readyMedia(koffiId)));
      for (const mediaId of pages) {
        await post("koffi", `/api/relais/results/${period}/${MARIAM}/bulletin`, { mediaId }).expect(
          200,
        );
      }
      const extra = await readyMedia(koffiId);
      await post("koffi", `/api/relais/results/${period}/${MARIAM}/bulletin`, {
        mediaId: extra,
      }).expect(422);
      await prisma.media.updateMany({
        where: { id: { in: pages } },
        data: { schoolResultId: null },
      });
    });

    it("laisse les enfants sans bulletin envoyer le leur, et se retire", async () => {
      const period = await currentPeriodId();
      const body = (allowed: boolean) => ({ schoolId: eppBe, allowed });
      const allowed = await post(
        "koffi",
        `/api/relais/results/${period}/child-upload`,
        body(true),
      ).expect(200);
      expect(allowed.body.count).toBeGreaterThan(0);
      const { rows } = await sheet();
      expect(rows.find((r) => r.childId === ESTHER)?.allowChildUpload).toBe(true);
      // Aïcha a déjà son bulletin.
      expect(rows.find((r) => r.childId === AICHA)?.bulletins.length).toBeGreaterThan(0);
      await post("koffi", `/api/relais/results/${period}/child-upload`, body(false)).expect(200);
      const after = await sheet();
      expect(after.rows.find((r) => r.childId === ESTHER)?.allowChildUpload).toBe(false);
    });
  });
});
