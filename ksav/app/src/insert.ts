// What happens when a command reaches the document — decided here, performed
// by the shell.
//
// # Why this module exists
//
// Insertion is the path this repository has paid the most for. 384 of 1,026 UI
// insertions once produced uncompilable Typst; the fix was a generated grid that
// compiles every legal one. But the *decision* — is this legal here, does it
// continue a series, is it a note and therefore a layout rather than a string,
// where does the caret land — lived in `main.ts`, which is the one module no
// test can import. So the fixtures checked the strings and nothing checked the
// function that chooses between them.
//
// That is the shape §7 of the 7 August report is about: every feature half in a
// tested module and half in the god-file, with the seam exactly where the bugs
// are. `actions.ts` took the first piece — which command each shell action
// inserts. This takes the next: **what an insertion turns into**.
//
// # The split
//
// `plan` is a pure function of (document, selection, snippet). It returns one of
// three answers and performs none of them:
//
//   - `refuse`  — an i18n key. `#פריט` outside a list is not a typo to be
//                 corrected silently; the writer is told why.
//   - `note`    — this snippet is a note, and a note is a layout: it may need a
//                 dump call at the end of the file, a wrapper around the section
//                 and a configuration line at the top. `notes.ts` owns that;
//                 this says only "it is one of those, here is which".
//   - `edit`    — the text to splice and where the caret goes.
//
// The shell keeps the six lines that dispatch it. What is left in `main.ts` is
// the effect; what is here is every decision, and every decision is now a
// question you can ask in a test file without a browser.

import { continueLevel } from "./headings";
import { legalAt, insertionAt } from "./mode";
import { noteFor, type NoteChoice } from "./notes";
import { continueSeries } from "./numbering";

/** A command name, if this snippet begins with one. */
export function commandOf(snippet: string): string | null {
  return /^#([A-Za-z0-9֐-׿_]+)/u.exec(snippet)?.[1] ?? null;
}

export type Insertion =
  | { kind: "refuse"; reason: string }
  | { kind: "note"; choice: NoteChoice; layer: number; marker?: string }
  | { kind: "edit"; text: string; cursor: number };

/**
 * What this snippet becomes at this caret.
 *
 * `to` matters as well as `from`: with a selection, the neighbour on the right
 * is what comes *after* the text being replaced, not the first character of it —
 * which is the difference between `#רשימה(` opening a new list and continuing
 * the one the selection sits in.
 */
export function plan(
  doc: string,
  from: number,
  to: number,
  selText: string,
  rawSnippet: string,
  /**
   * The language to write in when the document has said nothing yet — the page
   * direction, which the shell knows and this does not.
   *
   * A blank left-to-right document used to take a Hebrew first command, and
   * that one command was then the majority the *next* insertion consulted. See
   * `mode.docLang`.
   */
  whenSilent: "he" | "en" = "he",
): Insertion {
  // Two rewrites that read the document rather than trust the registry's
  // literal: the number a siman gets, and the level "heading at any level"
  // takes. Both are the same finding — a static string in a table that has
  // never seen the document, producing the same value every time.
  const snippetInSeries = continueLevel(doc, from, continueSeries(doc, from, rawSnippet));

  // A note is a layout, not a string. Answered before legality because the
  // layouts place themselves — a note's marker is legal wherever prose is, and
  // its *body* may not be going in at the caret at all.
  const note = noteFor(snippetInSeries);
  if (note) {
    return { kind: "note", choice: note.choice, layer: note.layer, marker: note.marker };
  }

  const command = commandOf(snippetInSeries);
  if (command) {
    const legality = legalAt(doc, from, command);
    if (!legality.ok) return { kind: "refuse", reason: legality.reason! };
  }

  const snippet = insertionAt(doc, from, snippetInSeries, to, whenSilent);
  const pipe = snippet.indexOf("|");
  if (pipe < 0) return { kind: "edit", text: snippet, cursor: snippet.length };
  // The `|` is where the caret goes, and where a selection is wrapped. Both, and
  // not either: a toolbar button pressed with text selected wraps that text,
  // which is what every word processor does.
  if (selText) {
    return {
      kind: "edit",
      text: snippet.slice(0, pipe) + selText + snippet.slice(pipe + 1),
      cursor: pipe + selText.length,
    };
  }
  return { kind: "edit", text: snippet.slice(0, pipe) + snippet.slice(pipe + 1), cursor: pipe };
}

/**
 * The `//{ … //}` region a writer folds a chunk of sefer into.
 *
 * Here rather than in the shell for one reason that is not tidiness: the `//{`
 * **must** begin its own line or the fold service, which keys on a line starting
 * with `//{`, does not see it — so the region a writer just made refuses to
 * fold, with nothing on screen to say why. That rule is worth a test, and a test
 * needs it out of `main.ts`.
 */
export function regionAround(
  doc: string,
  from: number,
  to: number,
  label: string,
): { text: string; from: number; to: number; select: [number, number] } {
  const selText = doc.slice(from, to);
  const atLineStart = from === 0 || doc[from - 1] === "\n";
  const lead = atLineStart ? "" : "\n";
  const text = `${lead}//{ ${label}\n${selText}\n//}\n`;
  // Start of the label, so it can be renamed immediately: `//{ ` is four
  // characters after whatever newline had to be prepended.
  const at = from + lead.length + 4;
  return { text, from, to, select: [at, at + label.length] };
}
