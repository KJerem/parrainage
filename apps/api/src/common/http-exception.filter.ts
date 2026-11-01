import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { ApiError } from "@parrainage/contracts";
import type { Response } from "express";
import { AppError } from "./app-error.js";

const LABELS: Record<number, string> = {
  400: "Requête invalide",
  401: "Authentification requise",
  403: "Accès refusé",
  404: "Introuvable",
  405: "Méthode non autorisée",
  409: "Conflit",
  413: "Contenu trop volumineux",
  415: "Type de contenu non pris en charge",
  422: "Données invalides",
  429: "Trop de requêtes",
  500: "Erreur interne",
  503: "Service indisponible",
};

export function statusLabel(status: number): string {
  return LABELS[status] ?? (status >= 500 ? LABELS[500]! : LABELS[400]!);
}

/** Statut porté par une erreur d'Express ou de body-parser (JSON mal formé, corps trop gros…). */
function expressStatus(exception: unknown): number | undefined {
  if (typeof exception === "object" && exception !== null) {
    const status = (exception as { status?: unknown; statusCode?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 600) {
      return status;
    }
  }
  return undefined;
}

/** Réponse d'erreur uniforme et en français (les routes /api/auth répondent elles-mêmes). */
export function toApiError(exception: unknown): ApiError {
  if (exception instanceof AppError) {
    const status = exception.getStatus();
    return {
      statusCode: status,
      error: statusLabel(status),
      message: exception.message,
      ...(exception.fieldErrors ? { fieldErrors: exception.fieldErrors } : {}),
    };
  }
  const status =
    exception instanceof HttpException
      ? exception.getStatus()
      : (expressStatus(exception) ?? HttpStatus.INTERNAL_SERVER_ERROR);
  const label = statusLabel(status);
  return { statusCode: status, error: label, message: label };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = toApiError(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : exception,
      );
    }
    if (response.headersSent) {
      return;
    }
    response.status(body.statusCode).json(body);
  }
}
