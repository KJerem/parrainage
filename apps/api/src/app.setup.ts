import type { NestExpressApplication } from "@nestjs/platform-express";

/** Réglages communs à l'application et aux tests e2e. */
export function configureApp(app: NestExpressApplication): void {
  // Le navigateur ne parle qu'au web (http://localhost:3000) qui réécrit /api/* vers l'API.
  app.setGlobalPrefix("api");
  // Les requêtes arrivent via le serveur Next : on fait confiance à son en-tête X-Forwarded-For.
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");
}
