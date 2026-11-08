"use client";

import { callIcsPath, type ConversationMessage } from "@parrainage/contracts";
import { CalendarIcon, VideoIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { RELAIS_TIME_ZONE } from "@/lib/format";
import { ChooseSlot, ConfirmCallButton, ProposeSlotsButton } from "./call-actions";
import { callCardLabel, callHour, callMoment } from "./call-labels";

/**
 * Ce que dit un message d'appel dans la conversation parrain ↔ relais : la pastille d'une demande
 * (RW-Messages), les créneaux proposés, cliquables par le parrain, ou l'appel confirmé.
 */
export function CallMessageCard({
  message,
  variant,
}: {
  message: ConversationMessage;
  variant: "parrain" | "relais";
}) {
  const card = message.call;
  if (!card) {
    return null;
  }
  if (message.kind === "SYSTEM" && card.status === "CONFIRMED" && card.slot && card.callId) {
    const base = variant === "parrain" ? "/parrain/appels" : "/relais/appels";
    return (
      <div className="flex flex-col gap-1.5 rounded-12 border border-brand-200 bg-brand-100 px-4 py-3 text-14">
        <strong className="inline-flex items-center gap-2 text-brand-700">
          <VideoIcon size={16} /> Appel vidéo confirmé avec {card.childFirstName}
        </strong>
        <span>
          {callMoment(card.slot.startsAt)} (Paris) ·{" "}
          {callHour(card.slot.startsAt, RELAIS_TIME_ZONE)} à Lomé · {card.durationMinutes} minutes
        </span>
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <a
            href={callIcsPath(card.callId)}
            className="inline-flex items-center gap-1.5 font-semibold"
          >
            <CalendarIcon size={14} /> Ajouter à mon agenda
          </a>
          <a href={`${base}/${encodeURIComponent(card.callId)}`} className="font-semibold">
            Voir l&apos;appel
          </a>
        </span>
      </div>
    );
  }
  if (message.kind === "CALL_SLOTS" && card.status === "SLOTS_PROPOSED" && variant === "parrain") {
    return (
      <div className="flex flex-col gap-2 rounded-12 bg-info-100 px-3.5 py-3">
        <span className="text-13 font-semibold text-info-600">
          Choisissez un créneau : l&apos;appel est confirmé aussitôt.
        </span>
        <ChooseSlot requestId={card.requestId} slots={card.proposedSlots} compact />
      </div>
    );
  }
  const pending = card.status === "REQUESTED" || card.status === "SLOTS_PROPOSED";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-10 px-3 py-2 text-13 font-semibold",
        pending ? "bg-info-100 text-info-600" : "bg-canvas text-ink-soft",
      )}
    >
      <VideoIcon size={16} />
      {message.kind === "CALL_SLOTS" && card.status !== "SLOTS_PROPOSED"
        ? "Créneaux proposés"
        : callCardLabel(card)}
    </span>
  );
}

/**
 * « Réponse rapide » de RW-Messages, au-dessus de la zone de réponse : la demande d'appel la plus
 * récente encore à confirmer.
 */
export function CallQuickReply({
  messages,
  parrainName,
}: {
  messages: readonly ConversationMessage[];
  parrainName: string;
}) {
  const pending = [...messages]
    .reverse()
    .find((message) => message.kind === "CALL_REQUEST" && message.call?.status === "REQUESTED");
  if (!pending?.call) {
    return null;
  }
  return (
    <div className="mx-5 mt-4 flex flex-wrap items-center gap-2.5 rounded-12 bg-canvas p-3 max-sm:mx-4">
      <span className="text-14 font-semibold">Réponse rapide :</span>
      <ConfirmCallButton size="sm" requestId={pending.call.requestId} />
      <ProposeSlotsButton size="sm" requestId={pending.call.requestId} parrainName={parrainName} />
    </div>
  );
}
