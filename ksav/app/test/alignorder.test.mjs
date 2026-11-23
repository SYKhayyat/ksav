// The alignment controls read left → centre → right, everywhere (#136).
//
// # What a writer met
//
// The ribbon group was hand-written —
//
//     tbGroup(t("cat.align"), [b("ימין", "⇥"), b("מרכז", "≡"), b("שמאל", "⇤")])
//
// — and laid out by the page's ordinary flex flow. In a Hebrew interface that put
// left, centre, right on screen, which is right and was an accident: the row
// simply inherited `rtl`. In an English interface the same three buttons
// appeared **right, centre, left** — the right-align button on the left of the
// group — and changing the *document's* direction, which is what a writer tried,
// moved nothing.
//
// # The contract this file holds
//
// One order, defined once: `settings.ALIGN_ORDER` = left, centre, right, a
// *screen* order rather than a reading order. Reading order would mirror the
// group whenever the interface or the document changed direction, so a button
// would move because the writer changed something else; and the glyphs are arrows
// naming edges of a page, which do not mirror with the text they align.
//
// What is asserted:
//
//   1. the order is stated once, and the ribbon's three edges *are* the settings
//      control's three edges (`ALIGN_CHOICES` minus the justified case);
//   2. the paragraph group draws its alignment faces in that order, whatever
//      order `HOME` lists them in (the toolbar is a pinned tab since #233);
//   3. the group carries the class whose row is pinned left-to-right in
//      `styles.css`, and that rule exists and pins the *row* rather than the
//      group (the caption beneath it belongs to the interface's direction).

import { check, notOk, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SRC } from "../tools/paths.mjs";
import { ALIGN_CHOICES, ALIGN_ORDER } from "../.tmp-test/settings.mjs";

const ribbon = readFileSync(path.join(SRC, "ribbon.ts"), "utf8");
const tabs = readFileSync(path.join(SRC, "shelltabs.ts"), "utf8");
const css = readFileSync(path.join(SRC, "styles.css"), "utf8");

/** The align group carries the class the CSS pins. */
const MARKED = /\(aligns \? " tb-align" : ""\)/;

export async function run() {
  // ------------------------------------------------------- the order, once
  check("the screen order is left, centre, right", [...ALIGN_ORDER], ["left", "center", "right"]);
  check(
    "the settings control offers the same three, in the same order",
    ALIGN_CHOICES.filter((c) => c !== "justify"),
    ["left", "center", "right"],
  );
  check("and justified leads, because it is a different question", ALIGN_CHOICES[0], "justify");

  // --------------------------------------------- the ribbon reads it, not a list
  ok("the faces are sorted by the one order", /ALIGN_ORDER\.indexOf\(edge\)/.test(tabs));
  notOk("and no tbGroup types the three buttons out by hand", /tbGroup\(/.test(ribbon));
  // Every edge has a button: a `Record` over the union makes a missing one a type
  // error, and this makes a missing one a failing test as well.
  for (const edge of ALIGN_ORDER) {
    const he = { left: "שמאל", center: "מרכז", right: "ימין" }[edge];
    ok(`the ${edge} edge has a button`, new RegExp(`${edge}: \\{ he: "${he}"`).test(ribbon));
  }

  // -------------------------------------------- and the row cannot be mirrored
  ok(
    "the group is marked" +
      (MARKED.test(tabs) ? "" : "\n    the align group carries no tb-align class"),
    MARKED.test(tabs),
  );
  ok(
    "the row is pinned left-to-right, not inherited" +
      (/\.tb-align \.tb-group-row \{ direction: ltr; \}/.test(css)
        ? ""
        : "\n    styles.css has no `.tb-align .tb-group-row { direction: ltr; }` rule"),
    /\.tb-align \.tb-group-row \{ direction: ltr; \}/.test(css),
  );
  // The *row*, not the group: the caption under the group is interface text and
  // has to read in the interface's direction, which is the whole distinction
  // #122 drew. Pinning `.tb-align` itself would mirror the caption and leave the
  // buttons to be re-derived by whoever reads it next.
  notOk(
    "the caption is left to the interface",
    /\.tb-align \{[^}]*direction/.test(css),
  );
  // …and nothing re-mirrors the row for the other direction, which would make the
  // order depend on the document again.
  notOk("no rule overrides it per direction", /\.tb-align[^{]*direction:\s*rtl/.test(css));
}
