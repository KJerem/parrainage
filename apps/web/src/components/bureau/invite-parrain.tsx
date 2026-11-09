"use client";

import { bureauParrainSchema, type Gender, inviteParrainSchema } from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormField, Input, RadioCard, Textarea } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

const empty = {
  firstName: "",
  lastName: "",
  email: "",
  city: "",
  postalCode: "",
  addressLine: "",
  country: "France",
  wishes: "",
};

type Fields = typeof empty;

/** « Inviter un parrain » : le compte est créé et la personne reçoit un lien de connexion. */
export function InviteParrainButton() {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Fields>(empty);
  const [gender, setGender] = useState<Gender>("F");
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof Fields) => (event: { target: { value: string } }) =>
    setFields((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = inviteParrainSchema.safeParse({ ...fields, gender });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      return;
    }
    setErrors({});
    setError(null);
    setSaving(true);
    try {
      const { data } = await apiFetch("/api/bureau/parrains", bureauParrainSchema, {
        method: "POST",
        body: parsed.data,
      });
      setOpen(false);
      toast(`Invitation envoyée à ${data.email}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiRequestError && Object.keys(caught.fieldErrors).length > 0) {
        setErrors(
          Object.fromEntries(
            Object.entries(caught.fieldErrors).map(([key, messages]) => [key, messages[0]]),
          ),
        );
      } else {
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "Le service est momentanément indisponible. Réessayez dans un instant.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setFields(empty);
          setGender("F");
          setErrors({});
          setError(null);
          setOpen(true);
        }}
      >
        Inviter un parrain
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Inviter un parrain"
        description="La personne reçoit un lien pour se connecter. L'adresse postale sert aux reçus fiscaux."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form={formId} loading={saving}>
              Envoyer l&apos;invitation
            </Button>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => void submit(event)}
          noValidate
          className="flex flex-col gap-4"
        >
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-14 font-semibold">Elle ou il sera</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["F", "Marraine"],
                  ["M", "Parrain"],
                ] as const
              ).map(([value, label]) => (
                <RadioCard
                  key={value}
                  name="genre"
                  checked={gender === value}
                  onChange={() => setGender(value)}
                  labelClassName="font-semibold"
                >
                  {label}
                </RadioCard>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Prénom" error={errors.firstName} required>
              <Input value={fields.firstName} onChange={set("firstName")} autoComplete="off" />
            </FormField>
            <FormField label="Nom" error={errors.lastName} required>
              <Input value={fields.lastName} onChange={set("lastName")} autoComplete="off" />
            </FormField>
          </div>
          <FormField label="Adresse e-mail" error={errors.email} required>
            <Input type="email" value={fields.email} onChange={set("email")} autoComplete="off" />
          </FormField>
          <FormField label="Adresse (facultatif)" error={errors.addressLine}>
            <Input value={fields.addressLine} onChange={set("addressLine")} autoComplete="off" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
            <FormField label="Code postal" error={errors.postalCode}>
              <Input value={fields.postalCode} onChange={set("postalCode")} autoComplete="off" />
            </FormField>
            <FormField label="Ville" error={errors.city} required>
              <Input value={fields.city} onChange={set("city")} autoComplete="off" />
            </FormField>
            <FormField label="Pays" error={errors.country}>
              <Input value={fields.country} onChange={set("country")} autoComplete="off" />
            </FormField>
          </div>
          <FormField label="Souhaits (facultatif)" error={errors.wishes}>
            <Textarea
              rows={2}
              value={fields.wishes}
              onChange={set("wishes")}
              placeholder="Souhaite parrainer une fille en primaire…"
            />
          </FormField>
          {error ? (
            <p
              role="alert"
              className="m-0 rounded-12 bg-danger-100 px-3.5 py-3 text-14 font-semibold text-danger-600"
            >
              {error}
            </p>
          ) : null}
        </form>
      </Dialog>
    </>
  );
}
