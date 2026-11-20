// Real files — open one, and save back to the same one.
//
// "Save" used to write a fresh `document.ksav` into the Downloads folder every
// time, and Open kept no handle, so you could never reopen a file and overwrite
// it: each save spawned another copy and there was no such thing as "the current
// file". This module gives a document a *binding* to somewhere real, and a Save
// that writes back to it.
//
// Three tiers, best first:
//   • Tauri desktop      — a native dialog and a genuine path on disk.
//   • File System Access — a real handle in the browser (Chrome/Edge today).
//   • Download fallback  — Firefox and Safari, where writing back is impossible.
//
// The fallback is deliberately honest rather than pretending: `canWriteBack` is
// false there, so the UI can say "Save a copy" instead of implying an overwrite
// that will not happen.

import * as store from "./store";
import { rawOf } from "./diagnostics";
import * as docs from "./docs";

export interface FileBinding {
  /** How this binding writes: which tier picked it up. */
  kind: "tauri" | "handle" | "download";
  /** Display name, e.g. `mishnayos.ksav`. */
  name: string;
  /** Absolute path — Tauri only. */
  path?: string;
  /** FileSystemFileHandle — browser handle tier only. */
  handle?: FileSystemFileHandle;
}

export interface OpenedFile {
  text: string;
  binding: FileBinding;
}

const EXT = "ksav";
const ACCEPT = ".ksav,.typ,.txt";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function hasFsAccess(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

/**
 * The file's modification time and size, or null when it cannot be read.
 *
 * The unit of "has this file changed underneath us" (see `watch.ts`). Null
 * rather than a throw for every reason it can fail — no path, no handle, the
 * file deleted, permission lapsed — because every one of those is answered the
 * same way by every caller: there is nothing to compare, so do not claim a
 * conflict.
 */
export async function fileStamp(binding: FileBinding): Promise<{ mtime: number; size: number } | null> {
  try {
    if (binding.kind === "tauri" && binding.path) {
      return await tauriInvoke<{ mtime: number; size: number } | null>("ksav_file_stamp", {
        path: binding.path,
      });
    }
    if (binding.kind === "handle" && binding.handle) {
      // `getFile` re-reads the directory entry, so this reflects what is on disk
      // now and not what it was when the handle was made.
      const f = await binding.handle.getFile();
      return { mtime: f.lastModified, size: f.size };
    }
  } catch {
    // silent: a binding whose file cannot be stat'ed has no mtime, and the
    // caller treats an unknown time as "cannot tell" rather than as a change.
    return null;
  }
  // The download tier has no file to look at: it never wrote one anywhere Ksav
  // can find again, which is exactly why `canWriteBack` is false for it.
  return null;
}

/** Can a binding of this kind be written back to, or only re-downloaded? */
export function canWriteBack(b: FileBinding | null): boolean {
  return !!b && b.kind !== "download";
}

/** True when this platform can bind a document to a file at all. */
export function supportsRealFiles(): boolean {
  return isTauri() || hasFsAccess();
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(cmd, args);
}

function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

// ---------------------------------------------------------------- open

export async function openFile(): Promise<OpenedFile | null> {
  if (isTauri()) {
    const res = await tauriInvoke<{ path: string; contents: string } | null>("ksav_open_file");
    if (!res) return null;
    return {
      text: res.contents,
      binding: { kind: "tauri", name: baseName(res.path), path: res.path },
    };
  }
  if (hasFsAccess()) {
    try {
      const [handle] = await (window as never as {
        showOpenFilePicker(o: unknown): Promise<FileSystemFileHandle[]>;
      }).showOpenFilePicker({
        types: [{ description: "Ksav document", accept: { "text/plain": [".ksav", ".typ", ".txt"] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      return { text: await file.text(), binding: { kind: "handle", name: handle.name, handle } };
    } catch {
      return null; // silent: the picker was dismissed
    }
  }
  return openViaInput();
}

/** The universal fallback: a hidden <input type=file>. No handle, so no write-back. */
function openViaInput(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.style.display = "none";
    let settled = false;
    // Set the moment a file is chosen, so the dismissal timeout below cannot
    // resolve `null` out from under a FileReader that is still reading a large
    // document — the race that used to drop an open with no word.
    let picked = false;
    const finish = (v: OpenedFile | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };
    input.addEventListener("change", () => {
      const f = input.files?.[0];
      if (!f) return finish(null);
      picked = true;
      const reader = new FileReader();
      reader.onload = () =>
        finish({ text: String(reader.result), binding: { kind: "download", name: f.name } });
      reader.onerror = () => finish(null);
      reader.readAsText(f);
    });
    // A dismissed picker fires no event in most browsers; releasing on the next
    // window focus keeps the promise from hanging forever — but only when nothing
    // was picked, so a big file gets as long as it needs to read.
    window.addEventListener(
      "focus",
      () => setTimeout(() => { if (!picked) finish(null); }, 800),
      { once: true },
    );
    document.body.append(input);
    input.click();
  });
}

/**
 * The prefix `ksav_write_file` puts on its own refusals.
 *
 * See `REFUSED` in `src-tauri/src/lib.rs`: our refusal means "ask where to put
 * it", the operating system's means "tell the writer what the disk said". One
 * string, both sides, no prose-matching of our own sentence.
 */
const PATH_REFUSED = "path-not-allowed";

// ---------------------------------------------------------------- save

/** Write to the bound file. Returns false if this binding cannot be written to. */
export async function saveTo(binding: FileBinding, text: string): Promise<boolean> {
  if (binding.kind === "tauri" && binding.path) {
    try {
      await tauriInvoke("ksav_write_file", { path: binding.path, contents: text });
      return true;
    } catch (e) {
      // **Two refusals arrive here and they need opposite answers.**
      //
      // The desktop shell only permits writes to paths chosen in a dialog this
      // session, so a binding recalled from a previous run is refused. That is
      // not an error to report — it is a Save-As, exactly as a browser handle
      // whose permission has lapsed becomes one. `ksav_write_file` names it with
      // `path-not-allowed`.
      //
      // Everything else is the *disk* refusing: no space left, access denied, a
      // read-only file system. This used to catch those too and return `false`,
      // so a full disk put a Save-As dialog in front of the writer, then another
      // when that failed, and never a sentence naming the cause — while
      // `fileui.saveFile`'s `catch`, which does name it, was unreachable on the
      // desktop because `saveTo` never threw. The words stayed in memory and in
      // the library either way, which is why the loss was of *information* only;
      // but a writer told "choose a place" while the real answer is "this disk is
      // full" will keep choosing places.
      //
      // A browser handle's write failure already throws through the other branch,
      // so this makes the two tiers behave the same way.
      if (rawOf(e).includes(PATH_REFUSED)) return false;
      throw e;
    }
  }
  if (binding.kind === "handle" && binding.handle) {
    const w = await (binding.handle as never as {
      createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
    }).createWritable();
    await w.write(text);
    await w.close();
    return true;
  }
  return false;
}

/**
 * Read the bound file again, without a picker.
 *
 * For taking the disk's version after the file changed underneath. `null` when
 * the tier cannot read back — the download tier never had a file to return to,
 * which is the same reason it cannot be written to.
 */
export async function reread(binding: FileBinding): Promise<string | null> {
  try {
    if (binding.kind === "tauri" && binding.path) {
      return await tauriInvoke<string>("ksav_read_file", { path: binding.path });
    }
    if (binding.kind === "handle" && binding.handle) {
      return await (await binding.handle.getFile()).text();
    }
  } catch {
    // silent: the file is gone, or the handle is no longer usable. There is
    // nothing to re-read and the caller asks the writer where it went.
    return null;
  }
  return null;
}

/** Ask where to save, write there, and return the new binding. */
export async function saveAs(suggestedName: string, text: string): Promise<FileBinding | null> {
  const name = suggestedName.endsWith("." + EXT) ? suggestedName : `${suggestedName}.${EXT}`;
  if (isTauri()) {
    const path = await tauriInvoke<string | null>("ksav_save_file", {
      suggested: name,
      contents: text,
    });
    if (!path) return null;
    return { kind: "tauri", name: baseName(path), path };
  }
  if (hasFsAccess()) {
    let handle: FileSystemFileHandle | null = null;
    try {
      handle = await (window as never as {
        showSaveFilePicker(o: unknown): Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName: name,
        types: [{ description: "Ksav document", accept: { "text/plain": [".ksav"] } }],
      });
    } catch {
      return null; // silent: dismissed, which is not a failure
    }
    const binding: FileBinding = { kind: "handle", name: handle.name, handle };
    // **The write is outside the `catch` that means "dismissed".**
    //
    // It was inside it, so a destination the writer *did* choose and the disk
    // then refused — a full disk, a read-only folder — came back as `null` and
    // the caller read that as "they closed the dialog": no sentence, no entry in
    // the library, nothing said, and a Save-As that did not happen looks exactly
    // like one that was called off. The picker's own rejection is the cancelled
    // dialog; the write's is a fault.
    await saveTo(binding, text);
    return binding;
  }
  download(name, text);
  return { kind: "download", name };
}

/**
 * Where an export goes (#127).
 *
 * Three answers, and the order is the point: a desktop build asks with the
 * system's own dialog, a browser with the File System Access API asks with its
 * own, and a browser without either downloads — which is the only thing it can
 * do, and is what every export did *everywhere* until this week. The writer
 * could not choose, on the one platform where choosing is normal.
 *
 * `bytes` and not `text`: a PDF is not text, and routing it through a string is
 * how an export becomes a corrupt file that opens to nothing.
 */
export interface ExportFile {
  /** What the dialog suggests — the document's stem and the right extension. */
  name: string;
  bytes: Uint8Array;
  /** The type the download fallback labels the blob with. */
  mime: string;
  /** The filter's name in the dialog: "PDF", "Typst document", … */
  filter: string;
  /** Extensions without dots. The first one is the one the name carries. */
  extensions: string[];
}

export type SaveOutcome = "saved" | "downloaded" | "cancelled";

/**
 * Ask for a destination and write the file there.
 *
 * `cancelled` is a real answer rather than an error: the writer changed their
 * mind, nothing was written, and the caller must not announce an export. It is
 * the third state the old one-way download could not have, and the reason the
 * caller's status line cannot simply be written before this resolves.
 */
export async function saveExportAs(file: ExportFile): Promise<SaveOutcome> {
  if (isTauri()) {
    const path = await tauriInvoke<string | null>("ksav_save_export", {
      suggested: file.name,
      filter: file.filter,
      extensions: file.extensions,
      base64: toBase64(file.bytes),
    });
    return path ? "saved" : "cancelled";
  }
  if (hasFsAccess()) {
    try {
      const handle = await (window as never as {
        showSaveFilePicker(o: unknown): Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName: file.name,
        types: [
          {
            description: file.filter,
            accept: { [file.mime]: file.extensions.map((e) => "." + e) },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(file.bytes as unknown as BufferSource);
      await writable.close();
      return "saved";
    } catch {
      // silent: the picker throws on dismissal, and it is the only throw that means
      // "no" — so a real failure is indistinguishable from a cancel here. Both
      // leave nothing written and nothing said, which is the safe reading.
      return "cancelled";
    }
  }
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([file.bytes as unknown as BlobPart], { type: file.mime }));
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return "downloaded";
}

/**
 * Bytes to base64, in chunks.
 *
 * `String.fromCharCode(...bytes)` on a whole PDF throws *Maximum call stack size
 * exceeded* — it is a spread of two million arguments — and it would throw
 * **after** the writer had picked their destination. Chunking is the difference
 * between an export and an exception.
 */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Next tick, not synchronously: Firefox starts the download after click()
  // returns, and revoking the URL in the same turn aborts it before it begins.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------- handle store
//
// A FileSystemFileHandle survives a reload, but only in IndexedDB — it is not
// JSON, so localStorage cannot hold it. Keeping them means a document is still
// bound to its file after the tab is closed and reopened, which is the whole
// point of having a "current file" at all.
//
// The store itself is `store.ts`, shared with the document library: one database
// with one version, so adding a bucket can never race with another module's
// upgrade.

export async function rememberBinding(docId: string, binding: FileBinding | null): Promise<void> {
  try {
    if (binding && binding.kind === "download") {
      // The audit's #154/#165: a download-tier row carried `kind` plus a name —
      // and the name is the library entry's `fileName`, written one line before
      // this on every path that opens a downloaded document. One redundant row
      // per download-bound document, and two places that can disagree about a
      // file that was never written anywhere.
      //
      // The row is not the artifact; the entry's name is. So the row goes: not
      // kept for new writes, and an old one dropped on sight — a store from an
      // earlier version converges instead of carrying the duplication forever.
      await store.del(store.HANDLES, docId);
      return;
    }
    if (binding) {
      await store.put(store.HANDLES, docId, {
        kind: binding.kind,
        name: binding.name,
        path: binding.path,
        handle: binding.handle,
      });
    } else {
      await store.del(store.HANDLES, docId);
    }
  } catch {
    // silent: which file a document is bound to is a convenience; failing to remember it
    // must not stop the writer from saving.
  }
}

async function recallBinding(docId: string): Promise<FileBinding | null> {
  try {
    return await store.get<FileBinding>(store.HANDLES, docId);
  } catch {
    // silent: nothing remembered for this document reads as nothing remembered —
    // the writer is asked to pick the file again.
    return null;
  }
}

/**
 * The binding this document is *still* bound to, download tier included.
 *
 * The two callers that restore a document's file state on entry and on boot ask
 * this rather than `recallBinding`, because the download tier's name no longer
 * lives in the handle store: it is read back off the library entry where it was
 * always written (`docs.library()`), so a document opened from a downloaded file
 * keeps its name in the title bar without a row duplicating it.
 *
 * The synthesis is honest rather than a convenience: the download tier is
 * exactly *"the document remembers a name and nothing else"* — no handle to ask
 * permission of, no path to stat, and `canWriteBack` is false — which is what
 * `{ kind: "download", name }` says.
 */
export async function bindingFor(docId: string): Promise<FileBinding | null> {
  const row = await recallBinding(docId);
  if (row) return row;
  const name = docs.library().find((e) => e.id === docId)?.fileName;
  return name ? { kind: "download", name } : null;
}

/**
 * Every remembered binding, in **one** transaction.
 *
 * `docBoundTo` — the check that stops opening the same sefer twice from filling
 * the library with duplicates of it — called `recallBinding` in a loop over the
 * whole library, and each call opens its own IndexedDB transaction and waits for
 * it to commit. That is one round trip per document, serially, on every Open, to
 * answer a question about a handful of bytes.
 */
export async function recallBindings(docIds: string[]): Promise<Map<string, FileBinding>> {
  const out = new Map<string, FileBinding>();
  try {
    const all = await store.getMany<FileBinding>(store.HANDLES, docIds);
    docIds.forEach((id, i) => {
      const b = all[i];
      if (b) out.set(id, b);
    });
  } catch {
    /* silent: no bindings readable is the same answer as no bindings */
  }
  return out;
}

/**
 * Re-ask for permission on a recalled handle. Browsers drop write permission
 * across sessions, so a handle that looks fine can still refuse to be written
 * until the user confirms — check before promising the writer a real save.
 */
export async function hasWritePermission(binding: FileBinding): Promise<boolean> {
  if (binding.kind === "tauri") {
    // Asked, not assumed.
    //
    // This returned `true` unconditionally, and it had no way to ask anything —
    // so it was a claim rather than an answer, and it was wrong for exactly the
    // case the shell's allow-list exists for: a binding recalled from a previous
    // session, whose path nobody has chosen in a dialog *this* session.
    //
    // What the claim cost: `autosaveToFile` went ahead on a path the shell would
    // refuse, `saveTo` caught the rejection, and the caller returned `false`
    // quietly — which is the right rule for a background save and the wrong
    // thing to do with an answer nobody could have got right. The desktop build
    // ran no autosave at all on a reopened document, silently, for the whole
    // session. See `ksav_path_allowed` in `src-tauri/src/lib.rs`.
    if (!binding.path) return false;
    try {
      return await tauriInvoke<boolean>("ksav_path_allowed", { path: binding.path });
    } catch {
      // silent: an older shell without the command. `false` is the honest reading:
      // this build cannot tell, and promising a save it may not be able to make
      // is the thing being fixed.
      return false;
    }
  }
  if (binding.kind !== "handle" || !binding.handle) return false;
  const h = binding.handle as never as {
    queryPermission(o: unknown): Promise<PermissionState>;
  };
  try {
    return (await h.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    // silent: a handle that cannot answer the permission question has not been
    // granted a write, and the caller treats "not granted" as "ask".
    return false;
  }
}

/**
 * What to say in the native confirmation, when one is needed.
 *
 * Passed in rather than looked up. This module reads and writes files and has
 * never known a word of either language the product speaks; importing `i18n`
 * to ask one question would make every file operation depend on the interface's
 * vocabulary. The caller knows which language the writer chose — that is the
 * caller's whole job — and the **path** is added by the shell itself, from the
 * string the write is actually checked against, so the dialog cannot name one
 * file while the allow-list admits another.
 */
export interface ConfirmWords {
  title: string;
  message: string;
  ok: string;
  cancel: string;
}

export async function ensureWritable(binding: FileBinding, words: ConfirmWords): Promise<boolean> {
  // The desktop's answer is now a real one, and it is the same question — so it
  // goes through the same function rather than being asserted here a second
  // time. This is the call Ctrl+S makes, and a `false` here is what routes it to
  // `saveFileAs`, which is the dialog that re-admits the path.
  // The desktop half, and it used to be the line above this one — a delegation
  // straight to `hasWritePermission`, which only *queries*.
  //
  // So the two functions were one function for a desktop path, and the one whose
  // name is a promise to obtain consent had no way to obtain any. The handle
  // branch below has always been honest about the difference: it queries, and if
  // the answer is no it **asks**. This did not, and the report was the
  // consequence — *"I got this: No write permission for that file — try Save
  // as."* — on a file that was perfectly writable and that the writer had chosen
  // in a dialog themselves, in an earlier session.
  //
  // `AllowedPaths` in the shell is per-process and is written by exactly two
  // things, the Open dialog and the Save-As dialog. A document reopened from
  // Ksav's own library carries a binding older than this process, so it is not on
  // the list, and nothing anywhere put it there.
  //
  // `ksav_confirm_write` is the missing half: a **native** dialog, which the
  // webview can neither draw nor answer, so a yes is still evidence that the
  // person and not the page asked for this. Once per session per path; a path
  // already admitted returns true without asking, so saving twenty times asks
  // once. The wording is passed in because this is where the writer's language
  // is known.
  if (binding.kind === "tauri") {
    if (await hasWritePermission(binding)) return true;
    if (!binding.path) return false;
    try {
      return await tauriInvoke<boolean>("ksav_confirm_write", {
        path: binding.path,
        message: words.message,
        title: words.title,
        okLabel: words.ok,
        cancelLabel: words.cancel,
      });
    } catch {
      // silent: an older shell without the command. `false` is the honest reading — the
      // same rule `hasWritePermission` follows — and the caller's answer to it
      // is Save-As, which re-admits the path through a dialog that has always
      // been there.
      return false;
    }
  }
  if (binding.kind !== "handle" || !binding.handle) return false;
  const h = binding.handle as never as {
    queryPermission(o: unknown): Promise<PermissionState>;
    requestPermission(o: unknown): Promise<PermissionState>;
  };
  try {
    if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
    return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    // silent: a handle that cannot ask for permission has not got it, and the
    // caller answers Save-As, which re-admits the path through a dialog.
    return false;
  }
}
