// Keeping the two panes on the same place in the document.
//
// The defect this exists for was reported in capitals: *"BIG PROBLEM — the
// scrolls are not aligned, I am locked at a different point in the source in
// preview. This might be because I have so many comments."*
//
// The diagnosis is in the second sentence. Synced scrolling was
// `scrollTop / scrollHeight` on each side — a fraction of the source's **pixels**
// driving a fraction of the preview's. Those agree only if every line of source
// prints, and in a Ksav document the comments, the command heads and the closing
// brackets do not. A marked-up document is exactly the case where the two come
// apart, which is to say: the more work somebody has put into a document, the
// more wrong the feature got.
//
// So the assertions below are all about *currency*. The proportion is fine; what
// was being counted was not.

import { check, ok } from "./harness.mjs";
import { printedPrefix, fractionAtLine, lineAtFraction } from "../.tmp-test/scrollmap.mjs";

export async function run() {
  // ------------------------------------------------------- comments weigh nothing

  {
    // The reported shape, in miniature: a page of prose, a page of margin
    // comments, a page of prose. By pixels the middle of the source is the
    // middle of the document; by print it is halfway through the first half.
    const prose = "שורה של טקסט שנדפס\n";
    const note = "// הערה בשוליים שאינה נדפסת כלל\n";
    const text = prose.repeat(10) + note.repeat(30) + prose.repeat(10);
    const p = printedPrefix(text);

    // Line 40 is the end of the comment block — every printing character above
    // it came from the first ten lines, which is half the printed document.
    check("half the print is above the comment block's end", Math.round(fractionAtLine(p, 40) * 100), 50);

    // The old arithmetic's answer, for contrast: line 40 of 50 is 80% of the
    // source's height. Being 30 points out is what the writer was looking at.
    ok("...where counting lines would have said 80%", Math.round((40 / 50) * 100) === 80);
  }

  {
    // A document that is *entirely* comments is a real state — a writer marking
    // up somebody else's text before writing any of their own — and the honest
    // answer is "the top", not a division by zero.
    const p = printedPrefix("// אחת\n// שתיים\n// שלוש\n");
    check("nothing prints, so nothing is above anything", fractionAtLine(p, 2), 0);
    check("and the inverse stays at the top rather than throwing", lineAtFraction(p, 0.7), 0);
  }

  {
    // Command heads are syntax, not ink. `#הערה[` occupies source and prints
    // nothing; the body inside it prints. Getting this backwards would make a
    // note-heavy sefer drift the *other* way.
    //
    // The assertion is a bound rather than an equality, and deliberately.
    // `proseRegions` hands back the group *including* its `[` and `]` — that is
    // its long-standing behaviour and it is harmless to the spell-checker it
    // was written for. Two characters per command is far below the resolution
    // of a scrollbar, and inventing a second opinion about the markup here to
    // shave them is precisely the trade this repository keeps being punished
    // for. What has to be true is that the head weighs nothing.
    const p = printedPrefix("#הערה[גוף ההערה]\n");
    const total = p[p.length - 1];
    const body = "גוף ההערה".length;
    ok("the body is counted", total >= body);
    ok("and the command name is not", total < body + "#הערה".length);
  }

  // ---------------------------------------------------------------- folding
  //
  // The other way source height stops meaning printed height, and it is not the
  // same case as comments. A folded region takes **one line of pixels and prints
  // in full** — the exact opposite of a comment, which takes its full height and
  // prints nothing. Any scheme that counts what is *on screen* is wrong in both
  // directions at once, and by more than either alone in a document that has
  // both.
  //
  // Two things make this work, and only the second is testable here:
  //
  //   - The map is built over the document text, not over the viewport, so
  //     folded content is counted exactly as if it were open. That is what these
  //     assertions pin.
  //   - "Which line is at the top of the source pane" is asked of
  //     `view.lineBlockAtHeight`, which is CodeMirror's own fold-aware height
  //     map. A line count would have been wrong the moment anything folded.
  //
  // The delimiters are the subtle part. `//{ … //}` is the fold that **still
  // prints**, and its own markers are `//` comments — so the markers must weigh
  // nothing and everything between them must weigh full. `/* … */` is the other
  // construct, which folds *and* is removed from the output, so all of it weighs
  // nothing. Getting those two the same way round would be a silent 100% error
  // on whichever one was wrong.

  {
    const line = "שורה שנדפסת\n";
    const open = "//{ קטע מקופל\n";
    const close = "//}\n";
    const folded = printedPrefix(line.repeat(2) + open + line.repeat(4) + close + line.repeat(2));
    const flat = printedPrefix(line.repeat(8));
    check(
      "a fold's body weighs exactly what it would unfolded",
      folded[folded.length - 1],
      flat[flat.length - 1],
    );
  }

  {
    // And the markers themselves are comments, so they are worth nothing — a
    // document made of nothing but fold markers prints nothing.
    const p = printedPrefix("//{ אחד\n//}\n//{ שתיים\n//}\n");
    check("fold markers are not content", p[p.length - 1], 0);
  }

  {
    // The other foldable construct, and the one that goes the other way: a block
    // comment is removed from the output, so it weighs nothing however tall it is.
    const line = "שורה שנדפסת\n";
    const hidden = "/* הערה\nשנמשכת\nעל פני שורות\n*/\n";
    const p = printedPrefix(line.repeat(2) + hidden + line.repeat(2));
    const q = printedPrefix(line.repeat(4));
    check("a hidden block weighs nothing", p[p.length - 1], q[q.length - 1]);
  }

  {
    // Both in one document, which is the case the writer's own file is: the
    // half-way point of the *print* is nowhere near the half-way point of the
    // source, and it is not near the half-way point of the *folded* source either.
    const line = "שורה שנדפסת\n";
    const note = "// הערה\n";
    const text = line.repeat(10) + "//{ קטע\n" + line.repeat(10) + "//}\n" + note.repeat(40) + line.repeat(10);
    const p = printedPrefix(text);
    // Everything above the comment block: twenty printing lines of thirty.
    const beforeNotes = 10 + 1 + 10 + 1;
    check(
      "two thirds of the print is above the comments",
      Math.round(fractionAtLine(p, beforeNotes) * 100),
      67,
    );
    // Folded, the source is 10 + 1 + 40 + 10 = 61 visible lines and that point is
    // line 11 of them — 18% by anything that counted what was on screen.
    ok("...where a visible-line count would have said 18%", Math.round((11 / 61) * 100) === 18);
  }

  // ------------------------------------------------------------- the two directions

  {
    const prose = "שורה\n";
    const note = "// הערה\n";
    const text = prose.repeat(20) + note.repeat(20) + prose.repeat(20);
    const p = printedPrefix(text);

    // Round-trip: a fraction taken off a line has to lead back to a line at the
    // same place in the print. Not the same *line* — the twenty comment lines
    // all sit at the same printed position, and picking one of them is
    // legitimate — so the assertion is about the fraction, which is what both
    // panes are actually steered by.
    for (const line of [0, 5, 19, 20, 35, 40, 50, 59]) {
      const f = fractionAtLine(p, line);
      const back = lineAtFraction(p, f);
      check(`line ${line} round-trips to the same place in the print`, fractionAtLine(p, back), f);
    }
  }

  {
    // Four lines of text and a trailing newline, so the document has five
    // lines — the last one empty — and the prefix has six entries. The answer
    // must be a line somebody can scroll to, which is 0…4 and never 5.
    const p = printedPrefix("א\nב\nג\nד\n");
    check("the top is the top", lineAtFraction(p, 0), 0);
    check("...and the end is the last line, not the boundary past it", lineAtFraction(p, 1), 4);
    // A scrollbar hands over a fraction outside [0,1] during an overscroll, and
    // a clamp here is cheaper than a guard at both call sites.
    check("an overscroll below clamps", lineAtFraction(p, -0.4), 0);
    check("an overscroll above clamps", lineAtFraction(p, 1.9), 4);
    check("and so does the forward direction", fractionAtLine(p, 9999), 1);
  }

  {
    // The prefix sum's own shape, because both readers index it directly: one
    // entry per line boundary, so a document of N lines has N+1 entries and the
    // last one is the total.
    const p = printedPrefix("אב\nגד\nהו\n");
    check("one entry per line boundary", p.length, 5);
    check("nothing is above the first line", p[0], 0);
    check("and the last entry is the whole document", p[p.length - 1], 6);
    ok("the sum never goes backwards", p.every((v, i) => i === 0 || v >= p[i - 1]));
  }
}
