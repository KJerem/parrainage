const DAY_MS = 24 * 60 * 60 * 1000;

/** Minuit UTC du jour donné. */
export function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Jour de référence du seed : SEED_TODAY (AAAA-MM-JJ) ou aujourd'hui. */
export function seedToday(value: string | undefined): Date {
  if (!value) {
    return startOfDayUtc(new Date());
  }
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`SEED_TODAY invalide : « ${value} » (format attendu : AAAA-MM-JJ)`);
  }
  return startOfDayUtc(parsed);
}

export function day(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** Date de naissance d'un enfant qui a `age` ans révolus, `extraDays` après son anniversaire. */
export function birthDateForAge(today: Date, age: number, extraDays: number): Date {
  const birthday = new Date(today);
  birthday.setUTCFullYear(today.getUTCFullYear() - age);
  return addDays(birthday, -extraDays);
}

/** Année scolaire togolaise (rentrée en septembre) : « 2026-2027 ». */
export { schoolYearOf } from "@parrainage/contracts";
