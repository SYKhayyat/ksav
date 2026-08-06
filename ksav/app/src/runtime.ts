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
  return view ? view.state.doc.toString() : "";
}

/** Replace the whole document — what a template, a restore or a decision does. */
export function replaceAll(next: string) {
  const doc = docText();
  if (next === doc) return;
  view.dispatch({ changes: { from: 0, to: doc.length, insert: next } });
}

/** Put the cursor somewhere and scroll it into sight. */
export function jumpTo(pos: number) {
  const p = Math.min(pos, view.state.doc.length);
  view.dispatch({ selection: { anchor: p }, scrollIntoView: true });
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
