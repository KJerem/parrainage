"use client";

import {
  type VisioAccess,
  visioAccessSchema,
  type VisioRoom,
  visioRoomSchema,
} from "@parrainage/contracts";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { PARRAIN_TIME_ZONE, RELAIS_TIME_ZONE } from "@/lib/format";
import { callHour, callMoment } from "./call-labels";
import { CameraTest } from "./camera-test";

// La salle JaaS ne se charge que dans le navigateur, et seulement quand on y entre.
const JaasRoom = dynamic(() => import("./jaas-room"), {
  ssr: false,
  loading: () => <Spinner />,
});

/** Sans réponse de la salle intégrée passé ce délai, on propose de l'ouvrir dans un onglet. */
const FALLBACK_AFTER_MS = 10_000;
const POLL_MS = 5_000;

const errorMessage = (caught: unknown) =>
  caught instanceof ApiRequestError
    ? caught.message
    : "Le service est momentanément indisponible. Réessayez dans un instant.";

function jaasUrl(access: Extract<VisioAccess, { provider: "jaas" }>): string {
  return `https://8x8.vc/${encodeURIComponent(access.appId)}/${encodeURIComponent(access.roomName)}?jwt=${encodeURIComponent(access.jwt)}`;
}

const postEvent = (callId: string, type: "joined" | "left") =>
  fetch(`/api/visio/${encodeURIComponent(callId)}/events`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type }),
  }).catch(() => undefined);

/**
 * Salle d'un appel : ouverte 10 minutes avant ; le parrain attend l'arrivée du relais. La salle
 * intégrée (JaaS) a un repli : l'ouvrir dans un nouvel onglet, ou réessayer.
 */
export function VisioRoomView({
  initial,
  displayName,
  backHref,
}: {
  initial: VisioRoom;
  displayName: string;
  backHref: string;
}) {
  const [room, setRoom] = useState(initial);
  const [access, setAccess] = useState<VisioAccess | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [left, setLeft] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const callId = room.call.id;
  const relais = room.role === "relais";

  const refresh = useCallback(async () => {
    try {
      const { data } = await apiFetch(`/api/visio/${encodeURIComponent(callId)}`, visioRoomSchema);
      setRoom(data);
    } catch {
      // Réseau coupé : le prochain passage réessaiera.
    }
  }, [callId]);

  // En attente (salle pas encore ouverte, relais pas encore arrivé) : on revérifie régulièrement.
  useEffect(() => {
    if (access || (room.state !== "early" && room.state !== "waiting")) {
      return;
    }
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [access, room.state, refresh]);

  // Salle intégrée muette : proposer le repli.
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (access?.provider !== "jaas" || ready) {
      return;
    }
    stallTimer.current = setTimeout(() => setStalled(true), FALLBACK_AFTER_MS);
    return () => {
      if (stallTimer.current) clearTimeout(stallTimer.current);
    };
  }, [access, ready, attempt]);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const { data } = await apiFetch(
        `/api/visio/${encodeURIComponent(callId)}/token`,
        visioAccessSchema,
        { method: "POST" },
      );
      setAccess(data);
      setLeft(false);
      if (data.provider === "link") {
        window.open(data.url, "_blank", "noopener");
      }
    } catch (caught) {
      setError(errorMessage(caught));
      void refresh();
    } finally {
      setJoining(false);
    }
  }

  const { call } = room;
  const title = relais
    ? `Appel de ${call.childFirstName} avec ${call.parrainName}`
    : `Appel vidéo avec ${call.childFirstName}`;
  const when = relais
    ? `${callMoment(call.startsAt, RELAIS_TIME_ZONE)} à Lomé · ${callHour(call.startsAt, PARRAIN_TIME_ZONE)} à Paris`
    : `${callMoment(call.startsAt, PARRAIN_TIME_ZONE)} (Paris) · ${callHour(call.startsAt, RELAIS_TIME_ZONE)} à Lomé`;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-26 font-extrabold sm:text-30">{title}</h1>
        <p className="m-0 text-15 text-muted">
          {when} · {call.durationMinutes} minutes
        </p>
      </div>

      {access?.provider === "jaas" && !left ? (
        <section aria-label="Salle de l'appel" className="flex flex-col gap-3">
          <div
            key={attempt}
            className="h-[min(70dvh,640px)] min-h-[480px] overflow-hidden rounded-16 bg-ink"
          >
            <JaasRoom
              appId={access.appId}
              roomName={access.roomName}
              jwt={access.jwt}
              displayName={displayName}
              onReady={() => setReady(true)}
              onJoined={() => void postEvent(callId, "joined")}
              onLeft={() => {
                void postEvent(callId, "left");
                setLeft(true);
              }}
            />
          </div>
          {stalled && !ready ? (
            <Card variant="notice-accent" padding="md" className="flex flex-col gap-2.5">
              <p className="m-0">La salle ne s&apos;affiche pas ?</p>
              <div className="flex flex-wrap gap-2.5">
                <Button href={jaasUrl(access)} target="_blank" rel="noopener" variant="primary">
                  Ouvrir la salle dans un nouvel onglet
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStalled(false);
                    setAttempt((value) => value + 1);
                  }}
                >
                  Réessayer
                </Button>
              </div>
            </Card>
          ) : null}
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card as="section" padding="xl" className="flex flex-col gap-4" aria-live="polite">
            {room.state === "early" ? (
              <>
                <h2 className="m-0 text-20 font-bold">La salle n&apos;est pas encore ouverte</h2>
                <p className="m-0 text-15 text-ink-soft">
                  Elle ouvre à{" "}
                  {callHour(call.joinOpensAt, relais ? RELAIS_TIME_ZONE : PARRAIN_TIME_ZONE)}, 10
                  minutes avant l&apos;appel. Testez votre micro et votre caméra en attendant.
                </p>
              </>
            ) : room.state === "waiting" ? (
              <>
                <h2 className="m-0 flex items-center gap-2.5 text-20 font-bold">
                  <Spinner /> En attente de {call.relaisName}
                </h2>
                <p className="m-0 text-15 text-ink-soft">
                  La salle s&apos;ouvre dès que {call.relaisName} y arrive avec{" "}
                  {call.childFirstName}. Cette page se met à jour toute seule.
                </p>
              </>
            ) : room.state === "closed" ? (
              <>
                <h2 className="m-0 text-20 font-bold">Cet appel est terminé</h2>
                <p className="m-0 text-15 text-ink-soft">
                  La salle a fermé 15 minutes après la fin prévue de l&apos;appel.
                </p>
                <Button href={backHref} variant="secondary" className="self-start">
                  Retour aux appels
                </Button>
              </>
            ) : left ? (
              <>
                <h2 className="m-0 text-20 font-bold">Vous avez quitté l&apos;appel</h2>
                <Button onClick={() => void join()} loading={joining} className="self-start">
                  Revenir dans la salle
                </Button>
              </>
            ) : access?.provider === "link" ? (
              <>
                <h2 className="m-0 text-20 font-bold">
                  La salle est ouverte dans un nouvel onglet
                </h2>
                <p className="m-0 text-15 text-ink-soft">
                  Si l&apos;onglet ne s&apos;est pas ouvert, utilisez ce lien.
                </p>
                <Button href={access.url} target="_blank" rel="noopener" className="self-start">
                  Ouvrir la salle
                </Button>
              </>
            ) : (
              <>
                <h2 className="m-0 text-20 font-bold">La salle est ouverte</h2>
                <p className="m-0 text-15 text-ink-soft">
                  {relais
                    ? "Entrez dans la salle : le parrain pourra vous rejoindre dès votre arrivée."
                    : `${call.relaisName} est arrivé avec ${call.childFirstName}.`}
                </p>
                <Button
                  variant="accent"
                  size="xl"
                  loading={joining}
                  onClick={() => void join()}
                  className="self-start"
                >
                  Rejoindre l&apos;appel
                </Button>
              </>
            )}
            {error ? (
              <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
                {error}
              </p>
            ) : null}
          </Card>
          <aside aria-label="Avant l'appel" className="flex flex-col gap-4">
            <Card as="section" padding="lg" className="flex flex-col gap-3">
              <h2 className="m-0 text-17 font-bold">Votre micro et votre caméra</h2>
              <CameraTest tone="light" />
            </Card>
            <p className="m-0 text-13 text-muted">
              Les appels ne sont pas enregistrés. Un adulte du relais est toujours présent.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
