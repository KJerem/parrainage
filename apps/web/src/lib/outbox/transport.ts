import { createdNewsSchema, resultRowSchema } from "@parrainage/contracts";
import { ApiRequestError, apiFetch } from "@/lib/api-client";
import { UploadError, uploadFile } from "@/lib/upload";
import type { OutboxNews, OutboxResult, OutboxTransport, SendOutcome } from "./core";

/** Un refus définitif, un manque de réseau ou une panne : à chacun sa suite. */
function outcomeOf<T>(error: unknown): SendOutcome<T> {
  if (error instanceof UploadError) {
    return error.resumable ? { kind: "retry" } : { kind: "rejected", message: error.message };
  }
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return { kind: "unauthorized" };
    }
    // 0 : réseau coupé ; 5xx et 429 : le serveur se remettra.
    if (error.status === 0 || error.status === 429 || error.status >= 500) {
      return { kind: "retry" };
    }
    return { kind: "rejected", message: error.message };
  }
  return { kind: "retry" };
}

async function sendNews(
  item: OutboxNews,
  onProgress: (item: OutboxNews) => Promise<void>,
): Promise<SendOutcome> {
  let current = item;
  try {
    for (const file of item.files) {
      if (file.mediaId !== null) {
        continue;
      }
      const media = await uploadFile(
        {
          blob: file.blob,
          kind: file.kind,
          mimeType: file.mimeType,
          fileName: file.fileName,
          fingerprint: file.fingerprint,
        },
        { purpose: "news" },
      );
      current = {
        ...current,
        files: current.files.map((other) =>
          other.id === file.id ? { ...other, mediaId: media.id } : other,
        ),
      };
      await onProgress(current);
    }
    const { data } = await apiFetch("/api/relais/news", createdNewsSchema, {
      method: "POST",
      body: {
        ...current.payload,
        // Les fichiers déposés avant la mise en file, puis ceux de la file, dans l'ordre choisi.
        mediaIds: [
          ...current.payload.mediaIds,
          ...current.files.flatMap((file) => (file.mediaId ? [file.mediaId] : [])),
        ],
      },
    });
    return { kind: "sent", data };
  } catch (error) {
    return outcomeOf(error);
  }
}

async function sendResult(item: OutboxResult) {
  try {
    const { data } = await apiFetch(
      `/api/relais/results/${encodeURIComponent(item.periodId)}/${encodeURIComponent(item.childId)}`,
      resultRowSchema,
      { method: "PUT", body: item.payload },
    );
    return { kind: "sent", data } as const;
  } catch (error) {
    return outcomeOf<typeof resultRowSchema._output>(error);
  }
}

export const apiTransport: OutboxTransport = { sendNews, sendResult };
