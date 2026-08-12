// The document's language, and what gets written in it.
//
// The finding, in the writer's own words, on an English document: *"Wait! now,
// everything is coming in in Hebrew. I don't know why. this is puzzling."*
// Three separate causes, and the third is the one that made it feel arbitrary:
//
//   1. `plan` answers a note **before** `insertionAt`, so a note marker was the
//      one insertion that never passed through the translation every other
//      command got. Notes are the largest command family in this application.
//   2. `פריט`, `תא` and `כותרת_תא` are written without a `#`, because they live
//      inside an argument list. `scan` reads a bare name in a bare snippet as
//      prose — correctly — so the list item, the table cell and the header cell
//      went in in Hebrew whatever the document was.
//   3. `docLang`'s prose rule was `/\p{Script=Hebrew}/.test(doc)`: *any* Hebrew
//      letter made the whole document Hebrew. An English sefer quotes Hebrew,
//      so one posuk flipped every later insertion, which put more Hebrew in,
//      which made the next test even less likely to come out the other way.
//      A one-way test on a bilingual document is a ratchet.
//
// This file is the fence. It walks the registry and the note chooser rather
// than a handful of examples, because the defect was never in one command.

import { check, ok } from "./harness.mjs";
import { facts } from "../tools/facts.mjs";
import { docLang, translated, insertionAt } from "../.tmp-test/mode.mjs";
import { NOTE_CHOICES, applyChoice, hasLine, markersOf, noteFor } from "../.tmp-test/notes.mjs";
import { plan } from "../.tmp-test/insert.mjs";

const HEBREW = /\p{Script=Hebrew}/u;

/**
 * The Hebrew a template is **allowed** to keep when it is written in English.
 *
 * Every entry is a value the engine compares against a Hebrew literal and
 * nothing else, so an English spelling would be a document that does not
 * compile. They are listed one by one rather than waved past by a pattern,
 * because the list is the count of what the engine still owes the other
 * language — and a list that has to be edited is a list somebody reads.
 */
const ALLOWED = [
  // Numbering schemes. `מספור: "א"` says *number these with Hebrew letters*,
  // which an English work on Hebrew sources does as often as not.
  '"א"',
  '"ב"',
  // The sample ordinal on a siman and a seif, for the same reason.
  "[א׳]",
  "[א]",
];

// What is **not** on that list, and was: `פריסה: "צד"` and `תצוגה: "סופי"`.
// Those are enum values, compared by the prelude against a fixed set of names
// rather than used as data, and until `_en_values` existed there was no English
// spelling to give them — an English command taking an English parameter and a
// Hebrew value. Two of them, invisible precisely because they are two lines in
// a file of two thousand. `english_commands.rs` holds the engine's half.

/** What Hebrew survives translation into English, minus what is allowed. */
function leftover(snippet) {
  let rest = translated(snippet, "en");
  for (const allowed of ALLOWED) rest = rest.split(allowed).join("");
  return HEBREW.test(rest) ? rest : null;
}

export async function run() {

// ------------------------------------------------- 1. which language a document is

check("an empty document is Hebrew", docLang("", 0), "he");
check("Hebrew prose is Hebrew", docLang("שלום עולם", 4), "he");
check("English prose is English", docLang("Hello there", 5), "en");

// The ratchet, named. This is the case that produced the report.
{
  const doc = "The gemara in ברכות says so, and the rest of this page is English.\n";
  check("an English page quoting Hebrew is still English", docLang(doc, doc.length), "en");
}
{
  const doc = "הגמרא בברכות אומרת כך, וכן נראה מדברי הראשונים על אתר, ועיין עוד (see below).\n";
  check("a Hebrew page quoting English is still Hebrew", docLang(doc, doc.length), "he");
}

// A document that has said nothing is answered by the page direction, which the
// writer or the template did set. Without this a blank left-to-right document
// took a Hebrew first command — and that one command was then the majority the
// *next* insertion consulted, so the ratchet started on an empty page.
check("a blank document set left-to-right is English", docLang("", 0, "en"), "en");
check("a blank document set right-to-left is Hebrew", docLang("", 0, "he"), "he");
check("and the direction is only a tiebreak", docLang("Hello there", 5, "he"), "en");
check(
  "an empty left-to-right document takes an English first command",
  insertionAt("", 0, "#הדגשה[|]", 0, "en"),
  "#bold[|]",
);

// Commands outweigh prose, which is what makes the second command match the
// first without the writer being asked.
check(
  "a document of English commands is English",
  docLang("#h1[Chapter]\n\n#bold[a]\n", 20),
  "en",
);

// --------------------------------------- 2. every registry template, in English

{
  const commands = facts().commands;
  ok("the registry is not empty", commands.length > 0);
  const guilty = commands
    .map((c) => [c.en, leftover(c.insert)])
    .filter(([, rest]) => rest !== null)
    .map(([en, rest]) => `${en}: ${rest}`);
  check("no registry template writes Hebrew into an English document", guilty, []);
}

// --------------------------------------- 2b. no template ships a placeholder
//
// A slot the writer fills in arrives empty. The four that did not — `#גמרא` came
// as `[ברכות][ב.]`, `#פסוק` as `[מקור][]`, `#רשימת_הגדרות` as `הגדרה[מונח][]`
// and `#עם_פירוש` as `([], [הפירוש])` — put words into the document that looked
// exactly like text the writer had typed. Stated as a rule over all 115 rather
// than as four fixes, because four was how many there happened to be.
//
// A *named* argument is exempt: `כותרת: [הערות]` is a title the block needs and
// a value the writer may keep, which is a default and not a stand-in.
{
  /**
   * The content runs a writer has to fill in.
   *
   * Everything inside a **named** argument is dropped first, at any depth:
   * `סמן: ([◆], [–])` is two list markers and `כותרת: [הערות]` is a title, and
   * both are values the command was given rather than slots left for the
   * writer. What is left is positional content — `#גמרא[…][…]` — which is where
   * a placeholder can hide.
   */
  const positional = (insert) => {
    let depth = 0;
    let named = -1; // the depth at which a named argument's value is being read
    let out = "";
    for (let i = 0; i < insert.length; i++) {
      const ch = insert[i];
      if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") {
        depth--;
        if (named > depth) named = -1;
      } else if (ch === ":" && named < 0) named = depth;
      else if (ch === "," && named === depth) named = -1;
      if (named < 0) out += ch;
    }
    return [...out.matchAll(/\[([^[\]]*)\]/gu)].map((m) => m[1]);
  };
  // The two sample ordinals that are a series' first term rather than a
  // stand-in — `#סימן` and `#סעיף` are continued by the numbering commands,
  // which read what is there.
  const SERIES_START = ["א׳", "א"];
  const guilty = facts()
    .commands.flatMap((c) =>
      positional(c.insert)
        .filter((v) => v !== "" && v !== "|" && !SERIES_START.includes(v))
        .map((v) => `${c.en}: [${v}]`),
    );
  check("no command template ships placeholder content", guilty, []);
}

// The three that have no `#`, called out by name — they are the buttons a
// writer presses most and they were the ones nothing translated.
check("a bare list item", translated("פריט[|]", "en"), "item[|]");
check("a bare table cell", translated("תא[|]", "en"), "cell[|]");
check("a bare header cell", translated("כותרת_תא[|]", "en"), "headcell[|]");
check("and back again", translated("item[|]", "he"), "פריט[|]");

// Content, as opposed to vocabulary: the words inside the brackets.
check(
  "an apparatus title is translated with the command",
  translated("#הערות_בסוף(כותרת: [הערות])", "en"),
  "#endnotes(title: [Notes])",
);
check(
  "and a stream's name, in both places it is written",
  translated('#הגדרות_זרמים(זרמים: ("ביאור", "מקורות"))', "en"),
  '#streams_config(streams: ("Explanation", "Sources"))',
);

// The writer's own text never passes through the table. `plan` splices the
// selection in after translation, so a Hebrew word that happens to be in it is
// safe — this asserts the property that makes the table safe to apply at all.
{
  const doc = "An English page here.\n";
  const r = plan(doc, 3, 6, "מקורות", "#הדגשה[|]");
  check("a selected Hebrew word is not translated", r.text, "#bold[מקורות]");
}

// --------------------------------------- 3. every note layout, in English

{
  const guilty = [];
  for (const c of NOTE_CHOICES) {
    for (const s of [...markersOf(c), c.head, c.tail, c.wrap?.open, c.wrap?.close]) {
      if (!s) continue;
      const rest = leftover(s);
      if (rest !== null) guilty.push(`${c.id}: ${rest}`);
    }
  }
  check("no note layout writes Hebrew into an English document", guilty, []);
}

// The path itself, not just the strings: `plan` short-circuits to `note` before
// `insertionAt`, so this is the assertion that the short-circuit translates too.
{
  const doc = "An English page, and a footnote goes here.\n";
  const at = doc.indexOf("here");
  const found = noteFor("#הערה[|]");
  ok("the footnote is still a note layout", !!found);
  const r = applyChoice(doc, at, found.choice, found.layer, false, { marker: found.marker });
  ok("a footnote in an English document is #fnote", r.text.includes("#fnote["));
  ok("and not #הערה", !r.text.includes("#הערה["));
}

// The scaffolding as well as the marker — the dump call, the configuration
// line and the wrapper are all source the writer has to read.
{
  const doc = "An English page, and an endnote goes here.\n";
  const c = NOTE_CHOICES.find((x) => x.tail && HEBREW.test(x.tail));
  ok("some layout files a Hebrew dump call", !!c);
  const r = applyChoice(doc, 10, c, 0, false);
  check("the scaffolding it adds is English", leftover(r.text), null);
}

// A Hebrew document keeps every one of them Hebrew, which is the other half of
// "follows the document" and the half a one-way fix would have broken.
{
  const doc = "עמוד בעברית, וכאן באה הערה.\n";
  const found = noteFor("#הערה[|]");
  const r = applyChoice(doc, 12, found.choice, found.layer, false, { marker: found.marker });
  ok("a footnote in a Hebrew document is #הערה", r.text.includes("#הערה["));
}

// ------------------------------------------------- 4. scaffolding, asked in both

ok("a dump call is recognised in Hebrew", hasLine("#הערות_בסוף()\n", "#הערות_בסוף()"));
ok(
  "and the same one recognised through its English spelling",
  hasLine("#endnotes()\n", "#הערות_בסוף()"),
);
ok(
  "and the reverse, so neither language gets a second footer",
  hasLine("#הערות_בסוף()\n", "#endnotes()"),
);

// ------------------------------------------------- 5. the whole path, end to end

{
  const doc = "An English page with a table on it.\n";
  const out = insertionAt(doc, doc.length, "#טבלה(עמודות: (1fr, 1fr),\n  כותרת_תא[|], כותרת_תא[],\n)");
  check("a table lands in English", leftover(out), null);
  ok("with English parameters", out.includes("columns:"));
}

}
