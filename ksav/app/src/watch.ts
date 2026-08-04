// Noticing that the file changed underneath you.
//
// This is not a feature so much as a hole being closed. `files.ts` binds a
// document to a real path, and `save.ts` writes to it on a thirty-second timer —
// and nothing anywhere asked whether that file still held what Ksav last put
// there. Dropbox syncing an older copy down, a second Ksav window, a text editor
// open on the same file, `git checkout`: in every one of those the next
// autosave silently overwrote somebody's work with no error, no prompt and
// nothing in the log. That is the quietest kind of data loss there is.
//
// typstify has `service/filewatcher.go` for this and watches with fsnotify.
// Ksav needs the same answer through three different tiers, so the mechanism is
// a **stamp** — the file's modification time and size at the moment Ksav last
// read or wrote it — rather than a subscription. Polling a stamp works
// identically in Tauri, in a browser with a file handle, and on a timer or a
// window-focus event, and it needs no privileged watcher.
//
// The stamp is deliberately not a content hash. Reading the whole file to decide
// whether to read the whole file is the wrong shape, and mtime+size is what
// every other editor on the machine uses for exactly this.

import type { FileBinding } from "./files";
import { fileStamp } from "./files";

export interface FileStamp {
  /** Milliseconds since the epoch. */
  mtime: number;
  size: number;
}

/**
 * Do two stamps describe the same file contents?
 *
 * A missing stamp on either side means "cannot tell", and cannot-tell is
 * reported as *unchanged*. That direction is chosen deliberately: the cost of a
 * false "unchanged" is that a genuine conflict slips through and behaves exactly
 * as it did before this module existed, whereas the cost of a false "changed" is
 * a prompt on every single save on any platform that cannot stamp — which
 * teaches the writer to dismiss the prompt without reading it, and that is worse
 * than not having one.
 */
export function sameStamp(a: FileStamp | null, b: FileStamp | null): boolean {
  if (!a || !b) return true;
  return a.mtime === b.mtime && a.size === b.size;
}

/** The stamps of the files Ksav has read or written, by document id. */
const known = new Map<string, FileStamp | null>();

/** Record where a file stood the moment Ksav last agreed with it. */
export async function markInSync(docId: string, binding: FileBinding | null): Promise<void> {
  if (!binding) {
    known.delete(docId);
    return;
  }
  known.set(docId, await fileStamp(binding));
}

/** Forget a document — on close, or when its binding is replaced. */
export function forget(docId: string): void {
  known.delete(docId);
}

/** What Ksav believes the file looks like. Exposed for tests. */
export function believedStamp(docId: string): FileStamp | null | undefined {
  return known.get(docId);
}

export type Verdict = "unchanged" | "changed" | "unknown";

/**
 * Has the file moved since Ksav last agreed with it?
 *
 * `unknown` when there is nothing to compare against — a binding with no stamp,
 * or a document Ksav has never synchronised. The caller treats it as safe;
 * see `sameStamp` for why that is the right direction.
 */
export async function checkFile(docId: string, binding: FileBinding | null): Promise<Verdict> {
  if (!binding) return "unknown";
  const believed = known.get(docId);
  if (believed === undefined) return "unknown";
  const now = await fileStamp(binding);
  if (!believed || !now) return "unknown";
  return sameStamp(believed, now) ? "unchanged" : "changed";
}

/**
 * Poll for external changes.
 *
 * On window focus above all — the overwhelmingly common case is alt-tabbing back
 * from whatever else touched the file — and on a slow timer for the case where
 * Ksav has been the focused window all along while Dropbox worked in the
 * background. Thirty seconds, matching the file autosave, because the check is
 * two stat calls and the alternative is discovering the conflict *by* the
 * autosave.
 */
export const POLL_MS = 30_000;

export function watchForChanges(
  current: () => { docId: string; binding: FileBinding | null },
  onChanged: () => void,
): () => void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const { docId, binding } = current();
      if ((await checkFile(docId, binding)) === "changed") onChanged();
    } catch {
      // A stat that throws is a file that has been unplugged or unmounted. It is
      // not a conflict, and reporting it as one would be a prompt about a file
      // that is not there.
    } finally {
      busy = false;
    }
  };
  const onFocus = () => void tick();
  window.addEventListener("focus", onFocus);
  const timer = window.setInterval(() => void tick(), POLL_MS);
  return () => {
    window.removeEventListener("focus", onFocus);
    clearInterval(timer);
  };
}
