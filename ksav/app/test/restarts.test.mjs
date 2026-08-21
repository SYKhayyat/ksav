// Starting a count again — for the notes and for the numbers a siman carries.
//
// # The two reports, and why they are one file
//
// > *"Note numbering should be restartable rather than running unbroken through
// > a whole sefer… automatic restart at a chosen structural level, plus explicit
// > restart and explicit continue commands the writer can place by hand."*
//
// > *"Renumber automatically on delete and on move, and report that it happened
// > (configurable; default is to report). Restart the count automatically by
// > nesting level, plus explicit restart *and* explicit continue commands so an
// > automatic rule can be overridden locally."*
//
// Both items end with the same sentence, and the handoff says to build them on
// one mechanism. They are: `#הגדרות_מספור(אפס_לפי: N)` states the level,
// `#התחל_מספור()` and `#המשך_מספור()` are the two hand-placed overrides, and
// **the prelude reads them for the notes while this module reads them for the
// simanim**. What differs is only what is being counted.
//
// The engine's half is `engine/tests/renumbering.rs`, which asserts against what
// printed. This is the editor's half: the numeral a siman carries is written
// into the source by hand — that is what a siman *is* — so here the assertion is
// about characters in the document.
//
// # The shape of the risk
//
// Renumbering rewrites characters the writer typed, so most of what follows is
// about what must **not** move. A siman is itself a heading at level 1, so a
// rule that let any heading restart the count would have every siman restart
// the siman count and the sefer would read א׳ א׳ א׳ — which is the defect
// `continueSeries` was written to end, arriving from the other direction.

import { check } from "./harness.mjs";
import { outOfSequence, resequence, restartLevel, restarts } from "../.tmp-test/numbering.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC = path.join(dirOf(import.meta.url), "..", "src");
const MAIN = readFileSync(path.join(SRC, "main.ts"), "utf8");
const PRELUDE = readFileSync(
  path.join(dirOf(import.meta.url), "..", "..", "engine", "typst", "ksav.typ"),
  "utf8",
);

/** A document, written as lines so no escape has to survive a quote. */
const doc = (...lines) => lines.join("\n") + "\n";

export async function run() {
  // ----------------------------------------------------- reading the level

  {
    check("a document that says nothing restarts nothing", restartLevel(doc("#סימן[א׳][א]")), null);
    check(
      "the level is read out of the document",
      restartLevel(doc("#הגדרות_מספור(אפס_לפי: 1)", "#כותרת1[פרק]")),
      1,
    );
    // `none` is a written answer and not a missing one. A reader that returned
    // a number for it would restart a count the writer switched off in words.
    check(
      "none is never",
      restartLevel(doc("#הגדרות_מספור(אפס_לפי: none)", "#כותרת1[פרק]")),
      null,
    );
    // A sefer written in English says it in English and means the same thing.
    check(
      "the English spelling says the same thing",
      restartLevel(doc("#numbering_config(restart_by: 2)")),
      2,
    );
  }

  // ------------------------------------------------ the count starts again

  {
    const d = doc("#סימן[א׳][א]", "#סימן[ב׳][ב]", "#סימן[ג׳][ג]");
    check("a sefer that says nothing counts straight through", outOfSequence(d), []);
  }

  {
    const d = doc(
      "#הגדרות_מספור(אפס_לפי: 1)",
      "#כותרת1[פרק א]",
      "#סימן[א׳][א]",
      "#כותרת1[פרק ב]",
      "#סימן[ב׳][ב]",
    );
    const wrong = outOfSequence(d);
    check("a chapter starts the count again", wrong.length, 1);
    check("...at one", wrong[0].wanted, "א׳");
    check("...and the resequence writes it", resequence(d).text.includes("#סימן[א׳][ב]"), true);
  }

  {
    // The refusal that keeps the whole thing usable.
    const d = doc("#הגדרות_מספור(אפס_לפי: 1)", "#סימן[א׳][א]", "#סימן[ב׳][ב]");
    check("a siman does not restart its own count", outOfSequence(d), []);
  }

  {
    const d = doc("#הגדרות_מספור(אפס_לפי: 1)", "#כותרת1[פרק]", "#סימן[א׳][א]", "#כותרת2[חלק]", "#סימן[ב׳][ב]");
    check("a deeper heading is not the level that was asked for", outOfSequence(d), []);
  }

  // ----------------------------------------------- the two hand-placed ones

  {
    const d = doc("#סימן[א׳][א]", "#התחל_מספור()", "#סימן[ב׳][ב]");
    const wrong = outOfSequence(d);
    check("an explicit restart needs no setting at all", wrong.length, 1);
    check("...and starts at one", wrong[0].wanted, "א׳");
  }

  {
    // The half that makes an automatic rule safe to have: a rule the writer
    // cannot override where it is wrong is a rule they turn off entirely.
    const d = doc(
      "#הגדרות_מספור(אפס_לפי: 1)",
      "#כותרת1[פרק א]",
      "#סימן[א׳][א]",
      "#כותרת1[פרק ב]",
      "#המשך_מספור()",
      "#סימן[ב׳][ב]",
    );
    check("continuing carries the count through the chapter", outOfSequence(d), []);
  }

  {
    const d = doc(
      "#הגדרות_מספור(אפס_לפי: 1)",
      "#כותרת1[פרק א]",
      "#סימן[א׳][א]",
      "#כותרת1[פרק ב]",
      "#סימן[ב׳][ב]",
    );
    const marks = restarts(d, { names: ["סימן", "siman"], resetBy: [], first: "א׳" });
    // Two, and both are real: the first chapter heading restarts a count that
    // is already nought, which costs nothing and is the honest answer. A rule
    // that skipped it would be a rule with a special case at the top of the
    // document, which is where special cases go wrong.
    check("every chapter heading is a restart", marks.length, 2);
    check("...and they come back in document order", marks[0].at < marks[1].at, true);
    check("...each of them a restart rather than a continue", marks[1].kind, "restart");
  }

  {
    // Se'if still restarts inside each siman — the nesting it always had. The
    // new rule is an addition; a fence that tested only the new one would not
    // notice the old one going.
    const d = doc(
      "#סימן[א׳][א]",
      "#סעיף[א][x]",
      "#סעיף[ב][y]",
      "#סימן[ב׳][ב]",
      "#סעיף[א][z]",
    );
    check("a se'if still counts from one inside each siman", outOfSequence(d), []);
  }

  // --------------------------------------- one mechanism, said in one place

  {
    // The claim the handoff asked for, and the only way to hold it from here:
    // the two commands this module reads are the two the prelude reads, spelled
    // the same. A second vocabulary for the same idea is the shape this
    // repository keeps producing and the reason the sweep exists.
    for (const cmd of ["התחל_מספור", "המשך_מספור", "הגדרות_מספור"]) {
      check(`the prelude knows ${cmd}`, PRELUDE.includes(`#let ${cmd}(`), true);
    }
    check("...and the level is spelled the same on both sides", PRELUDE.includes("אפס_לפי:"), true);
  }

  // ------------------------------------------ delete and move, at last

  {
    // > *"Renumber automatically on delete and on move."*
    //
    // Neither is an insertion, so neither has a moment where this application
    // is asked a question: a writer deletes a siman by selecting it and
    // pressing a key, and drags one by cut and paste. The document is watched
    // instead of the gesture — which is also the honest shape for a sefer
    // opened from a file, or edited by somebody else, or merged.
    check("the document is watched, not the gesture", /scheduleRenumber\(\);/.test(MAIN), true);
    check(
      "...on every change",
      /if \(u\.docChanged\)[\s\S]{0,1600}scheduleRenumber\(\)/.test(MAIN),
      true,
    );
    check(
      "...and the wait is long enough not to fight a writer mid-numeral",
      /RENUMBER_DEBOUNCE_MS = 1000/.test(MAIN),
      true,
    );
  }

  {
    // Two refusals, both about not fighting the writer: a selection over a
    // number being rewritten is an edit in progress, and a caret inside one is
    // somebody typing that numeral — the one case where the document is out of
    // order on purpose.
    check(
      "an edit in progress is left alone",
      /function renumberNow\(\)[\s\S]{0,900}sel\.from <= n\.to && sel\.to >= n\.from/.test(MAIN),
      true,
    );
    check(
      "...and it can be switched off",
      /function renumberNow\(\)[\s\S]{0,400}settings\.renumberAuto === false/.test(MAIN),
      true,
    );
    // Software that rewrites the writer's own characters and says nothing is
    // software the writer cannot trust, however right it is.
    check(
      "and it says that it happened",
      /function renumberNow\(\)[\s\S]{0,1200}settings\.renumberReport !== false[\s\S]{0,120}renumbered/.test(
        MAIN,
      ),
      true,
    );
    check("both are rows in the settings", /checkRow\("renumberAuto", "renumberAuto"\)/.test(MAIN), true);
    check(
      "...and reporting is its own question",
      /checkRow\("renumberReport", "renumberReport"\)/.test(MAIN),
      true,
    );
  }
}
