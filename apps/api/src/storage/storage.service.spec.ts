import type { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { attachmentDisposition, StorageService } from "./storage.service.js";

const values: Partial<Env> = {
  S3_REGION: "us-east-1",
  S3_BUCKET: "media",
  S3_ACCESS_KEY: "devaccess",
  S3_SECRET_KEY: "devsecret123",
  S3_ENDPOINT: "http://storage:9000",
  S3_PUBLIC_ENDPOINT: "http://localhost:9000",
};
const config = { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>;

describe("StorageService.presignGet", () => {
  it("signe sur l'hôte public, pour 120 s, sans cache", async () => {
    const url = new URL(await new StorageService(config).presignGet("seed/bulletins/a.pdf"));
    expect(url.origin).toBe("http://localhost:9000");
    expect(url.pathname).toBe("/media/seed/bulletins/a.pdf");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(url.searchParams.get("response-cache-control")).toBe("private, no-store");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("propose un téléchargement quand un nom de fichier est donné", async () => {
    const url = new URL(
      await new StorageService(config).presignGet("k.pdf", {
        contentType: "application/pdf",
        downloadName: "Bulletin T1 — 2026-27.pdf",
      }),
    );
    expect(url.searchParams.get("response-content-type")).toBe("application/pdf");
    expect(url.searchParams.get("response-content-disposition")).toContain("attachment;");
  });
});

describe("attachmentDisposition", () => {
  it("donne un nom ASCII de repli et le nom exact encodé", () => {
    expect(attachmentDisposition("Bulletin T1 — 2026-27.pdf")).toBe(
      `attachment; filename="Bulletin T1 _ 2026-27.pdf"; filename*=UTF-8''Bulletin%20T1%20%E2%80%94%202026-27.pdf`,
    );
    expect(attachmentDisposition('Élève "A".pdf')).toBe(
      `attachment; filename="Eleve _A_.pdf"; filename*=UTF-8''%C3%89l%C3%A8ve%20%22A%22.pdf`,
    );
  });
});
