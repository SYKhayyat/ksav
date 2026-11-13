// What a control is called, when the row around it cannot say.
//
// # The report (#178)
//
// Six controls were named in the issue as having no accessible name: the find
// box, the command palette, the help search, and three in the settings drawer.
// Measured in the assembled application there were **nine**, and the three the
// issue had not found were the ones that showed it was a class rather than a
// list:
//
//   - the settings drawer's two text areas (custom commands, snippets), built as
//     a `<div>` with a `<span>` caption — which *looks* labelled, and is not;
//   - `#palette-input`, one keystroke away from `#find-query` in the same file;
//   - and, later, twelve unnamed selects in the styles panel: the per-level
//     numbering rows, whose only caption is the digit `2` beside them, and the
//     unit half of every size control, which announced itself as the number
//     half did.
//
// # Three instruments, and why it takes three
//
//   1. **A placeholder is not a name** — executable as a source prohibition
//      (`prohibitions.test.mjs`), because every one of the nine showed a
//      placeholder and none of them carried a name. That rule covers a control
//      built as a literal.
//   2. **A `<label>` around the control is a name** — correct HTML, invisible to
//      a source scan, and the shape the rest of this product uses. It is
//      measured where it can be measured: `.github/scripts/acceptance.mjs` step
//      8 asks every surface it opens whether any visible control on it is
//      nameless.
//   3. **A composite control** — one value rendered as two or three inputs — is
//      neither of those. Each part has to be named *on its own*, and the name
//      cannot come from the row, because the row names the value and not the
//      part. That is this file.
//
// The third is the one that produced the worst of the nine: `sizeControl` gave
// its number box "Size" and its unit box nothing at all, so a screen reader
// offered two controls, one called Size and one called nothing, for one value.

import { check, ok, installChrome } from "./harness.mjs";
import { sizeControl, levelsControl, regionHeightControl } from "../.tmp-test/stylecontrols.mjs";

const CONTROL = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/** Every form control inside a built node, with the name it carries. */
function controls(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (CONTROL.has(node.tagName)) {
    out.push({
      tag: node.tagName,
      name: (node["aria-label"] ?? "").trim(),
      by: (node["aria-labelledby"] ?? "").trim(),
    });
  }
  for (const c of node.children ?? []) controls(c, out);
  return out;
}

const silent = (built) => controls(built).filter((c) => !c.name && !c.by);

export async function run() {
  // Whatever `document` was before this file is what it must be after it —
  // asserted by identity, not by absence. A suite where another test left one
  // installed is not a suite this file may disturb, and `installChrome` already
  // saves and restores the descriptor; this is the check that it did.
  const before = globalThis.document;
  const chrome = installChrome();

  // --------------------------------------------------------------- one value, two boxes
  {
    const size = sizeControl("115%", () => {});
    const parts = controls(size);
    check("a size is three controls", parts.length, 2);
    check("…and every one of them is named", silent(size), []);
    ok(
      "…and the two names are different",
      parts[0].name !== parts[1].name,
      `${parts[0].name} / ${parts[1].name}`,
    );
  }

  {
    const height = regionHeightControl("2cm", () => {});
    check("a region height is two controls", controls(height).length, 2);
    check("…and every one of them is named", silent(height), []);
  }

  // --------------------------------------------------------------- a row of rows
  //
  // Three selects whose only visible caption is the digit beside them. "2" is a
  // number, not a name, and three controls cannot share one name either: a screen
  // reader reading out "Level, Level, Level" is a control the writer cannot tell
  // from its siblings.
  {
    const levels = levelsControl("1.א.i.", () => {});
    const parts = controls(levels);
    check("the numbering control is one select per level", parts.length, 3);
    check("…and none of them is silent", silent(levels), []);
    check(
      "…and each says which level it is",
      parts.map((p) => p.name.replace(/^.*?\s/u, "")),
      ["1", "2", "3"],
    );
  }

  chrome.restore();
  ok("the document this file installed is gone again", globalThis.document === before);
}
