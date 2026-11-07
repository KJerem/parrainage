"use client";

import {
  allowChildUploadResultSchema,
  formatAverageInput,
  formatRankInput,
  isResultEntered,
  type ParsedRank,
  parseAverage,
  parseRank,
  type RelaisResults,
  resultRowSchema,
  type ResultRow,
  resultStatusLabels,
  sendResultsResultSchema,
} from "@parrainage/contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button, Chip, CloseIcon, FormField, Input, Select, toast } from "@/components/ui";
import { ApiRequestError, apiFetch, NETWORK_ERROR_MESSAGE } from "@/lib/api-client";
import { BULLETIN_COMPRESSION } from "@/lib/upload";
import { useOutbox } from "./outbox-provider";
import { resultStatusVariant } from "./relais-labels";
import { useMediaUpload } from "./use-media-upload";

const AUTOSAVE_DELAY_MS = 800;
const MAX_BULLETIN_PAGES = 4;

const errorMessage = (caught: unknown) =>
  caught instanceof ApiRequestError ? caught.message : NETWORK_ERROR_MESSAGE;

type Draft = { average: string; rank: string; appreciation: string };

type RowState = {
  row: ResultRow;
  draft: Draft;
  /** Frappe pas encore mise en file. */
  dirty: boolean;
  error: string | null;
};

const draftOf = (row: ResultRow): Draft => ({
  average: formatAverageInput(row.averageX100),
  rank: formatRankInput({ rank: row.rank, classSize: row.classSize }),
  appreciation: row.appreciation ?? "",
});

/** Le brouillon d'une ligne, prêt à partir, ou l'erreur à montrer. */
function parseDraft(
  draft: Draft,
): { averageX100: number | null; parsedRank: ParsedRank; appreciation: string } | string {
  const averageX100 = parseAverage(draft.average);
  if (averageX100 === undefined) {
    return "Moyenne attendue entre 0 et 20, par exemple 13,4";
  }
  const parsedRank = parseRank(draft.rank);
  if (parsedRank === undefined) {
    return "Rang attendu : 5, ou 5 / 48";
  }
  return { averageX100, parsedRank, appreciation: draft.appreciation };
}

/**
 * RW-Resultats : une ligne par enfant, enregistrée d'elle-même 800 ms après la dernière frappe. Tout
 * passe par la file d'attente, avec ou sans réseau : les saisies arrivent dans l'ordre, et aucune ne
 * se perd si le réseau manque. Sous md, des cartes remplacent le tableau, sur le même état.
 */
export function ResultsSheet({ sheet }: { sheet: RelaisResults }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { items, online, saveResult, flush: flushOutbox, subscribe } = useOutbox();
  const [rows, setRows] = useState<readonly RowState[]>(() =>
    sheet.rows.map((row) => ({ row, draft: draftOf(row), dirty: false, error: null })),
  );
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Heure de la dernière frappe par ligne : l'API refuse une donnée plus ancienne. */
  const editedAt = useRef(new Map<string, string>());

  const periodId = sheet.periodId;
  const schoolId = sheet.schoolId;

  const update = useCallback((childId: string, change: (state: RowState) => RowState) => {
    setRows((current) => {
      const next = current.map((state) => (state.row.childId === childId ? change(state) : state));
      rowsRef.current = next;
      return next;
    });
  }, []);

  /** Met la ligne en file ; elle affiche tout de suite l'état qu'elle aura une fois enregistrée. */
  const queueRow = useCallback(
    async (childId: string): Promise<void> => {
      const state = rowsRef.current.find((value) => value.row.childId === childId);
      if (!state?.dirty || !periodId) {
        return;
      }
      const parsed = parseDraft(state.draft);
      if (typeof parsed === "string") {
        update(childId, (value) => ({ ...value, error: parsed }));
        return;
      }
      const appreciation = parsed.appreciation.trim() || null;
      const hasData =
        parsed.averageX100 !== null || parsed.parsedRank.rank !== null || appreciation !== null;
      update(childId, (value) => ({
        ...value,
        dirty: false,
        error: null,
        row: {
          ...value.row,
          status: value.row.status === "SENT" ? "SENT" : hasData ? "DRAFT" : "TO_ENTER",
        },
      }));
      await saveResult(periodId, childId, {
        averageX100: parsed.averageX100,
        rank: parsed.parsedRank.rank,
        classSize: parsed.parsedRank.classSize,
        appreciation,
        clientUpdatedAt: editedAt.current.get(childId) ?? new Date().toISOString(),
      });
    },
    [periodId, saveResult, update],
  );

  // Le résultat de chaque envoi, y compris de ceux partis au retour du réseau.
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "result-saved" && event.periodId === periodId) {
          update(event.childId, (value) => ({ ...value, row: event.row }));
        }
        if (event.type === "result-rejected" && event.periodId === periodId) {
          update(event.childId, (value) => ({ ...value, error: event.message }));
        }
      }),
    [periodId, subscribe, update],
  );

  function change(childId: string, field: keyof Draft, value: string) {
    editedAt.current.set(childId, new Date().toISOString());
    update(childId, (state) => ({
      ...state,
      draft: { ...state.draft, [field]: value },
      dirty: true,
      error: null,
    }));
    const previous = timers.current.get(childId);
    if (previous) {
      clearTimeout(previous);
    }
    timers.current.set(
      childId,
      setTimeout(() => {
        timers.current.delete(childId);
        void queueRow(childId);
      }, AUTOSAVE_DELAY_MS),
    );
  }

  /** Met tout de suite en file ce qui attend encore (avant un envoi, en quittant la page). */
  const flush = useCallback(async () => {
    for (const timer of timers.current.values()) {
      clearTimeout(timer);
    }
    timers.current.clear();
    await Promise.all(rowsRef.current.filter((s) => s.dirty).map((s) => queueRow(s.row.childId)));
    await flushOutbox();
  }, [flushOutbox, queueRow]);

  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  function navigate(param: "periode" | "ecole", value: string) {
    void flush();
    const params = new URLSearchParams(searchParams.toString());
    params.set(param, value);
    router.push(`/relais/resultats?${params.toString()}`);
  }

  async function sendToParrains() {
    if (!periodId || !schoolId) {
      return;
    }
    setSending(true);
    try {
      await flush();
      // Une ligne fausse n'est pas enregistrée : c'est son ancienne valeur qui partirait.
      const invalid = rowsRef.current.some(
        (state) => typeof parseDraft(state.draft) === "string" || state.error !== null,
      );
      if (invalid) {
        toast("Corrigez d'abord les lignes signalées");
        return;
      }
      const { data } = await apiFetch(
        `/api/relais/results/${encodeURIComponent(periodId)}/send`,
        sendResultsResultSchema,
        { method: "POST", body: { schoolId } },
      );
      toast(
        data.sent === 0
          ? "Aucun brouillon avec une moyenne à envoyer"
          : `${data.sent} ${data.sent > 1 ? "résultats envoyés" : "résultat envoyé"} aux parrains`,
      );
      setRows((current) =>
        current.map((state) =>
          state.row.status === "DRAFT" && state.row.averageX100 !== null
            ? { ...state, row: { ...state.row, status: "SENT" } }
            : state,
        ),
      );
      startTransition(() => router.refresh());
    } catch (caught) {
      toast(errorMessage(caught));
    } finally {
      setSending(false);
    }
  }

  const eligible = rows.filter((state) => state.row.bulletins.length === 0);
  const allAllowed = eligible.length > 0 && eligible.every((state) => state.row.allowChildUpload);

  async function toggleChildUpload() {
    if (!periodId || !schoolId) {
      return;
    }
    setToggling(true);
    const allowed = !allAllowed;
    try {
      const { data } = await apiFetch(
        `/api/relais/results/${encodeURIComponent(periodId)}/child-upload`,
        allowChildUploadResultSchema,
        { method: "POST", body: { schoolId, allowed } },
      );
      setRows((current) =>
        current.map((state) =>
          state.row.bulletins.length === 0
            ? { ...state, row: { ...state.row, allowChildUpload: allowed } }
            : state,
        ),
      );
      toast(
        allowed
          ? `${data.count} ${data.count > 1 ? "enfants pourront" : "enfant pourra"} envoyer le bulletin à la prochaine session`
          : "Les enfants n'enverront plus leur bulletin",
      );
    } catch (caught) {
      toast(errorMessage(caught));
    } finally {
      setToggling(false);
    }
  }

  const setRow = (row: ResultRow) => update(row.childId, (state) => ({ ...state, row }));
  const entered = rows.filter((state) => isResultEntered(state.row)).length;
  const waiting =
    items.some((item) => item.type === "result") ||
    rows.some((state) => state.dirty && !state.error);
  const hasError = rows.some((state) => state.error !== null);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 hidden text-30 font-extrabold md:block">Saisir des résultats</h1>
          <p className="m-0 mt-1 text-15 text-muted">
            Saisie groupée : une ligne par enfant. Les parrains sont prévenus à l&apos;envoi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 max-sm:w-full max-sm:flex-col">
          <FormField label="Période" size="sm">
            <Select
              value={periodId ?? ""}
              onChange={(event) => navigate("periode", event.target.value)}
            >
              {sheet.periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="École" size="sm">
            <Select
              value={schoolId ?? ""}
              onChange={(event) => navigate("ecole", event.target.value)}
            >
              {sheet.schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.shortName} ({school.childCount}{" "}
                  {school.childCount > 1 ? "enfants" : "enfant"})
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </div>

      <section
        aria-label="Tableau de saisie"
        className="min-w-0 overflow-hidden rounded-16 border border-line bg-white"
      >
        {rows.length === 0 ? (
          <p className="m-0 p-5 text-15 text-muted">
            Aucun enfant à afficher : ajoutez un enfant à cette école pour saisir ses résultats.
          </p>
        ) : (
          <>
            <div
              className="hidden overflow-x-auto md:block"
              role="region"
              aria-label="Résultats par enfant"
              tabIndex={0}
            >
              <table className="w-full min-w-[880px] border-collapse text-14">
                <thead>
                  <tr className="text-left text-13 text-muted">
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      Enfant
                    </th>
                    <th scope="col" className="w-[110px] px-3 py-2.5 font-semibold">
                      Moyenne /20
                    </th>
                    <th scope="col" className="w-[100px] px-3 py-2.5 font-semibold">
                      Rang
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      Appréciation de l&apos;enseignant
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      Bulletin
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      État
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((state) => (
                    <TableRow
                      key={state.row.childId}
                      state={state}
                      periodId={periodId}
                      onChange={change}
                      onRow={setRow}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="m-0 flex list-none flex-col p-0 md:hidden">
              {rows.map((state) => (
                <CardRow
                  key={state.row.childId}
                  state={state}
                  periodId={periodId}
                  onChange={change}
                  onRow={setRow}
                />
              ))}
            </ul>
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft p-4">
          <span role="status" className="text-14 text-ink-soft">
            {entered} / {rows.length} saisis ·{" "}
            {hasError
              ? "une ligne n'est pas enregistrée"
              : waiting
                ? online
                  ? "enregistrement en cours…"
                  : "hors ligne, saisies gardées sur ce poste"
                : "enregistrement automatique, même hors ligne"}
          </span>
          <div className="flex flex-wrap gap-2.5 max-sm:w-full max-sm:flex-col max-sm:*:w-full">
            <Button
              variant="secondary"
              loading={toggling}
              disabled={eligible.length === 0 || !online}
              onClick={() => void toggleChildUpload()}
            >
              {allAllowed
                ? "Ne plus laisser l'enfant envoyer son bulletin"
                : "Laisser l'enfant envoyer son bulletin"}
            </Button>
            <Button
              className="font-bold"
              loading={sending}
              disabled={!online}
              onClick={() => void sendToParrains()}
            >
              Envoyer aux parrains
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

type RowProps = {
  state: RowState;
  periodId: string | null;
  onChange: (childId: string, field: keyof Draft, value: string) => void;
  onRow: (row: ResultRow) => void;
};

function TableRow({ state, periodId, onChange, onRow }: RowProps) {
  const { row, draft, error } = state;
  const firstName = row.name.split(" ")[0];
  return (
    <tr className="border-t border-line-soft align-middle">
      <td className="px-3 py-2.5">
        <strong>{row.name}</strong>
        <div className="text-12 text-muted">{row.className}</div>
      </td>
      <td className="px-3 py-2.5">
        <Input
          size="sm"
          aria-label={`Moyenne ${firstName}`}
          aria-invalid={error?.startsWith("Moyenne") ? true : undefined}
          inputMode="decimal"
          placeholder="—"
          value={draft.average}
          onChange={(event) => onChange(row.childId, "average", event.target.value)}
        />
      </td>
      <td className="px-3 py-2.5">
        <Input
          size="sm"
          aria-label={`Rang ${firstName}`}
          aria-invalid={error?.startsWith("Rang") ? true : undefined}
          placeholder="—"
          value={draft.rank}
          onChange={(event) => onChange(row.childId, "rank", event.target.value)}
        />
      </td>
      <td className="px-3 py-2.5">
        <Input
          size="sm"
          aria-label={`Appréciation ${firstName}`}
          placeholder="À recopier du bulletin"
          value={draft.appreciation}
          onChange={(event) => onChange(row.childId, "appreciation", event.target.value)}
        />
        {error ? (
          <p role="alert" className="m-0 mt-1 text-12 font-semibold text-danger-600">
            {error}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-2.5">
        <BulletinCell row={row} periodId={periodId} onRow={onRow} />
      </td>
      <td className="px-3 py-2.5">
        <Chip variant={resultStatusVariant[row.status]}>{resultStatusLabels[row.status]}</Chip>
      </td>
    </tr>
  );
}

function CardRow({ state, periodId, onChange, onRow }: RowProps) {
  const { row, draft, error } = state;
  const firstName = row.name.split(" ")[0];
  return (
    <li className="flex flex-col gap-3 border-t border-line-soft p-4 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <div>
          <strong className="text-15">{row.name}</strong>
          <div className="text-12 text-muted">{row.className}</div>
        </div>
        <Chip variant={resultStatusVariant[row.status]}>{resultStatusLabels[row.status]}</Chip>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={`Moyenne ${firstName} /20`} size="sm">
          <Input
            size="sm"
            inputMode="decimal"
            placeholder="—"
            value={draft.average}
            onChange={(event) => onChange(row.childId, "average", event.target.value)}
          />
        </FormField>
        <FormField label={`Rang ${firstName}`} size="sm">
          <Input
            size="sm"
            placeholder="—"
            value={draft.rank}
            onChange={(event) => onChange(row.childId, "rank", event.target.value)}
          />
        </FormField>
      </div>
      <FormField label={`Appréciation ${firstName}`} size="sm">
        <Input
          size="sm"
          placeholder="À recopier du bulletin"
          value={draft.appreciation}
          onChange={(event) => onChange(row.childId, "appreciation", event.target.value)}
        />
      </FormField>
      {error ? (
        <p role="alert" className="m-0 text-13 font-semibold text-danger-600">
          {error}
        </p>
      ) : null}
      <BulletinCell row={row} periodId={periodId} onRow={onRow} />
    </li>
  );
}

/** Photo du bulletin : la caméra sur un téléphone, un fichier sur un ordinateur. */
function BulletinCell({
  row,
  periodId,
  onRow,
}: {
  row: ResultRow;
  periodId: string | null;
  onRow: (row: ResultRow) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMediaUpload("result", BULLETIN_COMPRESSION);
  const { online } = useOutbox();
  const [error, setError] = useState<string | null>(null);
  const base = periodId
    ? `/api/relais/results/${encodeURIComponent(periodId)}/${encodeURIComponent(row.childId)}/bulletin`
    : null;

  async function attach(file: File) {
    if (!base) {
      return;
    }
    setError(null);
    const media = await upload.upload(file);
    if (!media) {
      return;
    }
    try {
      const { data } = await apiFetch(base, resultRowSchema, {
        method: "POST",
        body: { mediaId: media.id },
      });
      onRow(data);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function remove(mediaId: string) {
    if (!base) {
      return;
    }
    setError(null);
    try {
      const { data } = await apiFetch(`${base}/${encodeURIComponent(mediaId)}`, resultRowSchema, {
        method: "DELETE",
      });
      onRow(data);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const pages = row.bulletins.length;
  const shownError = error ?? upload.error;
  return (
    <div className="flex flex-col items-start gap-1">
      {pages > 0 ? (
        <span className="inline-flex items-center gap-1 text-13 font-semibold text-brand-700">
          Photo jointe{pages > 1 ? ` (${pages})` : ""}
          {row.removableBulletinIds.map((mediaId) => (
            <button
              key={mediaId}
              type="button"
              aria-label={`Retirer une page du bulletin : ${row.name}`}
              onClick={() => void remove(mediaId)}
              className="flex size-6 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-current"
            >
              <CloseIcon size={12} />
            </button>
          ))}
        </span>
      ) : null}
      {pages < MAX_BULLETIN_PAGES ? (
        <Button
          size="sm"
          variant="secondary"
          loading={upload.uploading}
          disabled={!online}
          aria-label={`${pages > 0 ? "Ajouter une page au bulletin" : "Photographier le bulletin"} : ${row.name}`}
          onClick={() => fileRef.current?.click()}
        >
          {pages > 0 ? "Ajouter une page" : "Photographier"}
        </Button>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid={`bulletin-${row.childId}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void attach(file);
          }
        }}
      />
      {pages === 0 && row.allowChildUpload ? (
        <span className="text-12 text-muted">L&apos;enfant peut l&apos;envoyer</span>
      ) : null}
      {shownError ? (
        <p role="alert" className="m-0 text-12 font-semibold text-danger-600">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}
