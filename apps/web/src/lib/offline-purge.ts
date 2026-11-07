import { OFFLINE_PAGES_CACHE, SERVICE_WORKER_SCOPE } from "./offline-config";
import { countAllPending, deleteOutbox } from "./outbox/store";

// Une fois déconnecté, rien ne doit rester sur le poste : ni page, ni fichier en attente, ni service
// worker. Chaque étape est indépendante : l'échec de l'une n'empêche pas les autres.

async function deleteAllCaches(): Promise<void> {
  if (!("caches" in window)) {
    return;
  }
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
}

async function unregisterServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) =>
        new URL(registration.scope).pathname.startsWith(SERVICE_WORKER_SCOPE),
      )
      .map((registration) => registration.unregister()),
  );
}

/** Une déconnexion ne reste jamais bloquée : le serveur demande aussi cet effacement. */
const PURGE_TIMEOUT_MS = 3000;

/** Efface les caches, la file d'attente et le service worker du relais. */
export async function purgeOfflineData(): Promise<void> {
  await Promise.race([
    Promise.allSettled([deleteAllCaches(), deleteOutbox(), unregisterServiceWorker()]),
    new Promise((resolve) => setTimeout(resolve, PURGE_TIMEOUT_MS)),
  ]);
}

/** Retire seulement les pages gardées (session expirée) : les saisies en attente restent. */
export async function forgetOfflinePages(): Promise<void> {
  if ("caches" in window) {
    await caches.delete(OFFLINE_PAGES_CACHE);
  }
}

/** Saisies qu'une déconnexion perdrait, 0 si la file est illisible. */
export async function pendingBeforeSignOut(): Promise<number> {
  try {
    return await countAllPending();
  } catch {
    return 0;
  }
}
