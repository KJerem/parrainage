import type { INestApplication } from "@nestjs/common";
import {
  UPLOAD_PART_SIZE,
  uploadedMediaSchema,
  uploadPartsSchema,
  type UploadTicket,
  uploadTicketSchema,
} from "@parrainage/contracts";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import request from "supertest";
import { prisma } from "../src/prisma/client.js";
import { StorageService } from "../src/storage/storage.service.js";
import { createTestApp } from "./app.js";
import {
  GPS_EXIF,
  jpegWithGps,
  largePng,
  PDF_INFO,
  pdfWithInfo,
  probe,
  VIDEO_METADATA,
  videoWithMetadata,
} from "./media-fixtures.js";
import { type Account, signInAll } from "./session.js";

// Stockage RustFS démarré (npm run db:up), avec CORS pour l'origine des tests web (3100).
const NOT_FOUND = { statusCode: 404, error: "Introuvable", message: "Introuvable" };

describe("Envois de fichiers (e2e)", () => {
  let app: INestApplication;
  let storage: StorageService;
  let cookies: Record<Account, string>;
  const created: string[] = [];

  const post = (account: Account, path: string, body?: object) =>
    request(app.getHttpServer())
      .post(path)
      .set("Cookie", cookies[account])
      .set("Origin", "http://localhost:3000")
      .send(body ?? {});
  const get = (account: Account, path: string) =>
    request(app.getHttpServer()).get(path).set("Cookie", cookies[account]);

  async function start(
    account: Account,
    body: { kind: string; mimeType: string; sizeBytes: number },
  ): Promise<UploadTicket> {
    const res = await post(account, "/api/uploads", {
      purpose: "message",
      fileName: "IMG_0001 Claire Martin 0639981234.bin",
      ...body,
    }).expect(201);
    const ticket = uploadTicketSchema.parse(res.body);
    created.push(ticket.mediaId);
    return ticket;
  }

  /** Dépôt direct dans le stockage, comme le navigateur. */
  async function putSingle(
    ticket: UploadTicket,
    body: Buffer,
    headers?: Record<string, string>,
  ): Promise<number> {
    if (ticket.mode !== "single") {
      throw new Error("Envoi simple attendu");
    }
    const res = await fetch(ticket.url, {
      method: "PUT",
      body: new Uint8Array(body),
      headers: headers ?? ticket.headers,
    });
    return res.status;
  }

  /** Fichier servi par GET /api/media/:id (redirection vers l'URL présignée). */
  async function download(account: Account, mediaId: string): Promise<Buffer> {
    const res = await get(account, `/api/media/${mediaId}`).expect(302);
    const file = await fetch(res.headers.location!);
    expect(file.status).toBe(200);
    return Buffer.from(await file.arrayBuffer());
  }

  beforeAll(async () => {
    app = await createTestApp();
    storage = app.get(StorageService);
    cookies = await signInAll(app, ["claire", "paul", "koffi", "bureau"]);
  });

  afterAll(async () => {
    const rows = await prisma.media.findMany({
      where: { id: { in: created } },
      select: { storageKey: true, uploadId: true },
    });
    for (const row of rows) {
      if (row.storageKey) {
        if (row.uploadId) {
          await storage.abortMultipartUpload(row.storageKey, row.uploadId).catch(() => {});
        }
        await storage.deleteObject(row.storageKey).catch(() => {});
      }
    }
    await prisma.media.deleteMany({ where: { id: { in: created } } });
    await app.close();
  });

  describe("POST /api/uploads", () => {
    it("refuse un type hors liste (422), un fichier trop lourd (413) et le bureau (403)", async () => {
      const base = { purpose: "message", fileName: "a.gif", kind: "PHOTO", sizeBytes: 1000 };
      const gif = await post("claire", "/api/uploads", { ...base, mimeType: "image/gif" });
      expect(gif.status).toBe(422);
      expect(gif.body.message).toBe("Type de fichier non autorisé");
      const heavy = await post("claire", "/api/uploads", {
        ...base,
        mimeType: "image/jpeg",
        sizeBytes: 11 * 1024 * 1024,
      });
      expect(heavy.status).toBe(413);
      expect(heavy.body.message).toBe("Fichier trop volumineux : 10 Mo maximum pour une photo");
      await post("bureau", "/api/uploads", { ...base, mimeType: "image/jpeg" }).expect(403);
      const invalid = await post("claire", "/api/uploads", { ...base, sizeBytes: -1 });
      expect(invalid.status).toBe(400);
      expect(invalid.body.fieldErrors).toHaveProperty("sizeBytes");
    });
  });

  describe("envoi simple (≤ 5 Mo)", () => {
    it("dépose une photo, retire EXIF et GPS, et la réserve à son auteur", async () => {
      const photo = await jpegWithGps();
      const ticket = await start("claire", {
        kind: "PHOTO",
        mimeType: "image/jpeg",
        sizeBytes: photo.length,
      });
      expect(ticket.mode).toBe("single");
      expect(ticket.mode === "single" && ticket.headers).toEqual({ "Content-Type": "image/jpeg" });
      const url = new URL(ticket.mode === "single" ? ticket.url : "");
      expect(url.origin).toBe("http://localhost:9000");
      expect(url.pathname).toMatch(
        new RegExp(`/media/uploads/\\d{4}/\\d{2}/${ticket.mediaId}\\.jpg$`),
      );
      expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
      expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");

      // Un autre type ou une autre taille que ceux déclarés : refusé par le stockage.
      expect(await putSingle(ticket, photo, { "Content-Type": "image/png" })).toBe(403);
      expect(await putSingle(ticket, photo)).toBe(200);

      const pending = await prisma.media.findUniqueOrThrow({ where: { id: ticket.mediaId } });
      expect(pending).toMatchObject({ status: "PENDING_UPLOAD", label: "Photo", kind: "PHOTO" });
      // Le nom du fichier n'est conservé nulle part.
      expect(JSON.stringify(pending)).not.toContain("0639981234");

      await post("paul", `/api/uploads/${ticket.mediaId}/complete`).expect(404);
      const res = await post("claire", `/api/uploads/${ticket.mediaId}/complete`).expect(200);
      const media = uploadedMediaSchema.parse(res.body);
      expect(media).toMatchObject({ id: ticket.mediaId, status: "READY", width: 48, height: 64 });

      const clean = await download("claire", ticket.mediaId);
      expect(clean.length).toBe(media.sizeBytes);
      const metadata = await sharp(clean).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(clean.toString("latin1")).not.toContain(GPS_EXIF.IFD0.Model);
      // Pas encore joint à un message : personne d'autre ne le voit.
      expect((await get("paul", `/api/media/${ticket.mediaId}`).expect(404)).body).toEqual(
        NOT_FOUND,
      );
      // Terminer deux fois renvoie le même média.
      const again = await post("claire", `/api/uploads/${ticket.mediaId}/complete`).expect(200);
      expect(again.body).toEqual(res.body);
    });

    it("nettoie une vidéo mp4 (lieu, titre) et mesure sa durée", async () => {
      const video = await videoWithMetadata("mp4", { seconds: 2 });
      const ticket = await start("koffi", {
        kind: "VIDEO",
        mimeType: "video/mp4",
        sizeBytes: video.length,
      });
      expect(await putSingle(ticket, video)).toBe(200);
      const res = await post("koffi", `/api/uploads/${ticket.mediaId}/complete`).expect(200);
      expect(res.body).toMatchObject({ kind: "VIDEO", status: "READY", durationSec: 2 });
      const log = await probe(await download("koffi", ticket.mediaId), "mp4");
      for (const value of Object.values(VIDEO_METADATA)) {
        expect(log).not.toContain(value);
      }
    });

    it("vide le dictionnaire Info d'un PDF (titre, auteur, logiciels)", async () => {
      const pdf = await pdfWithInfo();
      const ticket = await start("koffi", {
        kind: "DOCUMENT",
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
      });
      expect(await putSingle(ticket, pdf)).toBe(200);
      await post("koffi", `/api/uploads/${ticket.mediaId}/complete`).expect(200);
      const clean = await download("koffi", ticket.mediaId);
      const reloaded = await PDFDocument.load(clean, { updateMetadata: false });
      expect([reloaded.getTitle(), reloaded.getAuthor(), reloaded.getProducer()]).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
      expect(clean.toString("latin1")).not.toContain(PDF_INFO.author);
    });

    it("refuse un PDF déclaré comme image : fichier supprimé, média REJECTED (422)", async () => {
      const pdf = await pdfWithInfo();
      const ticket = await start("claire", {
        kind: "PHOTO",
        mimeType: "image/png",
        sizeBytes: pdf.length,
      });
      expect(await putSingle(ticket, pdf)).toBe(200);
      const key = (await prisma.media.findUniqueOrThrow({ where: { id: ticket.mediaId } }))
        .storageKey!;
      const res = await post("claire", `/api/uploads/${ticket.mediaId}/complete`).expect(422);
      expect(res.body).toMatchObject({ statusCode: 422, message: "Type de fichier non autorisé" });
      expect(await prisma.media.findUniqueOrThrow({ where: { id: ticket.mediaId } })).toMatchObject(
        { status: "REJECTED", storageKey: null },
      );
      expect(await storage.objectSize(key)).toBeNull();
      await post("claire", `/api/uploads/${ticket.mediaId}/complete`).expect(409);
    });

    it("attend le fichier avant de le vérifier (409)", async () => {
      const ticket = await start("claire", {
        kind: "DOCUMENT",
        mimeType: "application/pdf",
        sizeBytes: 1200,
      });
      const res = await post("claire", `/api/uploads/${ticket.mediaId}/complete`).expect(409);
      expect(res.body.message).toBe("Le fichier n'a pas encore été reçu : relancez son envoi");
    });
  });

  describe("envoi multipart (> 5 Mo)", () => {
    it("reprend après une coupure : seules les parts manquantes sont renvoyées", async () => {
      const png = await largePng();
      expect(png.length).toBeGreaterThan(6 * 1024 * 1024);
      const ticket = await start("claire", {
        kind: "PHOTO",
        mimeType: "image/png",
        sizeBytes: png.length,
      });
      if (ticket.mode !== "multipart") {
        throw new Error("Envoi multipart attendu");
      }
      expect(ticket).toMatchObject({ partSize: UPLOAD_PART_SIZE, partCount: 2 });
      expect(ticket.parts.map((p) => p.partNumber)).toEqual([1, 2]);

      // Navigateur : préflight CORS depuis l'origine des tests web.
      const preflight = await fetch(ticket.parts[0]!.url, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3100",
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      expect(preflight.status).toBe(200);
      expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:3100");

      const first = await fetch(ticket.parts[0]!.url, {
        method: "PUT",
        body: new Uint8Array(png.subarray(0, UPLOAD_PART_SIZE)),
      });
      expect(first.status).toBe(200);

      // Coupure : la seconde part n'est jamais arrivée.
      const incomplete = await post("claire", `/api/uploads/${ticket.mediaId}/complete`).expect(
        409,
      );
      expect(incomplete.body.fieldErrors).toEqual({ parts: ["2"] });
      await get("paul", `/api/uploads/${ticket.mediaId}/parts`).expect(404);
      const resume = uploadPartsSchema.parse(
        (await get("claire", `/api/uploads/${ticket.mediaId}/parts`).expect(200)).body,
      );
      expect(resume.uploadedParts).toEqual([{ partNumber: 1, sizeBytes: UPLOAD_PART_SIZE }]);
      expect(resume.parts.map((p) => p.partNumber)).toEqual([2]);

      const second = await fetch(resume.parts[0]!.url, {
        method: "PUT",
        body: new Uint8Array(png.subarray(UPLOAD_PART_SIZE)),
      });
      expect(second.status).toBe(200);
      // Double envoi de « complete » : un seul assemblage, le fichier n'est jamais refusé.
      const attempts = await Promise.all([
        post("claire", `/api/uploads/${ticket.mediaId}/complete`),
        post("claire", `/api/uploads/${ticket.mediaId}/complete`),
      ]);
      expect(attempts.map((a) => a.status).filter((s) => s !== 200 && s !== 409)).toEqual([]);
      const res = await post("claire", `/api/uploads/${ticket.mediaId}/complete`).expect(200);
      expect(res.body).toMatchObject({ status: "READY", width: 1600, height: 1400 });
      const row = await prisma.media.findUniqueOrThrow({ where: { id: ticket.mediaId } });
      expect(row.uploadId).toBeNull();
      expect(await storage.objectSize(row.storageKey!)).toBe(row.sizeBytes);
      expect((await sharp(await download("claire", ticket.mediaId)).metadata()).format).toBe("png");
    });

    it("refuse une part d'une autre taille que celle annoncée", async () => {
      const ticket = await start("claire", {
        kind: "VIDEO",
        mimeType: "video/mp4",
        sizeBytes: UPLOAD_PART_SIZE + 1024,
      });
      if (ticket.mode !== "multipart") {
        throw new Error("Envoi multipart attendu");
      }
      // La dernière part fait 1 Ko : un corps de 5 Mo ne correspond pas à la taille signée.
      const oversized = await fetch(ticket.parts[1]!.url, {
        method: "PUT",
        body: new Uint8Array(UPLOAD_PART_SIZE),
      });
      expect(oversized.status).toBe(403);
      const resume = uploadPartsSchema.parse(
        (await get("claire", `/api/uploads/${ticket.mediaId}/parts`).expect(200)).body,
      );
      expect(resume.uploadedParts).toEqual([]);
    });
  });
});
