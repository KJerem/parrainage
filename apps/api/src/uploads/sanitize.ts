import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import sharp from "sharp";
import { ffmpegPath } from "./ffmpeg-path.js";

// Contrôle du contenu réel des fichiers et suppression de leurs métadonnées (EXIF et GPS des
// photos, lieu et appareil des vidéos, auteur des PDF), côté serveur, avant toute diffusion.

/** Fichier illisible ou d'un autre type que celui déclaré : il est refusé. */
export class RejectedFileError extends Error {}

/** Type MIME détecté d'après les premiers octets (magic bytes), `null` si inconnu. */
export async function detectMimeType(buffer: Uint8Array): Promise<string | null> {
  const detected = await fileTypeFromBuffer(buffer);
  return detected?.mime ?? null;
}

export interface SanitizedFile {
  body: Buffer;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

/** Au-delà, une image est refusée (protection contre les « bombes de décompression »). */
const MAX_INPUT_PIXELS = 100_000_000;

/** Photo réencodée dans son format, orientation appliquée, sans aucune métadonnée. */
export async function sanitizeImage(buffer: Buffer, mimeType: string): Promise<SanitizedFile> {
  try {
    // Sans withMetadata/keepMetadata, sharp n'écrit ni EXIF, ni XMP, ni IPTC, ni profil ICC.
    const image = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, animated: false }).rotate();
    const encoded =
      mimeType === "image/png"
        ? image.png()
        : mimeType === "image/webp"
          ? image.webp({ quality: 85 })
          : image.jpeg({ quality: 85 });
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    return { body: data, width: info.width, height: info.height, durationSec: null };
  } catch (error) {
    throw new RejectedFileError(error instanceof Error ? error.message : String(error));
  }
}

/** Durée lue dans la sortie de ffmpeg : « Duration: » de l'entrée, sinon le dernier « time= ». */
export function parseFfmpegDuration(output: string): number | null {
  const toSeconds = (h: string, m: string, s: string) =>
    Number(h) * 3600 + Number(m) * 60 + Number(s);
  const duration = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(output);
  if (duration) {
    return toSeconds(duration[1]!, duration[2]!, duration[3]!);
  }
  const times = [...output.matchAll(/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)];
  const last = times.at(-1);
  return last ? toSeconds(last[1]!, last[2]!, last[3]!) : null;
}

function runFfmpeg(args: readonly string[]): Promise<string> {
  if (!ffmpegPath) {
    return Promise.reject(new Error("ffmpeg indisponible sur cette plateforme"));
  }
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath!,
      [...args],
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new RejectedFileError(`ffmpeg : ${stderr.split("\n").slice(-4).join(" ")}`));
        } else {
          resolve(stderr);
        }
      },
    );
  });
}

/** Arguments de ffmpeg : copie des flux audio et vidéo, sans métadonnée ni chapitre. */
export function ffmpegSanitizeArgs(input: string, output: string, mimeType: string): string[] {
  const mp4 = mimeType === "video/mp4";
  return [
    "-nostdin",
    "-hide_banner",
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c",
    "copy",
    "-map_metadata",
    "-1",
    "-map_metadata:s:v",
    "-1",
    "-map_metadata:s:a",
    "-1",
    "-map_chapters",
    "-1",
    "-fflags",
    "+bitexact",
    ...(mp4 ? ["-movflags", "+faststart"] : []),
    "-f",
    mp4 ? "mp4" : "webm",
    output,
  ];
}

/** Vidéo remuxée sans réencodage (`-c copy`) : métadonnées retirées, durée mesurée. */
export async function sanitizeVideo(buffer: Buffer, mimeType: string): Promise<SanitizedFile> {
  const directory = await mkdtemp(join(tmpdir(), "parrainage-video-"));
  const extension = mimeType === "video/mp4" ? "mp4" : "webm";
  const input = join(directory, `source.${extension}`);
  const output = join(directory, `clean.${extension}`);
  try {
    await writeFile(input, buffer);
    const log = await runFfmpeg(ffmpegSanitizeArgs(input, output, mimeType));
    const duration = parseFfmpegDuration(log);
    return {
      body: await readFile(output),
      width: null,
      height: null,
      durationSec: duration === null ? null : Math.round(duration),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Entrées du catalogue retirées : métadonnées XMP, actions automatiques à l'ouverture. */
const CATALOG_KEYS = ["Metadata", "OpenAction", "AA"] as const;
/** Arbres de noms retirés : scripts et fichiers embarqués. */
const NAME_TREES = ["JavaScript", "EmbeddedFiles"] as const;

/** PDF réécrit avec un dictionnaire Info vide (titre, auteur, logiciel, dates…) et sans XMP. */
export async function sanitizePdf(buffer: Buffer): Promise<SanitizedFile> {
  let document: PDFDocument;
  try {
    // updateMetadata: false : pdf-lib n'ajoute ni Producer ni dates à l'ouverture.
    document = await PDFDocument.load(buffer, { updateMetadata: false });
    if (document.getPageCount() === 0) {
      throw new Error("PDF sans page");
    }
  } catch (error) {
    throw new RejectedFileError(error instanceof Error ? error.message : String(error));
  }
  document.context.trailerInfo.Info = document.context.register(document.context.obj({}));
  for (const key of CATALOG_KEYS) {
    document.catalog.delete(PDFName.of(key));
  }
  const names = document.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  for (const key of NAME_TREES) {
    names?.delete(PDFName.of(key));
  }
  const body = Buffer.from(await document.save());
  return { body, width: null, height: null, durationSec: null };
}

/** Nettoyage selon le type (déjà vérifié par les magic bytes). */
export function sanitize(buffer: Buffer, mimeType: string): Promise<SanitizedFile> {
  if (mimeType.startsWith("image/")) {
    return sanitizeImage(buffer, mimeType);
  }
  if (mimeType.startsWith("video/")) {
    return sanitizeVideo(buffer, mimeType);
  }
  if (mimeType === "application/pdf") {
    return sanitizePdf(buffer);
  }
  return Promise.reject(new RejectedFileError(`Type non pris en charge : ${mimeType}`));
}
