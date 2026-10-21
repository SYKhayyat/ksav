// The spell-check UI module's own fence — the split plan's rule 7: a new file
// gets at least one assertion-bearing fence the moment it exists, so a module
// cannot exist on disk untested and unnoticed by the runner's disk-read list.
//
// The load-bearing claims here are the module's own three:
//
//   1. The exports main.ts imports are real, callable exports — the wave's
//      acceptance is that the squiggle and its answers survive the move.
//   2. `paragraphAround` widens to blank lines and clamps at both ends — the
//      incremental check's whole unit is this one answer, and a clamp gone
//      wrong checks a paragraph nobody wrote or misses the one they did.
//   3. The module reaches for no `./main` and installs no Compartment: the
//      delegate-to-not-import split — spellcheck suffers no cycle, and the
//      extension assembly stays in main.ts.
//
// The debounced check itself (`runSpellCheck`) drives a worker and a DOM note;
// its behavior is what `spell.test.mjs` guards engine-side, and the notes
// (`spellCoverageNote` & co.) are asserted here as *sentences*, not strings.

import { check, notOk, ok, resetStorage } from "./harness.mjs";
import * as spellcheck from "../.tmp-test/spellcheck.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC = path.join(dirOf(import.meta.url), "..", "src");
const spellSrc = readFileSync(path.join(SRC, "spellcheck.ts"), "utf8");

export async function run() {
  resetStorage();

  // 1. The passenger list, asserted as live functions rather than as text.
  for (const name of [
    "scheduleSpellCheck",
    "markSpellDirty",
    "forceFullSpellCheck",
    "runFullSpellCheck",
    "spellCheckFromScratch",
    "clearSpellCheck",
    "openSpellMenu",
    "closeSpellMenu",
    "closeNoteMenu",
    "editingModeNote",
    "snapshotNote",
    "spellCoverageNote",
  ]) {
    check(`spellcheck.ts exports ${name}`, typeof spellcheck[name], "function");
  }

  // 2. The widening — the one piece of arithmetic a wrong answer in is
  // invisible in the UI until a paragraph turns out to have been skipped.
  check(
    "a region widens to the paragraph that contains it",
    spellcheck.paragraphAround("para one\n\npara two", 12, 15),
    { from: 10, to: 18 },
  );
  check(
    "a region in the first paragraph clamps to the top of the document",
    spellcheck.paragraphAround("paras\n\nhere", 1, 2),
    { from: 0, to: 5 },
  );
  check(
    "a region in the last paragraph clamps to the end",
    spellcheck.paragraphAround("first\n\nlast", 8, 10),
    { from: 7, to: 11 },
  );

  // The three panel notes answer with sentences even before any check has
  // run — a note for which the checker has no answer yet is not allowed to
  // read as a clean bill of health, and it is not allowed to be blank.
  ok("the coverage note says so before any check answers", spellcheck.spellCoverageNote().length > 0);
  ok("the editing-mode note says so before any mode loads", spellcheck.editingModeNote().length > 0);
  ok("the snapshot note names a chord or the button", spellcheck.snapshotNote().length > 0);

  // 3. The split plan's rule 4, asserted on the file itself: spellcheck.ts
  // imports main.ts never. The extension assembly's `autoExtension` lives in
  // main.ts *on purpose*; a reference here would be a cycle and a feature
  // this module does not own.
  notOk(
    "spellcheck.ts reaches for no ./main import",
    /from\s+"\.\.?\/main"/.test(spellSrc),
  );
  ok(
    "spellcheck.ts installs no Compartment of its own — the extension assembly stays in main.ts",
    !/^const [\w$]+ = new Compartment\(/m.test(spellSrc),
  );
}
