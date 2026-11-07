import { describe, expect, it } from "vitest";
import {
  civilDayKey,
  formatAge,
  formatAverage,
  formatClock,
  formatDayMonth,
  formatDaysAgo,
  formatDaySeparator,
  formatDuration,
  formatElapsed,
  formatEuros,
  formatListDate,
  formatLongDate,
  formatMonthYear,
  formatPeriodKey,
  formatRank,
  formatReceived,
  formatRelativeDay,
  formatWeekdayDate,
  RELAIS_TIME_ZONE,
} from "./format";

const NBSP = " ";
const NNBSP = " ";

describe("formatEuros", () => {
  it("affiche les euros ronds sans centimes", () => {
    expect(formatEuros(2500)).toBe(`25${NBSP}€`);
    expect(formatEuros(54000)).toBe(`540${NBSP}€`);
    expect(formatEuros(0)).toBe(`0${NBSP}€`);
  });

  it("garde deux décimales dès qu'il y a des centimes", () => {
    expect(formatEuros(35640)).toBe(`356,40${NBSP}€`);
    expect(formatEuros(5)).toBe(`0,05${NBSP}€`);
  });

  it("sépare les milliers par une espace fine insécable", () => {
    expect(formatEuros(154000)).toBe(`1${NNBSP}540${NBSP}€`);
  });
});

describe("formatAverage et formatRank", () => {
  it("convertit les centièmes en note sur 20", () => {
    expect(formatAverage(1340)).toBe("13,4 / 20");
    expect(formatAverage(1180)).toBe("11,8 / 20");
    expect(formatAverage(1200)).toBe("12,0 / 20");
    expect(formatAverage(1345)).toBe("13,45 / 20");
  });

  it("affiche le rang avec ou sans effectif", () => {
    expect(formatRank(5, 48)).toBe("5 / 48");
    expect(formatRank(1, null)).toBe("1er");
    expect(formatRank(3, null)).toBe("3e");
  });
});

describe("formatAge et formatDuration", () => {
  it("accorde « an » au pluriel à partir de 2", () => {
    expect(formatAge(12)).toBe("12 ans");
    expect(formatAge(1)).toBe("1 an");
    expect(formatAge(0)).toBe("0 an");
  });

  it("formate une durée en minutes et secondes", () => {
    expect(formatDuration(42)).toBe("0:42");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(600)).toBe("10:00");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(-3)).toBe("0:00");
  });
});

describe("mois et dates", () => {
  it("donne le mois et l'année d'une date civile", () => {
    expect(formatMonthYear("2023-03-01")).toBe("mars 2023");
    expect(formatMonthYear("2025-09-01")).toBe("septembre 2025");
    expect(formatPeriodKey("2026-10")).toBe("Octobre 2026");
    expect(formatPeriodKey("2026-08")).toBe("Août 2026");
  });

  it("écrit le jour et le mois à l'heure de Paris", () => {
    expect(formatDayMonth("2026-10-12T09:00:00Z")).toBe("12 octobre");
    expect(formatDayMonth("2026-09-02T15:00:00Z", { month: "short" })).toBe("2 sept.");
    // 23 h 30 UTC le 31 octobre : déjà le 1er novembre à Paris.
    expect(formatDayMonth("2026-10-31T23:30:00Z")).toBe("1er novembre");
    expect(formatLongDate("2026-10-30T14:30:00Z")).toBe("30 octobre 2026");
    expect(formatLongDate("2026-05-01T08:00:00Z")).toBe("1er mai 2026");
  });
});

describe("formatRelativeDay", () => {
  const now = "2026-10-31T10:00:00Z";

  it("compte les jours civils à l'heure de Paris", () => {
    expect(formatRelativeDay("2026-10-31T06:00:00Z", now)).toBe("Aujourd'hui");
    expect(formatRelativeDay("2026-10-30T15:00:00Z", now)).toBe("Hier");
    // 23 h 30 UTC la veille : déjà le 31 à Paris.
    expect(formatRelativeDay("2026-10-30T23:30:00Z", now)).toBe("Aujourd'hui");
    expect(formatRelativeDay("2026-10-29T08:00:00Z", now)).toBe("il y a 2 j");
    expect(formatRelativeDay("2026-10-25T08:00:00Z", now)).toBe("il y a 6 j");
  });

  it("passe à la date au-delà de 6 jours", () => {
    expect(formatRelativeDay("2026-10-24T08:00:00Z", now)).toBe("24 octobre");
    expect(formatRelativeDay("2026-10-12T09:00:00Z", now)).toBe("12 octobre");
    expect(formatRelativeDay("2026-09-02T15:00:00Z", now, { month: "short" })).toBe("2 sept.");
  });

  it("ajoute l'année quand elle diffère de celle de référence", () => {
    expect(formatRelativeDay("2025-12-20T09:00:00Z", now)).toBe("20 décembre 2025");
    expect(formatRelativeDay("2025-09-05T09:00:00Z", now, { month: "short" })).toBe("5 sept. 2025");
  });

  it("respecte un seuil personnalisé et les dates à venir", () => {
    expect(formatRelativeDay("2026-10-19T08:00:00Z", now, { maxDays: 30 })).toBe("il y a 12 j");
    expect(formatRelativeDay("2026-11-05T08:00:00Z", now)).toBe("5 novembre");
  });

  it("accepte des objets Date", () => {
    expect(formatRelativeDay(new Date("2026-10-30T15:00:00Z"), new Date(now))).toBe("Hier");
  });
});

describe("dates de la messagerie", () => {
  const now = "2026-10-31T10:00:00Z";

  it("affiche l'heure le jour même, puis « hier » et le jour court (P-Messages)", () => {
    expect(formatListDate("2026-10-31T08:05:00Z", now)).toBe("09:05");
    expect(formatListDate("2026-10-30T15:00:00Z", now)).toBe("hier");
    expect(formatListDate("2026-10-27T15:00:00Z", now)).toBe("il y a 4 j");
    expect(formatListDate("2026-09-02T15:00:00Z", now)).toBe("2 sept.");
    expect(formatListDate("2025-09-02T15:00:00Z", now)).toBe("2 sept. 2025");
  });

  it("compte les jours dans le fuseau du lecteur", () => {
    // 23 h 30 à Paris le 30, mais déjà le 31 en UTC… et l'inverse à Lomé.
    expect(formatListDate("2026-10-30T22:30:00Z", now)).toBe("hier");
    expect(formatListDate("2026-10-30T22:30:00Z", now, RELAIS_TIME_ZONE)).toBe("hier");
    expect(formatClock("2026-10-31T08:05:00Z", RELAIS_TIME_ZONE)).toBe("08:05");
  });

  it("sépare les jours d'un fil comme la maquette", () => {
    expect(formatDaySeparator("2026-10-31T09:00:00Z", now)).toBe("Aujourd'hui");
    expect(formatDaySeparator("2026-10-30T15:00:00Z", now)).toBe("Hier");
    expect(formatDaySeparator("2026-10-28T15:00:00Z", now)).toBe("28 octobre");
    expect(formatDaySeparator("2026-10-14T15:30:00Z", now)).toBe("14 octobre");
  });

  it("regroupe par jour civil", () => {
    expect(civilDayKey("2026-10-30T22:30:00Z")).toBe("2026-10-30");
    expect(civilDayKey("2026-10-30T23:30:00Z")).toBe("2026-10-31");
    expect(civilDayKey("2026-10-30T23:30:00Z", RELAIS_TIME_ZONE)).toBe("2026-10-30");
  });
});

describe("formatElapsed, formatReceived et formatDaysAgo", () => {
  const now = "2026-10-31T10:00:00Z";

  it("donne une ancienneté courte, jamais négative", () => {
    expect(formatElapsed("2026-10-31T09:25:00Z", now)).toBe("35 min");
    expect(formatElapsed("2026-10-31T05:00:00Z", now)).toBe("5 h");
    expect(formatElapsed("2026-10-30T22:00:00Z", now)).toBe("12 h");
    expect(formatElapsed("2026-10-28T10:00:00Z", now)).toBe("3 j");
    expect(formatElapsed("2026-10-31T12:00:00Z", now)).toBe("1 min");
  });

  it("reprend les libellés de la colonne « Reçu » de la maquette", () => {
    expect(formatReceived("2026-10-31T08:00:00Z", now)).toBe("il y a 2 h");
    expect(formatReceived("2026-10-31T05:00:00Z", now)).toBe("il y a 5 h");
    expect(formatReceived("2026-10-30T22:00:00Z", now)).toBe("hier");
    expect(formatReceived("2026-10-28T10:00:00Z", now)).toBe("il y a 3 j");
    expect(formatReceived("2026-09-12T10:00:00Z", now)).toBe("12 septembre");
  });

  it("garde « à l'instant » pour un message tout juste reçu ou daté d'après l'horloge", () => {
    expect(formatReceived("2026-10-31T09:59:30Z", now)).toBe("à l'instant");
    expect(formatReceived("2026-10-31T12:00:00Z", now)).toBe("à l'instant");
  });

  it("compte les jours civils du fuseau", () => {
    // 23 h à Paris la veille, même si moins de 24 h se sont écoulées.
    expect(formatReceived("2026-10-30T22:30:00Z", "2026-10-31T00:30:00Z")).toBe("hier");
  });

  it("écrit les jours en toutes lettres", () => {
    expect(formatDaysAgo("2026-08-28T09:00:00Z", now)).toBe("il y a 64 jours");
    expect(formatDaysAgo("2026-10-30T09:00:00Z", now)).toBe("hier");
    expect(formatDaysAgo("2026-10-31T09:00:00Z", now)).toBe("aujourd'hui");
  });
});

describe("formatWeekdayDate", () => {
  it("écrit le jour et la date, dans le fuseau demandé", () => {
    expect(formatWeekdayDate("2026-10-31T10:00:00Z", RELAIS_TIME_ZONE)).toBe("Samedi 31 octobre");
    expect(formatWeekdayDate("2026-10-31T23:30:00Z")).toBe("Dimanche 1 novembre");
  });
});
