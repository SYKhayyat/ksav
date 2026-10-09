import { check, ok } from "./harness.mjs";
import { plan, commandOf } from "../.tmp-test/insert.mjs";
import { dirOf } from "../tools/paths.mjs";
import { commands } from "../tools/commands.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { translated } from "../.tmp-test/mode.mjs";
import { scan } from "../.tmp-test/spans.mjs";

const SRC = path.resolve(dirOf(import.meta.url), "..", "src");

/** A Hebrew letter, for the fence that must find one where none belongs. */
const HEBREW = /[\u05d0-\u05ea]/u;

/** Every node name in `text`, in the order the scanner found them. */
function names(text) {
  return scan(text).nodes.map((n) => n.name);
}

// What a click on the toolbar turns into, asked directly.
//
// This decision — refuse, or a note layout, or text and a caret — lived in
// `main.ts`, the one module no test can import. The insertion *grid* checked
// 1,026 strings against the compiler; nothing checked the function that chooses
// which string, whether it is legal where the caret is, or where the caret lands
// afterwards. That is the seam §7 of the 7 August report is about, and this file
// is the half of it that was missing.

const at = (doc, needle) => doc.indexOf(needle);

export async function run() {
  // ------------------------------------------------------------ plain text

  {
    const doc = "שלום עולם";
    const p = plan(doc, 5, 5, "", "#הדגשה[|]");
    check("a command inserts its snippet", p.kind, "edit");
    check("…with the pipe removed", p.text, "#הדגשה[]");
    check("…and the caret where the pipe was", p.cursor, "#הדגשה[".length);
  }
  {
    // A selection is wrapped, not replaced — what every word processor does, and
    // what the toolbar's own buttons rely on.
    const doc = "שלום עולם";
    const p = plan(doc, 0, 4, "שלום", "#הדגשה[|]");
    check("a selection is wrapped", p.text, "#הדגשה[שלום]");
    check("…and the caret lands after it", p.cursor, "#הדגשה[שלום".length);
  }
  {
    const p = plan("", 0, 0, "", "#קו_מפריד");
    check("a snippet with no pipe puts the caret at its end", p.cursor, "#קו_מפריד".length);
  }

  // ------------------------------------------------------------- refusals

  {
    // `#מעבר_עמוד` ends a page. Typst refuses it inside a container and says so
    // in English from the middle of a blanked preview, so the editor refuses it
    // first, in Hebrew, with the page intact — which is the whole difference
    // between a word processor and a text editor with a build step.
    const doc = "#כותרת1[פרק]";
    const p = plan(doc, at(doc, "פרק"), at(doc, "פרק"), "", "#מעבר_עמוד");
    check("a page break inside a container is refused", p.kind, "refuse");
    check("…naming what is wrong", p.reason, "illegalPageLevel");
  }
  {
    // And at the top level it is not, or the refusal would be a blanket ban
    // rather than a judgement about position. This is the pair that makes the
    // rule falsifiable: `ONLY_AT_TOP` in reverse.
    const p = plan("שלום עולם", 5, 5, "", "#מעבר_עמוד");
    check("…and at the top level it is offered", p.kind, "edit");
  }
  {
    // The third case, and the one this pair used to get wrong in the example it
    // chose: **not everything with brackets is a container.** `#הדגשה` is a
    // `strong()`, `#שער` is `align(center, text(…))`, and Typst puts a page
    // break through both of them without complaint. The rule was
    // `frames.length === 0` and the test that guarded it stood inside `#הדגשה`
    // and called it a container — so the fence and the bug agreed, and a writer
    // in bold text was refused an operation that works.
    //
    // Which commands are containers is measured against the compiler
    // (`engine/tests/containers.rs`); these two are the assertion that the
    // measurement is *reaching* the editor.
    for (const doc of ["#הדגשה[שלום]", "#שער[שלום]"]) {
      const p = plan(doc, at(doc, "שלום"), at(doc, "שלום"), "", "#מעבר_עמוד");
      check(`…and inside ${doc.slice(0, 6)}…], which is not a container`, p.kind, "edit");
    }
  }
  {
    // A table of contents inside a heading renders the heading, which renders
    // the contents, until Typst's nesting guard fires and the page goes blank.
    const doc = "#כותרת1[פרק]";
    const p = plan(doc, at(doc, "פרק"), at(doc, "פרק"), "", "#תוכן()");
    check("a table of contents inside a heading is refused", p.kind, "refuse");
    check("…naming what is wrong", p.reason, "illegalInHeading");
  }

  // ---------------------------------------------------------------- notes

  {
    // A note is a destination, not a string: the answer is *where it prints*, so
    // that the scaffolding — the placement line, the call that prints the block
    // — goes in with it. Returning `edit` here is the bug that produced endnotes
    // collected and never printed.
    const p = plan("שלום", 4, 4, "", "#הערה[|]");
    check("a footnote is answered as a note", p.kind, "note");
    check("…and names the destination that carries its scaffolding", p.pick?.dest, "foot");
  }
  {
    const p = plan("שלום", 4, 4, "", "#הערתסיום[|]");
    check("an endnote is a note too", p.kind, "note");
    check("…and goes somewhere else", p.pick?.dest, "end");
  }
  {
    // The whole of the model at the point of writing a note: the destination is
    // an argument, so a note that names one is routed by what it says rather
    // than by which of eighteen commands it happens to be.
    const p = plan("שלום", 4, 4, "", String.raw`#הערה(אזור: "שער_הציון")[|]`);
    check("a note sent to a region is routed by its argument", p.pick?.dest, "region");
    check("…and the region is the one it named", p.pick?.region, "שער_הציון");
  }

  // ------------------------------------------------------------- numbering

  {
    // A siman's number is a value, so inserting a second one after
    // `#סימן[א׳]` must continue the series rather than write `א׳` again.
    const doc = "#סימן[א׳][פתיחה]\n\nגוף.\n\n";
    const p = plan(doc, doc.length, doc.length, "", "#סימן[|][]");
    ok("a second siman continues the series", p.kind === "edit" && !p.text.includes("|"), JSON.stringify(p));
    ok("…and does not repeat the first one's number", !p.text.startsWith("#סימן[א׳]"), p.text);
  }

  // `regionAround` was here and is now `foldAround` — see `hiding.test.mjs`,
  // which took its three cases with it. What it builds is a fold, and "region"
  // is the fixed area on the page that `#אזור` makes.

  // ---------------------------------------------------------- command names

  check("a command name is read off the snippet", commandOf("#הדגשה[|]"), "הדגשה");
  check("…including an English one", commandOf("#bold[|]"), "bold");
  check("…and underscores are part of it", commandOf("#קו_תחתון[|]"), "קו_תחתון");
  check("plain text names no command", commandOf("שלום"), null);

  // ---------------------------------------------- the language it is written in
  //
  // #94. The registry's `insert` is Hebrew — canonically, deliberately,
  // `NOTE_COMMAND` is `הערה` and `engine.gen.ts` mirrors the prelude's own table
  // — and nine surfaces reached for it: the ribbon, the Insert menu, the palette,
  // every key binding, and three note buttons in `main.ts` that typed their
  // snippets out by hand beside a note machinery that was already taking a
  // `lang` (`noteLine`, `pickLine`, `setStyleArgs`). Nothing broke. It compiles
  // either way and it lays out either way, because the prelude reads both
  // spellings; the writer's English document was simply Hebrew underneath them
  // from the first click. `styles.ts:189` had written that sentence down about
  // the Styles panel, three months earlier, and the ribbon was still doing it.
  //
  // The tooltip beside a button already showed the document's spelling
  // (`writing === "he" ? c.he : c.en`), so the ribbon was naming `#bold` over a
  // button that wrote `#הדגשה` — two answers to one question in the same closure.
  // The decision is `mode.docLang`'s and it is made once, here, before anything
  // else reads the snippet, because every one of those nine surfaces funnels
  // through this function.

  {
    // `docIn` is the same unambiguous document `notelangs.test.mjs` uses: one
    // command already written, and plain prose in the same script.
    const en = "#bold[a] some plain English prose here.\n";
    const he = "#הדגשה[א] טקסט בעברית כאן.\n";
    check(
      "an English document takes an English command",
      plan(en, en.length, en.length, "", "#הדגשה[|]").text,
      "#bold[]",
    );
    check(
      "a Hebrew one keeps its own spelling",
      plan(he, he.length, he.length, "", "#הדגשה[|]").text,
      "#הדגשה[]",
    );
    // The parameter names travel with the command, which is the half that looks
    // like a detail and is not: `#img("x", width: 60%)` with a Hebrew `רוחב`
    // still compiles, because `_en` passes an unrecognised name through to the
    // Hebrew function underneath.
    check(
      "argument names are translated with it",
      plan(en, en.length, en.length, "", '#תמונה("x", רוחב: 60%)').text,
      '#img("x", width: 60%)',
    );
  }

  {
    // The caret decides, not the document. `docLang` asks the innermost call
    // first, so a command typed inside a Hebrew note in an English document is
    // Hebrew — the same answer `lists.ts` and `headings.ts` already give from
    // the node they are rewriting, and the reason this is not "the document's
    // language" but "the language here".
    //
    // Three English commands before the Hebrew note, so the majority is
    // unmistakably English and only the innermost-call rule can answer Hebrew.
    // A fixture with one of each cannot tell the two apart, and Hebrew wins a
    // tie by default — so the weaker fixture would pass with the rule removed.
    // The note is **closed**, because an unclosed one's node ends at its own
    // name (`to` is where the `]` would be), so no caret is ever inside it.
    const doc = "#bold[a] #italic[b] #h1[c] plain English prose.\n\n#הערה[הערה בעברית]";
    const inside = doc.indexOf("עברית");
    check(
      "inside a Hebrew note the command is Hebrew",
      plan(doc, inside, inside, "", "#הדגשה[|]").text,
      "#הדגשה[]",
    );
  }

  {
    // The class, rather than the member that named it: every insert the engine
    // publishes, asked in both languages. A command or a parameter the tables
    // do not know survives as Hebrew in an English document, and this is the
    // only fence that can see it — the three buttons were the *symptom*, and
    // the ribbon beside them had the same disease on every one of its buttons.
    const wrong = [];
    for (const c of commands()) {
      if (c.deprecated) continue;
      // The registry's own spelling survives the Hebrew direction untouched —
      // which is the invariant the whole fix rests on: Hebrew is canonical, so
      // translating *to* Hebrew must be the identity.
      const he = translated(c.insert, "he");
      const en = translated(c.insert, "en");
      if (he !== c.insert) wrong.push(`he is not the identity: ${c.insert} → ${he}`);
      // …and the English direction starts with the name the surface shows
      // beside the button. Four of the entries are bare names with no `#`
      // (`פריט[|]`, `תא[|]`, `כותרת_תא[|]` — the helpers written *inside* an
      // argument list), so the lead keeps whatever prefix it had.
      if (c.en !== undefined) {
        const lead = (c.insert.startsWith("#") ? "#" : "") + c.en;
        if (!en.startsWith(lead)) wrong.push(`en: ${c.insert} → ${en}`);
      }
      // Nothing that names a command or a parameter is left Hebrew. Sample
      // ordinals are deliberately exempt (`mode.translated` says so in as many
      // words): `#סעיף[א]` keeps its `א`, because the alphabet a construct is
      // numbered in is a typographic choice and not a language.
      for (const n of names(en)) {
        if (HEBREW.test(n)) wrong.push(`hebrew name in the english form: ${en} (${n})`);
      }
    }
    check("every registry insert is spelled in the document's language", wrong, []);
  }

  // --------------------------------------------------- a refusal that survives
  //
  // `plan` can refuse, and `insertSnippet` turns a refusal into the one thing
  // the writer needs: a sentence in the status bar saying why. Three callers
  // then ran `scheduleCompile()` unconditionally, and a compile that had nothing
  // to compile writes `✓ 3 עמ׳ · 18ms` over that sentence a few milliseconds
  // later.
  //
  // What that was, from a chair: put the caret on a `#סעיף` line, open Insert ▸
  // *a section with its own page*, fill in the form, press **Add**. The dialog
  // closes, the document does not change, and nothing anywhere says why. The
  // refusal had been computed, displayed and erased.
  //
  // Read off the source because `main.ts` is the one module no test can import —
  // the same reason this file exists. A source check is weaker than a behavioural
  // one and it is the strongest thing available at this seam.

  {
    const main = await readFile(path.join(SRC, "main.ts"), "utf8");
    const unguarded = [...main.matchAll(/^([ \t]*)insertSnippet\([^\n]*\n[ \t]*scheduleCompile\(\)/gmu)].map(
      (m) => main.slice(m.index, m.index + 60).split("\n")[0].trim(),
    );
    check("no caller compiles after an insertion it did not check", unguarded, []);
    ok(
      "…and the guarded form is what they use instead",
      /if \(insertSnippet\([^\n]*\)\) scheduleCompile\(\);/u.test(main),
    );
    ok(
      "insertSnippet says whether anything went in",
      /function insertSnippet\(rawSnippet: string\): boolean/u.test(main),
    );
  }
}
