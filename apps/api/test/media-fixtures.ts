// Fichiers de test générés à la volée (aucun binaire versionné) : photo avec EXIF et GPS, PDF
// avec dictionnaire Info, vidéos avec métadonnées de lieu.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { ffmpegPath } from "../src/uploads/ffmpeg-path.js";

export const GPS_EXIF = {
  IFD0: { Make: "Appareil-Test", Model: "Modele-Secret", Artist: "Claire Martin" },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "45/1 45/1 3230/100",
    GPSLongitudeRef: "E",
    GPSLongitude: "4/1 50/1 1200/100",
  },
};

/** JPEG 64×48 avec EXIF (appareil, auteur, GPS) et une orientation « tourner de 90° ». */
export function jpegWithGps(): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 92, b: 78 } },
  })
    .jpeg()
    .withExif(GPS_EXIF)
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

export function pngImage(width = 32, height = 32): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: "#E9A23B" } })
    .png()
    .toBuffer();
}

/** PNG non compressé de plus de 6 Mo (deux parts d'envoi multipart). */
export function largePng(): Promise<Buffer> {
  return sharp({ create: { width: 1600, height: 1400, channels: 3, background: "#1E5C4E" } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

export const PDF_INFO = {
  title: "Bulletin confidentiel",
  author: "Claire Martin",
  subject: "Sujet privé",
  keywords: ["Lyon", "rue des Tilleuls"],
  creator: "Logiciel-Createur",
  producer: "Logiciel-Producteur",
};

/** PDF d'une page avec titre, auteur, sujet, mots-clés, logiciels et dates renseignés. */
export async function pdfWithInfo(): Promise<Buffer> {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.addPage([200, 200]).drawText("Bulletin", { x: 20, y: 100, size: 18 });
  document.setTitle(PDF_INFO.title);
  document.setAuthor(PDF_INFO.author);
  document.setSubject(PDF_INFO.subject);
  document.setKeywords(PDF_INFO.keywords);
  document.setCreator(PDF_INFO.creator);
  document.setProducer(PDF_INFO.producer);
  document.setCreationDate(new Date("2026-10-30T08:00:00Z"));
  document.setModificationDate(new Date("2026-10-30T09:00:00Z"));
  return Buffer.from(await document.save());
}

/** Sortie de ffmpeg (stderr), même quand il termine en erreur (« ffmpeg -i » seul). */
export function ffmpegLog(args: readonly string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(ffmpegPath!, ["-hide_banner", ...args], { windowsHide: true }, (_error, _out, err) =>
      resolve(err),
    );
  });
}

export const VIDEO_METADATA = {
  title: "Titre-Secret",
  location: "+45.7640+004.8357/",
  comment: "Filmé rue des Tilleuls",
};

/** Courte vidéo de test (mire + son), avec titre, lieu et commentaire. */
export async function videoWithMetadata(
  format: "mp4" | "webm",
  options: { seconds?: number; size?: string } = {},
): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "parrainage-fixture-"));
  const output = join(directory, `fixture.${format}`);
  const seconds = options.seconds ?? 2;
  try {
    const codecs =
      format === "mp4"
        ? ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac"]
        : ["-c:v", "libvpx", "-deadline", "realtime", "-b:v", "200k", "-c:a", "libopus"];
    const log = await ffmpegLog([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=duration=${seconds}:size=${options.size ?? "64x48"}:rate=10`,
      "-f",
      "lavfi",
      "-i",
      `sine=duration=${seconds}`,
      ...codecs,
      "-metadata",
      `title=${VIDEO_METADATA.title}`,
      "-metadata",
      `location=${VIDEO_METADATA.location}`,
      "-metadata",
      `comment=${VIDEO_METADATA.comment}`,
      ...(format === "mp4" ? ["-movflags", "+use_metadata_tags"] : []),
      output,
    ]);
    try {
      return await readFile(output);
    } catch {
      throw new Error(`Vidéo de test non générée :\n${log}`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Métadonnées affichées par ffmpeg pour un fichier (titre, lieu, appareil…). */
export async function probe(buffer: Buffer, extension: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "parrainage-probe-"));
  const file = join(directory, `probe.${extension}`);
  try {
    await writeFile(file, buffer);
    return await ffmpegLog(["-i", file]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
