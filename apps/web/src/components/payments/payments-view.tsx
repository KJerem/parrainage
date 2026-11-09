import { type ParrainPayments, receiptPath } from "@parrainage/contracts";
import { Card, CardTitle, Chip, FilterPillLink, StatTile } from "@/components/ui";
import { formatEuros } from "@/lib/format";
import { paymentStatusLabels } from "@/lib/labels";
import { DonationButton, MonthlyAmountButton, PaymentMethodButton } from "./payment-dialogs";
import {
  childShortName,
  debitLine,
  historyDate,
  historyMethodLabel,
  monthlyTitle,
  paidLine,
  paymentStatusVariant,
} from "./payment-labels";

const cell = "border-t border-line-soft px-4 py-3 text-left align-top";
const head = "px-4 py-3 text-left text-13 font-semibold text-muted";

/** Historique (P-Versements) : une année à la fois, choisie par `?annee=`. */
function History({ data }: { data: ParrainPayments }) {
  const { history } = data;
  return (
    <Card as="section" padding="none" aria-labelledby="historique" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4.5 pb-2">
        <h2 id="historique" className="m-0 text-18 font-bold">
          Historique
        </h2>
        {history.years.length > 1 ? (
          <nav aria-label="Année de l'historique" className="flex flex-wrap gap-1.5">
            {history.years.map((year) => (
              <FilterPillLink
                key={year}
                href={
                  year === data.year ? "/parrain/versements" : `/parrain/versements?annee=${year}`
                }
                active={year === history.year}
                scroll={false}
              >
                {year}
              </FilterPillLink>
            ))}
          </nav>
        ) : null}
      </div>
      {history.items.length === 0 ? (
        <p className="m-0 px-4 pb-5 text-14 text-muted">Aucun versement en {history.year}.</p>
      ) : (
        <>
          {/* Sous md : une ligne par versement, sans défilement horizontal. */}
          <ul
            aria-label={`Versements ${history.year}`}
            className="m-0 flex list-none flex-col p-0 md:hidden"
          >
            {history.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 border-t border-line-soft px-4 py-3 text-14"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span>{historyDate(item.date)}</span>
                  <strong className="font-semibold">{formatEuros(item.amountCents)}</strong>
                </span>
                <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 text-ink-soft">
                    {item.child ? `${childShortName(item.child)} · ` : ""}
                    {historyMethodLabel(item)}
                  </span>
                  <Chip variant={paymentStatusVariant[item.status]}>
                    {paymentStatusLabels[item.status]}
                  </Chip>
                </span>
              </li>
            ))}
          </ul>
          <div
            className="hidden overflow-x-auto md:block"
            role="region"
            aria-label={`Versements ${history.year}`}
            tabIndex={0}
          >
            <table className="w-full min-w-[560px] border-collapse text-14">
              <thead>
                <tr>
                  <th scope="col" className={head}>
                    Date
                  </th>
                  <th scope="col" className={head}>
                    Filleul
                  </th>
                  <th scope="col" className={head}>
                    Montant
                  </th>
                  <th scope="col" className={head}>
                    Moyen
                  </th>
                  <th scope="col" className={head}>
                    Statut
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.items.map((item) => (
                  <tr key={item.id}>
                    <td className={cell}>{historyDate(item.date)}</td>
                    <td className={cell}>{item.child ? childShortName(item.child) : "—"}</td>
                    <td className={cell}>{formatEuros(item.amountCents)}</td>
                    <td className={cell}>{historyMethodLabel(item)}</td>
                    <td className={cell}>
                      <Chip variant={paymentStatusVariant[item.status]}>
                        {paymentStatusLabels[item.status]}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/** Reçus fiscaux des années closes ; celui de l'année en cours arrive en janvier. */
function Receipts({ data }: { data: ParrainPayments }) {
  const { items, pendingYear, holder } = data.receipts;
  return (
    <Card as="section" aria-labelledby="recus" className="flex flex-col gap-2.5">
      <CardTitle id="recus" className="scroll-mt-24">
        Reçus fiscaux
      </CardTitle>
      {items.map((receipt) => (
        <a
          key={receipt.year}
          href={receiptPath(receipt.year)}
          download
          className="flex min-h-11 items-center justify-between gap-3 rounded-10 border border-line px-3 text-14 font-semibold text-ink no-underline hover:bg-canvas hover:text-ink"
        >
          Reçu {receipt.year} <span className="text-brand-700">Télécharger</span>
        </a>
      ))}
      {pendingYear ? (
        <p className="m-0 text-13 text-muted">Le reçu {pendingYear} sera disponible en janvier.</p>
      ) : null}
      {items.length === 0 && !pendingYear ? (
        <p className="m-0 text-14 text-ink-soft">
          Vos reçus apparaîtront ici après votre premier versement.
        </p>
      ) : null}
      {items.length > 0 || pendingYear ? (
        <p className="m-0 text-13 text-muted">
          Établis au nom de {holder.name}
          {holder.address ? `, ${holder.address.replaceAll("\n", ", ")}` : ""}.
        </p>
      ) : null}
    </Card>
  );
}

/** P-Versements.dc.html : résumé, historique, reçus fiscaux et dialogues. */
export function PaymentsView({ data }: { data: ParrainPayments }) {
  const { monthly, paidThisYear, taxReduction } = data;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-30">Mes versements</h1>
        {monthly.filleuls.length > 0 ? (
          <div className="flex flex-wrap gap-2.5">
            <MonthlyAmountButton data={data} />
            <PaymentMethodButton data={data} />
            <DonationButton data={data} />
          </div>
        ) : null}
      </div>

      <section
        aria-label="Résumé"
        className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4"
      >
        <StatTile
          label={monthlyTitle(monthly.filleuls.length)}
          value={formatEuros(monthly.totalCents)}
          sub={debitLine(monthly.method, monthly.debitDay)}
        />
        <StatTile
          label={`Versé en ${data.year}`}
          value={formatEuros(paidThisYear.amountCents)}
          sub={paidLine(paidThisYear.debitCount, paidThisYear.incidentCount)}
        />
        <StatTile
          variant="accent"
          label="Réduction d'impôt estimée"
          value={formatEuros(taxReduction.estimatedCents)}
          sub="Selon le statut fiscal de l'association"
        />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <History data={data} />
        {/* « À quoi sert votre don » (justificatifs validés par le bureau) rejoindra cette
            colonne avec la phase 12. */}
        <div className="flex min-w-0 flex-col gap-5">
          <Receipts data={data} />
        </div>
      </div>
    </>
  );
}
