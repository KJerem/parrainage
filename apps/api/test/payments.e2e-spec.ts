import { execSync } from "node:child_process";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import {
  monthlyAmountChangeSchema,
  type ParrainPayments,
  parrainPaymentsSchema,
  paymentHistoryItemSchema,
} from "@parrainage/contracts";
import { PDFDocument } from "pdf-lib";
import request from "supertest";
import { now } from "../src/common/clock.js";
import { simulateBank } from "../src/finance/monthly-payments.js";
import { prisma } from "../src/prisma/client.js";
import { createTestApp, WEB_ORIGIN } from "./app.js";
import { messageIds, waitForNewMessage } from "./mailpit.js";
import { type Account, ACCOUNTS, signInAll, userIdOf } from "./session.js";

vi.setConfig({ testTimeout: 30_000 });

const AICHA = "seed-child-aicha";
const KOFI = "seed-child-kofi";
const MARIAM = "seed-child-mariam";
const CLAIRE = "seed-parrain-claire";
const PAUL = "seed-parrain-paul";

/** Lit le corps binaire d'une réponse (le PDF). */
const binary = (res: request.Response, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => done(null, Buffer.concat(chunks)));
};

describe("Versements et reçus fiscaux (e2e)", () => {
  let app: INestApplication;
  let cookies: Record<Account, string>;
  // Le seed suit l'heure réelle : les attendus se calculent à partir d'aujourd'hui.
  const today = now();
  const year = today.getUTCFullYear();
  /** Prélèvements du 5 déjà passés cette année (Aïcha et Kofi, depuis janvier). */
  const debits = today.getUTCMonth() + (today.getUTCDate() >= 5 ? 1 : 0);
  const rentree = today.getTime() >= Date.UTC(year, 8, 15) ? 4000 : 0;
  const paidThisYear = debits * 5000 + rentree;

  const server = () => app.getHttpServer();
  const get = (account: Account, url: string) =>
    request(server()).get(url).set("Cookie", cookies[account]);
  const send = (method: "post" | "put", account: Account, url: string, body: object) =>
    request(server())
      [method](url)
      .set("Cookie", cookies[account])
      .set("Origin", WEB_ORIGIN)
      .send(body);
  const overview = async (account: Account, query = ""): Promise<ParrainPayments> =>
    parrainPaymentsSchema.parse(
      (await get(account, `/api/parrain/payments${query}`).expect(200)).body,
    );
  const pdf = (account: Account, receiptYear: number | string) =>
    get(account, `/api/parrain/receipts/${receiptYear}`).buffer(true).parse(binary);

  beforeAll(async () => {
    app = await createTestApp();
    cookies = await signInAll(app, ["claire", "paul", "helene", "koffi", "bureau"]);
    await prisma.fiscalReceipt.deleteMany({ where: { year: 2023 } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.fiscalReceipt.deleteMany({ where: { year: 2023 } });
    // Les suites suivantes retrouvent les montants, les versements et les reçus du seed.
    execSync("npm run db:seed", {
      cwd: path.join(import.meta.dirname, ".."),
      env: { ...process.env, SEED_RESET_MESSAGES: "1" },
      stdio: "pipe",
    });
  }, 120_000);

  describe("lecture", () => {
    it("P-Versements de Claire : mensualité, versé, réduction estimée et reçus", async () => {
      const res = await get("claire", "/api/parrain/payments").expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      const data = parrainPaymentsSchema.parse(res.body);
      expect(data.year).toBe(year);
      expect(data.monthly).toMatchObject({ totalCents: 5000, debitDay: 5, method: "SEPA_DEBIT" });
      expect(data.monthly.filleuls.map((f) => [f.firstName, f.amountCents])).toEqual([
        ["Aïcha", 2500],
        ["Kofi", 2500],
      ]);
      expect(data.paidThisYear).toEqual({
        amountCents: paidThisYear,
        debitCount: debits,
        incidentCount: 0,
      });
      expect(data.taxReduction).toEqual({
        ratePercent: 66,
        estimatedCents: Math.round(paidThisYear * 0.66),
      });
      expect(data.receipts.items).toEqual([
        { year: year - 1, amountCents: 40000, number: `${year - 1}-00001` },
        { year: year - 2, amountCents: 30000, number: `${year - 2}-00001` },
      ]);
      expect(data.receipts.pendingYear).toBe(debits > 0 ? year : null);
      expect(data.receipts.holder).toEqual({
        name: "Claire Martin",
        address: "12 rue des Tilleuls\n69003 Lyon",
      });
    });

    it("historique : les versements de Claire seulement, jamais ceux du co-parrain de Kofi", async () => {
      const data = await overview("claire");
      expect(data.history.year).toBe(year);
      expect(data.history.items).toHaveLength(debits * 2 + (rentree > 0 ? 1 : 0));
      expect(data.history.items.every((p) => [AICHA, KOFI].includes(p.child!.id))).toBe(true);
      const ids = new Set(data.history.items.map((p) => p.id));
      const paulPayments = await prisma.payment.findMany({
        where: { parrainId: PAUL },
        select: { id: true },
      });
      expect(paulPayments.length).toBeGreaterThan(0);
      expect(paulPayments.some((p) => ids.has(p.id))).toBe(false);

      const closed = await overview("claire", `?annee=${year - 1}`);
      expect(closed.history.year).toBe(year - 1);
      expect(closed.history.items).toHaveLength(16);
      expect(closed.history.years.slice(0, 3)).toEqual([year, year - 1, year - 2]);
    });

    it("refuse une année illisible ; relais et bureau n'y ont pas accès", async () => {
      await get("claire", "/api/parrain/payments?annee=deux-mille").expect(400);
      await get("koffi", "/api/parrain/payments").expect(403);
      await get("bureau", "/api/parrain/payments").expect(403);
      await get("koffi", `/api/parrain/receipts/${year - 1}`).expect(403);
    });
  });

  describe("reçus fiscaux", () => {
    it("reçu de l'année close : PDF au numéro stable, montant en lettres, téléchargement audité", async () => {
      const before = await prisma.auditLog.count({
        where: { action: "receipt.downloaded", entityId: `seed-receipt-claire-${year - 1}` },
      });
      const first = await pdf("claire", year - 1).expect(200);
      expect(first.headers["content-type"]).toBe("application/pdf");
      expect(first.headers["content-disposition"]).toBe(
        `attachment; filename="recu-fiscal-${year - 1}.pdf"`,
      );
      expect(first.headers["cache-control"]).toBe("private, no-store");
      const document = await PDFDocument.load(first.body as Buffer, { updateMetadata: false });
      expect(document.getTitle()).toBe(`Reçu fiscal ${year - 1} n° ${year - 1}-00001`);
      expect(document.getSubject()).toBe("Somme en toutes lettres : quatre cents euros");

      const second = await pdf("claire", year - 1).expect(200);
      expect((second.body as Buffer).equals(first.body as Buffer)).toBe(true);
      const after = await prisma.auditLog.count({
        where: { action: "receipt.downloaded", entityId: `seed-receipt-claire-${year - 1}` },
      });
      expect(after - before).toBe(2);
    });

    it("pas de reçu avant la fin de l'année, ni pour une année sans versement", async () => {
      const current = await get("claire", `/api/parrain/receipts/${year}`).expect(404);
      expect(current.body.message).toBe(`Le reçu ${year} sera disponible en janvier ${year + 1}`);
      const empty = await get("claire", "/api/parrain/receipts/2019").expect(404);
      expect(empty.body.message).toBe(
        "Aucun versement reçu en 2019 : pas de reçu fiscal pour cette année",
      );
      await get("claire", "/api/parrain/receipts/20a5").expect(404);
    });

    it("émet un reçu une seule fois, même demandé trois fois en même temps, au rang suivant", async () => {
      const oldGift = (parrainId: string, reference: string) => ({
        parrainId,
        kind: "ONE_OFF" as const,
        amountCents: 15000,
        method: "CHEQUE" as const,
        label: "Don ponctuel",
        dueDate: new Date("2023-12-01T00:00:00Z"),
        paidAt: new Date("2023-12-01T10:00:00Z"),
        status: "RECEIVED" as const,
        reference,
      });
      await prisma.payment.createMany({
        data: [oldGift(CLAIRE, "E2E-2023-CLAIRE"), oldGift(PAUL, "E2E-2023-PAUL")],
      });
      const downloads = await Promise.all([
        pdf("claire", 2023),
        pdf("claire", 2023),
        pdf("claire", 2023),
      ]);
      expect(downloads.map((res) => res.status)).toEqual([200, 200, 200]);
      const receipts = await prisma.fiscalReceipt.findMany({ where: { year: 2023 } });
      expect(receipts).toHaveLength(1);
      expect(receipts[0]).toMatchObject({
        parrainId: CLAIRE,
        number: "2023-00001",
        amountCents: 15000,
        methods: ["CHEQUE"],
      });
      await pdf("paul", 2023).expect(200);
      const paul = await prisma.fiscalReceipt.findUniqueOrThrow({
        where: { parrainId_year: { parrainId: PAUL, year: 2023 } },
      });
      expect(paul.number).toBe("2023-00002");
      expect((await overview("claire")).receipts.items.at(-1)).toEqual({
        year: 2023,
        amountCents: 15000,
        number: "2023-00001",
      });
    });
  });

  describe("mensualité", () => {
    it("enregistrée, auditée, appliquée au prochain prélèvement et notifiée par un simple lien", async () => {
      const known = await messageIds(ACCOUNTS.claire);
      const res = await send("post", "claire", "/api/parrain/payments/monthly-amount", {
        childId: AICHA,
        amountCents: 3000,
      }).expect(200);
      const nextMonth = new Date(
        Date.UTC(year, today.getUTCMonth() + (today.getUTCDate() < 5 ? 0 : 1), 1),
      );
      expect(monthlyAmountChangeSchema.parse(res.body)).toEqual({
        childId: AICHA,
        amountCents: 3000,
        effectivePeriodKey: nextMonth.toISOString().slice(0, 7),
      });
      const sponsorship = await prisma.sponsorship.findFirstOrThrow({
        where: { parrainId: CLAIRE, childId: AICHA },
        include: { amountChanges: true },
      });
      expect(sponsorship.monthlyAmountCents).toBe(3000);
      expect(sponsorship.amountChanges).toMatchObject([
        { fromCents: 2500, toCents: 3000, changedById: await userIdOf("claire") },
      ]);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: "sponsorship.monthly_amount_changed", entityId: sponsorship.id },
        orderBy: { createdAt: "desc" },
      });
      expect(audit.metadata).toMatchObject({ fromCents: 2500, toCents: 3000 });
      expect((await overview("claire")).monthly.totalCents).toBe(5500);

      const mail = await waitForNewMessage(ACCOUNTS.claire, known);
      expect(mail.subject).toBe("Votre mensualité a été modifiée");
      expect(mail.text).toContain("/parrain/versements");
      expect(mail.text).not.toMatch(/Aïcha|30 ?€/);

      // Même montant : rien de plus n'est enregistré.
      await send("post", "claire", "/api/parrain/payments/monthly-amount", {
        childId: AICHA,
        amountCents: 3000,
      }).expect(200);
      expect(
        await prisma.monthlyAmountChange.count({ where: { sponsorshipId: sponsorship.id } }),
      ).toBe(1);
    });

    it("refuse un montant hors bornes et le filleul d'un autre parrain", async () => {
      const low = await send("post", "claire", "/api/parrain/payments/monthly-amount", {
        childId: AICHA,
        amountCents: 500,
      }).expect(400);
      expect(low.body.fieldErrors).toEqual({ amountCents: ["La mensualité va de 10 € à 500 €"] });
      await send("post", "claire", "/api/parrain/payments/monthly-amount", {
        childId: MARIAM,
        amountCents: 3000,
      }).expect(404);
    });

    it("co-parrain : la mensualité de Paul pour Kofi ne touche pas celle de Claire", async () => {
      await send("post", "paul", "/api/parrain/payments/monthly-amount", {
        childId: KOFI,
        amountCents: 4000,
      }).expect(200);
      const amounts = await prisma.sponsorship.findMany({
        where: { childId: KOFI },
        select: { parrainId: true, monthlyAmountCents: true },
        orderBy: { parrainId: "asc" },
      });
      expect(amounts).toEqual([
        { parrainId: CLAIRE, monthlyAmountCents: 2500 },
        { parrainId: PAUL, monthlyAmountCents: 4000 },
      ]);
      const paul = await overview("paul");
      expect(paul.monthly.filleuls.map((f) => f.firstName)).toEqual(["Kofi"]);
    });
  });

  describe("moyen de paiement et dons", () => {
    it("passe à la carte, le 10 du mois", async () => {
      await send("put", "claire", "/api/parrain/payments/method", {
        method: "CARD",
        debitDay: 10,
      }).expect(200);
      const data = await overview("claire");
      expect(data.monthly).toMatchObject({ method: "CARD", debitDay: 10 });
      expect(
        await prisma.auditLog.count({
          where: { action: "parrain.payment_method_changed", entityId: CLAIRE },
        }),
      ).toBeGreaterThan(0);
      await send("put", "claire", "/api/parrain/payments/method", {
        method: "CHEQUE",
        debitDay: 10,
      }).expect(400);
      await send("put", "claire", "/api/parrain/payments/method", {
        method: "CARD",
        debitDay: 31,
      }).expect(400);
    });

    it("accepte deux dons le même jour ; rejouer la même clé renvoie le même don", async () => {
      const before = (await overview("claire")).paidThisYear.amountCents;
      const donate = (idempotencyKey: string, amountCents: number, note = "") =>
        send("post", "claire", "/api/parrain/payments/donations", {
          childId: AICHA,
          amountCents,
          note,
          idempotencyKey,
        }).expect(201);
      const first = paymentHistoryItemSchema.parse(
        (await donate("e2e-don-fournitures", 2000, "fournitures")).body,
      );
      expect(first).toMatchObject({
        kind: "ONE_OFF",
        method: "CARD",
        status: "RECEIVED",
        amountCents: 2000,
        label: "Don ponctuel · fournitures",
        date: today.toISOString().slice(0, 10),
        child: { id: AICHA, firstName: "Aïcha", lastInitial: "S" },
      });
      const replay = paymentHistoryItemSchema.parse(
        (await donate("e2e-don-fournitures", 2000, "fournitures")).body,
      );
      expect(replay.id).toBe(first.id);
      const second = paymentHistoryItemSchema.parse((await donate("e2e-don-second", 3000)).body);
      expect(second.id).not.toBe(first.id);
      expect(second.date).toBe(first.date);
      expect(second.label).toBe("Don ponctuel");
      const data = await overview("claire");
      expect(data.paidThisYear.amountCents).toBe(before + 5000);
      expect(
        data.history.items
          .slice(0, 2)
          .map((p) => p.id)
          .sort(),
      ).toEqual([first.id, second.id].sort());
    });

    it("refuse un don pour le filleul d'un autre parrain", async () => {
      await send("post", "claire", "/api/parrain/payments/donations", {
        childId: MARIAM,
        amountCents: 2000,
        idempotencyKey: "e2e-don-mariam",
      }).expect(404);
    });
  });

  describe("banque simulée", () => {
    it("crée les mensualités du mois suivant une seule fois, au montant et au jour choisis", async () => {
      const at = new Date(Date.UTC(year, today.getUTCMonth() + 1, 20, 12));
      const active = await prisma.sponsorship.count({
        where: { status: "ACTIVE", startDate: { lte: at } },
      });
      const first = await simulateBank(prisma, at);
      expect(first.created).toBe(active);
      const periodKey = at.toISOString().slice(0, 7);
      const aicha = await prisma.payment.findFirstOrThrow({
        where: { parrainId: CLAIRE, childId: AICHA, periodKey },
      });
      expect(aicha).toMatchObject({
        amountCents: 3000,
        method: "CARD",
        status: "RECEIVED",
        dueDate: new Date(`${periodKey}-10T00:00:00Z`),
      });
      expect(await simulateBank(prisma, at)).toEqual({ created: 0, settled: 0 });
    });
  });
});
