"use client";

import {
  CLASS_SESSION_MAX_CHILDREN,
  type ClassSessionDuration,
  classSessionDurationLabel,
  classSessionDurations,
  classSessionRightKeys,
  classSessionRightLabels,
  type ClassSessionRights,
  type CurrentClassSession,
  DEFAULT_CLASS_SESSION_DURATION,
  DEFAULT_CLASS_SESSION_RIGHTS,
  openedClassSessionSchema,
  plannedClassSessionSchema,
  type PlannedClassSession,
  type RelaisSessions,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { SignOutForm } from "@/components/layout/sign-out-form";
import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  Dialog,
  FormField,
  Input,
  LockIcon,
  Notice,
  SegmentedControl,
  toast,
} from "@/components/ui";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { ELEVE_HOME } from "@/lib/auth-paths";
import { cn } from "@/lib/cn";
import { formatHour, formatDayMonth, formatWeekday, RELAIS_TIME_ZONE } from "@/lib/format";
import { purgeOfflineData } from "@/lib/offline-purge";
import { useOutbox } from "./outbox-provider";

const SESSIONS_PATH = "/api/relais/sessions";

/** Deux colonnes seulement à partir de xl : la barre latérale du relais prend déjà sa place. */
const LAYOUT = "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]";

const errorMessage = (caught: unknown) =>
  caught instanceof ApiRequestError
    ? caught.message
    : "Le service est momentanément indisponible. Réessayez dans un instant.";

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** « Mardi 27 oct. » */
function sessionDay(date: string): string {
  const weekday = formatWeekday(date, RELAIS_TIME_ZONE);
  const day = formatDayMonth(date, { month: "short", timeZone: RELAIS_TIME_ZONE });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day}`;
}

/** Sur un téléphone, le relais confie son propre appareil : il le confirme explicitement. */
const isPhone = () => window.matchMedia("(max-width: 767px)").matches;

function SecurityCard() {
  return (
    <section
      aria-labelledby="securite"
      className="flex flex-col gap-2 rounded-16 bg-brand-100 p-[18px] text-14 leading-[1.5]"
    >
      <h2 id="securite" className="m-0 text-16 font-bold text-brand-700">
        Sécurité de la session
      </h2>
      <span>· Aucune adresse ni numéro ne peut être échangé : les messages sont relus.</span>
      <span>· L&apos;enfant ne voit que son parrain.</span>
      <span>· La webcam ne s&apos;active qu&apos;à sa demande.</span>
      <span>· Vous pouvez fermer la session à tout moment.</span>
    </section>
  );
}

function RecentCard({ recent }: { recent: RelaisSessions["recent"] }) {
  return (
    <section
      aria-labelledby="recentes"
      className="flex flex-col gap-2 rounded-16 border border-line bg-white p-[18px]"
    >
      <h2 id="recentes" className="m-0 text-16 font-bold">
        Sessions récentes
      </h2>
      {recent.length === 0 ? (
        <p className="m-0 text-14 text-muted">Aucune session pour le moment.</p>
      ) : (
        recent.map((session) => (
          <div key={session.id} className="flex flex-wrap justify-between gap-x-3 text-14">
            <span>{sessionDay(session.openedAt)}</span>
            <span className="text-muted">
              {plural(session.childCount, "enfant", "enfants")} ·{" "}
              {plural(session.sendCount, "envoi", "envois")}
            </span>
          </div>
        ))
      )}
    </section>
  );
}

function PlannedCard({
  planned,
  activeId,
  onUse,
  onRemoved,
}: {
  planned: readonly PlannedClassSession[];
  activeId: string | null;
  onUse: (session: PlannedClassSession) => void;
  onRemoved: (id: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`${SESSIONS_PATH}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new ApiRequestError(response.status, "Cette session n'a pas pu être retirée.");
      }
      onRemoved(id);
    } catch (caught) {
      toast(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  if (planned.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby="planifiees"
      className="flex flex-col gap-3 rounded-16 border border-line bg-white p-[18px]"
    >
      <h2 id="planifiees" className="m-0 text-16 font-bold">
        Sessions planifiées
      </h2>
      {planned.map((session) => (
        <div key={session.id} className="flex flex-col gap-1.5">
          <p className="m-0 text-14 font-semibold">
            {sessionDay(session.scheduledAt)} · {formatHour(session.scheduledAt, RELAIS_TIME_ZONE)}
          </p>
          <p className="m-0 text-13 text-muted">
            {plural(session.childIds.length, "enfant", "enfants")} ·{" "}
            {classSessionDurationLabel(session.durationMinutes)}
          </p>
          <div className="flex flex-wrap gap-2">
            {session.id === activeId ? (
              <Chip variant="success">Enfants cochés</Chip>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => onUse(session)}>
                Utiliser
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              loading={busyId === session.id}
              onClick={() => void remove(session.id)}
            >
              Retirer
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

/** La session ouverte : qui est là, qui est bloqué, et de quoi la fermer. */
function CurrentSessionCard({
  session,
  onDevice,
}: {
  session: CurrentClassSession;
  onDevice: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  async function act(key: string, path: string, done: string) {
    setBusy(key);
    try {
      const response = await fetch(`${SESSIONS_PATH}/${encodeURIComponent(session.id)}${path}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        throw new ApiRequestError(
          response.status,
          response.status === 404 || response.status === 409
            ? "Cette session n'est plus ouverte."
            : "Le service est momentanément indisponible. Réessayez dans un instant.",
        );
      }
      toast(done);
      router.refresh();
    } catch (caught) {
      toast(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="en-cours"
      className="flex flex-col gap-5 rounded-16 border border-line bg-white p-6 max-sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="en-cours" className="m-0 text-20 font-extrabold">
            Session en cours
          </h2>
          <p className="m-0 text-15 text-muted">
            Fermeture automatique à {formatHour(session.endsAt, RELAIS_TIME_ZONE)} ·{" "}
            {plural(session.sendCount, "envoi", "envois")}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setClosing(true)}>
          Fermer la session
        </Button>
      </div>

      {session.suspended ? (
        <Notice variant="accent" title="Session suspendue">
          <p className="m-0">
            Trop de codes faux ont été saisis sur ce poste : plus aucun enfant n&apos;y entre. Allez
            voir ce qui se passe, puis reprenez la session.
          </p>
          <Button
            className="mt-2"
            size="sm"
            loading={busy === "resume"}
            onClick={() => void act("resume", "/resume", "La session a repris")}
          >
            Reprendre la session
          </Button>
        </Notice>
      ) : null}

      <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0">
        {session.children.map((child) => (
          <li key={child.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <Avatar size={36} tone={child.avatarTone} initials={child.initials} />
            <span className="min-w-0 flex-1 text-14 font-semibold">{child.name}</span>
            {child.locked ? (
              <>
                <Chip variant="danger">Bloqué</Chip>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === child.id}
                  onClick={() =>
                    void act(
                      child.id,
                      `/children/${encodeURIComponent(child.id)}/unlock`,
                      `${child.name} peut de nouveau se connecter`,
                    )
                  }
                >
                  Débloquer
                </Button>
              </>
            ) : child.lastLoginAt ? (
              <Chip variant="success">
                Connexion à {formatHour(child.lastLoginAt, RELAIS_TIME_ZONE)}
              </Chip>
            ) : (
              <Chip>Pas encore connecté</Chip>
            )}
          </li>
        ))}
      </ul>

      {onDevice ? (
        // Un relais revenu sur le poste ne doit pas y rester connecté devant les enfants.
        <SignOutForm action="/deconnexion?vers=poste">
          <Button type="submit" variant="primary">
            Rendre le poste aux élèves
          </Button>
          <p className="m-0 mt-1.5 text-13 text-muted">
            Vous serez déconnecté et les enfants retrouveront leur écran.
          </p>
        </SignOutForm>
      ) : null}

      <Dialog
        open={closing}
        onOpenChange={setClosing}
        title="Fermer la session ?"
        description="Les enfants encore connectés reviendront à l'écran de connexion et ne pourront plus entrer."
        footer={
          <>
            <Button variant="secondary" onClick={() => setClosing(false)}>
              Annuler
            </Button>
            <Button
              loading={busy === "close"}
              onClick={() =>
                void act("close", "/close", "La session est fermée").finally(() =>
                  setClosing(false),
                )
              }
            >
              Fermer la session
            </Button>
          </>
        }
      />
    </section>
  );
}

type FormState = {
  plannedId: string | null;
  childIds: ReadonlySet<string>;
  duration: ClassSessionDuration;
  rights: ClassSessionRights;
};

function stateFrom(planned: PlannedClassSession | undefined): FormState {
  return planned
    ? {
        plannedId: planned.id,
        childIds: new Set(planned.childIds),
        duration: planned.durationMinutes,
        rights: planned.rights,
      }
    : {
        plannedId: null,
        childIds: new Set(),
        duration: DEFAULT_CLASS_SESSION_DURATION,
        rights: DEFAULT_CLASS_SESSION_RIGHTS,
      };
}

const SEGMENTS = classSessionDurations.map((minutes) => ({
  value: String(minutes),
  label: classSessionDurationLabel(minutes),
}));

/** Formulaire d'ouverture et sa colonne ; la session planifiée la plus proche le préremplit. */
function OpenSessionPanel({ data, plannedId }: { data: RelaisSessions; plannedId: string | null }) {
  const { items: pending } = useOutbox();
  const [planned, setPlanned] = useState(data.planned);
  const [form, setForm] = useState<FormState>(() =>
    stateFrom(planned.find((session) => session.id === plannedId) ?? planned[0]),
  );
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [planning, setPlanning] = useState(false);
  // L'heure affichée suit l'horloge de l'API, avancée du temps passé sur la page.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - start), 30_000);
    return () => clearInterval(tick);
  }, []);

  const eligible = data.eligible;
  const selectable = useMemo(
    () => new Set(eligible.filter((child) => child.hasCode).map((child) => child.id)),
    [eligible],
  );
  const selected = [...form.childIds].filter((id) => selectable.has(id));
  const count = selected.length;
  const noRight = !classSessionRightKeys.some((key) => form.rights[key]);
  const closesAt = new Date(Date.parse(data.now) + elapsed + form.duration * 60_000);

  function toggleChild(id: string) {
    setForm((current) => {
      const childIds = new Set(current.childIds);
      if (childIds.has(id)) {
        childIds.delete(id);
      } else if (childIds.size < CLASS_SESSION_MAX_CHILDREN) {
        childIds.add(id);
      }
      return { ...current, childIds };
    });
  }

  async function open() {
    setConfirming(false);
    setOpening(true);
    setError(null);
    try {
      await apiFetch(`${SESSIONS_PATH}/open`, openedClassSessionSchema, {
        method: "POST",
        body: {
          childIds: selected,
          durationMinutes: form.duration,
          rights: form.rights,
          ...(form.plannedId ? { plannedSessionId: form.plannedId } : {}),
        },
      });
      // Rien de l'espace relais ne reste sur ce poste : caches, file d'attente, service worker.
      await purgeOfflineData();
      window.location.assign(ELEVE_HOME);
    } catch (caught) {
      setError(errorMessage(caught));
      setOpening(false);
    }
  }

  const blockedByOutbox = pending.length > 0;
  const disabled = count === 0 || noRight || blockedByOutbox;

  return (
    <div className={LAYOUT}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) {
            return;
          }
          if (isPhone()) {
            setConfirming(true);
          } else {
            void open();
          }
        }}
        className="flex min-w-0 flex-col gap-5 rounded-16 border border-line bg-white p-6 max-sm:p-4"
      >
        <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 p-0 text-15 font-bold">
            Enfants autorisés · {plural(count, "sélectionné", "sélectionnés")}
          </legend>
          {form.plannedId ? (
            <p className="m-0 text-13 text-muted">
              Enfants de la session planifiée.{" "}
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-13 font-semibold text-brand-700 underline"
                onClick={() => setForm(stateFrom(undefined))}
              >
                Repartir de zéro
              </button>
            </p>
          ) : null}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {eligible.map((child) => {
              const checked = form.childIds.has(child.id) && child.hasCode;
              return (
                <label
                  key={child.id}
                  className={cn(
                    "flex min-w-0 items-center gap-2.5 rounded-12 border px-3 py-2.5 text-14 font-semibold",
                    checked ? "border-brand-700 bg-brand-100" : "border-line",
                    child.hasCode ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-brand-700"
                    checked={checked}
                    disabled={!child.hasCode}
                    onChange={() => toggleChild(child.id)}
                  />
                  <Avatar size={36} tone={child.avatarTone} initials={child.initials} />
                  <span className="min-w-0">
                    {child.name}
                    {!child.hasSponsor ? (
                      <span className="text-12 font-medium text-muted"> · sans parrain</span>
                    ) : null}
                    {!child.hasCode ? (
                      <span className="text-12 font-medium text-muted"> · pas de code image</span>
                    ) : null}
                    {child.locked ? (
                      <span className="text-12 font-medium text-danger-600"> · bloqué</span>
                    ) : null}
                    {!child.consentMedia ? (
                      <span className="text-12 font-medium text-muted"> · sans photo ni vidéo</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <span id="duree" className="text-15 font-bold">
            Durée
          </span>
          <SegmentedControl
            aria-labelledby="duree"
            options={SEGMENTS}
            value={String(form.duration)}
            onValueChange={(value) =>
              setForm((current) => ({
                ...current,
                duration: Number(value) as ClassSessionDuration,
              }))
            }
          />
        </div>

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 p-0 text-15 font-bold">Ce que les enfants peuvent faire</legend>
          {classSessionRightKeys.map((key) => (
            <Checkbox
              key={key}
              label={classSessionRightLabels[key]}
              checked={form.rights[key]}
              onChange={(event) => {
                const { checked } = event.target;
                setForm((current) => ({
                  ...current,
                  rights: { ...current.rights, [key]: checked },
                }));
              }}
            />
          ))}
        </fieldset>

        {blockedByOutbox ? (
          <Notice variant="accent" role="alert" title="Des envois attendent encore le réseau">
            {plural(pending.length, "envoi attend", "envois attendent")} sur ce poste. Ils seraient
            effacés à l&apos;ouverture : attendez qu&apos;ils partent, ou retirez-les depuis
            l&apos;accueil.
          </Notice>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <Button
            type="submit"
            size="xl"
            disabled={disabled}
            loading={opening}
            leftIcon={<LockIcon size={18} />}
            className="max-sm:w-full"
          >
            Ouvrir la session sur ce poste
          </Button>
          <Button
            variant="secondary"
            size="xl"
            disabled={count === 0 || noRight}
            onClick={() => setPlanning(true)}
            className="max-sm:w-full"
          >
            Planifier
          </Button>
          <p className="m-0 w-full text-13 text-muted">
            Fermeture automatique à {formatHour(closesAt, RELAIS_TIME_ZONE)}. Vous serez déconnecté
            de ce poste pendant la session.
          </p>
        </div>
      </form>
      <aside aria-label="Informations" className="flex min-w-0 flex-col gap-4">
        <PlannedCard
          planned={planned}
          activeId={form.plannedId}
          onUse={(session) => setForm(stateFrom(session))}
          onRemoved={(id) => {
            setPlanned((current) => current.filter((session) => session.id !== id));
            setForm((current) => (current.plannedId === id ? stateFrom(undefined) : current));
          }}
        />
        <SecurityCard />
        <RecentCard recent={data.recent} />
      </aside>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Ce téléphone devient le poste élève"
        description="Vous serez déconnecté de ce téléphone : les enfants s'y connecteront pendant la session."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button onClick={() => void open()}>Ouvrir la session</Button>
          </>
        }
      />
      <PlanDialog
        open={planning}
        onOpenChange={setPlanning}
        form={{ ...form, childIds: new Set(selected) }}
        onPlanned={(session) => {
          setPlanned((current) =>
            [...current, session].sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt)),
          );
          setForm(stateFrom(session));
        }}
      />
    </div>
  );
}

/** Choix de la date et de l'heure d'une session planifiée (heure de Lomé). */
function PlanDialog({
  open,
  onOpenChange,
  form,
  onPlanned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: FormState;
  onPlanned: (session: PlannedClassSession) => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("15:15");
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
      const { data } = await apiFetch(SESSIONS_PATH, plannedClassSessionSchema, {
        method: "POST",
        body: {
          childIds: [...form.childIds],
          durationMinutes: form.duration,
          rights: form.rights,
          // Lomé est à UTC toute l'année.
          scheduledAt: `${date}T${time}:00Z`,
        },
      });
      onPlanned(data);
      onOpenChange(false);
      toast("La session est planifiée");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Planifier la session"
      description={`${plural(form.childIds.size, "enfant", "enfants")} · ${classSessionDurationLabel(form.duration)}. Vous l'ouvrirez le jour venu, sur le poste de l'école.`}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Date">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </FormField>
          <FormField label="Heure à Lomé">
            <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </FormField>
        </div>
        {error ? (
          <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" loading={saving}>
            Planifier
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** RW-Session : une session ouverte se suit, sinon le formulaire permet d'en ouvrir une. */
export function ClassSessionsView({
  data,
  plannedId,
  onDevice,
}: {
  data: RelaisSessions;
  plannedId: string | null;
  onDevice: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-1 max-md:hidden">
        <h1 className="m-0 text-30 font-extrabold">
          {data.current ? "Session élève en cours" : "Ouvrir une session élève"}
        </h1>
        <p className="m-0 text-15 text-muted">
          Sur l&apos;ordinateur de l&apos;école. Les enfants ne peuvent se connecter que pendant la
          session, sur ce poste.
        </p>
      </div>
      <p className="m-0 text-15 text-muted md:hidden">
        Les enfants ne peuvent se connecter que pendant la session, sur ce poste.
      </p>
      {data.current ? (
        <div className={LAYOUT}>
          <CurrentSessionCard session={data.current} onDevice={onDevice} />
          <aside aria-label="Informations" className="flex min-w-0 flex-col gap-4">
            <SecurityCard />
            <RecentCard recent={data.recent} />
          </aside>
        </div>
      ) : (
        <OpenSessionPanel data={data} plannedId={plannedId} />
      )}
    </>
  );
}
