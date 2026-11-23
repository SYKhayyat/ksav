// The menu bar drawn from the placements (#233, step 2).
//
// `placement.ts` says where every action lives; `shellmenu.ts` only draws it.
// What is asserted here is the drawing's half of that contract: one menu per
// `MENUS` entry, in that order, each labelled from `menu.<id>` — so a menu
// added to the data is a menu on screen with no second list to update.

import { check, ok } from "./harness.mjs";
import { installChrome } from "./harness.mjs";
import { buildMenus } from "../.tmp-test/shellmenu.mjs";
import { menuTree } from "../.tmp-test/placement.mjs";
import { t } from "../.tmp-test/i18n.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC = readFileSync(path.join(dirOf(import.meta.url), "..", "src", "shellmenu.ts"), "utf8");

export async function run() {
  installChrome();
  const bar = buildMenus({ pages: () => [], templates: () => [] });
  const names = menuTree([]).map((m) => m.menu);

  check("one menu per MENUS entry, in order", bar.map((m) => m["data-menu"]), names);
  for (const m of bar) {
    const btn = m.children[0];
    ok(`the ${m["data-menu"]} menu is named from the catalogue`, btn.children.includes(t("menu." + m["data-menu"])));
  }

  // The identity the acceptance run clicks: every row is its action id.
  ok("a row is data-action=<id>", /"data-action": a\.id/.test(SRC));
  ok("...greyed with its reason on screen", /class: "menu-why"/.test(SRC));
  ok("...and built on open, so the reason is about this caret", /lazyMenu\(menu, t\("menu\." \+ menu\), \(\) => menuItems\(menu, r\)\)/.test(SRC));
}
