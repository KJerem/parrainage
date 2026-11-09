"use client";

import {
  createDonationSchema,
  DEBIT_DAY_MAX,
  DONATION_NOTE_MAX_LENGTH,
  donationPresetsCents,
  monthlyAmountChangeSchema,
  monthlyAmountPresetsCents,
  type MonthlyPaymentMethod,
  monthlyPaymentMethods,
  type ParrainPayments,
  paymentHistoryItemSchema,
  paymentMethodSettingsSchema,
  updateMonthlyAmountSchema,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, RadioCard, Select } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiRequestError, newIdempotencyKey } from "@/lib/api-client";
import { formatEuros } from "@/lib/format";
import {
  childShortName,
  debitDayLabel,
  debitLine,
  monthlyChangedToast,
  paymentMethodLabels,
} from "./payment-labels";

type Filleul = ParrainPayments["monthly"]["filleuls"][number];

const OTHER = "autre";

const errorMessage = (caught: unknown) =>
  caught instanceof ApiRequestError
    ? (Object.values(caught.fieldErrors)[0]?.[0] ?? caught.message)
    : "Le service est momentanément indisponible. Réessayez dans un instant.";

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="m-0 rounded-12 bg-danger-100 px-3.5 py-3 text-14 font-semibold text-danger-600"
    >
      {children}
    </p>
  );
}

/** Choix du filleul, quand il y en a plusieurs. */
function FilleulChoice({
  filleuls,
  value,
  onChange,
  legend,
  detail,
}: {
  filleuls: readonly Filleul[];
  value: string;
  onChange: (childId: string) => void;
  legend: string;
  detail?: (filleul: Filleul) => string;
}) {
  if (filleuls.length < 2) {
    return null;
  }
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-14 font-semibold">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {filleuls.map((filleul) => (
          <RadioCard
            key={filleul.childId}
            name="filleul"
            checked={value === filleul.childId}
            onChange={() => onChange(filleul.childId)}
          >
            <span className="flex min-w-0 flex-col">
              <strong className="text-15">{childShortName(filleul)}</strong>
              {detail ? <span className="text-13 text-muted">{detail(filleul)}</span> : null}
            </span>
          </RadioCard>
        ))}
      </div>
    </fieldset>
  );
}

/** Montants proposés, ou un autre montant en euros. */
function AmountChoice({
  presets,
  choice,
  other,
  onChoice,
  onOther,
  legend,
}: {
  presets: readonly number[];
  choice: string;
  other: string;
  onChoice: (choice: string) => void;
  onOther: (other: string) => void;
  legend: string;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-14 font-semibold">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {presets.map((cents) => (
          <RadioCard
            key={cents}
            name="montant"
            checked={choice === String(cents)}
            onChange={() => onChoice(String(cents))}
            labelClassName="font-semibold"
          >
            {formatEuros(cents)}
          </RadioCard>
        ))}
        <RadioCard
          name="montant"
          checked={choice === OTHER}
          onChange={() => onChoice(OTHER)}
          labelClassName="font-semibold"
        >
          Autre
        </RadioCard>
      </div>
      {choice === OTHER ? (
        <FormField label="Autre montant, en euros">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={other}
            onChange={(event) => onOther(event.target.value)}
            className="max-w-[200px]"
          />
        </FormField>
      ) : null}
    </fieldset>
  );
}

const centsOf = (choice: string, other: string) =>
  choice === OTHER ? Math.round(Number(other.replace(",", ".")) * 100) : Number(choice);

const initialChoice = (presets: readonly number[], cents: number) =>
  presets.includes(cents)
    ? { choice: String(cents), other: "" }
    : { choice: OTHER, other: String(cents / 100) };

/** « Modifier ma mensualité » : par filleul, à partir du prochain prélèvement. */
export function MonthlyAmountButton({ data }: { data: ParrainPayments }) {
  const router = useRouter();
  const formId = useId();
  const { filleuls, nextDebitDate } = data.monthly;
  const [open, setOpen] = useState(false);
  const [childId, setChildId] = useState(filleuls[0]?.childId ?? "");
  const [choice, setChoice] = useState("");
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const filleul = filleuls.find((f) => f.childId === childId);

  if (filleuls.length === 0) {
    return null;
  }

  const select = (id: string) => {
    const current = filleuls.find((f) => f.childId === id);
    setChildId(id);
    const initial = initialChoice(monthlyAmountPresetsCents, current?.amountCents ?? 0);
    setChoice(initial.choice);
    setOther(initial.other);
    setError(null);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = centsOf(choice, other);
    const checked = updateMonthlyAmountSchema.shape.amountCents.safeParse(amountCents);
    if (!checked.success || !filleul) {
      setError(checked.error?.issues[0]?.message ?? "Choisissez un montant");
      return;
    }
    if (amountCents === filleul.amountCents) {
      setError(`C'est déjà la mensualité pour ${filleul.firstName} : choisissez un autre montant`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data: change } = await apiFetch(
        "/api/parrain/payments/monthly-amount",
        monthlyAmountChangeSchema,
        { method: "POST", body: { childId, amountCents } },
      );
      setOpen(false);
      toast(monthlyChangedToast(filleul.firstName, change.amountCents, change.effectivePeriodKey));
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          select(childId || filleuls[0]!.childId);
          setOpen(true);
        }}
      >
        Modifier ma mensualité
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Modifier ma mensualité"
        description={
          nextDebitDate
            ? `Le nouveau montant s'applique dès le prochain prélèvement, le ${debitDayLabel(nextDebitDate)}.`
            : "Le nouveau montant s'applique dès le prochain prélèvement."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form={formId} loading={saving}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          <FilleulChoice
            filleuls={filleuls}
            value={childId}
            onChange={select}
            legend="Pour quel filleul ?"
            detail={(f) => `${formatEuros(f.amountCents)} par mois`}
          />
          <AmountChoice
            presets={monthlyAmountPresetsCents}
            choice={choice}
            other={other}
            onChoice={setChoice}
            onOther={setOther}
            legend={
              filleuls.length > 1
                ? "Nouvelle mensualité"
                : `Nouvelle mensualité pour ${filleul?.firstName}`
            }
          />
          {error ? <ErrorLine>{error}</ErrorLine> : null}
        </form>
      </Dialog>
    </>
  );
}

const methodDetails: Record<MonthlyPaymentMethod, string> = {
  SEPA_DEBIT: "Prélevé chaque mois sur votre compte",
  CARD: "Débitée automatiquement chaque mois",
};

/** « Moyen de paiement » : prélèvement ou carte, et jour du prélèvement. Simulé. */
export function PaymentMethodButton({ data }: { data: ParrainPayments }) {
  const router = useRouter();
  const formId = useId();
  const current: MonthlyPaymentMethod = data.monthly.method === "CARD" ? "CARD" : "SEPA_DEBIT";
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<MonthlyPaymentMethod>(current);
  const [debitDay, setDebitDay] = useState(data.monthly.debitDay);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { data: saved } = await apiFetch(
        "/api/parrain/payments/method",
        paymentMethodSettingsSchema,
        {
          method: "PUT",
          body: { method, debitDay },
        },
      );
      setOpen(false);
      toast(`Enregistré : ${debitLine(saved.method, saved.debitDay).toLocaleLowerCase("fr-FR")}`);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setMethod(current);
          setDebitDay(data.monthly.debitDay);
          setError(null);
          setOpen(true);
        }}
      >
        Moyen de paiement
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Moyen de paiement"
        description="Paiement simulé : aucune coordonnée bancaire n'est demandée ni enregistrée."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form={formId} loading={saving}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-14 font-semibold">
              Vos mensualités sont payées par
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {monthlyPaymentMethods.map((value) => (
                <RadioCard
                  key={value}
                  name="moyen"
                  checked={method === value}
                  onChange={() => setMethod(value)}
                >
                  <span className="flex min-w-0 flex-col">
                    <strong className="text-15">{paymentMethodLabels[value]}</strong>
                    <span className="text-13 text-muted">{methodDetails[value]}</span>
                  </span>
                </RadioCard>
              ))}
            </div>
          </fieldset>
          <FormField label="Jour du prélèvement">
            <Select
              value={debitDay}
              onChange={(event) => setDebitDay(Number(event.target.value))}
              className="max-w-[240px]"
            >
              {Array.from({ length: DEBIT_DAY_MAX }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  Le {day === 1 ? "1er" : day} du mois
                </option>
              ))}
            </Select>
          </FormField>
          {error ? <ErrorLine>{error}</ErrorLine> : null}
        </form>
      </Dialog>
    </>
  );
}

/** « Faire un don » : un don ponctuel simulé par carte, en plus de la mensualité. */
export function DonationButton({ data }: { data: ParrainPayments }) {
  const router = useRouter();
  const formId = useId();
  const { filleuls } = data.monthly;
  const [open, setOpen] = useState(false);
  const [childId, setChildId] = useState(filleuls[0]?.childId ?? "");
  const [choice, setChoice] = useState(String(donationPresetsCents[1]));
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Une clé par don : un double envoi (réseau lent, double appui) ne crée qu'un don.
  const key = useRef<string | null>(null);

  if (filleuls.length === 0) {
    return null;
  }
  const amountCents = centsOf(choice, other);
  const filleul = filleuls.find((f) => f.childId === childId) ?? filleuls[0]!;

  async function submit(event: FormEvent) {
    event.preventDefault();
    key.current ??= newIdempotencyKey();
    const checked = createDonationSchema.safeParse({
      childId: filleul.childId,
      amountCents,
      note,
      idempotencyKey: key.current,
    });
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? "Choisissez un montant");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data: donation } = await apiFetch(
        "/api/parrain/payments/donations",
        paymentHistoryItemSchema,
        { method: "POST", body: checked.data },
      );
      setOpen(false);
      toast(
        `Merci ! Votre don de ${formatEuros(donation.amountCents)} pour ${filleul.firstName} est enregistré`,
      );
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          key.current = null;
          setChoice(String(donationPresetsCents[1]));
          setOther("");
          setNote("");
          setError(null);
          setOpen(true);
        }}
      >
        Faire un don
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Faire un don"
        description="Un don ponctuel, en plus de votre mensualité. Il figurera sur votre reçu fiscal."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form={formId} loading={saving}>
              {Number.isFinite(amountCents) && amountCents > 0
                ? `Donner ${formatEuros(amountCents)}`
                : "Donner"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          <FilleulChoice
            filleuls={filleuls}
            value={filleul.childId}
            onChange={setChildId}
            legend="Pour quel filleul ?"
          />
          <AmountChoice
            presets={donationPresetsCents}
            choice={choice}
            other={other}
            onChoice={setChoice}
            onOther={setOther}
            legend="Montant du don"
          />
          <FormField label="Occasion (facultatif)">
            <Input
              value={note}
              maxLength={DONATION_NOTE_MAX_LENGTH}
              placeholder="rentrée, fournitures…"
              onChange={(event) => setNote(event.target.value)}
            />
          </FormField>
          <p className="m-0 text-13 text-muted">
            Paiement simulé par carte : aucune coordonnée bancaire n&apos;est demandée.
          </p>
          {error ? <ErrorLine>{error}</ErrorLine> : null}
        </form>
      </Dialog>
    </>
  );
}
