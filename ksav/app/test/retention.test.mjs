// What a history costs, who decides, and a preview that admits it is behind.
//
// Two reports, one shape — a judgement call written as a constant, with the
// shipped value as the only value:
//
//   - *"`MAX_SNAPSHOTS = 50` and `MAX_HISTORY_BYTES = 2 * 1024 * 1024` are both
//     judgement-call constants and must become settings with the current values
//     as defaults."* And two real problems beyond configurability: snapshots
//     store whole document bodies rather than diffs, so **the largest seforim
//     get the fewest restore points**, and nothing anywhere showed what the
//     history cost.
//   - *"A third value on `previewDelay`: manual, where the preview updates only
//     on a button press. The preview must clearly say when it is stale,
//     otherwise the mode is a way to look at an old page and believe it is
//     current."*
//
// The second sentence of each is the one worth a fence. A setting that silently
// keeps fewer restore points, and a preview that silently stops updating, are
// the same defect as every other in this repository: a working mechanism behind
// a surface that does not report on it.

import { check, ok, notOk } from "./harness.mjs";
import * as docs from "../.tmp-test/docs.mjs";
import { DEFAULTS } from "../.tmp-test/settings.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC = path.join(dirOf(import.meta.url), "..", "src");
const MAIN = readFileSync(path.join(SRC, "main.ts"), "utf8");
const COMPILE = readFileSync(path.join(SRC, "compile.ts"), "utf8");

export async function run() {
  // ------------------------------------------------- the ceilings, and who sets them

  {
    // The shipped values are the defaults, which is the standing rule: a
    // judgement-call constant becomes a setting *with the old value as its
    // default*, so no existing document changes behaviour on upgrade.
    const shipped = docs.historyLimits({});
    check("the count ceiling still ships at fifty", shipped.count, docs.MAX_SNAPSHOTS);
    check("...and the byte ceiling at two megabytes", shipped.bytes, docs.MAX_HISTORY_BYTES);
  }

  {
    const set = docs.historyLimits({ maxSnapshots: 120, maxHistoryMB: 8 });
    check("a writer can ask for more restore points", set.count, 120);
    check("...and more room for them", set.bytes, 8 * 1024 * 1024);
  }

  {
    // Clamped, and clamped *here* rather than in the row that sets it: what a
    // sane ceiling is belongs to the feature. Zero is refused in particular —
    // a history switched off by arithmetic is not a setting, and turning it off
    // is what the snapshot cadence already means.
    check("zero restore points is not on offer", docs.historyLimits({ maxSnapshots: 0 }).count, 1);
    check("nor is a negative one", docs.historyLimits({ maxSnapshots: -5 }).count, 1);
    check("nor a fractional one", docs.historyLimits({ maxSnapshots: 12.4 }).count, 12);
    check("an absurd count is clamped", docs.historyLimits({ maxSnapshots: 99999 }).count, 500);
    check("an absurd size is clamped", docs.historyLimits({ maxHistoryMB: 99999 }).bytes, 200 * 1024 * 1024);
    ok("...and a tiny one still keeps something", docs.historyLimits({ maxHistoryMB: 0 }).bytes > 0);
  }

  {
    // The cost, measured off the same list the rows are drawn from — so the
    // number on screen cannot disagree with the rows beside it.
    const cost = docs.historyCost([{ t: 1, body: "אבג" }, { t: 2, body: "דה" }]);
    check("the cost counts the restore points", cost.count, 2);
    check("...and the room they take", cost.bytes, 5);
    check("an empty history costs nothing", docs.historyCost([]).bytes, 0);
  }

  {
    // The trim reads the setting rather than the constant. Read out of the
    // source because `trim` is private and the alternative — driving the whole
    // store — tests IndexedDB rather than the decision.
    const src = readFileSync(path.join(SRC, "docs.ts"), "utf8");
    ok("the trim asks the setting", /function trim\([\s\S]{0,300}historyLimits\(settings\)/.test(src));
    notOk("...and not the constant", /function trim\([\s\S]{0,300}slice\(-MAX_SNAPSHOTS\)/.test(src));
  }

  {
    // The other half, and the half that was the actual report: the cost is
    // *shown*, the reason a big sefer gets fewer restore points is said in
    // words, and there is a way to stop paying it. A number with no explanation
    // and no lever is a complaint, not a control.
    ok("the history says what it costs", /tf\(\s*"historyCost"/.test(MAIN));
    ok("...and why a big sefer keeps fewer", /t\("historyWholeBodies"\)/.test(MAIN));
    ok("...and offers a way to clear it", /t\("historyClear"\)/.test(MAIN) && /docs\.clearHistory\(/.test(MAIN));
    ok("...which takes the newest-snapshot pointer with it", /LATEST_SUFFIX/.test(
      readFileSync(path.join(SRC, "docs.ts"), "utf8").split("export async function clearHistory")[1] ?? "",
    ));
  }

  // ------------------------------------------------------------ manual compile

  {
    check("the preview still updates as you type by default", DEFAULTS.previewDelay ?? "live", "live");
    ok("...and manual is a third answer", /\["manual", t\("previewDelay\.manual"\)\]/.test(MAIN));
  }

  {
    // The staleness is set at the moment the compile is declined, in the same
    // function — not by a shell that might forget. That adjacency is the
    // assertion: *"otherwise the mode is a way to look at an old page and
    // believe it is current"*.
    ok(
      "declining to compile marks the preview stale",
      /previewDelay === "manual"[\s\S]{0,200}setStale\(true\)/.test(COMPILE),
    );
    ok("...and laying it out clears it", /function compileNow\(\)[\s\S]{0,200}setStale\(false\)/.test(COMPILE));
    ok("...as does a scheduled compile landing", /setStale\(false\);\s*\n\s*void runCompile\(\)/.test(COMPILE));
  }

  {
    // And the writer is told, on the page it is about, with the way out on it.
    ok("every preview pane can say it is behind", /class: "preview-stale"/.test(MAIN));
    ok("...in words", /t\("previewStale"\)/.test(MAIN) && /t\("previewStaleHow"\)/.test(MAIN));
    ok("...and pressing it lays the sefer out", /"preview-stale"[\s\S]{0,120}compileNow\(\)/.test(MAIN));
    ok("...and the shell is told when to show it", /onStale\(\(v\) =>/.test(MAIN));
  }

  // ---------------------------------------------------------- the scroll sync

  {
    // The half of #5 that is wiring rather than rule — the rules are in
    // `scrollmap.test.mjs`, where they can be exercised. What is asserted here
    // is that the shell reaches for them, and that the settle exists at all.
    ok("the follow asks for the anchor by direction", /anchorFor\(settings\.syncMatch, dir\)/.test(MAIN));
    ok("...and the direction is read off the movement", /moved > 0 \? 1 : moved < 0 \? -1 : 0/.test(MAIN));
    ok("...and a drift under the dead zone is dropped", /worthFollowing\(moved, settings\.syncDeadZone\)/.test(MAIN));
    // Before the floor is claimed, or a two-pixel shiver would lock the other
    // pane out for the length of the floor while following nothing itself.
    ok(
      "...before this pane claims the floor",
      MAIN.indexOf("worthFollowing(moved, settings.syncDeadZone)") <
        MAIN.indexOf("scrollFloor = { pane: pane.id"),
    );
  }

  {
    // Estimate while moving, exact when it settles. The estimate is a
    // line-height model and the exact answer is the compiler's; asking the
    // compiler per scroll event would be a layout per frame.
    ok("there is a settle", /function settleExactly\(/.test(MAIN));
    ok("...on a delay the writer sets", /settings\.syncSettleMs \?\? 150/.test(MAIN));
    ok("...which can be turned off", /settings\.syncExact === false/.test(MAIN));
    ok(
      "...and it asks the engine",
      /function settleNow\([\s\S]{0,1200}\.reveal\(/.test(MAIN),
    );
    // A gesture that started while the compiler was thinking wins: a preview
    // that jumps a second after you have moved on is worse than a few pixels.
    ok(
      "...and a newer gesture beats a late answer",
      /function settleNow\([\s\S]{0,2000}scrollFloor\.pane !== from\.id/.test(MAIN),
    );
    // Our own write, recognised as an echo — or the settle reads as a person
    // scrolling the preview and gets followed back into the source.
    ok(
      "...and the settle is not mistaken for a reader",
      /function settleNow\([\s\S]{0,2400}scrollWritten\.set\(to\.id/.test(MAIN),
    );
  }
}
