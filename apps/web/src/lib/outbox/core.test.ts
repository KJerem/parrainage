import type { ResultRow } from "@parrainage/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  enqueueResult,
  flushOutbox,
  type OutboxEvent,
  type OutboxFile,
  type OutboxItem,
  type OutboxNews,
  type OutboxResult,
  type OutboxStore,
  type OutboxTransport,
  pendingMediaLabel,
  pendingSummary,
  resultKey,
  type SendOutcome,
  type StoredItem,
} from "./core";

/** File en mémoire, à clés croissantes comme IndexedDB. */
function memoryStore(): OutboxStore & { rows: StoredItem[] } {
  let next = 1;
  const rows: StoredItem[] = [];
  return {
    rows,
    list: async (userId) => rows.filter((item) => item.userId === userId),
    add: async (item) => {
      const seq = next++;
      rows.push({ ...item, seq } as StoredItem);
      return seq;
    },
    update: async (item) => {
      const index = rows.findIndex((row) => row.seq === item.seq);
      if (index >= 0) rows[index] = item;
    },
    remove: async (seq) => {
      const index = rows.findIndex((row) => row.seq === seq);
      if (index >= 0) rows.splice(index, 1);
    },
  };
}

const row = { childId: "c" } as ResultRow;

function news(title: string, userId = "koffi", files: OutboxFile[] = []): OutboxNews {
  return {
    userId,
    type: "news",
    createdAt: "2026-10-31T10:00:00Z",
    parrainCount: 1,
    payload: {
      type: "ONE_CHILD",
      childIds: ["a"],
      title,
      body: "Texte",
      mediaIds: [],
      notifyParrains: true,
      notifyBureau: false,
      visibleToChildren: false,
      scheduledAt: null,
      idempotencyKey: `cle-${title}`,
    },
    files,
    error: null,
  };
}

function result(childId: string, averageX100: number, userId = "koffi"): OutboxResult {
  return {
    userId,
    type: "result",
    createdAt: "2026-10-31T10:00:00Z",
    key: resultKey("t1", childId),
    periodId: "t1",
    childId,
    payload: {
      averageX100,
      rank: null,
      classSize: null,
      appreciation: null,
      clientUpdatedAt: "2026-10-31T10:00:00.000Z",
    },
    error: null,
  };
}

const sent = <T>(data: T): SendOutcome<T> => ({ kind: "sent", data });

function transport(overrides: Partial<OutboxTransport> = {}): OutboxTransport {
  return {
    sendNews: vi.fn(async () => sent(null)),
    sendResult: vi.fn(async () => sent(row)),
    ...overrides,
  };
}

const named = (item: OutboxItem) =>
  item.type === "news" ? item.payload.title : `${item.childId}=${item.payload.averageX100}`;

describe("enqueueResult", () => {
  it("garde une seule saisie par enfant et par période, la dernière", async () => {
    const store = memoryStore();
    await enqueueResult(store, result("esther", 1000));
    await enqueueResult(store, result("kofi", 1100));
    await enqueueResult(store, result("esther", 1250));
    expect(store.rows.map(named)).toEqual(["kofi=1100", "esther=1250"]);
  });

  it("ne touche ni aux autres périodes, ni aux publications, ni aux autres comptes", async () => {
    const store = memoryStore();
    await store.add(news("Kits"));
    await store.add({ ...result("esther", 900), key: resultKey("t2", "esther"), periodId: "t2" });
    await store.add(result("esther", 800, "diallo"));
    await enqueueResult(store, result("esther", 1000));
    expect(store.rows).toHaveLength(4);
  });
});

describe("flushOutbox", () => {
  it("envoie tout dans l'ordre d'arrivée, puis vide la file", async () => {
    const store = memoryStore();
    await store.add(news("Kits"));
    await store.add(result("esther", 1000));
    await store.add(news("Fête"));
    const order: string[] = [];
    const report = await flushOutbox(
      store,
      transport({
        sendNews: async (item) => {
          order.push(item.payload.title);
          return sent(null);
        },
        sendResult: async (item) => {
          order.push(item.childId);
          return sent(row);
        },
      }),
      "koffi",
    );
    expect(order).toEqual(["Kits", "esther", "Fête"]);
    expect(store.rows).toEqual([]);
    expect(report).toEqual({ sent: 3, interrupted: false, unauthorized: false });
  });

  it("n'envoie jamais la file d'un autre compte", async () => {
    const store = memoryStore();
    await store.add(news("De Diallo", "diallo"));
    await store.add(news("De Koffi"));
    const sendNews = vi.fn(async () => sent(null));
    await flushOutbox(store, transport({ sendNews }), "koffi");
    expect(sendNews).toHaveBeenCalledTimes(1);
    expect(store.rows.map(named)).toEqual(["De Diallo"]);
  });

  it("s'arrête au premier manque de réseau et garde l'ordre pour la reprise", async () => {
    const store = memoryStore();
    await store.add(result("esther", 1000));
    await store.add(result("kofi", 1100));
    await store.add(result("yao", 1200));
    const sendResult = vi
      .fn<OutboxTransport["sendResult"]>()
      .mockResolvedValueOnce(sent(row))
      .mockResolvedValueOnce({ kind: "retry" });
    const report = await flushOutbox(store, transport({ sendResult }), "koffi");
    expect(report).toMatchObject({ sent: 1, interrupted: true });
    expect(sendResult).toHaveBeenCalledTimes(2);
    expect(store.rows.map(named)).toEqual(["kofi=1100", "yao=1200"]);

    const resume = vi.fn<OutboxTransport["sendResult"]>().mockResolvedValue(sent(row));
    await flushOutbox(store, transport({ sendResult: resume }), "koffi");
    expect(resume.mock.calls.map(([item]) => item.childId)).toEqual(["kofi", "yao"]);
    expect(store.rows).toEqual([]);
  });

  it("garde tout et le signale quand la session a expiré", async () => {
    const store = memoryStore();
    await store.add(news("Kits"));
    const report = await flushOutbox(
      store,
      transport({ sendNews: async () => ({ kind: "unauthorized" }) }),
      "koffi",
    );
    expect(report).toEqual({ sent: 0, interrupted: true, unauthorized: true });
    expect(store.rows).toHaveLength(1);
  });

  it("garde une publication refusée, avec son motif, sans bloquer la suite", async () => {
    const store = memoryStore();
    await store.add(news("Refusée"));
    await store.add(news("Acceptée"));
    const events: OutboxEvent[] = [];
    const report = await flushOutbox(
      store,
      transport({
        sendNews: async (item) =>
          item.payload.title === "Refusée"
            ? { kind: "rejected", message: "Un enfant n'est plus suivi" }
            : sent(null),
      }),
      "koffi",
      (event) => events.push(event),
    );
    expect(report.sent).toBe(1);
    expect(store.rows.map(named)).toEqual(["Refusée"]);
    expect(store.rows[0]?.error).toBe("Un enfant n'est plus suivi");
    expect(events.map((event) => event.type)).toEqual(["news-rejected", "news-sent"]);

    // Au passage suivant, elle n'est pas renvoyée tant que le relais n'a pas décidé.
    const sendNews = vi.fn(async () => sent(null));
    await flushOutbox(store, transport({ sendNews }), "koffi");
    expect(sendNews).not.toHaveBeenCalled();
  });

  it("retire une saisie refusée (périmée) et prévient la ligne concernée", async () => {
    const store = memoryStore();
    await store.add(result("esther", 1000));
    const events: OutboxEvent[] = [];
    await flushOutbox(
      store,
      transport({ sendResult: async () => ({ kind: "rejected", message: "Plus récente" }) }),
      "koffi",
      (event) => events.push(event),
    );
    expect(store.rows).toEqual([]);
    expect(events).toEqual([
      { type: "result-rejected", periodId: "t1", childId: "esther", message: "Plus récente" },
    ]);
  });

  it("transmet la ligne enregistrée, pour mettre à jour l'écran", async () => {
    const store = memoryStore();
    await store.add(result("esther", 1000));
    const events: OutboxEvent[] = [];
    await flushOutbox(store, transport(), "koffi", (event) => events.push(event));
    expect(events).toEqual([{ type: "result-saved", periodId: "t1", childId: "esther", row }]);
  });

  it("retient les fichiers déjà déposés : une reprise ne les renvoie pas", async () => {
    const store = memoryStore();
    const file: OutboxFile = {
      id: "f1",
      blob: new Blob(["x"]),
      kind: "PHOTO",
      mimeType: "image/png",
      fileName: "a.png",
      fingerprint: "f",
      mediaId: null,
    };
    await store.add(news("Kits", "koffi", [file]));
    await flushOutbox(
      store,
      transport({
        sendNews: async (item, onProgress) => {
          await onProgress({ ...item, files: [{ ...file, mediaId: "media-1" }] });
          return { kind: "retry" };
        },
      }),
      "koffi",
    );
    const kept = store.rows[0] as OutboxNews;
    expect(kept.files[0]?.mediaId).toBe("media-1");
  });

  it("envoie aussi ce qui arrive pendant le passage", async () => {
    const store = memoryStore();
    await store.add(result("esther", 1000));
    const sendResult = vi.fn<OutboxTransport["sendResult"]>(async (item) => {
      if (item.childId === "esther") {
        await store.add(result("kofi", 1100));
      }
      return sent(row);
    });
    await flushOutbox(store, transport({ sendResult }), "koffi");
    expect(sendResult.mock.calls.map(([item]) => item.childId)).toEqual(["esther", "kofi"]);
    expect(store.rows).toEqual([]);
  });
});

describe("libellés de la file", () => {
  it("résume ce qui attend", () => {
    expect(pendingSummary([])).toBeNull();
    expect(pendingSummary([news("a")])).toEqual({ label: "1 publication", plural: false });
    expect(pendingSummary([news("a"), news("b")])).toEqual({
      label: "2 publications",
      plural: true,
    });
    expect(pendingSummary([news("a"), result("e", 1), result("k", 2)])).toEqual({
      label: "1 publication et 2 saisies de résultats",
      plural: true,
    });
  });

  it("ne compte pas une publication refusée", () => {
    expect(pendingSummary([{ ...news("a"), error: "Refus" }])).toBeNull();
  });

  it("décrit le contenu d'une publication", () => {
    const file = (kind: OutboxFile["kind"]): OutboxFile => ({
      id: kind,
      blob: new Blob(),
      kind,
      mimeType: "x",
      fileName: "x",
      fingerprint: "x",
      mediaId: null,
    });
    expect(pendingMediaLabel(news("a"))).toBe("Texte");
    expect(pendingMediaLabel(news("a", "k", [file("PHOTO")]))).toBe("Photo");
    expect(pendingMediaLabel(news("a", "k", [file("PHOTO"), file("PHOTO")]))).toBe("2 photos");
    expect(pendingMediaLabel(news("a", "k", [file("VIDEO")]))).toBe("Vidéo");
  });
});
