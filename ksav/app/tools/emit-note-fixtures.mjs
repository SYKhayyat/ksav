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

// Through esbuild's JS API, not by running `node node_modules/esbuild/bin/esbuild`:
// that path is a JavaScript shim on Windows and the **native executable** on Linux,
// where npm's platform package overwrites it — so handing it to `node` threw
// `SyntaxError: Invalid or unexpected token` and took the editor job in CI down on
// every push, while working perfectly on the machine that wrote it. `card.mjs` and
// `test/run.mjs` had always imported `build` from "esbuild"; this is the same thing.
import { build } from "esbuild";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runAsScript } from "./generated.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, "..");
const OUT = join(APP, "..", "engine", "tests", "fixtures", "note-layouts.json");

/** Build `notes.ts` to something node can import, the way `test/run.mjs` does. */
async function loadNotes() {
  const dir = mkdtempSync(join(tmpdir(), "ksav-fixtures-"));
  try {
    const out = join(dir, "notes.mjs");
    await build({
      entryPoints: [join(APP, "src", "notes.ts")],
      outfile: out,
      bundle: true,
      format: "esm",
      platform: "node",
      logLevel: "silent",
    });
    return await import(pathToFileURL(out).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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
const BODY_1 = "טקסטהערהאחת";
const BODY_2 = "טקסטהערהשתים";

export async function buildFixture() {
  const { NOTE_CHOICES, applyChoice } = await loadNotes();
  const cases = [];
  for (const c of NOTE_CHOICES) {
    // "both" matters more than it looks: a two-layer layout's settings are what
    // tell the layers apart, so a document containing only the first layer
    // cannot show whether those settings arrived. The first version of the
    // engine-side test passed a layout whose configuration was doing nothing,
    // purely because the fixture never used the second marker.
    const whiches = c.insert2 ? ["primary", "secondary", "both"] : ["primary"];
    for (const which of whiches) {
      // Two notes of the kind under test, one early and one late, so a
      // per-page apparatus has to render on more than the page it was
      // configured on.
      let text = FILLER;
      // Insert the later note first, so the earlier insertion's offset holds.
      const plan =
        which === "both"
          ? [[36, BODY_2, "secondary"], [2, BODY_1, "primary"]]
          : [[36, BODY_2, which], [2, BODY_1, which]];
      for (const [para, body, layer] of plan) {
        const at = text.split("\n\n").slice(0, para).join("\n\n").length;
        const r = applyChoice(text, at, c, layer, false);
        text = r.text.slice(0, r.caret) + body + r.text.slice(r.caret);
      }
      // Where this layout *claims* the notes print — the assertion §1.3 was
      // missing. `#הערות_מדורגות` renders in the main flow, so on a short
      // document its band landed near the top of the page (measured: y=126 of
      // 842) while the page-bottom equivalent sat at y=741, and nothing in the
      // product distinguished "at the foot of every page" from "at the end".
      // Only the layouts whose layers all land in one place are asserted: a
      // split arrangement is two places by definition, and the margin ones are
      // beside their line rather than below anything.
      const place =
        c.how === "split"
          ? null
          : c.where.length === 1 && c.where[0] === "page"
            ? "page"
            : c.where.includes("document") || c.where.includes("section")
              ? "end"
              : null;
      cases.push({
        id: c.id,
        which,
        place,
        // What the writer would see in the editor after two clicks.
        source: text,
        bodies: [BODY_1, BODY_2],
        // The configuration line this layout needs, and whether *this* case can
        // show it working. A two-layer layout configured with a scheme per layer
        // changes nothing in a document that uses only one layer — true, and not
        // a bug, so only the case that uses every layer is asked to prove it.
        head: c.head ?? null,
        exercisesHead: !!c.head && (c.insert2 ? which === "both" : true),
      });
    }
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
