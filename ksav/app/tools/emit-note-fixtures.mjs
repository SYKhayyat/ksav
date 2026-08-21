// Emit, for every option in the Notes chooser, the exact source the chooser
// writes — so the *engine* can render it and check the page.
//
// This exists because of a bug class that survived two audits. The app's tests
// asserted what `applyChoice` emits (the scaffolding line is present, the marker
// is well-formed); the engine's tests asserted that hand-written Typst lays out
// correctly. Nobody rendered the string the app actually produces. So the
// chooser could — and did — write `#הגדרות_מדפים(גבהים: …)` at the *end* of the
// file, where a Typst `state.update` read from a page footer reaches the last
// page and no other: correct-looking source, correct engine, wrong page.
//
// The seam is where these live, so the test has to sit across the seam.
//
//   node tools/emit-note-fixtures.mjs          # rewrite the fixture
//   node tools/emit-note-fixtures.mjs --check  # fail if it is stale
//
// `npm test` runs the --check form; `cargo test --test chooser` renders it.

import { join } from "node:path";
import { runAsScript } from "./generated.mjs";
import { load } from "./load.mjs";
import { ENGINE } from "./paths.mjs";

const OUT = join(ENGINE, "tests", "fixtures", "note-layouts.json");

// Long enough to break over at least two pages: the whole point of several of
// these layouts is per-page geometry, and a one-page document cannot show a
// setting that only takes effect from the page it was written on.
const LINES = 44;
const FILLER = Array.from(
  { length: LINES },
  (_, i) => `שורה ${i + 1} של הגוף, ובה די מלים כדי למלא את רוחב השורה עד סופה ממש.`,
)
  .concat(["סוףהגוףכאןממש."])
  .join("\n\n");

/**
 * The last paragraph of body text, as an all-Hebrew needle.
 *
 * All-Hebrew because a Latin digit inside a Hebrew line is bidi-reordered to the
 * front of the laid-out line, so a needle like `שורה44` never appears
 * contiguously in the probe output and every assertion on it reads "not on the
 * page". This is what "after the last body text" is measured against.
 */
const LAST_BODY = "סוףהגוףכאןממש";

// A distinct body per note so a probe can tell them apart on the page, and so a
// layout that merges two notes by content is visible as a missing string.
//
// All-Hebrew and none a substring of another: the engine side finds them with
// `contains`, and a needle that is a prefix of the next one would report a
// layout as working because its neighbour rendered.
const BODIES = [
  "טקסטהערהאחת",
  "טקסטהערהשתים",
  "טקסטהערהשלוש",
  "טקסטהערהארבע",
  "טקסטהערהחמש",
  "טקסטהערהשש",
  "טקסטהערהשבע",
];
/** The fixture's name for one case's stream: a region's name, or `primary`. */
function whichName(pick) {
  return pick.region ?? "primary";
}

export async function buildFixture() {
  const { applyPick, destinationLines } = await load("notes");
  const { DESTINATIONS, PLACEMENTS, PRESETS, destinationOf, presetLines, presetOf } =
    await load("channels");

  /**
   * Where a pick *claims* its notes print — the assertion §1.3 was missing, and
   * the reason a writer could pick "two separate blocks" and get a band sitting
   * near the top of the page.
   *
   * Derived, not tabulated. `side` and `file` come back `null` because the
   * engine does not carry those placements yet (`_ch_places`), so a note sent to
   * one lands in a region at the page foot — which the chooser says in words
   * rather than hiding. Asserting that interim answer would pin the bug in place
   * and make the day the engine grows the placement a red test about nothing.
   */
  const placeOf = (pick, preset) => {
    const place =
      pick.dest === "region"
        ? (presetOf(preset)?.makes?.placement ?? null)
        : destinationOf(pick.dest).channel;
    if (place === null) return null;
    if (place === "רגל") return "page";
    return PLACEMENTS.includes(place) ? "end" : null;
  };

  // Every destination, plus the presets that make a region — a preset is a value
  // of the one axis, so a case for one is a case for the pick it sets and there
  // is no second mechanism here to cover.
  const picks = [
    ...DESTINATIONS.filter((d) => d.id !== "region").map((d) => ({
      id: d.id,
      pick: { dest: d.id, region: null },
      preset: null,
    })),
    ...PRESETS.filter((p) => p.makes).map((p) => ({ id: p.id, pick: p.pick, preset: p.id })),
  ];

  const cases = [];
  for (const { id, pick, preset } of picks) {
    // Notes of the kind under test spread from early to late, so a per-page
    // apparatus has to render on more than the page it was configured on.
    let text = FILLER;
    const bodies = [BODIES[0], BODIES[1]];
    // Paragraph 2 and paragraph 36 of 44. The later note is inserted first, so
    // the earlier insertion's offset still holds.
    const plan = [
      [2, bodies[0]],
      [36, bodies[1]],
    ];
    for (const [para, body] of [...plan].reverse()) {
      const at = text.split("\n\n").slice(0, para).join("\n\n").length;
      const r = applyPick(text, at, pick, false, {}, "he", false, preset ? presetOf(preset) : null);
      text = r.text.slice(0, r.caret) + body + r.text.slice(r.caret);
    }
    const made = preset ? presetLines(presetOf(preset), "he") : { head: [], tail: [] };
    const heads = [...made.head, ...destinationLines(pick, "he", presetOf(preset)?.makes?.placement).head];
    cases.push({
      id,
      which: whichName(pick),
      place: placeOf(pick, preset),
      // What the writer would see in the editor after two clicks.
      source: text,
      bodies,
      // The line that places this destination, when it writes one.
      //
      // **`exercisesHead` is false for every case, and that is the model rather
      // than an omission.** `#ערוץ` and `#אזור` are read with `.final()`, quite
      // deliberately: where an apparatus prints is a fact about the document and
      // not about a position in it, which is the whole property the eighteen
      // commands could not offer. So moving one of these lines to the end of the
      // file changes nothing at all, and `channels.test.mjs` asserts that
      // directly — it is a property of the declaration rather than of any one
      // layout, and it is the opposite of the `#הגדרות_*` trap this field was
      // added for.
      head: heads[0] ?? null,
      exercisesHead: false,
    });
  }
  return JSON.stringify(
    { note: "generated by app/tools/emit-note-fixtures.mjs", lastBody: LAST_BODY, cases },
    null,
    2,
  );
}

/** Every generated output, as `[path, wanted, label]`. */
export const OUTPUTS = [[OUT, await buildFixture(), "note-layouts.json"]];

runAsScript(import.meta.url, OUTPUTS, "note fixtures", "node tools/emit-note-fixtures.mjs");
