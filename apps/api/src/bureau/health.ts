// Santé des binômes et état des parrains (plan §8), calculés à `at` : rien n'est stocké.
import {
  daysSince,
  INACTIVE_PARRAIN_LATE_PAYMENTS,
  type ParrainStatus,
  SPONSORSHIP_ALERT_DAYS,
  type SponsorshipHealth,
} from "@parrainage/contracts";

export interface ParrainActivity {
  /** `null` : jamais connecté (invité). */
  lastActiveAt: Date | null;
  joinedAt: Date;
  /** Versements en retard ou en échec. */
  latePayments: number;
}

/** Parrain sans activité depuis 60 jours, ou avec au moins 2 versements en retard. */
export function isInactiveParrain(parrain: ParrainActivity, at: Date): boolean {
  return (
    daysSince(parrain.lastActiveAt ?? parrain.joinedAt, at) >= SPONSORSHIP_ALERT_DAYS ||
    parrain.latePayments >= INACTIVE_PARRAIN_LATE_PAYMENTS
  );
}

/** Le plus récent de deux instants, ou `null`. */
export function latest(...dates: readonly (Date | null | undefined)[]): Date | null {
  return dates.reduce<Date | null>(
    (best, date) => (date && (!best || date > best) ? date : best),
    null,
  );
}

/**
 * Par ordre de priorité : parrain inactif ; à relancer (60 jours ou plus sans nouvelle ni
 * échange, depuis le début du binôme s'il n'y en a jamais eu) ; sinon actif.
 */
export function sponsorshipHealth(input: {
  at: Date;
  parrain: ParrainActivity;
  startDate: Date;
  lastExchangeAt: Date | null;
}): { health: SponsorshipHealth; days: number } {
  const days = daysSince(input.lastExchangeAt ?? input.startDate, input.at);
  if (isInactiveParrain(input.parrain, input.at)) {
    return { health: "INACTIVE_PARRAIN", days };
  }
  return { health: days >= SPONSORSHIP_ALERT_DAYS ? "TO_FOLLOW_UP" : "ACTIVE", days };
}

/** Invité (jamais connecté), inactif, en attente d'un filleul, ou parrain d'au moins un enfant. */
export function parrainStatus(
  parrain: ParrainActivity & { activeSponsorships: number },
  at: Date,
): ParrainStatus {
  if (parrain.lastActiveAt === null) {
    return "INVITED";
  }
  if (isInactiveParrain(parrain, at)) {
    return "INACTIVE";
  }
  return parrain.activeSponsorships === 0 ? "WAITING" : "WITH_CHILD";
}

/** Début proposé pour un nouveau binôme : le premier jour du mois suivant (UTC). */
export function firstDayOfNextMonth(at: Date): string {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

/** Initiale du nom, sans accent : « Élise » → « E ». */
export function initialOf(lastName: string): string {
  return lastName.trim().normalize("NFD").replace(/\p{M}/gu, "").charAt(0).toUpperCase();
}
