// The editor half of bracket healing: turns the findings from `brackets.ts` into
// a gutter marker, an underline, and a one-click fix.
//
// The point is *where* the error is reported. Typst can only tell you a group is
// unbalanced once it reaches end of file, so its message lands at the bottom of
// the document, nowhere near the mistake. This marks the opener that never
// closes, names its command, and offers to close it — before any compile runs.

import { docTextOf } from "./spans";
import { linter, lintGutter } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { analyze } from "./brackets";
import { orphanChildren } from "./mode";
import { bracketLists } from "./lists";
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
  const text = docTextOf(view.state.doc);
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
    // Taken from `analyze` rather than spelled again here. These were two
    // copies of one repair and they had drifted: this one appended `\n*/` and
    // the batch repair appended `*/`, so healing one problem and healing all of
    // them produced different documents — and only one of them kept the line
    // count the diagnostic mapping depends on. Two spellings of one decision is
    // the defect family this repository is named for; there is one now.
    const end = view.state.doc.length;
    const edit = analyze(text).edits.find((e) => e.from === text.length);
    view.dispatch({ changes: { from: end, to: end, insert: edit?.insert ?? "*/" } });
  }
}

/** Repair everything at once. Returns how many problems it closed. */
export function healAll(view: EditorView): number {
  const { problems, edits } = analyze(docTextOf(view.state.doc));
  if (!edits.length) return 0;
  view.dispatch({ changes: edits });
  return problems.length;
}

/**
 * A `#פריט` or a `#תא` with no list or table around it.
 *
 * The engine draws a badge on one of these now, so the preview says so — but
 * the preview says it *where the page is*, and this says it where the writing
 * is, which for a mistake made while typing is the difference between noticing
 * and not. Same argument as the module opening: report it at the mistake.
 *
 * No `actions`. There is no one repair — the writer may have meant to open a
 * list around it, or to have typed something else entirely, and a quick fix
 * that guesses wrong on a structural command is worse than none.
 */
function orphanDiagnostics(text: string): Diagnostic[] {
  return orphanChildren(text).map((o) => ({
    from: o.from,
    to: o.to,
    severity: "error" as const,
    source: "ksav",
    message: tf("lintOrphanChild", o.name),
  }));
}

/**
 * A list whose items are in its body rather than its argument list.
 *
 * Not an error: the engine lays all three spellings out identically, and saying
 * "error" about a list that prints correctly is how a writer learns to ignore
 * the gutter. It is an *offer* — the list ribbon writes into the argument list,
 * so add-item, split, indent, outdent and both moves are grey until the list is
 * in that form, and this is the one click that puts it there.
 */
function bracketListDiagnostics(text: string): Diagnostic[] {
  return bracketLists(text).map((l) => ({
    from: l.from,
    to: l.to,
    severity: "info" as const,
    source: "ksav",
    message: tf("lintBracketList", l.name),
    actions: [
      {
        name: t("lintBracketListAction"),
        apply: (view: EditorView) => {
          // Recomputed against the live document: the writer may have typed
          // since the lint ran, which moves every position after the edit.
          const now = bracketLists(docTextOf(view.state.doc)).find((q) => q.from === l.from);
          if (!now) return;
          view.dispatch({
            changes: { from: now.from, to: now.to, insert: now.text },
            selection: { anchor: now.from + now.text.length },
            scrollIntoView: true,
          });
        },
      },
    ],
  }));
}

const bracketLinter = linter(
  (view) => {
    const text = docTextOf(view.state.doc);
    const orphans = orphanDiagnostics(text).concat(bracketListDiagnostics(text));
    const { problems } = analyze(text);
    if (!problems.length) return orphans;
    return orphans.concat(problems.map((p): Diagnostic => {
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
    }));
  },
  // Long enough that it does not fire mid-word while a group is legitimately
  // half-typed — every `#הערה[` is unclosed for the moment before its body.
  { delay: 600 },
);

export const bracketLint = [bracketLinter, lintGutter()];
