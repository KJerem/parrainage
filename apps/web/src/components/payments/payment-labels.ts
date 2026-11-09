import type { PaymentHistoryItem, PaymentMethod, PaymentStatus } from "@parrainage/contracts";
import { formatDayMonth, formatEuros, formatPeriodKey } from "@/lib/format";

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  SEPA_DEBIT: "Prélèvement",
  CARD: "Carte bancaire",
  TRANSFER: "Virement",
  CHEQUE: "Chèque",
};

/** Teinte de la pastille de statut, comme les autres statuts de la plateforme. */
export const paymentStatusVariant: Record<
  PaymentStatus,
  "success" | "warning" | "danger" | "neutral"
> = {
  RECEIVED: "success",
  SCHEDULED: "neutral",
  LATE: "warning",
  FAILED: "danger",
  CANCELLED: "neutral",
};

/** « Mensualité · 2 filleuls ». */
export function monthlyTitle(filleulCount: number): string {
  return `Mensualité · ${filleulCount} filleul${filleulCount > 1 ? "s" : ""}`;
}

/** « Prélèvement le 5 du mois », « Carte bancaire, le 10 du mois ». */
export function debitLine(method: PaymentMethod, debitDay: number): string {
  const day = debitDay === 1 ? "1er" : String(debitDay);
  return method === "SEPA_DEBIT"
    ? `Prélèvement le ${day} du mois`
    : `${paymentMethodLabels[method]}, le ${day} du mois`;
}

/** « 10 versements, aucun incident », « 1 versement, 2 incidents ». */
export function paidLine(debitCount: number, incidentCount: number): string {
  const debits = `${debitCount} versement${debitCount > 1 ? "s" : ""}`;
  const incidents =
    incidentCount === 0
      ? "aucun incident"
      : `${incidentCount} incident${incidentCount > 1 ? "s" : ""}`;
  return `${debits}, ${incidents}`;
}

/** Colonne « Moyen » de l'historique : le libellé d'un don, sinon le moyen de paiement. */
export function historyMethodLabel(item: Pick<PaymentHistoryItem, "kind" | "label" | "method">) {
  return item.kind === "ONE_OFF"
    ? (item.label ?? "Don ponctuel")
    : paymentMethodLabels[item.method];
}

/** Date civile « 2026-10-05 » → « 5 oct. 2026 ». */
export function historyDate(isoDate: string): string {
  return formatDayMonth(isoDate, { month: "short", withYear: true, timeZone: "UTC" });
}

/** « Aïcha S. ». */
export const childShortName = (child: { firstName: string; lastInitial: string }) =>
  `${child.firstName} ${child.lastInitial}.`;

/** Date civile « 2026-11-05 » → « 5 novembre ». */
export function debitDayLabel(isoDate: string): string {
  return formatDayMonth(isoDate, { timeZone: "UTC" });
}

/** « Nouvelle mensualité pour Aïcha : 30 € à partir de novembre 2026 ». */
export function monthlyChangedToast(firstName: string, amountCents: number, periodKey: string) {
  return `Nouvelle mensualité pour ${firstName} : ${formatEuros(amountCents)} à partir de ${formatPeriodKey(periodKey).toLocaleLowerCase("fr-FR")}`;
}
