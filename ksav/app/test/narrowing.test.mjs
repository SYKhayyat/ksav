// A pane locked to one section.
//
// The feature is *"one pane restricted to a single siman while another shows the
// whole sefer"*, and the assertions here are about the three things that can be
// got wrong without anything looking wrong on screen: where a section ends, what
// gets stored so the restriction survives an edit, and whether an edit that
// reaches outside is actually refused. The last of those is the one that matters:
// hiding text a pane can still write into is not narrowing, it is a curtain.

import { check, ok, notOk } from "./harness.mjs";
import { EditorState } from "@codemirror/state";
import {
  changeReachesOut,
  insideSpan,
  narrowAnchor,
  narrowedTo,
  narrowing,
  reaches,
  setNarrow,
  spanAt,
} from "../.tmp-test/narrowing.mjs";

const DOC = [
  "פתיחה לפני כל סימן.",
  "",
  "#כותרת[סימן א]",
  "גוף הסימן הראשון.",
  "",
  "#כותרת(רמה: 2)[סעיף]",
  "תת־סעיף שבתוך הסימן הראשון.",
  "",
  "#כותרת[סימן ב]",
  "גוף הסימן השני.",
].join("\n");

const at = (s) => DOC.indexOf(s);

export async function run() {

// ------------------------------------------------------------ where it reaches

{
  const inFirst = spanAt(DOC, at("גוף הסימן הראשון"));
  ok("a position inside a section has one", !!inFirst);
  check("it starts at the heading's line", inFirst.from, at("#כותרת[סימן א]"));
  check("and it is named by the heading", inFirst.title, "סימן א");

  // The rule that makes "narrow to this siman" mean the siman rather than its
  // first paragraph: a *deeper* heading is part of this section, so a se'if
  // inside a siman comes with it. Getting this backwards would restrict the
  // pane to the four lines above the first sub-heading, which looks like a
  // working feature and is a different one.
  ok("a deeper heading inside it is part of it", inFirst.to > at("תת־סעיף"));
  ok("…and the next section is not", inFirst.to < at("#כותרת[סימן ב]"));

  // Not one character further, either. The end is the line end above the next
  // heading, and a `to` that reached the heading's own line start would leave
  // CodeMirror a block decoration beginning mid-line — which throws from inside
  // a decoration computation, the least legible place in this application for a
  // document to arrive at.
  check("it ends at the line above the next heading", inFirst.to, at("#כותרת[סימן ב]") - 1);
}

{
  const inSub = spanAt(DOC, at("תת־סעיף"));
  check("standing in a sub-section narrows to the sub-section", inSub.from, at("#כותרת(רמה: 2)"));
  ok("…which is inside the siman, not equal to it", inSub.from > at("#כותרת[סימן א]"));
}

{
  // A real state, and the honest answer is that there is no section here — not
  // that the section is the whole document. "Narrow to everything" reported as
  // success is a narrowing that narrows nothing.
  check("above the first heading there is no section", spanAt(DOC, 3), null);
}

// ---------------------------------------------------------------- what is kept

{
  // The anchor is the heading's own start and not the snapped line start, and
  // this is the assertion that says why: resolving the anchor has to give back
  // the same section. In a document where a heading does not begin its line the
  // two differ, and the snapped one resolves to the section *above*.
  const inline = "טקסט לפני #כותרת[סימן] וגוף אחריו.\nעוד שורה.";
  const span = spanAt(inline, inline.indexOf("וגוף"));
  ok("a heading mid-line still has a section", !!span);
  ok("…whose start is snapped back to the line", span.from < span.anchor);
  check("…and whose anchor resolves to the same section", spanAt(inline, span.anchor).anchor, span.anchor);
}

// --------------------------------------------------------------- the refusal

{
  const span = spanAt(DOC, at("גוף הסימן הראשון"));
  notOk("an edit at the very start is inside", reaches(span, span.from, span.from));
  notOk("…and one at the very end is too", reaches(span, span.to, span.to));
  ok("one that begins above it is outside", reaches(span, span.from - 1, span.to));
  ok("and one that runs past it is outside", reaches(span, span.from, span.to + 1));
  // The case a `from`-only test would miss: a selection that starts inside and
  // swallows the rest of the sefer, which is what `Ctrl+A` followed by a
  // keystroke is.
  ok("a change that starts inside and runs to the end is outside", reaches(span, span.to - 1, DOC.length));
}

// ------------------------------------------------- and it survives being typed

{
  const state = EditorState.create({ doc: DOC, extensions: [narrowing] });
  check("a fresh state is not narrowed", narrowedTo(state), null);

  const narrowed = state.update({ effects: setNarrow.of(spanAt(DOC, at("גוף הסימן הראשון")).anchor) }).state;
  check("narrowed, it says which section", narrowedTo(narrowed).title, "סימן א");

  // The whole reason the anchor lives in the editor state rather than on the
  // pane: the other pane is still showing the whole sefer and is still being
  // typed into. Text arriving *above* the section must move the section, not
  // change which section this is.
  const after = narrowed.update({ changes: { from: 0, insert: "שורה חדשה לגמרי למעלה.\n" } }).state;
  check("text typed above it does not change which section", narrowedTo(after).title, "סימן א");
  check(
    "…and the span moves by what was inserted",
    narrowedTo(after).from - narrowedTo(narrowed).from,
    "שורה חדשה לגמרי למעלה.\n".length,
  );

  // A section that grows as it is written stays narrowed to all of itself,
  // which is what re-deriving the span from an anchor buys over storing a range.
  const grown = narrowed.update({
    changes: { from: at("גוף הסימן הראשון") + 4, insert: "\nעוד פסקה בתוך הסימן." },
  }).state;
  ok(
    "a section written into stays narrowed to all of it",
    narrowedTo(grown).to - narrowedTo(grown).from >
      narrowedTo(narrowed).to - narrowedTo(narrowed).from,
  );

  const wide = narrowed.update({ effects: setNarrow.of(null) }).state;
  check("widening gives the whole document back", narrowedTo(wide), null);
  check("and the anchor is gone with it", wide.field(narrowAnchor), null);
}

{
  // The refusal, asked of a real changeset rather than of two numbers — this is
  // the call `main.ts` makes before letting a pane's edit reach the primary.
  const state = EditorState.create({ doc: DOC, extensions: [narrowing] });
  const span = spanAt(DOC, at("גוף הסימן הראשון"));
  const inside = state.update({ changes: { from: span.from + 5, insert: "ו" } });
  const outside = state.update({ changes: { from: DOC.length, insert: "ו" } });
  notOk("an edit within the section is allowed", changeReachesOut(span, inside.changes));
  ok("an edit past the end of it is not", changeReachesOut(span, outside.changes));
}

// ------------------------------------------------------------- the caret

{
  const span = spanAt(DOC, at("גוף הסימן הראשון"));
  check("a caret above the section is pulled to its start", insideSpan(span, 0), span.from);
  check("one below it is pulled to its end", insideSpan(span, DOC.length), span.to);
  check("and one already inside is left alone", insideSpan(span, span.from + 3), span.from + 3);
}

}
