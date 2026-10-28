// The floating surfaces' scroll policy — #120.
//
// The Settings drawer was the surface the UAT report met: a touchpad gesture
// answered with the platform's delta scale, so a small move travelled a huge
// fraction of the drawer, and at the edges the scroll chained into the document
// the drawer floats over. The cure is the industry's, and in two halves — this
// file holds both, at the level each can be proved:
//
//   1. Speed: native deltas with one honest conversion (deltaMode line/page
//      into the *surface's* own pixels), then the writer's multiplier. The
//      arithmetic is pure and tested here so the policy does not need a
//      touchpad to be provable: default 1 is the native behaviour every other
//      desktop app ships, a typed fraction slows a fast platform, and a guard
//      turns a mistyped speed into native rather than into scrolling up.
//   2. Containment: `overscroll-behavior-y: contain` on every floating
//      surface, read as comment-stripped text the way chrome.test.mjs reads
//      the stylesheet — and it must NOT be on the editor/preview panes, whose
//      wheel is `panescroll`'s and CodeMirror's. The issue's own evidence
//      section is what forbids tuning *that* path from here.
//
// The wiring, as text too (main.ts cannot be imported — it boots): the policy
// installs once, from its own module. The speed itself is a *typed* number in
// the drawer, which is the granularity the fix lives or dies by — a machine
// that runs a third fast wants 0.75, not a preset.

import { check, ok, notOk } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";
import {
  wheelDistance,
  POLICY_SURFACES,
  SPEED_MIN,
  SPEED_MAX,
  SPEED_STEP,
} from "../.tmp-test/scrollpolicy.mjs";
import { DEFAULTS } from "../.tmp-test/settings.mjs";

const HERET = dirOf(import.meta.url);
const SRC = path.join(HERET, "..", "src");
const styles = readFileSync(path.join(SRC, "styles.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  " ",
);
const mainSrc = readFileSync(path.join(SRC, "main.ts"), "utf8");
const drawerSrc = readFileSync(path.join(SRC, "settingsdrawer.ts"), "utf8");

export async function run() {
  // ---------------------------------------------------- the arithmetic

  {
    // A touchpad's own precision: pixel deltas, small, unchanged — speed 1 is
    // a pass-through, which is the whole claim of "default is native".
    check("speed 1 passes pixel deltas through", wheelDistance(0, 3, 16, 600, 1), 3);
    check("...and their negatives too", wheelDistance(0, -3, 16, 600, 1), -3);

    // Line deltas are resolved into pixels with the surface's own line height.
    check("line deltas become pixels of this surface", wheelDistance(1, 3, 17, 600, 1), 51);
    // A drawer measured before layout (or one with `line-height: normal`)
    // answers with the default rather than zero-scaling the gesture away.
    ok("an unmeasured line height still moves", wheelDistance(1, 3, 0, 600, 1) > 0);

    // Page deltas are honest about being pages of *this* surface.
    check("page deltas are the surface's own page", wheelDistance(2, 1, 16, 600, 1), 600);

    // The writer's own speed: a typed multiplier, applied to whatever currency
    // the delta arrived in.
    check("a quarter-speed runs a quarter", wheelDistance(0, 400, 16, 600, 0.25), 100);
    check("...on lines too", Math.round(wheelDistance(1, 3, 17, 600, 1.3) * 10) / 10, 66.3);
    check("...and on pages", wheelDistance(2, 1, 16, 600, 1.5), 900);

    // The guard: a number the keyboard can produce but a scale cannot mean —
    // empty box, zero, negative, not-a-number — is the native 1, because the
    // alternatives are a scroll of nothing and a scroll of *up*.
    check("no speed at all is native", wheelDistance(0, 3, 16, 600, undefined), 3);
    check("NaN is native", wheelDistance(0, 3, 16, 600, NaN), 3);
    check("zero is native", wheelDistance(0, 3, 16, 600, 0), 3);
    check("negative is native", wheelDistance(0, 3, 16, 600, -2), 3);
    // ...while a bare-absurdity above the bound still answers what was asked:
    // the *bound* is the drawer's min/max, not the policy's job to re-guard.
    ok("an out-of-bounds number is still a speed", wheelDistance(0, 3, 16, 600, 9) > 0);

    // The bounds the drawer holds (so the row cannot take 400 silently).
    check("the bounds are the drawer's min/max", [SPEED_MIN, SPEED_MAX], [0.25, 4]);
    check("the step is granular — the point of a typed number", SPEED_STEP, 0.05);
  }

  // ---------------------------------------------------- the shipped default

  {
    // The default is the native behaviour, because out of the box every other
    // desktop app's scroll is this app's scroll; the setting is for the
    // machine that is not like the machine that built it.
    check("the shipped speed is native (1)", DEFAULTS.scrollSpeed, 1);
  }

  // ---------------------------------------------------- the drawer row

  {
    // Typed in a *number* row with the policy's own bounds, not a binary or a
    // select: the granularity is the acceptance.
    check("the row is a numberRow backed by the policy's bounds",
      drawerSrc.includes('numberRow("scrollSpeedLabel", "scrollSpeed", SPEED_MIN, SPEED_MAX, SPEED_STEP)'),
      true);
    ok("there is a note, read in both languages", drawerSrc.includes('t("scrollSpeedNote")'));
  }

  // ---------------------------------------------------- the wiring, as text

  {
    // The surfaces the listener answers for, each one declared somewhere real:
    // an id the shell or stylesheet knows by exact name, or a class with a
    // rule — checked the way chrome.test.mjs checks selectors, so a typo in
    // the list cannot make the policy a vacuum.
    const declared = (sel) => {
      if (sel.startsWith("#")) return new RegExp(`#${sel.slice(1)}(?![\\w-])`).test(styles);
      return new RegExp(`\\.${sel.slice(1)}[\\s,:.{>]`).test(styles);
    };
    const surfaces = POLICY_SURFACES.split(",").map((s) => s.trim());
    check("the policy names surfaces", surfaces.length >= 5, true);
    check("every named surface is a declared selector",
      surfaces.filter((s) => !declared(s)), []);
    // And it names no editor or preview pane: their wheel belongs to
    // CodeMirror and `panescroll`, and a `preventDefault` under them would be
    // a second opinion on every stroke the writer makes in the document.
    notOk("no editor pane in the surface list", /\.pane-host/.test(POLICY_SURFACES));
    notOk("no preview pane in the surface list", /\.preview-host/.test(POLICY_SURFACES));

    // Installed at boot, once. (main.ts cannot be imported here — it boots on
    // import — so this is a text read, of the call and its import both.)
    check("boot installs the scroll policy",
      (mainSrc.match(/installScrollPolicy\(\)/g) ?? []).length, 1);
    ok("and main imports it from its own module", /from "\.\/scrollpolicy"/.test(mainSrc));

    // The containment clause is the platform's own boundary; it belongs beside
    // the rule that makes the surface scrollable (`overflow: auto`), one rule
    // per surface. Comment-stripped — the stylesheet explains itself and must
    // not be quoted back at itself.
    const ruleFor = (selector) => {
      const at = styles.search(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^{]*\\{`));
      if (at < 0) return null;
      return styles.slice(at, styles.indexOf("}", at));
    };
    const contains = (selector) => !!ruleFor(selector)?.includes("overscroll-behavior-y: contain");
    check("the drawer contains its own scrolling", contains(".drawer"), true);
    check("the menus list contains its own scrolling", contains(".menu-list"), true);
    check("the palette and history lists contain theirs",
      contains("#palette-list, #history-list"), true);
    check("the preview modal box contains its own scrolling", contains(".preview-modal-box"), true);
    check("the crash panel contains its own scrolling", contains("#crash-panel"), true);

    // And the boundary is NOT on the panes: an editor's rubber band at the end
    // of a document is the document's own question, not the drawer's.
    notOk("the editor pane is not contained", contains(".pane-host"));
    notOk("the preview pane is not contained", contains(".preview-host"));
  }
}
