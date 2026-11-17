
// The action surface: the table of everything the shell can run, and the
// dispatcher that runs it.
//
// `BUILT_IN` was the largest single constant `main.ts` had — 293 lines — because
// every command it names lived there too. Wave 8 of #188 moved the table and the
// dispatcher together, which is the point: a table and the thing that looks
// entries up in it should not be two files agreeing about an id by convention.
//
// These assertions are about the properties a command table has to have and a
// reader cannot check by eye: every id is unique, every entry can actually run,
// and the palette's list and the dispatcher's lookup cannot disagree.

import { check, ok, notOk } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { dirOf } from "../tools/paths.mjs";
import path from "node:path";

const SRC = path.resolve(dirOf(import.meta.url), "..", "src");
const AS = readFileSync(path.join(SRC, "actionsurface.ts"), "utf8");

export async function run() {
  const { BUILT_IN, actions, actionById, runAction, styleActions, isRunningAction } =
    await import("../.tmp-test/actionsurface.mjs");

  check("BUILT_IN is a table", Array.isArray(BUILT_IN), true);
  ok("...with entries in it", BUILT_IN.length > 20);
  check("actions is a function", typeof actions, "function");
  check("runAction is a function", typeof runAction, "function");
  check("actionById is a function", typeof actionById, "function");

  // ---- every entry is well formed ------------------------------------------
  //
  // An id with no runner is a palette row that does nothing when pressed, which
  // is the failure the writer reports as "the button is broken". A duplicate id
  // is worse: `actionById` returns the first match, so the second silently never
  // runs and a key bound to it appears to be bound.
  const ids = BUILT_IN.map((a) => a.id);
  ok("every action has an id", ids.every((id) => typeof id === "string" && id.length > 0));
  ok("every action can run", BUILT_IN.every((a) => typeof a.run === "function"));
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  check("no id appears twice", dupes, []);

  // The palette and the dispatcher read the same array, so looking an id up must
  // find exactly the entry that `actions()` listed.
  for (const id of ids.slice(0, 8)) {
    check(`actionById("${id}") finds its own entry`, actionById(id)?.id, id);
  }
  check("actionById invents nothing", actionById("not-a-real-action"), undefined);

  // ---- the re-entrancy guard ----------------------------------------------
  //
  // `runAction` increments a counter that `main.ts` reads to decide whether a
  // keystroke is the writer's or a command's. If it ever leaked — a throw between
  // the increment and the decrement — every subsequent keystroke would be routed
  // as though a command were still running.
  check("nothing is running before any action", isRunningAction(), false);

  // `runAction` needs a view to do anything, so the counter's restore cannot be
  // exercised behaviourally here — the first version of this assertion claimed it
  // and a mutation that dropped the `finally` **passed**, because nothing ran. It
  // is a source fence instead, and it is a real one: the `finally` is the whole
  // difference between a guard and a leak.
  notOk(
    "the counter is decremented before something can throw past it",
    /inAction\+\+;(?![\s\S]{0,40}try)/.test(AS),
  );
  ok(
    "...specifically, in a finally",
    /inAction\+\+;\s*\n\s*try\s*\{[\s\S]*?\}\s*finally\s*\{\s*\n\s*inAction--;/.test(AS),
  );

  // ---- and the table still names real commands ----------------------------
  //
  // Spot checks across the sections rather than a count: these are the entries
  // whose removal would not fail anything else, and each is a feature a writer
  // has explicitly asked for.
  for (const id of ["toc", "minimap", "fold", "hideLine", "deferAll", "foldLevel1"]) {
    ok(`the table still offers "${id}"`, ids.includes(id));
  }

  // ---- the move did not smuggle the shell in ------------------------------
  notOk("actionsurface takes no wiring seam", /\bwire[A-Z]\w*\(/.test(AS));
  notOk("actionsurface does not import main", /from\s+"\.\/main"/.test(AS));
}
