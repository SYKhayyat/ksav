// The editor half of "collected and never rendered".
//
// `apparatus.ts` is the model. This is the warning on the line and the button
// that fixes it.
//
// Deliberately a *warning* and not an error: the source is valid, the document
// compiles, and a writer part-way through building a sefer may well have written
// the notes before the block that renders them. What must not happen is finishing
// the document, exporting the PDF, and finding the prose was never on the page.

import { linter } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { unrendered, addDump } from "./apparatus";
import type { Unrendered } from "./apparatus";
import { t, tf } from "./i18n";

/** Write the missing dump call, recomputed against the current text. */
function fixOne(view: EditorView, p: Unrendered) {
  const text = view.state.doc.toString();
  // The writer may have typed since the lint ran, so the recorded offsets are
  // stale; find the same problem again rather than trusting them.
  const fresh = unrendered(text).find((q) => q.fix === p.fix && q.stream === p.stream) ?? p;
  const { text: next, caret } = addDump(text, fresh);
  view.dispatch({
    changes: { from: 0, to: text.length, insert: next },
    selection: { anchor: Math.min(caret, next.length) },
    scrollIntoView: true,
  });
}

/** Write every missing dump call. Returns how many it added. */
export function renderAllNotes(view: EditorView): number {
  let text = view.state.doc.toString();
  let added = 0;
  // One at a time, re-scanning between: adding one dump can satisfy several
  // markers at once, and writing one call per marker would pile up duplicates.
  for (let guard = 0; guard < 16; guard++) {
    const problems = unrendered(text);
    if (!problems.length) break;
    text = addDump(text, problems[0]).text;
    added++;
  }
  if (added) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }
  return added;
}

const apparatusLinter = linter(
  (view) => {
    const text = view.state.doc.toString();
    const problems = unrendered(text);
    if (!problems.length) return [];
    return problems.map((p): Diagnostic => {
      const actions = [{ name: t("renderNotesAction"), apply: (v: EditorView) => fixOne(v, p) }];
      if (problems.length > 1) {
        actions.push({
          name: t("renderAllNotesAction"),
          apply: (v: EditorView) => void renderAllNotes(v),
        });
      }
      return {
        from: p.from,
        to: p.to,
        severity: "warning",
        source: "ksav",
        message: tf("lintUnrendered", "#" + p.command, p.fix),
        actions,
      };
    });
  },
  // Slower than the bracket lint: this one is about a document that is not
  // finished yet, and nagging on every keystroke is how a warning gets ignored.
  { delay: 1200 },
);

export const apparatusLint = [apparatusLinter];
