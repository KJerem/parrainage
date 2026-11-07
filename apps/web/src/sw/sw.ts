/// <reference lib="esnext" />
/// <reference lib="webworker" />
import {
  CacheableResponsePlugin,
  NetworkFirst,
  NetworkOnly,
  type PrecacheEntry,
  Serwist,
  type SerwistGlobalConfig,
} from "serwist";
import {
  OFFLINE_FALLBACK_PAGE,
  OFFLINE_PAGES,
  OFFLINE_PAGES_CACHE,
  WARM_PAGES_MESSAGE,
} from "../lib/offline-config";

// Service worker du relais (plan §8). Il ne garde que le strict nécessaire : les fichiers statiques
// (précache) et les deux pages hors ligne. Rien d'autre n'entre jamais dans un cache : ni l'API, ni
// les médias (URL présignées), ni un autre espace. Pas de `defaultCache`, trop généreux pour des
// données d'enfants.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const offlinePages: readonly string[] = OFFLINE_PAGES;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      // Les pages hors ligne : le réseau d'abord, la copie gardée s'il ne répond pas. Une redirection
      // (session expirée) n'entre pas dans le cache : seule une page 200 y va.
      matcher: ({ request, url }) =>
        request.mode === "navigate" &&
        url.origin === self.location.origin &&
        offlinePages.includes(url.pathname),
      handler: new NetworkFirst({
        cacheName: OFFLINE_PAGES_CACHE,
        networkTimeoutSeconds: 5,
        matchOptions: { ignoreSearch: true, ignoreVary: true },
        plugins: [new CacheableResponsePlugin({ statuses: [200] })],
      }),
    },
    {
      // Toute autre page : le réseau seul ; hors ligne, la page d'attente ci-dessous.
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_FALLBACK_PAGE,
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

/** Une page en cache renvoie à des fichiers de sa version : une nouvelle version repart à vide. */
const activated = new Promise<void>((resolve) => {
  self.addEventListener("activate", (event) => {
    event.waitUntil(caches.delete(OFFLINE_PAGES_CACHE).then(() => resolve()));
  });
});

/**
 * Met en cache les pages hors ligne, même non visitées : une navigation dans l'appli passe par des
 * requêtes RSC, qui ne remplissent pas ce cache. Une redirection n'y entre pas.
 */
async function warmPages(): Promise<void> {
  await activated;
  const cache = await caches.open(OFFLINE_PAGES_CACHE);
  await Promise.all(
    offlinePages.map(async (path) => {
      try {
        const response = await fetch(path, {
          credentials: "same-origin",
          headers: { accept: "text/html" },
          redirect: "manual",
        });
        if (response.status === 200) {
          await cache.put(path, response);
        }
      } catch {
        // Hors ligne : la copie précédente reste.
      }
    }),
  );
}

self.addEventListener("message", (event) => {
  const { data } = event as ExtendableMessageEvent & { data?: { type?: string } };
  if (data?.type === WARM_PAGES_MESSAGE) {
    event.waitUntil(warmPages());
  }
});

serwist.addEventListeners();
