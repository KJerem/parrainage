import type { CallCard, NextCall } from "@parrainage/contracts";
import {
  formatDayMonth,
  formatHour,
  formatWeekday,
  PARRAIN_TIME_ZONE,
  RELAIS_TIME_ZONE,
} from "@/lib/format";

// Libellés des appels vidéo : l'heure de Paris pour le parrain, celle de Lomé pour l'enfant et le
// relais, souvent les deux côte à côte (« 11 h Paris · 10 h Lomé »).

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** « 11 h », « 9 h 30 » */
export function callHour(date: string | Date, timeZone: string): string {
  return formatHour(date, timeZone).replace(/ h 00$/, " h");
}

/** « Sam. 14 nov. » (P-Video). */
export function slotDay(date: string | Date, timeZone = PARRAIN_TIME_ZONE): string {
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone }).format(
    new Date(date),
  );
  return `${capitalize(weekday)} ${formatDayMonth(date, { month: "short", timeZone })}`;
}

/** « 11 h Paris · 10 h Lomé » */
export function slotTimes(date: string | Date): string {
  return `${callHour(date, PARRAIN_TIME_ZONE)} Paris · ${callHour(date, RELAIS_TIME_ZONE)} Lomé`;
}

/** « samedi 14 nov., 11 h » (heure de Paris par défaut). */
export function callMoment(date: string | Date, timeZone = PARRAIN_TIME_ZONE): string {
  return `${formatWeekday(date, timeZone)} ${formatDayMonth(date, { month: "short", timeZone })}, ${callHour(date, timeZone)}`;
}

/** « Samedi 14 novembre » */
export function callLongDay(date: string | Date, timeZone = PARRAIN_TIME_ZONE): string {
  return capitalize(
    `${formatWeekday(date, timeZone)} ${formatDayMonth(date, { month: "long", timeZone })}`,
  );
}

export function durationLabel(minutes: number): string {
  return `${minutes} minutes`;
}

/**
 * Pastille d'une demande dans la conversation : « Demande d'appel · samedi 14 nov., 11 h (Paris) »,
 * puis son issue.
 */
export function callCardLabel(card: Pick<CallCard, "status" | "slot">): string {
  const moment = card.slot ? `${callMoment(card.slot.startsAt)} (Paris)` : null;
  switch (card.status) {
    case "REQUESTED":
      return moment ? `Demande d'appel · ${moment}` : "Demande d'appel";
    case "SLOTS_PROPOSED":
      return "Autres créneaux proposés";
    case "CONFIRMED":
      return moment ? `Appel confirmé · ${moment}` : "Appel confirmé";
    case "CANCELLED":
      return "Demande annulée";
    case "DECLINED":
      return "Demande refusée";
  }
}

/** Carte « Prochain appel vidéo » de Main : titre et précision sous la date. */
export function nextCallLines(call: NextCall): {
  title: string;
  when: string | null;
  detail: string;
} {
  const when = call.startsAt
    ? `${callLongDay(call.startsAt)} · ${callHour(call.startsAt, PARRAIN_TIME_ZONE)}`
    : null;
  switch (call.state) {
    case "confirmed":
      return {
        title: "Prochain appel vidéo",
        when,
        detail: `Depuis la salle du relais, avec ${call.relaisName}`,
      };
    case "requested":
      return {
        title: "Appel vidéo demandé",
        when,
        detail: `En attente de la confirmation de ${call.relaisName}`,
      };
    case "proposed":
      return {
        title: "Appel vidéo",
        when: null,
        detail: `${call.relaisName} vous propose d'autres créneaux : choisissez celui qui vous convient.`,
      };
  }
}
