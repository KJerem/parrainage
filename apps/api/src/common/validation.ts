import {
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from "@nestjs/common";
import { AppError } from "./app-error.js";

type Issues = Parameters<NonNullable<StandardSchemaValidationPipeOptions["exceptionFactory"]>>[0];

export const INVALID_REQUEST_MESSAGE = "Requête invalide";

function issuePath(issue: Issues[number]): string {
  return (issue.path ?? [])
    .map((segment) => (typeof segment === "object" ? segment.key : segment))
    .map(String)
    .join(".");
}

/** Regroupe les erreurs de validation par champ (« email », « address.city »…). */
export function toFieldErrors(issues: Issues): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issuePath(issue) || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/** Validation des @Body/@Param/@Query({ schema }) par les schémas zod partagés. */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => new AppError(400, INVALID_REQUEST_MESSAGE, toFieldErrors(issues)),
  });
}
