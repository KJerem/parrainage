import { type INestApplication, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { ModulesContainer } from "@nestjs/core";
import request from "supertest";
import { createTestApp } from "./app.js";

// Routes publiques voulues (@AllowAnonymous) : toute autre route exige une session.
const ANONYMOUS_ROUTES = ["GET /api/health"];

type Route = { method: keyof typeof RequestMethod; path: string };

const asList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).map((part) => String(part ?? ""));

function joinPath(...parts: string[]): string {
  const path = parts
    .flatMap((part) => part.split("/"))
    .filter(Boolean)
    // Paramètres de route (« :id ») remplacés par une valeur quelconque.
    .map((segment) => (segment.startsWith(":") ? "x" : segment))
    .join("/");
  return `/${path}`;
}

/** Routes des contrôleurs Nest, lues dans leurs métadonnées (hors Better Auth). */
function controllerRoutes(app: INestApplication): Route[] {
  const routes: Route[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const { metatype } of module.controllers.values()) {
      if (typeof metatype !== "function") {
        continue;
      }
      const prototype = metatype.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (name === "constructor" || typeof handler !== "function") {
          continue;
        }
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        const path: unknown = Reflect.getMetadata(PATH_METADATA, handler);
        if (method === undefined || path === undefined) {
          continue;
        }
        for (const base of asList(Reflect.getMetadata(PATH_METADATA, metatype))) {
          for (const own of asList(path)) {
            const verb = RequestMethod[method] as keyof typeof RequestMethod;
            routes.push({ method: verb, path: joinPath("api", base, own) });
          }
        }
      }
    }
  }
  return routes;
}

describe("Chaque route refuse sans session (e2e)", () => {
  let app: INestApplication;
  let routes: Route[];

  beforeAll(async () => {
    app = await createTestApp();
    routes = controllerRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("recense les routes des contrôleurs", () => {
    const names = routes.map((route) => `${route.method} ${route.path}`);
    expect(names).toEqual(expect.arrayContaining(["GET /api/me", "GET /api/admin/ping"]));
    expect(names).toEqual(expect.arrayContaining(ANONYMOUS_ROUTES));
  });

  it("répond 401 sur toute route non publique appelée sans cookie de session", async () => {
    const protectedRoutes = routes.filter(
      (route) => !ANONYMOUS_ROUTES.includes(`${route.method} ${route.path}`),
    );
    expect(protectedRoutes.length).toBeGreaterThan(0);
    for (const route of protectedRoutes) {
      const method = route.method === "ALL" ? "get" : route.method.toLowerCase();
      const res = await request(app.getHttpServer())
        [method as "get"](route.path)
        .set("Origin", "http://localhost:3000")
        .send({});
      expect({ route, status: res.status }).toEqual({ route, status: 401 });
      expect(res.body).toMatchObject({ statusCode: 401, error: "Authentification requise" });
    }
  });
});
