"use client";

import type { RelaisChildRow } from "@parrainage/contracts";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Chip, FormField, Input } from "@/components/ui";
import { formatAge } from "@/lib/format";
import { childAction, childStatusChip, parrainsLabel, schoolingLabel } from "./relais-labels";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function matches(child: RelaisChildRow, query: string): boolean {
  const haystack = normalize(
    [child.name, child.className, child.schoolName, ...child.parrains].filter(Boolean).join(" "),
  );
  return haystack.includes(query);
}

/**
 * « Mes enfants » de RW-Accueil : un tableau défilant à partir de md, des cartes en dessous. Les
 * deux affichent les mêmes lignes ; le CSS choisit.
 */
export function ChildrenTable({
  rows,
  now,
  headingId,
}: {
  rows: readonly RelaisChildRow[];
  now: string;
  /** Titre de la section : il nomme le tableau. */
  headingId: string;
}) {
  const [search, setSearch] = useState("");
  const shown = useMemo(() => {
    const query = normalize(search.trim());
    return query === "" ? rows : rows.filter((child) => matches(child, query));
  }, [rows, search]);

  return (
    <>
      <div className="px-3.5 pb-2 md:absolute md:top-3.5 md:right-0 md:pb-0">
        <FormField label="Rechercher un enfant" hideLabel size="sm">
          <Input
            size="sm"
            type="search"
            placeholder="Rechercher un enfant"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="md:w-[220px]"
          />
        </FormField>
      </div>
      {shown.length === 0 ? (
        <p role="status" className="m-0 px-3.5 pb-4 text-14 text-muted">
          Aucun enfant ne correspond à cette recherche.
        </p>
      ) : (
        <>
          <div
            className="hidden overflow-x-auto md:block"
            role="region"
            aria-labelledby={headingId}
            tabIndex={0}
          >
            <table className="w-full min-w-[700px] border-collapse text-14">
              <thead>
                <tr className="text-left text-13 text-muted">
                  <th scope="col" className="px-3.5 py-3 font-semibold">
                    Enfant
                  </th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">
                    Classe · école
                  </th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">
                    Parrain
                  </th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">
                    Dernière nouvelle
                  </th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((child) => {
                  const status = childStatusChip(child, now);
                  const action = childAction(child);
                  const parrains = parrainsLabel(child.parrains);
                  return (
                    <tr key={child.id} className="border-t border-line-soft">
                      <td className="px-3.5 py-3">
                        <Link
                          href={`/relais/enfants/${encodeURIComponent(child.id)}`}
                          className="font-bold text-ink no-underline hover:underline"
                        >
                          {child.name}
                        </Link>{" "}
                        · {formatAge(child.age)}
                      </td>
                      <td className="px-3.5 py-3">{schoolingLabel(child)}</td>
                      <td className="px-3.5 py-3">
                        {parrains ?? <span className="text-muted">En attente</span>}
                      </td>
                      <td className="px-3.5 py-3">
                        <Chip variant={status.variant}>{status.label}</Chip>
                      </td>
                      <td className="px-3.5 py-3">
                        <Link
                          href={action.href}
                          className="font-semibold"
                          aria-label={`${action.label} : ${child.name}`}
                        >
                          {action.label}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="m-0 flex list-none flex-col p-0 md:hidden">
            {shown.map((child) => {
              const status = childStatusChip(child, now);
              const action = childAction(child);
              const parrains = parrainsLabel(child.parrains);
              return (
                <li
                  key={child.id}
                  className="flex flex-col gap-1.5 border-t border-line-soft px-3.5 py-3 text-14"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <Link
                        href={`/relais/enfants/${encodeURIComponent(child.id)}`}
                        className="font-bold text-ink no-underline"
                      >
                        {child.name}
                      </Link>{" "}
                      · {formatAge(child.age)}
                    </span>
                    <Chip variant={status.variant}>{status.label}</Chip>
                  </div>
                  <div className="text-13 text-ink-soft">
                    {schoolingLabel(child)} · {parrains ?? "En attente de parrain"}
                  </div>
                  <Link
                    href={action.href}
                    className="self-start font-semibold pointer-coarse:py-2"
                    aria-label={`${action.label} : ${child.name}`}
                  >
                    {action.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
