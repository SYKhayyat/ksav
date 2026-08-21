// Editing a style: from where you see it, at the value you meant, on a key.
//
// # The report
//
// Three complaints, and the handoff is right that they are one mistake wearing
// three coats:
//
//   1. *"There is one edit-styles button that opens an editor for every style at
//      once."* A style could be **applied** from the ribbon dropdown and its
//      formatting could be reached only by applying it to something first and
//      then pressing the pencil beside the dropdown. There was no list of the
//      writer's own styles anywhere, so there was nowhere for a per-style
//      affordance to live.
//   2. *"Each style should be assignable a key combination, and that binding
//      must appear wherever the style appears."* No style had a key, and there
//      was no mechanism by which one could.
//   3. *"The knobs are too coarse."* Size was a dropdown of seven percentages.
//      A writer wanting 105%, or 24pt, could not say so — and the *unit* was
//      not a question the control asked at all.
//
// And underneath them, the level ceiling: the Headings section offered six
// levels because there were six `#הגדרות_כותרתN` doors, while `#כותרת(רמה: 9)`
// has always been writable and levels 7 to 9 are real in the outline, in the
// numbering and in the indent ramp on the page. Six was the count of *named*
// commands, leaked into the styling.
//
// # What is asserted, and why in these two ways
//
// The value half is unit-testable and is unit-tested: a size round-trips
// through both units, an action id round-trips through a style name.
//
// The surface half is read out of `main.ts` as text, which is this
// repository's technique for *"which function got called"* — the defect class
// where a green suite proves nothing, because every one of these complaints was
// about a control that existed, worked, and was offered in one place.

import { check, ok, notOk } from "./harness.mjs";
import * as styles from "../.tmp-test/styles.mjs";
import * as panelviews from "../.tmp-test/panelviews.mjs";
import { MAX_LEVEL } from "../.tmp-test/spans.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
const MAIN = readFileSync(path.join(HERE, "..", "src", "main.ts"), "utf8");
const PRELUDE = readFileSync(
  path.join(HERE, "..", "..", "engine", "typst", "ksav.typ"),
  "utf8",
);
// The **generated** registry and not `commands.rs`. `runner.test.mjs` refuses a
// second reader of the engine's Rust, and it is right to: `facts.gen.json` is
// what the compiler that owns those values produced, and a text scan of the
// table beside it is a second opinion that can only ever be wrong.
import { COMMAND_EN } from "../.tmp-test/engine.gen.mjs";

export async function run() {
  // ------------------------------------------------------- a size, in two units

  {
    // The seven values that used to be the whole control. They still read, and
    // they read as the percentages the dropdown printed — a writer who set 135%
    // last week must not find their style saying something else this week.
    const was = [
      ["0.8em", 80],
      ["0.9em", 90],
      ["1em", 100],
      ["1.15em", 115],
      ["1.35em", 135],
      ["1.6em", 160],
      ["2em", 200],
    ];
    for (const [src, pct] of was) {
      const read = styles.readTextSize(src);
      check(`${src} reads as ${pct}%`, read && `${read.n}${read.unit}`, `${pct}%`);
      check(`...and writes back as ${src}`, styles.writeTextSize(pct, "%"), src);
    }
  }

  {
    // The value the preset list could not say, which is the report.
    check("105% is sayable", styles.writeTextSize(105, "%"), "1.05em");
    check("...and reads back", styles.readTextSize("1.05em")?.n, 105);
    // And the other unit, which the list could not say at all.
    check("an absolute size is sayable", styles.writeTextSize(24, "pt"), "24pt");
    const pt = styles.readTextSize("24pt");
    check("...and reads back as points", pt && `${pt.n}${pt.unit}`, "24pt");
  }

  {
    // Anything that is not a length this control writes is not one it claims to
    // read. A style whose size is `auto`, or a tuple, must come back as "not set
    // here" rather than as a number the control would then write over.
    for (const bad of [undefined, "", "auto", "(1em, 2em)", "1.2", "1.2cm"]) {
      check(`${JSON.stringify(bad)} is not a text size`, styles.readTextSize(bad), null);
    }
  }

  // ------------------------------------------------------- a style is an action

  {
    check("a style's action id names it", styles.styleActionId("שאלה"), "style.שאלה");
    check("...and reads back", styles.styleOfAction("style.שאלה"), "שאלה");
    check("an ordinary action is not a style", styles.styleOfAction("bold"), null);
    // The prefix is the point: a writer may name a style `bold`, and an
    // unprefixed id would have taken over the action that already exists.
    notOk("a style named after an action does not collide", styles.styleActionId("bold") === "bold");
    check("...and still resolves to itself", styles.styleOfAction(styles.styleActionId("bold")), "bold");
  }

  {
    // Being in `actions()` is what makes something bindable, palette-findable
    // and listed in the keys drawer. A second styles-only binding table would
    // have been the one that went stale.
    ok("the document's styles are actions", /\.\.\.styleActions\(\),/.test(MAIN));
    ok(
      "...built from the styles the document actually defines",
      /function styleActions\(\)[\s\S]{0,400}styles\.findCustomStyles\(docTextNow\(\)\)/.test(MAIN),
    );
    ok(
      "...and the keymap is rebuilt when that set changes",
      /levelSel\.dataset\.styles = names;[\s\S]{0,600}reconfigureShortcuts\(\);/.test(MAIN),
    );
    ok(
      "...and a style row in the keys drawer is named, not a raw key",
      /styles\.styleOfAction\(id\)[\s\S]{0,120}tf\("styleActionName"/.test(MAIN),
    );
  }

  // ------------------------------------------- every surface a style appears on

  {
    const kinds = panelviews.STYLE_SECTIONS.map((s) => s.kind);
    ok("the styles panel has a section for the writer's own styles", kinds.includes("mine"));
    check("...and it is the first thing in it", kinds[0], "mine");
    ok("...which the shell fills", /section\.kind === "mine"[\s\S]{0,60}myStyleRows\(\)/.test(MAIN));
    ok(
      "...with one edit affordance per style rather than one for all of them",
      /function myStyleRows\(\)[\s\S]{0,1600}openStyleEditor\(st\.name\)/.test(MAIN),
    );
    ok(
      "...and one chord per style, captured the way every other action is",
      /function myStyleRows\(\)[\s\S]{0,1600}captureShortcut\(id, key\)/.test(MAIN),
    );
  }

  {
    // The ribbon dropdown is the surface the writer already had, and the
    // binding has to appear there too — *"wherever the style appears"*.
    ok(
      "the style dropdown prints the style's chord",
      /custom:\$\{s\.name\}[\s\S]{0,200}hint/.test(MAIN) &&
        /hintFor\(styles\.styleActionId\(s\.name\)\)/.test(MAIN),
    );
    // Through `hintFor`, so a mode that has taken the keyboard prints what to
    // type instead of a chord that now does something else. The application-wide
    // rule is `prohibitions.test.mjs`'s; this is the two new surfaces meeting it.
    notOk("...and no new surface spells a chord itself", /readable\(kb\[/.test(MAIN));
  }

  // ---------------------------------------------------------------- the knobs

  {
    ok("a style has a font", "גופן" in styles.STYLE_FIELDS);
    check("...offered as a font and not as free text", styles.STYLE_FIELDS["גופן"].kind, "font");
    ok("...and a heading has one too", "גופן" in styles.INSTANCE_FIELDS.headings);
    // The engine has to take it, or the control writes an argument that stops
    // the compile. `enginefacts.test.mjs` holds the whole set; this is the one
    // that is new.
    ok(
      "the prelude's #עיצוב takes it",
      /#let עיצוב\(\s*\n\s*body,\s*\n\s*גופן:/u.test(PRELUDE),
    );
    ok("...and so does the headings config", /#let _hd_defaults = \(\s*\n\s*גופן:/u.test(PRELUDE));
  }

  {
    check("size is a typed value, not a preset", styles.STYLE_FIELDS["גודל"].kind, "size-em");
    ok("...drawn as a number and a unit", /function sizeControl\(/.test(MAIN));
    ok("...which the field control reaches for", /case "size-em":\s*\n\s*return sizeControl\(/.test(MAIN));
    // The regression this replaces. Named here so that putting the list back —
    // which is the cheap way to "fix" any complaint about a control — fails.
    notOk("the seven-preset list is gone", MAIN.includes('["1.15em", "115%"]'));
  }

  // ------------------------------------------------------------ the ceiling

  {
    // The fence that makes this stay lifted: a door per level, counted off
    // `MAX_LEVEL` rather than off a list written here. Adding a tenth level to
    // the editor and not to the engine fails this, and so does the reverse.
    for (let n = 1; n <= MAX_LEVEL; n++) {
      ok(`the prelude has a door for level ${n}`, PRELUDE.includes(`#let הגדרות_כותרת${n}(`));
      ok(`...with an English spelling`, PRELUDE.includes(`#let h${n}_config = `));
      ok(`...and the registry knows it`, COMMAND_EN[`הגדרות_כותרת${n}`] === `h${n}_config`);
    }
    check(
      "the engine's ramps are as long as there are levels",
      /#let _hd_levels = (\d+)/u.exec(PRELUDE)?.[1],
      String(MAX_LEVEL),
    );
    ok(
      "the panel offers every level rather than the six that had names",
      /length: heads\.MAX_LEVEL \}, \(_, i\) => \[\s*\n\s*String\(i \+ 1\)/.test(MAIN),
    );
    notOk("...and not a hand-written six", MAIN.includes("...([1, 2, 3, 4, 5, 6].map("));
    ok(
      "...and a ramp written for one level is long enough to hold it",
      /function rampFor\(key: string\)[\s\S]{0,400}heads\.MAX_LEVEL/.test(MAIN),
    );
  }
}
