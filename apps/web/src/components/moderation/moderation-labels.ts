import {
  moderationAlert,
  moderationContentLabel,
  type ModerationAlertTone,
  type ModerationDetail,
  type ModerationQueueItem,
  type ModerationSummary,
} from "@parrainage/contracts";
import { formatMonthYear, formatDaysAgo, formatElapsed, formatReceived } from "@/lib/format";

export { moderationAlert, moderationContentLabel };

/** Variante de Chip selon la gravité de l'alerte. */
export const alertChipVariant = {
  success: "success",
  warning: "warning",
  danger: "danger",
} as const satisfies Record<ModerationAlertTone, string>;

/** « Paul D. → Kofi A. » */
export const partiesLabel = (message: Pick<ModerationQueueItem, "from" | "to">) =>
  `${message.from} → ${message.to}`;

/** « 12 en attente · plus ancien : 12 h », ou « Aucun message en attente ». */
export function queueHeadline(summary: ModerationSummary): string {
  if (summary.pending === 0 || !summary.oldestAt) {
    return "Aucun message en attente";
  }
  return `${summary.pending} en attente · plus ancien : ${formatElapsed(summary.oldestAt, summary.now)}`;
}

/** « dont 3 contenant des photos » (tuile « Messages à relire »). */
export function pendingMediaLabel(summary: ModerationSummary): string {
  return summary.withMedia === 0
    ? "aucun ne contient de photo"
    : `dont ${summary.withMedia} contenant des photos`;
}

/** « Parrain depuis 2024 · relais M. Koffi · reçu il y a 5 h » */
export function detailContextLabel(detail: ModerationDetail): string {
  return [
    detail.context.sponsorSince,
    detail.context.relaisName ? `relais ${detail.context.relaisName}` : null,
    `reçu ${formatReceived(detail.createdAt, detail.now)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** « 23 messages · 1 retenu (mars 2025) » */
export function historyLabel({ messageCount, heldCount, lastHeldAt }: ModerationDetail["history"]) {
  const messages = `${messageCount} message${messageCount > 1 ? "s" : ""}`;
  if (heldCount === 0) {
    return `${messages} · aucun retenu`;
  }
  const held = `${heldCount} retenu${heldCount > 1 ? "s" : ""}`;
  return `${messages} · ${held}${lastHeldAt ? ` (${formatMonthYear(lastHeldAt)})` : ""}`;
}

/** « Dernière nouvelle du relais : il y a 64 jours » */
export function lastNewsLabel(detail: ModerationDetail): string {
  const { lastNewsAt } = detail.history;
  return lastNewsAt
    ? `Dernière nouvelle du relais : ${formatDaysAgo(lastNewsAt, detail.now)}`
    : "Aucune nouvelle du relais pour le moment";
}

/** Issue d'un message déjà relu, pour un lien ancien ou une décision prise par un autre membre. */
export function decidedLabel(status: ModerationDetail["moderationStatus"]): string {
  switch (status) {
    case "APPROVED":
      return "Ce message a été approuvé et transmis.";
    case "MASKED":
      return "Ce message a été transmis dans une version masquée.";
    case "HELD":
      return "Ce message a été retenu : il n'a pas été transmis.";
    default:
      return "Ce message n'est plus en attente.";
  }
}
