import { check, ok } from "./harness.mjs";
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
