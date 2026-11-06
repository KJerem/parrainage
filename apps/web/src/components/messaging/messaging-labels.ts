import {
  alertTypeLabels,
  type AlertType,
  type ConversationSummary,
  type Counterpart,
  type MessagePreview,
  type MessageStatus,
} from "@parrainage/contracts";

// Libellés de la messagerie (P-Messages, RW-Messages), purs et testés.

/** Nom d'une conversation dans la liste : « Aïcha », « M. Koffi · relais », « Claire M. ». */
export function listName(counterpart: Counterpart): string {
  if (counterpart.kind === "child") return counterpart.shortName;
  if (counterpart.kind === "relais") return `${counterpart.name} · relais`;
  return counterpart.name;
}

/**
 * Destinataire tel qu'on le nomme dans une phrase : « Aïcha », « Claire », « M. Koffi »,
 * « l'association » (« Remis à Aïcha », « Écrivez à l'association… »).
 */
export function recipientName(counterpart: Counterpart): string {
  if (counterpart.kind === "child") return counterpart.shortName;
  if (counterpart.kind === "bureau") return "l'association";
  if (counterpart.kind === "parrain") return counterpart.name.split(/\s+/)[0] ?? counterpart.name;
  return counterpart.name;
}

/** Sous-titre de l'en-tête du fil : l'objet de l'échange, sinon la présentation de la personne. */
export function threadSubtitle(conversation: Pick<ConversationSummary, "subject" | "counterpart">) {
  return conversation.subject ?? conversation.counterpart.subtitle;
}

/** Aperçu du dernier message : « Vous : … » pour le sien, « Photo » sans texte. */
export function previewText(preview: MessagePreview | null): string {
  if (!preview) return "Aucun message pour l'instant";
  let text: string;
  if (preview.body === null) {
    text = "Message en relecture par l'association";
  } else if (preview.body.trim() !== "") {
    text = preview.body;
  } else if (preview.attachmentCount > 0) {
    text =
      preview.attachmentCount === 1 ? "Pièce jointe" : `${preview.attachmentCount} pièces jointes`;
  } else {
    text = "Message";
  }
  return preview.mine ? `Vous : ${text}` : text;
}

/** Suivi d'un message envoyé : « En relecture », « Remis à Aïcha », « Lu par Aïcha »… */
export function statusLabel(status: MessageStatus, recipient: string): string {
  switch (status) {
    case "en_relecture":
      return "En relecture";
    case "remis":
      return `Remis à ${recipient}`;
    case "lu":
      return `Lu par ${recipient}`;
    case "retenu":
      return "Retenu par l'association";
  }
}

/** « un numéro de téléphone », « un numéro de téléphone et une adresse e-mail ». */
export function alertList(types: readonly AlertType[]): string {
  const labels = types.map((type) => alertTypeLabels[type].toLocaleLowerCase("fr-FR"));
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}`;
}

/** Avertissement avant envoi, quand le texte semble contenir des coordonnées. */
export function alertHint(types: readonly AlertType[], recipient: string): string {
  return `Votre message semble contenir : ${alertList(types)}. Vous pouvez l'envoyer : l'association le relira avec attention avant de le remettre à ${recipient}, et masquera ces informations si besoin.`;
}

/** Note de sécurité sous le champ (conversation avec un enfant). */
export function safetyNote(recipient: string): string {
  return `Les messages sont relus par l'association avant d'être remis à ${recipient}. Pour sa sécurité, n'échangez ni adresse, ni téléphone, ni réseau social.`;
}

/** Idées de messages proposées au parrain (P-Messages). */
export const MESSAGE_IDEAS = [
  "Quelle est ta matière préférée ?",
  "Félicitations pour ton bulletin",
  "Que fais-tu après l'école ?",
] as const;

/** Insère une idée dans le brouillon, séparée du texte déjà écrit. */
export function insertIdea(draft: string, idea: string): string {
  const trimmed = draft.replace(/\s+$/, "");
  return trimmed === "" ? idea : `${trimmed} ${idea}`;
}
