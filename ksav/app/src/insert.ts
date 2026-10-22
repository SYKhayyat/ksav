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
import { legalAt, insertionAt, docLang as modeDocLang } from "./mode";
import { noteFor } from "./notes";
import type { NotePick } from "./channels";
import { continueSeries, inSeries, resequenceAt } from "./numbering";
import type { EditorView } from "@codemirror/view";
import { SPELLING, docTextOf, type ListKind } from "./spans";
import { t, tf } from "./i18n";
import { tieredNoteAt } from "./notes";
import { settings, docConfig } from "./settings";
import { editDoc, setStatus } from "./runtime";
import * as runtime from "./runtime";

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

// # The wiring
//
// What `plan` cannot answer stays in the shell: whether the macro recorder is
// listening, and the notes chooser's own apply. They arrive as one registered
// object — same contract as the chrome's `ChromeWiring` and the palette's
// `PaletteWiring` — registered by main's boot in `installHooks`.

export interface InsertWiring {
  /** Tell the macro recorder a snippet was inserted with no action behind it. */
  noteSnippet(raw: string): void;
  /** Hand a note pick to the chooser's apply — the one place that runs it. */
  applyNotePick(
    pick: NotePick,
    sel?: { to?: number; text?: string; marker?: string },
  ): void;
}

let insertWired: InsertWiring | undefined;

/** Register the insertion wiring. Called once, from main.ts's boot. */
export function wireInsert(w: InsertWiring): void {
  insertWired = w;
}

/** The wiring, registered at boot. */
export const insertWiring = (): InsertWiring => {
  if (!insertWired) throw new Error("wireInsert was never called: the insertion wiring is missing");
  return insertWired;
};

// ---------------------------------------------------------------- snippet insertion
//
// The path, and the things whose *only* legitimate door is the path.

/**
 * The tiered note to write at `pos`, in the document's own language.
 *
 * Four surfaces write this — `Ctrl+Shift+N`, the toolbar's `⁑`, the Insert menu
 * and "hang another note off this one" in the notes pane — and all four had the
 * same line of code in them, which is exactly the arrangement that let the
 * generated command drift out of English in the first place. The direction test
 * is the same one `setStyleArgs` uses, for the same reason: a generated command
 * follows the document, not the interface.
 */
export function tieredNoteHere(doc: string, pos: number): string {
  return tieredNoteAt(doc, pos, docLang());
}

/**
 * The language a generated command is written in: the document's, never the
 * interface's. Three surfaces asked this the same way and a fourth arrived with
 * the deferred markers, so it is a function now.
 *
 * # It used to be a second opinion
 *
 * This read the page direction and nothing else, while `mode.docLang` — the
 * function the insertion path actually consults — reads what the document is
 * *written in*: the call the caret sits inside, then the majority of its
 * commands, then the majority of its letters. Two answers to one question,
 * disagreeing on any document whose direction and content point different ways,
 * and each one authoritative over a different set of surfaces.
 *
 * So there is one answer now, and the direction has the job it is actually good
 * for: saying what a document that has said nothing yet is going to be. That
 * matters more than it sounds. A blank left-to-right document took a Hebrew
 * first command, and the *next* insertion then found one Hebrew command and no
 * English ones, which is a majority.
 */
export function docLang(): "he" | "en" {
  const v = runtime.view;
  if (!v) return dirLang();
  return modeDocLang(docTextOf(v.state.doc), v.state.selection.main.from, dirLang());
}

/**
 * What the page direction says the document is.
 *
 * Not an answer to "what language is this document" — that is `docLang`, and it
 * asks the text. This is the *tiebreak* the text cannot supply: a document with
 * no letters in it has said nothing, and the direction is then the only thing
 * the writer has stated. Passed into the pure modules, which know about text
 * and deliberately nothing about page setup.
 */
export function dirLang(): "he" | "en" {
  return docConfig().dir === "ltr" ? "en" : "he";
}

/**
 * Write a snippet at the caret. **The** insertion path — every toolbar button,
 * menu entry, palette row, key binding and snippet expansion ends up here.
 *
 * That is what makes three separate rules enforceable at all:
 *
 *  - **mode and delimiters** (`insertionAt`): a command needs its `#` in markup,
 *    must not have one inside an argument list, and must arrive comma-delimited
 *    on both sides when it lands in one. 372 of 1,026 generated documents used
 *    to fail on those two rules alone.
 *  - **legality** (`legalAt`): a page break inside a list item, a table of
 *    contents inside a heading. Refused with a reason, rather than written and
 *    then blamed on Typst in English from the middle of a blank preview.
 *  - **notes** (`noteFor`): a note snippet is not spliced at all. It is handed to
 *    the chooser's own producer, so the scaffolding a layout needs is written
 *    and `deferNoteBodies` is honoured — from the toolbar, the palette, the
 *    keyboard and the modal alike, because there is one producer and not four.
 *  - **numbering** (`continueSeries`): a siman's number is a *value* in the
 *    snippet, not a placeholder, and the registry's copy is `א׳` forever. A
 *    sefer written the way the toolbar invites you to write one came out
 *    numbered א׳, א׳, א׳ — the caret is placed past the number, in the title,
 *    so the writer never visits the field that is wrong.
 *
 * **Returns whether anything went in**, and the three callers that follow it
 * with `scheduleCompile()` must ask. A refusal is a `setStatus(…, "warn")` — the
 * sentence the writer needs — and a compile that had nothing to compile
 * overwrites it with `✓ 3 עמ׳` a few milliseconds later. So the page-section
 * dialog refused correctly, wiped its own refusal, and closed: the writer got a
 * form, filled it in, pressed *Add*, and the document did not change and nothing
 * said why. A control that is offered, enabled, pressed and silent is the exact
 * failure this codebase keeps producing, and here it was one unconditional line
 * after a function that had already done the right thing.
 */
export function insertSnippet(rawSnippet: string): boolean {
  // Recorded here rather than at each of the toolbar's, the Insert menu's and
  // the palette's call sites, because "a command reached the document" is one
  // event and three places to remember it is how it came to be recorded in
  //   none. An action inserting a snippet is already recorded as the action.
  // The recorder and the replay counter stay main-held (the macros' own
  // region, wave 7), so the gate rides along with the wiring: the registered
  // `noteSnippet` decides whether the recorder is listening.
  insertWiring().noteSnippet(rawSnippet);
  const sel = runtime.view.state.selection.main;
  const selText = runtime.view.state.sliceDoc(sel.from, sel.to);
  const doc = docTextOf(runtime.view.state.doc);

  // Every decision is `insert.plan`, which is a pure function and therefore
  // testable; what is left here is performing it.
  const answer = plan(doc, sel.from, sel.to, selText, rawSnippet, dirLang());
  if (answer.kind === "refuse") {
    setStatus(t(answer.reason), "warn");
    return false;
  }
  if (answer.kind === "note") {
    insertWiring().applyNotePick(answer.pick, { to: sel.to, text: selText, marker: answer.marker });
    return true;
  }
  // "Make this a real list" — the bullet button pressed over paragraphs. A
  // whole-document rewrite because it reaches past the selection to the ends of
  // the lines it touches, which a splice into `[from, to]` cannot do.
  if (answer.kind === "rewrite") {
    editDoc(answer.text, answer.caret);
    runtime.view.focus();
    return true;
  }
  // A siman or a se'if added in the middle leaves every one after it holding
  // the wrong number, because a siman's number is written in the source by hand
  // — that is what a siman *is* — where a list's numbers are Typst's and
  // renumber for free. `continueSeries` gave the new one the number of the one
  // it now precedes, which is right; the rest of the run is what nothing ever
  // fixed. One transaction, so it is one undo.
  if (inSeries(rawSnippet)) {
    const inserted = doc.slice(0, sel.from) + answer.text + doc.slice(sel.to);
    const done = resequenceAt(inserted, sel.from + answer.cursor);
    if (done.changed) {
      editDoc(done.text, done.caret);
      if (done.changed > 1) setStatus(tf("renumbered", done.changed), "ok");
      runtime.view.focus();
      return true;
    }
  }
  runtime.view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: answer.text },
    selection: { anchor: sel.from + answer.cursor },
  });
  runtime.view.focus();
  return true;
}

function snippetMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of (settings.snippets || "").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) {
      const k = line.slice(0, i).trim();
      if (k) map[k] = line.slice(i + 1).trim();
    }
  }
  return map;
}

export const snippetTab = {
  key: "Tab",
  run: (v: EditorView) => {
    const sel = v.state.selection.main;
    if (!sel.empty) return false;
    const line = v.state.doc.lineAt(sel.head);
    const before = line.text.slice(0, sel.head - line.from);
    const m = before.match(/(\S+)$/);
    if (!m) return false;
    const map = snippetMap();
    const exp = map[m[1]];
    if (exp == null) return false;
    const from = sel.head - m[1].length;
    const raw = exp.replace(/\\n/g, "\n");
    const pipe = raw.indexOf("|");
    const text = pipe >= 0 ? raw.slice(0, pipe) + raw.slice(pipe + 1) : raw;
    const cursor = pipe >= 0 ? from + pipe : from + text.length;
    v.dispatch({ changes: { from, to: sel.head, insert: text }, selection: { anchor: cursor } });
    return true;
  },
};

/**
 * Insert a registry command by name — never by a snippet typed out here.
 *
 * **The registry was the single source of truth and `ACTIONS` held a
 * hand-written second copy beside it.** They had already drifted:
 *
 *     commands.rs:89   cmd!("רשימה", …, "#רשימה(\n  פריט[|],\n  פריט[],\n)")
 *     main.ts:427      { id: "bullets", run: () => insertSnippet("#רשימה(\n  פריט[|],\n)") }
 *
 * Clicking the toolbar's • gave you a two-item list. Pressing Ctrl+Shift+8 gave
 * you a one-item list. Same operation, same product, two documents — and
 * `buildToolbar` twenty lines away was already doing it the right way
 * (`byName("הדגשה")` → `c.insert`), so both conventions lived in one file.
 *
 * The table snippet was written out three times and the three happened to agree,
 * which is luck rather than a property.
 *
 * `runtime.commandByName` was exported for exactly this and had no callers.
 *
 * The null guard is the cost the report named, and it is strictly more honest
 * than the silent fallback to a stale string it replaces: if the registry has
 * not loaded, the writer is told, rather than being given a snippet nobody has
 * checked against the engine since it was typed.
 */
export function insertCommand(he: string): boolean {
  const c = runtime.commandByName(he);
  if (!c) {
    setStatus(t("registryMissing"), "warn");
    return true;
  }
  insertSnippet(c.insert);
  return true;
}
