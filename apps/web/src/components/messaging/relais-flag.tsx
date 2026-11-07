"use client";

import {
  type ManualFlag,
  manualFlagLabels,
  manualFlags,
  moderationFlagResultSchema,
} from "@parrainage/contracts";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { RadioCard } from "@/components/ui/form-field";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

/**
 * Le relais ne lit pas le message d'un enfant en relecture, mais il était là pendant la session :
 * il peut prévenir le bureau (« Visage d'un autre enfant ») sans en voir le contenu.
 */
export function RelaisFlagButton({ messageId }: { messageId: string }) {
  const [open, setOpen] = useState(false);
  const [flag, setFlag] = useState<ManualFlag | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!flag) {
      setError("Choisissez une raison");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await apiFetch(
        `/api/relais/messages/${encodeURIComponent(messageId)}/flag`,
        moderationFlagResultSchema,
        { method: "POST", body: { flag, active: true } },
      );
      setDone(true);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "Le service est momentanément indisponible. Réessayez dans un instant.",
      );
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return <p className="m-0 text-12 font-semibold text-accent-700">Signalé au bureau</p>;
  }
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Signaler au bureau
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Signaler ce message au bureau"
        description="Le bureau le verra en le relisant. Le message reste en relecture."
      >
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2.5">
          {manualFlags.map((value) => (
            <RadioCard
              key={value}
              name="flag"
              value={value}
              checked={flag === value}
              onChange={() => setFlag(value)}
            >
              {manualFlagLabels[value]}
            </RadioCard>
          ))}
          {error ? (
            <p role="alert" className="m-0 text-14 font-semibold text-danger-600">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={sending}>
              Signaler
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
