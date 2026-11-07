import {
  type ChildFileStatus,
  daysSince,
  initials,
  newsFreshness,
  type NewsFreshness,
  type RelaisChildRow,
  type RelaisHome,
  type ResultStatus,
} from "@parrainage/contracts";
import { formatAge, formatWeekday, RELAIS_TIME_ZONE } from "@/lib/format";

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

export type RelaisTodo = {
  key: string;
  kind: "stale" | "bulletins" | "drafts" | "messages" | "session";
  title: string;
  detail: string;
  href: string;
  /** Texte de la pastille : initiales ou nombre. */
  badge: string;
  tone: "danger" | "warning" | "info";
};

/**
 * Ce qui demande l'attention du relais, calculé : enfants sans nouvelle depuis 60 jours (le plus
 * ancien d'abord), bulletins à saisir, prochaine session, dossiers à finir, messages non lus.
 */
export function relaisTodos(home: RelaisHome): RelaisTodo[] {
  const stale = home.children
    .filter((child) => child.fileStatus === "VALIDATED" && child.lastNewsAt)
    .map((child) => ({ child, days: daysSince(child.lastNewsAt!, home.now) }))
    .filter(({ days }) => newsFreshness(days) === "stale")
    .sort((a, b) => b.days - a.days)
    .map(({ child, days }): RelaisTodo => ({
      key: `stale-${child.id}`,
      kind: "stale",
      title: child.name,
      detail: `Pas de nouvelle depuis ${days} jours`,
      href: `/relais/publier?enfant=${encodeURIComponent(child.id)}`,
      badge: initials(child.name),
      tone: "danger",
    }));
  const { bulletinsToEnter, childCount, unreadMessages } = home.stats;
  const bulletins: RelaisTodo[] =
    bulletinsToEnter > 0 && home.bulletinsDue
      ? [
          {
            key: "bulletins",
            kind: "bulletins",
            title: `Bulletins du ${home.bulletinsDue.label}`,
            detail: `${bulletinsToEnter} ${bulletinsToEnter > 1 ? "enfants" : "enfant"} sur ${childCount} ${bulletinsToEnter > 1 ? "restent" : "reste"} à saisir`,
            href: "/relais/resultats",
            badge: String(bulletinsToEnter),
            tone: "warning",
          },
        ]
      : [];
  const drafts: RelaisTodo[] =
    home.draftCount > 0
      ? [
          {
            key: "drafts",
            kind: "drafts",
            title: home.draftCount > 1 ? "Dossiers à terminer" : "Dossier à terminer",
            detail: "Pas encore envoyé au bureau",
            href: "/relais/enfants",
            badge: String(home.draftCount),
            tone: "info",
          },
        ]
      : [];
  const session: RelaisTodo[] = home.nextSession
    ? [
        {
          key: "session",
          kind: "session",
          title: `Session d'écriture ${formatWeekday(home.nextSession.scheduledAt, RELAIS_TIME_ZONE)}`,
          detail: `${home.nextSession.childCount} ${home.nextSession.childCount > 1 ? "enfants inscrits" : "enfant inscrit"}`,
          href: `/relais/sessions?planifiee=${encodeURIComponent(home.nextSession.id)}`,
          badge: String(home.nextSession.childCount),
          tone: "info",
        },
      ]
    : [];
  const messages: RelaisTodo[] =
    unreadMessages > 0
      ? [
          {
            key: "messages",
            kind: "messages",
            title: unreadMessages > 1 ? "Messages non lus" : "Message non lu",
            detail: "Dans vos conversations",
            href: "/relais/messages",
            badge: String(unreadMessages),
            tone: "info",
          },
        ]
      : [];
  return [...messages, ...stale, ...bulletins, ...session, ...drafts];
}

const QUICK_CHILDREN = 3;

/** « Publier pour Claire M. », « Publier pour 6 parrains ». */
export function publishButtonLabel(selected: readonly RelaisChildRow[]): string {
  const parrains = [...new Set(selected.flatMap((child) => child.parrains))];
  if (parrains.length === 0) {
    return "Publier";
  }
  return parrains.length === 1
    ? `Publier pour ${parrains[0]}`
    : `Publier pour ${parrains.length} parrains`;
}

/** Enfants proposés d'un geste : ceux qui attendent une nouvelle depuis le plus longtemps. */
export function quickChildren(
  followed: readonly RelaisChildRow[],
  selectedIds: readonly string[],
): RelaisChildRow[] {
  const age = (child: RelaisChildRow) =>
    child.lastNewsAt ? new Date(child.lastNewsAt).getTime() : 0;
  const stalest = [...followed]
    .filter((child) => child.parrains.length > 0)
    .sort((a, b) => age(a) - age(b))
    .slice(0, QUICK_CHILDREN);
  const chosen = followed.filter(
    (child) => selectedIds.includes(child.id) && !stalest.includes(child),
  );
  return [...chosen.slice(0, QUICK_CHILDREN), ...stalest].slice(0, QUICK_CHILDREN);
}
