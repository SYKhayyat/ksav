// Every command the UI offers, inserted at every kind of caret position, as the
// app's own insertion path would write it — for the engine to compile.
//
// This is the fence for the worst bug the product has had. A writer put the
// caret between two list items and pressed the bullet button, and the document
// blanked. It was not one bug: sweeping the whole grid — every registry snippet
// against every kind of position a caret can be in — **384 of 1,026 documents
// would not compile**, including three positions where *every command without
// exception* was broken. `engine/tests/registry.rs` missed all of it, because it
// compiles each snippet standalone and in three fixed nestings; it never asks
// what happens when one is spliced into the middle of an argument list, which is
// where the writer actually was.
//
// So the grid is the test. It runs in a few seconds and it would have caught
// every one of those on the day they were written.
//
// Both directions are asserted, and the second matters as much as the first:
//   - a case the product says is legal must compile
//   - a case the product greys out must genuinely fail
// Without the second, greying everything would turn the suite green.
//
//   node tools/emit-insertion-fixtures.mjs          # rewrite the fixture
//   node tools/emit-insertion-fixtures.mjs --check  # fail if it is stale
//
// `npm test` runs the --check form; `cargo test --test insertion` compiles it.

import { join } from "node:path";
import { runAsScript } from "./generated.mjs";
import { load } from "./load.mjs";
import { ENGINE } from "./paths.mjs";
import { commands } from "./commands.mjs";

const OUT = join(ENGINE, "tests", "fixtures", "insertions.json");

/**
 * Every kind of place a caret can be, with `@` marking it — in both languages.
 *
 * Nine positions, and they are not arbitrary: three of them
 * (`list-between-items`, `list-after-open`, `table-between-cells`) are the
 * code-mode positions where the editor used to be broken for all 114 commands,
 * and the rest are the ordinary places a writer stands — mid-word in prose,
 * inside a heading, inside a note, inside a cell, and two levels down.
 *
 * **Why there are two of each.** Every one of these used to be a Hebrew
 * document, and `:95` asked `legalAt` in Hebrew, so the best fence in this
 * repository asked all 1,035 of its questions in one language — forty files from
 * the comment (`note-commands.ts:20-23`) explaining that a hand-maintained array
 * only one language ever walked is exactly how the worst bug in this product got
 * in.
 *
 * The English half is a real document rather than a name swap, and that
 * distinction is the whole of `insertion.rs`'s objection to the obvious version
 * of this. Swapping the names in the *fixture* would have asserted a path no
 * writer could reach, because every surface wrote the registry's Hebrew snippet
 * verbatim. So the product changed first — `mode.ts`'s `insertionAt` now spells
 * a snippet in the document's own language — and these nine English documents
 * are the ordinary places an English writer stands, reached the ordinary way.
 */
export const CONTEXTS = {
  prose: {
    he: "שורה של פרוזה ובה מלים@אחרות להמשך.",
    en: "A line of prose with some wor@ds to continue.",
  },
  "heading-body": {
    he: "#כותרת1[פרק @ראשון]\n\nגוף.",
    en: "#h1[Chapter @One]\n\nBody.",
  },
  "note-body": {
    he: "טקסט#הערה[הערה @פנימית] המשך.",
    en: "Text#fnote[a note @inside] continues.",
  },
  "list-in-item": {
    he: "#רשימה(\n  פריט[ראשון @כאן],\n  פריט[שני],\n)",
    en: "#bullets(\n  item[first @here],\n  item[second],\n)",
  },
  "list-between-items": {
    he: "#רשימה(\n  פריט[ראשון],@\n  פריט[שני],\n)",
    en: "#bullets(\n  item[first],@\n  item[second],\n)",
  },
  "list-after-open": {
    he: "#רשימה(@\n  פריט[ראשון],\n  פריט[שני],\n)",
    en: "#bullets(@\n  item[first],\n  item[second],\n)",
  },
  "table-in-cell": {
    he: "#טבלה(עמודות: (1fr, 1fr),\n  תא[אחד @כאן], תא[שתים],\n)",
    en: "#mktable(columns: (1fr, 1fr),\n  cell[one @here], cell[two],\n)",
  },
  "table-between-cells": {
    he: "#טבלה(עמודות: (1fr, 1fr),\n  תא[אחד],@ תא[שתים],\n)",
    en: "#mktable(columns: (1fr, 1fr),\n  cell[one],@ cell[two],\n)",
  },
  "nested-deep": {
    he: "#רשימה(\n  פריט[ראשון #הערה[בהערה @כאן] סוף],\n)",
    en: "#bullets(\n  item[first #fnote[in a note @here] end],\n)",
  },
  // The three positions below exist because of what the first nine could not
  // see. `legalAt` used to carry its own list of heading commands — seven names,
  // no English half, no level past three, and `#שער` wrongly on it — and the
  // grid stayed green through all of that, because `heading-body` is `#כותרת1`
  // and every one of the seven mistakes is somewhere else. A position is only a
  // fence for the rule that decides *it*.
  //
  // `#כותרת4` is the level the named commands stop advertising and the prelude
  // does not; `#סימן` is a heading whose level the prelude fixes, so it is the
  // one that would go missing from any list built by reading the toolbar; and
  // `#שער` is the one that is **not** a heading — big centred words with no
  // `heading()` in them — where `#תוכן` is legal and was being refused.
  "deep-heading-body": {
    he: "#כותרת4[פרק @רביעי]\n\nגוף.",
    en: "#h4[Section @Four]\n\nBody.",
  },
  "siman-body": {
    he: "#סימן[א׳][דיני @תפילה]",
    en: "#siman[1][The laws of @prayer]",
  },
  "title-body": {
    he: "#שער[כותרת @ראשית]\n\nגוף.",
    en: "#title[The @Title]\n\nBody.",
  },
  // The fourth of the same kind, and the one that removes a refusal rather than
  // adding one. `#כותרת_בהערה` was on the old heading list; the prelude
  // (`ksav.typ:1252`) defines it as `text(…)` with no `heading()` anywhere, so
  // `#תוכן` inside it has nothing to recurse into and was being refused for
  // nothing. A refusal withdrawn has to be paid for by a compiled document, the
  // same way one added does.
  "note-heading-body": {
    he: "#הערה[#כותרת_בהערה[ראשי@ת] גוף ההערה]",
    en: "#fnote[#note_heading[Head@ing] the note body]",
  },
};

/** The two languages every position is asked in. */
export const LANGS = /** @type {const} */ (["he", "en"]);

/**
 * What a writer would plausibly type into each command's caret slot.
 *
 * Left empty for most: an empty body is the state the document is in one
 * keystroke after the click, which is exactly the state that used to blank the
 * page. A few slots are not prose and a Hebrew word in them would be a real
 * mistake about a real argument — those get something the command can use.
 */
const SAMPLE = {
  נוסחה: "x^2 + 1",
  נוסחה_בשורה: "x^2 + 1",
  כלול: "",
};

/**
 * The registry, read from the engine source rather than a running server.
 *
 * From `tools/commands.mjs`. This used to be a fourth implementation of the
 * same read — the two test files' regex minus one group — and the whole point
 * of this generator is that a registry command and the insertion path must not
 * be able to disagree. Two readers of the registry is that disagreement one
 * level up.
 *
 * Imported *and* re-exported: `export … from` creates no local binding, so
 * `buildFixture` below would not have seen it.
 */
export { commands };

export async function buildFixture() {
  const { insertionAt, legalAt } = await load("mode");
  const all = commands();
  const cases = [];
  for (const [ctx, tpls] of Object.entries(CONTEXTS)) {
    for (const lang of LANGS) {
      const tpl = tpls[lang];
      const at = tpl.indexOf("@");
      const doc = tpl.replace("@", "");
      for (const c of all) {
        const snippet = insertionAt(doc, at, c.insert);
        const body = SAMPLE[c.he] ?? "";
        const clean = snippet.replace("|", body);
        // Asked by the command, not by the spelling: the chrome greys a
        // *control*, and a rule that answered differently for `#תוכן` and
        // `#toc` would be a control that greys in one language and not the
        // other. That it does not is what the English half of the grid then
        // has to make good on against the compiler.
        const legality = legalAt(doc, at, c.he);
        const source = doc.slice(0, at) + clean + doc.slice(at);
        cases.push({
          ctx,
          /** Which language's document this position is in. */
          lang,
          cmd: c.he,
          // The English pair, carried so `insertion.rs` can check both spellings
          // resolve. `registry.rs` used to hold that check and a skip list beside
          // it; the skip list is gone and the check moved here, where the grid it
          // belongs to already is.
          en: c.en,
          legal: legality.ok,
          reason: legality.reason ?? null,
          source,
        });
      }
    }
  }
  // Half a translation compiles, which is exactly why this has to be checked
  // here rather than left to the engine. `_en` forwards an unrecognised named
  // argument untouched, so `#page_section(טורים: 2)` lays out correctly and is
  // not English — and the grid, whose claim is *"this is what the product
  // writes"*, would have gone green over twelve commands whose parameters had
  // never been paired at all.
  //
  // A Hebrew *value* is fine and stays: `numbering: "א"` is a numbering scheme,
  // `layout: "צד"` a layout the prelude compares by name. Data both languages
  // share, not vocabulary either of them owns. So the check is on the key.
  const halfTranslated = cases
    .filter((c) => c.lang === "en" && /[(,]\s*[֐-׿][֐-׿_0-9]*\s*:/u.test(c.source))
    .map((c) => `${c.cmd} → ${c.source.split("\n")[0]}`);
  if (halfTranslated.length) {
    const seen = [...new Set(halfTranslated)];
    console.error(
      `${seen.length} command(s) reach an English document with Hebrew parameter\n` +
        "names. Pair them in the prelude's `_en_params`, or at the command's own\n" +
        "alias with `extra:` when two Hebrew words share one English one:\n  " +
        seen.join("\n  "),
    );
    process.exit(1);
  }

  return JSON.stringify(
    { note: "generated by app/tools/emit-insertion-fixtures.mjs", cases },
    null,
    1,
  );
}

/** Every generated output, as `[path, wanted, label]`. */
export const OUTPUTS = [[OUT, await buildFixture(), "insertions.json"]];

runAsScript(import.meta.url, OUTPUTS, "insertion fixtures", "node tools/emit-insertion-fixtures.mjs");
