// The editor half of bracket healing: turns the findings from `brackets.ts` into
// a gutter marker, an underline, and a one-click fix.
//
// The point is *where* the error is reported. Typst can only tell you a group is
// unbalanced once it reaches end of file, so its message lands at the bottom of
// the document, nowhere near the mistake. This marks the opener that never
// closes, names its command, and offers to close it — before any compile runs.

import { linter, lintGutter } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { analyze } from "./brackets";
import type { Problem } from "./brackets";
import { t, tf } from "./i18n";

function message(p: Problem): string {
  if (p.kind === "unclosed") {
    return p.cmd ? tf("lintUnclosedCmd", p.cmd) : tf("lintUnclosed", p.ch);
  }
  if (p.kind === "stray") return tf("lintStray", p.ch);
  return t("lintUnterminatedComment");
}

/** Repair one problem, leaving the rest of the document alone. */
function healOne(view: EditorView, p: Problem) {
  const text = view.state.doc.toString();
  // Recompute against the current text: the writer may have typed since the
  // lint ran, which moves every position after the edit.
  const fresh = analyze(text).problems.find((q) => q.kind === p.kind && q.pos === p.pos) ?? p;
  if (fresh.kind === "unclosed") {
    view.dispatch({
      changes: { from: fresh.healAt, to: fresh.healAt, insert: fresh.closer },
      selection: { anchor: fresh.healAt + 1 },
      scrollIntoView: true,
    });
  } else if (fresh.kind === "stray") {
    view.dispatch({ changes: { from: fresh.pos, to: fresh.pos + 1, insert: "" } });
  } else {
    const end = view.state.doc.length;
    view.dispatch({ changes: { from: end, to: end, insert: "\n*/" } });
  }
}

/** Repair everything at once. Returns how many problems it closed. */
export function healAll(view: EditorView): number {
  const { problems, edits } = analyze(view.state.doc.toString());
  if (!edits.length) return 0;
  view.dispatch({ changes: edits });
  return problems.length;
}

const bracketLinter = linter(
  (view) => {
    const text = view.state.doc.toString();
    const { problems } = analyze(text);
    if (!problems.length) return [];
    return problems.map((p): Diagnostic => {
      const actions = [{ name: t("healAction"), apply: (v: EditorView) => healOne(v, p) }];
      if (problems.length > 1) {
        actions.push({ name: t("healAllAction"), apply: (v: EditorView) => void healAll(v) });
      }
      return {
        // A one-character range: the marker sits on the offending delimiter
        // itself, so the squiggle points at a character rather than a region.
        from: p.pos,
        to: Math.min(p.pos + 1, text.length),
        severity: "error",
        source: "ksav",
        message: message(p),
        actions,
      };
    });
  },
  // Long enough that it does not fire mid-word while a group is legitimately
  // half-typed — every `#הערה[` is unclosed for the moment before its body.
  { delay: 600 },
);

export const bracketLint = [bracketLinter, lintGutter()];
