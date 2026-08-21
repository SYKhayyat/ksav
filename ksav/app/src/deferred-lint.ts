// The editor half of deferred note bodies: the jump, the hover, the lint.
//
// `deferred.ts` is the model — pure text in, edits out. This is the part that
// touches CodeMirror: a key that bounces between a marker and its prose, a
// hover that shows the prose without moving, and a lint for the two failures
// that deferring introduces and that the *page* cannot show you (a marker whose
// body was never written prints a red `?`; a body no marker points at prints
// nothing at all, which is worse).

import { docTextOf } from "./spans";
import { settings } from "./settings";

/**
 * Whether the bodies at the foot of the file are kept in one block per
 * apparatus.
 *
 * Read here, once, and handed to `deferred.ts` — which has never imported a
 * setting and is not going to start. Every path that *files* a body asks, and
 * that is the whole of the item's second sentence: a tidy that groups and an
 * insertion that appends is a setting that lies about itself.
 */
function grouping(): boolean {
  return settings.deferGrouped === true;
}
import { linter } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import { EditorView, hoverTooltip } from "@codemirror/view";
import {
  bodyOf,
  createBody,
  deferAllInlineNotes,
  deferInlineNote,
  inlineAllDeferredNotes,
  inlineDeferredNote,
  inlineNoteAt,
  insertDeferred,
  jump,
  problems,
  scan,
  sortBodies,
} from "./deferred";
import type { Problem } from "./deferred";
import { setStatus } from "./runtime";
import { t, tf } from "./i18n";

/** Replace the whole document and put the caret somewhere. */
function apply(view: EditorView, text: string, caret: number) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: { anchor: Math.min(caret, text.length) },
    scrollIntoView: true,
  });
}

function goTo(view: EditorView, pos: number) {
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  view.focus();
}

/**
 * The one key: go to the other half of whatever the caret is on.
 *
 * A marker sends you to its prose, the prose sends you back to its marker, and
 * a marker with no prose yet gets the line written for it rather than an error
 * message — the same three behaviours `C-c C-c` has in org-mode, which is the
 * entire reason anybody tolerates writing footnotes that way.
 */
export function jumpDeferred(view: EditorView): boolean {
  const text = docTextOf(view.state.doc);
  const j = jump(text, view.state.selection.main.head);
  if (!j) {
    setStatus(t("deferNothingHere"), "");
    return false;
  }
  if (j.kind === "toBody" || j.kind === "toMarker") {
    goTo(view, j.pos);
    setStatus(tf(j.kind === "toBody" ? "deferWentToBody" : "deferWentToMarker", j.name), "");
    return true;
  }
  if (j.kind === "bodyMissing") {
    const c = createBody(text, j.name, grouping());
    apply(view, c.text, c.caret);
    setStatus(tf("deferWroteBody", j.name), "ok");
    return true;
  }
  // A body nothing points at: the marker is what is missing, and only the
  // writer knows where in the sentence it belongs.
  setStatus(tf("deferOrphanHere", j.name), "warn");
  return true;
}

/**
 * Send the note under the caret to the end — or, with the caret in ordinary
 * text, start a new deferred note there.
 *
 * One action rather than two, because the answer to "what did you mean" is
 * always the same: leave a marker here and put me where the prose goes.
 */
export function deferHere(view: EditorView, lang: "he" | "en" = "he"): boolean {
  const text = docTextOf(view.state.doc);
  const pos = view.state.selection.main.head;
  const note = inlineNoteAt(text, pos);
  if (note) {
    // Exiling an existing note takes its spelling from the note itself; only a
    // note written from nothing has to be told the document's language.
    const c = deferInlineNote(text, pos, grouping());
    if (!c) return false;
    apply(view, c.text, c.caret);
    setStatus(t("deferMoved"), "ok");
    return true;
  }
  const c = insertDeferred(text, pos, null, lang, grouping());
  apply(view, c.text, c.caret);
  setStatus(t("deferStarted"), "ok");
  return true;
}

/** Bring the deferred note under the caret back inline. */
export function recallHere(view: EditorView): boolean {
  const text = docTextOf(view.state.doc);
  const c = inlineDeferredNote(text, view.state.selection.main.head);
  if (!c) {
    setStatus(t("deferCannotRecall"), "warn");
    return false;
  }
  apply(view, c.text, c.caret);
  setStatus(t("deferRecalled"), "ok");
  return true;
}

/** Send every inline note in the document to the end. */
export function deferAll(view: EditorView): boolean {
  const { text, moved } = deferAllInlineNotes(docTextOf(view.state.doc), grouping());
  if (!moved) {
    setStatus(t("deferNothingToMove"), "");
    return false;
  }
  apply(view, text, view.state.selection.main.head);
  setStatus(tf("deferMovedCount", moved), "ok");
  return true;
}

/**
 * Bring every deferred note back into its sentence.
 *
 * The other direction, and the one that was missing: *where the bodies live* is
 * only changeable after the fact if it is changeable both ways. A note whose
 * name carries two markers, or whose prose has not been written, is left where
 * it is and the count says so — a partly-deferred document is a legal one.
 */
export function inlineAll(view: EditorView): boolean {
  const { text, moved } = inlineAllDeferredNotes(docTextOf(view.state.doc));
  if (!moved) {
    setStatus(t("deferNothingToRecall"), "");
    return false;
  }
  apply(view, text, view.state.selection.main.head);
  setStatus(tf("deferRecalledCount", moved), "ok");
  return true;
}

/**
 * Put the list at the foot of the file back into reading order.
 *
 * The caret is left where it was rather than followed to a body: this is a tidy
 * of a part of the file the writer is not looking at, and yanking the view down
 * to the note list to prove it happened would be the opposite of the point. The
 * status line says how many moved.
 */
export function sortDeferredBodies(view: EditorView): boolean {
  const before = docTextOf(view.state.doc);
  const { text, moved } = sortBodies(before, settings.deferGrouped === true);
  if (text === before) {
    setStatus(t("deferAlreadySorted"), "");
    return false;
  }
  apply(view, text, view.state.selection.main.head);
  setStatus(moved ? tf("deferSortedCount", moved) : t("deferRenumbered"), "ok");
  return true;
}

// ---------------------------------------------------------------- the lint

function message(p: Problem): string {
  if (p.kind === "dangling") return tf("deferLintDangling", p.name);
  if (p.kind === "orphan") return tf("deferLintOrphan", p.name);
  return tf("deferLintDuplicate", p.name);
}

/** Remove a body, recomputing its span first — the writer may have typed since. */
function deleteBody(view: EditorView, name: string, which: "first" | "last") {
  const text = docTextOf(view.state.doc);
  const all = scan(text).defs.filter((d) => d.name === name);
  const d = which === "first" ? all[0] : all[all.length - 1];
  if (!d) return;
  // Take the whole line when the definition has one to itself, so removing a
  // body does not leave a blank line behind in the region.
  const ls = text.lastIndexOf("\n", d.from - 1) + 1;
  const leNext = text.indexOf("\n", d.to);
  const le = leNext < 0 ? text.length : leNext;
  const alone = text.slice(ls, d.from).trim() === "" && text.slice(d.to, le).trim() === "";
  view.dispatch({
    changes: alone
      ? { from: ls === 0 ? 0 : ls - 1, to: le, insert: "" }
      : { from: d.from, to: d.to, insert: "" },
  });
}

const deferredLinter = linter(
  (view) => {
    const text = docTextOf(view.state.doc);
    return problems(text).map((p): Diagnostic => {
      const actions =
        p.kind === "dangling"
          ? [
              {
                name: t("deferWriteBodyAction"),
                apply: (v: EditorView) => {
                  const c = createBody(docTextOf(v.state.doc), p.name, grouping());
                  apply(v, c.text, c.caret);
                },
              },
            ]
          : [
              {
                name: t("deferDeleteBodyAction"),
                apply: (v: EditorView) =>
                  deleteBody(v, p.name, p.kind === "duplicate" ? "last" : "first"),
              },
            ];
      return {
        from: p.from,
        to: Math.max(p.to, p.from + 1),
        // An orphan body is a note nobody will ever read, but the document is
        // otherwise sound — a warning, where a dangling marker prints a red `?`
        // on the page and is an error.
        severity: p.kind === "dangling" ? "error" : "warning",
        source: "ksav",
        message: message(p),
        actions,
      };
    });
  },
  // The same delay as the bracket lint: long enough not to fire while a name is
  // half-typed, since every name is dangling for the moment before its body.
  { delay: 600 },
);

// ---------------------------------------------------------------- the hover

/** As much of a body as belongs in a tooltip. */
function excerpt(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 240 ? `${one.slice(0, 240)}…` : one;
}

/**
 * Show the prose without going to it.
 *
 * The point of deferring is that the body is not in front of you; the cost is
 * that you cannot see it while you read the sentence. This gives it back for
 * the two seconds it takes to check, which is most of what the jump is used for.
 */
const deferredHover = hoverTooltip((view, pos) => {
  const text = docTextOf(view.state.doc);
  const ref = scan(text)
    .refs.filter((r) => pos >= r.from && pos <= r.to)
    .sort((a, b) => b.from - a.from)[0];
  if (!ref) return null;
  const body = bodyOf(text, ref.name);
  return {
    pos: ref.from,
    end: ref.to,
    above: true,
    create: () => {
      const dom = document.createElement("div");
      dom.className = "cm-tooltip-defer";
      dom.textContent = body == null ? tf("deferLintDangling", ref.name) : excerpt(body);
      if (body == null) dom.classList.add("missing");
      return { dom };
    },
  };
});

const deferredTheme = EditorView.baseTheme({
  ".cm-tooltip-defer": {
    maxWidth: "34em",
    padding: "6px 9px",
    lineHeight: "1.45",
    fontSize: "0.92em",
  },
  ".cm-tooltip-defer.missing": { color: "#b91c1c" },
});

// No `lintGutter()` here: `bracketLint` already installs one, and a second
// would put two gutters side by side showing the same marks.
export const deferredNotes = [deferredLinter, deferredHover, deferredTheme];
