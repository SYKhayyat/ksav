// A source note says whether it is in the index.
//
// `citation.ts` is the model — which notes there are, and which of them carry a
// `מקור:`. This is the mark on the line.
//
// # Why this exists
//
// `#מראה_מקום` is `footnote(text(size: 0.92em, body))`: a footnote, eight per
// cent smaller. Everything that makes it a *source* note is in the half that
// does not print — given a ref it files a `#metadata` entry, and that entry is
// what `#מראה_מקומות()` collects into the source list at the back, what lets a
// document be reprinted in another citation style, and what becomes a link in
// the compiled PDF. Without a ref it is a slightly smaller footnote and nothing
// else.
//
// The writer could not tell the two apart. From the 11 August inventory: *a
// source note's entire value is invisible*, and *written without a ref it
// contributes nothing to the index, and nothing on screen says so*.
//
// # Why `info` and not `warning`
//
// Because a source note without a ref is a perfectly good citation footnote,
// and a sefer may have a hundred of them written before anybody went looking
// for the places. This is not a mistake being reported; it is a capability
// being pointed at, on the line where it applies, with the one gesture that
// takes it up. A warning would be the application telling the writer off for
// something it never told them about.

import { linter } from "@codemirror/lint";
import type { Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { sourceNotes } from "./citation";
import { t } from "./i18n";
import { docTextOf } from "./spans";

/**
 * What "attach a ref to this note" does, installed by the shell.
 *
 * Injected because attaching one means asking Girsa where the phrase is from,
 * which is a network errand belonging to `main.ts`. This module knows which
 * notes want one; it does not know how to go and get it.
 */
let attach: ((view: EditorView, at: number) => void) | null = null;

/** Say how a ref is fetched. Called once, by the shell. */
export function onAttachRef(fn: (view: EditorView, at: number) => void): void {
  attach = fn;
}

/** One mark this lint would put on the text: a range and an i18n key. */
export interface RefMark {
  from: number;
  to: number;
  message: string;
}

/**
 * Every source note that is not in the index, as ranges.
 *
 * Separated from the `linter()` above it so the *answer* can be asserted
 * without an editor — which is the split `insert.ts` makes for the same reason
 * and for the same class of bug: a model that is right and a dispatch that
 * marks the wrong span is a defect no test of the model can catch. The message
 * is a key rather than a sentence so nothing here holds an opinion about the
 * interface's language.
 */
export function refMarks(text: string): RefMark[] {
  return sourceNotes(text)
    .filter((n) => !n.indexed)
    .map((n) => ({
      from: Math.max(0, n.from),
      to: Math.min(n.to, text.length),
      message: "sourceNoteNoRef",
    }));
}

const sourceNoteLinter = linter((view): Diagnostic[] => {
  const text = docTextOf(view.state.doc);
  return refMarks(text).map((m) => ({
    from: m.from,
    to: m.to,
    severity: "info" as const,
    message: t(m.message),
    actions: attach
      ? [{ name: t("sourceNoteAddRef"), apply: (v: EditorView) => attach!(v, m.from) }]
      : [],
  }));
});

export const sourceNoteMarks = [sourceNoteLinter];
