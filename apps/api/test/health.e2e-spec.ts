import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";

// Nécessite les services locaux : `npm run db:up` à la racine du dépôt.
describe("GET /api/health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(nestApp);
    app = await nestApp.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("répond à la sonde légère sans interroger les services", async () => {
    const res = await request(app.getHttpServer()).get("/api/health?light").expect(200);
    expect(res.body).toEqual({ app: "ok" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("vérifie la base, le stockage et le serveur d'e-mails", async () => {
    const res = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(res.body).toEqual({ db: "ok", s3: "ok", smtp: "ok" });
  });
});
