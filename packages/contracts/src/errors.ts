import { z } from "zod";

/** Corps des réponses d'erreur de l'API (hors routes /api/auth, gérées par Better Auth). */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  /** Erreurs de validation par champ (« email », « address.city »…), en français. */
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
