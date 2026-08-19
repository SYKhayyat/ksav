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
import { ASSETS, DOCS, HISTORY, StorageFullError } from "./store";

export { StorageFullError };

export interface DocAsset {
  /** The name the document refers to, e.g. "logo.png". */
  name: string;
  /**
   * base64, optionally with a `data:` URL prefix.
   *
   * Always present in memory and on a `.ksav` file. **Absent in the stored
   * record**, where the bytes live in the `assets` store under `hash` — see
   * `fileAssets`. Empty here means the blob has gone missing, which is a
   * diagnostic rather than a reason to drop the asset.
   */
  data: string;
  kind: "image" | "font";
  /**
   * The content hash the bytes are filed under. Written by `fileAssets`, read
   * by `hydrateAssets`, and absent from anything a v2 record ever stored.
   */
  hash?: string;
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
 * How often a snapshot is taken by itself, if at all.
 *
 * > *"Automatic snapshots, or automatic turned off and taken by hand."*
 *
 * The cadence was `window.setInterval(… , 180000)` at the bottom of `main.ts`:
 * three minutes, written as a number, with no way to change it and no way to
 * stop it. A writer who wants their history to mean *the points I chose* — which
 * is what a history is for, and why every version-control system in the world
 * has a commit button rather than a clock — had nothing to turn off.
 *
 * Returns milliseconds, or `null` for *off, take them by hand*. The bounds are
 * here rather than in the settings row because they are a fact about the
 * feature: under a minute the store is being written to faster than anybody
 * types a paragraph, and over an hour it is not an automatic history, it is an
 * ambush. A number outside them is clamped rather than refused — the row is a
 * spinner, and a typed `999` should give the writer the longest gap on offer,
 * not silently keep the old one.
 */
export const MIN_SNAPSHOT_MINUTES = 1;
export const MAX_SNAPSHOT_MINUTES = 60;
export const DEFAULT_SNAPSHOT_MINUTES = 3;

export function autoInterval(on: boolean | undefined, minutes: number | undefined): number | null {
  // `undefined` is *on*: it is what every settings file written before this
  // existed says, and those writers have been getting automatic snapshots for
  // as long as the feature has been there. An absent field must never be read
  // as a preference the writer never expressed.
  if (on === false) return null;
  const m = Number.isFinite(minutes) ? (minutes as number) : DEFAULT_SNAPSHOT_MINUTES;
  const clamped = Math.min(MAX_SNAPSHOT_MINUTES, Math.max(MIN_SNAPSHOT_MINUTES, m));
  return Math.round(clamped * 60_000);
}

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
  // Memoised, because this is asked once per item inside several loops.
  //
  // It maps, sorts and maps again on every call, and the call sites do it per
  // element: `openSwitcher` runs `docs.library().find(...)` once per open
  // document; `buildTabStrip` and `openPaneMenu` build a `titleOf` that closes
  // over `docs.library()` and call it once per tab; `boot`'s `onGoToPart`,
  // `docBoundTo` and `movePaneToTab` do the same. That is O(n log n) per lookup
  // where O(1) is available — small today, and exactly the shape that gets
  // noticed at two hundred documents.
  //
  // Invalidated by `writeIndex`, which is the one place every mutation of
  // `index` ends up — `upsert`, `setFileName`, `deleteDoc` and `rebuildIndex`
  // all call it, and `init` assigns before anything can have asked. Keying the
  // memo on the array's identity would not do: `upsert` and `setFileName` write
  // *through* it.
  if (!librarySorted) {
    librarySorted = index
      .map((entry, i) => ({ entry, i }))
      .sort((a, b) => b.entry.updated - a.entry.updated || b.i - a.i)
      .map(({ entry }) => entry);
  }
  return librarySorted;
}

/** The last answer `library()` gave, or null when the index has moved since. */
let librarySorted: LibraryEntry[] | null = null;

/**
 * Persist the index.
 *
 * Wrapped because the index is a cache: if localStorage refuses it, the
 * documents themselves are still safe in IndexedDB and `init` will rebuild the
 * index next time. Losing the cache must not look like losing the work.
 */
function writeIndex() {
  // Every mutation of `index` passes through here, which is what makes this the
  // one line that has to invalidate `library()`'s memo. See it for why.
  librarySorted = null;
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
  return { ...d, assets: await hydrateAssets(d.assets ?? []) };
}

/**
 * Put the bytes back on a document's assets.
 *
 * Everything above this file sees a `DocAsset` with its `data` on it — the
 * compile request, the export, the `.ksav` file — and that stays true. Only the
 * *stored* record is thin.
 *
 * A record written before v3 carries its bytes inline, so an asset that already
 * has `data` is left exactly as it is. That is what makes the schema change
 * costless and safe: nothing has to be rewritten to be readable, and a document
 * that is never opened again is never touched.
 */
/** What a document record actually holds: the asset, minus its bytes. */
interface StoredAsset {
  name: string;
  kind: DocAsset["kind"];
  hash: string;
}

async function hydrateAssets(assets: DocAsset[]): Promise<DocAsset[]> {
  const wanted = assets.filter((a) => !a.data && a.hash);
  if (!wanted.length) return assets;
  const blobs = await store.getMany<{ data: string }>(
    ASSETS,
    wanted.map((a) => a.hash!),
  );
  const byHash = new Map<string, string>();
  wanted.forEach((a, i) => {
    if (blobs[i]?.data) byHash.set(a.hash!, blobs[i]!.data);
  });
  return assets.map((a) =>
    // An asset whose blob has gone is kept as an entry with no bytes rather than
    // dropped: the document still refers to it by name, and a missing image is a
    // diagnostic the writer can act on. Silently removing it would leave
    // `#תמונה("logo.png")` pointing at nothing with no trace of why.
    a.data || !a.hash ? a : { ...a, data: byHash.get(a.hash) ?? "" },
  );
}

/**
 * Write a document's asset bytes, and give back the thin records to store.
 *
 * Assets first, document second, and that order is the whole safety argument: if
 * the blob write fails, the document record still points at the previous version
 * of itself and nothing has been lost. The reverse order would commit a document
 * whose images are not there yet.
 *
 * A blob already under its hash is not rewritten. That is the point — the hash
 * is of the content, so the same image attached to nine chapters is one write,
 * and an autosave 600 ms after a pause in typing writes a few hundred bytes of
 * document instead of 5.5 MB of base64 that did not change.
 */
async function fileAssets(assets: DocAsset[]): Promise<StoredAsset[]> {
  if (!assets.length) return [];
  const thin = assets.map((a) => ({ name: a.name, kind: a.kind, hash: assetHash(a) }));
  const have = new Set(await store.keys(ASSETS));
  const writes: [string, unknown][] = [];
  const seen = new Set<string>();
  assets.forEach((a, i) => {
    const hash = thin[i].hash;
    if (have.has(hash) || seen.has(hash) || !a.data) return;
    seen.add(hash);
    writes.push([hash, { data: a.data }]);
  });
  await store.putMany(ASSETS, writes);
  return thin;
}

/**
 * Persist a document and refresh its library entry.
 *
 * The index is updated synchronously so a menu built in the same tick already
 * shows the new title; the durable write is awaited by the caller, which is
 * what makes "saved" mean saved. Rejects with `StorageFullError` when the
 * browser refuses — callers must surface that, never swallow it.
 */
export async function putDoc(doc: KsavDoc): Promise<void> {
  const saved: KsavDoc = { ...doc, assets: doc.assets ?? [], updated: Date.now() };
  doc.updated = saved.updated;
  const existing = index.find((e) => e.id === saved.id);
  upsert(entryFor(saved, existing?.fileName));
  // The stored record carries hashes, not megabytes. See `fileAssets`.
  const thin = await fileAssets(saved.assets);
  return store.put(DOCS, saved.id, { ...saved, assets: thin });
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
  await Promise.all([store.del(DOCS, id), store.del(HISTORY, id), store.del(HISTORY, id + LATEST_SUFFIX)]);
  // After the document is gone, never before: a sweep that ran first would see
  // this document's blobs as still referenced.
  await collectAssets().catch(() => {
    /* an uncollected blob costs space and nothing else; the delete succeeded */
  });
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

/**
 * A small pointer, kept beside the full record, holding only the newest
 * snapshot.
 *
 * `refreshBaseline` wants exactly one snapshot — the newest — and it runs on
 * boot and on every document open. Reaching it through `snapshots()` deserialized
 * the *whole* `HistoryRecord`, which is bounded by `MAX_HISTORY_BYTES` (a
 * ceiling, not a small number). This key holds just that one body, so the hot
 * read pays for one snapshot rather than the entire history.
 */
const LATEST_SUFFIX = "#latest";

export async function latestSnapshot(docId: string): Promise<Snapshot | null> {
  const ptr = await store.get<Snapshot>(HISTORY, docId + LATEST_SUFFIX);
  if (ptr) return ptr;
  // A history written before this pointer existed has none yet; fall back to the
  // full record once, and the next `pushSnapshot` lays the pointer down.
  const list = await snapshots(docId);
  return list.length ? list[list.length - 1] : null;
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
  const snap = { t: Date.now(), body };
  list.push(snap);
  const rec: HistoryRecord = { docId, snapshots: trim(list) };
  await store.put(HISTORY, docId, rec);
  // Lay down the small pointer refreshBaseline reads, so it never deserializes
  // the full record just to find the newest body.
  await store.put(HISTORY, docId + LATEST_SUFFIX, snap);
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
  const byId = new Map(index.map((e) => [e.id, e]));
  const rebuilt: LibraryEntry[] = [];
  // A cursor, not `getAll`. This produces a list of *titles*, and `getAll`
  // materialises every document body and (before v3) every base64 image in the
  // library simultaneously to do it — on the recovery path, which runs precisely
  // when the library is largest and the browser has just thrown away the cache.
  // Each record is now read, reduced to four fields, and dropped.
  await store.forEach<KsavDoc>(DOCS, (d) => {
    rebuilt.push({
      id: d.id,
      title: d.title,
      updated: d.updated ?? 0,
      // A rebuild must not throw away the file binding names it can still see.
      fileName: byId.get(d.id)?.fileName,
    });
  });
  index = rebuilt;
  writeIndex();
}

/**
 * Drop asset blobs no document refers to any more.
 *
 * Blobs are keyed by content hash and shared, so deleting a document cannot
 * delete its images — another document may be using the same one. Sweeping
 * instead of reference-counting is the safer shape: a count that drifts loses
 * somebody's picture, whereas a sweep that runs late merely keeps a few
 * megabytes longer than it needed to.
 *
 * Called after a delete, which is rare and asked for by a person. Reads through
 * a cursor for the same reason `rebuildIndex` does.
 */
export async function collectAssets(): Promise<void> {
  const referenced = new Set<string>();
  await store.forEach<KsavDoc>(DOCS, (d) => {
    for (const a of d.assets ?? []) if (a.hash) referenced.add(a.hash);
  });
  const stored = await store.keys(ASSETS);
  await Promise.all(stored.filter((h) => !referenced.has(h)).map((h) => store.del(ASSETS, h)));
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
  // The one assignment that does not go through `writeIndex` — nothing has read
  // the library yet at this point, but saying so costs a line and assuming it
  // costs a stale list on a second `init`.
  librarySorted = null;
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
