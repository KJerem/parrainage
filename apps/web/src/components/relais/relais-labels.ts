import {
  type ChildFileStatus,
  daysSince,
  newsFreshness,
  type NewsFreshness,
  type RelaisChildRow,
  type ResultStatus,
} from "@parrainage/contracts";
import { formatAge } from "@/lib/format";

/** Variante de Chip selon la fraîcheur de la dernière nouvelle. */
export const freshnessVariant: Readonly<Record<NewsFreshness, "success" | "warning" | "danger">> = {
  fresh: "success",
  aging: "warning",
  stale: "danger",
};

export const resultStatusVariant: Readonly<
  Record<ResultStatus, "success" | "warning" | "neutral">
> = {
  SENT: "success",
  DRAFT: "warning",
  TO_ENTER: "neutral",
};

/** « il y a 2 j » tant que c'est récent, puis « 64 jours » (RW-Accueil). */
export function freshnessLabel(days: number): string {
  if (days === 0) {
    return "Aujourd'hui";
  }
  if (days === 1) {
    return "Hier";
  }
  return newsFreshness(days) === "fresh" ? `il y a ${days} j` : `${days} jours`;
}

export type ChildStatusChip = {
  label: string;
  variant: "success" | "warning" | "danger" | "info" | "neutral";
};

/** Colonne « Dernière nouvelle » : l'état du dossier d'abord, puis la fraîcheur. */
export function childStatusChip(
  child: Pick<RelaisChildRow, "fileStatus" | "lastNewsAt">,
  now: string,
): ChildStatusChip {
  if (child.fileStatus === "DRAFT") {
    return { label: "Brouillon", variant: "neutral" };
  }
  if (child.fileStatus === "SUBMITTED") {
    return { label: "Nouveau dossier", variant: "info" };
  }
  if (!child.lastNewsAt) {
    return { label: "Aucune nouvelle", variant: "danger" };
  }
  const days = daysSince(child.lastNewsAt, now);
  return { label: freshnessLabel(days), variant: freshnessVariant[newsFreshness(days)] };
}

/** « Claire M. », « Claire M. +1 », ou `null` en attente de parrain. */
export function parrainsLabel(parrains: readonly string[]): string | null {
  const [first, ...others] = parrains;
  if (!first) {
    return null;
  }
  return others.length > 0 ? `${first} +${others.length}` : first;
}

/** « CM2 · EPP Bè » ; une fiche en brouillon peut n'avoir ni l'un ni l'autre. */
export function schoolingLabel(child: Pick<RelaisChildRow, "className" | "schoolName">): string {
  return [child.className, child.schoolName].filter(Boolean).join(" · ") || "À compléter";
}

/** Un dossier à finir s'ouvre ; un enfant suivi propose de publier une nouvelle. */
export function childAction(child: Pick<RelaisChildRow, "id" | "fileStatus">): {
  label: string;
  href: string;
} {
  return child.fileStatus === "VALIDATED"
    ? { label: "Publier", href: `/relais/publier?enfant=${encodeURIComponent(child.id)}` }
    : { label: "Compléter", href: `/relais/enfants/${encodeURIComponent(child.id)}` };
}

export const childFileStatusLabels: Readonly<Record<ChildFileStatus, string>> = {
  DRAFT: "Brouillon",
  SUBMITTED: "Envoyé au bureau",
  VALIDATED: "Validé",
  ARCHIVED: "Archivé",
};

/** « 8 ans · CE1 · EPP Bè » pour l'aperçu d'une fiche. */
export function childSummaryLabel(
  age: number | null,
  className: string,
  schoolName: string | null,
): string {
  return (
    [age === null ? null : formatAge(age), className || null, schoolName]
      .filter(Boolean)
      .join(" · ") || "À compléter"
  );
}
