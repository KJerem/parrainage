import {
  type ChildFileStatus,
  daysSince,
  type Gender,
  type ParrainCandidate,
  type ParrainStatus,
  type SponsorshipHealth,
  type WaitingChild,
  type WatchItem,
} from "@parrainage/contracts";

type ChipVariant = "success" | "warning" | "danger" | "info" | "neutral";

export const healthLabels: Record<SponsorshipHealth, string> = {
  ACTIVE: "Actif",
  TO_FOLLOW_UP: "À relancer",
  INACTIVE_PARRAIN: "Parrain inactif",
};

export const healthVariants: Record<SponsorshipHealth, ChipVariant> = {
  ACTIVE: "success",
  TO_FOLLOW_UP: "danger",
  INACTIVE_PARRAIN: "warning",
};

const short = (p: { firstName: string; lastInitial: string }) => `${p.firstName} ${p.lastInitial}.`;

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** « Dernier échange » : « hier », « 64 j », « 3 mois », « Aucun ». */
export function lastExchangeLabel(date: string | null, now: string): string {
  if (date === null) {
    return "Aucun";
  }
  const days = daysSince(date, now);
  if (days === 0) {
    return "aujourd'hui";
  }
  if (days === 1) {
    return "hier";
  }
  return days < 90 ? `${days} j` : `${Math.floor(days / 30)} mois`;
}

/** Colonne « Versements » : « À jour », « 2 en retard ». */
export function latePaymentsLabel(late: number): string {
  return late === 0 ? "À jour" : `${late} en retard`;
}

/** « dans 2 pays · 3 relais ». */
export function activeSponsorshipsSub(countries: number, relais: number): string {
  return `dans ${plural(countries, "pays", "pays")} · ${plural(relais, "relais", "relais")}`;
}

/** Ligne de « Binômes à surveiller » : « Kofi A. · Paul D. », « Esther N. · en attente ». */
export function watchTitle(item: WatchItem): string {
  return item.kind === "waiting"
    ? `${short(item.child)} · en attente`
    : `${short(item.child)} · ${item.parrainName}`;
}

export function watchChip(item: WatchItem): { label: string; variant: ChipVariant } {
  if (item.kind === "waiting") {
    return { label: "À parrainer", variant: "info" };
  }
  return item.health === "INACTIVE_PARRAIN"
    ? { label: "Parrain inactif", variant: "warning" }
    : { label: `${item.days} j sans nouvelle`, variant: "danger" };
}

const lowerFirst = (text: string) => text.charAt(0).toLocaleLowerCase("fr-FR") + text.slice(1);

/** « Nouvelle marraine · souhaite… », « Parraine déjà Yao D. ». */
export function candidateDetail(candidate: ParrainCandidate): string {
  const { filleuls } = candidate;
  if (filleuls.length === 0) {
    const fresh = candidate.gender === "F" ? "Nouvelle marraine" : "Nouveau parrain";
    return candidate.wishes ? `${fresh} · ${lowerFirst(candidate.wishes)}` : fresh;
  }
  const list =
    filleuls.length === 1
      ? filleuls[0]
      : filleuls.length === 2
        ? `${filleuls[0]} et ${filleuls[1]}`
        : `${filleuls.length} enfants`;
  return `Parraine déjà ${list}`;
}

/** « 8 ans · CE1 · EPP Bè, Lomé » et « Dossier complet · ajouté par M. Koffi ». */
export function waitingChildLines(child: WaitingChild): [string, string] {
  const place = child.schoolName ? `${child.schoolName}, ${child.city}` : child.city;
  const file = child.fileStatus === "VALIDATED" ? "Dossier validé" : "Dossier complet";
  return [
    `${child.age} ans · ${child.className} · ${place}`,
    `${file} · ajouté par ${child.addedBy}`,
  ];
}

/** « 2 autres enfants attendent un parrain. » */
export function othersWaitingLabel(count: number): string {
  if (count === 0) {
    return "Aucun autre enfant n'attend de parrain.";
  }
  return count === 1
    ? "1 autre enfant attend un parrain."
    : `${count} autres enfants attendent un parrain.`;
}

export function parrainStatusLabel(
  status: ParrainStatus,
  gender: Gender,
): {
  label: string;
  variant: ChipVariant;
} {
  switch (status) {
    case "WITH_CHILD":
      return { label: gender === "F" ? "Marraine" : "Parrain", variant: "success" };
    case "WAITING":
      return { label: "En attente d'un filleul", variant: "info" };
    case "INACTIVE":
      return { label: gender === "F" ? "Inactive" : "Inactif", variant: "warning" };
    case "INVITED":
      return { label: gender === "F" ? "Invitée" : "Invité", variant: "neutral" };
  }
}

export const fileStatusLabels: Record<ChildFileStatus, { label: string; variant: ChipVariant }> = {
  DRAFT: { label: "Brouillon", variant: "neutral" },
  SUBMITTED: { label: "À vérifier", variant: "warning" },
  VALIDATED: { label: "Validé", variant: "success" },
  ARCHIVED: { label: "Archivé", variant: "neutral" },
};
