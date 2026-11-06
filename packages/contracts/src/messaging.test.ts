import { describe, expect, it } from "vitest";
import {
  conversationListQuerySchema,
  messagesPath,
  sendMessageSchema,
  startConversationSchema,
} from "./messaging.js";
import {
  createUploadSchema,
  UPLOAD_PART_SIZE,
  uploadKindOf,
  uploadPartCount,
  uploadTicketSchema,
} from "./uploads.js";

describe("sendMessageSchema", () => {
  const key = "cle-0123456789";

  it("accepte un texte, nettoyé, sans pièce jointe", () => {
    expect(sendMessageSchema.parse({ body: "  Bonjour Aïcha !  ", idempotencyKey: key })).toEqual({
      body: "Bonjour Aïcha !",
      mediaIds: [],
      idempotencyKey: key,
    });
  });

  it("accepte une pièce jointe seule, mais pas un message vide", () => {
    expect(sendMessageSchema.safeParse({ mediaIds: ["m1"], idempotencyKey: key }).success).toBe(
      true,
    );
    const empty = sendMessageSchema.safeParse({ body: "   ", idempotencyKey: key });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.message).toBe("Écrivez un message ou joignez un fichier");
  });

  it("limite à 4 pièces jointes distinctes et exige une clé d'idempotence", () => {
    const five = { body: "x", mediaIds: ["a", "b", "c", "d", "e"], idempotencyKey: key };
    expect(sendMessageSchema.safeParse(five).success).toBe(false);
    const twice = { body: "x", mediaIds: ["a", "a"], idempotencyKey: key };
    expect(sendMessageSchema.safeParse(twice).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: "x" }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: "x", idempotencyKey: "a b c d e f" }).success).toBe(
      false,
    );
  });
});

describe("conversationListQuerySchema", () => {
  it("lit une liste de types séparés par des virgules", () => {
    expect(conversationListQuerySchema.parse({ kind: "PARRAIN_RELAIS, RELAIS_BUREAU" })).toEqual({
      kind: ["PARRAIN_RELAIS", "RELAIS_BUREAU"],
    });
    expect(conversationListQuerySchema.parse({})).toEqual({ kind: undefined });
    expect(conversationListQuerySchema.safeParse({ kind: "INCONNU" }).success).toBe(false);
  });
});

describe("startConversationSchema", () => {
  it("n'ouvre pas de conversation avec un enfant", () => {
    expect(startConversationSchema.safeParse({ kind: "SPONSORSHIP" }).success).toBe(false);
    expect(startConversationSchema.parse({ kind: "PARRAIN_BUREAU" })).toEqual({
      kind: "PARRAIN_BUREAU",
    });
  });
});

describe("messagesPath", () => {
  it("mène à la page Messages de chaque rôle", () => {
    expect(messagesPath("parrain", "c1")).toBe("/parrain/messages/c1");
    expect(messagesPath("relais")).toBe("/relais/messages");
    expect(messagesPath("bureau", "c1")).toBe("/bureau");
  });
});

describe("envois de fichiers", () => {
  it("associe chaque type MIME accepté à son type d'envoi", () => {
    expect(uploadKindOf("image/JPEG")).toBe("PHOTO");
    expect(uploadKindOf("video/webm")).toBe("VIDEO");
    expect(uploadKindOf("application/pdf")).toBe("DOCUMENT");
    expect(uploadKindOf("image/gif")).toBeNull();
    expect(uploadKindOf("application/x-msdownload")).toBeNull();
  });

  it("découpe en parts de 5 Mo", () => {
    expect(uploadPartCount(1)).toBe(1);
    expect(uploadPartCount(UPLOAD_PART_SIZE)).toBe(1);
    expect(uploadPartCount(UPLOAD_PART_SIZE + 1)).toBe(2);
    expect(uploadPartCount(25 * 1024 * 1024)).toBe(5);
  });

  it("valide la demande d'envoi", () => {
    const request = {
      purpose: "message",
      kind: "PHOTO",
      mimeType: " Image/PNG ",
      sizeBytes: 1200,
      fileName: "photo.png",
    };
    expect(createUploadSchema.parse(request).mimeType).toBe("image/png");
    expect(createUploadSchema.safeParse({ ...request, sizeBytes: 0 }).success).toBe(false);
    expect(createUploadSchema.safeParse({ ...request, purpose: "avatar" }).success).toBe(false);
  });

  it("distingue l'envoi simple de l'envoi multipart", () => {
    const single = uploadTicketSchema.parse({
      mode: "single",
      mediaId: "m1",
      url: "http://localhost:9000/media/uploads/2026/11/m1.png?X-Amz-Signature=x",
      headers: { "Content-Type": "image/png" },
      expiresAt: "2026-11-02T10:05:00.000Z",
    });
    expect(single.mode).toBe("single");
    const multipart = uploadTicketSchema.safeParse({
      mode: "multipart",
      mediaId: "m1",
      uploadId: "u1",
      partSize: UPLOAD_PART_SIZE,
      partCount: 2,
      parts: [{ partNumber: 1, url: "http://localhost:9000/x?partNumber=1" }],
      expiresAt: "2026-11-02T10:05:00.000Z",
    });
    expect(multipart.success).toBe(true);
  });
});
