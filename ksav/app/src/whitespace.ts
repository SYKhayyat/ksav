// Seeing the invisible characters.
//
// # The problem, and why it is worse here than in an IDE
//
// A space is a character that renders as nothing. In a code editor that is a small
// annoyance. Here it is **typographic**, and `main.ts` says so in its own words:
//
// > *"Typst turns a newline into a **space** and a blank line into a **paragraph
// break**, so the writer who breaks a long line for the sake of reading the source
// pays for it on the page."*
//
// So in a Ksav document:
//
//   `first⏎second`     prints  `first second`   — one space
//   `first⏎⏎second`   prints  two paragraphs
//   `a·⏎·b`            prints  `a b`            — runs collapse
//
// Three different things produce **different pages**, and none of them is visible.
// A trailing space before a `]` cannot be seen. Two spaces where one was meant
// cannot be seen. A paragraph break the writer just made cannot be seen.
//
// And once #84's indent view lands, the entire left margin of every indented line
// is invisible characters — so this also becomes how the indent **shows its own
// work**: an indent of one space and an indent of two are indistinguishable until
// you can see the spaces.
//
// # Not `highlightSpecialChars`, and that is the whole design
//
// The obvious implementation is CodeMirror's `highlightSpecialChars`, and it is
// the wrong one. It works by **replacing ranges of the document**, and
// `bidi.ts:452` records what happens when two things replace overlapping ranges:
//
// > *"CodeMirror rejects the decoration set outright ('Ran out of text content')
// and the editor goes blank."*
//
// Whitespace is in that collision by definition. `visibleBidiMarks` replaces every
// bidi mark; prose mode (`mode.ts`) replaces command syntax and hides it. Whitespace
// sits inside both — a space between a command's name and its bracket, a mark
// between two words — so a `highlightSpecialChars` here would blank the editor on
// exactly the input the feature exists for. The bidi marks *already* work around
// this by being put in a compartment that can never be on with prose mode, and
// **that arrangement would have to be extended to three** rather than two.
//
// So this is a **`Decoration.mark` plus a CSS `::after`**, which adds a class and
// changes no text content at all. Marks compose with each other and with
// everything else, so this can be on *at the same time* as prose mode and as visible
// bidi marks — which is what a writer actually wants, because the three answer
// different questions and none of them is "turn the others off".
//
// It is also why the glyph is in `styles.css` and not in a `render` callback: a
// pseudo-element is not text the document does not contain, so it costs nothing in
// the accessibility tree and nothing in a text selection.

import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { Extension, Range } from "@codemirror/state";

// Two classes, one per visible form. Named after what they show rather than
// where they are, because the CSS is the other half of this feature and the two
// must not drift.
const SPACE = "cm-ws-space";
const TAB = "cm-ws-tab";

/** One contiguous run of one kind of whitespace, as a range to mark. */
interface Run {
  from: number;
  to: number;
  cls: string;
}

/**
 * Every space and tab in `text`, as ranges.
 *
 * **Only the ones that are alone, or a run of them.** A space between two words
 * is prose, and rendering every one of them turns a paragraph of Hebrew into a
 * field of dots — the reason this is off by default is that it is unreadable, and
 * turning it on permanently would make it so.
 *
 * The interesting case is the opposite one, and it is what the feature is *for*:
 *
 *   - two or more spaces in a row — a mistake, or a deliberate gap nobody can see;
 *   - a leading space on a line — invisible, and it indents the page by an amount
 *     the writer cannot account for;
 *   - a trailing space, or a trailing run — invisible, and it is what makes a
 *     `]` look like it is in the wrong place;
 *   - any tab — **never legitimate here**. Typst has no tab semantics and the
 *     source is RTL prose, so a tab is always something that arrived by accident.
 *
 * Runs are merged rather than one mark per character: a mark over forty spaces is
 * forty ranges CodeMirror has to keep in step with every edit, and the CSS draws
 * one dot at the start of the range. A run of forty dots is also unreadable, and
 * **one dot is the honest summary** — the count is available from the status bar
 * if anybody wants it.
 *
 * Newlines are deliberately **not** marked. A newline is a line boundary, so a
* mark cannot span it; marking its meaning would need a line decoration, and the
 * meaning is either "a space" or a paragraph break — two different answers, and
 * #84's blank-line rule is where the visible half of that lives.
 */
export function whitespaceRuns(text: string): Run[] {
  const out: Run[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c !== " " && c !== "\t") {
      i++;
      continue;
    }
    const isTab = c === "\t";
    const from = i;
    while (i < n && (isTab ? text[i] === "\t" : text[i] === " ")) i++;
    const to = i;
    const line = text.lastIndexOf("\n", from - 1) + 1;
    const leading = !text.slice(line, from).trim();
    // To the first non-space on the line: a run, its trailing space, or the line
    // end. `\s` rather than a space, so a run followed by a tab is one answer
    // rather than two that describe the same gap.
    const after = /^\s*/.exec(text.slice(to))![0];
    const trailing = !text.slice(to + after.length).split("\n", 1)[0].trim();
    if (isTab || to - from > 1 || leading || trailing) {
      out.push({ from, to, cls: isTab ? TAB : SPACE });
    }
  }
  return out;
}

/** The classes this module marks with, for the CSS fence and for tests. */
export const CLASSES = { SPACE, TAB } as const;

// --------------------------------------------------------------- the extension

/**
 * Mark the whitespace worth seeing, over the viewport only.
 *
 * **Viewport-only for `focus.ts:50`'s reason**, which is worth repeating because it is
 * the one that decides whether this is usable at all: *"a decoration for a line nobody
 * can see costs the same as one they can, and a 4000-line sefer would pay for 3960 of
 * them on every cursor movement."*
 *
 * Rebuilt on the viewport and the document, and **not on the selection**: what this
 * marks does not depend on where the caret is, so re-scanning it on every arrow key
 * would be work for an identical answer. That is the whole difference between this and a
 * highlight, and it is why the marks cannot flicker as the caret moves.
 *
 * `visibleBidiMarks` gets the same treatment and for a different reason — see
 * `bidi.ts:452` — but **these two compose**, which is the whole reason this is a mark
 * and not a replacement.
 */
export function whitespaceMarks(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view);
      }

      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function build(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    let at = from;
    while (at <= to) {
      const line = view.state.doc.lineAt(at);
      for (const run of whitespaceRuns(line.text)) {
        // `line.from` is the document offset; `line.text` was scanned on its own, so
        // every run the scanner reports has to be shifted back onto the document.
        ranges.push(decorations[run.cls].range(line.from + run.from, line.from + run.to));
      }
      if (line.to + 1 > view.state.doc.length) break;
      at = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}

const decorations: Record<string, Decoration> = {
  [SPACE]: Decoration.mark({ class: SPACE }),
  [TAB]: Decoration.mark({ class: TAB }),
};