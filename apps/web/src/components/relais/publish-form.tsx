"use client";

import {
  initials,
  NEWS_MAX_MEDIA,
  newsPostTypeLabels,
  newsPostTypes,
  type RelaisChildRow,
  type ScheduledNews,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { z } from "zod";
import {
  Avatar,
  Button,
  Checkbox,
  CloseIcon,
  Dialog,
  FormField,
  Input,
  PlayCircleIcon,
  SegmentedControl,
  Textarea,
  toast,
} from "@/components/ui";
import { ApiRequestError, apiFetch, NETWORK_ERROR_MESSAGE } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatClock, formatLongDate, RELAIS_TIME_ZONE } from "@/lib/format";
import { ConsentNotice } from "./consent-notice";
import { PublishFormMobile } from "./publish-form-mobile";
import { type PublishFormState, usePublishForm } from "./use-publish-form";

const VISIBLE_CHIPS = 4;

const errorMessage = (caught: unknown) =>
  caught instanceof ApiRequestError ? caught.message : NETWORK_ERROR_MESSAGE;

/** Valeur de `<input type="datetime-local">` pour un instant, à l'heure du navigateur. */
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** L'état et les envois sont ici ; les variantes web et mobile ne font qu'afficher (CSS). */
export function PublishScreen({
  followed,
  scheduled,
  relaisName,
  relaisCity,
  initialChildId,
  now,
}: {
  followed: readonly RelaisChildRow[];
  scheduled: readonly ScheduledNews[];
  relaisName: string;
  relaisCity: string;
  initialChildId: string | null;
  now: string;
}) {
  const form = usePublishForm({ followed, initialChildId });
  const [picking, setPicking] = useState<"web" | "mobile" | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

  return (
    <>
      <div className="hidden md:contents">
        <PublishFormWeb
          form={form}
          followed={followed}
          scheduled={scheduled}
          relaisName={relaisName}
          relaisCity={relaisCity}
          onPick={() => setPicking("web")}
          onSchedule={() => {
            const tomorrow = new Date(new Date(now).getTime() + 24 * 3600 * 1000);
            tomorrow.setHours(9, 0, 0, 0);
            setScheduleAt(toLocalInput(tomorrow));
            setScheduling(true);
          }}
        />
      </div>
      <div className="contents md:hidden">
        <PublishFormMobile form={form} followed={followed} onPick={() => setPicking("mobile")} />
      </div>

      {picking ? (
        <ChildPicker
          options={followed}
          single={picking === "web" && form.type === "ONE_CHILD"}
          selected={form.childIds}
          onClose={() => setPicking(null)}
          onConfirm={(ids) => {
            if (picking === "mobile") {
              form.chooseChildren(ids);
            } else {
              form.setChildIds(ids);
            }
            setPicking(null);
          }}
        />
      ) : null}

      <Dialog
        open={scheduling}
        onOpenChange={setScheduling}
        title="Programmer la nouvelle"
        description="Elle paraîtra à cette date, et les parrains seront prévenus à ce moment-là."
        footer={
          <>
            <Button variant="secondary" onClick={() => setScheduling(false)}>
              Annuler
            </Button>
            <Button
              loading={form.sending === "later"}
              disabled={scheduleAt === ""}
              onClick={() => {
                void form.publish(new Date(scheduleAt).toISOString(), {
                  onDone: () => setScheduling(false),
                });
              }}
            >
              Programmer
            </Button>
          </>
        }
      >
        <FormField
          label="Date et heure de parution"
          error={form.errorsOf("scheduledAt") ?? (scheduling ? form.error : null)}
        >
          <Input
            type="datetime-local"
            value={scheduleAt}
            onChange={(event) => setScheduleAt(event.target.value)}
          />
        </FormField>
      </Dialog>
    </>
  );
}

/** RW-Publier : à gauche le formulaire, à droite l'aperçu de ce que verront les parrains. */
function PublishFormWeb({
  form,
  followed,
  scheduled,
  relaisName,
  relaisCity,
  onPick,
  onSchedule,
}: {
  form: PublishFormState;
  followed: readonly RelaisChildRow[];
  scheduled: readonly ScheduledNews[];
  relaisName: string;
  relaisCity: string;
  onPick: () => void;
  onSchedule: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { selected, media, parrainCount, withoutConsent, errorsOf, sending, uploading } = form;
  const busy = sending !== null;
  const shownChips = selected.slice(0, VISIBLE_CHIPS);
  const previewTiles = media.slice(0, 3);
  return (
    <>
      <h1 className="m-0 text-30 font-extrabold max-sm:text-24">Publier une nouvelle</h1>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <form
          aria-label="Publier une nouvelle"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.publish(null);
          }}
          className="flex min-w-0 flex-col gap-5 rounded-16 border border-line bg-white p-6 max-sm:p-4"
        >
          <div className="flex flex-col gap-2">
            <span id="type-nouvelle" className="text-14 font-semibold">
              Type de nouvelle
            </span>
            <SegmentedControl
              aria-labelledby="type-nouvelle"
              value={form.type}
              onValueChange={form.changeType}
              options={newsPostTypes.map((value) => ({
                value,
                label: newsPostTypeLabels[value],
              }))}
            />
          </div>

          {form.type === "RELAIS_LIFE" ? (
            <p className="m-0 text-14 text-ink-soft">
              La nouvelle concerne les {followed.length} enfants suivis par votre relais.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-14 font-semibold">Enfants concernés · {selected.length}</span>
              <div className="flex flex-wrap gap-2">
                {shownChips.map((child) => (
                  <span
                    key={child.id}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-18 bg-brand-100 pr-1.5 pl-3 text-13 font-semibold text-brand-700"
                  >
                    {child.name}
                    <button
                      type="button"
                      aria-label={`Retirer ${child.name}`}
                      onClick={() =>
                        form.setChildIds(form.childIds.filter((value) => value !== child.id))
                      }
                      className="flex size-6 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-current"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </span>
                ))}
                {selected.length > VISIBLE_CHIPS ? (
                  <span className="inline-flex min-h-9 items-center rounded-18 bg-brand-100 px-3 text-13 font-semibold text-brand-700">
                    + {selected.length - VISIBLE_CHIPS}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={onPick}
                  className="inline-flex min-h-9 cursor-pointer items-center rounded-18 border border-dashed border-line-strong bg-white px-3 text-13 font-semibold text-ink pointer-coarse:min-h-11"
                >
                  + Ajouter
                </button>
              </div>
              {errorsOf("childIds") ? (
                <p className="m-0 text-13 font-semibold text-danger-600">{errorsOf("childIds")}</p>
              ) : null}
            </div>
          )}

          {withoutConsent.length > 0 ? <ConsentNotice childrenWithout={withoutConsent} /> : null}

          <FormField label="Titre" error={errorsOf("title")}>
            <Input value={form.title} onChange={(event) => form.setTitle(event.target.value)} />
          </FormField>
          <FormField
            label="Message aux parrains"
            hint="Astuce : vous pouvez dicter le texte avec le micro de votre téléphone."
            error={errorsOf("body")}
          >
            <Textarea
              rows={5}
              value={form.body}
              onChange={(event) => form.setBody(event.target.value)}
            />
          </FormField>

          <div className="flex flex-col gap-2">
            <span className="text-14 font-semibold">Photos et vidéos</span>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {media.map((item) => (
                <div
                  key={item.localId}
                  className="relative flex aspect-square items-center justify-center overflow-hidden rounded-12 bg-brand-100 text-12 font-semibold text-brand-700"
                >
                  {item.kind === "VIDEO" ? (
                    <span className="flex size-full items-center justify-center gap-1.5 bg-brand-700 px-1 text-white">
                      <PlayCircleIcon size={18} />
                      Vidéo
                    </span>
                  ) : item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- aperçu local du fichier.
                    <img src={item.previewUrl} alt="Photo" className="size-full object-cover" />
                  ) : (
                    "Fichier"
                  )}
                  <button
                    type="button"
                    aria-label="Retirer ce fichier"
                    onClick={() => form.removeMedia(item.localId)}
                    className="absolute top-1 right-1 flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-white text-ink"
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              ))}
              {media.length < NEWS_MAX_MEDIA ? (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-square cursor-pointer items-center justify-center rounded-12 border-2 border-dashed border-line-strong bg-canvas px-1 text-13 font-semibold text-ink-soft"
                >
                  {uploading ? "Envoi en cours…" : "+ Ajouter"}
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              data-testid="medias-nouvelle"
              onChange={(event) => {
                if (event.target.files) {
                  void form.addFiles(event.target.files);
                }
                event.target.value = "";
              }}
            />
            <span className="text-13 text-muted">
              Les photos sont allégées avant l&apos;envoi. Vidéos : 25 Mo et 2 minutes au plus.
            </span>
            {form.uploadError ? (
              <p role="alert" className="m-0 text-13 font-semibold text-danger-600">
                {form.uploadError}
              </p>
            ) : null}
          </div>

          <fieldset className="m-0 flex flex-col gap-2 rounded-12 border-0 bg-canvas p-3.5">
            <legend className="float-left mb-2 p-0 text-14 font-semibold">Destinataires</legend>
            <div className="clear-both flex flex-col gap-2">
              <Checkbox
                label={
                  parrainCount === 1
                    ? "Le parrain concerné"
                    : parrainCount === 0
                      ? "Les parrains concernés"
                      : `Les ${parrainCount} parrains concernés`
                }
                checked={form.notifyParrains}
                onChange={(event) => form.setNotifyParrains(event.target.checked)}
              />
              <Checkbox
                label="Le bureau de l'association"
                checked={form.notifyBureau}
                onChange={(event) => form.setNotifyBureau(event.target.checked)}
              />
              <Checkbox
                label="Les enfants (visible à leur prochaine session)"
                checked={form.visibleToChildren}
                onChange={(event) => form.setVisibleToChildren(event.target.checked)}
              />
            </div>
            {errorsOf("notifyParrains") ? (
              <p className="m-0 text-13 font-semibold text-danger-600">
                {errorsOf("notifyParrains")}
              </p>
            ) : null}
          </fieldset>

          {form.error ? (
            <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
              {form.error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2.5 max-sm:flex-col max-sm:*:w-full">
            <Button
              size="xl"
              variant="accent"
              type="submit"
              className="px-6 font-extrabold"
              loading={sending === "now"}
              disabled={busy || uploading}
            >
              Publier
            </Button>
            <Button size="xl" variant="secondary" disabled={busy || uploading} onClick={onSchedule}>
              Programmer
            </Button>
          </div>
        </form>

        <aside aria-label="Aperçu côté parrain" className="flex min-w-0 flex-col gap-2.5">
          <span className="text-13 font-bold tracking-[0.04em] text-muted uppercase">
            Aperçu côté parrain
          </span>
          <article className="flex flex-col gap-3 rounded-16 border border-line bg-white p-[18px]">
            <div className="flex items-center gap-2.5">
              <Avatar size={36} tone="brand" initials={initials(relaisName)} />
              <div>
                <div className="text-14 font-bold">
                  {relaisName}, relais à {relaisCity}
                </div>
                <div className="text-12 text-muted">À l&apos;instant</div>
              </div>
            </div>
            <strong className="text-16 [overflow-wrap:anywhere]">
              {form.title.trim() || "Titre de la nouvelle"}
            </strong>
            <p className="m-0 text-14 leading-[1.5] [overflow-wrap:anywhere] whitespace-pre-line">
              {form.body.trim() || "Le message aux parrains s'affichera ici."}
            </p>
            {previewTiles.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5">
                {previewTiles.map((item) =>
                  item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- aperçu local du fichier.
                    <img
                      key={item.localId}
                      src={item.previewUrl}
                      alt=""
                      className="h-20 w-full rounded-8 bg-brand-100 object-cover"
                    />
                  ) : (
                    <div
                      key={item.localId}
                      className={cn(
                        "h-20 rounded-8",
                        item.kind === "VIDEO" ? "bg-brand-700" : "bg-brand-100",
                      )}
                    />
                  ),
                )}
              </div>
            ) : null}
          </article>
          {scheduled.length > 0 ? <ScheduledList items={scheduled} /> : null}
        </aside>
      </div>
    </>
  );
}

/** Choix des enfants : recherche et cases à cocher, ou un seul pour « Un enfant ». */
function ChildPicker({
  options,
  single,
  selected,
  onClose,
  onConfirm,
}: {
  options: readonly RelaisChildRow[];
  single: boolean;
  selected: readonly string[];
  onClose: () => void;
  onConfirm: (ids: readonly string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [ids, setIds] = useState<readonly string[]>(selected);
  const query = search.trim().toLocaleLowerCase("fr");
  const shown = query
    ? options.filter((child) => child.name.toLocaleLowerCase("fr").includes(query))
    : options;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={single ? "Choisir l'enfant" : "Choisir les enfants"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => onConfirm(ids)}>
            Valider{ids.length > 0 ? ` (${ids.length})` : ""}
          </Button>
        </>
      }
    >
      <FormField label="Rechercher un enfant" hideLabel>
        <Input
          type="search"
          placeholder="Rechercher un enfant"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </FormField>
      <div className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto" tabIndex={0}>
        {shown.map((child) => (
          <Checkbox
            key={child.id}
            label={`${child.name} · ${[child.className, child.schoolName].filter(Boolean).join(" · ")}`}
            checked={ids.includes(child.id)}
            onChange={(event) => {
              if (single) {
                setIds(event.target.checked ? [child.id] : []);
              } else {
                setIds((list) =>
                  event.target.checked
                    ? [...list, child.id]
                    : list.filter((value) => value !== child.id),
                );
              }
            }}
          />
        ))}
        {shown.length === 0 ? (
          <p className="m-0 text-14 text-muted">Aucun enfant ne correspond.</p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Nouvelles programmées, annulables jusqu'à leur parution. */
function ScheduledList({ items }: { items: readonly ScheduledNews[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function cancel(id: string) {
    setBusy(id);
    try {
      await apiFetch(`/api/relais/news/${encodeURIComponent(id)}`, z.null(), {
        method: "DELETE",
      });
      toast("Nouvelle annulée");
    } catch (caught) {
      toast(errorMessage(caught));
    } finally {
      setBusy(null);
      startTransition(() => router.refresh());
    }
  }

  return (
    <section
      aria-labelledby="programmees"
      className="flex flex-col gap-2 rounded-16 border border-line bg-white p-[18px]"
    >
      <h2 id="programmees" className="m-0 text-15 font-bold">
        Nouvelles programmées
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-14">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <strong>{item.title}</strong>
              <span className="block text-13 text-muted">
                {formatLongDate(item.scheduledAt, RELAIS_TIME_ZONE)} à{" "}
                {formatClock(item.scheduledAt, RELAIS_TIME_ZONE)}
              </span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              loading={busy === item.id}
              aria-label={`Annuler : ${item.title}`}
              onClick={() => void cancel(item.id)}
            >
              Annuler
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
