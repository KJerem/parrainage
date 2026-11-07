"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "@/components/ui";
import { SERVICE_WORKER_SCOPE, SERVICE_WORKER_URL, WARM_PAGES_MESSAGE } from "@/lib/offline-config";
import {
  enqueueResult,
  flushOutbox,
  type OutboxEvent,
  type OutboxNews,
  type OutboxResult,
  resultKey,
  type StoredItem,
} from "@/lib/outbox/core";
import { indexedDbStore } from "@/lib/outbox/store";
import { apiTransport } from "@/lib/outbox/transport";

const HEALTH_PROBE_URL = "/api/health?light";
const CHANNEL = "parrainage-outbox";
/** Délai entre deux essais tant que quelque chose attend ou que le réseau manque. */
const RETRY_INTERVAL_MS = 20_000;
/** Pages hors ligne remises à jour au plus une fois par ce délai. */
const WARM_INTERVAL_MS = 10 * 60 * 1000;
const WARMED_AT_KEY = "relais-pages-warmed-at";

type OutboxContextValue = {
  /** En attente pour le compte connecté, dans l'ordre. */
  items: readonly StoredItem[];
  online: boolean;
  /** Session expirée : il faut se reconnecter pour vider la file. */
  needsLogin: boolean;
  enqueueNews: (news: Pick<OutboxNews, "parrainCount" | "payload" | "files">) => Promise<void>;
  /** Enregistre une ligne de résultats : toujours par la file, pour garder l'ordre des saisies. */
  saveResult: (
    periodId: string,
    childId: string,
    payload: OutboxResult["payload"],
  ) => Promise<void>;
  removeItem: (seq: number) => Promise<void>;
  /** Tente d'envoyer ce qui attend ; rend la main quand le passage est fini. */
  flush: () => Promise<void>;
  subscribe: (listener: (event: OutboxEvent) => void) => () => void;
};

const OutboxContext = createContext<OutboxContextValue | null>(null);

export function useOutbox(): OutboxContextValue {
  const value = useContext(OutboxContext);
  if (!value) {
    throw new Error("useOutbox doit être utilisé dans OutboxProvider");
  }
  return value;
}

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

/** Enregistre le service worker (build de production seulement) et remet les pages en cache. */
function setUpServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
    return;
  }
  const warm = () => {
    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: WARM_PAGES_MESSAGE });
    });
  };
  navigator.serviceWorker
    .register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE })
    .then(() => {
      const last = Number(sessionStorage.getItem(WARMED_AT_KEY) ?? 0);
      if (Date.now() - last > WARM_INTERVAL_MS) {
        sessionStorage.setItem(WARMED_AT_KEY, String(Date.now()));
        warm();
      }
    })
    .catch(() => {
      // Navigateur ou contexte sans service worker : tout marche, sauf le hors-ligne.
    });
  // Une nouvelle version vide le cache des pages : on les redemande.
  navigator.serviceWorker.addEventListener("controllerchange", warm);
}

/**
 * Tout ce qui attend le réseau pour un relais : la file, l'état du réseau et ses reprises (au retour
 * du réseau, à l'ouverture, au retour sur l'onglet, sur réponse de la sonde). Un seul envoi à la fois,
 * tous onglets confondus (Web Locks).
 */
export function OutboxProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const router = useRouter();
  const browserOnline = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  /** Le navigateur se croit en ligne, mais un envoi vient d'échouer faute de réseau. */
  const [unreachable, setUnreachable] = useState(false);
  const [items, setItems] = useState<readonly StoredItem[]>([]);
  const [needsLogin, setNeedsLogin] = useState(false);
  const listeners = useRef(new Set<(event: OutboxEvent) => void>());
  const flushing = useRef<Promise<void> | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const online = browserOnline && !unreachable;

  const reload = useCallback(async () => {
    setItems(await indexedDbStore.list(userId));
  }, [userId]);

  const changed = useCallback(async () => {
    await reload();
    channel.current?.postMessage("changed");
  }, [reload]);

  const runFlush = useCallback(async () => {
    let sent = 0;
    const emit = (event: OutboxEvent) => {
      if (event.type === "news-sent") {
        toast(`Nouvelle envoyée : ${event.title}`);
      }
      if (event.type === "news-rejected") {
        toast(`Publication refusée : ${event.message}`);
      }
      for (const listener of listeners.current) {
        listener(event);
      }
      void reload();
    };
    /** Un passage ; `true` si quelque chose est arrivé pendant sa toute fin. */
    const pass = async (): Promise<boolean> => {
      const report = await flushOutbox(indexedDbStore, apiTransport, userId, emit);
      sent += report.sent;
      setNeedsLogin(report.unauthorized);
      setUnreachable(report.interrupted && !report.unauthorized);
      if (report.interrupted) {
        return false;
      }
      const left = await indexedDbStore.list(userId);
      return left.some((item) => item.error === null);
    };
    const passes = async () => {
      while (await pass());
    };
    // Sans Web Locks (anciens navigateurs), un seul envoi par onglet reste garanti plus bas.
    if ("locks" in navigator) {
      await navigator.locks.request(CHANNEL, { ifAvailable: true }, async (lock) => {
        if (lock) {
          await passes();
        }
      });
    } else {
      await passes();
    }
    await changed();
    if (sent > 0) {
      router.refresh();
    }
  }, [changed, reload, router, userId]);

  const flush = useCallback(() => {
    flushing.current ??= runFlush()
      .catch(() => {
        setUnreachable(true);
      })
      .finally(() => {
        flushing.current = null;
      });
    return flushing.current;
  }, [runFlush]);

  const enqueueNews = useCallback<OutboxContextValue["enqueueNews"]>(
    async ({ parrainCount, payload, files }) => {
      await indexedDbStore.add({
        userId,
        type: "news",
        createdAt: new Date().toISOString(),
        parrainCount,
        payload,
        files,
        error: null,
      });
      // Demande au navigateur de ne pas effacer la file s'il manque de place.
      void navigator.storage?.persist?.();
      await changed();
      void flush();
    },
    [changed, flush, userId],
  );

  const saveResult = useCallback<OutboxContextValue["saveResult"]>(
    async (periodId, childId, payload) => {
      await enqueueResult(indexedDbStore, {
        userId,
        type: "result",
        createdAt: new Date().toISOString(),
        key: resultKey(periodId, childId),
        periodId,
        childId,
        payload,
        error: null,
      });
      await changed();
      // Un passage déjà en cours lit la file à chaque tour : il prendra celle-ci aussi.
      void flush();
    },
    [changed, flush, userId],
  );

  const removeItem = useCallback(
    async (seq: number) => {
      await indexedDbStore.remove(seq);
      await changed();
    },
    [changed],
  );

  const subscribe = useCallback<OutboxContextValue["subscribe"]>((listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  // Service worker, liste initiale et envoi de ce qui attendait depuis la dernière visite.
  useEffect(() => {
    setUpServiceWorker();
    const timer = setTimeout(() => {
      void reload().then(() => flush());
    }, 0);
    return () => clearTimeout(timer);
  }, [flush, reload]);

  // Les autres onglets mettent à jour leur liste.
  useEffect(() => {
    if (!("BroadcastChannel" in window)) {
      return;
    }
    const broadcast = new BroadcastChannel(CHANNEL);
    channel.current = broadcast;
    broadcast.onmessage = () => void reload();
    return () => {
      broadcast.close();
      channel.current = null;
    };
  }, [reload]);

  // Reprises : retour du réseau, retour sur l'onglet, et sonde tant que quelque chose manque.
  useEffect(() => {
    const onOnline = () => {
      setUnreachable(false);
      void flush();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void flush();
      }
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);

  const waiting = items.some((item) => item.error === null);
  useEffect(() => {
    if (!unreachable && !waiting) {
      return;
    }
    const timer = setInterval(() => {
      void fetch(HEALTH_PROBE_URL, { cache: "no-store" })
        .then(() => {
          setUnreachable(false);
          return flush();
        })
        .catch(() => {
          setUnreachable(true);
        });
    }, RETRY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [flush, unreachable, waiting]);

  const value = useMemo<OutboxContextValue>(
    () => ({ items, online, needsLogin, enqueueNews, saveResult, removeItem, flush, subscribe }),
    [enqueueNews, flush, items, needsLogin, online, removeItem, saveResult, subscribe],
  );
  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}
