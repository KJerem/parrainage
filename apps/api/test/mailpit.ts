// Lecture des e-mails capturés par Mailpit (http://localhost:8025) pendant les tests e2e.
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface MessageSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

async function search(to: string): Promise<MessageSummary[]> {
  const query = encodeURIComponent(`to:"${to}"`);
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}&limit=50`);
  if (!res.ok) {
    throw new Error(`Mailpit indisponible (${res.status})`);
  }
  const body = (await res.json()) as { messages: MessageSummary[] };
  return body.messages;
}

/** Identifiants des messages déjà reçus par cette adresse (à relever avant l'action testée). */
export async function messageIds(to: string): Promise<Set<string>> {
  return new Set((await search(to)).map((m) => m.ID));
}

/** Attend un nouveau message pour cette adresse et renvoie son sujet et son texte. */
export async function waitForNewMessage(
  to: string,
  known: Set<string>,
  timeoutMs = 5000,
): Promise<{ subject: string; text: string; html: string; attachments: string[] }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const fresh = (await search(to)).find((m) => !known.has(m.ID));
    if (fresh) {
      const res = await fetch(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`);
      const message = (await res.json()) as {
        Subject: string;
        Text: string;
        HTML: string;
        Attachments?: { FileName: string }[];
      };
      return {
        subject: message.Subject,
        text: message.Text,
        html: message.HTML,
        attachments: (message.Attachments ?? []).map((attachment) => attachment.FileName),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Aucun nouvel e-mail pour ${to}`);
}
