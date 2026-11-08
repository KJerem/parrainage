"use client";

import { callIcsPath, type RelaisCalls, type RelaisCallSlot } from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { toast } from "@/components/ui/toast";
import { formatDayMonth, RELAIS_TIME_ZONE } from "@/lib/format";
import { AddSlotForm, ConfirmCallButton, ProposeSlotsButton } from "./call-actions";
import { callMoment, durationLabel, slotDay, slotTimes } from "./call-labels";

function RequestsCard({ requests }: { requests: RelaisCalls["requests"] }) {
  return (
    <Card as="section" padding="xl" aria-labelledby="demandes" className="flex flex-col gap-4">
      <h2 id="demandes" className="m-0 text-20 font-bold">
        Demandes d&apos;appel
      </h2>
      {requests.length === 0 ? (
        <p className="m-0 text-15 text-muted">Aucune demande en attente.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {requests.map((request) => (
            <li
              key={request.requestId}
              className="flex flex-col gap-2.5 rounded-12 border border-line p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-16">
                  {request.parrainName} ↔ {request.childName}
                </strong>
                {request.status === "SLOTS_PROPOSED" ? (
                  <Chip variant="warning">En attente du choix du parrain</Chip>
                ) : (
                  <Chip variant="info">À confirmer</Chip>
                )}
              </div>
              {request.slot ? (
                <p className="m-0 text-14">
                  {slotDay(request.slot.startsAt)} · {slotTimes(request.slot.startsAt)} ·{" "}
                  {durationLabel(request.durationMinutes)}
                </p>
              ) : (
                <p className="m-0 text-14 text-ink-soft">
                  Créneaux proposés :{" "}
                  {request.proposedSlots
                    .map((slot) => `${slotDay(slot.startsAt)} (${slotTimes(slot.startsAt)})`)
                    .join(", ")}
                </p>
              )}
              {request.note ? (
                <p className="m-0 rounded-10 bg-canvas px-3 py-2 text-14 whitespace-pre-line">
                  {request.note}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2.5">
                {request.status === "REQUESTED" ? (
                  <ConfirmCallButton requestId={request.requestId} />
                ) : null}
                <ProposeSlotsButton
                  requestId={request.requestId}
                  parrainName={request.parrainName}
                />
                {request.conversationId ? (
                  <Button
                    href={`/relais/messages/${encodeURIComponent(request.conversationId)}`}
                    variant="ghost"
                  >
                    Voir la conversation
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function UpcomingCard({ upcoming }: { upcoming: RelaisCalls["upcoming"] }) {
  return (
    <Card as="section" padding="xl" aria-labelledby="a-venir" className="flex flex-col gap-4">
      <h2 id="a-venir" className="m-0 text-20 font-bold">
        Appels à venir
      </h2>
      {upcoming.length === 0 ? (
        <p className="m-0 text-15 text-muted">Aucun appel prévu.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0">
          {upcoming.map((call) => (
            <li key={call.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <strong className="text-15">
                  {call.parrainName} ↔ {call.childFirstName}
                </strong>
                <span className="text-13 text-ink-soft">
                  {callMoment(call.startsAt, RELAIS_TIME_ZONE)} à Lomé · {call.durationMinutes} min
                </span>
              </div>
              <a href={callIcsPath(call.id)} className="text-14 font-semibold">
                Agenda
              </a>
              <Button href={`/relais/appels/${encodeURIComponent(call.id)}`} variant="accent">
                Rejoindre
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const slotChip = (slot: RelaisCallSlot) =>
  slot.status === "OPEN" ? (
    <Chip variant="success">Libre</Chip>
  ) : slot.status === "HELD" ? (
    <Chip variant="info">Demandé</Chip>
  ) : (
    <Chip variant="neutral">Réservé</Chip>
  );

function SlotsCard({ initial }: { initial: RelaisCalls["slots"] }) {
  const router = useRouter();
  const [slots, setSlots] = useState(initial);
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(id: string) {
    setRemoving(id);
    try {
      const response = await fetch(`/api/relais/calls/slots/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error();
      }
      setSlots((current) => current.filter((slot) => slot.id !== id));
    } catch {
      toast("Ce créneau n'a pas pu être retiré : il vient peut-être d'être demandé.");
      router.refresh();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card as="section" padding="lg" aria-labelledby="creneaux" className="flex flex-col gap-3.5">
      <div>
        <h2 id="creneaux" className="m-0 text-17 font-bold">
          Mes créneaux
        </h2>
        <p className="m-0 text-13 text-muted">
          Les parrains de vos enfants choisissent parmi ceux-ci. Heure de Lomé.
        </p>
      </div>
      {slots.length === 0 ? (
        <p className="m-0 text-14 text-muted">Aucun créneau à venir.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0">
          {slots.map((slot) => (
            <li key={slot.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-14 font-semibold">
                  {slotDay(slot.startsAt, RELAIS_TIME_ZONE)} · {slotTimes(slot.startsAt)}
                </span>
                {slot.heldFor ? <span className="text-12 text-muted">{slot.heldFor}</span> : null}
              </div>
              {slotChip(slot)}
              {slot.status === "OPEN" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={removing === slot.id}
                  onClick={() => void remove(slot.id)}
                  aria-label={`Retirer le créneau du ${slotDay(slot.startsAt, RELAIS_TIME_ZONE)}`}
                >
                  Retirer
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
        <p className="m-0 text-14 font-semibold">Ajouter un créneau</p>
        <AddSlotForm
          onAdded={(added) => {
            setSlots((current) =>
              [
                ...current,
                ...added
                  .filter((slot) => !current.some((other) => other.id === slot.id))
                  .map((slot) => ({ ...slot, status: "OPEN" as const, heldFor: null })),
              ].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
            );
            toast("Créneau ajouté");
          }}
        />
      </div>
    </Card>
  );
}

function PastCard({ past }: { past: RelaisCalls["past"] }) {
  if (past.length === 0) {
    return null;
  }
  return (
    <Card as="section" padding="lg" aria-labelledby="passes" className="flex flex-col gap-2">
      <h2 id="passes" className="m-0 text-17 font-bold">
        Appels passés
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {past.map((call) => (
          <li
            key={call.id}
            className="flex justify-between gap-3 border-b border-line-soft py-2 text-14 last:border-b-0"
          >
            <span>
              {call.childFirstName} ·{" "}
              {formatDayMonth(call.startsAt, { month: "long", timeZone: RELAIS_TIME_ZONE })}
            </span>
            <span className="text-muted">{call.minutes ?? call.durationMinutes} min</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Appels vidéo du relais : demandes à traiter, appels prévus, créneaux publiés. */
export function RelaisCallsView({ data }: { data: RelaisCalls }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        <RequestsCard requests={data.requests} />
        <UpcomingCard upcoming={data.upcoming} />
      </div>
      <aside aria-label="Créneaux et historique" className="flex min-w-0 flex-col gap-5">
        <SlotsCard initial={data.slots} />
        <PastCard past={data.past} />
      </aside>
    </div>
  );
}
