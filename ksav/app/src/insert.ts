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
//   - `rewrite` — the whole document, because what the writer asked for is not a
//                 splice. Pressing the bullet button over four paragraphs means
//                 *make these four things a list*, which is Word's behaviour and
//                 everyone's; the splice could only ever wrap all four inside
//                 one bullet, and it reaches past the selection to the ends of
//                 the lines besides. See `lists.makeList`.
//
// The shell keeps the six lines that dispatch it. What is left in `main.ts` is
// the effect; what is here is every decision, and every decision is now a
// question you can ask in a test file without a browser.

import { continueLevel } from "./headings";
import { itemsFor, makeList } from "./lists";
import { legalAt, insertionAt } from "./mode";
import { noteFor } from "./notes";
import type { NotePick } from "./channels";
import { continueSeries } from "./numbering";
import { SPELLING, type ListKind } from "./spans";

/** A command name, if this snippet begins with one. */
export function commandOf(snippet: string): string | null {
  return /^#([A-Za-z0-9֐-׿_]+)/u.exec(snippet)?.[1] ?? null;
}

export type Insertion =
  | { kind: "refuse"; reason: string }
  | { kind: "note"; pick: NotePick; marker?: string }
  | { kind: "edit"; text: string; cursor: number }
  | { kind: "rewrite"; text: string; caret: number };

/** The three list commands, in both languages, as a snippet's leading name. */
const LIST_KINDS: Record<string, ListKind> = {
  [SPELLING.list.bullets.he]: "bullets",
  [SPELLING.list.bullets.en]: "bullets",
  [SPELLING.list.numbered.he]: "numbered",
  [SPELLING.list.numbered.en]: "numbered",
  [SPELLING.list.hebrew.he]: "hebrew",
  [SPELLING.list.hebrew.en]: "hebrew",
};
/** Which of those names is the English one — the list is written in its language. */
const LIST_LANG_EN: Record<string, true> = {
  [SPELLING.list.bullets.en]: true,
  [SPELLING.list.numbered.en]: true,
  [SPELLING.list.hebrew.en]: true,
};

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
    return { kind: "note", pick: note.pick, marker: note.marker };
  }

  const command = commandOf(snippetInSeries);
  if (command) {
    const legality = legalAt(doc, from, command);
    if (!legality.ok) return { kind: "refuse", reason: legality.reason! };
  }

  const snippet = insertionAt(doc, from, snippetInSeries, to, whenSilent);

  // A list command over prose the writer has selected is not an insertion at
  // all — it is *"make this a real list"*, the verb the product had no word
  // for. The 156 numbered items in the inventory that catalogues this product
  // are `#הדגשה[45.]` paragraphs for exactly this reason: pressing the bullet
  // button over them wrapped all 156 inside one bullet, so nobody pressed it
  // twice. `makeList` reads the numbers the writer typed and throws them away,
  // which is what the list is being asked to take over.
  //
  // Read off `snippet` rather than the raw one, because `insertionAt` is what
  // resolved the document's language and the new list has to be written in it.
  const written = commandOf(snippet);
  const kind = written ? LIST_KINDS[written] : undefined;
  if (kind && to > from && itemsFor(doc.slice(from, to)).length > 1) {
    const made = makeList(doc, from, to, kind, written! in LIST_LANG_EN ? "en" : "he");
    if (made) return { kind: "rewrite", text: made.text, caret: made.caret };
  }

  // A bracketed snippet with no explicit caret marker still wants the caret
  // between its brackets, not stranded past the closing `]` — otherwise the
  // writer has to reposition into the brackets by hand before typing.
  const pipe = snippet.indexOf("|");
  if (pipe < 0) {
    const empty = snippet.indexOf("[]");
    return { kind: "edit", text: snippet, cursor: empty >= 0 ? empty + 1 : snippet.length };
  }
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

// `regionAround` lived here and is now `foldAround` in `hiding.ts`, beside the
// two constructs it is constantly confused with. The name went with it: what it
// builds is a fold, and "region" is the fixed area on the page that `#אזור`
// makes.
