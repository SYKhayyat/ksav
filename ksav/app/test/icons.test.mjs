// The shell's icons (`docs/ui-architecture.md` §10).
//
// What can go wrong with an icon table is quiet: a name Tabler renamed, a custom
// id with a typo, a drawing that is filled when the set is stroked. Each draws as
// an empty square, and nobody notices until a screenshot. So: every id names a
// drawing, ours are on Tabler's grid, and `icon()` builds a decorative `<svg>`.

import { check, ok, installChrome } from "./harness.mjs";
import { ICON_OF, UI_ICONS, hasIcon, iconNodes, icon } from "../.tmp-test/icons.mjs";
import { KSAV_ICONS } from "../.tmp-test/icons-ksav.mjs";
import { TABLER } from "../.tmp-test/icons.gen.mjs";

export async function run() {

{
  const all = [...Object.values(ICON_OF), ...Object.values(UI_ICONS)];
  check("every icon id names a drawing", all.filter((id) => !hasIcon(id)), []);
  const used = new Set(all.filter((id) => id.startsWith("ksav:")).map((id) => id.slice(5)));
  check("every custom drawing is used", Object.keys(KSAV_ICONS).filter((k) => !used.has(k)), []);
  const tabler = new Set(all.filter((id) => !id.startsWith("ksav:")));
  check("only the Tabler icons in use are copied", Object.keys(TABLER).filter((k) => !tabler.has(k)), []);
}

{
  // Tabler's grid: 24 units, nothing filled, nothing past the edge.
  const bad = [];
  for (const [name, nodes] of Object.entries(KSAV_ICONS)) {
    for (const [tag, a] of nodes) {
      if (!["path", "circle", "line", "rect"].includes(tag)) bad.push(`${name}: <${tag}>`);
      if (a.fill || a.stroke || a["stroke-width"]) bad.push(`${name}: styles itself`);
      for (const n of (a.d ?? "").match(/-?\d+(\.\d+)?/g) ?? []) {
        if (Math.abs(Number(n)) > 24) bad.push(`${name}: ${n} is off the grid`);
      }
    }
  }
  check("our drawings are on Tabler's grid and style nothing", bad, []);
}

{
  const chrome = installChrome();
  const svg = icon("bold", 20);
  const attr = (k) => svg[k];
  check("an icon is the size asked", [attr("width"), attr("height")], ["20", "20"]);
  check("and decorative: the button carries the name", attr("aria-hidden"), "true");
  check("it draws with the text colour", attr("stroke"), "currentColor");
  check("its children are the drawing", svg.children.length, iconNodes("bold").length);
  ok("a custom icon draws too", icon("ksav:siman").children.length > 0);
  chrome.restore();
}

}
