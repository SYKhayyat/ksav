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
/**
 * v1 held only `handles`; v2 added the document and history stores; v3 takes the
 * asset *bytes* out of the document record and keys them by content hash.
 *
 * The upgrade needs no data migration: a v2 document carries its assets inline,
 * `docs.ts` still reads that shape, and the bytes move to this store the next
 * time the document is written. A schema change that has to rewrite everybody's
 * documents to be correct is a schema change that can lose them.
 */
const DB_VERSION = 3;

export const DOCS = "docs";
export const HISTORY = "history";
export const HANDLES = "handles";
/**
 * Asset bytes, keyed by content hash and shared between documents.
 *
 * They used to live inside the document record, which IndexedDB structured-clones
 * whole on every write. Autosave runs 600 ms after a pause in typing, so a sefer
 * with one 4 MB photo in it wrote 5.5 MB of base64 per pause, for a change of one
 * character. Keyed by hash rather than by document because the same logo in nine
 * chapters is one blob, and because a write that is already there is skipped.
 */
export const ASSETS = "assets";

const STORES = [DOCS, HISTORY, HANDLES, ASSETS] as const;
export type StoreName = (typeof STORES)[number];

/**
 * The schema, for anything that has to create this database without going
 * through `open()`.
 *
 * Exported because there was a second copy of it. `test/harness.mjs` opened
 * `ksav-files` at a hard-coded version 2 with a hard-coded list of three stores,
 * so adding a store here failed every storage test with
 * `VersionError: An attempt was made to open a database using a lower version`
 * — a message about the harness, pointing at the code under test. Two statements
 * of one schema, and the one that could not be wrong was the copy.
 */
export const SCHEMA: { readonly version: number; readonly stores: readonly StoreName[] } = {
  version: DB_VERSION,
  stores: STORES,
};

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

/**
 * Every record in a store, one at a time.
 *
 * `getAll` materialises the whole store at once, which is fine for the index and
 * wrong for the documents: `rebuildIndex` calls it to produce a list of *titles*
 * and holds every document body and every image in memory to do it — on the
 * recovery path, which runs exactly when the library is largest. A cursor lets
 * each record be collected as soon as the callback has taken what it wants.
 *
 * The callback must not await: an IndexedDB transaction commits as soon as its
 * event loop turn ends with no pending request, so anything asynchronous inside
 * one silently aborts it.
 */
export function forEach<T>(store: StoreName, visit: (value: T, key: string) => void): Promise<void> {
  return open().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        let transaction: IDBTransaction;
        try {
          transaction = db.transaction(store, "readonly");
        } catch (e) {
          reject(e);
          return;
        }
        const req = transaction.objectStore(store).openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          visit(cursor.value as T, String(cursor.key));
          cursor.continue();
        };
        transaction.oncomplete = () => resolve();
        const fail = (e: unknown) => reject(isQuotaError(e) ? new StorageFullError(e) : e);
        transaction.onabort = () => fail(transaction.error);
        transaction.onerror = () => fail(transaction.error);
        req.onerror = () => fail(req.error);
      }),
  );
}

/** The keys a store holds, without reading a single value. */
export function keys(store: StoreName): Promise<string[]> {
  return tx<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()).then((ks) =>
    ks.map((k) => String(k)),
  );
}

/** Several writes in **one** transaction, which is what makes them atomic. */
export function putMany(store: StoreName, entries: [string, unknown][]): Promise<void> {
  if (!entries.length) return Promise.resolve();
  return open().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        let transaction: IDBTransaction;
        try {
          transaction = db.transaction(store, "readwrite");
        } catch (e) {
          reject(e);
          return;
        }
        const s = transaction.objectStore(store);
        for (const [key, value] of entries) s.put(value, key);
        transaction.oncomplete = () => resolve();
        const fail = (e: unknown) => reject(isQuotaError(e) ? new StorageFullError(e) : e);
        transaction.onabort = () => fail(transaction.error);
        transaction.onerror = () => fail(transaction.error);
      }),
  );
}

/** Several reads in one transaction, in the order asked for. */
export function getMany<T>(store: StoreName, ids: string[]): Promise<(T | null)[]> {
  if (!ids.length) return Promise.resolve([]);
  return open().then(
    (db) =>
      new Promise<(T | null)[]>((resolve, reject) => {
        let transaction: IDBTransaction;
        try {
          transaction = db.transaction(store, "readonly");
        } catch (e) {
          reject(e);
          return;
        }
        const s = transaction.objectStore(store);
        const out: (T | null)[] = new Array(ids.length).fill(null);
        ids.forEach((id, i) => {
          const req = s.get(id);
          req.onsuccess = () => {
            out[i] = (req.result as T) ?? null;
          };
        });
        transaction.oncomplete = () => resolve(out);
        const fail = (e: unknown) => reject(isQuotaError(e) ? new StorageFullError(e) : e);
        transaction.onabort = () => fail(transaction.error);
        transaction.onerror = () => fail(transaction.error);
      }),
  );
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
  // `navigator` itself may not exist. Every browser and webview has one, but a
  // non-DOM host does not — Node before 21 is the one that caught this, where
  // the bare reference threw a ReferenceError instead of returning the null the
  // signature promises. A quota probe that is documented as advisory should
  // answer "cannot say" in that case, not throw out of the caller's save path.
  if (typeof navigator === "undefined") return null;
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
