"use client";

import type { BureauSponsorships, BureauSponsorshipsQuery } from "@parrainage/contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/form-field";

const states = [
  { value: "", label: "Tous les états" },
  { value: "actif", label: "Actifs" },
  { value: "a-relancer", label: "À relancer" },
  { value: "parrain-inactif", label: "Parrain inactif" },
] as const;

/** Filtres « Relais » et « État » de B-Binomes, portés par l'adresse. */
export function SponsorshipFilters({
  relais,
  query,
}: {
  relais: BureauSponsorships["relais"];
  query: BureauSponsorshipsQuery;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = (key: "relais" | "etat", value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        aria-label="Relais"
        size="sm"
        value={query.relais ?? ""}
        onChange={(event) => update("relais", event.target.value)}
        className="w-auto"
      >
        <option value="">Tous les relais</option>
        {relais.map((r) => (
          <option key={r.id} value={r.id}>
            {r.city} · {r.displayName}
          </option>
        ))}
      </Select>
      <Select
        aria-label="État"
        size="sm"
        value={query.etat ?? ""}
        onChange={(event) => update("etat", event.target.value)}
        className="w-auto"
      >
        {states.map((state) => (
          <option key={state.value} value={state.value}>
            {state.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
