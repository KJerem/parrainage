import type { NestApplicationOptions } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { HttpExceptionFilter } from "./common/http-exception.filter.js";
import { createValidationPipe } from "./common/validation.js";

/**
 * Options de création de l'application (main.ts et tests e2e). Better Auth lit lui-même le corps
 * des requêtes /api/auth : l'AuthModule remet les parseurs JSON/urlencoded pour les autres routes.
 */
export const appOptions: NestApplicationOptions = { bodyParser: false };

/** Réglages communs à l'application et aux tests e2e. */
export function configureApp(app: NestExpressApplication): void {
  // Messages de validation zod en français (schémas de @parrainage/contracts compris).
  z.config(z.locales.fr());
  // Le navigateur ne parle qu'au web (http://localhost:3000) qui réécrit /api/* vers l'API.
  app.setGlobalPrefix("api");
  // Les requêtes arrivent via le serveur Next (boucle locale). Attention : la réécriture Next
  // n'ajoute pas X-Forwarded-For et transmet tel quel celui du navigateur. Sans proxy inverse
  // devant le web pour le réécrire, `req.ip` est donc falsifiable : jamais de limite par IP.
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");
  // Express 5 ne lit pas les cookies : nécessaire aux sessions élèves (cookies signés par jose).
  app.use(cookieParser());
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
}
