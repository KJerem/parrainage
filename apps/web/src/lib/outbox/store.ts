import { deleteDB, type IDBPDatabase, openDB } from "idb";
import { OUTBOX_DB_NAME } from "@/lib/offline-config";
import type { OutboxItem, OutboxStore, StoredItem } from "./core";

const STORE = "items";
const USER_INDEX = "userId";

let database: Promise<IDBPDatabase> | null = null;

function open(): Promise<IDBPDatabase> {
  database ??= openDB(OUTBOX_DB_NAME, 1, {
    upgrade(db) {
      // Clé croissante : l'ordre d'arrivée, lu au curseur.
      const store = db.createObjectStore(STORE, { keyPath: "seq", autoIncrement: true });
      store.createIndex(USER_INDEX, USER_INDEX);
    },
    // Une purge dans un autre onglet : on lâche la base au lieu de la bloquer.
    blocking() {
      void database?.then((db) => db.close());
      database = null;
    },
  });
  return database;
}

/** File d'attente dans IndexedDB : elle survit à la fermeture de l'onglet. */
export const indexedDbStore: OutboxStore = {
  async list(userId) {
    const db = await open();
    const items: StoredItem[] = [];
    let cursor = await db.transaction(STORE).store.index(USER_INDEX).openCursor(userId);
    while (cursor) {
      items.push(cursor.value as StoredItem);
      cursor = await cursor.continue();
    }
    return items.sort((a, b) => a.seq - b.seq);
  },
  async add(item: OutboxItem) {
    const db = await open();
    return (await db.add(STORE, item)) as number;
  },
  async update(item) {
    const db = await open();
    await db.put(STORE, item);
  },
  async remove(seq) {
    const db = await open();
    await db.delete(STORE, seq);
  },
};

/** Nombre d'éléments en attente, tous comptes confondus (avertissement à la déconnexion). */
export async function countAllPending(): Promise<number> {
  const db = await open();
  return db.count(STORE);
}

/** Efface la base entière (déconnexion). */
export async function deleteOutbox(): Promise<void> {
  if (database) {
    const db = await database.catch(() => null);
    db?.close();
    database = null;
  }
  await deleteDB(OUTBOX_DB_NAME);
}
