import { roleSchema, type Role } from "@parrainage/contracts";
import type { PrismaService } from "../prisma/prisma.service.js";

/** Adulte connecté, avec son profil métier (vérification de propriété dans les services). */
export interface Actor {
  userId: string;
  role: Role;
  /** Profil parrain (rôle parrain). */
  parrainId: string | null;
  /** Relais (rôle relais). */
  relaisId: string | null;
}

/** Utilisateur de la session Better Auth (plugin admin : `role`). */
export interface SessionUser {
  id: string;
  role?: string | string[] | null;
}

/** Acteur de la session, ou `null` si son rôle n'est pas un rôle de la plateforme. */
export async function loadActor(prisma: PrismaService, user: SessionUser): Promise<Actor | null> {
  const role = roleSchema.safeParse(user.role);
  if (!role.success) {
    return null;
  }
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { parrainProfile: { select: { id: true } }, relais: { select: { id: true } } },
  });
  if (!profile) {
    return null;
  }
  return {
    userId: user.id,
    role: role.data,
    parrainId: role.data === "parrain" ? (profile.parrainProfile?.id ?? null) : null,
    relaisId: role.data === "relais" ? (profile.relais?.id ?? null) : null,
  };
}
