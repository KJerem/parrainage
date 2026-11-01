import type { PaymentsSummary, PaymentStatus } from "@parrainage/contracts";
import { Button, Card, CardTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { features } from "@/lib/features";
import { formatEuros, formatPeriodKey } from "@/lib/format";
import { paymentStatusLabels } from "@/lib/labels";

const statusTone: Record<PaymentStatus, string> = {
  RECEIVED: "text-brand-700",
  SCHEDULED: "text-ink-soft",
  LATE: "text-accent-700",
  FAILED: "text-danger-600",
  CANCELLED: "text-muted",
};

/** Mini-versements de Main.dc.html : mensualité, total de l'année, trois derniers mois. */
export function PaymentsCard({
  payments,
  donationUse,
}: {
  payments: PaymentsSummary;
  /** « À quoi a servi votre don » : justificatifs du relais (phase 12). */
  donationUse?: string | null;
}) {
  return (
    <Card as="section" aria-labelledby="versements-titre" className="flex flex-col gap-3.5">
      <CardTitle id="versements-titre">Mes versements</CardTitle>
      <dl className="m-0 flex gap-3">
        <div className="min-w-0 flex-1 basis-0 rounded-12 bg-canvas p-3">
          <dt className="text-13 text-muted">Mensualité</dt>
          <dd className="m-0 text-20 font-extrabold">{formatEuros(payments.monthlyAmountCents)}</dd>
        </div>
        <div className="min-w-0 flex-1 basis-0 rounded-12 bg-canvas p-3">
          <dt className="text-13 text-muted">Versé en {payments.year}</dt>
          <dd className="m-0 text-20 font-extrabold">{formatEuros(payments.paidThisYearCents)}</dd>
        </div>
      </dl>
      {payments.lastMonths.length > 0 ? (
        <ul
          aria-label="Dernières mensualités"
          className="m-0 flex list-none flex-col gap-2 p-0 text-14"
        >
          {payments.lastMonths.map((payment) => (
            <li
              key={payment.id}
              className="flex justify-between gap-3 border-b border-line-soft pb-2 last:border-b-0 last:pb-0"
            >
              <span>{formatPeriodKey(payment.periodKey)}</span>
              <span className={cn("font-semibold", statusTone[payment.status])}>
                {paymentStatusLabels[payment.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-14 leading-[1.5] text-ink-soft">
          Aucune mensualité n&apos;est encore arrivée à échéance.
        </p>
      )}
      {features.expenses && donationUse ? (
        <p className="m-0 rounded-12 bg-accent-100 p-3 text-14 leading-[1.5] text-accent-900">
          {donationUse}
        </p>
      ) : null}
      {features.receipts ? (
        <Button href="/parrain/versements#recus" variant="secondary">
          Télécharger mon reçu fiscal
        </Button>
      ) : null}
    </Card>
  );
}
