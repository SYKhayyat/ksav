// The document store — many named documents, each with its own assets.
//
// Ksav used to hold exactly one document, in a single localStorage key, with no
// title: "Open" replaced whatever you were writing and there was no way back.
// That is a hard wall for anyone with more than one thing to write, so this
// module owns a library instead: a list of documents, each with a title, a body,
// and the images and fonts it uses.
//
// Storage layout:
//
//   IndexedDB `docs`     → {id, title, body, assets, updated}  — one document
//   IndexedDB `history`  → {docId, snapshots: [{t, body}]}     — per document
//   localStorage
//     ksav.library       → [{id, title, updated, fileName?}]   — the index
//     ksav.currentDoc    → the id of the open document
//
// Documents live in IndexedDB, not localStorage. `localStorage` gives a page
// about five megabytes in total and throws when it fills, and Ksav filled it
// routinely: one 4 MB image is 5.3 MB once base64-encoded, and the history was
// eighty whole copies of the document under a single key. See `store.ts` for the
// full account.
//
// The *index* stays in localStorage on purpose. It is a few hundred bytes per
// document, and menus need it synchronously while they are being built; it is
// a cache, and `init` rebuilds it from IndexedDB whenever it goes missing or
// disagrees, so it can never become the authority on what exists.

import * as store from "./store";
import { DOCS, HISTORY, StorageFullError } from "./store";

export { StorageFullError };

export interface DocAsset {
  /** The name the document refers to, e.g. "logo.png". */
  name: string;
  /** base64, optionally with a `data:` URL prefix. */
  data: string;
  kind: "image" | "font";
}

export interface KsavDoc {
  id: string;
  title: string;
  body: string;
  assets: DocAsset[];
  updated: number;
}

export interface LibraryEntry {
  id: string;
  title: string;
  updated: number;
  /** Name of the file this document is bound to, when it is bound to one. */
  fileName?: string;
}

/** One point in a document's own history. */
export interface Snapshot {
  t: number;
  body: string;
}

interface HistoryRecord {
  docId: string;
  snapshots: Snapshot[];
}

const LIBRARY_KEY = "ksav.library";
const CURRENT_KEY = "ksav.currentDoc";
/** The single-document key used before there was a library. */
const LEGACY_DOC_KEY = "ksav.doc";
/** The per-document keys used while documents still lived in localStorage. */
const LEGACY_DOC_PREFIX = "ksav.doc.";
/** The one global history key, before history was scoped to a document. */
const LEGACY_HISTORY_KEY = "ksav.history";

/**
 * How much history one document keeps.
 *
 * Both a count and a byte ceiling, because either alone is wrong: fifty
 * snapshots of a sefer is tens of megabytes, and a byte cap alone would let a
 * one-line document accumulate snapshots without end.
 */
export const MAX_SNAPSHOTS = 50;
export const MAX_HISTORY_BYTES = 2 * 1024 * 1024;

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------- the index

let index: LibraryEntry[] = [];

export function library(): LibraryEntry[] {
  return index.slice().sort((a, b) => b.updated - a.updated);
}

/**
 * Persist the index.
 *
 * Wrapped because the index is a cache: if localStorage refuses it, the
 * documents themselves are still safe in IndexedDB and `init` will rebuild the
 * index next time. Losing the cache must not look like losing the work.
 */
function writeIndex() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(index));
  } catch {
    /* the index is rebuildable; see init() */
  }
}

function entryFor(doc: KsavDoc, fileName?: string): LibraryEntry {
  return { id: doc.id, title: doc.title, updated: doc.updated, fileName };
}

function upsert(entry: LibraryEntry) {
  const i = index.findIndex((e) => e.id === entry.id);
  if (i >= 0) index[i] = entry;
  else index.push(entry);
  writeIndex();
}

// ---------------------------------------------------------------- documents

export async function getDoc(id: string): Promise<KsavDoc | null> {
  const d = await store.get<KsavDoc>(DOCS, id);
  if (!d) return null;
  // Documents written before assets existed have no `assets` array.
  return { ...d, assets: d.assets ?? [] };
}

/**
 * Persist a document and refresh its library entry.
 *
 * The index is updated synchronously so a menu built in the same tick already
 * shows the new title; the durable write is awaited by the caller, which is
 * what makes "saved" mean saved. Rejects with `StorageFullError` when the
 * browser refuses — callers must surface that, never swallow it.
 */
export function putDoc(doc: KsavDoc): Promise<void> {
  const saved: KsavDoc = { ...doc, assets: doc.assets ?? [], updated: Date.now() };
  doc.updated = saved.updated;
  const existing = index.find((e) => e.id === saved.id);
  upsert(entryFor(saved, existing?.fileName));
  return store.put(DOCS, saved.id, saved);
}

export async function setFileName(id: string, fileName: string | undefined): Promise<void> {
  const i = index.findIndex((e) => e.id === id);
  if (i < 0) return;
  index[i] = { ...index[i], fileName };
  writeIndex();
}

export async function deleteDoc(id: string): Promise<void> {
  index = index.filter((e) => e.id !== id);
  writeIndex();
  if (currentId() === id) localStorage.removeItem(CURRENT_KEY);
  await Promise.all([store.del(DOCS, id), store.del(HISTORY, id)]);
}

export function currentId(): string | null {
  return localStorage.getItem(CURRENT_KEY);
}

export function setCurrentId(id: string): void {
  try {
    localStorage.setItem(CURRENT_KEY, id);
  } catch {
    /* which document was open is a nicety; the documents themselves are not */
  }
}

export async function createDoc(
  title: string,
  body = "",
  assets: DocAsset[] = [],
): Promise<KsavDoc> {
  const doc: KsavDoc = { id: newId(), title, body, assets, updated: Date.now() };
  await putDoc(doc);
  return doc;
}

// ---------------------------------------------------------------- history
//
// History used to be a single `ksav.history` key holding `{t, body}` records
// with no document id in them at all. With more than one document in the
// library that is not merely untidy, it is destructive: open A, restore a
// snapshot that came from B, and A's text is gone with no way back. Snapshots
// are per document now, and a restore can only ever offer this document's own.

export async function snapshots(docId: string): Promise<Snapshot[]> {
  const rec = await store.get<HistoryRecord>(HISTORY, docId);
  return rec?.snapshots ?? [];
}

/** Trim a history to the count and byte ceilings, oldest first. */
function trim(list: Snapshot[]): Snapshot[] {
  let kept = list.slice(-MAX_SNAPSHOTS);
  let bytes = kept.reduce((n, s) => n + s.body.length, 0);
  // Always keep the newest snapshot, even if it alone is over the ceiling:
  // a history of nothing is worse than a history that is slightly too big.
  while (kept.length > 1 && bytes > MAX_HISTORY_BYTES) {
    bytes -= kept[0].body.length;
    kept = kept.slice(1);
  }
  return kept;
}

/**
 * Record a snapshot of this document, unless it matches the newest one.
 *
 * Returns false when nothing was stored because nothing had changed, so a
 * caller can tell "already saved" from "just saved".
 */
export async function pushSnapshot(docId: string, body: string): Promise<boolean> {
  const list = await snapshots(docId);
  if (list.length && list[list.length - 1].body === body) return false;
  list.push({ t: Date.now(), body });
  const rec: HistoryRecord = { docId, snapshots: trim(list) };
  await store.put(HISTORY, docId, rec);
  return true;
}

// ---------------------------------------------------------------- startup

/**
 * Rebuild the index from the documents themselves.
 *
 * The index is a cache in localStorage and the documents are the truth in
 * IndexedDB, so any disagreement is resolved in favour of the documents. This
 * runs whenever the cache is empty or names a document that is not there —
 * including after a browser clears localStorage but keeps IndexedDB, which is
 * exactly the case where silently showing an empty library would look like the
 * work had been lost.
 */
async function rebuildIndex(): Promise<void> {
  const all = await store.getAll<KsavDoc>(DOCS);
  const byId = new Map(index.map((e) => [e.id, e]));
  index = all.map((d) => ({
    id: d.id,
    title: d.title,
    updated: d.updated ?? 0,
    // A rebuild must not throw away the file binding names it can still see.
    fileName: byId.get(d.id)?.fileName,
  }));
  writeIndex();
}

/**
 * Carry anything still in localStorage into IndexedDB.
 *
 * Losing someone's work to a storage refactor would be unforgivable, so this
 * moves both shapes that ever existed — the original single `ksav.doc` key and
 * the later `ksav.doc.<id>` library — and only removes the old key once the new
 * write has actually committed.
 */
async function migrateFromLocalStorage(): Promise<void> {
  const legacyKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LEGACY_DOC_PREFIX)) legacyKeys.push(k);
  }
  for (const key of legacyKeys) {
    const doc = readJson<KsavDoc | null>(key, null);
    if (!doc?.id) {
      localStorage.removeItem(key);
      continue;
    }
    try {
      await store.put(DOCS, doc.id, { ...doc, assets: doc.assets ?? [] });
      localStorage.removeItem(key);
    } catch {
      // Out of room in the new store too — leave the old copy where it is
      // rather than deleting the only copy that exists.
    }
  }
  // The pre-library single document, if it was never migrated into one.
  const legacy = localStorage.getItem(LEGACY_DOC_KEY);
  if (legacy !== null) {
    const doc: KsavDoc = {
      id: newId(),
      title: "",
      body: legacy,
      assets: [],
      updated: Date.now(),
    };
    try {
      await store.put(DOCS, doc.id, doc);
      localStorage.removeItem(LEGACY_DOC_KEY);
    } catch {
      /* keep the only copy */
    }
  }
  // The old global history is unattributable — there is no document id in the
  // records — so it cannot be split per document and is dropped rather than
  // offered under a document it may not belong to.
  localStorage.removeItem(LEGACY_HISTORY_KEY);
}

/**
 * Open the store and return the document to start in, creating the library on
 * first run. Must be awaited before anything else in this module is used.
 */
export async function init(starter: string, untitled: string): Promise<KsavDoc> {
  index = readJson<LibraryEntry[]>(LIBRARY_KEY, []).filter(
    (e): e is LibraryEntry => !!e && typeof e.id === "string",
  );
  await migrateFromLocalStorage();

  const id = currentId();
  if (id) {
    const doc = await getDoc(id);
    if (doc) {
      if (!index.some((e) => e.id === doc.id)) await rebuildIndex();
      return doc;
    }
  }
  if (!index.length) await rebuildIndex();

  for (const entry of library()) {
    const doc = await getDoc(entry.id);
    if (doc) {
      setCurrentId(doc.id);
      return doc;
    }
  }
  const doc = await createDoc(untitled, starter);
  setCurrentId(doc.id);
  return doc;
}

/**
 * A title guessed from the document's own first heading, so a writer who never
 * opens the rename box still gets a library they can read.
 */
export function guessTitle(body: string, fallback: string): string {
  const patterns = [
    /^\s*=+\s*(.+)$/m, // Typst heading:  = פרק א
    /#(?:שער|title)\[([^\]]+)\]/, // #שער[...]
    /#(?:כותרת1|h1)\[([^\]]+)\]/, // #כותרת1[...]
    /#(?:סימן|siman)\[([^\]]+)\]/, // #סימן[...]
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m?.[1]?.trim()) return m[1].trim().slice(0, 60);
  }
  const firstLine = body.split("\n").find((l) => l.trim() && !l.trim().startsWith("//"));
  return firstLine ? firstLine.trim().slice(0, 60) : fallback;
}

// ---------------------------------------------------------------- .ksav files
//
// A document with images cannot be a bare text file any more, so a .ksav file is
// JSON when it has assets and plain text when it does not. Plain text stays the
// common case, which keeps documents diffable, greppable and openable in any
// editor — a real consideration for someone keeping a sefer in git.

const FILE_MAGIC = "ksav-document";

export function serializeDoc(doc: KsavDoc): string {
  if (!doc.assets.length) return doc.body;
  return JSON.stringify(
    { format: FILE_MAGIC, version: 1, title: doc.title, body: doc.body, assets: doc.assets },
    null,
    2,
  );
}

export function parseDoc(text: string, fallbackTitle: string): { title: string; body: string; assets: DocAsset[] } {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const v = JSON.parse(text);
      if (v?.format === FILE_MAGIC) {
        return {
          title: typeof v.title === "string" && v.title ? v.title : fallbackTitle,
          body: typeof v.body === "string" ? v.body : "",
          assets: Array.isArray(v.assets) ? (v.assets as DocAsset[]) : [],
        };
      }
    } catch {
      // Not our JSON — fall through and treat it as an ordinary text document.
    }
  }
  return { title: fallbackTitle, body: text, assets: [] };
}

/** Split a document's assets into the two lists a compile request wants. */
export function requestAssets(assets: DocAsset[]): {
  assets: { name: string; data: string }[];
  fonts: { name: string; data: string }[];
} {
  return {
    assets: assets.filter((a) => a.kind !== "font").map(({ name, data }) => ({ name, data })),
    fonts: assets.filter((a) => a.kind === "font").map(({ name, data }) => ({ name, data })),
  };
}

/**
 * A unique asset name, so adding two files both called `image.png` does not make
 * the first one silently disappear from the document that referenced it.
 */
export function uniqueAssetName(existing: DocAsset[], name: string): string {
  const taken = new Set(existing.map((a) => a.name));
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; ; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}
