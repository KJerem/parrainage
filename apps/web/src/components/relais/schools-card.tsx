"use client";

import {
  type School,
  schoolLevelLabels,
  schoolLevels,
  type SchoolLevel,
  schoolSchema,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, Dialog, FormField, Input, Select } from "@/components/ui";
import { ApiRequestError, apiFetch, NETWORK_ERROR_MESSAGE } from "@/lib/api-client";

/** Ajout d'une école au relais : depuis le profil ou le formulaire d'un enfant. */
export function AddSchoolDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (school: School) => void;
}) {
  const [shortName, setShortName] = useState("");
  const [level, setLevel] = useState<SchoolLevel>("PRIMAIRE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiFetch("/api/relais/schools", schoolSchema, {
        method: "POST",
        body: { shortName, level },
      });
      onCreated(data);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : NETWORK_ERROR_MESSAGE);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Ajouter une école"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={busy} onClick={() => void create()}>
            Ajouter
          </Button>
        </>
      }
    >
      <FormField label="Nom de l'école" error={error}>
        <Input value={shortName} onChange={(event) => setShortName(event.target.value)} />
      </FormField>
      <FormField label="Niveau">
        <Select value={level} onChange={(event) => setLevel(event.target.value as SchoolLevel)}>
          {schoolLevels.map((option) => (
            <option key={option} value={option}>
              {schoolLevelLabels[option]}
            </option>
          ))}
        </Select>
      </FormField>
    </Dialog>
  );
}

/** Écoles du relais (profil). */
export function SchoolsCard({ schools }: { schools: readonly School[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-17 font-bold">Mes écoles</h2>
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          Ajouter une école
        </Button>
      </div>
      {schools.length === 0 ? (
        <p className="m-0 text-14 text-muted">Aucune école pour le moment.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-14">
          {schools.map((school) => (
            <li key={school.id}>
              <strong>{school.shortName}</strong>
              <span className="text-muted">
                {" "}
                · {schoolLevelLabels[school.level]}, {school.city}
              </span>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <AddSchoolDialog
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
    </Card>
  );
}
