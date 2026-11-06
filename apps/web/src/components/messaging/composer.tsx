"use client";

import {
  conversationMessageSchema,
  detectAlerts,
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGE_MAX_ATTACHMENTS,
  type ConversationMessage,
  type UploadedMedia,
} from "@parrainage/contracts";
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form-field";
import { CloseIcon, PlayCircleIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ApiRequestError, apiFetch, newIdempotencyKey } from "@/lib/api-client";
import { formatDuration } from "@/lib/format";
import { prepareFile, uploadFile, UploadError, type PreparedFile } from "@/lib/upload";
import { alertHint, insertIdea, MESSAGE_IDEAS, safetyNote } from "./messaging-labels";
import { VideoRecorderDialog, type RecordedVideo } from "./video-recorder-dialog";

type DraftState = "preparing" | "uploading" | "verifying" | "ready" | "error";

type Draft = {
  id: string;
  kind: "photo" | "video";
  /** Aperçu local (URL blob), révoqué au retrait ou après l'envoi. */
  previewUrl: string | null;
  durationSec: number | null;
  state: DraftState;
  /** 0 à 100. */
  percent: number;
  error: string | null;
  resumable: boolean;
};

type DraftJob = {
  source: File;
  prepared: PreparedFile | null;
  promise: Promise<UploadedMedia>;
  controller: AbortController;
};

export type ComposerProps = {
  conversationId: string;
  /** Prénom ou nom du destinataire (« Aïcha », « Claire », « M. Koffi »). */
  recipient: string;
  /** Conversation avec un enfant : idées, avertissement et note de sécurité. */
  moderated: boolean;
  variant: "parrain" | "relais";
  onSent: (message: ConversationMessage) => void;
};

const MAX_ATTACHMENTS_MESSAGE = `${MESSAGE_MAX_ATTACHMENTS} pièces jointes au plus par message.`;

let draftSequence = 0;

/** Zone de réponse d'un fil (P-Messages, RW-Messages) : texte, photos, message vidéo, envoi. */
export function Composer({ conversationId, recipient, moderated, variant, onSent }: ComposerProps) {
  const fieldId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const jobs = useRef(new Map<string, DraftJob>());
  const previews = useRef(new Set<string>());
  // Même clé d'un essai à l'autre : un envoi dont la réponse s'est perdue n'est pas doublé.
  const idempotencyKey = useRef<string | null>(null);
  const [body, setBody] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);

  const deferredBody = useDeferredValue(body);
  const alerts = useMemo(
    () => (moderated ? detectAlerts(deferredBody).types : []),
    [moderated, deferredBody],
  );

  // Au démontage : envois en cours abandonnés, aperçus libérés.
  useEffect(() => {
    const current = jobs.current;
    const urls = previews.current;
    return () => {
      for (const job of current.values()) job.controller.abort();
      current.clear();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const parrain = variant === "parrain";
  const label = parrain ? "Votre réponse" : "Votre message";
  const placeholder = parrain ? `Écrivez à ${recipient}…` : `Écrire à ${recipient}…`;

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((previous) => previous.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function startUpload(id: string, source: File, prepared: PreparedFile | null) {
    const controller = new AbortController();
    const run = async (): Promise<UploadedMedia> => {
      try {
        let file = prepared;
        if (!file) {
          updateDraft(id, { state: "preparing", error: null, percent: 0 });
          file = await prepareFile(source);
          const job = jobs.current.get(id);
          if (job) job.prepared = file;
        }
        updateDraft(id, { state: "uploading", error: null });
        const media = await uploadFile(file, {
          signal: controller.signal,
          onProgress: ({ phase, loaded, total }) =>
            updateDraft(id, {
              state: phase === "verifying" ? "verifying" : "uploading",
              percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
            }),
        });
        updateDraft(id, { state: "ready", percent: 100 });
        return media;
      } catch (cause) {
        if (!controller.signal.aborted) {
          updateDraft(id, {
            state: "error",
            error: cause instanceof UploadError ? cause.message : "L'envoi du fichier a échoué.",
            resumable: cause instanceof UploadError && cause.resumable,
          });
        }
        throw cause;
      }
    };
    const promise = run();
    // L'échec est affiché sur la vignette ; l'envoi du message le relira au besoin.
    promise.catch(() => {});
    jobs.current.set(id, { source, prepared, promise, controller });
  }

  function addFiles(files: readonly File[], meta: { durationSec?: number } = {}) {
    setError(null);
    const room = MESSAGE_MAX_ATTACHMENTS - drafts.length;
    if (files.length > room) {
      setError(MAX_ATTACHMENTS_MESSAGE);
    }
    const added = files.slice(0, Math.max(0, room)).map((file) => {
      draftSequence += 1;
      const id = `piece-${draftSequence}`;
      const video = file.type.startsWith("video/");
      const previewUrl = video ? null : URL.createObjectURL(file);
      if (previewUrl) previews.current.add(previewUrl);
      const draft: Draft = {
        id,
        kind: video ? "video" : "photo",
        previewUrl,
        durationSec: meta.durationSec ?? null,
        state: "preparing",
        percent: 0,
        error: null,
        resumable: false,
      };
      startUpload(id, file, null);
      return draft;
    });
    setDrafts((previous) => [...previous, ...added]);
    return added.map((draft) => draft.id);
  }

  function removeDraft(id: string) {
    const job = jobs.current.get(id);
    job?.controller.abort();
    jobs.current.delete(id);
    setDrafts((previous) => {
      const draft = previous.find((d) => d.id === id);
      if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      return previous.filter((d) => d.id !== id);
    });
  }

  function retryDraft(id: string) {
    const job = jobs.current.get(id);
    if (!job) return;
    startUpload(id, job.source, job.prepared);
  }

  async function submit(extraIds: readonly string[] = []) {
    if (sending) return;
    const text = body.trim();
    const ids = [
      ...drafts.map((d) => d.id),
      ...extraIds.filter((id) => !drafts.some((d) => d.id === id)),
    ];
    if (text === "" && ids.length === 0) {
      setError("Écrivez un message ou joignez une photo.");
      textareaRef.current?.focus();
      return;
    }
    setSending(true);
    setError(null);
    try {
      let media: UploadedMedia[];
      try {
        media = await Promise.all(ids.map((id) => jobs.current.get(id)!.promise));
      } catch {
        throw new UploadError(
          "Une pièce jointe n'a pas pu être envoyée : réessayez-la ou retirez-la avant d'envoyer.",
        );
      }
      idempotencyKey.current ??= newIdempotencyKey();
      const { data } = await apiFetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
        conversationMessageSchema,
        {
          method: "POST",
          body: {
            body: text,
            mediaIds: media.map((m) => m.id),
            idempotencyKey: idempotencyKey.current,
          },
        },
      );
      idempotencyKey.current = null;
      for (const id of ids) jobs.current.delete(id);
      setDrafts((previous) => {
        for (const draft of previous) if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
        return [];
      });
      setBody("");
      onSent(data);
      textareaRef.current?.focus();
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError || cause instanceof UploadError
          ? cause.message
          : "Le message n'a pas pu être envoyé. Réessayez dans un instant.",
      );
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  }

  function handleVideo({ file, durationSec }: RecordedVideo) {
    const [id] = addFiles([file], { durationSec });
    if (id) void submit([id]);
  }

  function addIdea(idea: string) {
    setBody((previous) => insertIdea(previous, idea));
    textareaRef.current?.focus();
  }

  const full = drafts.length >= MESSAGE_MAX_ATTACHMENTS;
  const attachLabel = parrain ? "Photo" : "Joindre photo ou vidéo";

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={`Écrire à ${recipient}`}
      className="flex shrink-0 flex-col gap-3 border-t border-line-soft px-4 pt-4 pb-5 md:px-5"
    >
      {parrain && moderated ? (
        <div className="flex items-center gap-2 max-md:-mx-4 max-md:overflow-x-auto max-md:px-4 md:flex-wrap">
          <span className="shrink-0 text-13 font-semibold text-muted">Idées :</span>
          {MESSAGE_IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => addIdea(idea)}
              className="min-h-9 shrink-0 cursor-pointer rounded-18 border border-line-strong bg-white px-3 text-13 whitespace-nowrap text-ink transition-colors hover:bg-canvas pointer-coarse:min-h-11"
            >
              {idea}
            </button>
          ))}
        </div>
      ) : null}
      <label htmlFor={fieldId} className="text-14 font-semibold">
        {label}
      </label>
      <Textarea
        ref={textareaRef}
        id={fieldId}
        rows={3}
        value={body}
        maxLength={MESSAGE_BODY_MAX_LENGTH}
        placeholder={placeholder}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={handleKeyDown}
        // P-Messages : interligne de 1,5 (RW-Messages garde l'interligne normal).
        className={parrain ? "leading-[1.5]" : undefined}
        aria-describedby={moderated ? `${fieldId}-securite` : undefined}
      />
      {/* Toujours présente, vide ou non, pour que l'avertissement soit annoncé. */}
      <div role="status" aria-live="polite" className="empty:-mt-3">
        {alerts.length > 0 ? (
          <Notice variant="accent" size="md">
            {alertHint(alerts, recipient)}
          </Notice>
        ) : null}
      </div>
      {drafts.length > 0 ? (
        <ul aria-label="Pièces jointes" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {drafts.map((draft) => (
            <DraftTile
              key={draft.id}
              draft={draft}
              onRemove={() => removeDraft(draft.id)}
              onRetry={() => retryDraft(draft.id)}
            />
          ))}
        </ul>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="m-0 rounded-12 bg-danger-100 px-3.5 py-3 text-14 leading-[1.45] font-semibold text-danger-600"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="px-3.5"
            onClick={() => photoInputRef.current?.click()}
            disabled={full || sending}
          >
            {attachLabel}
          </Button>
          {parrain ? (
            <Button
              variant="secondary"
              className="px-3.5"
              onClick={() => setVideoOpen(true)}
              disabled={full || sending}
            >
              Message vidéo
            </Button>
          ) : null}
          <input
            ref={photoInputRef}
            type="file"
            hidden
            multiple
            accept={parrain ? "image/*" : "image/*,video/mp4,video/webm"}
            aria-label={attachLabel}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) addFiles(files);
            }}
          />
        </div>
        <Button type="submit" loading={sending} className="border-0 px-5.5 text-15 font-bold">
          Envoyer
        </Button>
      </div>
      {moderated ? (
        <p id={`${fieldId}-securite`} className="m-0 text-13 text-muted">
          {safetyNote(recipient)}
        </p>
      ) : null}
      {parrain ? (
        <VideoRecorderDialog
          open={videoOpen}
          onOpenChange={setVideoOpen}
          onSend={handleVideo}
          recipient={recipient}
          reviewed={moderated}
        />
      ) : null}
    </form>
  );
}

const stateText: Record<DraftState, string> = {
  preparing: "Préparation…",
  uploading: "Envoi…",
  verifying: "Vérification…",
  ready: "Prête",
  error: "Échec",
};

function DraftTile({
  draft,
  onRemove,
  onRetry,
}: {
  draft: Draft;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const name = draft.kind === "video" ? "la vidéo" : "la photo";
  const progress =
    draft.state === "uploading"
      ? `${stateText.uploading} ${draft.percent} %`
      : stateText[draft.state];
  return (
    <li className="flex w-[140px] flex-col gap-1.5">
      <div className="relative h-24 w-[140px] overflow-hidden rounded-12 bg-brand-100">
        {draft.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu local (URL blob)
          <img src={draft.previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center gap-1.5 bg-brand-700 text-12 font-semibold text-white">
            <PlayCircleIcon size={20} />
            {draft.durationSec ? `Vidéo · ${formatDuration(draft.durationSec)}` : "Vidéo"}
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Retirer ${name}`}
          className="absolute top-1 right-1 flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-ink/70 text-white hover:bg-ink pointer-coarse:size-9"
        >
          <CloseIcon size={14} />
        </button>
      </div>
      {draft.state === "error" ? (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-12 font-semibold text-danger-600">{draft.error}</p>
          {/* Coupure ou panne : un nouvel essai reprend l'envoi. Fichier refusé : à retirer. */}
          {draft.resumable ? (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-6 w-fit cursor-pointer border-0 bg-transparent p-0 text-12 font-bold text-brand-700 underline pointer-coarse:min-h-11"
            >
              Réessayer
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <ProgressBar
            aria-label={`Envoi de ${name}`}
            valueLabel={progress}
            value={draft.state === "ready" ? 100 : draft.percent}
            max={100}
          />
          <span aria-hidden="true" className="text-12 font-semibold text-muted">
            {progress}
          </span>
        </div>
      )}
    </li>
  );
}
