
// The layout composition, and the repaints that hold it together.
//
// `render()` and six paint helpers were `main.ts`'s (wave 5 of #188). Two things
// are worth fencing now that they are here, and neither is a line count:
//
//   1. `render()` composes the window in a stated order, and the order is the
//      invariant. The problems region above the panes is #124; the tab strip
//      above them is "what it selects between". A move that shuffled these would
//      still render something, and the file would still be the same size.
//   2. Nothing here needs a wiring seam, because every name is a module export.
//      That is a property to hold rather than assume: the first `from "./main"`
//      or `wire…()` call in this file means the move was not the clean one it
//      looked like.

import { check, ok, notOk } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { dirOf } from "../tools/paths.mjs";
import path from "node:path";

const SRC = path.resolve(dirOf(import.meta.url), "..", "src");
const LAYOUT = readFileSync(path.join(SRC, "layout.ts"), "utf8");

export async function run() {
  // Importing proves it evaluates without booting the application — there is no
  // seam to register first, which is the whole point of this module.
  const mod = await import("../.tmp-test/layout.mjs");
  for (const name of [
    "render",
    "applyTheme",
    "applySourceZoom",
    "applyUiDir",
    "nameGutterMarks",
    "openPreviewOverlay",
    "updateCounts",
  ]) {
    check(`layout exports ${name}`, typeof mod[name], "function");
  }

  // The composition names the surfaces rather than building them: each of these
  // is a module export called from `render`.
  for (const call of [
    "buildHeader()",
    "contextBar()",
    "buildNikudBar(",
    "buildTabStrip()",
  ]) {
    ok(`render composes ${call}`, LAYOUT.includes(call));
  }

  // The order is the invariant: the tab strip selects between the panes, so it
  // is above them; the problems region takes space in the layout rather than
  // covering it (#124).
  const render = LAYOUT.slice(LAYOUT.indexOf("export function render("));
  const at = (needle) => render.indexOf(needle);
  // Against the panes' *container*, not the `renderPanes()` call — that call is
  // far below the composition, so "above it" is satisfied by almost anywhere and
  // a mutation that moved the strip to the very bottom still passed. The
  // container is `el("main", {})`; the strip selects between what fills it.
  ok("the tab strip is above the panes", at('buildTabStrip()') < at('el("main", {})'));
  // "In the layout rather than over it" (#124) does not mean *before* the panes —
  // it is a later sibling that takes its own space. The property is that it is
  // composed into the window itself and is not an overlay: an overlay would be
  // `overlayPanel`, and it would cover the very text a compile error is about.
  ok("the problems region is composed into the window", at('id: "diagnostics"') > 0);
  notOk(
    "the problems region is not an overlay",
    /overlayPanel\([^)]*diagnostics/.test(render),
  );
  // And the container is where the panes are drawn, or the two assertions above
  // would hold vacuously on a layout that never drew a pane at all.
  ok("the panes container is composed before the panes are drawn", at('el("main", {})') > 0);

  // The seam-free property. `main.ts` may import from here; this file may not
  // reach back, or wave 5 would have moved the tangle rather than ended it.
  notOk("layout does not import main", /from\s+"\.\/main"/.test(LAYOUT));
  notOk("layout takes no wiring seam", /\bwire[A-Z]\w*\(/.test(LAYOUT));

  // The word count is debounced, and the reason is a measurement in the comment
  // (1.9 ms/keystroke at 64 KB). A debounce that lost its timer would still
  // count correctly, just on every keystroke, so the timer is what is fenced.
  ok("the word count is debounced", /setTimeout\(countNow/.test(LAYOUT));
  ok("...by a cleared timer", /clearTimeout\(countTimer\)/.test(LAYOUT));
}
