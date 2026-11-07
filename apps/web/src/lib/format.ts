// Mise en forme française des données de l'API (centimes, centièmes, dates ISO en UTC).
// Les espaces insécables sont celles que produit Intl (U+00A0 avant « € », U+202F entre milliers).

const LOCALE = "fr-FR";

/** Fuseau des parrains (France) : « hier » et « aujourd'hui » se comptent à l'heure de Paris. */
export const PARRAIN_TIME_ZONE = "Europe/Paris";

/** Fuseau des relais (Togo, UTC toute l'année). */
export const RELAIS_TIME_ZONE = "Africa/Lome";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const wholeEuros = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const euros = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR" });

/** « 25 € », « 1 540 € », « 356,40 € » : les centimes ne s'affichent que s'il y en a. */
export function formatEuros(cents: number): string {
  return (Number.isInteger(cents / 100) ? wholeEuros : euros).format(cents / 100);
}

const averageNumber = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

/** Moyenne en centièmes : 1340 → « 13,4 / 20 ». */
export function formatAverage(averageX100: number): string {
  return `${averageNumber.format(averageX100 / 100)} / 20`;
}

/** Rang dans la classe : « 5 / 48 », ou « 5e » sans effectif connu. */
export function formatRank(rank: number, classSize: number | null): string {
  if (classSize !== null) {
    return `${rank} / ${classSize}`;
  }
  return rank === 1 ? "1er" : `${rank}e`;
}

/** « 1 an », « 12 ans ». */
export function formatAge(age: number): string {
  return `${age} ${age >= 2 ? "ans" : "an"}`;
}

/** Durée d'une vidéo : 42 → « 0:42 », 3723 → « 1:02:03 ». */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
}

const monthYear = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Date civile « 2023-03-01 » → « mars 2023 ». */
export function formatMonthYear(isoDate: string): string {
  return monthYear.format(new Date(isoDate));
}

/** Mois prélevé « 2026-10 » → « Octobre 2026 ». */
export function formatPeriodKey(periodKey: string): string {
  return capitalize(formatMonthYear(`${periodKey}-01`));
}

type MonthStyle = "long" | "short";

const dayMonthFormats = new Map<string, Intl.DateTimeFormat>();

function dayMonthFormat(month: MonthStyle, withYear: boolean, timeZone: string) {
  const key = `${month}|${withYear}|${timeZone}`;
  let format = dayMonthFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE, {
      day: "numeric",
      month,
      ...(withYear ? { year: "numeric" } : {}),
      timeZone,
    });
    dayMonthFormats.set(key, format);
  }
  return format;
}

/** « 12 octobre », « 2 sept. », « 1er mai 2025 » (année affichée si `withYear`). */
export function formatDayMonth(
  date: Date | string,
  options: { month?: MonthStyle; withYear?: boolean; timeZone?: string } = {},
): string {
  const { month = "long", withYear = false, timeZone = PARRAIN_TIME_ZONE } = options;
  const parts = dayMonthFormat(month, withYear, timeZone).formatToParts(new Date(date));
  return parts
    .map((part) => (part.type === "day" && part.value === "1" ? "1er" : part.value))
    .join("");
}

/** « 30 octobre 2026 ». */
export function formatLongDate(date: Date | string, timeZone = PARRAIN_TIME_ZONE): string {
  return formatDayMonth(date, { withYear: true, timeZone });
}

const civilDay = new Map<string, Intl.DateTimeFormat>();

/** Numéro du jour civil dans le fuseau (jours depuis 1970) : sert à compter « hier ». */
function dayNumber(date: Date, timeZone: string): number {
  let format = civilDay.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
    civilDay.set(timeZone, format);
  }
  return Date.parse(`${format.format(date)}T00:00:00Z`) / MS_PER_DAY;
}

function yearIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(date);
}

export type RelativeDayOptions = {
  /** « 12 octobre » (fil, par défaut) ou « 2 sept. » (listes de conversations). */
  month?: MonthStyle;
  /** Au-delà, la date s'affiche (par défaut : « il y a 6 j », puis « 12 octobre »). */
  maxDays?: number;
  timeZone?: string;
};

/**
 * Date relative à `now`, l'instant de référence renvoyé par l'API (jamais l'horloge du
 * navigateur) : « Aujourd'hui », « Hier », « il y a 2 j », puis « 12 octobre » ou
 * « 12 octobre 2025 » si l'année diffère.
 */
export function formatRelativeDay(
  date: Date | string,
  now: Date | string,
  options: RelativeDayOptions = {},
): string {
  const { month = "long", maxDays = 6, timeZone = PARRAIN_TIME_ZONE } = options;
  const at = new Date(date);
  const reference = new Date(now);
  const days = dayNumber(reference, timeZone) - dayNumber(at, timeZone);
  if (days === 0) {
    return "Aujourd'hui";
  }
  if (days === 1) {
    return "Hier";
  }
  if (days > 1 && days <= maxDays) {
    return `il y a ${days} j`;
  }
  const withYear = yearIn(at, timeZone) !== yearIn(reference, timeZone);
  return formatDayMonth(at, { month, withYear, timeZone });
}

/** Jour de la semaine et date : « Samedi 31 octobre ». */
/** « mardi » */
export function formatWeekday(date: Date | string, timeZone = PARRAIN_TIME_ZONE): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "long", timeZone }).format(new Date(date));
}

export function formatWeekdayDate(date: Date | string, timeZone = PARRAIN_TIME_ZONE): string {
  return capitalize(
    new Intl.DateTimeFormat(LOCALE, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone,
    }).format(new Date(date)),
  );
}

/** Ancienneté courte : « 35 min », « 5 h », « 2 j » (jamais négative). */
export function formatElapsed(date: Date | string, now: Date | string): string {
  const elapsed = new Date(now).getTime() - new Date(date).getTime();
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} j`;
}

/**
 * Réception d'un message : « à l'instant », « il y a 5 h » le jour même, « hier », puis
 * « il y a 3 j » et la date.
 */
export function formatReceived(
  date: Date | string,
  now: Date | string,
  timeZone = PARRAIN_TIME_ZONE,
): string {
  const at = new Date(date);
  const reference = new Date(now);
  if (reference.getTime() - at.getTime() < 60_000) {
    return "à l'instant";
  }
  const days = dayNumber(reference, timeZone) - dayNumber(at, timeZone);
  if (days === 0) {
    return `il y a ${formatElapsed(at, reference)}`;
  }
  return days === 1 ? "hier" : formatRelativeDay(at, reference, { timeZone });
}

/** Jours écoulés en toutes lettres : « aujourd'hui », « hier », « il y a 64 jours ». */
export function formatDaysAgo(
  date: Date | string,
  now: Date | string,
  timeZone = PARRAIN_TIME_ZONE,
): string {
  const days = dayNumber(new Date(now), timeZone) - dayNumber(new Date(date), timeZone);
  if (days <= 0) {
    return "aujourd'hui";
  }
  return days === 1 ? "hier" : `il y a ${days} jours`;
}

const clockFormats = new Map<string, Intl.DateTimeFormat>();

/** Heure « 15:00 » dans le fuseau. */
export function formatClock(date: Date | string, timeZone = PARRAIN_TIME_ZONE): string {
  let format = clockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone });
    clockFormats.set(timeZone, format);
  }
  return format.format(new Date(date));
}

/** Heure « 16 h 00 », « 9 h 30 » dans le fuseau, comme l'écrivent les écrans des sessions élèves. */
export function formatHour(date: Date | string, timeZone = PARRAIN_TIME_ZONE): string {
  return formatClock(date, timeZone).replace(/^0/, "").replace(":", " h ");
}

/** Jour civil « 2026-10-30 » dans le fuseau : regroupe les messages d'un même jour. */
export function civilDayKey(date: Date | string, timeZone = PARRAIN_TIME_ZONE): string {
  const days = dayNumber(new Date(date), timeZone);
  return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Date d'une liste de conversations (P-Messages) : « 15:00 » le jour même, « hier »,
 * « il y a 3 j », puis « 2 sept. » (« 2 sept. 2025 » une autre année).
 */
export function formatListDate(
  date: Date | string,
  now: Date | string,
  timeZone = PARRAIN_TIME_ZONE,
): string {
  const relative = formatRelativeDay(date, now, { month: "short", timeZone });
  if (relative === "Aujourd'hui") {
    return formatClock(date, timeZone);
  }
  return relative === "Hier" ? "hier" : relative;
}

/** Séparateur de jour d'un fil : « Aujourd'hui », « Hier », « 14 octobre ». */
export function formatDaySeparator(
  date: Date | string,
  now: Date | string,
  timeZone = PARRAIN_TIME_ZONE,
): string {
  return formatRelativeDay(date, now, { maxDays: 1, timeZone });
}
