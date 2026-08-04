// What focus mode counts as "the paragraph you are in".
//
// The dimming itself is a decoration and the centring is a scroll, neither of
// which can be asserted without a browser. The judgement can: which lines stay
// lit is a pure function of the document and the caret, and it is the only part
// of this feature that can be *wrong* rather than merely ugly.

import { check } from "./harness.mjs";
import { paragraphAt } from "../.tmp-test/focus.mjs";

/** A stand-in for the slice of EditorState this function actually reads. */
function stateOf(text) {
  const lines = text.split("\n");
  const doc = {
    lines: lines.length,
    length: text.length,
    line: (n) => ({ number: n, text: lines[n - 1] ?? "" }),
    lineAt: (pos) => {
      let at = 0;
      for (let i = 0; i < lines.length; i++) {
        const end = at + lines[i].length;
        if (pos <= end) return { number: i + 1, text: lines[i], from: at, to: end };
        at = end + 1;
      }
      return { number: lines.length, text: lines[lines.length - 1], from: at, to: text.length };
    },
  };
  return { doc };
}

/** The paragraph around the caret, given a line number to put the caret on. */
function around(text, line) {
  const state = stateOf(text);
  let pos = 0;
  for (let i = 1; i < line; i++) pos += state.doc.line(i).text.length + 1;
  return paragraphAt(state, pos);
}

export function run() {
  const doc = "first para line one\nfirst para line two\n\nsecond para\n\n\nthird para";

  check("a paragraph is the run of non-blank lines", around(doc, 1), { from: 1, to: 2 });
  check("…from anywhere inside it", around(doc, 2), { from: 1, to: 2 });
  check("a one-line paragraph is itself", around(doc, 4), { from: 4, to: 4 });
  check("the last paragraph ends at the last line", around(doc, 7), { from: 7, to: 7 });

  // The caret on a blank line is *between* paragraphs. Joining it to the one
  // above would dim the paragraph you just finished the instant you press
  // Enter, which is the single most irritating thing this feature could do.
  check("a blank line is its own paragraph", around(doc, 3), { from: 3, to: 3 });
  check("…and so is each of a run of them", around(doc, 6), { from: 6, to: 6 });

  // Whitespace-only is blank. A line holding two spaces looks empty and must be
  // treated as empty, or the paragraph silently runs on through it.
  check("a whitespace-only line is blank", around("a\n   \nb", 2), { from: 2, to: 2 });
  check("…and does not join the paragraphs across it", around("a\n   \nb", 1), { from: 1, to: 1 });

  // The edges.
  check("a single-line document", around("only", 1), { from: 1, to: 1 });
  check("an empty document", around("", 1), { from: 1, to: 1 });

  {
    // A caret past the end of the document is clamped rather than throwing —
    // it happens for one frame after a deletion, and a thrown error there would
    // take the whole editor down.
    const state = stateOf("a\nb");
    check("a position past the end is clamped", paragraphAt(state, 9999), { from: 1, to: 2 });
    check("…and one before the start", paragraphAt(state, -5), { from: 1, to: 2 });
  }
}
