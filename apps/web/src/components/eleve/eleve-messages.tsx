"use client";

import {
  eleveMediaPath,
  type EleveHome,
  type EleveMessage,
  eleveSentMessageSchema,
  type EleveThread,
  MESSAGE_BODY_MAX_LENGTH,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AttachmentTile } from "@/components/messaging/chat-bubble";
import { Button } from "@/components/ui/button";
import { FormField, Textarea } from "@/components/ui/form-field";
import {
  CheckIcon,
  FileLinesIcon,
  ImageIcon,
  LockIcon,
  SendIcon,
  VideoIcon,
} from "@/components/ui/icons";
import { apiFetch, ApiRequestError, newIdempotencyKey } from "@/lib/api-client";
import { ELEVE_HOME } from "@/lib/auth-paths";
import { cn } from "@/lib/cn";
import { childDay, messageStatusLine } from "./eleve-labels";

const TRY_AGAIN = "Ton message n'est pas parti. Réessaie, ou demande à ton relais.";

/** Médias lus par l'espace enfant : l'API vérifie qu'ils lui appartiennent. */
const childMediaSrc = (media: Parameters<typeof eleveMediaPath>[0]) => eleveMediaPath(media);

function Bubble({
  message,
  thread,
  relaisName,
  now,
}: {
  message: EleveMessage;
  thread: EleveThread;
  relaisName: string;
  now: string;
}) {
  const mine = message.side === "me";
  const status = messageStatusLine(message, thread, relaisName, now);
  return (
    <article
      className={cn(
        "flex max-w-[75%] flex-col gap-1 max-sm:max-w-[90%]",
        mine ? "items-end self-end" : "items-start self-start",
      )}
    >
      {message.body.trim() !== "" ? (
        <p
          className={cn(
            "m-0 px-[18px] py-3.5 text-18 leading-[1.5] [overflow-wrap:anywhere] whitespace-pre-line",
            mine
              ? "rounded-[18px_18px_4px_18px] bg-brand-100"
              : "rounded-[18px_18px_18px_4px] bg-info-100",
          )}
        >
          {message.body}
        </p>
      ) : null}
      {message.attachments.length > 0 ? (
        <div className={cn("flex flex-wrap gap-2", mine && "justify-end")}>
          {message.attachments.map((media) => (
            <AttachmentTile key={media.id} media={media} srcOf={childMediaSrc} />
          ))}
        </div>
      ) : null}
      {mine ? (
        status ? (
          <p
            className={cn(
              "m-0 inline-flex items-center gap-1 text-13 font-semibold",
              message.status === "garde" ? "text-danger-600" : "text-brand-700",
            )}
          >
            {message.status === "recu" || message.status === "lu" ? <CheckIcon size={14} /> : null}
            {status}
          </p>
        ) : null
      ) : (
        <p className="m-0 text-13 text-muted">
          {message.authorName} · {childDay(message.createdAt, now)}
        </p>
      )}
    </article>
  );
}

/** Le fil, du plus ancien au plus récent ; s'ouvrir, c'est avoir lu. */
export function EleveThreadView({
  thread,
  messages,
  relaisName,
  now,
}: {
  thread: EleveThread;
  messages: readonly EleveMessage[];
  relaisName: string;
  now: string;
}) {
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (box.current) {
      box.current.scrollTop = box.current.scrollHeight;
    }
  }, [thread.id, messages.length]);

  useEffect(() => {
    void fetch(`/api/eleve/conversations/${encodeURIComponent(thread.id)}/read`, {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
  }, [thread.id, messages.length]);

  return (
    <div
      ref={box}
      tabIndex={0}
      role="region"
      aria-label={`Messages avec ${thread.name}`}
      className="flex max-h-[60dvh] flex-col gap-4 overflow-y-auto bg-kid-thread p-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 max-sm:p-4"
    >
      {messages.length === 0 ? (
        <p className="m-0 text-center text-18 text-ink-soft">
          Pas encore de message. Écris le premier !
        </p>
      ) : (
        messages.map((message) => (
          <Bubble
            key={message.id}
            message={message}
            thread={thread}
            relaisName={relaisName}
            now={now}
          />
        ))
      )}
    </div>
  );
}

function ActionTile({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      className="flex min-h-18 items-center justify-center gap-2.5 rounded-14 border-2 border-kid-line bg-kid-canvas px-3 text-center text-16 font-bold text-ink no-underline hover:bg-white hover:text-ink"
    >
      {icon}
      {label}
    </a>
  );
}

/** Formulaire du bas : écrire, ou aller vers les écrans photo, vidéo et bulletin. */
export function EleveComposer({
  thread,
  rights,
}: {
  thread: EleveThread;
  rights: EleveHome["rights"];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Gardée d'un essai à l'autre : un nouvel essai ne double pas le message.
  const key = useRef(newIdempotencyKey());

  const sponsor = thread.kind === "sponsor";
  const canWrite = sponsor ? rights.writeSponsor : rights.writeAssociation;
  const query = `avec=${encodeURIComponent(thread.id)}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      const { data } = await apiFetch(
        `/api/eleve/conversations/${encodeURIComponent(thread.id)}/messages`,
        eleveSentMessageSchema,
        { method: "POST", body: { body: text, idempotencyKey: key.current } },
      );
      router.push(`/eleve/envoye?m=${encodeURIComponent(data.id)}`);
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        window.location.replace(ELEVE_HOME);
        return;
      }
      setError(
        caught instanceof ApiRequestError && caught.status < 500 ? caught.message : TRY_AGAIN,
      );
      setSending(false);
    }
  }

  const tiles = sponsor
    ? [
        rights.media ? (
          <ActionTile
            key="photo"
            href={`/eleve/envoyer?type=photo&${query}`}
            icon={<ImageIcon size={24} />}
            label="Ajouter une photo"
          />
        ) : null,
        rights.media ? (
          <ActionTile
            key="video"
            href={`/eleve/envoyer?type=video&${query}`}
            icon={<VideoIcon size={24} />}
            label="Faire une vidéo"
          />
        ) : null,
        rights.bulletin ? (
          <ActionTile
            key="bulletin"
            href={`/eleve/envoyer?type=bulletin&${query}`}
            icon={<FileLinesIcon size={24} />}
            label="Envoyer mon bulletin"
          />
        ) : null,
      ].filter(Boolean)
    : [];

  if (!canWrite && tiles.length === 0) {
    return null;
  }
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3.5 border-t border-kid-line-soft p-6 max-sm:p-4"
    >
      {canWrite ? (
        <FormField label="Écris ton message" size="kid">
          <Textarea
            size="kid"
            rows={4}
            value={body}
            maxLength={MESSAGE_BODY_MAX_LENGTH}
            placeholder={sponsor ? `Bonjour ${thread.name}…` : "Bonjour…"}
            onChange={(event) => setBody(event.target.value)}
          />
        </FormField>
      ) : null}
      {tiles.length > 0 ? <div className="grid gap-3 sm:grid-cols-3">{tiles}</div> : null}
      {error ? (
        <p role="alert" className="m-0 text-16 font-semibold text-danger-600">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 inline-flex items-center gap-2 text-16 text-ink-soft">
          <LockIcon size={18} />
          {sponsor
            ? `L'association lit ton message avant de l'envoyer à ${thread.name}.`
            : "L'association lit ton message."}
        </p>
        {canWrite ? (
          <Button
            type="submit"
            variant="kid-primary"
            disabled={body.trim() === ""}
            loading={sending}
            rightIcon={<SendIcon size={20} />}
            className="max-sm:w-full"
          >
            Envoyer
          </Button>
        ) : null}
      </div>
    </form>
  );
}
