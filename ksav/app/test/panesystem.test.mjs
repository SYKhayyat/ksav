// The wave-2 carve's own fence — the split plan's rule 7: a new file gets at
// least one assertion-bearing fence the moment it exists, so a module cannot
// exist on disk untested and unnoticed by the runner's disk-read list.
//
// The pane system moved out of `main.ts` as seven modules plus the state leaf:
// `panestate`, `paneview`, `panehost`, `panedrag`, `panescroll`, `panemenu`,
// `panearrangements`, `tabstrip`. One fence covers all eight because they are
// one system — the split's whole design is that they read each other only
// through `panestate` and the wiring object, and that is exactly what these
// assertions hold:
//
//   1. The exports the shell imports are real, callable exports — the wave's
//      acceptance is that the pane system survives the move.
//   2. `panestate` is the leaf: its setters are the only writers, its wiring
//      refuses to answer before main.ts registers it, and the tree/focus
//      round-trip behaves for the commands that lean on it.
//   3. No pane module imports `./main`, and the render side reaches main.ts
//      only as wiring callbacks (rule 4, read off the files as text).
//   4. `panescroll`'s exported arithmetic — the follow's clamps — clamps at
//      both ends, because a clamp gone wrong scrolls a reader into nothing.

import { check, notOk, ok } from "./harness.mjs";
import * as panestate from "../.tmp-test/panestate.mjs";
import * as paneview from "../.tmp-test/paneview.mjs";
import * as panehost from "../.tmp-test/panehost.mjs";
import * as panedrag from "../.tmp-test/panedrag.mjs";
import * as panescroll from "../.tmp-test/panescroll.mjs";
import * as panemenu from "../.tmp-test/panemenu.mjs";
import * as panearrangements from "../.tmp-test/panearrangements.mjs";
import * as tabstrip from "../.tmp-test/tabstrip.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC = path.join(dirOf(import.meta.url), "..", "src");
const src = (f) => readFileSync(path.join(SRC, f), "utf8");

export async function run() {
  // 1. The passenger lists — the names main.ts imports, asserted as live
  // exports rather than as text, per `spellcheck.test.mjs`'s pattern.
  const passengers = {
    panestate: [
      "paneTree", "focusedPane", "zoomedNode", "activePane", "mirroring", "forwarding",
      "setPaneTree", "setFocusedPane", "setActivePane", "setZoomedNode", "setMirroring", "setForwarding",
      "paneViewOf", "hasPaneView", "paneViewEntries", "paneViewsAll", "registerPaneView", "forgetPaneViews",
      "currentPane", "sourceViews", "showInEveryPane", "rememberPlaces", "restorePlaces",
      "restorePreviewPlaces", "primaryView", "titleOfSpan", "paneNumberOf", "paneLayout",
      "paneHostOf", "paneNarrow", "previewWindowOf", "applyPreviewWindows", "setTree",
      "forgetClosedPanes", "rememberPanes", "wirePanes", "paneWiring",
    ],
    paneview: ["makePaneView", "narrowHere", "widenHere"],
    panehost: ["renderPanes", "refreshPaneHeads", "cyclePaneZoom", "gotoPart"],
    panedrag: ["wirePaneDrag", "swapPaneToward", "swapPanes", "splitterFor"],
    panescroll: [
      "wirePaneScroll", "noteScrollWrite", "claimFloor", "bookLinkedScroll",
      "syncLinkedScroll", "matchFraction", "followCaretInPreview", "invalidateScrollMap",
      "clamp01", "clampScroll", "cancelCaretFollow",
    ],
    panemenu: ["openPaneMenu"],
    panearrangements: ["saveArrangementHere", "openArrangements", "applyPageView"],
    tabstrip: [
      "movePaneToTab", "buildTabStrip", "refreshTabStrip", "retargetPanes", "newTab",
      "openInNewTab", "newDocTab", "enterDoc", "selectTab", "closeTab", "refreshPanes",
    ],
  };
  const mods = { panestate, paneview, panehost, panedrag, panescroll, panemenu, panearrangements, tabstrip };
  // The six state exports are `export let` bindings — asserted as *present*
  // rather than as functions; everything else on the lists is a function.
  const STATE = new Set(["paneTree", "focusedPane", "zoomedNode", "activePane", "mirroring", "forwarding"]);
  for (const [mod, names] of Object.entries(passengers)) {
    for (const name of names) {
      if (mod === "panestate" && STATE.has(name)) {
        ok(`panestate.ts exports the ${name} binding`, typeof mods[mod][name] !== "undefined");
      } else {
        check(`${mod}.ts exports ${name} as a function`, typeof mods[mod][name], "function");
      }
    }
  }

  // 2. The leaf's own behaviour — the part every pane command leans on.
  //
  // The wiring refuses to answer before registration: a pane command firing
  // before boot would otherwise fail as "undefined is not a function" inside
  // some module, which is the error nobody can trace to its cause.
  let refused = "";
  try {
    panestate.paneWiring();
  } catch (e) {
    refused = String(e.message ?? e);
  }
  ok("the wiring refuses to answer before main.ts registers it", refused.includes("wirePanes"));

  panestate.wirePanes({
    rebuildPanes: () => {}, refreshHeads: () => {}, makePaneState: () => {},
    proseHere: () => false, applyEditingModes: () => {}, fillSidePanes: () => {},
    refreshSidePanes: () => {}, openDocHanded: async () => {}, askText: async () => null,
  });
  ok("after registration the wiring answers", typeof panestate.paneWiring().rebuildPanes === "function");

  // The tree round-trips through the setter, and the live binding is the same
  // binding every other module imported — that is the whole reason these are
  // `export let` rather than a getter called in nine places.
  const tree = panestate.paneTree;
  panestate.setPaneTree(tree);
  check("the tree survives a set of itself", panestate.paneTree, tree);

  // `currentPane` answers the *last pane touched*, of any role, falling back to
  // the focused source pane — the fallback, not the field, is the contract the
  // swap commands lean on, and a closed pane's id must not come back.
  panestate.setActivePane(null);
  panestate.setFocusedPane(null);
  check("no pane touched means no pane to act on", panestate.currentPane(), null);

  // `titleOfSpan` never answers an empty string: a heading with no title still
  // has to be nameable in a sentence.
  ok(
    "an untitled span is named, not blanked",
    panestate.titleOfSpan({ title: "", anchor: 0 }).length > 0,
  );

  // 3. Rule 4, read off the files: the pane modules reach for nobody's internals
  // and none of them imports `./main`.
  const files = [
    "panestate.ts", "paneview.ts", "panehost.ts", "panedrag.ts",
    "panescroll.ts", "panemenu.ts", "panearrangements.ts", "tabstrip.ts",
  ];
  for (const f of files) {
    notOk(`${f} does not import ./main`, src(f).includes('from "./main"'));
  }
  // And the render side reaches main.ts only through the wiring callbacks the
  // registration passes in — the text of both sides must name the same five.
  const main = src("main.ts");
  for (const wiring of ["rebuildPanes", "refreshHeads", "makePaneState", "refreshSidePanes", "openDocHanded", "askText"]) {
    ok(`main.ts registers ${wiring} and panestate declares it`, main.includes(`${wiring}:`) && src("panestate.ts").includes(`${wiring}(`));
  }

  // 4. The follow's clamps — a clamp gone wrong scrolls a reader into nothing,
  // and the arithmetic is exported precisely so it can be held without a DOM.
  check("clamp01 holds at the bottom", panescroll.clamp01(-0.4), 0);
  check("clamp01 holds at the top", panescroll.clamp01(1.4), 1);
  check("clamp01 passes the middle through", panescroll.clamp01(0.5), 0.5);
  // A fake element: 1000px of content in a 100px window, so the scrollable
  // range is 900 and a request for -50 or for 10000 must land at 0 and 900.
  const scroller = { scrollHeight: 1000, clientHeight: 100 };
  check("clampScroll floors an overshoot", panescroll.clampScroll(-50, scroller), 0);
  check("clampScroll ceilings an undershoot", panescroll.clampScroll(10000, scroller), 900);
  check("clampScroll passes a legal value through", panescroll.clampScroll(450, scroller), 450);
}
