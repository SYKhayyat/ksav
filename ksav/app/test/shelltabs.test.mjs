// The tab strip drawn from the placements (#233, step 4; `docs/ui-architecture.md` §4–§6).
//
// Two halves. `tabTree` is pure and says what each tab holds: the §5 tabs in
// order, Home from `HOME`, no face wider than `MAX_FACE`, no `*_config` command
// on a face, and nothing on a tab that has no menu row. `buildRibbon` draws it:
// a `tablist` with one tab in the tab order, a panel of groups each ending in
// `⋯` / `⚙`, and every button named in the interface language.

import { check, ok, installChrome, fakeView } from "./harness.mjs";
import { commands } from "../tools/commands.mjs";
import { HOME, MAX_FACE, TABS, menuTree, placed, tabOf, tabTree } from "../.tmp-test/placement.mjs";
import { buildRibbon, faceLabel, menuToggle, stepTab } from "../.tmp-test/shelltabs.mjs";
import { setRegistries, setView } from "../.tmp-test/runtime.mjs";
import { t } from "../.tmp-test/i18n.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const src = (f) => readFileSync(path.join(dirOf(import.meta.url), "..", "src", f), "utf8");

export async function run() {
  const { BUILT_IN } = await import("../.tmp-test/actionsurface.mjs");
  const reg = commands();
  const list = placed({
    builtIns: BUILT_IN.map((a) => a.id),
    commands: reg,
    macros: [],
    styles: [{ id: "style:a", name: "a" }],
  });
  const tree = tabTree(list);

  // ------------------------------------------------ the tree
  check("one node per tab, in order", tree.map((n) => n.tab), [...TABS]);
  for (const n of tree) ok(`the ${n.tab} tab has groups`, n.groups.length > 0);

  const all = tree.flatMap((n) => n.groups.flatMap((g) => [...g.face, ...g.more, ...g.gear]));
  const inMenus = new Set(menuTree(list).flatMap((m) => m.groups.flatMap((g) => g.items.map((a) => a.id))));
  check("every tab button has a menu row (§3: a tab is never a home)", all.filter((a) => !inMenus.has(a.id)).map((a) => a.id), []);
  for (const n of tree) {
    for (const g of n.groups) {
      ok(`${n.tab}/${g.group}: at most ${MAX_FACE} on the face`, g.face.length <= MAX_FACE);
      check(`${n.tab}/${g.group}: no config command on the face`, g.face.filter((a) => a.gear).map((a) => a.id), []);
      check(`${n.tab}/${g.group}: ⚙ holds only config commands`, g.gear.filter((a) => !a.gear).map((a) => a.id), []);
      if (n.tab !== "home") {
        check(
          `${n.tab}/${g.group}: every action is on its own tab`,
          [...g.face, ...g.more, ...g.gear].filter((a) => tabOf(a.place) !== n.tab).map((a) => a.id),
          [],
        );
      }
    }
  }
  const home = tree.find((n) => n.tab === "home");
  check("Home's groups are HOME's, in order", home.groups.map((g) => g.group), HOME.map((h) => h.group));
  const homeFont = home.groups.find((g) => g.group === "font");
  check("Home ▸ Font's face is bold first", homeFont.face[0]?.command?.he, "הדגשה");
  check("Home ▸ Styles' face is the document's styles", home.groups.find((g) => g.group === "styles").face.map((a) => a.id), ["style:a"]);
  ok("Home has undo on its face", home.groups[0].face.some((a) => a.id === "undo"));
  const table = tree.find((n) => n.tab === "table");
  ok("the Table tab has a ⚙", table.groups.some((g) => g.gear.length > 0));
  ok("the conceal rows are not on a tab", !all.some((a) => a.place.group === "hidden"));

  // ------------------------------------------------ the keys
  const ids = ["home", "insert", "view"];
  check("→ is forward in English", stepTab(ids, "home", "ArrowRight", false), "insert");
  check("← is forward in Hebrew", stepTab(ids, "home", "ArrowLeft", true), "insert");
  check("back from the first wraps", stepTab(ids, "home", "ArrowLeft", false), "view");
  check("End is the last", stepTab(ids, "home", "End", true), "view");
  check("a letter is not a step", stepTab(ids, "home", "a", false), null);

  // ------------------------------------------------ the drawing
  installChrome();
  // The highlighter asks the document its language, so the editor must be well formed.
  setView(fakeView("שלום"));
  setRegistries(reg, []);
  const ribbon = buildRibbon();
  const [strip, panel] = ribbon.children;
  check("the strip is a tablist", strip.role, "tablist");
  check("the panel is a tabpanel", panel.role, "tabpanel");
  check("one tab button per tab", strip.children.map((b) => b["data-tab"]), [...TABS]);
  for (const b of strip.children) {
    check(`the ${b["data-tab"]} tab is named from the catalogue`, b.children, [t("tab." + b["data-tab"])]);
    check(`the ${b["data-tab"]} tab is a tab`, b.role, "tab");
  }
  check("Home is open", strip.children.map((b) => b["aria-selected"]), TABS.map((x) => String(x === "home")));
  check("one tab is in the tab order", strip.children.filter((b) => b.tabindex === "0").length, 1);
  check("Home's panel draws Home's groups", panel.children.map((g) => g["data-group"]), HOME.map((h) => h.group));

  const undo = panel.children[0].children[0].children.find((b) => b["data-action"] === "undo");
  ok("undo is a named face button", undo && typeof undo.children[0] === "string" && undo.children[0].length > 1);
  const font = panel.children.find((g) => g["data-group"] === "font");
  const fontRow = font.children[0].children;
  check("Font: six faces, then ⋯", fontRow.length, 7);
  check("⋯ is the group's last control", fontRow.at(-1)["data-menu"], "more-font");
  ok("⋯ says which group it opens", fontRow.at(-1).children[0]["aria-label"].includes(t("grp.font")));

  strip.children.find((b) => b["data-tab"] === "table").click();
  check("choosing a tab selects it", strip.children.map((b) => b["aria-selected"]), TABS.map((x) => String(x === "table")));
  ok("and draws its groups", panel.children.some((g) => g["data-group"] === "rowscols"));
  const gear = panel.children.flatMap((g) => g.children[0].children).filter((c) => String(c["data-menu"]).startsWith("gear-"));
  ok("the Table tab draws a ⚙", gear.length > 0);
  check("the open tab survives a redraw", buildRibbon().children[0].children.find((b) => b["aria-selected"] === "true")["data-tab"], "table");

  check("a command face reads its short label", faceLabel(list.find((a) => a.command?.he === "שער")), t("btn.שער"));

  // ☰ unfolds the bar and says so.
  const bar = { "data-folded": "folded", setAttribute(k, v) { this[k] = v; } };
  const tog = menuToggle(bar);
  check("☰ is named", tog.children, [t("shellMenuButton")]);
  tog.click();
  check("☰ opens the bar", [bar["data-folded"], tog["aria-expanded"]], ["open", "true"]);
  tog.click();
  check("and folds it again", [bar["data-folded"], tog["aria-expanded"]], ["folded", "false"]);

  // ------------------------------------------------ the header
  const header = src("appheader.ts");
  ok("the tabs shell draws the ribbon", header.includes('variant === "tabs" ? [buildRibbon()] : []'));
  ok("and folds the bar only when menubar is auto", header.includes('variant === "tabs" && shell.menubar === "auto"'));
  ok("only the toolbar shell draws the toolbar", header.includes('variant === "toolbar" ? [buildPinnedTab(), contextRow()] : []'));
}
