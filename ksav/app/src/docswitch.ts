// ---------------------------------------------------------------- the open document
//
// The app used to hold one nameless document in one localStorage key. It now
// holds a library; `runtime.currentDoc` is whichever one is open, and
// `runtime.currentBinding` is the real file it saves to, when it has one.
//
// This file refuses to answer for: the document set's metadata and its
// per-document editor states (`opendocs.ts`); the compartments a switched-in
// state must be reconfigured against and the state factory itself (main's
// notebook assembly — they arrive through the wiring); the tab strip and the
// panes (`tabstrip.ts`, `panestate.ts`), which the switch directs rather than
// performs.

import * as docs from "./docs";
import * as opendocs from "./opendocs";
import * as runtime from "./runtime";
import { setStatus, closeMenus, rerenderChrome } from "./runtime";
import type { EditorState } from "@codemirror/state";
import { flushSaves, saveNow, hasUnsavedFileChanges } from "./save";
import * as files from "./files";
import * as watch from "./watch";
import { spellCheckFromScratch } from "./spellcheck";
import { forgetDismissed } from "./diagview";
import { rememberPlaces, restorePlaces, showInEveryPane, restorePreviewPlaces, rememberPanes } from "./panestate";
import { rememberPages, showPagesFor, forgetPages } from "./preview";
import { retargetPanes, refreshTabStrip, enterDoc } from "./tabstrip";
import { refreshPaneHeads } from "./panehost";
import { openPanel, closePanel } from "./panels";
import { forgetGit } from "./gitui";
import { scheduleCompile } from "./compile";
import { setBaseline } from "./changes";
import { voidAction } from "./asyncaction";
import { el } from "./dom";
import { t, tf } from "./i18n";
import { ask, askText } from "./formmodal";
import { settings } from "./settings";
import * as paneplaces from "./paneplaces";

/**
 * What the switch machine borrows from the shell: the state factory (the
 * notebook assembly that builds an editor state, main's by the plan's own
 * holding) and the application-compartment reconfiguration a swap must run.
 */
export interface DocswitchWiring {
  makeState(body: string, prose: boolean, at?: number): EditorState;
  syncGlobals(): void;
}

let docswitchWiringInstance: DocswitchWiring | null = null;

/** Boot wires the switch machine's borrowings once. */
export function wireDocswitch(wiring: DocswitchWiring): void {
  docswitchWiringInstance = wiring;
}

export function docswitchWiring(): DocswitchWiring {
  if (!docswitchWiringInstance) {
    throw new Error("wireDocswitch was never called before a document was opened");
  }
  return docswitchWiringInstance;
}

/**
 * How many document switches have been asked for.
 *
 * `openDoc` awaits three times and mutates global state after each of them, and
 * its only guard was an early return for *the same* id — so two switches to
 * **different** documents, which is one click in the switcher panel or one
 * `Mod-1` tab key, interleaved freely. What that produced: `refreshBaseline()`
 * dispatching document A's snapshot baseline into a view now holding B,
 * `rememberPages(leaving)` filing B's on-screen pages under A's id, and
 * `retargetPanes(leaving, id)` relabelling panes for a document that is no
 * longer the one arriving.
 *
 * `setSwitching` looks like the guard and is not one: it is a flag the change
 * listener reads, it is cleared in the middle of the function, and it does not
 * stop a second entry.
 *
 * A ticket, the way `runCompile` and `runSpellCheck` take one — and the way this
 * very function's binding recall already does five lines from the end, which is
 * where the shape was read off. Its comment says *"a newer switch has won"*; the
 * rest of the function did not ask.
 */
let switchGeneration = 0;

export async function openDoc(id: string, opts: { handedOver?: boolean } = {}) {
  const mine = ++switchGeneration;
  const stale = () => mine !== switchGeneration;
  const next = await docs.getDoc(id);
  if (!next || stale()) return;
  // Already on screen — and *fully* so. Both halves are checked because closing
  // a document moves the open set's focus before this runs, so the set can name
  // a document the view is not yet showing.
  if (opendocs.focusedId() === id && runtime.currentDoc?.id === id) return;
  await flushSaves();
  // The last await before the synchronous run of mutations below. Everything
  // from here to `refreshBaseline` happens in one turn, so a newer switch can
  // only overtake at this line and at the one after it.
  if (stale()) return;
  runtime.setSwitching(true);
  stashFocused();
  const leaving = runtime.currentDoc?.id ?? null;
  // Where each pane is standing, before the document is taken out from under
  // them. The open set has one caret per document; a window has one per pane.
  // **Unless the caller has already done it**, which is not an optimisation:
  // this function yields twice before it reaches here, and a caller that has
  // rebuilt the panes cannot wait that long — see `handOverPages`. By the time
  // this line runs for such a caller, the pages on screen are the *arriving*
  // document's, and filing them under the departing one would put one sefer's
  // layout under another sefer's name, which is the defect this whole mechanism
  // exists to close.
  if (!opts.handedOver) {
    rememberPlaces(leaving);
    // Keep this document's pages before anything points somewhere else, so
    // coming back to it shows it rather than a blank pane and a wait. See
    // `showPagesFor` for the other half, and `preview.ts` for why the pages are
    // kept at all.
    if (leaving) rememberPages(leaving);
  }
  runtime.setCurrentDoc(next);
  docs.setCurrentId(next.id);
  // The incoming document is a different text; its first spell check must be a
  // full one, and the outgoing document's dirty region has no meaning here.
  spellCheckFromScratch();
  // Same rule, for the same reason, one line further out: a warning the writer
  // waved away is a fact they accepted about *that* sefer — its fonts, its
  // apparatus — and carrying it here would hide a true thing about this one.
  forgetDismissed();
  if (!opendocs.isOpen(id)) {
    opendocs.put({ id, state: docswitchWiring().makeState(next.body, !!settings.prose), scrollTop: 0, prose: !!settings.prose });
  }
  const entry = opendocs.focus(id)!;
  showInEveryPane(entry.state);
  docswitchWiring().syncGlobals();
  runtime.view.scrollDOM.scrollTop = entry.scrollTop;
  // …and then each pane that has been in this document before goes back to
  // where it was, which the line above can only answer for the focused one.
  restorePlaces(id);
  runtime.setSwitching(false);
  // The binding and the "as we found it" mtime stamp have no bearing on what is
  // drawn — `markInSync` in particular is a real filesystem stat, over IPC on
  // the desktop, on a path that may be a synced or network drive. Resolve them
  // after the text is on screen and let the title bar catch up when they land,
  // exactly as `boot()` does. Clear the outgoing binding first so nothing reads
  // the *previous* document's while the recall is in flight.
  runtime.setCurrentBinding(null);
  void files.recallBinding(next.id).then((b) => {
    // A newer switch may already have won; only stamp if this is still the doc.
    if (runtime.currentDoc?.id !== next.id) return;
    runtime.setCurrentBinding(b);
    return watch.markInSync(next.id, b);
  });
  // **Not** `save.markFileSaved()`. That used to be here, and with one global
  // flag for a library of documents it cleared the mark on the document being
  // *left* as well: switch away from an edited file and back, and the dot in
  // the title bar was gone and the write-back was skipped — a file with unsaved
  // changes reporting itself as saved.
  //
  // The flag is per document now, so there is nothing to clear: whatever was
  // true of this one is still true of it. Opening it says nothing new about
  // whether the file on disk has caught up, and pretending otherwise is what
  // the bug was.
  // The panes in this arrangement now show the incoming document, so the tab
  // can say what it is holding. See `retargetPanes` for why this is a mutation.
  retargetPanes(leaving, id);
  refreshTabStrip();
  rememberPanes();
  await refreshBaseline();
  // `refreshBaseline` reads the document out of the store and dispatches a
  // snapshot baseline into the view. A switch that started while it was in
  // flight has already put a different document there, and everything below —
  // `forgetGit`, `updateTitleBar`, `rerenderChrome`, `refreshPaneHeads`,
  // `showPagesFor`, `restorePreviewPlaces` — describes whichever document that
  // turn believes is current. Let the newer switch finish the job.
  if (stale()) return;
  // A different document is a different folder and possibly a different
  // repository. Anything version control learned about the last one is now a
  // claim about the wrong file, and a chip reporting three uncommitted changes
  // that belong to a sefer you closed is precisely the class of lie this
  // application is being audited for.
  forgetGit();
  updateTitleBar();
  rerenderChrome();
  // Narrowing rides with the document, because it is stored in the document's
  // state and `stashFocused` above put that state away with the anchor still in
  // it. Coming back to a sefer you were working through one siman at a time
  // finds you where you were. The strip has to be told, or it goes on naming the
  // section of the document you just left.
  refreshPaneHeads();
  runtime.view.focus();
  showPagesFor(id);
  // After the pages are drawn, for the reason `restorePreviewPlaces` gives:
  // there is nothing to scroll through until they are.
  restorePreviewPlaces(id);
  scheduleCompile();
}

/**
 * The open documents, as a list a person can look at and choose from.
 *
 * Most recently used first, which makes the *second* row the answer to "the one
 * I was just in" — the same order `lastDoc` jumps by, so the key and the panel
 * cannot disagree about what "last" means.
 */
export function openSwitcher() {
  if (opendocs.count() < 2) {
    setStatus(t("onlyOneOpen"), "");
    return;
  }
  const list = document.getElementById("switcher-list")!;
  list.replaceChildren(
    el("div", { class: "menu-cat" }, [t("openDocs")]),
    ...opendocs.openDocs().map((entry, i) => {
      const meta = docs.library().find((e) => e.id === entry.id);
      return el(
        "button",
        {
          class: "pal-item" + (i === 0 ? " active" : ""),
          onClick: () => {
            closePanel("switcher");
            voidAction("save_file", () => enterDoc(entry.id));
          },
        },
        [
          el("b", {}, [(i === 0 ? "● " : "") + (meta?.title ?? entry.id)]),
          el("span", { class: "menu-desc" }, [meta?.fileName ?? ""]),
        ],
      );
    }),
  );
  openPanel("switcher");
}

/** Straight to the document before this one. Nothing to do with one open. */
export function goToLastDoc() {
  const to = opendocs.previous();
  if (!to) {
    setStatus(t("onlyOneOpen"), "");
    return;
  }
  voidAction("save_file", () => openDoc(to));
}

/** Put what the view currently holds back into the open set, before leaving it. */
function stashFocused() {
  const id = opendocs.focusedId();
  if (!id || !runtime.view) return;
  opendocs.stash(id, runtime.view.state, runtime.view.scrollDOM.scrollTop);
}

/**
 * Close a document — put it away, do not destroy it.
 *
 * The distinction the inventory insists on, and the reason the control that does
 * this must never wear the `×` the Documents menu uses to delete: *"closing and
 * deleting appearing as the same glyph in two strips is not survivable"*. The
 * document stays in the library, with its text, its history and its file
 * binding; what goes is the open state — the caret, the undo stack, the scroll.
 *
 * Saved first, unconditionally. Closing something is exactly the moment a writer
 * assumes their work has been dealt with.
 */
export async function closeOpenDoc(id: string) {
  await flushSaves();
  if (opendocs.focusedId() === id) stashFocused();
  // No pane is standing in a document that is not open, and one that is
  // reopened is opened at its own caret. Keeping the rows would put a pane back
  // at a place in a sefer measured against a text edited since.
  paneplaces.forgetDoc(id);
  // And the file stamp — one of the two callers `watch.forget`'s comment names,
  // the other being the delete path below.
  //
  // **This comment used to say "Nothing called it", and it was wrong by the time
  // anyone read it** — the call is the next line. It described the state before
  // the fix, in the present tense, which is how #36 came to be filed: an audit
  // read `watch.forget`, found the call sites in the same file, and filed the
  // claim a second time against a comment that agreed with it. A note recording
  // what used to be true is worse than no note, because it is the kind that gets
  // believed.
  watch.forget(id);
  const next = opendocs.close(id);
  if (next) {
    // `openDoc` does the whole switch, and it proceeds because `runtime.currentDoc`
    // is still the document just closed. One path in, so a document arriving on
    // screen always arrives the same way.
    await openDoc(next);
    // *After* the switch, not before: leaving a document is what files its
    // pages, so releasing them first would be undone one line later. They are
    // megabytes of SVG for a tab that is no longer there.
    forgetPages(id);
    return;
  }
  // The last one. An editor with no document is not a state this application
  // has, so closing the only open document opens a new empty one rather than
  // leaving a writer looking at nothing.
  await newNamedDoc();
  forgetPages(id);
}

/**
 * Point the change gutter at this document's newest snapshot.
 *
 * Called whenever the comparison could have moved: on opening a document, and
 * after a snapshot is taken — at which point everything is unchanged again,
 * which is the honest reading and the reason the gutter clears itself rather
 * than accumulating a session's worth of green.
 *
 * A document with no history yet has no baseline, and the gutter shows nothing.
 * That is right: against nothing, every line is new, and a solid stripe down the
 * whole document says less than an empty gutter does.
 */
export async function refreshBaseline() {
  if (!runtime.currentDoc) return;
  let baseline: string | null = null;
  try {
    baseline = (await docs.latestSnapshot(runtime.currentDoc.id))?.body ?? null;
  } catch {
    // The history store being unreachable is reported by the code that writes
    // to it; a gutter is not the place to raise it a second time.
    baseline = null;
  }
  runtime.view.dispatch({ effects: setBaseline.of(baseline) });
}

export async function newNamedDoc() {
  closeMenus();
  await flushSaves();
  const doc = await docs.createDoc(t("untitled"), "");
  await openDoc(doc.id);
}

export async function duplicateDoc(id: string) {
  const src = await docs.getDoc(id);
  if (!src) return;
  // A duplicate is the same sefer, which includes how it is laid out. Copying
  // the body and leaving the page setup behind gave the copy this writer's
  // *new-document* default, so duplicating a Letter-sized document produced an
  // A4 one — the same fact going missing that `serializeDoc` used to drop.
  const copy = await docs.createDoc(
    src.title + " ‏(2)",
    src.body,
    src.assets,
    src.customCommands,
    src.config ?? {},
  );
  await enterDoc(copy.id);
}

/**
 * Delete a document from the library.
 *
 * Distinct from [`closeOpenDoc`], and the distinction is the point: this
 * destroys the sefer, that one puts it away. A deleted document also has to
 * leave the open set — an entry pointing at a record that no longer exists is a
 * switcher row that opens nothing.
 */
export async function removeDoc(id: string) {
  const entry = docs.library().find((e) => e.id === id);
  if (!entry) return;
  if (!(await ask(tf("confirmDeleteDoc", entry.title), { danger: true, okLabel: t("delete") }))) return;
  const wasFocused = opendocs.focusedId() === id;
  await docs.deleteDoc(id);
  await files.rememberBinding(id, null);
  paneplaces.forgetDoc(id);
  // The other half of what `watch.forget`'s comment describes: the binding is
  // gone, so the stamp is a claim about a file this document no longer has.
  watch.forget(id);
  const next = opendocs.close(id);
  if (wasFocused) {
    // Whatever was next in the open set, or the library's newest, or a new one.
    // Three fallbacks because all three are reachable: closing the last open
    // document of several, deleting the only open one, and deleting the last
    // document there is.
    const to = next ?? docs.library().find((e) => e.id !== id)?.id;
    if (to) await openDoc(to);
    else await newNamedDoc();
  } else {
    rerenderChrome();
  }
  // A deleted document's kept pages are a layout of text that no longer exists.
  // After the switch, for the reason `closeOpenDoc` gives.
  forgetPages(id);
}

export async function renameDoc() {
  const name = await askText(t("renamePrompt"), runtime.currentDoc.title);
  if (name === null) return;
  runtime.currentDoc.title = name.trim() || t("untitled");
  void saveNow();
  updateTitleBar();
  rerenderChrome();
}

/** The document title shown in the header, with the bound file beside it. */
export function updateTitleBar() {
  const el0 = document.getElementById("doc-title");
  if (!el0 || !runtime.currentDoc) return;
  el0.textContent = runtime.currentDoc.title;
  const sub0 = document.getElementById("doc-file");
  if (sub0) {
    // A dot when the bound file on disk is behind the editor. The writer used to
    // first hear of unsaved changes only in the browser's leave-page dialog,
    // though the save layer already knew — this surfaces it where the file is
    // named. Only shown when there is a file to be behind.
    //
    // **And only when there is a file at all.** A download-tier binding is the
    // *name* of a copy that left the browser once; there is nothing on the
    // other end of it to be behind, nothing any Save can bring up to date, and
    // a dot that can never be cleared is a warning the writer learns to ignore.
    // So the name still shows — it is how they know which copy they downloaded
    // — and the hover says what kind of thing it is.
    const real = files.canWriteBack(runtime.currentBinding);
    const dirty = real && hasUnsavedFileChanges();
    sub0.textContent = runtime.currentBinding ? (dirty ? "● " : "") + runtime.currentBinding.name : "";
    sub0.classList.toggle("dirty", dirty);
    sub0.title = runtime.currentBinding
      ? real
        ? (dirty ? t("unsavedChanges") + " · " : "") +
          (runtime.currentBinding.path || runtime.currentBinding.name)
        : t("copyOnly")
      : t("noFileBound");
  }
  document.title =
    (files.canWriteBack(runtime.currentBinding) && hasUnsavedFileChanges() ? "● " : "") +
    runtime.currentDoc.title +
    " · Ksav";
}

export function loadBody(body: string) {
  runtime.view.dispatch({
    changes: { from: 0, to: runtime.view.state.doc.length, insert: body },
    selection: { anchor: 0 },
  });
  closeMenus();
  runtime.view.focus();
  scheduleCompile();
}

/**
 * A blank document, opened the way the writer asked documents to open.
 *
 * Separate from `newNamedDoc`, which is the *fallback* after closing or
 * deleting the last open document — that one has to land in the arrangement
 * that is already on screen, because an editor with no document is not a state
 * this application has and a new tab for it is a tab nobody asked for.
 */
export async function newBlankDoc() {
  closeMenus();
  await flushSaves();
  const doc = await docs.createDoc(t("untitled"), "");
  await enterDoc(doc.id);
}

export function newDoc() {
  voidAction("save_file", () => newBlankDoc());
}
