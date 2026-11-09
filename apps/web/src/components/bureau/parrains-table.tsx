import type { BureauParrain, BureauParrains } from "@parrainage/contracts";
import { Card, Chip } from "@/components/ui";
import { formatEuros } from "@/lib/format";
import { lastExchangeLabel, parrainStatusLabel } from "./bureau-labels";

const head = "px-3.5 py-3 text-left text-13 font-semibold text-muted";
const cell = "border-t border-line-soft px-3.5 py-3 text-left align-top text-14";

const lastActivity = (parrain: BureauParrain, now: string) =>
  parrain.lastActiveAt === null
    ? parrain.gender === "F"
      ? "Jamais connectée"
      : "Jamais connecté"
    : lastExchangeLabel(parrain.lastActiveAt, now);

const filleulsLabel = (parrain: BureauParrain) =>
  parrain.filleuls.length === 0 ? "—" : parrain.filleuls.join(", ");

/** Parrains (bureau) : tableau à partir de md, liste en dessous. */
export function ParrainsTable({ data, query }: { data: BureauParrains; query: string }) {
  return (
    <Card as="section" padding="none" aria-labelledby="liste-parrains" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 pt-4 pb-2">
        <h2 id="liste-parrains" className="m-0 text-18 font-bold">
          {data.items.length} parrain{data.items.length > 1 ? "s" : ""}
          {query ? ` pour « ${query} »` : ""}
        </h2>
        <form method="get" role="search" className="flex gap-2">
          <label htmlFor="recherche-parrains" className="sr-only">
            Rechercher un parrain
          </label>
          <input
            id="recherche-parrains"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Nom, ville, e-mail…"
            className="min-h-10 w-56 max-w-full rounded-10 border border-line-strong bg-white px-3 text-15 max-md:text-16"
          />
        </form>
      </div>
      {data.items.length === 0 ? (
        <p role="status" className="m-0 px-3.5 pb-5 text-14 text-muted">
          Aucun parrain ne correspond à cette recherche.
        </p>
      ) : (
        <>
          <ul aria-label="Parrains" className="m-0 flex list-none flex-col p-0 md:hidden">
            {data.items.map((parrain) => {
              const status = parrainStatusLabel(parrain.status, parrain.gender);
              return (
                <li
                  key={parrain.id}
                  className="flex flex-col gap-1 border-t border-line-soft px-3.5 py-3 text-14"
                >
                  <span className="flex items-center justify-between gap-3">
                    <strong>
                      {parrain.displayName} · {parrain.city}
                    </strong>
                    <Chip variant={status.variant} className="shrink-0">
                      {status.label}
                    </Chip>
                  </span>
                  <span className="text-13 break-all text-muted">{parrain.email}</span>
                  <span className="text-13 text-ink-soft">
                    Filleuls : {filleulsLabel(parrain)} · activité :{" "}
                    {lastActivity(parrain, data.now)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div
            className="hidden overflow-x-auto md:block"
            role="region"
            aria-label="Tableau des parrains"
            tabIndex={0}
          >
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={head}>
                    Parrain
                  </th>
                  <th scope="col" className={head}>
                    Ville
                  </th>
                  <th scope="col" className={head}>
                    Filleuls
                  </th>
                  <th scope="col" className={head}>
                    Mensualités
                  </th>
                  <th scope="col" className={head}>
                    Dernière connexion
                  </th>
                  <th scope="col" className={head}>
                    État
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((parrain) => {
                  const status = parrainStatusLabel(parrain.status, parrain.gender);
                  return (
                    <tr key={parrain.id}>
                      <td className={cell}>
                        <strong className="block">{parrain.displayName}</strong>
                        <span className="text-13 text-muted">{parrain.email}</span>
                      </td>
                      <td className={cell}>
                        {parrain.city}
                        {parrain.country === "France" ? "" : `, ${parrain.country}`}
                      </td>
                      <td className={cell}>{filleulsLabel(parrain)}</td>
                      <td className={cell}>
                        {parrain.monthlyTotalCents > 0
                          ? formatEuros(parrain.monthlyTotalCents)
                          : "—"}
                        {parrain.latePayments > 0 ? (
                          <span className="block text-13 text-accent-700">
                            {parrain.latePayments} en retard
                          </span>
                        ) : null}
                      </td>
                      <td className={cell}>{lastActivity(parrain, data.now)}</td>
                      <td className={cell}>
                        <Chip variant={status.variant}>{status.label}</Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
