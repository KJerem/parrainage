import { z } from "zod";

/** Teintes de l'avatar (composant Avatar du web). */
export const avatarTones = [
  "amber",
  "brand",
  "neutral",
  "dark",
  "info",
  "info-strong",
  "amber-soft",
  "danger",
  "white",
] as const;

export const avatarToneSchema = z.enum(avatarTones);

export type AvatarTone = z.infer<typeof avatarToneSchema>;
