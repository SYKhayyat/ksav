// Which pages an export is of, and which routes have pages at all.
//
// > *"A page range is offered for PDF only. No reason has been given for that."*
//
// Two things are being fenced here and they are not the same thing.
//
// **The grammar**, because it is a second statement of one the engine already
// makes — `parse_page_ranges` in `engine/src/lib.rs` — and a second statement
// that nothing compares to the first is how a client and a server come to
// disagree about what `5-` means. The one place the two deliberately differ is
// the offcuts: the engine drops a part it cannot read and says nothing, so
// `1,x,5` exported pages 1 and 5 and never mentioned the `x`. This half keeps
// them so somebody can be told.
//
// **The route table**, because "no reason has been given" is the finding. Every
// route either takes a range or names why it does not, and a route that does
// neither is the state this whole module is a correction for.

import { check, ok, notOk } from "./harness.mjs";
import * as pr from "../.tmp-test/pagerange.mjs";
import { EXPORTS } from "../.tmp-test/header.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";

const spans = (s) => pr.parsePages(s).spans;

export async function run() {

// ---------------------------------------------------------------- the grammar

{
  check("an empty box is every page", pr.parsePages("").spans, null);
  check("and so is whitespace", pr.parsePages("   ").spans, null);
  ok("every page includes any page", pr.includes(pr.ALL, 1) && pr.includes(pr.ALL, 999));
}

{
  check("a single page", spans("4"), [{ from: 4, to: 4 }]);
  check("a range", spans("2-5"), [{ from: 2, to: 5 }]);
  check("an open end", spans("7-"), [{ from: 7, to: null }]);
  check("an open start", spans("-3"), [{ from: null, to: 3 }]);
  check("a list of them", spans("1,3,5-9"), [
    { from: 1, to: 1 },
    { from: 3, to: 3 },
    { from: 5, to: 9 },
  ]);
  check("spaces are not part of the answer", spans(" 1 , 3 "), [
    { from: 1, to: 1 },
    { from: 3, to: 3 },
  ]);
  check("and an empty piece is skipped rather than refused", spans("1,,3").length, 2);
}

{
  // What the engine drops in silence, kept.
  check("a piece that names nothing is kept as an offcut", pr.parsePages("1,x,5").bad, ["x"]);
  check("and the pages that did parse still parse", spans("1,x,5").length, 2);
  // A bare `-` would otherwise read as "every page" and swallow the rest of the
  // spec — the engine's own note, on the same line of its parser.
  check("a bare dash names nothing", pr.parsePages("-").bad, ["-"]);
  check("a backwards range names nothing", pr.parsePages("9-2").bad, ["9-2"]);
  check("nor does page zero", pr.parsePages("0").bad, ["0"]);
  check("a clean spec has no offcuts", pr.parsePages("1-4").bad, []);
}

// ---------------------------------------------------------------- what it selects

{
  const spec = pr.parsePages("1,3,5-6");
  check(
    "the pages named, and no others",
    [1, 2, 3, 4, 5, 6, 7].filter((n) => pr.includes(spec, n)),
    [1, 3, 5, 6],
  );
  check(
    "and `select` picks them out of a list in order",
    pr.select(spec, ["a", "b", "c", "d", "e", "f", "g"]),
    ["a", "c", "e", "f"],
  );
  check("every page selects everything", pr.select(pr.ALL, ["a", "b"]), ["a", "b"]);
}

{
  const open = pr.parsePages("3-");
  ok("an open end runs to the end", pr.includes(open, 3) && pr.includes(open, 400));
  notOk("and not before its start", pr.includes(open, 2));
  const upto = pr.parsePages("-3");
  ok("an open start runs from the first page", pr.includes(upto, 1) && pr.includes(upto, 3));
  notOk("and stops where it says", pr.includes(upto, 4));
}

{
  // Not an error — Typst drops them — but the difference between "I asked for
  // 5-9 and got five pages" and "I asked for 5-9 of a four-page document and got
  // nothing", and only one of those looks like a broken printer.
  ok("asking past the end is worth saying", pr.beyond(pr.parsePages("5-9"), 4));
  notOk("asking inside it is not", pr.beyond(pr.parsePages("2-3"), 4));
  notOk("and every page is never past the end", pr.beyond(pr.ALL, 4));
  // The far end of a range may overshoot: `5-99` of a six-page document is a
  // perfectly ordinary way to say "from 5 to the end".
  notOk("an overshooting far end is not asking past the end", pr.beyond(pr.parsePages("5-99"), 6));
}

// ---------------------------------------------------------------- the routes

{
  check("the paginated routes", [...pr.PAGINATED], ["exportPdf", "print"]);
  ok("the PDF takes a range", pr.takesRange("exportPdf"));
  ok("and so does print, which is where the question is actually asked", pr.takesRange("print"));
  check("a route that takes one has no reason not to", pr.whyNoRange("exportPdf"), null);
}

{
  // The finding, as a fence: every export route either takes a range or says
  // why not. A route added later that does neither fails here rather than
  // silently ignoring whatever the writer typed.
  const mute = EXPORTS.filter((id) => !pr.takesRange(id) && !pr.whyNoRange(id));
  check("every route either takes a range or gives a reason", mute, []);
}

{
  // And the reasons are real sentences in both languages, not keys.
  const reasons = [...new Set(EXPORTS.map((id) => pr.whyNoRange(id)).filter(Boolean))];
  ok("there are reasons to check", reasons.length > 0);
  check(
    "each is translated in Hebrew",
    reasons.filter((k) => !DICTS.he[k]),
    [],
  );
  check(
    "and in English",
    reasons.filter((k) => !DICTS.en[k]),
    [],
  );
}

{
  // The two kinds of reason are genuinely different, and the split is the part
  // worth holding: reflow has no pages because the reader decides them, source
  // has no pages because it was never laid out.
  check("Word and web HTML reflow", [
    pr.whyNoRange("exportWord"),
    pr.whyNoRange("copyForWord"),
    pr.whyNoRange("exportHtml"),
  ], ["noPagesReflow", "noPagesReflow", "noPagesReflow"]);
  check("Markdown, text and .typ are the source", [
    pr.whyNoRange("exportMarkdown"),
    pr.whyNoRange("exportText"),
    pr.whyNoRange("exportTypst"),
  ], ["noPagesSource", "noPagesSource", "noPagesSource"]);
}

}
