"use client";

import { conversationSummarySchema, type Contact } from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { RadioCard } from "@/components/ui/form-field";
import { ApiRequestError, apiFetch } from "@/lib/api-client";

const contactKey = (contact: Contact) => `${contact.kind}:${contact.counterpartId ?? "bureau"}`;

export type NewMessageButtonProps = {
  /** Parrains des enfants suivis et bureau (GET /api/conversations/contacts). */
  contacts: readonly Contact[];
};

/** « Nouveau message » (RW-Messages) : ouvre la conversation avec la personne choisie. */
export function NewMessageButton({ contacts }: NewMessageButtonProps) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parrains = contacts.filter((c) => c.kind !== "RELAIS_BUREAU");
  const bureau = contacts.filter((c) => c.kind === "RELAIS_BUREAU");

  function openDialog() {
    setSelected(null);
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const contact = contacts.find((c) => contactKey(c) === selected);
    if (!contact) {
      setError("Choisissez à qui écrire.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      let id = contact.conversationId;
      if (!id) {
        const { data } = await apiFetch("/api/conversations", conversationSummarySchema, {
          method: "POST",
          body: {
            kind: contact.kind,
            ...(contact.counterpartId ? { counterpartId: contact.counterpartId } : {}),
          },
        });
        id = data.id;
      }
      setOpen(false);
      router.push(`/relais/messages/${encodeURIComponent(id)}`);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : "La conversation n'a pas pu être ouverte. Réessayez.",
      );
    } finally {
      setPending(false);
    }
  }

  const group = (title: string, items: readonly Contact[]) =>
    items.length > 0 ? (
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-14 font-semibold">{title}</legend>
        {items.map((contact) => {
          const key = contactKey(contact);
          return (
            <RadioCard
              key={key}
              name="destinataire"
              value={key}
              checked={selected === key}
              onChange={() => setSelected(key)}
            >
              <Avatar
                size={36}
                tone={contact.avatarTone}
                initials={contact.initials}
                className={contact.kind === "RELAIS_BUREAU" ? "text-11" : undefined}
              />
              <span className="flex min-w-0 flex-col">
                <strong className="text-15">{contact.name}</strong>
                {contact.subtitle ? (
                  <span className="text-13 text-muted">{contact.subtitle}</span>
                ) : null}
              </span>
            </RadioCard>
          );
        })}
      </fieldset>
    ) : null;

  return (
    <>
      <Button onClick={openDialog}>Nouveau message</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Nouveau message"
        description="À qui voulez-vous écrire ? Si vous avez déjà échangé avec cette personne, la conversation existante s'ouvre."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              Écrire
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
          {contacts.length === 0 ? (
            <p className="m-0 text-14 text-muted">
              Aucun destinataire pour l&apos;instant : les parrains de vos enfants apparaîtront ici.
            </p>
          ) : null}
          {group("Parrains de vos enfants", parrains)}
          {group("Association", bureau)}
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
