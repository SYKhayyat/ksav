// What focus mode counts as "the paragraph you are in".
//
// The dimming itself is a decoration and the centring is a scroll, neither of
// which can be asserted without a browser. The judgement can: which lines stay
// lit is a pure function of the document and the caret, and it is the only part
// of this feature that can be *wrong* rather than merely ugly.

import { check, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";
import {
  anchorFraction,
  paragraphAt,
  typewriterPadding,
  TYPEWRITER_ANCHORS,
} from "../.tmp-test/focus.mjs";
import { DEFAULTS } from "../.tmp-test/settings.mjs";

const SRC = path.resolve(dirOf(import.meta.url), "..", "src");

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

  // ---------------------------------------------------------------- typewriter
  //
  // The scroll itself needs a browser. The arithmetic under it does not, and the
  // arithmetic is where this feature was broken for its whole life: there was
  // bottom padding and no top padding, so the scroller's only range was *below*
  // the text. Putting line 5 at the middle of the pane wants a negative scroll
  // offset, a scroller clamps that to zero, and the caret stays exactly where it
  // sits with the mode off. Measured in the running app before the fix:
  // `padding-top: 4px`, `padding-bottom: 288px`, `scrollTop: 0`.
  //
  // So the property worth fencing is that the two paddings are the two halves of
  // one pane, and that they follow the anchor rather than being a constant.

  check("the anchors are a third, a half and two thirds", Object.keys(TYPEWRITER_ANCHORS).sort(), [
    "center",
    "lower",
    "upper",
  ]);
  check("centre is the half", anchorFraction("center"), 0.5);
  check("…and an absent anchor is centre", anchorFraction(undefined), 0.5);
  check("…and so is one nobody defined", anchorFraction("sideways"), 0.5);

  for (const anchor of Object.keys(TYPEWRITER_ANCHORS)) {
    const pad = typewriterPadding(anchor);
    const top = Number.parseFloat(pad.top);
    const bottom = Number.parseFloat(pad.bottom);
    // The bug, stated as an assertion: room on *both* sides, never one.
    ok(`${anchor}: there is room above the first line`, top > 0);
    ok(`${anchor}: and below the last one`, bottom > 0);
    // Two halves of one pane. If they stop summing, one of the two ends can no
    // longer reach the anchor and the mode half-works, which is worse than off.
    check(`${anchor}: the two halves are one pane`, Math.round(top + bottom), 100);
    check(`${anchor}: the space above is the anchor itself`, Math.round(top), Math.round(anchorFraction(anchor) * 100));
  }

  check("a third down leaves less room above than centre does", true,
    Number.parseFloat(typewriterPadding("upper").top) < Number.parseFloat(typewriterPadding("center").top));
  check("…and two thirds down leaves more", true,
    Number.parseFloat(typewriterPadding("lower").top) > Number.parseFloat(typewriterPadding("center").top));

  // The setting exists and starts where the feature always claimed to be.
  check("the anchor defaults to centre", DEFAULTS.typewriterAnchor, "center");

  {
    // Source fences. The arithmetic above is correct and reaches nobody unless
    // the stylesheet reads both variables and the shell passes the anchor in —
    // which is the seam the old code got wrong, not the sums.
    const css = readFileSync(path.join(SRC, "styles.css"), "utf8");
    const rule = css.slice(css.indexOf('.cm-content[data-typewriter="true"]'));
    const body = rule.slice(0, rule.indexOf("}"));
    ok("the content pads above", /padding-top:\s*var\(--ksav-typewriter-pad-top/u.test(body));
    ok("…and below", /padding-bottom:\s*var\(--ksav-typewriter-pad/u.test(body));

    // Comments are stripped before grepping: this file *discusses* the old
    // `y: "center"` at length, and a fence that its own explanation can fail is
    // a fence nobody will keep.
    const focus = readFileSync(path.join(SRC, "focus.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/.*/gu, "");
    // `y: "center"` can only say the one thing; a margin can say a third.
    ok("the scroll is anchored by a margin, not by `center`",
      /y:\s*"start"/u.test(focus) && !/y:\s*"center"/u.test(focus));
    ok("…and the margin is the pane's own height, not the window's",
      /scrollDOM\.clientHeight/u.test(focus));

    const main = readFileSync(path.join(SRC, "main.ts"), "utf8");
    // Every call site, not most of them: an editor built without the anchor is
    // an editor whose typewriter mode silently reverts to the centre.
    const calls = main.split("focusExtension(").length - 1;
    const anchored = main.split(/focusExtension\([^)]*typewriterAnchor/su).length - 1;
    check("every editor is built with the anchor", anchored, calls);
    ok("…and there are some to count", calls >= 3);
    ok("and changing it reconfigures the live editor",
      /key === "typewriterAnchor"/u.test(main));
  }
}
