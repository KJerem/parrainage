"use client";

import {
  CALL_MAX_PROPOSED_SLOTS,
  type CallSlot,
  callCardSchema,
  createdCallSlotsSchema,
  relaisCallsSchema,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { slotDay, slotTimes } from "./call-labels";

export const callErrorMessage = (caught: unknown) =>
  caught instanceof ApiRequestError
    ? caught.message
    : "Le service est momentanément indisponible. Réessayez dans un instant.";

/** « Confirmer le créneau » (relais) : celui que le parrain a demandé. */
export function ConfirmCallButton({
  requestId,
  size = "md",
}: {
  requestId: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size={size}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await apiFetch(
            `/api/relais/calls/requests/${encodeURIComponent(requestId)}/confirm`,
            callCardSchema,
            { method: "POST" },
          );
          toast("Appel confirmé : le parrain reçoit l'invitation pour son agenda");
          router.refresh();
        } catch (caught) {
          toast(callErrorMessage(caught));
        } finally {
          setBusy(false);
        }
      }}
    >
      Confirmer le créneau
    </Button>
  );
}

/** Une date et une heure de Lomé (UTC toute l'année) → instant ISO. */
const lomeInstant = (date: string, time: string) => `${date}T${time}:00Z`;

/** Ajout d'un créneau (relais), heure de Lomé. */
export function AddSlotForm({ onAdded }: { onAdded: (slots: CallSlot[]) => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!date || !time) {
      setError("Choisissez une date et une heure");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await apiFetch("/api/relais/calls/slots", createdCallSlotsSchema, {
        method: "POST",
        body: { startsAt: [lomeInstant(date, time)] },
      });
      onAdded(data.items);
      setDate("");
    } catch (caught) {
      setError(callErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2.5">
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_120px]">
        <FormField label="Date">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </FormField>
        <FormField label="Heure à Lomé">
          <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="m-0 text-13 font-semibold text-danger-600">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" loading={saving} className="self-start">
        Ajouter le créneau
      </Button>
    </form>
  );
}

/** Choix d'un créneau dans une liste : boutons radio au clavier, comme les créneaux de P-Video. */
export function SlotChoices({
  slots,
  name,
  value,
  onChange,
  multiple = false,
  legend,
}: {
  slots: readonly CallSlot[];
  name: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  legend: string;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-14 font-semibold">{legend}</legend>
      <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
        {slots.map((slot) => {
          const checked = value.includes(slot.id);
          return (
            <label
              key={slot.id}
              className={cn(
                "flex min-h-11 cursor-pointer flex-col items-start gap-0.5 rounded-12 border-2 px-3.5 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-700",
                checked ? "border-brand-700 bg-brand-100" : "border-line bg-white",
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                className="sr-only"
                checked={checked}
                onChange={() =>
                  onChange(
                    multiple
                      ? checked
                        ? value.filter((id) => id !== slot.id)
                        : [...value, slot.id]
                      : [slot.id],
                  )
                }
              />
              <strong className="text-15">{slotDay(slot.startsAt)}</strong>
              <span className="text-13 text-ink-soft">{slotTimes(slot.startsAt)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * « Proposer d'autres créneaux » (relais) : jusqu'à 3 de ses créneaux libres, ou de nouveaux.
 */
export function ProposeSlotsButton({
  requestId,
  parrainName,
  size = "md",
}: {
  requestId: string;
  parrainName: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<CallSlot[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function load() {
    setOpen(true);
    setError(null);
    setChosen([]);
    try {
      const { data } = await apiFetch("/api/relais/calls", relaisCallsSchema);
      setSlots(data.slots.filter((slot) => slot.status === "OPEN"));
    } catch (caught) {
      setError(callErrorMessage(caught));
      setSlots([]);
    }
  }

  async function propose() {
    if (chosen.length === 0) {
      setError("Choisissez au moins un créneau");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await apiFetch(
        `/api/relais/calls/requests/${encodeURIComponent(requestId)}/propose`,
        callCardSchema,
        { method: "POST", body: { slotIds: chosen } },
      );
      setOpen(false);
      toast(`Créneaux envoyés à ${parrainName}`);
      router.refresh();
    } catch (caught) {
      setError(callErrorMessage(caught));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size={size} onClick={() => void load()}>
        Proposer d&apos;autres créneaux
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Proposer d'autres créneaux"
        description={`${parrainName} choisira parmi ceux-ci (${CALL_MAX_PROPOSED_SLOTS} au plus).`}
        size="lg"
      >
        <div className="flex flex-col gap-5">
          {slots === null ? (
            <p className="m-0 text-14 text-muted">Chargement de vos créneaux…</p>
          ) : slots.length === 0 ? (
            <p className="m-0 text-14 text-muted">
              Aucun créneau libre : ajoutez-en un ci-dessous.
            </p>
          ) : (
            <SlotChoices
              slots={slots}
              name="proposition"
              value={chosen}
              multiple
              legend="Vos créneaux libres"
              onChange={(value) => setChosen(value.slice(0, CALL_MAX_PROPOSED_SLOTS))}
            />
          )}
          <div className="flex flex-col gap-2.5 rounded-12 bg-canvas p-3.5">
            <p className="m-0 text-14 font-semibold">Ajouter un créneau</p>
            <AddSlotForm
              onAdded={(added) => {
                setSlots((current) =>
                  [...(current ?? []), ...added].sort((a, b) =>
                    a.startsAt.localeCompare(b.startsAt),
                  ),
                );
                setChosen((current) =>
                  [...current, ...added.map((slot) => slot.id)].slice(0, CALL_MAX_PROPOSED_SLOTS),
                );
              }}
            />
          </div>
          {error ? (
            <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button loading={sending} onClick={() => void propose()}>
              Envoyer {chosen.length > 1 ? `ces ${chosen.length} créneaux` : "ce créneau"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Le parrain retient un des créneaux proposés (P-Video, ou directement dans le message). */
export function ChooseSlot({
  requestId,
  slots,
  compact = false,
}: {
  requestId: string;
  slots: readonly CallSlot[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(slots[0] ? [slots[0].id] : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(slotId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(
        `/api/parrain/calls/requests/${encodeURIComponent(requestId)}/choose`,
        callCardSchema,
        { method: "POST", body: { slotId } },
      );
      toast("Appel confirmé : vous recevez l'invitation pour votre agenda");
      router.refresh();
    } catch (caught) {
      setError(callErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {slots.map((slot) => (
            <Button
              key={slot.id}
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void choose(slot.id)}
              aria-label={`Choisir le ${slotDay(slot.startsAt)}, ${slotTimes(slot.startsAt)}`}
            >
              {slotDay(slot.startsAt)} · {slotTimes(slot.startsAt)}
            </Button>
          ))}
        </div>
        {error ? (
          <p role="alert" className="m-0 text-13 font-semibold text-danger-600">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <SlotChoices
        slots={slots}
        name="choix"
        value={chosen}
        onChange={setChosen}
        legend="Créneaux proposés"
      />
      {error ? (
        <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
          {error}
        </p>
      ) : null}
      <Button
        loading={busy}
        disabled={chosen.length === 0}
        onClick={() => chosen[0] && void choose(chosen[0])}
        className="self-start"
      >
        Choisir ce créneau
      </Button>
    </div>
  );
}

/** « Annuler la demande » (parrain) : le créneau redevient libre. */
export function CancelRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      loading={busy}
      className="self-start"
      onClick={async () => {
        setBusy(true);
        try {
          await apiFetch(
            `/api/parrain/calls/requests/${encodeURIComponent(requestId)}/cancel`,
            callCardSchema,
            { method: "POST" },
          );
          toast("Votre demande est annulée");
          router.refresh();
        } catch (caught) {
          toast(callErrorMessage(caught));
        } finally {
          setBusy(false);
        }
      }}
    >
      Annuler la demande
    </Button>
  );
}
