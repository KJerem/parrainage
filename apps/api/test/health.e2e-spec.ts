import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app.js";

// Nécessite les services locaux : `npm run db:up` à la racine du dépôt.
describe("GET /api/health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("répond à la sonde légère sans session ni appel aux services", async () => {
    const res = await request(app.getHttpServer()).get("/api/health?light").expect(200);
    expect(res.body).toEqual({ app: "ok" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("vérifie la base, le stockage et le serveur d'e-mails sans session", async () => {
    const res = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(res.body).toEqual({ db: "ok", s3: "ok", smtp: "ok" });
  });

  it("répond en français pour une route inconnue", async () => {
    const res = await request(app.getHttpServer()).get("/api/inconnue").expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Introuvable", message: "Introuvable" });
  });
});
