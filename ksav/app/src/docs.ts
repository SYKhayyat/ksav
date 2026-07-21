// The document store — many named documents, each with its own assets.
//
// Ksav used to hold exactly one document, in a single localStorage key, with no
// title: "Open" replaced whatever you were writing and there was no way back.
// That is a hard wall for anyone with more than one thing to write, so this
// module owns a library instead: a list of documents, each with a title, a body,
// and the images and fonts it uses.
//
// Storage layout (browser storage is the base tier; `files.ts` binds a document
// to a real file on top of it):
//
//   ksav.library   → [{id, title, updated, fileName?}]  — the index
//   ksav.doc.<id>  → {id, title, body, assets, updated}  — one document
//
// One key per document rather than one big blob: a library of seforim can run to
// megabytes once images are in it, and rewriting all of it on every keystroke
// would burn through the storage quota and stall the editor.

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

const LIBRARY_KEY = "ksav.library";
const DOC_PREFIX = "ksav.doc.";
const CURRENT_KEY = "ksav.currentDoc";
/** The single-document key used before there was a library. */
const LEGACY_KEY = "ksav.doc";

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

export function library(): LibraryEntry[] {
  return readJson<LibraryEntry[]>(LIBRARY_KEY, []).sort((a, b) => b.updated - a.updated);
}

function writeLibrary(list: LibraryEntry[]) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
}

export function getDoc(id: string): KsavDoc | null {
  const d = readJson<KsavDoc | null>(DOC_PREFIX + id, null);
  if (!d) return null;
  // Documents written before assets existed have no `assets` array.
  return { ...d, assets: d.assets ?? [] };
}

/** Persist a document and refresh its library entry. */
export function putDoc(doc: KsavDoc): void {
  const saved = { ...doc, updated: Date.now() };
  localStorage.setItem(DOC_PREFIX + saved.id, JSON.stringify(saved));
  const list = readJson<LibraryEntry[]>(LIBRARY_KEY, []);
  const i = list.findIndex((e) => e.id === saved.id);
  const entry: LibraryEntry = {
    id: saved.id,
    title: saved.title,
    updated: saved.updated,
    fileName: i >= 0 ? list[i].fileName : undefined,
  };
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  writeLibrary(list);
}

export function setFileName(id: string, fileName: string | undefined): void {
  const list = readJson<LibraryEntry[]>(LIBRARY_KEY, []);
  const i = list.findIndex((e) => e.id === id);
  if (i >= 0) {
    list[i] = { ...list[i], fileName };
    writeLibrary(list);
  }
}

export function deleteDoc(id: string): void {
  localStorage.removeItem(DOC_PREFIX + id);
  writeLibrary(readJson<LibraryEntry[]>(LIBRARY_KEY, []).filter((e) => e.id !== id));
  if (currentId() === id) localStorage.removeItem(CURRENT_KEY);
}

export function currentId(): string | null {
  return localStorage.getItem(CURRENT_KEY);
}

export function setCurrentId(id: string): void {
  localStorage.setItem(CURRENT_KEY, id);
}

export function createDoc(title: string, body = "", assets: DocAsset[] = []): KsavDoc {
  const doc: KsavDoc = { id: newId(), title, body, assets, updated: Date.now() };
  putDoc(doc);
  return doc;
}

/**
 * The document to open at startup, creating the library on first run.
 *
 * Anything written under the old single-document key is carried into the library
 * as a real document rather than dropped — losing someone's work to a storage
 * refactor would be unforgivable.
 */
export function openingDoc(starter: string, untitled: string): KsavDoc {
  const id = currentId();
  if (id) {
    const doc = getDoc(id);
    if (doc) return doc;
  }
  const first = library()[0];
  if (first) {
    const doc = getDoc(first.id);
    if (doc) {
      setCurrentId(doc.id);
      return doc;
    }
  }
  const legacy = localStorage.getItem(LEGACY_KEY);
  const doc = createDoc(untitled, legacy ?? starter);
  if (legacy !== null) localStorage.removeItem(LEGACY_KEY);
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
