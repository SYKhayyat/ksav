// The browser-side durable store.
//
// Everything that grows without bound — documents, their images and fonts, the
// version history — lives here rather than in `localStorage`.
//
// This is not a preference. `localStorage` gives a page roughly five megabytes
// *in total*, it is synchronous, and it signals exhaustion by throwing from the
// middle of a setter. Ksav filled it: a single 4 MB image became 5.3 MB of
// base64, eighty history snapshots of a 200 KB sefer became 16 MB, and the throw
// landed inside the compile path where nothing caught it — the editor said
// "rendering…" forever and every keystroke after that was lost. IndexedDB is
// asynchronous, is measured in hundreds of megabytes to gigabytes, and reports
// failure as a rejected promise the caller can actually show to the writer.
//
// The API is deliberately tiny: this is a key/value store with named buckets,
// not an ORM. Everything above it (`docs.ts`, `files.ts`) supplies the meaning.

const DB_NAME = "ksav-files";
/** v1 held only `handles`; v2 adds the document and history stores. */
const DB_VERSION = 2;

export const DOCS = "docs";
export const HISTORY = "history";
export const HANDLES = "handles";

const STORES = [DOCS, HISTORY, HANDLES] as const;
export type StoreName = (typeof STORES)[number];

/**
 * Raised when the browser refuses to store any more.
 *
 * Distinguished from every other failure because it is the one the writer can
 * do something about, and the one the UI must never swallow.
 */
export class StorageFullError extends Error {
  constructor(cause?: unknown) {
    super("storage full");
    this.name = "StorageFullError";
    this.cause = cause;
  }
}

function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    // A second tab holding an old version open would block the upgrade forever.
    req.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab"));
  });
  // A failed open must not be cached as a permanent verdict: a blocked upgrade
  // clears as soon as the other tab closes.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Run one transaction, resolving when it has actually committed. */
function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let transaction: IDBTransaction;
        try {
          transaction = db.transaction(store, mode);
        } catch (e) {
          reject(e);
          return;
        }
        const req = run(transaction.objectStore(store));
        let value: T;
        req.onsuccess = () => {
          value = req.result;
        };
        // Resolve on `oncomplete`, not `onsuccess`: a write is not durable until
        // the transaction commits, and "saved" must mean saved.
        transaction.oncomplete = () => resolve(value);
        const fail = (e: unknown) => reject(isQuotaError(e) ? new StorageFullError(e) : e);
        transaction.onabort = () => fail(transaction.error);
        transaction.onerror = () => fail(transaction.error);
        req.onerror = () => fail(req.error);
      }),
  );
}

export function get<T>(store: StoreName, key: string): Promise<T | null> {
  return tx<T | undefined>(store, "readonly", (s) => s.get(key)).then((v) => v ?? null);
}

export function put(store: StoreName, key: string, value: unknown): Promise<void> {
  return tx<IDBValidKey>(store, "readwrite", (s) => s.put(value, key)).then(() => undefined);
}

export function del(store: StoreName, key: string): Promise<void> {
  return tx<undefined>(store, "readwrite", (s) => s.delete(key)).then(() => undefined);
}

export function getAll<T>(store: StoreName): Promise<T[]> {
  return tx<T[]>(store, "readonly", (s) => s.getAll());
}

/** True when the store is usable at all — a private window may refuse it. */
export async function available(): Promise<boolean> {
  try {
    await open();
    return true;
  } catch {
    return false;
  }
}

/**
 * How much room is left, when the browser will say.
 *
 * Used to warn *before* an attachment is refused rather than after, and to give
 * the storage error a number in it instead of "something went wrong".
 */
export async function estimate(): Promise<{ usage: number; quota: number } | null> {
  const nav = navigator as Navigator & { storage?: StorageManager };
  if (!nav.storage?.estimate) return null;
  try {
    const e = await nav.storage.estimate();
    if (typeof e.usage !== "number" || typeof e.quota !== "number") return null;
    return { usage: e.usage, quota: e.quota };
  } catch {
    return null;
  }
}
