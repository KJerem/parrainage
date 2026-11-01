/** Date civile « AAAA-MM-JJ » (minuit UTC) ou instant. */
function toDate(value: Date | string): Date {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Date invalide : « ${String(value)} »`);
  }
  return date;
}

/**
 * Âge en années révolues à la date `at` (calendrier UTC, comme les dates civiles stockées).
 * Né un 29 février : l'anniversaire tombe le 1er mars les années non bissextiles.
 */
export function ageAt(birthDate: Date | string, at: Date | string): number {
  const birth = toDate(birthDate);
  const ref = toDate(at);
  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = ref.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && ref.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}
