import { z } from "zod";

/** Rôles des comptes adultes (plugin admin de Better Auth). */
export const roles = ["parrain", "relais", "bureau"] as const;

export const roleSchema = z.enum(roles);

export type Role = z.infer<typeof roleSchema>;

/** Espace d'arrivée de chaque rôle après connexion. */
export const roleHome: Record<Role, string> = {
  parrain: "/parrain",
  relais: "/relais",
  bureau: "/bureau",
};
