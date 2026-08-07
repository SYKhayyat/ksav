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
  return core.invoke(cmd, args) as Promise<T>;
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
      return null; // the picker was dismissed
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

// ---------------------------------------------------------------- save

/** Write to the bound file. Returns false if this binding cannot be written to. */
export async function saveTo(binding: FileBinding, text: string): Promise<boolean> {
  if (binding.kind === "tauri" && binding.path) {
    try {
      await tauriInvoke("ksav_write_file", { path: binding.path, contents: text });
      return true;
    } catch {
      // The desktop shell only permits writes to paths chosen in a dialog this
      // session, so a binding recalled from a previous run is refused. That is
      // not an error to report — it is a Save-As, exactly as a browser handle
      // whose permission has lapsed becomes one.
      return false;
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
    try {
      const handle = await (window as never as {
        showSaveFilePicker(o: unknown): Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName: name,
        types: [{ description: "Ksav document", accept: { "text/plain": [".ksav"] } }],
      });
      const binding: FileBinding = { kind: "handle", name: handle.name, handle };
      await saveTo(binding, text);
      return binding;
    } catch {
      return null; // dismissed
    }
  }
  download(name, text);
  return { kind: "download", name };
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
    // Which file a document is bound to is a convenience; failing to remember it
    // must not stop the writer from saving.
  }
}

export async function recallBinding(docId: string): Promise<FileBinding | null> {
  try {
    return await store.get<FileBinding>(store.HANDLES, docId);
  } catch {
    return null;
  }
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
    /* no bindings readable is the same answer as no bindings */
  }
  return out;
}

/**
 * Re-ask for permission on a recalled handle. Browsers drop write permission
 * across sessions, so a handle that looks fine can still refuse to be written
 * until the user confirms — check before promising the writer a real save.
 */
export async function hasWritePermission(binding: FileBinding): Promise<boolean> {
  if (binding.kind === "tauri") return true;
  if (binding.kind !== "handle" || !binding.handle) return false;
  const h = binding.handle as never as {
    queryPermission(o: unknown): Promise<PermissionState>;
  };
  try {
    return (await h.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

export async function ensureWritable(binding: FileBinding): Promise<boolean> {
  if (binding.kind !== "handle" || !binding.handle) return binding.kind === "tauri";
  const h = binding.handle as never as {
    queryPermission(o: unknown): Promise<PermissionState>;
    requestPermission(o: unknown): Promise<PermissionState>;
  };
  try {
    if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
    return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}
