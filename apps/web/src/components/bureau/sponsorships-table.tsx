import type { BureauSponsorships, BureauSponsorshipsQuery } from "@parrainage/contracts";
import Link from "next/link";
import { Suspense } from "react";
import { Card, Chip } from "@/components/ui";
import {
  healthLabels,
  healthVariants,
  lastExchangeLabel,
  latePaymentsLabel,
} from "./bureau-labels";
import { SponsorshipFilters } from "./sponsorship-filters";

const short = (p: { firstName: string; lastInitial: string }) => `${p.firstName} ${p.lastInitial}.`;
const head = "px-3.5 py-3 text-left text-13 font-semibold text-muted";
const cell = "border-t border-line-soft px-3.5 py-3 text-left text-14";

/** « Tous les binômes » (B-Binomes) : tableau à partir de md, liste en dessous. */
export function SponsorshipsTable({
  data,
  query,
}: {
  data: BureauSponsorships;
  query: BureauSponsorshipsQuery;
}) {
  const childLink = (id: string) => `/bureau/enfants/${encodeURIComponent(id)}`;
  return (
    <Card as="section" padding="none" aria-labelledby="tous-binomes" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 pt-4 pb-2">
        <h2 id="tous-binomes" className="m-0 text-18 font-bold">
          Tous les binômes
        </h2>
        <Suspense>
          <SponsorshipFilters relais={data.relais} query={query} />
        </Suspense>
      </div>
      {data.items.length === 0 ? (
        <p role="status" className="m-0 px-3.5 pb-5 text-14 text-muted">
          Aucun binôme ne correspond à ces filtres.
        </p>
      ) : (
        <>
          <ul aria-label="Binômes" className="m-0 flex list-none flex-col p-0 md:hidden">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 border-t border-line-soft px-3.5 py-3 text-14"
              >
                <span className="flex items-center justify-between gap-3">
                  <Link href={childLink(item.child.id)} className="font-bold text-ink">
                    {short(item.child)} · {item.parrain.displayName}
                  </Link>
                  <Chip variant={healthVariants[item.health]} className="shrink-0">
                    {healthLabels[item.health]}
                  </Chip>
                </span>
                <span className="text-13 text-ink-soft">
                  {item.relais.city} · dernier échange :{" "}
                  {lastExchangeLabel(item.lastExchangeAt, data.now)} ·{" "}
                  {latePaymentsLabel(item.latePayments)}
                </span>
              </li>
            ))}
          </ul>
          <div
            className="hidden overflow-x-auto md:block"
            role="region"
            aria-label="Tableau des binômes"
            tabIndex={0}
          >
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={head}>
                    Enfant
                  </th>
                  <th scope="col" className={head}>
                    Parrain
                  </th>
                  <th scope="col" className={head}>
                    Relais
                  </th>
                  <th scope="col" className={head}>
                    Dernier échange
                  </th>
                  <th scope="col" className={head}>
                    Versements
                  </th>
                  <th scope="col" className={head}>
                    État
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className={cell}>
                      <Link href={childLink(item.child.id)} className="font-bold text-ink">
                        {short(item.child)}
                      </Link>
                    </td>
                    <td className={cell}>{item.parrain.displayName}</td>
                    <td className={cell}>{item.relais.city}</td>
                    <td className={cell}>{lastExchangeLabel(item.lastExchangeAt, data.now)}</td>
                    <td className={cell}>{latePaymentsLabel(item.latePayments)}</td>
                    <td className={cell}>
                      <Chip variant={healthVariants[item.health]}>{healthLabels[item.health]}</Chip>
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
