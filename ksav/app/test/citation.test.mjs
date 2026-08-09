// A citation carries its place, or the whole pairing is a paste with extra steps.
//
// `spec.md §10.2` — *"because the document keeps `girsa:shulchan-arukh/…/1:1`
// and not merely `שו"ע או"ח סימן א' סעיף א'`, a whole sefer can be switched
// from abbreviated to full-form citations, or every quote regenerated against a
// corrected edition, without touching a word of the prose. No paste-based
// workflow can do that, which is the whole argument for the pairing."*
//
// The Mekoros panel wrote `#מראה_מקום[${place.display}]`. The ref was on the
// object and was read by nothing, one line under a comment saying it travelled.
// So for every citation the editor inserted by itself, the pairing *was* a
// paste with extra steps: nothing in the source index, no link in the PDF, and
// nothing anywhere reporting it — the page looked exactly right.
//
// It was invisible from every direction that had been tried. `from_girsa.rs`
// asserts the *arrival* path keeps the ref, and it does; the panel is the other
// door. `coverage.test.mjs` asks whether a command is offered, and
// `#מראה_מקום` is. Nothing asked what the markup said.

import { check, ok, notOk } from "./harness.mjs";
import { citationMarkup } from "../.tmp-test/citation.mjs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
const SRC = path.resolve(HERE, "..", "src");

const PLACE = {
  display: "שו״ע או״ח סימן א׳ סעיף א׳",
  ref: "girsa:shulchan-arukh/orach-chayim/1:1",
};

export async function run() {
  // -------------------------------------------------------- the ref travels

  {
    const markup = citationMarkup(PLACE);
    ok("the ref is in the document", markup.includes(PLACE.ref));
    ok("under the name the prelude reads", markup.includes("מקור:"));
    ok("and the printed citation is still printed", markup.includes(PLACE.display));
    check(
      "the whole call, exactly",
      markup,
      `#מראה_מקום(מקור: "girsa:shulchan-arukh/orach-chayim/1:1")[שו״ע או״ח סימן א׳ סעיף א׳]`,
    );
  }

  {
    // Girsa can answer with a place it cannot address. `מקור: ""` would file an
    // entry in the source index that nobody can follow, which is worse than no
    // entry — so the absence is written as an absence.
    const markup = citationMarkup({ display: "מקור בעל פה", ref: "" });
    notOk("no ref, no מקור argument", markup.includes("מקור:"));
    check("just the footnote", markup, "#מראה_מקום[מקור בעל פה]");
    notOk("and undefined is not a ref either", citationMarkup({ display: "א" }).includes("מקור:"));
  }

  // ------------------------------------------------- and it survives the text

  {
    // `display` and `ref` are Girsa's strings, not this application's.
    const nasty = citationMarkup({
      display: "רש\"י ד\"ה [כך] #שם",
      ref: 'girsa:x"y\\z',
    });
    ok("a bracket in the citation cannot close the call", nasty.includes("\\[כך\\]"));
    ok("a hash cannot start an expression", nasty.includes("\\#שם"));
    ok("a quote in the ref cannot close the string", nasty.includes('\\"y'));
    ok("nor can a trailing backslash", nasty.includes("\\\\z"));
    // The shape has to survive it: one call, one argument list, one body.
    check("still one call", (nasty.match(/#מראה_מקום/gu) ?? []).length, 1);
  }

  // -------------------------------------------- which characters were quoted
  //
  // `girsa-source` 0.5.1 added `range` — which characters of the place a quote
  // actually was — and the Rust door (`ksav_engine::source`) has written
  // `תווים:` since. This door could not express the argument at all, so the
  // field was **structurally unreachable** from the editor's own insertion
  // path: one feature, two doors, one of them missing an argument. Which is the
  // same shape as the bug at the top of this file, in the same function, a
  // release later.
  {
    const half = citationMarkup({ ...PLACE, range: { from: 4, to: 19 } });
    ok("a partial quote says which characters", half.includes('תווים: "4-19"'), half);
    const toEnd = citationMarkup({ ...PLACE, range: { from: 4, to: null } });
    ok("…and a highlight running off the end is open", toEnd.includes('תווים: "4-"'), toEnd);
    // It has to be the same spelling `girsa_ksav::characters` writes, because
    // both doors write into one document and `#מראה_מקומות()` reads both.
    ok("the ref is still there beside it", half.includes(PLACE.ref));
  }
  {
    // A document that quotes a whole se'if says so by **saying nothing** — which
    // is what every document written before the field existed already says, and
    // what makes them all still correct.
    for (const range of [undefined, { from: 0, to: null }]) {
      const markup = citationMarkup({ ...PLACE, range });
      notOk(`a whole place writes no תווים (${JSON.stringify(range)})`, markup.includes("תווים"));
    }
  }

  // ------------------------------------------------------- one producer only
  //
  // The prohibition, swept over the source, in the same shape as `spans.ts`'s.
  // A second site writing `#מראה_מקום[…]` by hand is how this got here: the
  // markup was a template literal in a click handler inside a 5,600-line file,
  // where nothing that reads modules could ever have seen it.
  {
    const files = (await readdir(SRC)).filter((f) => f.endsWith(".ts") && f !== "citation.ts");
    const offenders = [];
    for (const f of files) {
      const body = await readFile(path.join(SRC, f), "utf8");
      // Ignore comments and the generated name tables: what is prohibited is
      // *building the call*, which is a `#מראה_מקום` immediately followed by an
      // argument list or a body in a template literal or a string.
      for (const line of body.split("\n")) {
        if (/^\s*(\/\/|\*|\/\*)/u.test(line)) continue;
        if (/[`'"]#מראה_מקום\s*[([]/u.test(line)) offenders.push(`${f}: ${line.trim().slice(0, 70)}`);
      }
    }
    check("only citation.ts writes a mekor citation", offenders, []);
  }
}
