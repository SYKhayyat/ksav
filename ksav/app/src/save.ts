// Keeping the writer's text.
//
// Saving is its own concern, on its own timer, with its own error handling.
//
// It used to be a side effect of compiling: `runCompile` wrote the document to
// storage on its way to the renderer, *before* the try block. So when storage
// filled up, the write threw, the compile never ran, nothing caught it, the
// status line said "rendering…" forever — and every keystroke after that was
// discarded in silence. A writer typed four hundred thousand characters into a
// buffer that had stopped being persisted and had no way to know.
//
// Two rules come out of that, and they are the whole design here:
//   • Saving must not depend on rendering. A render is a convenience; a save is
//     the writer's work.
//   • A save that fails must be impossible to miss. Not a console line, not a
//     status flicker — a banner that stays until the problem is fixed.

import * as docs from "./docs";
import * as files from "./files";
import { el, noticeHost } from "./dom";
import { t } from "./i18n";
import * as runtime from "./runtime";
import { settings } from "./settings";
import { troubleSaid } from "./diagnostics";

const SAVE_DEBOUNCE_MS = 600;

let saveTimer: number | undefined;
/** Resolves when no save is in flight — awaited before anything reads storage. */
let savePending: Promise<void> = Promise.resolve();
/** True while the editor holds text that has not reached durable storage. */
let unsavedChanges = false;
/** True while the document differs from the file it is bound to. */
let unsavedToFile = false;
/** The failure currently on screen, so it is only rendered once. */
let saveFailure: string | null = null;

export function hasUnsavedChanges(): boolean {
  return unsavedChanges;
}
export function hasUnsavedFileChanges(): boolean {
  return unsavedToFile;
}
export function markFileSaved() {
  const was = unsavedToFile;
  unsavedToFile = false;
  if (was) updateTitleBar(); // the dot in the title bar clears
}
export function markFileDirty() {
  const was = unsavedToFile;
  unsavedToFile = true;
  if (!was) updateTitleBar();
}
export function currentFailure(): string | null {
  return saveFailure;
}

/** Queue a save of the open document. Cheap to call on every keystroke. */
export function scheduleSave() {
  if (!runtime.currentDoc || runtime.switching) return;
  unsavedChanges = true;
  const wasDirty = unsavedToFile;
  unsavedToFile = true;
  if (!wasDirty) updateTitleBar(); // first edit since the last file save: show the dot
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS);
}

/**
 * Write the open document to storage now.
 *
 * Serialised through `savePending` so two saves can never interleave, and so
 * callers that need the stored copy to be current (export, Save-to-file, opening
 * another document) can simply await it.
 */
export function saveNow(): Promise<void> {
  clearTimeout(saveTimer);
  if (!runtime.currentDoc || runtime.switching) return savePending;
  savePending = savePending.then(async () => {
    const doc = runtime.currentDoc;
    if (!doc || runtime.switching) return;
    doc.body = runtime.view ? runtime.docText() : doc.body;
    // A document the writer never renamed takes its title from its own first
    // heading, so the library is readable either way.
    if (doc.title === t("untitled")) {
      const guess = docs.guessTitle(doc.body, t("untitled"));
      if (guess && guess !== t("untitled")) {
        doc.title = guess;
        updateTitleBar();
      }
    }
    try {
      await docs.putDoc(doc);
      unsavedChanges = false;
      clearSaveFailure();
    } catch (e) {
      reportSaveFailure(e);
    }
  });
  return savePending;
}

/** Everything that must be in the store before we read it back out. */
export function flushSaves(): Promise<void> {
  return saveNow();
}

/** The shell's title bar, refreshed when a document is auto-titled. */
let updateTitleBar: () => void = () => {};
export function onUpdateTitleBar(fn: () => void) {
  updateTitleBar = fn;
}

/**
 * Put a storage failure in front of the writer and keep it there.
 *
 * Deliberately a modal-weight banner rather than a status message: the failure
 * mode this replaces was silent data loss, and the only safe response is to stop
 * the writer and tell them their text is not being kept.
 */
export function reportSaveFailure(e: unknown) {
  const full = e instanceof docs.StorageFullError;
  const bad = troubleSaid(e, "save_file");
  const msg = full ? t("storageFull") : `${t("saveFailed")} — ${bad.said}`;
  if (saveFailure === msg) return;
  saveFailure = msg;
  document.getElementById("save-error")?.remove();
  const banner = el("div", { id: "save-error", class: "save-error", role: "alert" }, [
    // The banner shows the sentence; the machine's own string is on the hover,
    // because the writer needs to know their text is not being kept and the bug
    // report needs the rest.
    el("span", { class: "save-error-text", title: bad.detail }, [msg]),
    el("button", { class: "save-error-act", type: "button", onClick: () => void saveNow() }, [
      t("retrySave"),
    ]),
    el("button", { class: "save-error-act", type: "button", onClick: exportBackup }, [
      t("downloadBackup"),
    ]),
  ]);
  noticeHost().append(banner);
}

function clearSaveFailure() {
  if (!saveFailure) return;
  saveFailure = null;
  document.getElementById("save-error")?.remove();
}

/**
 * The escape hatch from a full store: get the text out of the browser entirely.
 *
 * Offered on the failure banner itself, because "your work is not being saved"
 * is only half an answer without a way to rescue it.
 */
export function exportBackup() {
  const doc = runtime.currentDoc;
  files.download(
    `${runtime.fileStem()}.ksav`,
    docs.serializeDoc({ ...doc, body: runtime.docText() }, settings.customCommands),
  );
}

// ---------------------------------------------------------------- the bound file
//
// Keeping the bound file up to date on its own, the way the library copy is.
// Manual-only file saving means the .ksav on disk drifts behind the document
// every session, and the writer discovers it at the worst moment — when they
// open the file somewhere else.

export const FILE_AUTOSAVE_MS = 30_000;

/**
 * Write back to the bound file, if there is one and it is already authorised.
 *
 * Only ever writes to a binding that can be written back to and whose permission
 * is already granted: prompting for filesystem access out of a background timer
 * would be its own bug.
 */
export async function autosaveToFile(enabled: boolean, text: () => Promise<string>) {
  const binding = runtime.currentBinding;
  if (!unsavedToFile || !enabled || !binding || !files.canWriteBack(binding)) return false;
  if (!(await files.hasWritePermission(binding))) return false;
  try {
    if (!(await files.saveTo(binding, await text()))) return false;
    unsavedToFile = false;
    updateTitleBar(); // the background write cleared the file: drop the dot
    return true;
  } catch {
    // A background save that fails must not steal the writer's attention; the
    // next manual Save will report it properly.
    return false;
  }
}

// ---------------------------------------------------------------- leaving

/**
 * Don't let a close throw work away.
 *
 * Two different things can be unsaved, and they need different treatment. The
 * library copy is written on a short debounce, so on the way out we simply flush
 * it — no prompt, because there is nothing for the writer to decide. The *file*
 * on disk is another matter: only the writer knows whether they meant to save
 * it, so that one asks. Closing a tab with unsaved changes to a bound file used
 * to lose them with no prompt at all.
 */
export function wireUnloadGuard() {
  window.addEventListener("beforeunload", (e) => {
    if (unsavedChanges) void saveNow();
    const binding = runtime.currentBinding;
    if (saveFailure || (unsavedToFile && binding && files.canWriteBack(binding))) {
      e.preventDefault();
      // Browsers ignore the string and show their own wording, but returnValue
      // still has to be set for the prompt to appear at all.
      e.returnValue = "";
      return "";
    }
    return undefined;
  });
  // `beforeunload` is not guaranteed on mobile or when a tab is discarded;
  // `pagehide` is the one that actually fires there.
  window.addEventListener("pagehide", () => {
    if (unsavedChanges) void saveNow();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && unsavedChanges) void saveNow();
  });
}
