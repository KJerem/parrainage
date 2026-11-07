"use client";

import {
  alertTypeLabels,
  detectAlerts,
  type ManualFlag,
  manualFlagLabels,
  manualFlags,
  maskAlerts,
  moderationDecisionResultSchema,
  type ModerationDetail,
  moderationFlagResultSchema,
  moderationReasonLabels,
  moderationReasons,
  type ModerationReason,
  suggestedReason,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { MediaRefTile } from "@/components/parrain/media";
import {
  Button,
  Checkbox,
  Chip,
  CloseIcon,
  Dialog,
  FormField,
  Notice,
  Select,
  Textarea,
  toast,
} from "@/components/ui";
import { ApiRequestError, apiFetch, NETWORK_ERROR_MESSAGE } from "@/lib/api-client";
import { moderationAlert } from "./moderation-labels";

type Decision =
  | { decision: "APPROVE" }
  | { decision: "HOLD"; reason: ModerationReason }
  | { decision: "MASK"; reason: ModerationReason; redactedBody: string; removedMediaIds: string[] };

const errorMessage = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : NETWORK_ERROR_MESSAGE;

const successMessages: Readonly<Record<Decision["decision"], string>> = {
  APPROVE: "Message approuvé et transmis",
  MASK: "Version masquée transmise",
  HOLD: "Message retenu",
};

/** Motif et décisions de B-Moderation, puis passage automatique au message suivant. */
export function MessageReview({ detail }: { detail: ModerationDetail }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [reason, setReason] = useState<ModerationReason>(() =>
    suggestedReason(detail.alertTypes, detail.manualFlags),
  );
  const [sending, setSending] = useState<Decision["decision"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [masking, setMasking] = useState(false);
  const [confirmingApproval, setConfirmingApproval] = useState(false);

  const alert = moderationAlert(detail.alertTypes, detail.manualFlags);
  const recipient = detail.authorKind === "child" ? "relais" : "parrain";

  async function decide(decision: Decision) {
    setSending(decision.decision);
    setError(null);
    try {
      const { data } = await apiFetch(
        `/api/moderation/messages/${encodeURIComponent(detail.id)}/decision`,
        moderationDecisionResultSchema,
        { method: "POST", body: decision },
      );
      toast(successMessages[decision.decision]);
      startTransition(() => {
        router.push(
          data.nextId
            ? `/bureau/moderation/${encodeURIComponent(data.nextId)}`
            : "/bureau/moderation",
        );
        // La pastille de la navigation et la file changent aussi.
        router.refresh();
      });
    } catch (caught) {
      setError(errorMessage(caught));
      setSending(null);
      if (caught instanceof ApiRequestError && caught.status === 409) {
        setMasking(false);
        setConfirmingApproval(false);
        startTransition(() => router.refresh());
      }
    }
  }

  const busy = sending !== null;
  return (
    <>
      <FormField label={`Motif (envoyé au ${recipient} si retenu)`} className="max-w-105">
        <Select
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value as ModerationReason)}
        >
          {moderationReasons.map((value) => (
            <option key={value} value={value}>
              {moderationReasonLabels[value]}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="flex flex-wrap gap-2.5 max-sm:flex-col max-sm:*:w-full">
        <Button size="xl" disabled={busy} onClick={() => setMasking(true)}>
          Masquer le passage et transmettre
        </Button>
        <Button
          size="xl"
          variant="secondary"
          disabled={busy}
          loading={sending === "HOLD"}
          onClick={() => void decide({ decision: "HOLD", reason })}
        >
          Retenir et prévenir le {recipient}
        </Button>
        <Button
          size="xl"
          variant="secondary"
          disabled={busy}
          loading={sending === "APPROVE" && !confirmingApproval}
          onClick={() => {
            if (alert.flagged) {
              setConfirmingApproval(true);
            } else {
              void decide({ decision: "APPROVE" });
            }
          }}
        >
          Approuver tel quel
        </Button>
      </div>
      {error && !masking ? (
        <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
          {error}
        </p>
      ) : null}

      <FlagControl messageId={detail.id} initial={detail.manualFlags} />

      {masking ? (
        <MaskDialog
          detail={detail}
          reason={reason}
          sending={sending === "MASK"}
          error={error}
          onClose={() => {
            setMasking(false);
            setError(null);
          }}
          onSubmit={(redactedBody, removedMediaIds) =>
            void decide({ decision: "MASK", reason, redactedBody, removedMediaIds })
          }
        />
      ) : null}

      <Dialog
        open={confirmingApproval}
        onOpenChange={setConfirmingApproval}
        title="Approuver malgré l'alerte ?"
        description={`${alert.label} : le message sera transmis tel quel à ${detail.to}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingApproval(false)}>
              Annuler
            </Button>
            <Button
              loading={sending === "APPROVE"}
              onClick={() => void decide({ decision: "APPROVE" })}
            >
              Approuver tel quel
            </Button>
          </>
        }
      />
    </>
  );
}

/** Version transmise : le texte proposé se corrige, les pièces jointes se retirent. */
function MaskDialog({
  detail,
  reason,
  sending,
  error,
  onClose,
  onSubmit,
}: {
  detail: ModerationDetail;
  reason: ModerationReason;
  sending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (redactedBody: string, removedMediaIds: string[]) => void;
}) {
  const [text, setText] = useState(() => maskAlerts(detail.body, detail.spans));
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const remaining = useMemo(() => detectAlerts(text).types, [text]);
  const hasText = detail.body.trim() !== "";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Vérifier la version transmise"
      description={`Motif envoyé au ${detail.authorKind === "child" ? "relais" : "parrain"} : ${moderationReasonLabels[reason]}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={sending} onClick={() => onSubmit(text, [...removed])}>
            Transmettre cette version
          </Button>
        </>
      }
    >
      {hasText ? (
        <FormField label="Texte transmis">
          <Textarea rows={6} value={text} onChange={(event) => setText(event.target.value)} />
        </FormField>
      ) : null}
      {remaining.length > 0 ? (
        <Notice size="sm">
          Ce texte semble encore contenir :{" "}
          {remaining.map((type) => alertTypeLabels[type].toLowerCase()).join(", ")}.
        </Notice>
      ) : null}
      {detail.attachments.length > 0 ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-14 font-semibold">Pièces jointes à retirer</legend>
          {detail.attachments.map((media) => (
            <Checkbox
              key={media.id}
              label={media.label ?? "Pièce jointe"}
              checked={removed.has(media.id)}
              onChange={(event) => {
                const next = new Set(removed);
                if (event.target.checked) {
                  next.add(media.id);
                } else {
                  next.delete(media.id);
                }
                setRemoved(next);
              }}
            />
          ))}
        </fieldset>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

/** Signalements manuels (« Visage d'un autre enfant »), que le détecteur ne peut pas voir. */
function FlagControl({
  messageId,
  initial,
}: {
  messageId: string;
  initial: readonly ManualFlag[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [flags, setFlags] = useState<readonly ManualFlag[]>(initial);
  const available = manualFlags.filter((flag) => !flags.includes(flag));
  const [choice, setChoice] = useState<ManualFlag | "">("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(flag: ManualFlag, active: boolean) {
    setPending(true);
    setError(null);
    try {
      const { data } = await apiFetch(
        `/api/moderation/messages/${encodeURIComponent(messageId)}/flag`,
        moderationFlagResultSchema,
        { method: "POST", body: { flag, active } },
      );
      setFlags(data.manualFlags);
      setChoice("");
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
      <div className="flex flex-wrap items-end gap-2.5">
        <FormField label="Signalement" size="sm" className="min-w-55 flex-1 sm:max-w-80">
          <Select
            size="sm"
            value={choice}
            disabled={pending || available.length === 0}
            onChange={(event) => setChoice(event.target.value as ManualFlag | "")}
          >
            <option value="">Choisir…</option>
            {available.map((flag) => (
              <option key={flag} value={flag}>
                {manualFlagLabels[flag]}
              </option>
            ))}
          </Select>
        </FormField>
        <Button
          variant="secondary"
          disabled={choice === "" || pending}
          onClick={() => {
            if (choice !== "") void update(choice, true);
          }}
        >
          Signaler
        </Button>
      </div>
      {flags.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {flags.map((flag) => (
            <li key={flag}>
              <Chip variant="warning">
                {manualFlagLabels[flag]}
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Retirer le signalement : ${manualFlagLabels[flag]}`}
                  className="-mr-1 inline-flex cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0.5 text-current pointer-coarse:min-h-6 pointer-coarse:min-w-6"
                  onClick={() => void update(flag, false)}
                >
                  <CloseIcon size={12} />
                </button>
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-13 font-semibold text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Pièces jointes du message : le bureau les voit avant de décider (consultation auditée). */
export function ReviewAttachments({ detail }: { detail: ModerationDetail }) {
  if (detail.attachments.length === 0) {
    return null;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
      {detail.attachments.map((media) => (
        <MediaRefTile key={media.id} media={media} />
      ))}
    </div>
  );
}
