// The toolbar is a pinned tab (#233, step 5; `docs/ui-architecture.md` §4, §6).
//
// # What this file used to hold
//
// The toolbar was laid out by hand in `ribbon.ts`, and a writer found the table
// button in the group captioned **Lists** — *"Table is still under lists. That is
// not at all accurate."* This file parsed the hand-written `tbGroup(t("cat.X"),
// [ … ])` calls and checked each button against the registry's categories,
// because the ribbon consulted neither of the places that publish the taxonomy.
//
// # What it holds now
//
// There is no hand-written toolbar left to misfile a button in. The toolbar is
// the tab renderer pinned to one tab (Home by default, `shell.toolbarTab`
// otherwise) with the strip hidden, so its groups are `tabTree`'s, and whether
// an action sits in the right group is a question about placements, which
// `placement.test.mjs` asks. What is asserted here:
//
//   1. `ribbon.ts` lays out no group by hand, and `buildToolbar` is gone;
//   2. the pinned toolbar draws exactly the pinned tab's groups, in order;
//   3. `toolbarTab` pins another tab, and a name that is no tab falls back to Home;
//   4. the table the report was about can still be inserted: it has its own
//      group on the Table tab (its one home, spec §5), never under Lists.

import { check, ok, notOk, installChrome, fakeView } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";
import { commands } from "../tools/commands.mjs";
import * as runtime from "../.tmp-test/runtime.mjs";
import { settings } from "../.tmp-test/settings.mjs";
import { SHELL_DEFAULTS } from "../.tmp-test/shellsettings.mjs";
import { placed, tabTree } from "../.tmp-test/placement.mjs";
import { buildPinnedTab } from "../.tmp-test/shelltabs.mjs";

const RIBBON = readFileSync(path.join(dirOf(import.meta.url), "..", "src", "ribbon.ts"), "utf8");

export async function run() {
  // ------------------------------------------------- 1. nothing by hand
  notOk("ribbon.ts lays out no group by hand", /tbGroup\(/.test(RIBBON));
  notOk("and the hand-built toolbar is gone", /export function buildToolbar\b/.test(RIBBON));

  // ------------------------------------------------- 2. the pinned tab
  installChrome();
  runtime.setView(fakeView("שלום"));
  const reg = commands();
  runtime.setRegistries(reg, []);
  const { BUILT_IN } = await import("../.tmp-test/actionsurface.mjs");
  const tree = tabTree(placed({ builtIns: BUILT_IN.map((a) => a.id), commands: reg, macros: [], styles: [] }));
  const groupsOf = (tab) => tree.find((n) => n.tab === tab).groups.map((g) => g.group);

  const before = settings.shell;
  try {
    settings.shell = { ...SHELL_DEFAULTS };
    const bar = buildPinnedTab();
    check("the toolbar is a toolbar", [bar.role, bar.className], ["toolbar", "toolbar ribbon-pinned"]);
    check("it pins Home by default", bar["data-tab"], "home");
    check("and draws Home's groups, in order", bar.children.map((g) => g["data-group"]), groupsOf("home"));
    ok("with no tab strip above them", !bar.children.some((g) => g.role === "tablist"));

    // ----------------------------------------------- 3. another tab
    settings.shell = { ...SHELL_DEFAULTS, toolbarTab: "insert" };
    const insert = buildPinnedTab();
    check("toolbarTab pins another tab", insert["data-tab"], "insert");
    check("and draws that tab's groups", insert.children.map((g) => g["data-group"]), groupsOf("insert"));

    settings.shell = { ...SHELL_DEFAULTS, toolbarTab: "nowhere" };
    check("a name that is no tab falls back to Home", buildPinnedTab()["data-tab"], "home");

    // ----------------------------------------------- 4. the table
    settings.shell = { ...SHELL_DEFAULTS, toolbarTab: "table" };
    const pinned = buildPinnedTab();
    const where = tree.flatMap((n) =>
      n.groups.filter((g) => g.face.some((a) => a.command?.he === "טבלה")).map((g) => `${n.tab}/${g.group}`),
    );
    ok("a table can be inserted from a tab's face", where.length > 0);
    check("never from a Lists group", where.filter((w) => /list/i.test(w)), []);
    ok(
      "and a toolbar pinned to Table draws it",
      JSON.stringify(pinned, (k, v) => (k === "parentNode" || k === "listeners" ? undefined : v)).includes('"data-command":"טבלה"'),
    );
  } finally {
    settings.shell = before;
  }
}
