import { type CreateUpload, UPLOAD_PART_SIZE } from "@parrainage/contracts";
import { AppError } from "../common/app-error.js";
import type { StoredPart } from "../storage/storage.service.js";
import {
  formatMegabytes,
  staleUploadCutoff,
  storageKeyFor,
  tooLongMessage,
  uploadLimitsFrom,
  validateUploadRequest,
} from "./upload-rules.js";
import { checkParts } from "./uploads.service.js";

const limits = uploadLimitsFrom({
  UPLOAD_MAX_PHOTO_MB: 10,
  UPLOAD_MAX_VIDEO_MB: 25,
  UPLOAD_MAX_DOC_MB: 10,
  VIDEO_MAX_SECONDS: 120,
});
const MB = 1024 * 1024;
const photo: CreateUpload = {
  purpose: "message",
  kind: "PHOTO",
  mimeType: "image/jpeg",
  sizeBytes: 2 * MB,
  fileName: "IMG_0001.jpg",
};

function rejection(input: CreateUpload, role: "parrain" | "relais" | "bureau" = "parrain") {
  try {
    validateUploadRequest(input, role, limits);
  } catch (error) {
    if (error instanceof AppError) {
      return { status: error.getStatus(), message: error.message };
    }
    throw error;
  }
  return null;
}

describe("validateUploadRequest", () => {
  it("accepte une photo, une vidéo ou un PDF dans les plafonds", () => {
    expect(rejection(photo)).toBeNull();
    expect(rejection({ ...photo, mimeType: "image/webp" }, "relais")).toBeNull();
    expect(
      rejection({ ...photo, kind: "VIDEO", mimeType: "video/webm", sizeBytes: 25 * MB }),
    ).toBeNull();
    expect(rejection({ ...photo, kind: "DOCUMENT", mimeType: "application/pdf" })).toBeNull();
  });

  it("refuse un type hors liste ou qui ne correspond pas au genre de média (422)", () => {
    for (const input of [
      { ...photo, mimeType: "image/gif" },
      { ...photo, mimeType: "image/svg+xml" },
      { ...photo, mimeType: "application/pdf" },
      { ...photo, kind: "VIDEO" as const, mimeType: "video/quicktime" },
      { ...photo, kind: "DOCUMENT" as const, mimeType: "application/zip" },
    ]) {
      expect(rejection(input)).toEqual({ status: 422, message: "Type de fichier non autorisé" });
    }
  });

  it("refuse un fichier trop lourd avec le plafond en clair (413)", () => {
    expect(rejection({ ...photo, sizeBytes: 10 * MB + 1 })).toEqual({
      status: 413,
      message: "Fichier trop volumineux : 10 Mo maximum pour une photo",
    });
    expect(
      rejection({ ...photo, kind: "VIDEO", mimeType: "video/mp4", sizeBytes: 26 * MB }),
    ).toEqual({ status: 413, message: "Fichier trop volumineux : 25 Mo maximum pour une vidéo" });
  });

  it("réserve les pièces jointes de messages aux parrains et aux relais (403)", () => {
    expect(rejection(photo, "bureau")?.status).toBe(403);
  });
});

describe("règles d'envoi", () => {
  it("range le fichier par mois d'envoi, sous l'identifiant du média", () => {
    expect(storageKeyFor("abc", "image/jpeg", new Date("2026-11-02T10:00:00Z"))).toBe(
      "uploads/2026/11/abc.jpg",
    );
    expect(storageKeyFor("abc", "video/webm", new Date("2026-01-31T23:59:00Z"))).toBe(
      "uploads/2026/01/abc.webm",
    );
  });

  it("formate tailles et durées en français", () => {
    expect(formatMegabytes(2.5 * MB)).toBe("2,5 Mo");
    expect(tooLongMessage(120)).toBe("Vidéo trop longue : 2 minutes maximum");
    expect(tooLongMessage(60)).toBe("Vidéo trop longue : 1 minute maximum");
    expect(tooLongMessage(90)).toBe("Vidéo trop longue : 90 secondes maximum");
  });

  it("considère un envoi comme abandonné après 24 h", () => {
    expect(staleUploadCutoff(new Date("2026-11-02T10:00:00Z"))).toEqual(
      new Date("2026-11-01T10:00:00Z"),
    );
  });
});

describe("checkParts", () => {
  const part = (partNumber: number, sizeBytes: number): StoredPart => ({
    partNumber,
    etag: `"etag-${partNumber}"`,
    sizeBytes,
  });
  const size = 2 * UPLOAD_PART_SIZE + 1000;

  it("retient les parts complètes, dans l'ordre", () => {
    const parts = [part(3, 1000), part(1, UPLOAD_PART_SIZE), part(2, UPLOAD_PART_SIZE)];
    expect(checkParts(parts, size)).toEqual({
      complete: [part(1, UPLOAD_PART_SIZE), part(2, UPLOAD_PART_SIZE), part(3, 1000)],
      missing: [],
    });
  });

  it("signale les parts manquantes ou tronquées (coupure réseau)", () => {
    expect(checkParts([part(1, UPLOAD_PART_SIZE), part(2, 12)], size).missing).toEqual([2, 3]);
    expect(checkParts([], size).missing).toEqual([1, 2, 3]);
  });
});
