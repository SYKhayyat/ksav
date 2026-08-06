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

import { settingsPageSetup, ownPageSetup, readPageSetup } from "./settings";
import type { PageSetup } from "./settings";
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
  /**
   * The document's own `#let` definitions, when it carries them.
   *
   * Custom commands are otherwise an app-wide setting, so a `.ksav` that uses one
   * compiled for its author and failed for everyone else. A document opened from a
   * file that embedded them carries them here, and the compile prefers them over
   * the app-wide set — which keeps a shared sefer self-contained without
   * overwriting the reader's own commands. Absent for an ordinary local document,
   * which keeps using the app-wide set.
   */
  customCommands?: string;
  /**
   * This document's own page setup (B26).
   *
   * > *"Direction, font, margins and paper live in settings, so opening an
   * > English document and then a Hebrew one means changing direction by hand."*
   *
   * Absent on every document saved before B26, and on one nobody has changed the
   * setup of. Absent means *lay it out the shipped way* — see
   * `settings.docConfig`, which is the one place that decides.
   */
  config?: PageSetup;
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

/**
 * Remember a document's own page setup (B26).
 *
 * Its own function rather than a general `update`, because this is the one field
 * a writer changes by dragging a number in a panel — often, and while typing — and
 * it must not carry the body along with it and race the editor's own saves.
 */
export async function rememberConfig(id: string, config: PageSetup): Promise<void> {
  const doc = await store.get<KsavDoc>(DOCS, id);
  if (!doc) return;
  await store.put(DOCS, id, { ...doc, config, updated: Date.now() });
}

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

/**
 * The library, newest first.
 *
 * `updated` is a millisecond stamp, so two documents created in the same tick
 * tie — and `Array.prototype.sort` is stable, which meant the *older* of the two
 * won and "New document" could appear below the one it was made from. Ties are
 * broken by position, latest-added first, so the order is always the order the
 * writer would expect rather than whatever the clock granularity allowed.
 */
export function library(): LibraryEntry[] {
  return index
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => b.entry.updated - a.entry.updated || b.i - a.i)
    .map(({ entry }) => entry);
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
  customCommands?: string,
  config?: PageSetup,
): Promise<KsavDoc> {
  const doc: KsavDoc = { id: newId(), title, body, assets, updated: Date.now() };
  if (customCommands?.trim()) doc.customCommands = customCommands;
  // A *new* document starts laid out the way this writer has said new documents
  // should be (B26) — `settingsPageSetup`, which is what *set as default* writes.
  // Carried on the document from birth rather than left absent, so that changing
  // the default later does not re-lay-out every sefer already written.
  //
  // A document that came from somewhere — a file, a duplicate, an import — is
  // handed the setup it arrived with, and an **empty** setup is a real answer
  // rather than a missing one: it means *this document says nothing*, which
  // `docConfig` lays out with the shipped defaults. That is the difference
  // between a `.ksav` opening the same way on two machines and opening the way
  // whoever opened it happens to like new documents.
  doc.config = config ?? settingsPageSetup();
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

export function serializeDoc(doc: KsavDoc, fallbackCustom = ""): string {
  // The document's own custom commands travel with it so a `.ksav` that uses one
  // compiles for whoever opens it, not only its author. `fallbackCustom` is the
  // app-wide set, embedded for a local document that never carried its own.
  const custom = (doc.customCommands ?? fallbackCustom).trim();
  // And so does its page setup — which three pages of documentation promised for
  // as long as this function did not do it, and which is the whole of B26 seen
  // from outside: a sefer that opens the same way on someone else's machine.
  // `ownPageSetup` writes only what the shipped defaults do not already say, so
  // a document laid out the shipped way still leaves here as plain text.
  const config = ownPageSetup(doc.config);
  const hasConfig = Object.keys(config).length > 0;
  if (!doc.assets.length && !custom && !hasConfig) return doc.body; // the common case stays text
  return JSON.stringify(
    {
      format: FILE_MAGIC,
      version: 1,
      title: doc.title,
      body: doc.body,
      assets: doc.assets,
      ...(custom ? { customCommands: custom } : {}),
      ...(hasConfig ? { config } : {}),
    },
    null,
    2,
  );
}

export function parseDoc(
  text: string,
  fallbackTitle: string,
): {
  title: string;
  body: string;
  assets: DocAsset[];
  customCommands?: string;
  config?: PageSetup;
} {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const v = JSON.parse(text);
      if (v?.format === FILE_MAGIC) {
        return {
          title: typeof v.title === "string" && v.title ? v.title : fallbackTitle,
          body: typeof v.body === "string" ? v.body : "",
          assets: Array.isArray(v.assets) ? (v.assets as DocAsset[]) : [],
          customCommands: typeof v.customCommands === "string" ? v.customCommands : undefined,
          // Read through `readPageSetup` rather than cast: this is the one field
          // that goes on to a compile request, and the file it came from is one
          // somebody could have hand-edited.
          config: readPageSetup(v.config),
        };
      }
    } catch {
      // Not our JSON — fall through and treat it as an ordinary text document.
    }
  }
  return { title: fallbackTitle, body: text, assets: [] };
}

/**
 * A stable content hash for an asset, identifying its bytes so the engine can
 * cache them and the client can stop re-sending an unchanged 8 MB image on every
 * keystroke. Memoised per asset object: the document's asset array is stable
 * between edits, so each asset is hashed once, not once per compile.
 *
 * Two independent 32-bit FNV-1a passes plus the length, so a collision needs both
 * hashes and the length to coincide — vanishingly unlikely for the handful of
 * images a document carries, and a collision would at worst show a stale image,
 * never lose text.
 */
const assetHashes = new WeakMap<DocAsset, string>();

function assetHash(a: DocAsset): string {
  const cached = assetHashes.get(a);
  if (cached) return cached;
  const s = a.data;
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193);
  }
  const hash = `${s.length.toString(36)}-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`;
  assetHashes.set(a, hash);
  return hash;
}

/** Split a document's assets into the two lists a compile request wants, each
 *  entry carrying the content hash the engine dedupes on. */
export function requestAssets(assets: DocAsset[]): {
  assets: { name: string; hash: string; data: string }[];
  fonts: { name: string; hash: string; data: string }[];
} {
  const wire = (a: DocAsset) => ({ name: a.name, hash: assetHash(a), data: a.data });
  return {
    assets: assets.filter((a) => a.kind !== "font").map(wire),
    fonts: assets.filter((a) => a.kind === "font").map(wire),
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
