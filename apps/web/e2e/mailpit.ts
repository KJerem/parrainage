// Lecture des e-mails capturés par Mailpit (http://localhost:8025) pendant les tests.
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

type MessageSummary = { ID: string; To: { Address: string }[] };

async function messagesTo(address: string): Promise<MessageSummary[]> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`);
  if (!response.ok) {
    throw new Error(`Mailpit indisponible (${response.status})`);
  }
  const { messages } = (await response.json()) as { messages: MessageSummary[] };
  const wanted = address.toLowerCase();
  return messages.filter((message) => message.To.some((to) => to.Address.toLowerCase() === wanted));
}

/** Identifiants des messages déjà reçus par cette adresse (à relever avant l'action testée). */
export async function knownMessages(address: string): Promise<Set<string>> {
  return new Set((await messagesTo(address)).map((message) => message.ID));
}

/** Attend un nouveau message pour cette adresse et renvoie son sujet et son texte brut. */
export async function waitForMessage(
  address: string,
  known: Set<string>,
  timeoutMs = 10_000,
): Promise<{ subject: string; text: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const fresh = (await messagesTo(address)).find((message) => !known.has(message.ID));
    if (fresh) {
      const response = await fetch(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`);
      const message = (await response.json()) as { Subject: string; Text: string };
      return { subject: message.Subject, text: message.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Aucun nouvel e-mail pour ${address}`);
}

/** Premier lien du texte dont le chemin contient `pathPart`. */
export function extractLink(text: string, pathPart: string): string {
  const link = text.match(/https?:\/\/\S+/g)?.find((url) => url.includes(pathPart));
  if (!link) {
    throw new Error(`Aucun lien « ${pathPart} » dans l'e-mail :\n${text}`);
  }
  return link;
}
