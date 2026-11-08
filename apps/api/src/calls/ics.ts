import { createEvent } from "ics";

/**
 * Fichier agenda d'un appel (.ics), seule pièce jointe permise dans un e-mail : un titre neutre et
 * le lien de la salle, sans nom ni donnée de l'enfant.
 */
export function callIcs(call: {
  id: string;
  startsAt: Date;
  durationMinutes: number;
  url: string;
  earlyMinutes: number;
}): string {
  const { error, value } = createEvent({
    uid: `${call.id}@parrainage-lrt`,
    productId: "parrainage-lrt/appels",
    method: "PUBLISH",
    title: "Appel vidéo · Parrainage LRT",
    description: `Rejoindre la salle : ${call.url}\nElle ouvre ${call.earlyMinutes} minutes avant l'appel. Les appels ne sont pas enregistrés.`,
    url: call.url,
    start: call.startsAt.getTime(),
    startInputType: "utc",
    startOutputType: "utc",
    duration: { minutes: call.durationMinutes },
    status: "CONFIRMED",
  });
  if (error || !value) {
    throw error ?? new Error("Fichier agenda vide");
  }
  return value;
}
