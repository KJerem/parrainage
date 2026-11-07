"use client";

import { moderationDecisionResultSchema } from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, toast } from "@/components/ui";
import { ApiRequestError, apiFetch, NETWORK_ERROR_MESSAGE } from "@/lib/api-client";

/** « Approuver » sur place (Bureau.dc.html) : une alerte demande confirmation avant l'envoi. */
export function ApproveButton({
  messageId,
  parties,
  alertLabel,
}: {
  messageId: string;
  /** « Paul D. → Kofi A. » : distingue les boutons de chaque ligne au lecteur d'écran. */
  parties: string;
  /** Alerte du message, s'il en a une. */
  alertLabel: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [, startTransition] = useTransition();

  async function approve() {
    setSending(true);
    try {
      await apiFetch(
        `/api/moderation/messages/${encodeURIComponent(messageId)}/decision`,
        moderationDecisionResultSchema,
        { method: "POST", body: { decision: "APPROVE" } },
      );
      toast(`Message approuvé : ${parties}`);
    } catch (error) {
      toast(error instanceof ApiRequestError ? error.message : NETWORK_ERROR_MESSAGE);
    } finally {
      setConfirming(false);
      setSending(false);
      startTransition(() => router.refresh());
    }
  }

  return (
    <>
      <Button
        size="sm"
        loading={sending && !confirming}
        aria-label={`Approuver : ${parties}`}
        onClick={() => {
          if (alertLabel) {
            setConfirming(true);
          } else {
            void approve();
          }
        }}
      >
        Approuver
      </Button>
      {alertLabel ? (
        <Dialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Approuver malgré l'alerte ?"
          description={`${alertLabel} : le message ${parties} sera transmis tel quel.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Annuler
              </Button>
              <Button loading={sending} onClick={() => void approve()}>
                Approuver tel quel
              </Button>
            </>
          }
        />
      ) : null}
    </>
  );
}
