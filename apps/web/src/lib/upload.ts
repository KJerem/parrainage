import {
  DEFAULT_UPLOAD_MAX_MB,
  uploadedMediaSchema,
  uploadKindOf,
  uploadMimeTypes,
  uploadPartsSchema,
  uploadTicketSchema,
  type UploadedMedia,
  type UploadKind,
  type UploadPartUrl,
  type UploadPurpose,
} from "@parrainage/contracts";
import { ApiRequestError, apiFetch, NETWORK_ERROR_MESSAGE } from "./api-client";

// Envoi d'une pièce jointe (plan §4.3) : POST /api/uploads → dépôt direct dans le stockage
// (un PUT présigné, ou des parts de 5 Mo reprenables) → POST /api/uploads/:id/complete, où
// l'API contrôle le contenu réel du fichier et en retire les métadonnées.

/** Erreur d'envoi, en français. `resumable` : un nouvel essai ne renverra que le manquant. */
export class UploadError extends Error {
  readonly resumable: boolean;

  constructor(message: string, { resumable = false } = {}) {
    super(message);
    this.name = "UploadError";
    this.resumable = resumable;
  }
}

export type UploadPhase = "preparing" | "uploading" | "verifying";

export type UploadProgress = { phase: UploadPhase; loaded: number; total: number };

/** Fichier prêt à partir : photo compressée, type et taille vérifiés. */
export type PreparedFile = {
  blob: Blob;
  kind: UploadKind;
  mimeType: string;
  fileName: string;
  /** Empreinte stable du contenu choisi : retrouve un envoi interrompu. */
  fingerprint: string;
};

/** Résultat d'un PUT vers le stockage (0 : réseau coupé ou envoi interrompu). */
export type PutResult = { status: number };

export type PutBlob = (
  url: string,
  body: Blob,
  options: {
    headers?: Readonly<Record<string, string>>;
    onProgress?: (loaded: number) => void;
    signal?: AbortSignal;
  },
) => Promise<PutResult>;

export type UploadOptions = {
  /** Usage du fichier, contrôlé par l'API selon le rôle (par défaut : un message). */
  purpose?: UploadPurpose;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  /** Remplace le PUT par XMLHttpRequest (tests). */
  put?: PutBlob;
  /** Remplace l'attente entre deux essais (tests). */
  wait?: (ms: number) => Promise<void>;
};

const MB = 1024 * 1024;

/** Photos : 1 600 px au plus grand côté, 1 Mo au plus, EXIF retiré (plan §8). */
export const PHOTO_COMPRESSION = { maxWidthOrHeight: 1600, maxSizeMB: 1 } as const;

/** Bulletins : plus grands, pour rester lisibles (plan §8). */
export const BULLETIN_COMPRESSION = { maxWidthOrHeight: 1920, maxSizeMB: 2 } as const;

const kindNames: Record<UploadKind, string> = {
  PHOTO: "une photo",
  VIDEO: "une vidéo",
  DOCUMENT: "un document",
};

export const TYPE_REJECTED_MESSAGE =
  "Type de fichier non autorisé : photos JPEG, PNG ou WebP, vidéos MP4 ou WebM.";

export function maxBytesFor(kind: UploadKind): number {
  return DEFAULT_UPLOAD_MAX_MB[kind] * MB;
}

export function tooLargeMessage(kind: UploadKind): string {
  return `Fichier trop volumineux : ${DEFAULT_UPLOAD_MAX_MB[kind]} Mo maximum pour ${kindNames[kind]}.`;
}

/** Type MIME sans paramètres : « video/webm;codecs=vp8,opus » → « video/webm ». */
export function baseMimeType(type: string): string {
  return type.split(";")[0]!.trim().toLowerCase();
}

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

function fileNameFor(name: string | undefined, mimeType: string): string {
  const fallback = `fichier.${extensions[mimeType] ?? "bin"}`;
  const trimmed = (name ?? "").trim();
  return (trimmed || fallback).slice(-255);
}

async function compressPhoto(
  file: File | Blob,
  mimeType: string,
  limits: { maxWidthOrHeight: number; maxSizeMB: number } = PHOTO_COMPRESSION,
): Promise<Blob> {
  // Chargé à la demande : la bibliothèque n'a rien à faire côté serveur.
  const { default: imageCompression } = await import("browser-image-compression");
  const accepted = uploadMimeTypes.PHOTO.includes(mimeType);
  const source =
    file instanceof File
      ? file
      : new File([file], fileNameFor(undefined, mimeType), { type: mimeType });
  return imageCompression(source, {
    ...limits,
    // Hors du thread principal, la bibliothèque irait chercher son code sur un CDN.
    useWebWorker: false,
    preserveExif: false,
    initialQuality: 0.85,
    // Une image d'un autre format lisible par le navigateur (GIF, BMP…) devient un JPEG.
    fileType: accepted ? mimeType : "image/jpeg",
  });
}

/**
 * Prépare un fichier choisi ou enregistré : une photo est compressée (et perd ses métadonnées),
 * une vidéo ou un document est seulement contrôlé. Lève UploadError avec un message à afficher.
 */
export async function prepareFile(
  file: File | Blob,
  {
    fileName,
    compress = compressPhoto,
    limits,
  }: {
    fileName?: string;
    compress?: typeof compressPhoto;
    /** Plafonds de compression d'une photo, s'ils diffèrent de ceux des messages. */
    limits?: { maxWidthOrHeight: number; maxSizeMB: number };
  } = {},
): Promise<PreparedFile> {
  const declared = baseMimeType(file.type);
  const name = fileName ?? (file instanceof File ? file.name : undefined);
  let blob: Blob = file;
  let mimeType = declared;
  if (declared.startsWith("image/")) {
    try {
      blob = await compress(file, declared, limits);
    } catch {
      throw new UploadError(
        "Cette photo n'a pas pu être préparée. Essayez une autre image, au format JPEG ou PNG.",
      );
    }
    mimeType = baseMimeType(blob.type) || declared;
  }
  const kind = uploadKindOf(mimeType);
  if (!kind) {
    throw new UploadError(TYPE_REJECTED_MESSAGE);
  }
  if (blob.size === 0) {
    throw new UploadError("Ce fichier est vide.");
  }
  if (blob.size > maxBytesFor(kind)) {
    throw new UploadError(tooLargeMessage(kind));
  }
  const lastModified = file instanceof File ? file.lastModified : 0;
  return {
    blob,
    kind,
    mimeType,
    fileName: fileNameFor(name, mimeType),
    fingerprint: [kind, mimeType, blob.size, name ?? "", lastModified].join("|"),
  };
}

// ─── Reprise : état des envois multipart, gardé pour la session de l'onglet ──────

type ResumeEntry = {
  fingerprint: string;
  mediaId: string;
  partSize: number;
  partCount: number;
  savedAt: number;
};

const RESUME_KEY = "parrainage.envois";
/** Au-delà, l'API a purgé l'envoi inachevé. */
const RESUME_TTL_MS = 23 * 60 * 60 * 1000;

function readResumeEntries(): ResumeEntry[] {
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY);
    const entries: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) return [];
    return entries.filter(
      (entry): entry is ResumeEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.fingerprint === "string" &&
        typeof entry.mediaId === "string" &&
        Date.now() - Number(entry.savedAt) < RESUME_TTL_MS,
    );
  } catch {
    return [];
  }
}

function writeResumeEntries(entries: ResumeEntry[]) {
  try {
    if (entries.length === 0) window.sessionStorage.removeItem(RESUME_KEY);
    else window.sessionStorage.setItem(RESUME_KEY, JSON.stringify(entries));
  } catch {
    // Stockage indisponible (navigation privée) : l'envoi reste possible, sans reprise.
  }
}

function saveResume(entry: Omit<ResumeEntry, "savedAt">) {
  const others = readResumeEntries().filter(
    (e) => e.mediaId !== entry.mediaId && e.fingerprint !== entry.fingerprint,
  );
  writeResumeEntries([...others, { ...entry, savedAt: Date.now() }]);
}

function forgetResume(mediaId: string) {
  writeResumeEntries(readResumeEntries().filter((e) => e.mediaId !== mediaId));
}

function findResume(fingerprint: string): ResumeEntry | undefined {
  return readResumeEntries().find((e) => e.fingerprint === fingerprint);
}

// ─── Dépôt dans le stockage ──────────────────────────────────────────────────────

// En-têtes que le navigateur fixe lui-même (Content-Length signé : la taille exacte du Blob).
const FORBIDDEN_HEADERS = new Set(["content-length", "host", "connection"]);

/** PUT par XMLHttpRequest : seul moyen de suivre la progression d'un envoi. */
export const xhrPut: PutBlob = (url, body, { headers = {}, onProgress, signal }) =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      if (!FORBIDDEN_HEADERS.has(name.toLowerCase())) xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => onProgress?.(event.loaded);
    xhr.onload = () => resolve({ status: xhr.status });
    xhr.onerror = () => resolve({ status: 0 });
    xhr.ontimeout = () => resolve({ status: 0 });
    xhr.onabort = () => resolve({ status: 0 });
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Essais d'un même PUT avant d'abandonner (coupure réseau, stockage indisponible). */
const PUT_ATTEMPTS = 3;
/** Essais de « complete » pendant qu'un autre appel vérifie déjà le fichier. */
const VERIFY_POLLS = 20;
const VERIFYING_HINT = "en cours de vérification";

const interrupted = () =>
  new UploadError(
    "L'envoi a été interrompu. Vérifiez votre connexion puis réessayez : seules les parties manquantes seront renvoyées.",
    { resumable: true },
  );

function abortError(): DOMException {
  return new DOMException("Envoi annulé", "AbortError");
}

const mediaPath = (mediaId: string) => `/api/uploads/${encodeURIComponent(mediaId)}`;

class Uploader {
  private readonly put: PutBlob;
  private readonly wait: (ms: number) => Promise<void>;
  /** Octets déjà reçus par le stockage, par part. */
  private readonly done = new Map<number, number>();
  private inFlight = 0;

  constructor(
    private readonly file: PreparedFile,
    private readonly options: UploadOptions,
  ) {
    this.put = options.put ?? xhrPut;
    this.wait = options.wait ?? defaultWait;
  }

  private report(phase: UploadPhase) {
    let loaded = this.inFlight;
    for (const size of this.done.values()) loaded += size;
    const total = this.file.blob.size;
    this.options.onProgress?.({ phase, loaded: Math.min(loaded, total), total });
  }

  private checkAborted() {
    if (this.options.signal?.aborted) throw abortError();
  }

  /** PUT avec nouveaux essais ; `refresh` redonne une URL quand la signature a expiré (403). */
  private async putWithRetry(
    url: string,
    body: Blob,
    headers: Readonly<Record<string, string>> | undefined,
    refresh?: () => Promise<string | null>,
  ): Promise<void> {
    let target = url;
    for (let attempt = 1; attempt <= PUT_ATTEMPTS; attempt += 1) {
      this.checkAborted();
      this.inFlight = 0;
      const { status } = await this.put(target, body, {
        headers,
        signal: this.options.signal,
        onProgress: (loaded) => {
          this.inFlight = loaded;
          this.report("uploading");
        },
      });
      this.inFlight = 0;
      this.checkAborted();
      if (status >= 200 && status < 300) return;
      if (status === 403 && refresh) {
        const fresh = await refresh();
        if (fresh) target = fresh;
      }
      if (attempt < PUT_ATTEMPTS) await this.wait(500 * 2 ** (attempt - 1));
    }
    throw interrupted();
  }

  private async fetchParts() {
    const { data } = await apiFetch(`${mediaPath(this.mediaId)}/parts`, uploadPartsSchema, {
      signal: this.options.signal,
    });
    this.done.clear();
    for (const part of data.uploadedParts) this.done.set(part.partNumber, part.sizeBytes);
    return data;
  }

  private mediaId = "";
  private partSize = 0;

  private partBlob(partNumber: number): Blob {
    const start = (partNumber - 1) * this.partSize;
    return this.file.blob.slice(start, Math.min(start + this.partSize, this.file.blob.size));
  }

  /** Envoie les parts une à une (réseau du terrain : mieux vaut peu à la fois). */
  private async uploadParts(parts: readonly UploadPartUrl[]) {
    for (const part of parts) {
      if (this.done.has(part.partNumber)) continue;
      const body = this.partBlob(part.partNumber);
      await this.putWithRetry(part.url, body, undefined, async () => {
        const fresh = await this.fetchParts().catch(() => null);
        return fresh?.parts.find((p) => p.partNumber === part.partNumber)?.url ?? null;
      });
      this.done.set(part.partNumber, body.size);
      this.report("uploading");
    }
  }

  /** Vérification par l'API ; parts manquantes : renvoyées, puis nouvel essai. */
  private async complete(): Promise<UploadedMedia> {
    let resends = 0;
    let polls = 0;
    for (;;) {
      this.checkAborted();
      this.report("verifying");
      try {
        const { data } = await apiFetch(
          `${mediaPath(this.mediaId)}/complete`,
          uploadedMediaSchema,
          {
            method: "POST",
            signal: this.options.signal,
          },
        );
        return data;
      } catch (error) {
        if (!(error instanceof ApiRequestError) || error.status !== 409) throw error;
        if (error.fieldErrors.parts?.length && resends < 2) {
          resends += 1;
          const fresh = await this.fetchParts();
          await this.uploadParts(fresh.parts);
          continue;
        }
        if (error.message.includes(VERIFYING_HINT) && polls < VERIFY_POLLS) {
          polls += 1;
          await this.wait(1500);
          continue;
        }
        throw error;
      }
    }
  }

  async run(): Promise<UploadedMedia> {
    this.report("uploading");
    const resume = findResume(this.file.fingerprint);
    if (resume) {
      this.mediaId = resume.mediaId;
      this.partSize = resume.partSize;
      const parts = await this.fetchParts().catch((error: unknown) => {
        if (error instanceof ApiRequestError && [404, 409].includes(error.status)) return null;
        throw error;
      });
      if (parts) {
        this.report("uploading");
        await this.uploadParts(parts.parts);
        return this.finish();
      }
      // Envoi expiré ou déjà terminé ailleurs : on repart de zéro.
      forgetResume(resume.mediaId);
      this.done.clear();
    }

    const { data: ticket } = await apiFetch("/api/uploads", uploadTicketSchema, {
      method: "POST",
      signal: this.options.signal,
      body: {
        purpose: this.options.purpose ?? "message",
        kind: this.file.kind,
        mimeType: this.file.mimeType,
        sizeBytes: this.file.blob.size,
        fileName: this.file.fileName,
      },
    });
    this.mediaId = ticket.mediaId;
    if (ticket.mode === "single") {
      await this.putWithRetry(ticket.url, this.file.blob, ticket.headers);
      this.done.set(1, this.file.blob.size);
      return this.finish();
    }
    this.partSize = ticket.partSize;
    saveResume({
      fingerprint: this.file.fingerprint,
      mediaId: ticket.mediaId,
      partSize: ticket.partSize,
      partCount: ticket.partCount,
    });
    await this.uploadParts(ticket.parts);
    return this.finish();
  }

  private async finish(): Promise<UploadedMedia> {
    const media = await this.complete();
    forgetResume(this.mediaId);
    return media;
  }
}

/**
 * Envoie un fichier préparé et renvoie le média vérifié (READY). Un envoi multipart interrompu
 * reprend au prochain appel avec le même fichier : seules les parts manquantes repartent.
 */
export async function uploadFile(
  file: PreparedFile,
  options: UploadOptions = {},
): Promise<UploadedMedia> {
  try {
    return await new Uploader(file, options).run();
  } catch (error) {
    if (
      error instanceof UploadError ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw error;
    }
    if (error instanceof ApiRequestError) {
      throw new UploadError(error.status === 0 ? NETWORK_ERROR_MESSAGE : error.message, {
        resumable: error.status === 0 || error.status >= 500,
      });
    }
    throw new UploadError("L'envoi du fichier a échoué. Réessayez dans un instant.");
  }
}
