import { getEnv } from "../config/env.js";

export type Clock = () => Date;

/**
 * Horloge métier : figée sur `appNow` (ISO 8601) quand il est fourni, sinon l'heure réelle.
 * Chaque appel renvoie une nouvelle instance, que l'appelant peut modifier sans risque.
 */
export function createClock(appNow?: string): Clock {
  if (!appNow) {
    return () => new Date();
  }
  const fixed = new Date(appNow).getTime();
  if (Number.isNaN(fixed)) {
    throw new Error(`APP_NOW invalide : « ${appNow} » (format attendu : 2026-10-31T10:00:00Z)`);
  }
  return () => new Date(fixed);
}

let clock: Clock | undefined;

/**
 * Instant présent pour toute règle métier (APP_NOW si défini). Il est passé en paramètre aux
 * requêtes : jamais de `now()` SQL. L'authentification (sessions, suspensions, limites de
 * tentatives) garde l'heure réelle, comme Better Auth.
 */
export function now(): Date {
  clock ??= createClock(getEnv().APP_NOW);
  return clock();
}
