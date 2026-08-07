// A sefer numbered by the toolbar comes out numbered.
//
// **Found by writing a kuntres.** `commands.rs` spells the siman snippet
// `#סימן[א׳][|]`. The `|` is the caret, and it is in the *title* — past the
// number — so pressing § three times gives סימן א׳, סימן א׳, סימן א׳, and the
// writer never visits the field that is wrong. The outline pane lists all three
// as `א׳` and nothing anywhere says a word.
//
// It is not a placeholder: `#רשימה(פריט[|],)` inserts an empty item, which is
// one. `א׳` is a value, and it was the only value the product could produce.
//
// Two halves, both tested here: gematria in both directions (there was a reader
// in the prelude, for sorting the source index, and no writer anywhere), and
// the rule that decides what a snippet's number becomes.

import { check, ok } from "./harness.mjs";
import { gematria, hebrewNumeral, continueSeries } from "../.tmp-test/numbering.mjs";

const SIMAN = "#סימן[א׳][|]";
const SEIF = "#סעיף[א][|]";

export async function run() {
  // --------------------------------------------------------------- gematria

  {
    check("one letter", hebrewNumeral(1), "א");
    check("nine", hebrewNumeral(9), "ט");
    check("ten", hebrewNumeral(10), "י");
    check("eleven", hebrewNumeral(11), "יא");
    // The one exception in the scheme, and the reason this is a function.
    check("fifteen is טו and not יה", hebrewNumeral(15), "טו");
    check("sixteen is טז and not יו", hebrewNumeral(16), "טז");
    check("seventeen goes back to the pattern", hebrewNumeral(17), "יז");
    check("twenty", hebrewNumeral(20), "כ");
    check("twenty-one", hebrewNumeral(21), "כא");
    check("a hundred", hebrewNumeral(100), "ק");
    check("a hundred and fifteen keeps the exception", hebrewNumeral(115), "קטו");
    check("two hundred and forty-eight", hebrewNumeral(248), "רמח");
    check("four hundred", hebrewNumeral(400), "ת");
    check("beyond four hundred", hebrewNumeral(500), "תק");
    check("and further", hebrewNumeral(613), "תריג");
    check("nothing for zero", hebrewNumeral(0), "");
    check("nor for a negative", hebrewNumeral(-3), "");
  }

  {
    check("reading one back", gematria("א"), 1);
    check("reading a geresh off", gematria("א׳"), 1);
    check("gershayim too", gematria("ט״ו"), 15);
    check("a final letter is worth its base", gematria("ך"), 20);
    check("a compound", gematria("רמח"), 248);
    // Not a numeral: a number, a word, anything with a stray character.
    check("a digit is not a numeral", gematria("1"), 0);
    check("nor is a word with a non-letter", gematria("פתיחה!"), 0);
    // …and — the case that made this a reader rather than a sum — nor is a
    // Hebrew *word*. Every one of them has a gematria; almost none of them is
    // a numeral. `פתיחה` sums to 504, and continuing from it would renumber an
    // introduction to `תקד`.
    check("a word is not a numeral even though it has a value", gematria("פתיחה"), 0);
    check("nor is a name", gematria("שבת"), 0);
    check("nor the un-spellings of fifteen and sixteen", [gematria("יה"), gematria("יו")], [0, 0]);
    // Letters out of order are not a numeral either.
    check("ascending letters are not a numeral", gematria("אב"), 0);
  }

  {
    // The round trip, over the range a kuntres can reach. `hebrewNumeral` is
    // the only writer and `gematria` the only reader, so if they agree with
    // each other over 613 values there is nothing left for a table to get
    // wrong — including the two spellings that are deliberately irregular.
    const wrong = [];
    for (let n = 1; n <= 613; n++) {
      if (gematria(hebrewNumeral(n)) !== n) wrong.push(`${n} → ${hebrewNumeral(n)}`);
    }
    check("every numeral reads back as its own number", wrong, []);
    ok("and 15 and 16 are still the irregular pair", hebrewNumeral(15) === "טו" && gematria("טו") === 15);
  }

  // ------------------------------------------------------- continuing a series

  {
    check("the first siman keeps the snippet's number", continueSeries("", 0, SIMAN), SIMAN);
    const one = "#סימן[א׳][דין ברכה]\n\n";
    check("the second is ב׳", continueSeries(one, one.length, SIMAN), "#סימן[ב׳][|]");
    const two = one + "#סימן[ב׳][סדר קדימה]\n\n";
    check("the third is ג׳", continueSeries(two, two.length, SIMAN), "#סימן[ג׳][|]");
    // The document's own punctuation, not this module's opinion of it.
    const bare = "#סימן[א][כותרת]\n\n";
    check("a document that writes no geresh keeps none", continueSeries(bare, bare.length, SIMAN), "#סימן[ב][|]");
  }

  {
    // Only what precedes the caret counts: inserting a siman in the middle
    // continues from the one above it, which is what "the next siman" means
    // when you are standing there.
    const doc = "#סימן[א׳][א]\n\nMIDDLE\n\n#סימן[ה׳][ה]\n";
    const at = doc.indexOf("MIDDLE");
    check("from what is above the caret", continueSeries(doc, at, SIMAN), "#סימן[ב׳][|]");
  }

  {
    // A seif restarts inside each siman, which is how a sefer is numbered.
    const doc = "#סימן[א׳][א]\n\n#סעיף[א][ראשון]\n\n#סעיף[ב][שני]\n\n#סימן[ב׳][ב]\n\n";
    check("a seif continues within its siman", continueSeries(doc.slice(0, doc.indexOf("#סימן[ב׳]")), doc.indexOf("#סימן[ב׳]"), SEIF), "#סעיף[ג][|]");
    check("and starts again in the next one", continueSeries(doc, doc.length, SEIF), SEIF);
  }

  {
    // Declining is the right answer to a scheme this does not understand.
    // Renumbering somebody's sefer into a scheme they did not choose would be
    // worse than the bug.
    const digits = "#סימן[1][פתיחה]\n\n";
    check("a numeric series is left alone", continueSeries(digits, digits.length, SIMAN), SIMAN);
    const word = "#סימן[פתיחה][דברי מבוא]\n\n";
    check("and so is a named one", continueSeries(word, word.length, SIMAN), SIMAN);
  }

  {
    // Every other snippet is untouched — this rule is about the two commands
    // that carry a running number in their source, and nothing else.
    for (const snippet of ["#הדגשה[|]", "#כותרת1[|]", "#רשימה(\n  פריט[|],\n)", "#תוכן()", "#הערה[|]"]) {
      check(`untouched: ${snippet.slice(0, 12)}`, continueSeries("#סימן[א׳][x]\n", 20, snippet), snippet);
    }
  }

  {
    // English is a document's language, not the interface's: a sefer written
    // with `#siman` keeps saying `#siman`, and continues its own series.
    const doc = "#siman[א׳][first]\n\n";
    check("the English spelling continues too", continueSeries(doc, doc.length, "#siman[א׳][|]"), "#siman[ב׳][|]");
    // …and the two spellings are one series, because they are one command.
    const mixed = "#סימן[א׳][א]\n\n#siman[ב׳][b]\n\n";
    check("mixed spellings are still one series", continueSeries(mixed, mixed.length, SIMAN), "#סימן[ג׳][|]");
  }

  {
    // The registry's snippet is what this continues *from*, so a change to it
    // that broke the shape would be silent. Read it rather than assumed.
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    const rs = await readFile(path.resolve(HERE, "..", "..", "engine", "src", "commands.rs"), "utf8");
    for (const [name, snippet] of [["סימן", "#סימן[א׳][|]"], ["סעיף", "#סעיף[א][|]"]]) {
      ok(`the registry still ships ${name} as ${snippet}`, rs.includes(`"${snippet}"`));
      // And the caret is still past the number, which is why nobody saw it.
      ok(`…with the caret in the title`, snippet.indexOf("|") > snippet.indexOf("]"));
    }
  }
}
