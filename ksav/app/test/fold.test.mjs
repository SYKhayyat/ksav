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
  // The assertion the rewrite exists for, and the one no correctness check
  // above can make. It is written as a *ratio between two queries in the same
  // document*, not as a millisecond budget: absolute timings on a shared CI
  // runner are how a suite learns to cry wolf, but "the last heading costs
  // roughly what the first one costs" is a claim about the algorithm and holds
  // on any machine.
  //
  // Under the old implementation this ratio was ~100×. The threshold is 10×,
  // which is loose enough to absorb a noisy runner and tight enough that
  // reintroducing a per-line walk fails it outright.
  {
    const chapters = [];
    for (let i = 0; i < 400; i++) {
      chapters.push(`#כותרת1[פרק ${i}]`);
      for (let k = 0; k < 25; k++) chapters.push(`שורה ${k} עם #הדגשה[טקסט] ועוד מלים כאן.`);
    }
    const big = chapters.join("\n");
    const state = EditorState.create({ doc: big, extensions: [ksavFold] });
    const service = state.facet(foldService)[0];
    const query = (pos) => {
      const line = state.doc.lineAt(pos);
      return service(state, line.from, line.to);
    };
    const first = big.indexOf("#כותרת1[פרק 1]");
    const last = big.lastIndexOf("#כותרת1[פרק 399]");
    ok("the big document folds at both ends", !!query(first) && !!query(last));

    const time = (pos) => {
      // Warm first: the scan and the heading index are memoised per document,
      // and the point of measurement is the *query*, not the one-off scan.
      query(pos);
      const t0 = performance.now();
      for (let i = 0; i < 50; i++) query(pos);
      return performance.now() - t0;
    };
    const early = Math.max(time(first), 0.0001);
    const late = time(last);
    ok(
      `folding the last section costs about what the first does (${(late / early).toFixed(1)}×)`,
      late / early < 10,
      `first ${early.toFixed(2)}ms, last ${late.toFixed(2)}ms over 50 queries`,
    );
  }
}
