import type { CreateNews, ResultRow, SaveResult, UploadKind } from "@parrainage/contracts";

// File d'attente du relais (plan §8) : ce qui attend le réseau, dans l'ordre de la saisie. Cette
// partie est pure (stockage et envoi lui sont donnés) : l'ordre, la fusion et la reprise se testent
// sans navigateur.

/** Fichier gardé sur le poste jusqu'à son envoi. `mediaId` : déjà déposé, à ne pas renvoyer. */
export type OutboxFile = {
  id: string;
  blob: Blob;
  kind: UploadKind;
  mimeType: string;
  fileName: string;
  fingerprint: string;
  mediaId: string | null;
};

export type OutboxNews = {
  seq?: number;
  userId: string;
  type: "news";
  createdAt: string;
  /** Destinataires annoncés (« Pour 6 parrains »). */
  parrainCount: number;
  /** Corps de POST /api/relais/news, clé d'idempotence comprise. */
  payload: CreateNews;
  files: OutboxFile[];
  /** Refus du serveur : la publication attend une décision du relais. */
  error: string | null;
};

export type OutboxResult = {
  seq?: number;
  userId: string;
  type: "result";
  createdAt: string;
  /** Une seule saisie en attente par enfant et par période. */
  key: string;
  periodId: string;
  childId: string;
  payload: SaveResult;
  error: null;
};

export type OutboxItem = OutboxNews | OutboxResult;

export type StoredItem = OutboxItem & { seq: number };

export const resultKey = (periodId: string, childId: string) => `${periodId}:${childId}`;

/** Stockage de la file : par ordre d'arrivée, pour un utilisateur. */
export interface OutboxStore {
  list(userId: string): Promise<StoredItem[]>;
  add(item: OutboxItem): Promise<number>;
  update(item: StoredItem): Promise<void>;
  remove(seq: number): Promise<void>;
}

/** Réponse d'un envoi : envoyé, à retenter plus tard, session expirée, ou refus définitif. */
export type SendOutcome<T = unknown> =
  | { kind: "sent"; data: T }
  | { kind: "retry" }
  | { kind: "unauthorized" }
  | { kind: "rejected"; message: string };

export interface OutboxTransport {
  /** `onProgress` : un fichier est déposé, à retenir pour ne pas le renvoyer. */
  sendNews(item: OutboxNews, onProgress: (item: OutboxNews) => Promise<void>): Promise<SendOutcome>;
  sendResult(item: OutboxResult): Promise<SendOutcome<ResultRow>>;
}

export type OutboxEvent =
  | { type: "news-sent"; title: string }
  | { type: "news-rejected"; title: string; message: string }
  | { type: "result-saved"; periodId: string; childId: string; row: ResultRow }
  | { type: "result-rejected"; periodId: string; childId: string; message: string };

export type FlushReport = {
  /** Envoyés par ce passage. */
  sent: number;
  /** Le réseau (ou le serveur) a manqué : la suite attend, dans l'ordre. */
  interrupted: boolean;
  unauthorized: boolean;
};

/**
 * Ajoute une saisie de résultat. Elle remplace celle du même enfant encore en attente : chaque
 * saisie porte la ligne entière, seule la dernière compte.
 */
export async function enqueueResult(store: OutboxStore, item: OutboxResult): Promise<void> {
  const pending = await store.list(item.userId);
  for (const other of pending) {
    if (other.type === "result" && other.key === item.key) {
      await store.remove(other.seq);
    }
  }
  await store.add(item);
}

/**
 * Envoie la file d'un utilisateur, strictement dans l'ordre, et s'arrête au premier manque de
 * réseau pour garder cet ordre. Relit la file à chaque tour : ce qui arrive entre-temps passe à la
 * suite. Une publication refusée reste visible (le relais décide), sans bloquer le reste.
 */
export async function flushOutbox(
  store: OutboxStore,
  transport: OutboxTransport,
  userId: string,
  emit: (event: OutboxEvent) => void = () => {},
): Promise<FlushReport> {
  const report: FlushReport = { sent: 0, interrupted: false, unauthorized: false };
  let lastSeq = 0;
  for (;;) {
    const pending = await store.list(userId);
    const next = pending.find((item) => item.seq > lastSeq && item.error === null);
    if (!next) {
      return report;
    }
    lastSeq = next.seq;
    if (next.type === "news") {
      const stored = next;
      const outcome = await transport.sendNews(stored, async (progress) => {
        await store.update({ ...progress, seq: stored.seq });
      });
      if (outcome.kind === "sent") {
        await store.remove(stored.seq);
        report.sent += 1;
        emit({ type: "news-sent", title: stored.payload.title });
      } else if (outcome.kind === "rejected") {
        // Relu : l'envoi a pu noter des fichiers déjà déposés.
        const latest = (await store.list(userId)).find((item) => item.seq === stored.seq);
        if (latest?.type === "news") {
          await store.update({ ...latest, seq: latest.seq, error: outcome.message });
        }
        emit({ type: "news-rejected", title: stored.payload.title, message: outcome.message });
      } else {
        return stop(report, outcome);
      }
    } else {
      const outcome = await transport.sendResult(next);
      if (outcome.kind === "sent") {
        await store.remove(next.seq);
        report.sent += 1;
        emit({
          type: "result-saved",
          periodId: next.periodId,
          childId: next.childId,
          row: outcome.data,
        });
      } else if (outcome.kind === "rejected") {
        // Une saisie refusée (périmée, invalide) ne se représentera jamais mieux : elle sort.
        await store.remove(next.seq);
        emit({
          type: "result-rejected",
          periodId: next.periodId,
          childId: next.childId,
          message: outcome.message,
        });
      } else {
        return stop(report, outcome);
      }
    }
  }
}

function stop(report: FlushReport, outcome: { kind: "retry" | "unauthorized" }): FlushReport {
  return outcome.kind === "unauthorized"
    ? { ...report, unauthorized: true, interrupted: true }
    : { ...report, interrupted: true };
}

/** « 2 publications », « 1 saisie de résultat », pour le bandeau hors ligne. */
export function pendingSummary(items: readonly OutboxItem[]): {
  label: string;
  plural: boolean;
} | null {
  const waiting = items.filter((item) => item.error === null);
  const news = waiting.filter((item) => item.type === "news").length;
  const results = waiting.length - news;
  const parts = [
    ...(news > 0 ? [`${news} ${news > 1 ? "publications" : "publication"}`] : []),
    ...(results > 0 ? [`${results} ${results > 1 ? "saisies" : "saisie"} de résultats`] : []),
  ];
  return parts.length === 0 ? null : { label: parts.join(" et "), plural: waiting.length > 1 };
}

/** « 3 photos », « Vidéo », « Texte » : le contenu d'une publication en attente. */
export function pendingMediaLabel(item: OutboxNews): string {
  const total = item.files.length + item.payload.mediaIds.length;
  if (total === 0) {
    return "Texte";
  }
  const videos = item.files.filter((file) => file.kind === "VIDEO").length;
  if (videos === total) {
    return videos > 1 ? `${videos} vidéos` : "Vidéo";
  }
  return total > 1 ? `${total} photos` : "Photo";
}
