// What the editor's structure commands do to the document.
//
// These thirteen functions were `main.ts`'s, and they are the body behind the
// structure menu, the keymap and the ribbon: fold, hide, list, contents, entity
// edits, page setup. They were chosen as a first slice of `installHooks`'s
// twenty-seven dependencies because **none of them needs another main-local** —
// the dependency graph among those twenty-seven put every one of these at depth
// zero (or depth one, through `applyHiding`). Moving them costs one module and no
// seam, and it is what makes `installHooks` movable later.
//
// `applyHiding` came with them: eight lines, and the three hiding commands are
// the only callers.

import * as entity from "./entity";
import * as heads from "./headings";
import * as hiding from "./hiding";
import * as lists from "./lists";
import * as runtime from "./runtime";
import * as structure from "./structure";
import { EditorView } from "@codemirror/view";
import { unfoldAll, foldEffect, foldService } from "@codemirror/language";
import { docLang } from "./insert";
import { docTextNow, showChromeNotice } from "./ribbon";
import { docTextOf, scanDoc } from "./spans";
import { noteAction } from "./macros";
import { scheduleCompile } from "./compile";
import { setStatus, editDoc } from "./runtime";
import { settings, saveSettings, docConfig, ownPageSetup } from "./settings";
import { t, tf } from "./i18n";
import { updateContextBar } from "./contextbar";

export function applyHiding(edit: hiding.Edit) {
  runtime.view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.text },
    selection: { anchor: edit.select[0], head: edit.select[1] },
  });
  runtime.view.focus();
  scheduleCompile();
}

export function insertFold() {
  const sel = runtime.view.state.selection.main;
  applyHiding(hiding.foldAround(docTextOf(runtime.view.state.doc), sel.from, sel.to, t("foldName")));
}

export function hideBlockHere() {
  const sel = runtime.view.state.selection.main;
  applyHiding(hiding.hideBlock(docTextOf(runtime.view.state.doc), sel.from, sel.to, t("hiddenName")));
}

export function hideLineHere() {
  const sel = runtime.view.state.selection.main;
  applyHiding(hiding.hideLines(docTextOf(runtime.view.state.doc), sel.from, sel.to));
}

export function hiddenBreak() {
  const sel = runtime.view.state.selection.main;
  if (!sel.empty) return hideBlockHere();
  const text = "/*\n*/";
  runtime.view.dispatch({
    changes: { from: sel.from, insert: text },
    // After the closer, on the new line: the caret is where the writing
    // continues, and what is typed there joins the word before the break.
    selection: { anchor: sel.from + text.length },
  });
  runtime.view.focus();
  scheduleCompile();
}

export function makeListHere(): boolean {
  if (!runtime.view) return false;
  const sel = runtime.view.state.selection.main;
  const doc = docTextOf(runtime.view.state.doc);
  const made = lists.makeList(doc, sel.from, sel.to, "auto", docLang());
  if (!made) {
    setStatus(t(lists.listAt(doc, sel.from) ? "why.alreadyAList" : "why.nothingToList"), "warn");
    return true;
  }
  editDoc(made.text, made.caret);
  runtime.view.focus();
  return true;
}

export function replaceAll(text: string, caret: number) {
  editDoc(text, caret);
  scheduleCompile();
  runtime.view.focus();
}

export function addContentsHere(): boolean {
  if (!runtime.view) return false;
  const doc = docTextNow();
  const made = heads.addContents(doc, docLang());
  if (!made) {
    setStatus(t("why.contentsAlready"), "warn");
    return true;
  }
  editDoc(made.text, made.caret);
  runtime.view.focus();
  return true;
}

export function foldToLevel(view: EditorView, level: number) {
  unfoldAll(view);
  const doc = docTextOf(view.state.doc);
  const effects = [];
  for (const h of heads.sectionsToFold(doc, level)) {
    const line = view.state.doc.lineAt(h.from);
    for (const service of view.state.facet(foldService)) {
      const range = service(view.state, line.from, line.to);
      if (range) {
        effects.push(foldEffect.of(range));
        break;
      }
    }
  }
  if (effects.length) view.dispatch({ effects });
  setStatus(effects.length ? tf("foldLevel", String(level)) : t("noHeadings"), effects.length ? "ok" : "");
}

export function foldListsToDepth(view: EditorView, depth: number) {
  unfoldAll(view);
  const sc = scanDoc(view.state.doc);
  const effects = [];
  const seen = new Set<number>();
  for (const n of sc.nodes) {
    if (n.role !== "item" && n.role !== "list") continue;
    // Depth among *lists*, not among all calls: a list inside a footnote inside
    // a heading is still a top-level list to the reader, and counting the
    // wrappers would fold it as though it were three deep.
    let d = 0;
    for (let p = n.parent; p; p = p.parent) if (p.role === "list") d += 1;
    if (d < depth) continue;
    const line = view.state.doc.lineAt(n.from);
    if (seen.has(line.from)) continue;
    seen.add(line.from);
    for (const service of view.state.facet(foldService)) {
      const range = service(view.state, line.from, line.to);
      if (range) {
        effects.push(foldEffect.of(range));
        break;
      }
    }
  }
  if (effects.length) view.dispatch({ effects });
  setStatus(
    effects.length ? tf("foldListDepth", String(depth)) : t("noListsToFold"),
    effects.length ? "ok" : "",
  );
}

export function runStructureAction(action: structure.StructureAction, sticky = false): boolean {
  if (!runtime.view) return false;
  noteAction(action.id);
  const doc = docTextOf(runtime.view.state.doc);
  const caret = runtime.view.state.selection.main.head;
  const pos = sticky ? (structure.structureNear(doc, caret)?.pos ?? caret) : caret;
  const edit = action.run(doc, pos);
  if (!edit) return false;
  // An operation can apply and still produce the same source — swapping two
  // identical rows is a real edit with no visible result. Dispatching the
  // document over itself would push an empty step onto the undo stack and
  // recompile for nothing, so only the caret moves.
  const changed = edit.text !== doc;
  editDoc(edit.text, edit.caret, { scrollIntoView: true });
  if (changed) scheduleCompile();
  requestAnimationFrame(updateContextBar);
  return true;
}

export function entityAct(what: "select" | "unwrap" | "remove"): boolean {
  const view = runtime.view;
  const doc = docTextOf(view.state.doc);
  const sel = view.state.selection.main;
  const node = entity.entityAt(doc, sel.from, sel.to);
  if (!node) {
    setStatus(t("noEntityHere"), "warn");
    return true;
  }
  if (what === "select") {
    view.dispatch({ selection: { anchor: node.from, head: node.to }, scrollIntoView: true });
    setStatus(tf("entitySelected", node.name), "");
    return true;
  }
  const edit = what === "unwrap" ? entity.unwrap(doc, node) : entity.remove(doc, node);
  if (!edit) {
    // The construct whose text is not all in its body — `#סימן("א", […])`
    // carries the siman number as an argument. Unwrapping to the body alone
    // would drop it, which is the writer's text going missing quietly, so the
    // offer is the one that says what it does.
    setStatus(tf("entityKeepsNothing", node.name), "warn");
    return true;
  }
  editDoc(edit.text, edit.caret);
  if (edit.to !== undefined) {
    runtime.view.dispatch({ selection: { anchor: edit.caret, head: edit.to } });
  }
  scheduleCompile();
  setStatus(tf(what === "unwrap" ? "entityUnwrapped" : "entityRemoved", node.name), "ok");
  runtime.view.focus();
  return true;
}

export function adoptPageSetupAsDefault(): void {
  // One field, holding the same subtraction a document stores: only what
  // differs from the shipped defaults. This used to copy all thirty page fields
  // onto `settings` itself — which is how the app came to hold a second opinion
  // about every one of them, and how the panel came to print a margin the open
  // document was not laid out on.
  settings.newDocument = ownPageSetup(docConfig());
  saveSettings();
  showChromeNotice("setupIsDefault");
}
