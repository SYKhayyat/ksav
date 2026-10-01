import { check, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { ksavFold } from "../.tmp-test/ksav-lang.mjs";
import { EditorState } from "@codemirror/state";
import { foldService } from "@codemirror/language";

// Folding, which had no test at all.
//
// Every collapse in this editor goes through one `foldService`: heading
// sections, `//{ … //}` regions, block comments, and any multi-line bracketed
// command. It is the feature a writer uses to make a 300-page sefer navigable,
// it is read on every gutter render, and nothing in this suite had ever called
// it — which is how it came to be O(lines × nodes) without anybody noticing.
//
// The section fold used to ask *every line from here to the end of the document*
// what heading level it was, and each of those answers restarted a walk over
// every node in the scan. Measured on 420 KB / 10,400 lines: 4.26 ms for a query
// on the last heading against 0.04 ms on the first — backwards, since the end of
// the document is where somebody writing a sefer is. It walks the headings now.
//
// So this file is two things: the behaviour, which was undefended, and the cost
// *shape*, which is what the rewrite was for and which a correctness test cannot
// see.

/** Ask the fold service what collapses on the line containing `pos`. */
function foldAt(doc, pos) {
  const state = EditorState.create({ doc, extensions: [ksavFold] });
  const line = state.doc.lineAt(pos);
  for (const service of state.facet(foldService)) {
    const range = service(state, line.from, line.to);
    if (range) return range;
  }
  return null;
}

const at = (doc, needle) => foldAt(doc, doc.indexOf(needle));

export async function run() {
  // ------------------------------------------------------------- sections

  const sefer = [
    "#כותרת1[פרק ראשון]",
    "פתיחה.",
    "#כותרת2[סימן א]",
    "דברי הסימן.",
    "#כותרת2[סימן ב]",
    "עוד דברים.",
    "#כותרת1[פרק שני]",
    "סוף.",
  ].join("\n");

  {
    const r = at(sefer, "פרק ראשון");
    ok("a heading folds", !!r);
    // A section ends where the next heading of the same level or shallower
    // begins — so the first chapter swallows both of its simanim and stops at
    // the second chapter, rather than at the next heading of any level.
    check("…everything down to the next heading of its level", sefer.slice(r.to).trim(),
      "#כותרת1[פרק שני]\nסוף.");
  }
  {
    const r = at(sefer, "סימן א");
    check("a subsection stops at its sibling", sefer.slice(r.to).trim(),
      "#כותרת2[סימן ב]\nעוד דברים.\n#כותרת1[פרק שני]\nסוף.");
  }
  {
    // The last section runs to the end of the document, and there is no
    // "next heading" to find. The old loop discovered this by walking to the
    // final line; this one by running off the end of the heading list.
    const r = at(sefer, "פרק שני");
    check("the last section runs to the end", sefer.slice(r.to), "");
  }
  ok("a body line folds nothing", at(sefer, "פתיחה") === null);

  // A heading with prose in front of it on the same line is not a section — the
  // rule the old code spelled as `slice(lineFrom, n.from).trim() !== ""`, and
  // the one thing about `lineHeads` that is easy to get wrong when moving from
  // "scan the nodes" to "index by line".
  {
    const mid = "דברים ואז #כותרת1[לא כותרת]\nעוד.";
    ok("a heading mid-line opens no section", at(mid, "כותרת1") === null);
  }

  // Deeper before shallower: a level-3 inside a level-1 must not stop the
  // level-1's section, and must stop its own.
  {
    const deep = "#כותרת1[א]\n#כותרת3[ב]\nגוף\n#כותרת2[ג]\nסוף";
    check("a deeper heading does not close a shallower section",
      deep.slice(at(deep, "[א]").to).trim(), "");
    check("…and closes at the next one that is not deeper",
      deep.slice(at(deep, "[ב]").to).trim(), "#כותרת2[ג]\nסוף");
  }

  // ------------------------------------------------------------- regions

  {
    const doc = "//{ הקדמה\nשורה\n//}\nאחרי";
    const r = at(doc, "//{");
    ok("a region folds", !!r);
    check("…to its closer", doc.slice(r.to).trim(), "אחרי");
  }
  {
    // Nested regions: the outer one closes on *its* `//}`, not the first one.
    const doc = "//{ חוץ\n//{ פנים\nא\n//}\nב\n//}\nאחרי";
    check("a nested region closes on its own marker",
      doc.slice(at(doc, "//{ חוץ").to).trim(), "אחרי");
  }
  ok("an unclosed region folds nothing", at("//{ פתוח\nשורה", "//{") === null);

  // ------------------------------------------------------------- commands

  {
    const doc = "#רשימה(\n  פריט[א],\n  פריט[ב],\n)\nאחרי";
    const r = at(doc, "#רשימה");
    ok("a multi-line command folds its argument list", !!r);
    check("…and stops at its closer", doc.slice(r.to).trim(), ")\nאחרי");
  }
  ok("a command that fits on one line folds nothing", at("#הדגשה[א]\nב", "#הדגשה") === null);

  // ------------------------------------------------------- and the cost
  //
  // The assertion the rewrite exists for, and the one no correctness check above
  // can make.
  //
  // It compares the *same* query — a fold on the last heading, which is the worst
  // case — across two documents, one four times the size of the other. That is
  // deliberate: the obvious version (first heading versus last, inside one
  // document) divides two sub-microsecond numbers by each other and is noise
  // wearing a measurement's clothes.
  //
  // The old implementation asked every line from the query to the end of the
  // document what heading level it was, and each answer restarted a walk over
  // every node, so quadrupling the document multiplied this by ~16. The rewrite
  // walks the headings, so it should be flat. The threshold is 5x: loose enough
  // for a shared CI runner, tight enough that a per-line walk cannot pass.
  {
    const build = (chapters) => {
      const out = [];
      for (let i = 0; i < chapters; i++) {
        out.push(`#כותרת1[פרק ${i}]`);
        for (let k = 0; k < 25; k++) out.push(`שורה ${k} עם #הדגשה[טקסט] ועוד מלים כאן.`);
      }
      return out.join("\n");
    };
    const lastFoldCost = (doc) => {
      const state = EditorState.create({ doc, extensions: [ksavFold] });
      const service = state.facet(foldService)[0];
      const line = state.doc.lineAt(doc.lastIndexOf("#כותרת1[פרק "));
      const query = () => service(state, line.from, line.to);
      ok("the last heading folds", !!query());
      for (let i = 0; i < 200; i++) query(); // warm: the first loop pays for V8
      const t0 = performance.now();
      for (let i = 0; i < 500; i++) query();
      return (performance.now() - t0) / 500;
    };
    const small = lastFoldCost(build(100));
    const big = lastFoldCost(build(400));
    const grew = big / Math.max(small, 1e-6);
    ok(
      `four times the document does not cost four times the fold query (${grew.toFixed(1)}x)`,
      grew < 5,
      `100 chapters ${small.toFixed(4)}ms, 400 chapters ${big.toFixed(4)}ms`,
    );
  }
}

// #87 — the length of what a fold is hiding.
//
// The chip used to say what a fold was ("הערה …") and never how big. The number
// is cheap to get right and has exactly one way to be wrong: an opener the lint
// calls unclosed folds to the end of the document, so the subtraction succeeds
// and prints the length of everything that follows. True number, useless number.
//
// So the judgement lives in `foldLength`, a pure function over the document and
// the fold range, and it is tested here as one — no editor, no browser.
//
// What is counted is the folded range, brackets and command included, because
// that is what disappears when the chip appears.

const { foldLength } = await import("../.tmp-test/ksav-lang.mjs");

/** The number as the chip prints it, or `null` when it prints nothing. */
const chip = (doc, from, to) => foldLength(doc, { from, to }).length;

{
  const doc = "#הערה[שלום עולם]";
  ok("a closed note measures the whole construct it hides", chip(doc, 0, doc.length) === 16);
}

{
  // The trap. `Frame.close` is `doc.length` here for the same reason it is for a
  // tag closed by the file's final `]`, so "does the range reach the end?" cannot
  // tell them apart — and this test is the one the first attempt at #87 could not
  // write.
  const doc = "#הערה[שלום עולם";
  ok("an unclosed note refuses to measure", chip(doc, 0, doc.length) === null);
}

{
  // The ambiguity, stated rather than left as a footnote: closed properly, with
  // the `]` the very last character in the file. A rule of "reaches the end of
  // the document means unclosed" gets this one wrong.
  const doc = "#הערה[שלום עולם]";
  ok("a note closed by the file's last character still measures", chip(doc, 0, doc.length) !== null);
}

{
  // Two openers in one document. The question is about the one being folded, and
  // a broken tag earlier in the file must not silence the chip on this one.
  const doc = "#הערה[ראשון\n\n#הערה[שני]";
  const first = doc.indexOf("[");
  const second = doc.indexOf("[", first + 1);
  ok("an unclosed tag does not poison a later closed one", chip(doc, second, doc.length) !== null);
  ok("and the unclosed one still refuses", chip(doc, first, doc.length) === null);
}

{
  // An empty body measures zero characters of body, but the chip still reports
  // the construct it swallowed — which is 7, not 0. `0` would be the answer that
  // makes the chip look like a lie about its own size.
  const doc = "#הערה[]";
  ok("an empty note still measures its own characters", chip(doc, 0, doc.length) === 7);
}

{
  // A fold with no `[` at all — a `//{ … //}` region. No opener, no unclosed
  // verdict, so it measures itself rather than refusing.
  const doc = "//{ אזור\nשורה שנייה\n//}";
  ok("a region with no brackets measures itself", chip(doc, 0, doc.length) === doc.length);
}

// The wiring fence.
//
// Everything above tests `foldLength`, a pure function. A chip that computed the
// right number and never printed it would pass all of it, and a chip that printed
// the label and dropped the number would look correct in a screenshot of a
// collapsed note — the "…" is still there, only smaller.
//
// No test in this suite builds a `DOM`, so this is a source fence: the string the
// chip is built from, checked against `src/`, exactly as `whitespace.test.mjs`
// fences the extension list. A mutation that deletes the `length == null ?` test or
// the interpolation is caught here and nowhere else.
{
  const src = readFileSync(
    new URL("../src/ksav-lang.ts", import.meta.url),
    "utf8",
  );
  ok(
    "the chip prints the length when there is one",
    /length == null \? "" : ` \$\{length\} \$\{t\("foldChars"\)\}`/u.test(src),
    "the pure-function tests cannot see the chip's own text",
  );
  ok(
    "the chip is built from foldLength, not from a fresh subtraction",
    /foldLength\(state\.doc\.toString\(\), range\)/u.test(src),
  );
}
