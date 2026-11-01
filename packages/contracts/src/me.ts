import { z } from "zod";
import { avatarToneSchema } from "./avatar.js";
import { roleSchema } from "./roles.js";

/** Réponse de GET /api/me : l'utilisateur connecté et son profil métier. */
export const meSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string(),
    email: z.email(),
    role: roleSchema,
    initials: z.string().min(1).max(2),
  }),
  parrain: z
    .object({
      displayName: z.string(),
      avatarTone: avatarToneSchema,
    })
    .nullable(),
  relais: z
    .object({
      displayName: z.string(),
      city: z.string(),
      district: z.string(),
    })
    .nullable(),
});

export type Me = z.infer<typeof meSchema>;
