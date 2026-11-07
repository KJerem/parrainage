import type {
  EleveMessage,
  EleveSentContent,
  EleveSentSummary,
  EleveThread,
} from "@parrainage/contracts";
import { formatRelativeDay, RELAIS_TIME_ZONE } from "@/lib/format";

// Textes de l'espace enfant : phrases courtes, tutoiement, accords selon ce qui est envoyé.

/** Ce qu'un enfant peut envoyer depuis E-Bulletin (lu aussi par la page, côté serveur). */
export const eleveSendTypes = ["photo", "video", "bulletin"] as const;

export type EleveSendType = (typeof eleveSendTypes)[number];

/** « hier », « aujourd'hui », « 14 octobre » : l'heure de Lomé, là où l'enfant se trouve. */
export function childDay(date: string, now: string): string {
  return formatRelativeDay(date, now, { timeZone: RELAIS_TIME_ZONE }).toLowerCase();
}

/** Ce que voit l'enfant sous son message. */
export function messageStatusLine(
  message: Pick<EleveMessage, "status" | "deliveredAt" | "readAt" | "createdAt">,
  thread: Pick<EleveThread, "kind" | "name">,
  relaisName: string,
  now: string,
): string | null {
  const association = thread.kind === "association";
  switch (message.status) {
    case "relecture":
      return "L'association le lit";
    case "garde":
      return `L'association l'a gardé. Parles-en à ${relaisName}.`;
    case "recu":
      return association
        ? "Lu par l'association"
        : `Reçu par ${thread.name} · ${childDay(message.deliveredAt ?? message.createdAt, now)}`;
    case "lu":
      return association
        ? "Lu par l'association"
        : `Lu par ${thread.name} · ${childDay(message.readAt ?? message.createdAt, now)}`;
    default:
      return null;
  }
}

const SENT: Readonly<
  Record<EleveSentContent, { noun: string; pronoun: "le" | "la"; verb: string }>
> = {
  message: { noun: "Ton message", pronoun: "le", verb: "lit" },
  photo: { noun: "Ta photo", pronoun: "la", verb: "regarde" },
  video: { noun: "Ta vidéo", pronoun: "la", verb: "regarde" },
  bulletin: { noun: "Ton bulletin", pronoun: "le", verb: "regarde" },
};

/** Phrase de l'écran « Bravo ». */
export function sentSentence(
  summary: Pick<EleveSentSummary, "content" | "recipient" | "recipientName">,
) {
  const { noun, pronoun, verb } = SENT[summary.content];
  if (summary.recipient === "association") {
    return `${noun} part à l'association. Elle ${pronoun} ${verb} très vite.`;
  }
  const name = summary.recipientName;
  return `${noun} part chez ${name}. L'association ${pronoun} ${verb} d'abord, puis ${name} ${pronoun} reçoit.`;
}

export type SentStep = { label: string; state: "done" | "current" | "todo" };

/** Étapes de l'écran « Bravo » : fait, en cours, à venir. */
export function sentSteps(
  summary: Pick<EleveSentSummary, "status" | "recipient" | "recipientName">,
): SentStep[] {
  const { status, recipient, recipientName } = summary;
  const reviewed = status === "recu" || status === "lu";
  if (recipient === "association") {
    return [
      { label: "Envoyé", state: "done" },
      { label: "Lu par l'association", state: reviewed ? "done" : "current" },
    ];
  }
  return [
    { label: "Envoyé", state: "done" },
    { label: "Vérifié", state: reviewed ? "done" : "current" },
    { label: `Reçu par ${recipientName}`, state: reviewed ? "done" : "todo" },
  ];
}

/** Après un code faux. */
export function wrongCodeMessage(remaining: number): string {
  return `Ce ne sont pas les bonnes images. Il te reste ${remaining} ${remaining > 1 ? "essais" : "essai"}.`;
}

export function lockedMessage(relaisName: string): string {
  return `Tes images sont bloquées. Demande à ${relaisName} de les débloquer.`;
}

/** Nombre de cases remplies, pour les lecteurs d'écran. */
export function codeProgressLabel(count: number, total: number): string {
  return `${count} ${count > 1 ? "images touchées" : "image touchée"} sur ${total}`;
}
