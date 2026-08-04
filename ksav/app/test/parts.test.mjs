// Which other documents a sefer needs, to be compiled.
//
// The engine does the splicing; this side works out *which* chapters to put on
// the request. Two things can go wrong and both are silent: sending too little,
// so the engine reports a chapter as missing that is sitting right there in the
// library; and following a loop, which hangs the compile before the request is
// even built.
//
// The directive rule is duplicated — once here, once in `engine/src/include.rs`
// — and that is the risk worth naming. If the two disagree about what counts as
// a `#כלול` line, this side never sends a chapter the engine then asks for. The
// cases below are chosen to pin the rule, not merely to exercise it.

import { check, notOk } from "./harness.mjs";
import { referenced, collect } from "../.tmp-test/parts.mjs";

/** A library, as a lookup by title. */
const from = (pairs) => (name) => (name in pairs ? pairs[name] : null);

export function run() {
  // -------------------------------------------------------- what is a directive
  check("a whole line is a directive", referenced('#כלול("פרק ג")'), ["פרק ג"]);
  check("…with whitespace around it", referenced('   #כלול("פרק ג")   '), ["פרק ג"]);
  check("the English alias too", referenced('#include_part("chapter")'), ["chapter"]);
  check("either quote", referenced("#כלול('פרק ג')"), ["פרק ג"]);
  // Mid-sentence is prose *about* the command. The engine applies the same rule,
  // and a scanner that rewrote occurrences anywhere would have to understand
  // comments and string literals to avoid rewriting the word inside them.
  check("mid-sentence is not a directive", referenced('הפקודה #כלול("פרק") עושה כך'), []);
  check("a trailing comment is not a directive", referenced('#כלול("פרק") // הערה'), []);
  check("an empty name is not a directive", referenced('#כלול("")'), []);
  check("no arguments is not a directive", referenced("#כלול()"), []);

  check(
    "several lines, in order",
    referenced('#כלול("א")\nטקסט\n#כלול("ב")'),
    ["א", "ב"],
  );
  check("and each named once", referenced('#כלול("א")\n#כלול("א")'), ["א"]);

  // --------------------------------------------------------------- collecting
  {
    const got = collect('#כלול("א")', from({ א: "שלום" }));
    check("a chapter is collected", got, [{ name: "א", body: "שלום" }]);
  }
  {
    // Transitively: a chapter that includes a section pulls the section too.
    const got = collect('#כלול("א")', from({ א: '#כלול("ב")', ב: "עלה" }));
    check("through a chain", got.map((p) => p.name), ["א", "ב"]);
  }
  {
    // The check that has to exist here rather than only in the engine: a loop
    // must terminate *before* the request is built, or nothing is ever sent.
    const got = collect('#כלול("א")', from({ א: '#כלול("ב")', ב: '#כלול("א")' }));
    check("a loop terminates", got.map((p) => p.name), ["א", "ב"]);
  }
  {
    const got = collect('#כלול("א")\n#כלול("ב")', from({ א: "x" }));
    check("an unknown name is simply not sent", got.map((p) => p.name), ["א"]);
    // …and is not sent as an empty body either, which would look to the engine
    // like a chapter that exists and is blank — so the writer would get a silent
    // gap instead of the marker that says the name is wrong.
    notOk("nor as an empty one", got.some((p) => p.name === "ב"));
  }
  {
    // A document that includes nothing costs nothing: no lookup is even
    // attempted, which is what keeps this off the hot path for everybody who
    // writes one file.
    let asked = 0;
    const got = collect("שלום עולם", () => {
      asked++;
      return null;
    });
    check("nothing to collect", got, []);
    check("and nothing was looked up", asked, 0);
  }
  {
    // Depth is bounded, so a chain long enough to be a mistake cannot run away.
    const chain = {};
    for (let i = 0; i < 30; i++) chain[`p${i}`] = `#כלול("p${i + 1}")`;
    const got = collect('#כלול("p0")', from(chain));
    notOk("a runaway chain is cut", got.length > 20);
  }
}
