// Three list panes that say which is which, and folding that takes a depth.
//
// # Two reports that turn out to be the same one
//
//   - *"The marks pane reads as a second siman/seif outline and gives no
//     indication of what it actually lists. Label it, and make the distinction
//     from the outline visible rather than something the writer has to infer."*
//   - *"Fold-all and unfold-all are all-or-nothing… the same for the siman/seif
//     hierarchy and for lists, each of which has its own nesting. Enumerate
//     every folding surface first and do all of them. A depth chooser on one
//     surface and all-or-nothing on the other two is precisely the failure
//     described above."*
//
// Both are about a surface that has the information and does not offer it. And
// both come with the same instruction attached, which is the one this
// repository exists to be reminded of: **do the siblings**. Labelling only the
// pane that was reported leaves it beside two unlabelled panes it is confused
// with; offering nine depths on the menu and three in the keymap is a chooser
// on one surface.

import { check, ok, notOk } from "./harness.mjs";
import { MAX_LEVEL } from "../.tmp-test/spans.mjs";
import { DEFAULT_KEYS } from "../.tmp-test/bindings.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC = path.join(dirOf(import.meta.url), "..", "src");
const MAIN = readFileSync(path.join(SRC, "main.ts"), "utf8");
const I18N = readFileSync(path.join(SRC, "i18n.ts"), "utf8");

export async function run() {
  // ------------------------------------------------- the three panes say which

  {
    // All three, not the one that was reported. The confusion is *between*
    // them, so a label on one of the three does not resolve it — it just moves
    // which two are indistinguishable.
    for (const [pane, key] of [
      ["marks", "marksPaneLede"],
      ["outline", "outlineLede"],
      ["notes", "notesPaneLede"],
    ]) {
      ok(`the ${pane} pane says what it lists`, new RegExp(`t\\("${key}"\\)`).test(MAIN));
      // In both languages, and as sentences rather than as a repeated heading:
      // "Marks" does not explain itself, which is the whole report.
      const said = [...I18N.matchAll(new RegExp(`${key}: "([^"]+)"`, "gu"))].map((m) => m[1]);
      check(`...in both languages`, said.length, 2);
      for (const s of said) ok(`...at length, not as a word`, s.length > 30, s);
    }
  }

  {
    // And the marks pane says what it is *not*, by name. The report is that it
    // reads as a second outline, so the sentence that fixes it has to mention
    // the outline — a description that could equally describe its neighbour is
    // not a distinction.
    const he = /marksPaneLede: "([^"]+)"/u.exec(I18N)?.[1] ?? "";
    const en = /marksPaneLede: "((?:[^"\\]|\\.)+)"/gu;
    const both = [...I18N.matchAll(en)].map((m) => m[1]);
    ok("the Hebrew names the outline it is not", he.includes("תוכן"));
    ok("...and so does the English", both.some((s) => /outline/i.test(s)));
  }

  // --------------------------------------------------------- folding to a depth

  {
    // Every level the editor can write. Three was the count of *keys somebody
    // had bound*, and it had quietly become the count of depths the product
    // could fold to.
    ok(
      "there is a fold action for every heading level",
      /length: heads\.MAX_LEVEL \}, \(_, i\) => i \+ 1\)\.map\(\(level\) => \(\{\s*\n\s*id: `foldLevel\$\{level\}`/.test(MAIN),
    );
    notOk("...and not a hand-written three", /\.\.\.\[1, 2, 3\]\.map\(\(level\) => \(\{/.test(MAIN));
    // The menu offers all of them too — the surface a writer who does not know
    // the chord actually reaches for.
    ok(
      "the menu offers every level",
      /length: heads\.MAX_LEVEL \}, \(_, i\) => i \+ 1\)\.map\(\(level\) =>\s*\n\s*el\("button"/.test(MAIN),
    );
    ok(`MAX_LEVEL is what both count off`, MAX_LEVEL >= 9);
  }

  {
    // The other nesting, which had nothing. Simanim are headings — `#סימן` is
    // `heading(level: 1, …)` — so the levels above already reach them, and a
    // list's own depth needed its own chooser.
    ok("lists fold to a depth", /function foldListsToDepth\(/.test(MAIN));
    ok("...as actions, so the palette and a key can reach them", /id: `foldListDepth\$\{depth\}`/.test(MAIN));
    ok("...and from the menu", /tf\("foldListDepth", String\(depth\)\)/.test(MAIN));
    // Depth among *lists*, not among all calls: a list inside a footnote inside
    // a heading is still a top-level list to the reader.
    ok(
      "...counting list nesting rather than call nesting",
      /for \(let p = n\.parent; p; p = p\.parent\) if \(p\.role === "list"\) d \+= 1;/.test(MAIN),
    );
    ok("...and it says so when there is nothing to fold", /t\("noListsToFold"\)/.test(MAIN));
  }

  {
    // The fold service is asked for the range rather than a second reckoning of
    // where a list item ends — one authority for "what does this fold", which is
    // the same rule `foldToLevel` already followed.
    ok(
      "the list fold asks the fold service",
      /function foldListsToDepth\([\s\S]{0,1400}state\.facet\(foldService\)/.test(MAIN),
    );
  }

  // ------------------------------------------------------ the whole-construct acts

  {
    // #32's keys, checked here because they are the third surface the same
    // sweep touched: an act with no key is an act only mouse users have.
    for (const id of ["entitySelect", "entityUnwrap", "entityRemove"]) {
      ok(`${id} has a key`, !!DEFAULT_KEYS[id]);
      ok(`...and a name`, new RegExp(`"sc\\.${id}": "`).test(I18N));
    }
    ok("and a menu row each", /t\("entityActs"\)/.test(MAIN));
  }
}
