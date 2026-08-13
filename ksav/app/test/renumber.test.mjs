// Renumbering a series, which a list gets for free and a siman does not.
//
// A list's numbers are **not in the source**: Typst counts the items, so
// inserting one in the middle renumbers the rest by construction. A siman's
// number is written by hand, in the text, because that is what a siman is — and
// so nothing renumbered anything. From the margins: *"`#סימן` does not renumber
// when one is inserted in the middle. A list does; this does not."* And then,
// of `#סעיף`, the same sentence again, which is what makes it the family.
//
// The whole risk here is over-reach. Renumbering means rewriting characters the
// writer typed, so most of this file is about what it must **not** touch.

import { check, ok } from "./harness.mjs";
import {
  sequence,
  outOfSequence,
  resequence,
  resequenceAt,
  inSeries,
  continueSeries,
} from "../.tmp-test/numbering.mjs";
import { numberMarks, renumberAll } from "../.tmp-test/numbering-lint.mjs";
import { levelUnder, continueLevel } from "../.tmp-test/headings.mjs";
import { fakeView, installChrome } from "./harness.mjs";

const doc = (...lines) => lines.join("\n") + "\n";

export async function run() {

// ---------------------------------------------------------------- 1. counting

{
  const d = doc("#סימן[א׳][פתיחה]", "טקסט.", "#סימן[ב׳][המשך]", "#סימן[ג׳][סוף]");
  check("a sequence that is already right has nothing wrong with it", outOfSequence(d), []);
  check("and resequencing it changes nothing", resequence(d).text, d);
  check("no edit is reported either", resequence(d).changed, 0);
}

{
  // One inserted in the middle: the writer typed a new siman between א׳ and ב׳,
  // and `continueSeries` gave it ב׳ because that is what precedes it. Now there
  // are two ב׳ and the rest are one short.
  const d = doc("#סימן[א׳][א]", "#סימן[ב׳][חדש]", "#סימן[ב׳][ב]", "#סימן[ג׳][ג]");
  const wrong = outOfSequence(d);
  check("two of the four are out of place", wrong.length, 2);
  check(
    "and the document counts one to four afterwards",
    resequence(d).text,
    doc("#סימן[א׳][א]", "#סימן[ב׳][חדש]", "#סימן[ג׳][ב]", "#סימן[ד׳][ג]"),
  );
}

{
  // Deleted from the middle: the numbers count past the hole.
  const d = doc("#סימן[א׳][א]", "#סימן[ג׳][ג]", "#סימן[ד׳][ד]");
  check(
    "the hole closes",
    resequence(d).text,
    doc("#סימן[א׳][א]", "#סימן[ב׳][ג]", "#סימן[ג׳][ד]"),
  );
}

{
  // Moved: a siman dragged above its neighbour takes its number with it, and
  // the number is what says where it is. Sorting *is* renumbering here.
  const d = doc("#סימן[ב׳][שני]", "#סימן[א׳][ראשון]");
  check(
    "the numbers follow the order on the page",
    resequence(d).text,
    doc("#סימן[א׳][שני]", "#סימן[ב׳][ראשון]"),
  );
}

// ---------------------------------------------------------------- 2. the family

{
  // `#סעיף` restarts inside each siman, which is how a sefer is numbered.
  const d = doc(
    "#סימן[א׳][א]",
    "#סעיף[א][x] #סעיף[ג][y]",
    "#סימן[ב׳][ב]",
    "#סעיף[ה][z] #סעיף[ו][w]",
  );
  check(
    "each siman starts its se'ifim again at א",
    resequence(d).text,
    doc(
      "#סימן[א׳][א]",
      "#סעיף[א][x] #סעיף[ב][y]",
      "#סימן[ב׳][ב]",
      "#סעיף[א][z] #סעיף[ב][w]",
    ),
  );
}

{
  // Both spellings, because a document written in English says `#siman`.
  const d = doc("#siman[א׳][a]", "#siman[ג׳][b]");
  check("the English alias is the same series", resequence(d).text, doc("#siman[א׳][a]", "#siman[ב׳][b]"));
}

// ---------------------------------------------------------------- 3. restraint
//
// Everything below is a character the writer typed that this must not rewrite.

{
  // The document decides its own punctuation. A kuntres writes א׳ and a שולחן
  // ערוך style writes א, and changing one into the other is a typographic
  // decision nobody asked for.
  const d = doc("#סימן[א][א]", "#סימן[ג][ב]");
  check("the style of the first numeral is kept", resequence(d).text, doc("#סימן[א][א]", "#סימן[ב][ב]"));
}

{
  // Not a numeral: not counted, not touched. `#סימן[פתיחה]` is an introduction
  // and `#סימן[1]` is a writer numbering in digits, and renumbering either into
  // a scheme they did not choose is worse than a sequence with a gap in it.
  const d = doc("#סימן[פתיחה][מבוא]", "#סימן[א׳][א]", "#סימן[ב׳][ב]");
  check("a hand-named siman leaves the count alone", outOfSequence(d), []);
  check("and survives verbatim", resequence(d).text, d);
}

{
  const d = doc("#סימן[1][a]", "#סימן[2][b]");
  check("digits are somebody else's scheme", resequence(d).text, d);
}

{
  // The title is the writer's. Only the first group is a number.
  const d = doc("#סימן[א׳][דיני ב׳ הפסקות]", "#סימן[ג׳][עוד]");
  check(
    "a numeral in the title is prose",
    resequence(d).text,
    doc("#סימן[א׳][דיני ב׳ הפסקות]", "#סימן[ב׳][עוד]"),
  );
}

{
  // A command name inside a string literal is not a call — the reason `spans.ts`
  // exists, applied to the thing that rewrites text.
  const d = doc('#usefont("#סימן")[a]', "#סימן[ג׳][b]");
  check("a name in a string is not a member", sequence(d).length, 1);
}

// ---------------------------------------------------------------- 4. the pair

// `continueSeries` and `resequence` answer two halves of one question, and a
// document that has just had the first applied must satisfy the second.
{
  const before = doc("#סימן[א׳][א]", "#סימן[ב׳][ב]");
  const at = before.length;
  const added = continueSeries(before, at, "#סימן[א׳][|]");
  check("a siman added at the end continues the series", added, "#סימן[ג׳][|]");
  const after = before + added.replace("|", "ג") + "\n";
  check("and the document is still in sequence", outOfSequence(after), []);
}

{
  // Added in the middle, where `continueSeries` is right about what precedes it
  // and wrong about everything after — which is the whole finding.
  const before = doc("#סימן[א׳][א]", "#סימן[ב׳][ב]");
  const at = before.indexOf("#סימן[ב׳]");
  const added = continueSeries(before, at, "#סימן[א׳][|]");
  check("the new one takes the number after the one before it", added, "#סימן[ב׳][|]");
  const after = before.slice(0, at) + added.replace("|", "חדש") + "\n" + before.slice(at);
  ok("which leaves the document out of sequence", outOfSequence(after).length > 0);
  check(
    "and resequencing is what makes it right",
    outOfSequence(resequence(after).text),
    [],
  );
}

// ---------------------------------------------------------------- 5. the caret

// This runs immediately after an insertion: the writer has just added a siman in
// the middle and is about to type its title. A renumber that moved them
// somewhere else would be worse than not renumbering at all — and a numeral can
// change length, `ט` to `י`, `יט` to `כ`, so the caret does not stay put on its
// own.

{
  const d = doc("#סימן[ט][a]", "#סימן[ט][b]", "#סימן[יא][c]");
  const caret = d.indexOf("[c]") + 1;
  const done = resequenceAt(d, caret);
  check("three numbers move", done.changed, 3);
  check("and the caret is still on the same character", done.text[done.caret], "c");
}

{
  const d = doc("#סימן[א׳][a]", "#סימן[ג׳][b]");
  const caret = 3; // inside the first command's name, before any edit
  check("a caret before every edit does not move", resequenceAt(d, caret).caret, caret);
}

check("a siman snippet is a series member", inSeries("#סימן[א׳][|]"), true);
check("so is the English one", inSeries("#seif[א][|]"), true);
check("a footnote is not", inSeries("#הערה[|]"), false);

// ---------------------------------------------------------------- 6. the marks

// The model can be right and the mark land on the wrong span, which is a defect
// no test of the model catches — and here the span is a numeral three
// characters wide.

{
  const d = doc("#סימן[א׳][a]", "#סימן[ג׳][b]");
  const marks = numberMarks(d);
  check("one mark", marks.length, 1);
  check("on the numeral itself, and nothing around it", d.slice(marks[0].from, marks[0].to), "ג׳");
  check("saying what it should be", marks[0].wanted, "ב׳");
  check("a document in sequence is unmarked", numberMarks(doc("#סימן[א׳][a]")), []);
}

// The repair, driven the way the lint's button drives it.
{
  const chrome = installChrome();
  try {
    const d = doc("#סימן[א׳][a]", "#סימן[ד׳][b]", "#סימן[ה׳][c]");
    const v = fakeView(d, 0);
    check("it reports what it renumbered", renumberAll(v), 2);
    check("and the document is in sequence", outOfSequence(v.text()), []);
    check("the titles are untouched", v.text().includes("[b]") && v.text().includes("[c]"), true);
    check("a second run has nothing to do", renumberAll(fakeView(v.text(), 0)), 0);
  } finally {
    chrome.restore();
  }
}

// ---------------------------------------------------------------- 7. any level
//
// The same finding one command over. `#כותרת(רמה: 4)` is what the registry ships
// for *"heading at any level"*, and the 4 is a literal in a table that has never
// seen the document — so a command described as taking any level took exactly
// one, silently. The margin note: *"'Heading, any level' quietly inserts level
// 4."*
//
// Four is not even a bad guess: levels 1 to 3 have commands of their own, so 4
// is where "any level" starts being useful. What is wrong is that it is a guess
// at all, when the document knows the answer — the heading you are standing
// under.

check("with no heading above it, a heading is level 1", levelUnder("Body text.\n", 5), 1);
check("under a level-1 heading it is level 2", levelUnder("#h1[Chapter]\n\nBody.\n", 20), 2);
check(
  "and under a level-3 it is level 4 — which is what the literal guessed",
  levelUnder("#h1[A]\n\n#h2[B]\n\n#h3[C]\n\nBody.\n", 32),
  4,
);

{
  const under = "#h1[Chapter]\n\nBody.\n";
  check(
    "the snippet is rewritten to fit where it lands",
    continueLevel(under, under.length, "#כותרת(רמה: 4)[|]"),
    "#כותרת(רמה: 2)[|]",
  );
  check(
    "the English spelling too",
    continueLevel(under, under.length, "#hlevel(level: 4)[|]"),
    "#hlevel(level: 2)[|]",
  );
}

check("nothing else is touched", continueLevel("#h1[A]\n", 8, "#bold[|]"), "#bold[|]");
check(
  "and prose that happens to say the word is not a template",
  continueLevel("#h1[A]\n", 8, "some prose about רמה: 4"),
  "some prose about רמה: 4",
);


}
