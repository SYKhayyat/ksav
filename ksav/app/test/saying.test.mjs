// The application knows, and now says.
//
// Five margin comments in the 11 August inventory are one theme, and it is not
// "write more documentation" — the information already exists, in the right
// shape, and does not arrive where the writer stands:
//
//   - A disabled menu item carries a reason in the data. On screen it dropped to
//     38% opacity and said nothing. The comment beside that rule in `styles.css`
//     argues that an item which cannot act "still says so, rather than
//     vanishing": an argument won and never implemented.
//   - The change gutter's marks mean something exact and were unlabelled.
//   - Every command carries a one-line description in both languages. It reached
//     the help panel and stopped.
//
// Two of those were about *commands*, which have a `reason` in the insertion
// grid. The third table — the 35 structural operations — had no reason at all,
// and that is the sweep this file exists to hold: eighteen table operations grey
// out at once when the caret leaves a table, and one greys out on its own when
// it is the top row, and until now those were the same 38% opacity.

import { check, ok, notOk } from "./harness.mjs";
import { STRUCTURE_ACTIONS, actionById, whyNot } from "../.tmp-test/structure.mjs";
import { MARKS, helpSections } from "../.tmp-test/help.mjs";
import { DEFAULT_KEYS } from "../.tmp-test/bindings.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";
import { sourceNotes } from "../.tmp-test/citation.mjs";
import { refMarks } from "../.tmp-test/sourcenote-lint.mjs";

export async function run() {

// ------------------------------------------- 1. every operation declares a reason

{
  const undeclared = STRUCTURE_ACTIONS.filter((a) => !a.why).map((a) => a.id);
  check("every structural operation says why it cannot act", undeclared, []);
  ok("and there are enough of them to matter", STRUCTURE_ACTIONS.length > 30);
}

{
  // In both dictionaries. A reason that falls through to English in a
  // Hebrew-first application is the defect this whole pass is about, one storey
  // down: the information exists and arrives in the wrong language.
  const keys = new Set(STRUCTURE_ACTIONS.map((a) => a.why));
  for (const s of ["list", "table", "heading"]) keys.add(`why.notIn.${s}`);
  const missingHe = [...keys].filter((k) => !DICTS.he[k]);
  const missingEn = [...keys].filter((k) => !DICTS.en[k]);
  check("every reason is written in Hebrew", missingHe, []);
  check("and in English", missingEn, []);
}

// ------------------------------------------- 2. the two sentences are different

// *You are not in a table* is about where the caret is. *This is the top row* is
// about this operation at this caret. A surface that shows only the second when
// the first is true sends the writer looking for a top row they are nowhere
// near — which is what one shared reason per structure would have done.

{
  const plain = "Just a paragraph, with no structure in it at all.\n";
  const rowUp = actionById("table.rowUp");
  check(
    "outside a table, the reason is that you are outside a table",
    whyNot(rowUp, plain, 5),
    "why.notIn.table",
  );

  const table = "#mktable(columns: (1fr, 1fr),\n  cell[a], cell[b],\n  cell[c], cell[d],\n)\n";
  const inFirstRow = table.indexOf("cell[a]") + 5;
  check(
    "in the top row, the reason is that it is the top row",
    whyNot(rowUp, table, inFirstRow),
    "why.topRow",
  );

  const inSecondRow = table.indexOf("cell[c]") + 5;
  check(
    "and a row that can move up says nothing at all",
    whyNot(rowUp, table, inSecondRow),
    null,
  );
}

// The two answers agree with `isEnabled`, everywhere. A reason that appears
// while the control is live, or a greyed control with no reason, is the same
// defect from either side.
{
  const docs = [
    "",
    "Plain prose.\n",
    "#bullets(\n  item[one],\n  item[two],\n)\n",
    "#mktable(columns: (1fr, 1fr),\n  cell[a], cell[b],\n  cell[c], cell[d],\n)\n",
    "#h1[Chapter]\n\nBody text.\n\n#h2[Part]\n\nMore.\n",
  ];
  let disagreements = 0;
  let reasonsSeen = new Set();
  for (const doc of docs) {
    for (let pos = 0; pos <= doc.length; pos++) {
      for (const a of STRUCTURE_ACTIONS) {
        const why = whyNot(a, doc, pos);
        if (why === null) continue;
        reasonsSeen.add(why);
        if (!DICTS.en[why]) disagreements++;
      }
    }
  }
  check("no reason is ever an unwritten key", disagreements, 0);
  ok("the sweep exercised a good spread of them", reasonsSeen.size >= 8);
}

// ------------------------------------------- 3. the legend

// The inventory's line was "the change gutter's red wedge means something exact
// and is unlabelled". It is not one wedge: three marks in that gutter, plus a
// fold arrow, a squiggle and a highlighted line, and not one of them said
// anything anywhere.

{
  const missingHe = MARKS.filter((m) => !DICTS.he[m.what]).map((m) => m.id);
  const missingEn = MARKS.filter((m) => !DICTS.en[m.what]).map((m) => m.id);
  check("every mark has a Hebrew name", missingHe, []);
  check("and an English one", missingEn, []);
  ok("the three change-gutter marks are among them", ["added", "changed", "removed"]
    .every((k) => MARKS.some((m) => m.id === `mark.${k}`)));
  ok("every mark carries something to recognise it by", MARKS.every((m) => !!m.glyph));
}

{
  const t = (k) => DICTS.en[k] ?? k;
  const sections = helpSections({ t, keys: { ...DEFAULT_KEYS }, lang: "en" });
  const legend = sections.find((s) => s.title === "helpMarks");
  ok("the legend is a section of the help panel", !!legend);
  check("with one line per mark", legend.entries.length, MARKS.length);
  notOk(
    "and none of them is an unwritten key",
    legend.entries.some((e) => e.what.startsWith("mark.")),
  );
}

// ------------------------------------------- 4. a source note says what it is

// `#מראה_מקום` is `footnote(text(size: 0.92em, body))` — a footnote, eight per
// cent smaller. Everything that makes it a *source* note is in the half that
// does not print: given `מקור:` it files the entry `#מראה_מקומות()` collects,
// and without one it is a slightly smaller footnote. The inventory's line was
// *a source note's entire value is invisible*.

{
  const doc = [
    "Some prose #sourcenote[Rashi on the posuk] and more.",
    '#מראה_מקום(מקור: "girsa:bavli/berakhot/2a:1")[ברכות ב.]',
    "A #sourcenote(source: \"girsa:x\")[named in English] one.",
  ].join("\n");
  const found = sourceNotes(doc);
  check("all three source notes are found", found.length, 3);
  check(
    "and each says whether it is in the index",
    found.map((n) => n.indexed),
    [false, true, true],
  );
}

{
  // Not a regex over `#\w+`: the name inside a **string literal** is not a
  // call, which is the whole reason `spans.ts` exists. Inside a content block
  // it would be one — `"` is an ordinary character there — so the case has to
  // be written in code position to be the case at all.
  check(
    "a source note named inside a string literal is not one",
    sourceNotes('#usefont("#sourcenote")[a]').length,
    0,
  );
  // A nested call with a colon in it is not a named argument of the outer one.
  check(
    "a colon inside a nested call does not count as the ref",
    sourceNotes("#sourcenote[#bold(size: 2pt)[a]]").map((n) => n.indexed),
    [false],
  );
}

// The marks themselves, not only the model. A model that is right and a mark
// on the wrong span is a defect no test of the model can catch, which is why
// `refMarks` is separated from the `linter()` that renders it.
{
  const doc = 'Before #sourcenote[a phrase] after, and #sourcenote(source: "x")[b] too.\n';
  const marks = refMarks(doc);
  check("one mark, on the note with no ref", marks.length, 1);
  check("it starts at the #", doc[marks[0].from], "#");
  check(
    "and covers the note and nothing after it",
    doc.slice(marks[0].from, marks[0].to),
    "#sourcenote[a phrase]",
  );
  ok("the message is a key both dictionaries answer", !!DICTS.he[marks[0].message]);
  ok("in English too", !!DICTS.en[marks[0].message]);
  check("a document of properly-cited notes is unmarked", refMarks('#sourcenote(source: "x")[b]'), []);
}

}
