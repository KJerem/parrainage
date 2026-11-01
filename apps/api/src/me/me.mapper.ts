import { initials, meSchema, roleSchema, type Me } from "@parrainage/contracts";

export interface MeSource {
  id: string;
  name: string;
  email: string;
  role: string | null;
  parrainProfile: { displayName: string; avatarTone: string } | null;
  relais: { displayName: string; city: string; district: string } | null;
}

/**
 * Projection de l'utilisateur connecté vers le contrat GET /api/me.
 * `null` si le rôle enregistré n'est pas un rôle de la plateforme.
 */
export function toMe(source: MeSource): Me | null {
  const role = roleSchema.safeParse(source.role);
  if (!role.success) {
    return null;
  }
  const { parrainProfile, relais } = source;
  const displayName = parrainProfile?.displayName ?? relais?.displayName ?? source.name;
  return meSchema.parse({
    user: {
      id: source.id,
      name: source.name,
      email: source.email,
      role: role.data,
      initials: initials(displayName),
    },
    parrain: parrainProfile
      ? { displayName: parrainProfile.displayName, avatarTone: parrainProfile.avatarTone }
      : null,
    relais: relais
      ? { displayName: relais.displayName, city: relais.city, district: relais.district }
      : null,
  });
}
