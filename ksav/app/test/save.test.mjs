// The writer's work, and the two places it is kept.
//
// `save.ts` and `files.ts` had no test between them, and they are the modules
// where a bug costs an evening rather than a re-render. Both were missing from
// `run.mjs`'s list.
//
// `save.ts`'s own header records why it exists: `runCompile` used to write the
// document to storage on its way to the renderer, before its own try block, so a
// storage failure stopped the render, was never caught, and **silently stopped
// every save after it**. The split is the fix. What was never asserted is the
// part of the fix a person would notice — that a failure is announced and stays
// announced, that a background write stands down rather than overwriting a file
// somebody else changed, and that the dot in the title bar means what it says.
//
// The autosave conflict check is the one to read closely. It is the guard the
// module was missing, and its comment is exact: "a background timer overwriting
// a file that somebody else changed is the quietest data loss there is: no
// error, no prompt, nothing in the log, and the other copy simply gone."

import { check, ok, notOk, installChrome } from "./harness.mjs";
import {
  hasConflict,
  clearConflict,
  hasUnsavedChanges,
  hasUnsavedFileChanges,
  markFileSaved,
  markFileDirty,
  dirtyDocuments,
  currentFailure,
  saveNow,
  flushSaves,
  onUpdateTitleBar,
  reportSaveFailure,
  autosaveToFile,
  saveRoute,
  FILE_AUTOSAVE_MS,
} from "../.tmp-test/save.mjs";
import { canWriteBack, supportsRealFiles, fileStamp } from "../.tmp-test/files.mjs";
import * as runtime from "../.tmp-test/runtime.mjs";
import * as docs from "../.tmp-test/docs.mjs";

const TAURI = { kind: "tauri", name: "kuntres.ksav", path: "/tmp/kuntres.ksav" };
const DOWNLOAD = { kind: "download", name: "kuntres.ksav" };

export async function run() {
  const chrome = installChrome();
  try {
    // ------------------------------------------------ which tier a binding is

    {
      // The three tiers are not interchangeable and the difference is exactly
      // "can this be written back to". The download tier never wrote a file
      // anywhere Ksav can find again, which is why every path that would write
      // to it has to ask first.
      ok("a desktop path can be written back to", canWriteBack(TAURI));
      ok("and a browser handle can", canWriteBack({ kind: "handle", name: "a", handle: {} }));
      notOk("a download cannot", canWriteBack(DOWNLOAD));
      notOk("and neither can no binding at all", canWriteBack(null));
      ok("the platform test answers without a window", typeof supportsRealFiles() === "boolean");
    }

    // ------------------------------------------------ what Ctrl+S can do
    //
    // The whole table, because the bug was in the composition and not in any of
    // its parts: *"Saving in browser is weird. I keep downloading. There is no
    // way to save it without many downloads of one file."*
    //
    // Every row below was individually correct before. `canWriteBack` was right
    // that a download binding cannot be written to; `saveAs` was right to fall
    // back to a download where there is no picker; and `saveFile` was right that
    // a document with nowhere to go should offer a Save As. Composed, they made
    // Ctrl+S download a new copy every time it was pressed — for ever, since no
    // number of downloads ever produces a binding that can be written back to.

    {
      const HANDLE = { kind: "handle", name: "kuntres.ksav", handle: {} };
      // A real file, and the platform that has it.
      check("a desktop path is written to", saveRoute(TAURI, true), "writeBack");
      check("so is a browser handle", saveRoute(HANDLE, true), "writeBack");

      // No file yet, on a platform that has them: ask where it goes. Once.
      check("an unbound document asks where to save", saveRoute(null, true), "pickAFile");

      // **The row this whole change is about.** Firefox: no picker, so nothing
      // can ever become writable, so Save keeps the text where it already is.
      check("with no file access, Save keeps it here", saveRoute(null, false), "libraryOnly");
      check(
        "and a downloaded copy does not make Save download another one",
        saveRoute(DOWNLOAD, false),
        "libraryOnly",
      );
      // On a browser that *does* have the picker, a leftover download binding is
      // not a file either — but there it can be made into one, so it asks.
      check("where a real file is possible, a copy is an invitation to make one",
        saveRoute(DOWNLOAD, true), "pickAFile");

      // Stated as the property rather than as three examples: no combination of
      // inputs routes a browser without file access anywhere but the library.
      const everyBinding = [null, DOWNLOAD, TAURI, HANDLE];
      check(
        "nothing routes to a picker where there is no picker",
        everyBinding.map((b) => saveRoute(b, false)).filter((r) => r === "pickAFile"),
        [],
      );
    }

    {
      // `fileStamp` answers null for every way it can fail, on the stated
      // grounds that every caller answers all of them the same way: there is
      // nothing to compare, so do not claim a conflict. A throw here would be a
      // *false* conflict, which stops a save that should have happened.
      check("a download tier has no stamp", await fileStamp(DOWNLOAD), null);
      check("a path that cannot be read has none either", await fileStamp({ kind: "tauri", name: "x" }), null);
      check(
        "and a handle that throws is null, not an exception",
        await fileStamp({
          kind: "handle",
          name: "x",
          handle: { getFile: () => Promise.reject(new Error("gone")) },
        }),
        null,
      );
    }

    // ------------------------------------------------ the dot in the title bar

    {
      // The flag is **per document** now, so these need one open. It was a
      // single global boolean for a library of documents, twelve lines from
      // `watch.known` — a `Map` keyed by document id, holding the other half of
      // the same question.
      runtime.setCurrentDoc({ id: "one", title: "one", body: "" });
      let redraws = 0;
      onUpdateTitleBar(() => redraws++);
      markFileSaved();
      check("a saved file is not dirty", hasUnsavedFileChanges(), false);

      redraws = 0;
      markFileDirty();
      ok("the first edit since a save shows the dot", hasUnsavedFileChanges());
      check("and redraws the title bar exactly once", redraws, 1);

      markFileDirty();
      check("a second edit does not redraw it again", redraws, 1);

      markFileSaved();
      notOk("saving clears the dot", hasUnsavedFileChanges());
      check("and redraws once more", redraws, 2);

      markFileSaved();
      check("saving an already-clean file redraws nothing", redraws, 2);
    }

    // ------------------------------------- and the dot belongs to a document
    //
    // The bug: one global boolean for a library. `openDoc` cleared it on every
    // switch, so editing a file, opening a second document and coming back lost
    // the dot **and** skipped the write-back — a file with unsaved changes
    // reporting itself as saved, on the one route where that costs the writer
    // their work.
    {
      runtime.setCurrentDoc({ id: "one", title: "one", body: "" });
      markFileDirty();
      ok("document one is dirty", hasUnsavedFileChanges());

      runtime.setCurrentDoc({ id: "two", title: "two", body: "" });
      notOk("switching to another document does not inherit the dot", hasUnsavedFileChanges());
      ok("…and one is still dirty, asked by name", hasUnsavedFileChanges("one"));

      markFileSaved();
      ok("saving two leaves one alone", hasUnsavedFileChanges("one"));

      runtime.setCurrentDoc({ id: "one", title: "one", body: "" });
      ok("coming back to one, the dot is still there", hasUnsavedFileChanges());
      check("and exactly one document is unwritten", dirtyDocuments(), ["one"]);

      markFileSaved();
      check("saving it clears only it", dirtyDocuments(), []);
    }

    // ------------------------------------------------ a failure that stays put

    {
      const removed = [];
      const appended = [];
      chrome.set("document", {
        getElementById: (id) => (id === "save-error" ? { remove: () => removed.push(id) } : chrome.nodes[id] ?? null),
        createElement: () => ({
          className: "",
          children: [],
          setAttribute() {},
          addEventListener() {},
          append(...c) { this.children.push(...c); },
        }),
        querySelectorAll: () => [],
        body: { append: (n) => appended.push(n) },
      });

      check("nothing has failed yet", currentFailure(), null);
      reportSaveFailure(new Error("disk on fire"));
      ok("a failure is recorded", !!currentFailure());
      ok("and it is a sentence, not a stack", !currentFailure().includes("    at "));

      const first = currentFailure();
      const removedBefore = removed.length;
      reportSaveFailure(new Error("disk on fire"));
      check("the same failure twice does not stack a second banner", removed.length, removedBefore);
      check("and the recorded failure is unchanged", currentFailure(), first);
    }

    // ------------------------------------------------ the background write

    {
      // Every reason to stand down, one at a time, because each of them is a
      // separate way for the timer to overwrite something it should not.
      clearConflict();
      markFileSaved();
      runtime.setCurrentBinding(TAURI);
      check(
        "a clean document is not written",
        await autosaveToFile(true, async () => "טקסט"),
        false,
      );

      markFileDirty();
      check(
        "and neither is a dirty one when autosave is off",
        await autosaveToFile(false, async () => "טקסט"),
        false,
      );

      runtime.setCurrentBinding(DOWNLOAD);
      check(
        "nor one bound to a tier that cannot be written to",
        await autosaveToFile(true, async () => "טקסט"),
        false,
      );

      runtime.setCurrentBinding(null);
      check(
        "nor one with no file at all",
        await autosaveToFile(true, async () => "טקסט"),
        false,
      );
      notOk("and none of those is a conflict", hasConflict());
    }

    {
      // The interval is a fact the file watcher and the settings text both
      // depend on, so it is stated once and asserted to be a sane one.
      check("the background write is every thirty seconds", FILE_AUTOSAVE_MS, 30_000);
    }

    // ------------------------------------------------ flushing before reading

    {
      // `flushSaves` is what export, Save-to-file and opening another document
      // await. With no open document it must resolve rather than hang — the
      // export path calls it before the writer has opened anything.
      runtime.setCurrentDoc(undefined);
      await flushSaves();
      ok("flushing with nothing open resolves", true);

      const doc = { id: "d1", title: "קונטרס", body: "פתיחה\n", updated: 1, assets: [] };
      runtime.setCurrentDoc(doc);
      runtime.setView({
        state: { doc: { toString: () => "פתיחה חדשה\n", length: 11 } },
        dispatch() {},
        focus() {},
      });
      await saveNow();
      const stored = await docs.getDoc("d1");
      ok("the open document reaches storage", !!stored);
      check("with the editor's text, not the stale copy", stored.body, "פתיחה חדשה\n");
      notOk("and nothing is left unsaved", hasUnsavedChanges());
    }

    {
      // Switching documents suspends saving, so the outgoing document's text
      // cannot be written over the incoming one. That flag is the whole reason
      // `runtime.switching` exists and nothing asserted it.
      const doc = { id: "d2", title: "אחר", body: "מקורי\n", updated: 1, assets: [] };
      runtime.setCurrentDoc(doc);
      runtime.setSwitching(true);
      await saveNow();
      check("nothing is written while switching", await docs.getDoc("d2"), null);
      runtime.setSwitching(false);
      await saveNow();
      ok("and it is written once the switch is done", !!(await docs.getDoc("d2")));
    }
  } finally {
    runtime.setSwitching(false);
    runtime.setCurrentBinding(null);
    chrome.restore();
  }
}
