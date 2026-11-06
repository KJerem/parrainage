"use client";

import { conversationMessageSchema } from "@parrainage/contracts";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { ApiRequestError, apiFetch, newIdempotencyKey } from "@/lib/api-client";

export type EncouragementButtonProps = {
  /** Conversation du binôme (SPONSORSHIP). */
  conversationId: string;
};

/**
 * « Envoyer un encouragement » (Main.dc.html) : le message prédéfini part aussitôt, approuvé
 * d'office, et un toast le confirme.
 */
export function EncouragementButton({ conversationId }: EncouragementButtonProps) {
  // Même clé d'un essai à l'autre : un double clic ou une réponse perdue n'en envoie qu'un.
  const key = useRef<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function send() {
    if (state !== "idle") return;
    setState("sending");
    key.current ??= newIdempotencyKey();
    try {
      await apiFetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/encouragement`,
        conversationMessageSchema,
        { method: "POST", body: { idempotencyKey: key.current } },
      );
      key.current = null;
      setState("sent");
      toast("Encouragement envoyé");
    } catch (error) {
      setState("idle");
      toast(
        error instanceof ApiRequestError
          ? error.message
          : "L'encouragement n'a pas pu être envoyé. Réessayez dans un instant.",
      );
    }
  }

  return (
    <Button
      variant="soft-accent"
      loading={state === "sending"}
      disabled={state === "sent"}
      leftIcon={state === "sent" ? <CheckIcon size={18} /> : undefined}
      onClick={send}
    >
      {state === "sent" ? "Encouragement envoyé" : "Envoyer un encouragement"}
    </Button>
  );
}
