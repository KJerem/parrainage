"use client";

import {
  CALL_NOTE_MAX_LENGTH,
  callCardSchema,
  callDurations,
  type CallDuration,
  callIcsPath,
  DEFAULT_CALL_DURATION,
  type ParrainCalls,
  type VideoCall,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField, Select, Textarea } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api-client";
import { formatDayMonth, PARRAIN_TIME_ZONE } from "@/lib/format";
import { CancelRequestButton, callErrorMessage, ChooseSlot, SlotChoices } from "./call-actions";
import { callMoment, durationLabel, slotDay, slotTimes } from "./call-labels";
import { CameraTest } from "./camera-test";

/** Demande d'un appel : un créneau du relais, une durée, un mot facultatif. */
function RequestForm({ data }: { data: ParrainCalls }) {
  const router = useRouter();
  const [slot, setSlot] = useState<string[]>([]);
  const [duration, setDuration] = useState<CallDuration>(DEFAULT_CALL_DURATION);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!slot[0]) {
      setError("Choisissez un créneau");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await apiFetch("/api/parrain/calls/requests", callCardSchema, {
        method: "POST",
        body: { childId: data.child.id, slotId: slot[0], durationMinutes: duration, note },
      });
      toast(`Demande envoyée à ${data.relaisName}`);
      router.refresh();
    } catch (caught) {
      setError(callErrorMessage(caught));
      setSending(false);
    }
  }

  if (data.slots.length === 0) {
    return (
      <p className="m-0 rounded-12 bg-canvas p-4 text-15 text-ink-soft">
        {data.relaisName} n&apos;a pas encore publié de créneau. Écrivez-lui pour convenir d&apos;un
        moment.
      </p>
    );
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <SlotChoices
        slots={data.slots}
        name="creneau"
        value={slot}
        onChange={setSlot}
        legend={`Créneaux proposés par ${data.relaisName}`}
      />
      <FormField label="Durée" className="max-w-[260px]">
        <Select
          value={String(duration)}
          onChange={(event) => setDuration(Number(event.target.value) as CallDuration)}
        >
          {callDurations.map((minutes) => (
            <option key={minutes} value={minutes}>
              {durationLabel(minutes)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Un mot pour préparer l'appel (facultatif)">
        <Textarea
          rows={3}
          value={note}
          maxLength={CALL_NOTE_MAX_LENGTH}
          placeholder={`Ex. : j'aimerais qu'${data.child.gender === "F" ? "elle" : "il"} me montre son cahier de calcul`}
          onChange={(event) => setNote(event.target.value)}
        />
      </FormField>
      {error ? (
        <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" size="lg" loading={sending} disabled={slot.length === 0}>
          Envoyer la demande
        </Button>
        <Button href="/parrain" variant="secondary" size="lg">
          Annuler
        </Button>
      </div>
    </form>
  );
}

/** Colonne principale de P-Video, selon où en est le binôme. */
function RequestSection({ data }: { data: ParrainCalls }) {
  const { child, request, relaisName } = data;
  const planned = data.upcoming.find((call) => call.childId === child.id);
  let heading = `Demander un appel avec ${child.firstName}`;
  let body;
  if (request?.status === "REQUESTED") {
    heading = `Votre demande d'appel avec ${child.firstName}`;
    body = (
      <div className="flex flex-col gap-4">
        {request.slot ? (
          <p className="m-0 flex flex-col rounded-12 border-2 border-brand-700 bg-brand-100 px-4 py-3">
            <strong className="text-15">{slotDay(request.slot.startsAt)}</strong>
            <span className="text-13 text-ink-soft">
              {slotTimes(request.slot.startsAt)} · {durationLabel(request.durationMinutes)}
            </span>
          </p>
        ) : null}
        <p className="m-0 text-15 text-ink-soft">
          {relaisName} va confirmer ce créneau, ou vous en proposer d&apos;autres. Vous serez
          prévenu par e-mail.
        </p>
        <CancelRequestButton requestId={request.requestId} />
      </div>
    );
  } else if (request?.status === "SLOTS_PROPOSED") {
    heading = `Choisissez un créneau pour l'appel avec ${child.firstName}`;
    body = (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-15 text-ink-soft">
          {relaisName} vous propose ces créneaux. L&apos;appel est confirmé dès votre choix.
        </p>
        <ChooseSlot requestId={request.requestId} slots={request.proposedSlots} />
        <CancelRequestButton requestId={request.requestId} />
      </div>
    );
  } else if (planned) {
    heading = `Un appel avec ${child.firstName} est prévu`;
    body = (
      <p className="m-0 text-15 text-ink-soft">
        Rendez-vous {callMoment(planned.startsAt)} (heure de Paris). Vous pourrez demander un autre
        appel ensuite.
      </p>
    );
  } else {
    body = <RequestForm data={data} />;
  }
  return (
    <Card as="section" padding="xl" aria-labelledby="demande" className="flex flex-col gap-5">
      <div>
        <h2 id="demande" className="m-0 mb-1 text-20 font-bold">
          {heading}
        </h2>
        <p className="m-0 text-15 text-muted">
          Le relais organise l&apos;appel depuis sa salle, avec une connexion fiable. Choisissez un
          créneau parmi ses disponibilités.
        </p>
      </div>
      {body}
    </Card>
  );
}

function UpcomingCard({ call, others }: { call: VideoCall; others: readonly VideoCall[] }) {
  return (
    <Card
      as="section"
      variant="brand"
      padding="lg"
      aria-labelledby="prochain"
      className="flex flex-col gap-3"
    >
      <h2 id="prochain" className="m-0 text-14 font-semibold text-brand-200">
        Appel confirmé
      </h2>
      <CameraTest />
      <p className="m-0 text-20 font-extrabold">
        {call.childFirstName} · {callMoment(call.startsAt)}
      </p>
      <Button href={`/parrain/appels/${encodeURIComponent(call.id)}`} variant="accent" size="lg">
        Rejoindre (ouvre 10 min avant)
      </Button>
      <a
        href={callIcsPath(call.id)}
        className="text-14 font-semibold text-white underline hover:text-brand-200"
      >
        Ajouter à mon agenda
      </a>
      {others.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 border-t border-brand-600 p-0 pt-3 text-14">
          {others.map((other) => (
            <li key={other.id}>
              <a
                href={`/parrain/appels/${encodeURIComponent(other.id)}`}
                className="text-white underline hover:text-brand-200"
              >
                {other.childFirstName} · {callMoment(other.startsAt)}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function PastCalls({ past }: { past: readonly VideoCall[] }) {
  return (
    <Card as="section" padding="lg" aria-labelledby="passes" className="flex flex-col gap-2.5">
      <h2 id="passes" className="m-0 text-17 font-bold">
        Appels passés
      </h2>
      {past.length === 0 ? (
        <p className="m-0 text-14 text-muted">Aucun appel pour le moment.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {past.map((call) => (
            <li
              key={call.id}
              className="flex justify-between gap-3 border-b border-line-soft py-2 text-14 last:border-b-0"
            >
              <span>
                {call.childFirstName} ·{" "}
                {formatDayMonth(call.startsAt, { month: "long", timeZone: PARRAIN_TIME_ZONE })}
              </span>
              <span className="text-muted">{call.minutes ?? call.durationMinutes} min</span>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 mt-1 text-13 text-muted">
        Les appels ne sont pas enregistrés. Un adulte du relais est toujours présent.
      </p>
    </Card>
  );
}

/** P-Video : demande d'appel, appel confirmé, appels passés. */
export function ParrainCallsView({ data }: { data: ParrainCalls }) {
  const [next, ...others] = data.upcoming;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <RequestSection data={data} />
      <aside aria-label="Mes appels" className="flex min-w-0 flex-col gap-5">
        {next ? <UpcomingCard call={next} others={others} /> : null}
        <PastCalls past={data.past} />
      </aside>
    </div>
  );
}
