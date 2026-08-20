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
import { printedPrefix, fractionAtLine, lineAtFraction, viewportFraction } from "../.tmp-test/scrollmap.mjs";

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

  await clickTargetChecks();
  await deferredBodyChecks();
}

// ------------------------------------------------- where a click's answer lands
//
// `clickTarget: "keep"` is the second half of the click settings, and its whole
// content is this function: a click three quarters of the way down one pane is
// answered three quarters of the way down the other. Pixels are the wrong
// currency again — the two panes are different heights — so the unit crossing
// the seam is a fraction, and the arithmetic that produces it is here rather
// than inline in the click handler so it can be asked the awkward questions.
async function clickTargetChecks() {

  check("the top edge is 0", viewportFraction(100, 400, 100), 0);
  check("the bottom edge is 1", viewportFraction(100, 400, 500), 1);
  check("halfway is a half", viewportFraction(100, 400, 300), 0.5);
  check("three quarters down", viewportFraction(0, 400, 300), 0.75);

  // A pane's own top, not the window's. In a stacked split the lower source
  // starts most of the way down the screen and a click at its first line is at
  // *its* top — reading `clientY` against the window would answer 0.9 for a
  // click on line one.
  check("the offset is the pane's, not the screen's", viewportFraction(600, 300, 600), 0);

  // Clicks outside the box are real: a mouseup can be delivered after the
  // pointer has left the pane. Clamped rather than extrapolated, because there
  // is no such place as "minus a tenth of the way down the preview".
  check("above the pane clamps to the top", viewportFraction(100, 400, 20), 0);
  check("below it clamps to the bottom", viewportFraction(100, 400, 9999), 1);

  // A pane of no height. Happens for real — mid-collapse, or measured before
  // layout — and the answer must be a number rather than the NaN that would
  // otherwise be written straight into a scrollTop.
  check("a pane of no height answers the top", viewportFraction(0, 0, 50), 0);
  ok("and never NaN", Number.isFinite(viewportFraction(0, 0, 50)));
}

// ------------------------------------------- a deferred body prints elsewhere
//
// The residue the module header used to end on, now asserted rather than
// admitted. A deferred note is written as a marker in the prose and a body
// filed somewhere else — commonly, and by this application's own default, in a
// block at the very end of the document. All of that body's text prints on the
// page its marker is on, and none of it prints at the end.
//
// Counted in source order, that block is printed length sitting after every
// line of the sefer, so the last stretch of the source maps to no movement of
// the preview at all and everything before it is squeezed. The more notes a
// writer has — which is to say the more of a sefer this is — the worse it gets,
// which is the same shape as the comments defect above and the reason this map
// exists in the first place.
async function deferredBodyChecks() {
  const line = "מילים שנדפסות כאן\n";

  // Four lines, a marker, four more lines, and the body filed at the end —
  // which is where this application's own default puts it.
  const deferred =
    line.repeat(4) +
    'טקסט#הערה_בשם("א")\n' +
    line.repeat(4) +
    '#גוף_הערה("א")[הביאור שלי]\n';

  const pd = printedPrefix(deferred);
  // The body is counted, once, and it is really the body being counted: the
  // same document with the body line struck off prints exactly the body less.
  const without = printedPrefix(deferred.slice(0, deferred.indexOf("#גוף_הערה")));
  check(
    "the filed body is counted exactly once",
    pd[pd.length - 1] - without[without.length - 1],
    "הביאור שלי".length,
  );

  // The four lines after the marker are prose and nothing else, so by the time
  // the reader reaches the filed body every printing character is behind them.
  check("the filed body leaves nothing to print after it", fractionAtLine(pd, 9), 1);
  // And the block itself is not a stretch of source that moves the preview:
  // the line the body sits on and the line after it are the same place.
  check("the body's own lines carry no weight", fractionAtLine(pd, 10), 1);

  // The marker's line is where the body's weight went. Below it the fraction is
  // short of the end by the body; at the next line the body has been counted.
  ok(
    "the body is counted at the marker, not at the end",
    fractionAtLine(pd, 5) > fractionAtLine(pd, 4),
  );

  // A body nobody names prints nowhere, so it weighs nothing anywhere — and in
  // particular it must not keep its weight where it is written, which is what
  // "strike it out, then look for a marker" gets right and "add it at the
  // marker if there is one" would not.
  const orphan = line.repeat(4) + '#גוף_הערה("יתום")[טקסט שלא ייקרא לעולם]\n';
  const po = printedPrefix(orphan);
  const plain = printedPrefix(line.repeat(4));
  check("an unnamed body weighs nothing", po[po.length - 1], plain[plain.length - 1]);

  // Two markers, one body: the note is cited twice and printed once. Splitting
  // the weight between them would invent ink, and giving it to both would count
  // the body twice — which is the mistake that makes this map worse than the
  // one that ignored the problem.
  const twice =
    'א#הערה_בשם("א")\n' + line + 'ב#הערה_בשם("א")\n' + '#גוף_הערה("א")[הביאור]\n';
  const pt = printedPrefix(twice);
  const noBody = printedPrefix('א#הערה_בשם("א")\n' + line + 'ב#הערה_בשם("א")\n');
  check(
    "a body cited twice is still counted once",
    pt[pt.length - 1] - noBody[noBody.length - 1],
    "הביאור".length,
  );

  // The cheap path out — a document with no `#` in it at all skips the scan —
  // must be the same answer and not merely a faster one. Same prose, one with a
  // command in it that has nothing to do with notes.
  const noHash = printedPrefix(line.repeat(3));
  const hashed = printedPrefix(line.repeat(3) + "#כלול(\"פרק.ksav\")\n");
  check("skipping the scan is not a different answer", noHash[noHash.length - 1], 51);
  check("and a non-note command still prints nothing", hashed[hashed.length - 1], 51);
}
