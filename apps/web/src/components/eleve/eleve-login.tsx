"use client";

import {
  CHILD_CODE_LENGTH,
  type ChildCodeImage,
  childCodeImageLabels,
  eleveLoginResultSchema,
  type EleveSession,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { childCodeIcons } from "@/components/relais/child-code";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { codeProgressLabel, lockedMessage, wrongCodeMessage } from "./eleve-labels";

type OpenSession = Extract<EleveSession, { state: "open" }>;

const imageColors: Readonly<Record<ChildCodeImage, string>> = {
  SOLEIL: "text-accent-700",
  ARBRE: "text-brand-700",
  POISSON: "text-info-600",
  COEUR: "text-danger-600",
  MAISON: "text-ink-soft",
  ETOILE: "text-accent-700",
};

const TRY_AGAIN = "Ça n'a pas marché. Réessaie, ou demande à ton relais.";

/**
 * E-Connexion : l'enfant se reconnaît, puis touche ses 3 images dans l'ordre. L'ordre des images
 * vient du serveur et change après chaque essai ; l'API compte les essais et pose le verrou.
 */
export function EleveLogin({ session }: { session: OpenSession }) {
  const router = useRouter();
  const [childId, setChildId] = useState<string | null>(null);
  const [code, setCode] = useState<ChildCodeImage[]>([]);
  const [images, setImages] = useState(session.images);
  const [message, setMessage] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  function chooseChild(id: string) {
    setChildId(id);
    setCode([]);
    setMessage(null);
    setLocked(false);
  }

  function touch(image: ChildCodeImage) {
    setMessage(null);
    setCode((current) =>
      current.includes(image) || current.length >= CHILD_CODE_LENGTH
        ? current
        : [...current, image],
    );
  }

  async function submit() {
    if (!childId || code.length !== CHILD_CODE_LENGTH) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await apiFetch("/api/eleve/login", eleveLoginResultSchema, {
        method: "POST",
        body: { childId, code, shown: images },
      });
      if (data.status === "ok") {
        // Le cookie de l'enfant vient d'être posé : la page suivante le lit côté serveur.
        router.replace("/eleve/messages");
        return;
      }
      if (data.status === "suspended") {
        window.location.reload();
        return;
      }
      setImages(data.images);
      setCode([]);
      setLocked(data.status === "locked");
      setMessage(
        data.status === "locked"
          ? lockedMessage(session.relaisName)
          : wrongCodeMessage(data.remaining),
      );
    } catch (caught) {
      // Session fermée entre-temps : l'écran « aucune session » prend le relais.
      if (caught instanceof ApiRequestError && caught.status === 401) {
        window.location.reload();
        return;
      }
      setMessage(TRY_AGAIN);
    } finally {
      setBusy(false);
    }
  }

  const ready = childId !== null && code.length === CHILD_CODE_LENGTH && !locked;
  return (
    <>
      <section aria-labelledby="qui" className="flex flex-col gap-4">
        <h1 id="qui" className="m-0 text-26 font-extrabold sm:text-32">
          1. Qui es-tu ?
        </h1>
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
          {session.children.map((child) => {
            const selected = child.id === childId;
            return (
              <button
                key={child.id}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseChild(child.id)}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2.5 rounded-20 border-3 bg-white px-2.5 py-[18px] text-18 font-bold text-ink",
                  selected ? "border-brand-700 bg-brand-100" : "border-kid-line",
                )}
              >
                <Avatar
                  size={88}
                  tone={child.avatarTone}
                  initials={child.initials}
                  {...(child.hasPhoto
                    ? { src: `/api/eleve/avatars/${encodeURIComponent(child.id)}`, alt: "" }
                    : {})}
                />
                {child.firstName}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="code" className="flex flex-col gap-4">
        <h2 id="code" className="m-0 text-26 font-extrabold sm:text-32">
          2. Touche tes 3 images secrètes
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="status"
            aria-label={codeProgressLabel(code.length, CHILD_CODE_LENGTH)}
            className="flex items-center gap-3"
          >
            {Array.from({ length: CHILD_CODE_LENGTH }, (_, index) => (
              <span
                key={index}
                aria-hidden="true"
                className={cn(
                  "flex size-12 items-center justify-center rounded-12 font-extrabold",
                  index < code.length
                    ? "bg-brand-700 text-white"
                    : "border-3 border-dashed border-line-strong",
                )}
              >
                {index < code.length ? index + 1 : null}
              </span>
            ))}
          </div>
          {code.length > 0 ? (
            <Button variant="kid-outline" onClick={() => setCode([])}>
              Effacer
            </Button>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {images.map((image) => {
            const Icon = childCodeIcons[image];
            const selected = code.includes(image);
            return (
              <button
                key={image}
                type="button"
                aria-pressed={selected}
                disabled={locked}
                onClick={() => touch(image)}
                className={cn(
                  "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-18 border-3 bg-white text-17 font-bold text-ink disabled:cursor-not-allowed disabled:opacity-50",
                  selected ? "border-brand-700 bg-brand-100" : "border-kid-line",
                )}
              >
                <span className={imageColors[image]}>
                  <Icon size={34} />
                </span>
                {childCodeImageLabels[image]}
              </button>
            );
          })}
        </div>
      </section>

      {message ? (
        <p
          role="alert"
          className={cn(
            "m-0 rounded-14 px-4 py-3 text-18 font-bold",
            locked ? "bg-danger-100 text-danger-600" : "bg-accent-100 text-accent-900",
          )}
        >
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button
          variant="kid-primary"
          size="kid-xl"
          disabled={!ready}
          loading={busy}
          onClick={() => void submit()}
          className="max-sm:w-full"
        >
          C&apos;est moi, j&apos;entre
        </Button>
        <p className="m-0 text-16">Tu as oublié tes images ? Demande à {session.relaisName}.</p>
      </div>
    </>
  );
}
