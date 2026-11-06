import { UPLOAD_PART_SIZE, type UploadedMedia } from "@parrainage/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  baseMimeType,
  prepareFile,
  uploadFile,
  UploadError,
  type PreparedFile,
  type PutBlob,
} from "./upload";

const MEDIA_ID = "3f0e8a3c-0d58-4a3a-9b6b-6d7c1b2a9e10";
const EXPIRES = "2026-11-02T10:05:00.000Z";

const ready = (sizeBytes: number, kind: "PHOTO" | "VIDEO" = "VIDEO"): UploadedMedia => ({
  id: MEDIA_ID,
  kind,
  status: "READY",
  label: kind === "VIDEO" ? "Vidéo" : "Photo",
  durationSec: kind === "VIDEO" ? 3 : null,
  mimeType: kind === "VIDEO" ? "video/webm" : "image/jpeg",
  sizeBytes,
  width: null,
  height: null,
});

type Route = { method: string; path: string; status: number; body: unknown };

/** Faux serveur : réponses jouées dans l'ordre, chaque appel enregistré. */
function fakeApi(routes: Route[]) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const index = routes.findIndex((r) => r.method === method && r.path === path);
    if (index < 0) throw new Error(`Appel inattendu : ${method} ${path}`);
    const [route] = routes.splice(index, 1);
    return new Response(JSON.stringify(route!.body), {
      status: route!.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function prepared(
  size: number,
  fingerprint = `VIDEO|video/webm|${size}|video.webm|1`,
): PreparedFile {
  return {
    blob: new Blob([new Uint8Array(size)], { type: "video/webm" }),
    kind: "VIDEO",
    mimeType: "video/webm",
    fileName: "video.webm",
    fingerprint,
  };
}

const noWait = () => Promise.resolve();

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prepareFile", () => {
  it("compresse une photo et retire les paramètres du type", async () => {
    const compress = vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" }));
    const file = new File(["original"], "IMG_0001.HEIC.jpg", { type: "image/jpeg" });
    const result = await prepareFile(file, { compress });
    expect(compress).toHaveBeenCalledWith(file, "image/jpeg");
    expect(result).toMatchObject({
      kind: "PHOTO",
      mimeType: "image/jpeg",
      fileName: "IMG_0001.HEIC.jpg",
    });
    expect(result.blob.size).toBe(4);
  });

  it("garde une vidéo telle quelle, type sans codecs", async () => {
    const compress = vi.fn();
    const blob = new Blob(["webm"], { type: "video/webm;codecs=vp8,opus" });
    const result = await prepareFile(blob, { fileName: "message-video.webm", compress });
    expect(compress).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "VIDEO", mimeType: "video/webm" });
    expect(baseMimeType("video/webm;codecs=vp8,opus")).toBe("video/webm");
  });

  it("refuse un type non autorisé, un fichier vide ou trop lourd", async () => {
    await expect(
      prepareFile(new File(["x"], "film.mov", { type: "video/quicktime" })),
    ).rejects.toThrow("Type de fichier non autorisé");
    await expect(prepareFile(new File([], "vide.webm", { type: "video/webm" }))).rejects.toThrow(
      "Ce fichier est vide.",
    );
    const big = new File([new Uint8Array(26 * 1024 * 1024)], "long.webm", { type: "video/webm" });
    await expect(prepareFile(big)).rejects.toThrow(
      "Fichier trop volumineux : 25 Mo maximum pour une vidéo.",
    );
  });

  it("signale une photo illisible", async () => {
    const compress = vi.fn(async () => {
      throw new Error("decode");
    });
    await expect(
      prepareFile(new File(["x"], "photo.heic", { type: "image/heic" }), { compress }),
    ).rejects.toBeInstanceOf(UploadError);
  });
});

describe("uploadFile", () => {
  it("dépose un petit fichier en un PUT avec les en-têtes signés, puis le fait vérifier", async () => {
    const calls = fakeApi([
      {
        method: "POST",
        path: "/api/uploads",
        status: 201,
        body: {
          mode: "single",
          mediaId: MEDIA_ID,
          url: "http://localhost:9000/media/uploads/a.webm?X-Amz-Signature=1",
          headers: { "Content-Type": "video/webm" },
          expiresAt: EXPIRES,
        },
      },
      { method: "POST", path: `/api/uploads/${MEDIA_ID}/complete`, status: 200, body: ready(1000) },
    ]);
    const put = vi.fn<PutBlob>(async (_url, body, { onProgress }) => {
      onProgress?.(body.size);
      return { status: 200 };
    });
    const progress = vi.fn();
    const media = await uploadFile(prepared(1000), { put, wait: noWait, onProgress: progress });

    expect(media.id).toBe(MEDIA_ID);
    expect(calls[0]!.body).toEqual({
      purpose: "message",
      kind: "VIDEO",
      mimeType: "video/webm",
      sizeBytes: 1000,
      fileName: "video.webm",
    });
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]![2].headers).toEqual({ "Content-Type": "video/webm" });
    expect(progress).toHaveBeenCalledWith({ phase: "verifying", loaded: 1000, total: 1000 });
  });

  it("reprend un envoi multipart coupé : seules les parts manquantes repartent", async () => {
    const size = UPLOAD_PART_SIZE * 2 + 10;
    const partUrl = (n: number, v = 1) => `http://localhost:9000/media/part?n=${n}&v=${v}`;
    const file = prepared(size);
    fakeApi([
      {
        method: "POST",
        path: "/api/uploads",
        status: 201,
        body: {
          mode: "multipart",
          mediaId: MEDIA_ID,
          uploadId: "upload-1",
          partSize: UPLOAD_PART_SIZE,
          partCount: 3,
          parts: [1, 2, 3].map((n) => ({ partNumber: n, url: partUrl(n) })),
          expiresAt: EXPIRES,
        },
      },
    ]);
    // Coupure réseau sur la 2e part : trois essais, puis abandon.
    const put = vi.fn<PutBlob>(async (url) => ({ status: url.includes("n=2") ? 0 : 200 }));
    const failure = await uploadFile(file, { put, wait: noWait }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(UploadError);
    expect((failure as UploadError).resumable).toBe(true);
    expect(put.mock.calls.map(([url]) => url)).toEqual([
      partUrl(1),
      partUrl(2),
      partUrl(2),
      partUrl(2),
    ]);

    // Nouvel essai avec le même fichier : la part 1 est déjà reçue, l'API redonne 2 et 3.
    const calls = fakeApi([
      {
        method: "GET",
        path: `/api/uploads/${MEDIA_ID}/parts`,
        status: 200,
        body: {
          mediaId: MEDIA_ID,
          uploadId: "upload-1",
          partSize: UPLOAD_PART_SIZE,
          partCount: 3,
          uploadedParts: [{ partNumber: 1, sizeBytes: UPLOAD_PART_SIZE }],
          parts: [2, 3].map((n) => ({ partNumber: n, url: partUrl(n, 2) })),
          expiresAt: EXPIRES,
        },
      },
      { method: "POST", path: `/api/uploads/${MEDIA_ID}/complete`, status: 200, body: ready(size) },
    ]);
    const resumed = vi.fn<PutBlob>(async () => ({ status: 200 }));
    const media = await uploadFile(file, { put: resumed, wait: noWait });
    expect(media.status).toBe("READY");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET /api/uploads/${MEDIA_ID}/parts`,
      `POST /api/uploads/${MEDIA_ID}/complete`,
    ]);
    expect(resumed.mock.calls.map(([url, body]) => [url, body.size])).toEqual([
      [partUrl(2, 2), UPLOAD_PART_SIZE],
      [partUrl(3, 2), 10],
    ]);
    // Terminé : plus rien à reprendre.
    expect(window.sessionStorage.getItem("parrainage.envois")).toBeNull();
  });

  it("renvoie les parts que l'API signale manquantes, et attend une vérification en cours", async () => {
    const size = UPLOAD_PART_SIZE + 1;
    const file = prepared(size);
    fakeApi([
      {
        method: "POST",
        path: "/api/uploads",
        status: 201,
        body: {
          mode: "multipart",
          mediaId: MEDIA_ID,
          uploadId: "upload-2",
          partSize: UPLOAD_PART_SIZE,
          partCount: 2,
          parts: [1, 2].map((n) => ({ partNumber: n, url: `http://s3/p${n}` })),
          expiresAt: EXPIRES,
        },
      },
      {
        method: "POST",
        path: `/api/uploads/${MEDIA_ID}/complete`,
        status: 409,
        body: {
          statusCode: 409,
          error: "Conflict",
          message: "Envoi incomplet : reprenez l'envoi des parties manquantes",
          fieldErrors: { parts: ["2"] },
        },
      },
      {
        method: "GET",
        path: `/api/uploads/${MEDIA_ID}/parts`,
        status: 200,
        body: {
          mediaId: MEDIA_ID,
          uploadId: "upload-2",
          partSize: UPLOAD_PART_SIZE,
          partCount: 2,
          uploadedParts: [{ partNumber: 1, sizeBytes: UPLOAD_PART_SIZE }],
          parts: [{ partNumber: 2, url: "http://s3/p2-bis" }],
          expiresAt: EXPIRES,
        },
      },
      {
        method: "POST",
        path: `/api/uploads/${MEDIA_ID}/complete`,
        status: 409,
        body: {
          statusCode: 409,
          error: "Conflict",
          message: "Ce fichier est déjà en cours de vérification : patientez",
        },
      },
      { method: "POST", path: `/api/uploads/${MEDIA_ID}/complete`, status: 200, body: ready(size) },
    ]);
    const put = vi.fn<PutBlob>(async () => ({ status: 200 }));
    const wait = vi.fn(noWait);
    const media = await uploadFile(file, { put, wait });
    expect(media.id).toBe(MEDIA_ID);
    expect(put.mock.calls.map(([url]) => url)).toEqual([
      "http://s3/p1",
      "http://s3/p2",
      "http://s3/p2-bis",
    ]);
    expect(wait).toHaveBeenCalledWith(1500);
  });

  it("redemande une URL quand la signature a expiré (403)", async () => {
    const size = UPLOAD_PART_SIZE + 1;
    fakeApi([
      {
        method: "POST",
        path: "/api/uploads",
        status: 201,
        body: {
          mode: "multipart",
          mediaId: MEDIA_ID,
          uploadId: "upload-3",
          partSize: UPLOAD_PART_SIZE,
          partCount: 2,
          parts: [1, 2].map((n) => ({ partNumber: n, url: `http://s3/old-${n}` })),
          expiresAt: EXPIRES,
        },
      },
      {
        method: "GET",
        path: `/api/uploads/${MEDIA_ID}/parts`,
        status: 200,
        body: {
          mediaId: MEDIA_ID,
          uploadId: "upload-3",
          partSize: UPLOAD_PART_SIZE,
          partCount: 2,
          uploadedParts: [{ partNumber: 1, sizeBytes: UPLOAD_PART_SIZE }],
          parts: [{ partNumber: 2, url: "http://s3/new-2" }],
          expiresAt: EXPIRES,
        },
      },
      { method: "POST", path: `/api/uploads/${MEDIA_ID}/complete`, status: 200, body: ready(size) },
    ]);
    const put = vi.fn<PutBlob>(async (url) => ({ status: url === "http://s3/old-2" ? 403 : 200 }));
    await uploadFile(prepared(size), { put, wait: noWait });
    expect(put.mock.calls.map(([url]) => url)).toEqual([
      "http://s3/old-1",
      "http://s3/old-2",
      "http://s3/new-2",
    ]);
  });

  it("traduit un refus de l'API en message à afficher", async () => {
    fakeApi([
      {
        method: "POST",
        path: "/api/uploads",
        status: 201,
        body: {
          mode: "single",
          mediaId: MEDIA_ID,
          url: "http://s3/one",
          headers: { "Content-Type": "video/webm" },
          expiresAt: EXPIRES,
        },
      },
      {
        method: "POST",
        path: `/api/uploads/${MEDIA_ID}/complete`,
        status: 422,
        body: {
          statusCode: 422,
          error: "Unprocessable Entity",
          message: "Type de fichier non autorisé",
        },
      },
    ]);
    const put = vi.fn<PutBlob>(async () => ({ status: 200 }));
    const error = await uploadFile(prepared(10), { put, wait: noWait }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).message).toBe("Type de fichier non autorisé");
    expect((error as UploadError).resumable).toBe(false);
  });
});
