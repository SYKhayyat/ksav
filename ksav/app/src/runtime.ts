// The things there is exactly one of.
//
// The editor view, the compute backend, the command registries, the open
// document. These used to be module-level mutables inside `main.ts`, which is
// why every feature had to live in `main.ts` too: a panel that needed the editor
// had nowhere else to get it from, and a 3,600-line file was the result.
//
// Putting them here inverts that. This module imports almost nothing, so
// anything may import it; ES module live bindings mean a `let` exported from
// here reads as the current value everywhere, without a getter for each one.
//
// Two hooks — `rerenderChrome` and `onOpenDoc` — are set by `main.ts` at boot
// rather than imported from it. A panel needs to be able to say "redraw the
// chrome" without depending on the module that draws it; a hook says that
// dependency is deliberate, where a circular import would only hide it.

import { docTextOf } from "./spans";
import { minimalChange } from "./diff";
import { history } from "@codemirror/commands";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Backend, CommandDef, CompileResult, TemplateDef } from "./api";
import type { KsavDoc } from "./docs";
import type { FileBinding } from "./files";

// ---------------------------------------------------------------- the editor

export let view: EditorView;

export function setView(v: EditorView) {
  view = v;
}

/** The document text as it stands right now. */
export function docText(): string {
  return view ? docTextOf(view.state.doc) : "";
}

/** Replace the whole document — what a template, a restore or a decision does. */
export function replaceAll(next: string) {
  const doc = docText();
  if (next === doc) return;
  view.dispatch({ changes: { from: 0, to: doc.length, insert: next } });
}

/**
 * Apply a rewritten document as the smallest change that produces it.
 *
 * Every producer here returns whole text, which is the right shape for a pure
 * function and the wrong thing to dispatch. `{from: 0, to: doc.length}` tells
 * CodeMirror that every character was replaced, so it discards the syntax tree,
 * the decorations, the lint marks and **every open fold** — including the
 * `//{ … //}` regions this app invites the writer to make. On a 500 KB sefer
 * that happened on every `†`: the document came out identical and the screen
 * did not, because everything the writer had collapsed was open again.
 *
 * `minimalChange` finds the span that actually differs, so the state either side
 * of it stays addressed by positions that did not move. See `diff.ts`.
 *
 * Not for *loading* a document — `openDoc`, `loadBody` and an arriving source
 * really do replace everything, and resetting the folds is correct there. This
 * is for the operations that edit the document the writer is already in.
 */
export function editDoc(next: string, caret?: number, extra: { scrollIntoView?: boolean } = {}) {
  // The writer touched the document, so a held status has served its purpose —
  // see `holdStatus`. Released here rather than on a timer because this is the
  // one funnel every edit goes through, and "until you type" is the moment the
  // compile report stops being a duplicate of what they just read.
  releaseStatus();
  const change = minimalChange(docTextOf(view.state.doc), next);
  const unchanged = change.from === change.to && change.insert === "";
  view.dispatch({
    // An operation can apply and still produce the same source — swapping two
    // identical rows is a real edit with no visible result. Dispatching the
    // document over itself would push an empty step onto the undo stack and
    // recompile for nothing, so only the caret moves.
    changes: unchanged ? undefined : change,
    ...(caret == null ? {} : { selection: { anchor: Math.min(caret, next.length) } }),
    ...extra,
  });
}

// ---------------------------------------------------------------- the undo history
//
// A **document swap is not an edit**, and this is where that stopped being a
// sentence in a comment and became a property of the program.
//
// `openDoc` used to switch documents by replacing the text of one long-lived
// editor. With one history for the life of that editor, the replace was an
// ordinary undoable edit, so Ctrl+Z after opening a second document wrote the
// *first* document's body onto the screen while the second one was the open
// document — and the change listener then persisted it there. One document's
// text inside another, and both of them mislabelled.
//
// The first fix here was a compartment the swap could reset. That is gone,
// because the open set replaced the swap itself: an open document *is* an
// `EditorState`, and a state carries its own history, so there is no stack to
// reset because there was never one stack. See `opendocs.ts`. What is left is
// the extension every state installs.

/** The undo history, as every document's state installs it. */
export function historyExtension(): Extension {
  return history();
}

/**
 * Put the cursor somewhere and scroll it into sight.
 *
 * `scroll: false` moves the caret and leaves the source pane where it is, for
 * the writer who set `outlineJump: "preview"` — they asked the outline to take
 * the *preview* to a chapter, and the caret still has to move because the
 * preview half is answered by asking the compiler where the caret printed. The
 * focus goes to the editor either way: the caret is there now, and leaving the
 * focus on the panel row would make the next arrow key scroll the list rather
 * than move the caret it just placed.
 */
export function jumpTo(pos: number, scroll = true) {
  const p = Math.min(pos, view.state.doc.length);
  view.dispatch({ selection: { anchor: p }, scrollIntoView: scroll });
  view.focus();
}

// ---------------------------------------------------------------- the engine

export let backend: Backend | undefined;
export let commandsReg: CommandDef[] = [];
export let templatesReg: TemplateDef[] = [];
/** The most recent compile, for the exports that reuse it. */
export let lastResult: CompileResult | null = null;

export function setBackend(b: Backend) {
  backend = b;
}
export function setRegistries(commands: CommandDef[], templates: TemplateDef[]) {
  commandsReg = commands;
  templatesReg = templates;
}

/**
 * Whether a fetched command list is one the chrome can be built from.
 *
 * An empty list is a **failure**, not a state this product can be in: the
 * toolbar, every menu, the palette and the completions are built from it, so a
 * successful fetch that returns nothing leaves an editor that takes text and
 * has no visible way to format any of it — and the fetch itself reported
 * success, so nothing shows a message. That is #105's live case on the desktop,
 * where the registry arrives in-process rather than over a fetch that can fail
 * loudly.
 *
 * Here rather than inside `main.ts` so the decision can be asserted; `main.ts`
 * cannot be imported by a test.
 */
export function registriesArrived(commands: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(commands) && commands.length > 0;
}
export function setLastResult(r: CompileResult | null) {
  lastResult = r;
}

/** A command from the registry by its Hebrew name. */
export function commandByName(he: string): CommandDef | undefined {
  return commandsReg.find((c) => c.he === he);
}

// ---------------------------------------------------------------- the document

export let currentDoc: KsavDoc;
export let currentBinding: FileBinding | null = null;
/** Set while switching documents, so the editor's own change events don't write
 *  the outgoing document's text over the incoming one. */
export let switching = false;

export function setCurrentDoc(d: KsavDoc) {
  currentDoc = d;
}
export function setCurrentBinding(b: FileBinding | null) {
  currentBinding = b;
}
export function setSwitching(v: boolean) {
  switching = v;
}

/** A filename stem from the document's title, safe on every platform. */
export function fileStem(): string {
  const raw = (currentDoc?.title ?? "ksav").trim();
  const safe = raw.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-");
  return safe || "ksav";
}

// ---------------------------------------------------------------- the chrome

/** A transient message in the status bar. */
/**
 * Put a line in the status bar.
 *
 * `detail` is the machine's own string, and it goes on `title` rather than into
 * `msg`. Six sites used to append it to a translated label, which made the
 * sentence half Hebrew and half whatever Rust or the browser happened to say.
 */
export function setStatus(msg: string, cls = "", detail = "") {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = msg;
  status.className = cls;
  if (detail) status.title = detail;
  else status.removeAttribute("title");
}

/**
 * A status that survives the compile report, until the writer next types.
 *
 * One slot, and the routine `✓ 3 pages · 20ms` is written into it after every
 * compile — which is fine when both messages are about the same thing and wrong
 * when the first one is news. Two places have produced the news:
 *
 *   - `insertSnippet`'s refusal, *"this section cannot be added here"*, wiped a
 *     few milliseconds later; that one was fixed by not compiling at all, which
 *     is not available to an import.
 *   - **an import's report** (#231): *"Imported מבחן — did not come across:
 *     pictures"*. The list of what was left behind is the whole reason
 *     `importAs` reports anything, and it was being erased before it could be
 *     read — so a writer importing forty pages with images learned that the
 *     document had forty pages.
 *
 * Released by the next edit rather than by a timer: a duration would be a number
 * nobody measured, and "until you touch the document" is the moment the compile
 * report stops being a duplicate of what the writer already knows. An **error**
 * compile writes over the hold, because a document that no longer compiles is
 * always the more urgent fact.
 */
let held: { msg: string; cls: string; detail: string } | null = null;

export function holdStatus(msg: string, cls = "", detail = "") {
  setStatus(msg, cls, detail);
  held = { msg, cls, detail };
}

/** Answered by the compile reporter before it overwrites the slot. */
export function statusIsHeld(): boolean {
  return held !== null;
}

/**
 * Put the held sentence back after a compile has finished with the slot.
 *
 * Suppressing the compile's report alone was not enough, and driving it showed
 * why: the compile writes `rendering…` when it *starts*, its verdict when it
 * ends, and a suppressed verdict left the slot reading *"rendering…"* for as long
 * as the hold lived — a worse silence than the one this fixes. So the compile
 * writes what it writes, and this puts the news back at the end of it.
 */
export function restoreHeldStatus() {
  if (held) setStatus(held.msg, held.cls, held.detail);
}

/** Called from the one funnel every edit goes through. */
export function releaseStatus() {
  held = null;
}

// The header's dropdowns are the other user of the `open` class, and `panels.ts`
// owns that class outright — otherwise the prohibition that keeps every surface
// in the registry would need an exemption, and an exemption is where this family
// of bugs lives. Re-exported rather than moved at every call site: nine modules
// close the menus before doing something else, and none of them is about panels.
export { closeMenus } from "./panels";

// Hooks the shell installs at boot. Default to no-ops so a module that fires one
// before `main.ts` has booted does nothing rather than throwing.
let rerenderHook: () => void = () => {};
let openDocHook: (id: string) => Promise<void> = async () => {};

export function onRerenderChrome(fn: () => void) {
  rerenderHook = fn;
}
export function onOpenDoc(fn: (id: string) => Promise<void>) {
  openDocHook = fn;
}

/** Rebuild the header and the settings drawer from current state. */
export function rerenderChrome() {
  rerenderHook();
}

/** Switch the editor to another document in the library. */
export function openDoc(id: string): Promise<void> {
  return openDocHook(id);
}
