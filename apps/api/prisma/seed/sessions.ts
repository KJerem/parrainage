import { type ChildCode, childCodeImages, CHILD_CODE_LENGTH } from "@parrainage/contracts";
import { addDays, startOfDayUtc } from "./dates.js";
import type { SeedData } from "./data.js";

// Sessions élèves de démonstration : celles de RW-Session (« Mardi 27 oct. · 5 enfants · 7 envois »)
// et la session planifiée de l'accueil du relais (« Session d'écriture mardi · 6 enfants »).

const TUESDAY = 2;

export interface SeedSession {
  id: string;
  relaisId: string;
  status: "PLANNED" | "CLOSED";
  scheduledAt: Date | null;
  durationMinutes: number;
  openedAt: Date | null;
  endsAt: Date | null;
  closedAt: Date | null;
  sendCount: number;
  createdById: string;
  childIds: string[];
}

const at = (date: Date, hours: number, minutes = 0) =>
  new Date(date.getTime() + (hours * 60 + minutes) * 60_000);

/** Le mardi passé (jamais aujourd'hui) et le prochain (jamais aujourd'hui non plus). */
function tuesdays(today: Date): { previous: Date; next: Date } {
  const start = startOfDayUtc(today);
  const ahead = (TUESDAY - start.getUTCDay() + 7) % 7 || 7;
  const behind = (start.getUTCDay() - TUESDAY + 7) % 7 || 7;
  return { next: addDays(start, ahead), previous: addDays(start, -behind) };
}

export function buildSeedSessions(today: Date, data: SeedData): SeedSession[] {
  const koffi = data.relais.find((relais) => relais.relais.id === "seed-relais-koffi");
  if (!koffi) {
    return [];
  }
  const relaisId = koffi.relais.id;
  const named = ["aicha", "kofi", "esther", "yao", "mariam"].map((slug) => `seed-child-${slug}`);
  const others = data.children
    .filter((child) => child.relaisId === relaisId && !named.includes(child.id))
    .map((child) => child.id);
  const { previous, next } = tuesdays(today);
  const past = (id: string, day: Date, childIds: string[], sendCount: number): SeedSession => ({
    id,
    relaisId,
    status: "CLOSED",
    scheduledAt: null,
    durationMinutes: 45,
    openedAt: at(day, 15, 15),
    endsAt: at(day, 16),
    closedAt: at(day, 16),
    sendCount,
    createdById: koffi.id,
    childIds,
  });
  return [
    past("seed-session-koffi-1", previous, named, 7),
    past("seed-session-koffi-2", addDays(previous, -7), [...named, ...others.slice(0, 1)], 9),
    {
      id: "seed-session-koffi-planned",
      relaisId,
      status: "PLANNED",
      scheduledAt: at(next, 15, 15),
      durationMinutes: 45,
      openedAt: null,
      endsAt: null,
      closedAt: null,
      sendCount: 0,
      createdById: koffi.id,
      childIds: [...named, ...others.slice(0, 1)],
    },
  ];
}

/** Code image déterministe d'un enfant de démonstration : Aïcha garde celui du design. */
export function seedChildCode(childId: string, index: number): ChildCode {
  if (childId === "seed-child-aicha") {
    return ["SOLEIL", "ARBRE", "POISSON"];
  }
  const count = childCodeImages.length;
  const pool = [...childCodeImages];
  const images: ChildCode = [];
  // Parcours décalé selon l'enfant : trois images différentes, dans un ordre qui change.
  let position = (index * 5 + 1) % count;
  for (let drawn = 0; drawn < CHILD_CODE_LENGTH; drawn += 1) {
    images.push(pool.splice(position % pool.length, 1)[0]!);
    position += index % 2 === 0 ? 2 : 1;
  }
  return images;
}
