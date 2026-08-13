// The editor's half of spell-checking: which text is worth checking, and the
// writer's own dictionary.
//
// The lexicon and the checking itself live in the engine (engine/src/spell/)
// and are tested there. What is testable here is the part that decides *what* to
// send — sending command names to the checker would underline `#הדגשה` on the
// first document anyone wrote — and the dictionary that is about to become a
// file the writer owns.

import { check, ok, notOk, resetStorage, fakeView } from "./harness.mjs";
import * as spell from "../.tmp-test/spell.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC = path.resolve(dirOf(import.meta.url), "..", "src");

export async function run() {
  // ------------------------------------------------------------ what gets checked
  {
    // Only text that will actually print. A command name is not a misspelling,
    // and underlining one would make the feature useless immediately.
    const text = spell.checkableText("#הדגשה[שלום עולם]");
    ok("the prose survives", text.includes("שלום עולם"));
    notOk("the command name does not", text.includes("הדגשה"));
    check("…and the offsets are preserved", text.length, "#הדגשה[שלום עולם]".length);
  }

  {
    const src = "טקסט // הערה בשורה\nעוד";
    const text = spell.checkableText(src);
    notOk("a line comment is not checked", text.includes("הערה בשורה"));
    ok("the prose around it is", text.includes("טקסט") && text.includes("עוד"));
    check("offsets are still preserved", text.length, src.length);
  }

  // Inside `(…)` Typst is already in code context, so nested calls are written
  // **bare** — `תא[…]`, `פריט[…]` — with no `#`. The command scanner matches on
  // `#`, so it never saw them, and blanking a head as one range from `#` to the
  // closing paren blanked every table cell and every list item with it. Tables
  // and lists are two of the most common structures in the product; a large
  // share of real prose, including the list in Ksav's own starter document, was
  // silently exempt from the checker.
  {
    const src = '#טבלה(עמודות: 2, תא[רש"י], תא[שו"ע])';
    const text = spell.checkableText(src);
    ok("cell contents are checked", text.includes('רש"י') && text.includes('שו"ע'));
    notOk("argument names are not", text.includes("עמודות"));
    check("offsets are preserved", text.length, src.length);
  }

  {
    // The gershayim in the cell above are the reason this needs its own case:
    // Hebrew writes them as `"`, and a scanner that treats `"` as a string
    // delimiter swallows everything from one citation to the next.
    const text = spell.checkableText('#טבלה(עמודות: 1, תא[רש"י], תא[מהרש"א], תא[שוב])');
    ok("the cell after a gershayim cell is still checked", text.includes("שוב"));
    ok("…and the one between them", text.includes('מהרש"א'));
  }

  {
    const text = spell.checkableText("#רשימה(פריט[אלף], פריט[בית])");
    ok("list items are checked", text.includes("אלף") && text.includes("בית"));
    notOk("the item command name is not", text.includes("פריט"));
  }

  {
    // A genuine string argument must still be skipped, or `כותרת: "תא[x]"` reads
    // as a call.
    const text = spell.checkableText('#טבלה(כותרת: "מילה_בתוך_מחרוזת", תא[גוף])');
    notOk("a string argument is not checked", text.includes("מילה_בתוך_מחרוזת"));
    ok("…and the cell after it still is", text.includes("גוף"));
  }

  {
    // A bare call whose own arguments hold more bare calls.
    const text = spell.checkableText("#רשימה(פריט[חיצוני], תת_רשימה(פריט[פנימי]))");
    ok("a nested argument list is descended into", text.includes("פנימי"));
    ok("…without losing the outer item", text.includes("חיצוני"));
  }

  {
    // A command inside a cell is markup again, so its head must be blanked even
    // though the cell body around it was exposed.
    const text = spell.checkableText("#טבלה(עמודות: 1, תא[#הדגשה[מודגש]])");
    ok("prose inside a command inside a cell is checked", text.includes("מודגש"));
    notOk("…and that command's name is not", text.includes("הדגשה"));
  }

  {
    // A comment inside a cell still never reaches the page.
    const text = spell.checkableText("#רשימה(פריט[גלוי /* מוסתר */])");
    ok("the item text is checked", text.includes("גלוי"));
    notOk("the comment inside it is not", text.includes("מוסתר"));
  }

  {
    // Comments, switchable. The checker's rule is *never underline what does not
    // print*, and a comment does not print — but it is still prose somebody
    // typed, and for a writer who parks paragraphs in one it would be the only
    // unchecked text in the sefer.
    const src = "גלוי // מוסתר\n/* גם זה */";
    notOk("off by default", spell.checkableText(src).includes("מוסתר"));
    ok("on when asked", spell.checkableText(src, { comments: true }).includes("מוסתר"));
    ok("…including a block one", spell.checkableText(src, { comments: true }).includes("גם"));
    ok("the prose is checked either way", spell.checkableText(src).includes("גלוי"));
    // The offset guarantee holds in both settings, or every squiggle in a
    // commented document lands on the wrong word.
    check("length is preserved with comments on", spell.checkableText(src, { comments: true }).length, src.length);
    // A command name inside a comment is still a command name.
    notOk(
      "markup inside a comment is not suddenly prose",
      spell.checkableText("// #הדגשה[א]", { comments: true }).includes("הדגשה"),
    );
  }

  {
    // The offset guarantee, stated on its own: every squiggle is positioned by
    // an index into this string, so it has to be the same length as the source
    // it came from or every marker lands somewhere else.
    for (const src of [
      "",
      "סתם טקסט",
      "#הערה[א#הערה_על_הערה[ב]]",
      "/* בלוק */ אחרי",
      "#רשימה(פריט[א], פריט[ב])",
      '#צבע(rgb("#ff0000"))[אדום]',
    ]) {
      check(`checkableText preserves length: ${JSON.stringify(src).slice(0, 30)}`,
        spell.checkableText(src).length, src.length);
    }
  }

  {
    const regions = spell.proseRegions("#הדגשה[שלום]");
    ok("prose regions are found", regions.length > 0);
    ok("…and stay inside the text", regions.every((r) => r.from >= 0 && r.to <= "#הדגשה[שלום]".length));
    ok("…and are ordered", regions.every((r, i, a) => i === 0 || r.from >= a[i - 1].to));
  }

  // ------------------------------------------------------------ the dictionary
  {
    await resetStorage();
    check("it starts empty", spell.userWords(), []);

    spell.addUserWord("מהרש\"א");
    check("a word is remembered", spell.userWords(), ['מהרש"א']);
    spell.addUserWord("מהרש\"א");
    check("adding it twice keeps one", spell.userWords().length, 1);

    spell.addUserWord("חבורה");
    check("the engine gets a newline list", spell.userWordsText(), 'מהרש"א\nחבורה');

    spell.removeUserWord('מהרש"א');
    check("a mistaken word can be taken back", spell.userWords(), ["חבורה"]);
  }

  {
    // Corrupt storage must read as an empty dictionary, not throw on boot.
    await resetStorage();
    localStorage.setItem("ksav.userWords", "not json at all");
    check("corrupt storage reads as empty", spell.userWords(), []);
    localStorage.setItem("ksav.userWords", JSON.stringify(["ok", 42, null, "  "]));
    check("non-strings and blanks are filtered out", spell.userWords(), ["ok"]);
  }

  // ------------------------------------------------------------ portability
  //
  // The dictionary lives in one browser profile: invisible to the desktop app,
  // gone if the profile is cleared. Until there is somewhere to sync it to, the
  // writer at least owns it as a file.
  {
    await resetStorage();
    spell.addUserWord('מהרש"א');
    spell.addUserWord("חבורה");
    const file = spell.exportUserWords();
    ok("the export is commented", file.startsWith("#"));
    ok("…and contains the words", file.includes('מהרש"א') && file.includes("חבורה"));

    await resetStorage();
    check("importing an export restores it", spell.importUserWords(file), 2);
    check("…exactly", spell.userWords().sort(), ['חבורה', 'מהרש"א'].sort());
  }

  {
    // Merge, not replace: someone loading their dictionary onto a second
    // machine wants both halves.
    await resetStorage();
    spell.addUserWord("כבר-כאן");
    const added = spell.importUserWords("# a header\n\nחדשה\nכבר-כאן\n");
    check("only genuinely new words count", added, 1);
    check("…and nothing already there is lost", spell.userWords().sort(), ["חדשה", "כבר-כאן"].sort());
  }

  {
    await resetStorage();
    check("importing nothing adds nothing", spell.importUserWords("# only comments\n\n"), 0);
    check("…and leaves an empty dictionary empty", spell.userWords(), []);
    check("an empty dictionary still exports a readable file", spell.exportUserWords().startsWith("#"), true);
    check("…that round-trips to nothing", spell.importUserWords(spell.exportUserWords()), 0);
  }

  // ------------------------------------------------------------ English markup
  //
  // Command names are Latin now too, and that matters more than it sounds. The
  // Hebrew command names were never underlined partly because they *are* Hebrew
  // words the lexicon knows; `mktable` and `headcell` are not English words, so
  // if the masker did not reach them every English document would open covered
  // in squiggles over its own markup.
  {
    const src = "#h1[The Chiyuv]\n\n#mktable(columns: 2, headcell[Posek], cell[Rambam])";
    const text = spell.checkableText(src);
    ok("English prose survives", text.includes("The Chiyuv") && text.includes("Rambam"));
    notOk("the command name does not", text.includes("mktable"));
    notOk("nor a bare call head inside the arguments", text.includes("headcell"));
    ok("…while its body does", text.includes("Posek"));
    check("offsets are preserved", text.length, src.length);
  }

  // ------------------------------------------------------------ what is checked
  //
  // "It checks Hebrew and English" is a claim about what the engine loaded, and
  // this app has already shipped a wasm module that silently had no checker in
  // it at all. So the interface reports the sizes the engine returns rather than
  // repeating the claim.
  {
    check("nothing is claimed before the first check", spell.lexiconSizes(), null);
    spell.noteLexiconSizes({ he: 269385, en: 97136 });
    check("both lexicons are reported", spell.lexiconSizes(), { he: 269385, en: 97136 });
    spell.noteLexiconSizes({ he: 269385 });
    check("a missing lexicon reads as zero, not as absent",
      spell.lexiconSizes(), { he: 269385, en: 0 });
    spell.noteLexiconSizes(undefined);
    check("…and a response without the field leaves the last answer alone",
      spell.lexiconSizes(), { he: 269385, en: 0 });
  }

  // ------------------------------------------------------- reaching a squiggle
  //
  // The defect that stopped a review: *"I can't put my cursor on something which
  // is spell-checked, which is highly inconvenient"*, and later, sharper, *"the
  // no cursor on or after a spell-checked word is very annoying"*.
  //
  // Two causes, and the second is why the report says "or after". `main.ts` bound
  // `mousedown` over a squiggle to the suggestion menu with `preventDefault()` in
  // front of it, so the left button — whose one job is to place the caret — never
  // placed it. And `misspellingAt` counted `start + len` as inside the word, so
  // the boundary *after* the last character was a hit too. A writer with a page
  // of unrecognised Torah terminology could not click into their own sentences.
  //
  // The caret question and the pointer question are separate now, and the
  // assertions below are the difference between them.
  {
    const doc = "שלום זעפרן עולם";
    const start = doc.indexOf("זעפרן");
    const len = "זעפרן".length;
    const v = fakeView(doc, 0, [spell.misspellings]);
    v.dispatch({ effects: spell.setMisspellings.of([{ start, len, word: "זעפרן", lang: "he" }]) });

    // The caret sits *between* characters, so both ends are legitimately inside
    // the word — that is what makes the keyboard route work when you have just
    // finished typing it.
    ok("the caret before the word is in it", !!spell.misspellingAt(v, start));
    ok("the caret inside the word is in it", !!spell.misspellingAt(v, start + 2));
    ok("the caret just after the word is in it", !!spell.misspellingAt(v, start + len));

    // A pointer landed on a *character*. The boundary after the last one belongs
    // to the next word, and treating it as a hit is the "or after" in the report.
    ok("a click on the word finds it", !!spell.misspellingUnder(v, start));
    ok("…and inside it", !!spell.misspellingUnder(v, start + 2));
    check("a click after the word finds nothing", spell.misspellingUnder(v, start + len), null);
    check("nor before it", spell.misspellingUnder(v, start - 1), null);
  }

  {
    // The other half, and the one no unit test of `spell.ts` can reach: the
    // handler that swallowed the click lived in `main.ts`, which boots the
    // application on import and so can only be read. A prohibition, then —
    // the same shape `chrome.test.mjs` uses, and for the same reason: absence
    // is the one thing a regex over source gets right every time.
    const main = readFileSync(path.join(SRC, "main.ts"), "utf8");
    const handlers = main.slice(main.indexOf("EditorView.domEventHandlers({"));
    notOk(
      "nothing binds the left button over a squiggle any more",
      /\bmousedown\s*\(/.test(handlers),
    );
    ok(
      "the pointer route asks the pointer's question",
      main.includes("spell.misspellingUnder(v, pos)"),
    );
    ok(
      "…and there is a keyboard route, so nothing is lost with the gesture",
      main.includes('id: "spellSuggest"'),
    );
  }

  {
    // The squiggle stopped claiming to be a button, and started saying what it
    // is. Both halves matter: `cursor: pointer` on text the left button no
    // longer acts on is the same lie one layer down, and the tooltip is the
    // only thing left telling a writer that suggestions exist at all.
    const css = readFileSync(path.join(SRC, "styles.css"), "utf8");
    const rule = css.slice(css.indexOf(".cm-spell-error {"), css.indexOf(":root[data-theme=\"dark\"] .cm-spell-error"));
    notOk("a squiggle no longer claims to be clickable", /^\s*cursor:\s*pointer/m.test(rule));
    ok("and the hover tooltip has somewhere to be drawn", css.includes(".cm-spell-tip"));
    ok("the tooltip exists to be installed", typeof spell.spellTooltip === "function");
  }
}
