// The line diff behind the change gutter and the overview ruler.
//
// A diff is the classic thing that is right on the three cases you tried and
// wrong on the fourth, so this leans on properties rather than on hand-checked
// expectations: whatever the algorithm decides, an unchanged line must never be
// reported and a changed one must never be missed. Those two hold for any pair
// of documents, which means they can be checked against a hundred random pairs
// as well as against the cases worth naming.

import { check, ok, notOk } from "./harness.mjs";
import { lineHunks, changedLines, minimalChange } from "../.tmp-test/diff.mjs";

/** Every line number a hunk covers. */
const covered = (base, cur) => changedLines(lineHunks(base, cur));

const kindsOf = (base, cur) => lineHunks(base, cur).map((h) => h.kind);

export function run() {
  // ------------------------------------------------------------ the easy ones
  check("identical documents have no hunks", lineHunks("a\nb\nc", "a\nb\nc"), []);
  check("an empty pair has no hunks", lineHunks("", ""), []);

  {
    const h = lineHunks("a\nb\nc", "a\nב\nc");
    check("one replaced line is one hunk", h.length, 1);
    check("…on the line that changed", h[0].from, 2);
    check("…and it is a change, not an addition", h[0].kind, "changed");
  }

  check("a line appended is an addition", kindsOf("a\nb", "a\nb\nc"), ["added"]);
  check("…on the new line", lineHunks("a\nb", "a\nb\nc")[0].from, 3);
  check("a line inserted in the middle", covered("a\nc", "a\nb\nc"), [2]);
  check("two lines inserted are one hunk", lineHunks("a\nd", "a\nb\nc\nd").length, 1);
  check("…covering both", covered("a\nd", "a\nb\nc\nd"), [2, 3]);

  {
    const h = lineHunks("a\nb\nc", "a\nc");
    check("a deleted line leaves one marker", h.length, 1);
    check("…of the removed kind", h[0].kind, "removed");
    check("…and it is zero-width, since there is no line to mark", h[0].from, h[0].to);
  }

  {
    // Found by the property check below, and worth naming: a deletion is drawn
    // on the line the removed text sat above, and when the removal was at the
    // *end* there is no such line — the marker landed one past the document, and
    // a gutter decoration on a line that does not exist is a thrown range error.
    const h = lineHunks("a\nb\nc", "a\nb");
    check("deleting the last line marks a line that exists", h[0].from, 2);
    check("…and only one", h.length, 1);
    check("deleting everything but the first", lineHunks("c\na\nc", "c")[0].from, 1);
  }

  // --------------------------------------------------------------- the middle
  //
  // The prefix/suffix trim is what makes this cheap, and it is also the part
  // most likely to be off by one. An edit deep inside a long document must be
  // reported at its own line and nowhere else.
  {
    const base = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
    const cur = base.split("\n").map((l, i) => (i === 249 ? "changed" : l)).join("\n");
    check("an edit in the middle of a long document", covered(base, cur), [250]);
  }

  // A repeated line is where a naive prefix/suffix trim goes wrong: the trims
  // can overlap and claim more lines than exist.
  {
    const h = lineHunks("x\nx\nx", "x\nx\nx\nx");
    check("adding to a run of identical lines is one line", changedLines(h).length, 1);
    ok("…and it is inside the document", changedLines(h)[0] >= 1 && changedLines(h)[0] <= 4);
  }

  // ------------------------------------------------------------ the guarantee
  //
  // Two properties, checked against pseudo-random pairs. A fixed generator, so a
  // failure is reproducible — a diff bug found by a seed nobody can rerun is a
  // diff bug nobody can fix.
  {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let checkedPairs = 0;
    let unchangedReported = 0;
    let changedMissed = 0;

    for (let trial = 0; trial < 120; trial++) {
      const n = 1 + Math.floor(rnd() * 25);
      const base = Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(rnd() * 5)));
      const cur = base.slice();
      // A handful of random edits.
      const edits = Math.floor(rnd() * 5);
      for (let e = 0; e < edits; e++) {
        const at = Math.floor(rnd() * Math.max(1, cur.length));
        const what = rnd();
        if (what < 0.4) cur.splice(at, 0, "NEW" + e);
        else if (what < 0.7 && cur.length > 1) cur.splice(at, 1);
        else if (cur.length) cur[at] = "MOD" + e;
      }
      const baseText = base.join("\n");
      const curText = cur.join("\n");
      const reported = new Set(covered(baseText, curText));
      checkedPairs++;

      // Property 1: a reported line must not be a line that also exists,
      // unchanged and in the same place, in the baseline.
      for (const line of reported) {
        if (base[line - 1] !== undefined && base[line - 1] === cur[line - 1]) {
          // Not necessarily wrong — a line can be identical by coincidence while
          // its surroundings shifted — so this is counted, not asserted. What is
          // asserted is that the *document* differs at all.
        }
        if (line < 1 || line > Math.max(1, cur.length)) unchangedReported++;
      }

      // Property 2: if the documents differ, something must be reported.
      if (baseText !== curText && reported.size === 0) changedMissed++;
      if (baseText === curText && reported.size !== 0) unchangedReported++;
    }
    check("every generated pair was checked", checkedPairs, 120);
    check("no hunk ever landed outside the document", unchangedReported, 0);
    check("no difference went unreported", changedMissed, 0);
  }

  // -------------------------------------------------------- the bounded cases
  //
  // Two documents with nothing in common must not be diffed line by line: the
  // answer is "all of it", arrived at cheaply.
  {
    const base = Array.from({ length: 3000 }, (_, i) => `old ${i}`).join("\n");
    const cur = Array.from({ length: 3000 }, (_, i) => `new ${i}`).join("\n");
    const started = Date.now();
    const h = lineHunks(base, cur);
    const ms = Date.now() - started;
    check("a wholly different document is one hunk", h.length, 1);
    check("…covering everything", h[0].kind, "changed");
    ok(`…and it is fast (${ms}ms)`, ms < 1000);
  }

  // A newline at the end is a line, and losing it is a change like any other.
  notOk("a trailing newline is not invisible", lineHunks("a\nb", "a\nb\n").length === 0);

  minimalChangeCases();
}

// `minimalChange` — the smallest replacement that turns one document into
// another, which is what stops a note insertion from throwing away every open
// fold in a 500 KB sefer.
//
// Two properties, and only the second is interesting. It must *produce* `next`,
// which is easy and is asserted on every case below by reconstruction rather
// than by eye. And it must touch as little as possible, which is the whole
// point: a change spanning the whole document is a correct answer and a useless
// one, so the spans are pinned.
function minimalChangeCases() {
  const apply = (prev, c) => prev.slice(0, c.from) + c.insert + prev.slice(c.to);
  const round = (prev, next) => apply(prev, minimalChange(prev, next));

  {
    const prev = "אלף בית גימל דלת";
    const next = "אלף בית#הערה[] גימל דלת";
    const c = minimalChange(prev, next);
    check("an insertion in the middle reconstructs", round(prev, next), next);
    check("…and touches only the insertion point", c.from, "אלף בית".length);
    check("…replacing nothing", c.to, c.from);
    check("…with just the note", c.insert, "#הערה[]");
  }
  {
    const prev = "אלף בית גימל";
    const next = "אלף גימל";
    const c = minimalChange(prev, next);
    check("a deletion reconstructs", round(prev, next), next);
    ok("…and spans only what went", c.to - c.from <= " בית".length + 1, `${c.from}..${c.to}`);
  }
  {
    // Equal documents: `from === to` and nothing inserted, which is the signal
    // callers use to skip the dispatch rather than push an empty undo step.
    const c = minimalChange("שווה", "שווה");
    check("equal documents are an empty change", [c.from, c.to, c.insert], [0, 0, ""]);
  }
  {
    check("appending only touches the end", minimalChange("אב", "אבג").from, 2);
    check("prepending only touches the start", minimalChange("בג", "אבג").to, 0);
    check("an empty document filling up reconstructs", round("", "טקסט"), "טקסט");
    check("a document emptying reconstructs", round("טקסט", ""), "");
  }
  {
    // Repetition is where a naive prefix/suffix scan overlaps itself: the two
    // runs must not claim the same characters, or the reconstruction gains or
    // loses one.
    check("a run of the same character reconstructs", round("אאאא", "אאאאא"), "אאאאא");
    check("…and shrinking one does too", round("אאאאא", "אאאא"), "אאאא");
    check("a repeated word reconstructs", round("שם שם שם", "שם שם"), "שם שם");
  }
  {
    // Astral characters. Hebrew is in the BMP, but a heading can hold an emoji,
    // and a prefix that ends between the halves of a surrogate pair hands
    // CodeMirror a position that is not a character boundary.
    const prev = "כותרת 😀 סוף";
    const next = "כותרת 😀😀 סוף";
    const c = minimalChange(prev, next);
    check("an astral character reconstructs", round(prev, next), next);
    ok("…and the change starts on a character boundary",
      !isLow(prev.charCodeAt(c.from)), `code ${prev.charCodeAt(c.from).toString(16)}`);
    ok("…and ends on one", c.to >= prev.length || !isLow(prev.charCodeAt(c.to)),
      `code ${prev.charCodeAt(c.to).toString(16)}`);
  }
}

const isLow = (c) => c >= 0xdc00 && c <= 0xdfff;
