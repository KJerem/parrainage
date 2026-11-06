import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import {
  GPS_EXIF,
  jpegWithGps,
  PDF_INFO,
  pdfWithInfo,
  pngImage,
  probe,
  VIDEO_METADATA,
  videoWithMetadata,
} from "../../test/media-fixtures.js";
import {
  detectMimeType,
  parseFfmpegDuration,
  RejectedFileError,
  sanitizeImage,
  sanitizePdf,
  sanitizeVideo,
} from "./sanitize.js";

describe("detectMimeType", () => {
  it("reconnaît le contenu réel, quel que soit le type déclaré", async () => {
    expect(await detectMimeType(await jpegWithGps())).toBe("image/jpeg");
    expect(await detectMimeType(await pngImage())).toBe("image/png");
    expect(await detectMimeType(await pdfWithInfo())).toBe("application/pdf");
    expect(await detectMimeType(Buffer.from("MZ\x90\x00 programme"))).toBe(
      "application/x-msdownload",
    );
    expect(await detectMimeType(Buffer.from("du texte brut"))).toBeNull();
  });
});

describe("sanitizeImage", () => {
  it("retire EXIF et GPS, applique l'orientation et garde le format", async () => {
    const source = await jpegWithGps();
    const before = await sharp(source).metadata();
    expect(before.exif?.toString("latin1")).toContain(GPS_EXIF.IFD0.Model);
    expect(before.orientation).toBe(6);

    const clean = await sanitizeImage(source, "image/jpeg");
    const after = await sharp(clean.body).metadata();
    expect(after.format).toBe("jpeg");
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    // Pivotée de 90° : 64×48 devient 48×64.
    expect([clean.width, clean.height]).toEqual([48, 64]);
    expect([after.width, after.height]).toEqual([48, 64]);
    const raw = clean.body.toString("latin1");
    expect(raw).not.toContain(GPS_EXIF.IFD0.Model);
    expect(raw).not.toContain(GPS_EXIF.IFD0.Artist);
  });

  it("réencode un PNG en PNG", async () => {
    const clean = await sanitizeImage(await pngImage(20, 10), "image/png");
    expect((await sharp(clean.body).metadata()).format).toBe("png");
    expect([clean.width, clean.height]).toEqual([20, 10]);
  });

  it("refuse une image illisible", async () => {
    await expect(sanitizeImage(Buffer.from("pas une image"), "image/jpeg")).rejects.toBeInstanceOf(
      RejectedFileError,
    );
  });
});

describe("sanitizePdf", () => {
  it("vide le dictionnaire Info (titre, auteur, logiciels, dates)", async () => {
    const source = await pdfWithInfo();
    const original = await PDFDocument.load(source, { updateMetadata: false });
    expect(original.getAuthor()).toBe(PDF_INFO.author);
    expect(original.getProducer()).toBe(PDF_INFO.producer);

    const clean = await sanitizePdf(source);
    const reloaded = await PDFDocument.load(clean.body, { updateMetadata: false });
    expect(reloaded.getTitle()).toBeUndefined();
    expect(reloaded.getAuthor()).toBeUndefined();
    expect(reloaded.getSubject()).toBeUndefined();
    expect(reloaded.getKeywords()).toBeUndefined();
    expect(reloaded.getCreator()).toBeUndefined();
    expect(reloaded.getProducer()).toBeUndefined();
    expect(reloaded.getCreationDate()).toBeUndefined();
    expect(reloaded.getModificationDate()).toBeUndefined();
    expect(reloaded.getPageCount()).toBe(1);
    expect(clean.body.toString("latin1")).not.toMatch(/\/(Title|Author|Producer|Creator)/);
  });

  it("refuse un PDF illisible", async () => {
    await expect(sanitizePdf(Buffer.from("%PDF-1.7 tronqué"))).rejects.toBeInstanceOf(
      RejectedFileError,
    );
  });
});

describe("sanitizeVideo", () => {
  it.each(["mp4", "webm"] as const)(
    "retire titre, lieu et commentaire d'une vidéo %s et mesure sa durée",
    async (format) => {
      const source = await videoWithMetadata(format, { seconds: 3 });
      const before = await probe(source, format);
      expect(before).toContain(VIDEO_METADATA.title);
      expect(before).toContain(VIDEO_METADATA.comment);

      const clean = await sanitizeVideo(source, `video/${format}`);
      expect(clean.durationSec).toBe(3);
      expect(await detectMimeType(clean.body)).toBe(`video/${format}`);
      const after = await probe(clean.body, format);
      expect(after).toMatch(/Stream #0:0.*Video/);
      expect(after).toMatch(/Stream #0:1.*Audio/);
      for (const value of Object.values(VIDEO_METADATA)) {
        expect(after).not.toContain(value);
      }
      // Ni version de l'outil ni date de création.
      expect(after).not.toMatch(/Lavf\d|creation_time/);
    },
    60_000,
  );

  it("refuse une vidéo illisible", async () => {
    await expect(sanitizeVideo(Buffer.from("pas une vidéo"), "video/mp4")).rejects.toBeInstanceOf(
      RejectedFileError,
    );
  });
});

describe("parseFfmpegDuration", () => {
  it("lit la durée de l'entrée, sinon la dernière position copiée", () => {
    expect(parseFfmpegDuration("  Duration: 00:01:02.50, start: 0.000000")).toBe(62.5);
    expect(
      parseFfmpegDuration("Duration: N/A\nframe=10 time=00:00:01.00\nframe=42 time=00:00:04.20"),
    ).toBe(4.2);
    expect(parseFfmpegDuration("rien")).toBeNull();
  });
});
