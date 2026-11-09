"use client";

import {
  createdSponsorshipSchema,
  initials,
  mediaPath,
  type NewSponsorship,
  type ParrainCandidate,
  parrainCandidatesSchema,
} from "@parrainage/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField, Input, RadioCard } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { candidateDetail, othersWaitingLabel, waitingChildLines } from "./bureau-labels";

const SEARCH_DELAY_MS = 250;

const errorMessage = (caught: unknown) =>
  caught instanceof ApiRequestError
    ? (Object.values(caught.fieldErrors)[0]?.[0] ?? caught.message)
    : "Le service est momentanément indisponible. Réessayez dans un instant.";

const short = (p: { firstName: string; lastInitial: string }) => `${p.firstName} ${p.lastInitial}.`;

/**
 * « Créer un binôme » (B-Binomes) : l'enfant en attente, un parrain choisi par recherche, la
 * mensualité et la date de début. Le parrain et le relais sont prévenus par e-mail.
 */
export function CreateSponsorship({
  data,
  initialCandidates,
}: {
  data: NewSponsorship;
  initialCandidates: readonly ParrainCandidate[];
}) {
  const router = useRouter();
  const formId = useId();
  const searchId = useId();
  const { child } = data;
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<readonly ParrainCandidate[]>(initialCandidates);
  const [searching, setSearching] = useState(false);
  const [parrainId, setParrainId] = useState(initialCandidates[0]?.id ?? "");
  const [euros, setEuros] = useState(String(data.defaultMonthlyCents / 100));
  const [startDate, setStartDate] = useState(data.defaultStartDate);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const firstSearch = useRef(true);

  // Recherche des parrains, un peu après la dernière frappe.
  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (child) params.set("enfant", child.id);
        const { data: found } = await apiFetch(
          `/api/bureau/parrains/candidates?${params.toString()}`,
          parrainCandidatesSchema,
          { signal: controller.signal },
        );
        setCandidates(found.items);
        setParrainId((current) =>
          found.items.some((p) => p.id === current) ? current : (found.items[0]?.id ?? ""),
        );
      } catch (caught) {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, child]);

  if (!child) {
    return (
      <Card
        as="section"
        aria-labelledby="nouveau-binome"
        padding="xl"
        className="flex flex-col gap-2"
      >
        <h2 id="nouveau-binome" className="m-0 text-18 font-bold">
          Créer un binôme
        </h2>
        <p className="m-0 text-15 text-muted">
          Aucun enfant n&apos;attend de parrain : les dossiers envoyés par les relais apparaîtront
          ici.
        </p>
      </Card>
    );
  }

  const [details, file] = waitingChildLines(child);
  const photo = child.photo ? mediaPath(child.photo) : null;
  const parrain = candidates.find((p) => p.id === parrainId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!child) return;
    if (!parrain) {
      setError("Choisissez un parrain");
      return;
    }
    const amount = Number(euros.replace(",", "."));
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/bureau/sponsorships", createdSponsorshipSchema, {
        method: "POST",
        body: {
          childId: child.id,
          parrainId: parrain.id,
          monthlyAmountCents: Number.isFinite(amount) ? Math.round(amount * 100) : 0,
          startDate,
        },
      });
      toast(
        `Binôme créé pour ${short(child)} avec ${parrain.displayName} : le parrain et le relais sont prévenus`,
      );
      router.replace("/bureau/binomes", { scroll: false });
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      as="section"
      aria-labelledby="nouveau-binome"
      padding="xl"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <h2 id="nouveau-binome" className="m-0 text-18 font-bold">
          Créer un binôme
        </h2>
        <div className="flex items-center gap-3 rounded-14 bg-canvas p-4">
          <Avatar
            size={56}
            tone={child.avatarTone}
            initials={initials(short(child))}
            {...(photo ? { src: photo, alt: "" } : {})}
          />
          <div className="min-w-0">
            <Link
              href={`/bureau/enfants/${encodeURIComponent(child.id)}`}
              className="text-16 font-bold text-ink no-underline hover:underline"
            >
              {short(child)}
            </Link>
            <div className="text-13 text-ink-soft">{details}</div>
            <div className="text-13 text-ink-soft">{file}</div>
          </div>
        </div>
        <p className="m-0 text-13 text-muted">{othersWaitingLabel(data.others.length)}</p>
        {data.others.length > 0 ? (
          <nav aria-label="Autres enfants en attente" className="flex flex-wrap gap-2">
            {data.others.map((other) => (
              <Link
                key={other.id}
                href={`/bureau/binomes?enfant=${encodeURIComponent(other.id)}`}
                scroll={false}
                className="text-14 font-semibold"
              >
                {short(other)}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <form
        id={formId}
        onSubmit={(event) => void submit(event)}
        className="flex min-w-0 flex-col gap-3"
        aria-label={`Choisir un parrain pour ${short(child)}`}
      >
        <label htmlFor={searchId} className="text-14 font-semibold">
          Choisir un parrain
        </label>
        <Input
          id={searchId}
          type="search"
          placeholder="Nom, ville, e-mail…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-describedby={`${searchId}-etat`}
        />
        <p id={`${searchId}-etat`} className="sr-only" aria-live="polite">
          {searching
            ? "Recherche…"
            : `${candidates.length} parrain${candidates.length > 1 ? "s" : ""} proposé${candidates.length > 1 ? "s" : ""}`}
        </p>
        {candidates.length === 0 ? (
          <p className="m-0 rounded-12 bg-canvas p-3 text-14 text-muted">
            Aucun parrain disponible ne correspond à cette recherche.
          </p>
        ) : (
          <div role="radiogroup" aria-label="Parrains disponibles" className="flex flex-col gap-2">
            {candidates.map((candidate) => (
              <RadioCard
                key={candidate.id}
                name="parrain"
                checked={candidate.id === parrainId}
                onChange={() => setParrainId(candidate.id)}
                labelClassName="flex-wrap"
              >
                <span className="min-w-0 flex-1">
                  <strong>{candidate.displayName}</strong> · {candidate.city}
                </span>
                <span className="text-ink-soft">{candidateDetail(candidate)}</span>
              </RadioCard>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="Mensualité (€)" className="w-[160px]">
            <Input
              type="number"
              inputMode="numeric"
              min={10}
              max={500}
              step={1}
              value={euros}
              onChange={(event) => setEuros(event.target.value)}
            />
          </FormField>
          <FormField label="Début">
            <Input
              type="date"
              min={data.now.slice(0, 10)}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </FormField>
          <Button type="submit" loading={saving} disabled={!parrain}>
            Créer et prévenir parrain et relais
          </Button>
        </div>
        {error ? (
          <p
            role="alert"
            className="m-0 rounded-12 bg-danger-100 px-3.5 py-3 text-14 font-semibold text-danger-600"
          >
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
