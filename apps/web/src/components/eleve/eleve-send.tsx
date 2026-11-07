"use client";

/* eslint-disable @next/next/no-img-element -- aperçus locaux (URL blob) avant l'envoi. */

import {
  ELEVE_BULLETIN_MAX_PAGES,
  ELEVE_VIDEO_MAX_SECONDS,
  eleveSentMessageSchema,
  type EleveThread,
  MESSAGE_BODY_MAX_LENGTH,
  uploadMimeTypes,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, Textarea } from "@/components/ui/form-field";
import { CloseIcon, SendIcon } from "@/components/ui/icons";
import { apiFetch, ApiRequestError, newIdempotencyKey } from "@/lib/api-client";
import { ELEVE_HOME } from "@/lib/auth-paths";
import { cn } from "@/lib/cn";
import { BULLETIN_COMPRESSION, prepareFile, UploadError, uploadFile } from "@/lib/upload";
import { CameraStage } from "./camera-stage";
import type { EleveSendType } from "./eleve-labels";

const TRY_AGAIN = "L'envoi n'a pas marché. Réessaie, ou demande à ton relais.";
const REFUSED_FILE = "Ce fichier ne peut pas être envoyé. Essaie avec un autre.";

const acceptOf: Readonly<Record<EleveSendType, string>> = {
  photo: uploadMimeTypes.PHOTO.join(","),
  video: uploadMimeTypes.VIDEO.join(","),
  bulletin: [...uploadMimeTypes.PHOTO, ...uploadMimeTypes.DOCUMENT].join(","),
};

const headings: Readonly<Record<EleveSendType, string>> = {
  photo: "Mes photos",
  video: "Ma vidéo",
  bulletin: "Mes pages",
};

type Item = { key: string; file: File; url: string; mediaId: string | null };

const itemLabel = (type: EleveSendType, index: number) =>
  type === "video" ? "Vidéo" : `${type === "bulletin" ? "Page" : "Photo"} ${index + 1}`;

function Preview({ item, label }: { item: Item; label: string }) {
  if (item.file.type.startsWith("image/")) {
    return <img src={item.url} alt={label} className="size-full object-cover" />;
  }
  if (item.file.type.startsWith("video/")) {
    return (
      <video
        src={item.url}
        controls
        playsInline
        aria-label={label}
        className="size-full object-cover"
      />
    );
  }
  return <span className="px-2 text-center text-14 font-bold">{label} (PDF)</span>;
}

/** Le côté droit d'E-Bulletin et la scène de capture : un fichier se prépare, puis tout part. */
export function EleveSend({ type, thread }: { type: EleveSendType; thread: EleveThread }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Gardée d'un essai à l'autre : un nouvel essai ne double pas le message.
  const key = useRef(newIdempotencyKey());
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const created = urls.current;
    return () => {
      for (const url of created) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const max = type === "video" ? 1 : ELEVE_BULLETIN_MAX_PAGES;
  const full = items.length >= max;
  const sending = progress !== null;

  function add(file: File) {
    setError(null);
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    setItems((current) =>
      current.length >= max
        ? current
        : [...current, { key: `${Date.now()}-${current.length}`, file, url, mediaId: null }],
    );
  }

  function remove(item: Item) {
    URL.revokeObjectURL(item.url);
    urls.current.delete(item.url);
    setItems((current) => current.filter((other) => other.key !== item.key));
  }

  async function send() {
    setError(null);
    try {
      const mediaIds: string[] = [];
      for (const [index, item] of items.entries()) {
        if (item.mediaId) {
          mediaIds.push(item.mediaId);
          continue;
        }
        setProgress(`Envoi : ${itemLabel(type, index)}`);
        const prepared = await prepareFile(item.file, {
          limits: type === "bulletin" ? BULLETIN_COMPRESSION : undefined,
        });
        const media = await uploadFile(prepared, {
          purpose: "message",
          basePath: "/api/eleve/uploads",
        });
        mediaIds.push(media.id);
        setItems((current) =>
          current.map((other) =>
            other.key === item.key ? { ...other, mediaId: media.id } : other,
          ),
        );
      }
      setProgress("Envoi en cours");
      const { data } = await apiFetch(
        `/api/eleve/conversations/${encodeURIComponent(thread.id)}/messages`,
        eleveSentMessageSchema,
        {
          method: "POST",
          body: {
            body: note.trim(),
            mediaIds,
            bulletin: type === "bulletin",
            idempotencyKey: key.current,
          },
        },
      );
      router.push(`/eleve/envoye?m=${encodeURIComponent(data.id)}`);
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        window.location.replace(ELEVE_HOME);
        return;
      }
      setError(caught instanceof UploadError && !caught.resumable ? REFUSED_FILE : TRY_AGAIN);
      setProgress(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <CameraStage
        mode={type}
        maxSeconds={ELEVE_VIDEO_MAX_SECONDS}
        full={full}
        accept={acceptOf[type]}
        onCapture={add}
      />
      <aside
        aria-label="Ce que tu envoies"
        className="flex flex-col gap-4 rounded-20 border border-kid-line bg-white p-5"
      >
        <h2 className="m-0 text-18 font-bold">{headings[type]}</h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
          {items.map((item, index) => {
            const label = itemLabel(type, index);
            return (
              <li
                key={item.key}
                className="relative flex h-[120px] items-center justify-center overflow-hidden rounded-14 bg-brand-100 text-brand-700"
              >
                <Preview item={item} label={label} />
                <button
                  type="button"
                  aria-label={`Retirer : ${label}`}
                  disabled={sending}
                  onClick={() => remove(item)}
                  className="absolute top-1.5 right-1.5 flex size-8 cursor-pointer items-center justify-center rounded-full bg-ink text-white disabled:opacity-50 pointer-coarse:size-11"
                >
                  <CloseIcon size={16} />
                </button>
              </li>
            );
          })}
          {!full ? (
            <li
              className={cn(
                "flex h-[120px] items-center justify-center rounded-14 border-2 border-dashed border-kid-line text-center text-15 font-semibold text-ink-soft",
                items.length === 0 && "col-span-2",
              )}
            >
              {itemLabel(type, items.length)} ?
            </li>
          ) : null}
        </ul>
        <FormField label="Un petit mot (si tu veux)" size="kid">
          <Textarea
            size="kid"
            rows={3}
            value={note}
            maxLength={MESSAGE_BODY_MAX_LENGTH}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
        {error ? (
          <p role="alert" className="m-0 text-16 font-semibold text-danger-600">
            {error}
          </p>
        ) : null}
        <p aria-live="polite" className="m-0 min-h-5 text-14 font-semibold text-brand-700">
          {progress}
        </p>
        <Button
          variant="kid-primary"
          size="kid-lg"
          disabled={items.length === 0}
          loading={sending}
          rightIcon={<SendIcon size={20} />}
          onClick={() => void send()}
        >
          Envoyer à {thread.name}
        </Button>
        <p className="m-0 text-center text-15 text-ink-soft">
          L&apos;association vérifie avant l&apos;envoi.
        </p>
      </aside>
    </div>
  );
}
