import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { apiErrorSchema } from "@parrainage/contracts";
import { AppError } from "./app-error.js";
import { toApiError } from "./http-exception.filter.js";

describe("toApiError", () => {
  it.each([
    [new BadRequestException("Bad"), 400, "Requête invalide"],
    [new UnauthorizedException(), 401, "Authentification requise"],
    [new ForbiddenException("Insufficient permissions"), 403, "Accès refusé"],
    [new NotFoundException("Cannot GET /api/inconnu"), 404, "Introuvable"],
    [new Error("boom"), 500, "Erreur interne"],
    [
      Object.assign(new Error("request entity too large"), { status: 413 }),
      413,
      "Contenu trop volumineux",
    ],
  ])("traduit %s en %i", (exception, status, label) => {
    const body = toApiError(exception);
    expect(body).toEqual({ statusCode: status, error: label, message: label });
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
  });

  it("garde le message et les champs d'une erreur métier", () => {
    const body = toApiError(new AppError(400, "Requête invalide", { email: ["Adresse invalide"] }));
    expect(body).toEqual({
      statusCode: 400,
      error: "Requête invalide",
      message: "Requête invalide",
      fieldErrors: { email: ["Adresse invalide"] },
    });
    expect(toApiError(new AppError(409, "Ce binôme existe déjà")).message).toBe(
      "Ce binôme existe déjà",
    );
  });

  it("traduit 429 en « Trop de requêtes »", () => {
    expect(toApiError(new AppError(429, "Réessayez dans une minute")).error).toBe(
      "Trop de requêtes",
    );
  });
});
