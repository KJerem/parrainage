"use client";

import { NEWS_MAX_MEDIA, type RelaisChildRow } from "@parrainage/contracts";
import { useMemo, useRef } from "react";
import { Button, CameraIcon, CloseIcon, MicIcon, Notice, VideoIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useDictation } from "@/lib/use-dictation";
import { ConsentNotice } from "./consent-notice";
import { publishButtonLabel, quickChildren } from "./relais-labels";
import type { PublishFormState } from "./use-publish-form";

/** RM-Publier : prendre une photo, dire pour qui, quelques mots, publier. */
export function PublishFormMobile({
  form,
  followed,
  onPick,
}: {
  form: PublishFormState;
  followed: readonly RelaisChildRow[];
  onPick: () => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { setBody } = form;
  const dictation = useDictation((text) =>
    setBody((current) => (current ? `${current} ${text}` : text)),
  );
  const chips = useMemo(() => quickChildren(followed, form.childIds), [followed, form.childIds]);
  const several = form.childIds.length > 1;
  const onFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      void form.addFiles(event.target.files);
    }
    event.target.value = "";
  };
  const full = form.media.length >= NEWS_MAX_MEDIA;
  return (
    <form
      aria-label="Nouvelle publication"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.publish(null, { autoTitle: true });
      }}
      className="-m-5 flex flex-1 flex-col bg-white"
    >
      <div className="flex flex-1 flex-col gap-[18px] p-4">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={full}
            onClick={() => photoRef.current?.click()}
            className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-16 border-0 bg-brand-700 text-15 font-bold text-white"
          >
            <CameraIcon size={28} />
            Prendre une photo
          </button>
          <button
            type="button"
            disabled={full}
            onClick={() => videoRef.current?.click()}
            className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-16 border-0 bg-brand-100 text-15 font-bold text-brand-700"
          >
            <VideoIcon size={28} />
            Filmer
          </button>
        </div>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          data-testid="prendre-photo"
          onChange={onFiles}
        />
        <input
          ref={videoRef}
          type="file"
          accept="video/*"
          capture="environment"
          hidden
          data-testid="filmer"
          onChange={onFiles}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          data-testid="galerie"
          onChange={onFiles}
        />

        <div
          className="flex gap-2 overflow-x-auto"
          tabIndex={form.media.length > 3 ? 0 : undefined}
        >
          {form.media.map((item) => (
            <div
              key={item.localId}
              className={cn(
                "relative flex size-18 shrink-0 items-center justify-center overflow-hidden rounded-12 text-11 font-semibold",
                item.kind === "VIDEO" ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-700",
              )}
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu local du fichier.
                <img src={item.previewUrl} alt="Photo" className="size-full object-cover" />
              ) : item.kind === "VIDEO" ? (
                "Vidéo"
              ) : (
                "Fichier"
              )}
              <button
                type="button"
                aria-label="Retirer ce fichier"
                onClick={() => form.removeMedia(item.localId)}
                className="absolute top-0.5 right-0.5 flex size-6 cursor-pointer items-center justify-center rounded-full border-0 bg-white text-ink"
              >
                <CloseIcon size={12} />
              </button>
            </div>
          ))}
          {full ? null : (
            <button
              type="button"
              aria-label="Choisir dans la galerie"
              onClick={() => galleryRef.current?.click()}
              className="size-18 shrink-0 cursor-pointer rounded-12 border-2 border-dashed border-line-strong bg-white text-11 font-semibold text-ink-soft"
            >
              Galerie
            </button>
          )}
        </div>
        {form.uploadError ? (
          <p role="alert" className="m-0 text-13 font-semibold text-danger-600">
            {form.uploadError}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <span id="pour-quel-enfant" className="text-15 font-bold">
            Pour quel enfant ?
          </span>
          <div role="group" aria-labelledby="pour-quel-enfant" className="flex flex-wrap gap-2">
            {chips.map((child) => {
              const active = form.childIds.includes(child.id);
              return (
                <button
                  key={child.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => form.chooseChildren([child.id])}
                  className={cn(
                    "inline-flex min-h-10 cursor-pointer items-center rounded-20 border-0 px-3.5 text-14 font-semibold pointer-coarse:min-h-11",
                    active ? "bg-brand-700 text-white" : "bg-canvas text-ink",
                  )}
                >
                  {child.name}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={several}
              onClick={onPick}
              className={cn(
                "inline-flex min-h-10 cursor-pointer items-center rounded-20 border-0 px-3.5 text-14 font-semibold pointer-coarse:min-h-11",
                several ? "bg-brand-700 text-white" : "bg-canvas text-ink",
              )}
            >
              {several ? `Plusieurs (${form.childIds.length})` : "Plusieurs…"}
            </button>
          </div>
          {form.errorsOf("childIds") ? (
            <p className="m-0 text-13 font-semibold text-danger-600">{form.errorsOf("childIds")}</p>
          ) : null}
        </div>

        {form.withoutConsent.length > 0 ? (
          <ConsentNotice childrenWithout={form.withoutConsent} />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="quelques-mots" className="text-15 font-bold">
            Quelques mots
          </label>
          <div className="relative">
            <textarea
              id="quelques-mots"
              rows={4}
              value={form.body}
              aria-invalid={form.errorsOf("body") ? true : undefined}
              onChange={(event) => setBody(event.target.value)}
              className="block w-full resize-none rounded-12 border border-line-strong py-3 pr-13 pl-3 text-16 leading-[1.5] aria-invalid:border-danger-600"
            />
            <button
              type="button"
              aria-label={dictation.listening ? "Arrêter la dictée" : "Dicter"}
              aria-pressed={dictation.listening}
              onClick={dictation.toggle}
              className={cn(
                "absolute right-2 bottom-3 flex size-10 cursor-pointer items-center justify-center rounded-full border-0",
                dictation.listening ? "bg-accent-500 text-ink" : "bg-accent-100 text-accent-700",
              )}
            >
              <MicIcon size={18} />
            </button>
          </div>
          {dictation.hint ? (
            <p role="status" className="m-0 text-13 text-muted">
              {dictation.hint}
            </p>
          ) : null}
          {form.errorsOf("body") ? (
            <p className="m-0 text-13 font-semibold text-danger-600">{form.errorsOf("body")}</p>
          ) : null}
        </div>

        {form.online ? null : (
          <Notice size="sm" role="status">
            Hors ligne : la publication partira automatiquement dès le retour du réseau.
          </Notice>
        )}
        {form.error ? (
          <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
            {form.error}
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-0 border-t border-line-soft bg-white px-4 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]">
        <Button
          type="submit"
          variant="accent"
          fullWidth
          loading={form.sending === "now"}
          disabled={form.sending !== null || form.uploading}
          className="min-h-14 rounded-14 text-17 font-extrabold"
        >
          {publishButtonLabel(form.selected)}
        </Button>
      </div>
    </form>
  );
}
