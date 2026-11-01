import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module.js";
import { appOptions, configureApp } from "../src/app.setup.js";

/** Origine du web : Better Auth refuse un POST porteur de cookie sans en-tête Origin. */
export const WEB_ORIGIN = "http://localhost:3000";

export const SESSION_COOKIE = "better-auth.session_token";

/** Application complète, configurée comme main.ts (services Docker requis). */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(appOptions);
  configureApp(app);
  // Port éphémère ouvert une fois : supertest réutilise le serveur au lieu d'en ouvrir un par
  // requête (sinon deux requêtes imbriquées se ferment le serveur l'une à l'autre).
  await app.listen(0, "127.0.0.1");
  return app;
}

/** Extrait « nom=valeur » du cookie de session d'une réponse. */
export function sessionCookie(setCookie: string | string[] | undefined): string | undefined {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.split(";")[0];
}
