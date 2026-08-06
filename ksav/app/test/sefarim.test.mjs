// Citation autocomplete: where a sefer name goes, and which sefer is meant.
//
// Two questions, both pure functions of a string, which is why they can be held
// here rather than by opening an editor and typing into it:
//
//   1. Is the cursor inside the *sefer-name* argument of a citation? Not inside
//      the daf argument, not inside some other command's string, not inside a
//      string that was already closed.
//   2. Given three letters, which sefarim could they be, best first?
//
// The catalogue itself is the engine's (`engine/src/sefarim.rs`) and reaches the
// app over `/sefarim`, so nothing here tests its *contents* — that would be a
// second copy of the list, which is exactly the drift this arrangement exists to
// prevent. What is tested is the matching, against a small stand-in.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { check, ok, notOk } from "./harness.mjs";
import { seferArgAt, suggest, fold, _reset } from "../.tmp-test/sefarim.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const SAMPLE = [
  { canonical: "בבא קמא", kind: "mishnah", order: 2301, aliases: ["ב\"ק"] },
  { canonical: "בבא מציעא", kind: "mishnah", order: 2302, aliases: ["ב\"מ"] },
  { canonical: "בבא בתרא", kind: "mishnah", order: 2303, aliases: ["ב\"ב"] },
  { canonical: "ברכות", kind: "mishnah", order: 2001, aliases: ["ברכ'"] },
  { canonical: "בראשית", kind: "tanach", order: 1001, aliases: ["בר'"] },
  { canonical: "מועד קטן", kind: "mishnah", order: 2111, aliases: ["מו\"ק"] },
];

export async function run() {
  _reset(SAMPLE);

  // ------------------------------------------------------------ where it fires
  {
    const src = '#ציון_מקור("בב';
    const arg = seferArgAt(src, src.length);
    ok("inside the first argument of a citation", arg !== null);
    check("…and it knows what has been typed", arg.query, "בב");
    check("…and where the name starts", arg.from, src.indexOf('"') + 1);
  }

  // The English alias is no less a citation.
  ok("the English alias fires too", seferArgAt('#sourceref("ב', 13) !== null);
  // And the older Gemara command, which takes a masechta in the same position.
  ok("so does #גמרא", seferArgAt('#גמרא("שב', 9) !== null);

  // ------------------------------------------------------- where it must not
  //
  // The second argument is a daf. A list of masechtos there would be actively in
  // the way — it would cover the page while the writer types ג. and offer
  // nothing they could possibly want.
  {
    const src = '#ציון_מקור("בבא בתרא", מקום: "ג';
    notOk("the daf argument is not a sefer", seferArgAt(src, src.length) !== null);
  }
  notOk(
    "a closed string is not being typed in",
    seferArgAt('#ציון_מקור("בבא בתרא") ועוד', 26) !== null,
  );
  notOk("some other command's string is not a citation", seferArgAt('#תמונה("logo', 12) !== null);
  notOk("plain prose is not a citation", seferArgAt("סתם טקסט עם גרשיים", 12) !== null);
  // A string argument does not span lines, so a quote left open on an earlier
  // line must not make every subsequent word look like a sefer name.
  notOk("an open quote on a previous line does not leak", seferArgAt('#ציון_מקור("\nשלום', 17) !== null);

  {
    // An escaped quote is part of the name — ב\"ב — not the end of it. Read as a
    // terminator, the argument would appear closed and the completion would
    // vanish at exactly the moment a writer types the abbreviation.
    const src = '#ציון_מקור("ב\\"ב';
    const arg = seferArgAt(src, src.length);
    ok("an escaped quote does not end the name", arg !== null);
    check("…and the escape is part of the query", arg.query, 'ב\\"ב');
  }

  // ------------------------------------------------------------- what it finds
  check("an exact abbreviation wins", suggest("ב\"ב")[0].canonical, "בבא בתרא");
  check("the real gershayim finds the same thing", suggest("ב״ב")[0].canonical, "בבא בתרא");
  check("a doubled geresh too", suggest("ב׳׳ב")[0].canonical, "בבא בתרא");

  {
    // A prefix of the canonical name beats a mere containment, and ties break on
    // the traditional order — so the three Bavos come out in Shas order rather
    // than in whatever order the array happened to hold.
    const hits = suggest("בבא").map((s) => s.canonical);
    check("prefix matches, in Shas order", hits, ["בבא קמא", "בבא מציעא", "בבא בתרא"]);
  }

  {
    // Everything beginning with ב, ranked: the canonical prefixes first (in
    // traditional order, so בראשית precedes the masechtos), then the aliases.
    const hits = suggest("ב").map((s) => s.canonical);
    check("the first hit for ב is the earliest sefer", hits[0], "בראשית");
    // Five of the six — מועד קטן has no ב in its name or its abbreviation, and
    // an autocomplete that offered it would be offering noise.
    check("and only the ones that could be meant", hits.length, 5);
    notOk("מועד קטן is not among them", hits.includes("מועד קטן"));
  }

  check("an empty query offers the catalogue", suggest("").length, SAMPLE.length);
  check("a name nobody has offers nothing", suggest("זוהר").length, 0);
  check("the limit is honoured", suggest("", 2).length, 2);

  // ---------------------------------------------------------------- the fold
  //
  // The third implementation of one rule. Rust has it for the catalogue lookup,
  // `ksav.typ` has `_ix_fold` for the source index, and this one is here so a
  // writer typing three letters is offered the sefer they mean. None of the
  // three can call either of the others, so the fence is a corpus all three are
  // executed against — `engine/tests/fixtures/fold-cases.json`, run on this side
  // here and on the other two by `engine/tests/one_want.rs`.
  //
  // It is not decoration. Running the three against one corpus is what found
  // that the Typst copy iterated grapheme *clusters*, so a pointed letter was
  // deleted along with its nikud and `שַׁבָּת` folded to the empty string — which
  // does not merely fail to find the masechta, it makes every fully-pointed name
  // collide with every other. Two implementations read carefully by hand had
  // agreed with each other for as long as they had existed.
  {
    const { cases } = JSON.parse(
      await readFile(
        path.join(HERE, "..", "..", "engine", "tests", "fixtures", "fold-cases.json"),
        "utf8",
      ),
    );
    ok("the fold corpus was read", cases.length >= 25);
    const wrong = cases
      .filter((c) => fold(c.in) !== c.out)
      .map((c) => `${JSON.stringify(c.in)} → ${JSON.stringify(fold(c.in))}, want ${JSON.stringify(c.out)}`);
    check("this fold agrees with the corpus, case for case", wrong, []);

    // And the property the rule exists for, from this side: the classes.
    const collisions = [];
    for (const a of cases) {
      for (const b of cases) {
        if ((fold(a.in) === fold(b.in)) !== (a.class === b.class)) collisions.push([a.in, b.in]);
      }
    }
    check("spellings of one name fold together, and others apart", collisions, []);
  }

  // The cases above, spelled out, because a corpus in another directory is a
  // poor advertisement for what the rule actually is.
  check("every gershayim spelling folds to one", fold("ב״ב"), 'ב"ב');
  check("…including a doubled geresh", fold("ב׳׳ב"), 'ב"ב');
  check("points are not part of the name", fold("בְּרָכוֹת"), "ברכות");
  check("a maqaf separates words", fold("ראש־השנה"), "ראש השנה");
  check("runs of space collapse", fold("  ראש   השנה "), "ראש השנה");
  // …but a space between two words is not noise, and neither is one *beside* the
  // mark: `ב ״ ב` stays three tokens and finds nothing. That is deliberate, and
  // `sefarim.rs`'s comment used to claim the opposite — a geresh ending a word is
  // legitimately followed by a space (`תוס׳ ד״ה` is two words), so closing the gap
  // would fuse them.
  check("a real space survives", fold("שמואל א"), "שמואל א");
  check("and a space beside the mark is not closed", fold("ב ״ ב"), 'ב " ב');
}
