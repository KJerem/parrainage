import type { Gender, MediaKind, PaymentStatus, SentFrom } from "@parrainage/contracts";
import { formatMonthYear } from "./format";

/** Accord en genre : `agree("F", "Suivie", "Suivi")` → « Suivie ». */
export function agree(gender: Gender, feminine: string, masculine: string): string {
  return gender === "F" ? feminine : masculine;
}

// Élision devant une voyelle, comme les libellés du seed (« Photo d'Aïcha », « Photo de Kofi »).
const VOWEL_START = /^[aeiouyàâäéèêëîïôöûüœ]/i;
const Y_CONSONANT = /^y[aeiouàâäéèêëîïôöûü]/i;

/** « d'Aïcha », « de Kofi », « de Yao » (le y suivi d'une voyelle est une consonne). */
export function ofName(name: string): string {
  return VOWEL_START.test(name) && !Y_CONSONANT.test(name) ? `d'${name}` : `de ${name}`;
}

/** « Parrainée depuis mars 2023 » / « Parrainé depuis septembre 2025 ». */
export function sponsoredSinceLabel(gender: Gender, sponsoredSince: string): string {
  return `${agree(gender, "Parrainée", "Parrainé")} depuis ${formatMonthYear(sponsoredSince)}`;
}

/** Début de « Suivie par M. Koffi, relais ». */
export function followedByLabel(gender: Gender): string {
  return `${agree(gender, "Suivie", "Suivi")} par`;
}

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  SCHEDULED: "Prévu",
  RECEIVED: "Reçu",
  LATE: "En retard",
  FAILED: "Échec du prélèvement",
  CANCELLED: "Annulé",
};

export const mediaKindLabels: Record<MediaKind, string> = {
  PHOTO: "Photo",
  VIDEO: "Vidéo",
  BULLETIN: "Bulletin scolaire",
  DOCUMENT: "Document",
  CONSENT: "Autorisation signée",
  RECEIPT: "Justificatif",
  AVATAR: "Photo de profil",
};

/** Seul l'envoi depuis une session élève est signalé (« Hier · envoyé depuis l'école »). */
export const sentFromLabels: Partial<Record<SentFrom, string>> = {
  SCHOOL_SESSION: "envoyé depuis l'école",
};
