// The tab strip drawn from the placements (#233, step 4; `docs/ui-architecture.md` §4–§6).
//
// Two halves. `tabTree` is pure and says what each tab holds: the §5 tabs in
// order, Home from `HOME`, no face wider than `MAX_FACE`, no `*_config` command
// on a face, and nothing on a tab that has no menu row. `buildRibbon` draws it:
// a `tablist` with one tab in the tab order, a panel of groups each ending in
// `⋯` / `⚙`, and every button named in the interface language.

import { check, ok, installChrome, fakeView } from "./harness.mjs";
import { commands } from "../tools/commands.mjs";
import { HOME, MAX_FACE, MAX_ICON_FACE, MAX_LARGE, TABS, menuTree, placed, tabOf, tabTree } from "../.tmp-test/placement.mjs";
import { buildRibbon, faceLabel, menuToggle, stepTab, setContext } from "../.tmp-test/shelltabs.mjs";
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
      const sized = (size) => g.face.filter((a) => a.kind !== "style" && (a.place.size ?? "small") === size).length;
      ok(`${n.tab}/${g.group}: at most ${MAX_LARGE} large faces`, sized("large") <= MAX_LARGE);
      ok(`${n.tab}/${g.group}: at most ${MAX_FACE} labelled faces`, sized("large") + sized("small") <= MAX_FACE);
      ok(`${n.tab}/${g.group}: at most ${MAX_ICON_FACE} icon faces`, sized("icon") <= MAX_ICON_FACE);
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
  check("Home ▸ Font leads with the size buttons, then bold", homeFont.face.slice(0, 3).map((a) => a.command?.he), ["גדול", "קטן", "הדגשה"]);
  check("…all of them icon faces", homeFont.face.filter((a) => a.place.size !== "icon").map((a) => a.id), []);
  check(
    "Home ▸ Styles' face is the gallery's door, then the document's styles",
    home.groups.find((g) => g.group === "styles").face.map((a) => a.id),
    ["stylesPanel", "style:a"],
  );
  check("Home leads with the clipboard: paste large, then cut and copy", home.groups[0].face.map((a) => [a.id, a.place.size ?? "small"]), [["paste", "large"], ["cut", "small"], ["copy", "small"]]);
  check("…and ends with find and replace, as Word's Editing does", home.groups.at(-1).face.map((a) => a.id), ["find", "replace"]);
  ok("undo is not on Home: it is Quick Access's", !home.groups.some((g) => g.face.some((a) => a.id === "undo")));
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
  const [head, panel] = ribbon.children;
  const strip = head.children[0];
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

  // A group is its row of lanes, then its foot: the caption and `⚙`.
  const lanesOf = (g) => g.children[0].children;
  const controls = (g) => [...lanesOf(g).flatMap((l) => l.children), ...g.children[1].children.slice(1)];
  const paste = controls(panel.children[0]).find((b) => b["data-action"] === "paste");
  check("paste is a large face", paste?.["data-size"], "large");
  check("…drawn as its icon over its words", [paste?.children[0]?.tagName?.toLowerCase(), paste?.children[1]?.children], ["svg", [t("btn.paste")]]);
  check("Clipboard: paste stands alone, cut and copy stack beside it", lanesOf(panel.children[0]).map((l) => l["data-lane"]), ["large", "small"]);
  const bold = panel.children.flatMap(controls).find((b) => b["data-command"] === "הדגשה");
  check("bold is an icon face, named for the reader that cannot see it", [bold?.["data-size"], bold?.["aria-label"]], ["icon", t("btn.bold")]);
  const font = panel.children.find((g) => g["data-group"] === "font");
  check("Font: the boxes, then one lane of icon faces (§5)", lanesOf(font).map((l) => l["data-lane"]), ["small", "icon"]);
  const boxes = lanesOf(font)[0].children[0];
  check("…the font and size boxes open it", boxes.children.slice(0, 2).map((c) => c.id), ["font-face-box", "font-size-box"]);
  const fontRow = lanesOf(font)[1].children;
  check("…eight of them, then ⋯", fontRow.length, 9);
  check("⋯ is the group's last control", fontRow.at(-1)["data-menu"], "more-font");
  ok("⋯ says which group it opens", fontRow.at(-1).children[0]["aria-label"].includes(t("grp.font")));

  // Table is on the strip only while the caret is in a table (§8).
  const tabBefore = strip.children.find((b) => b["aria-selected"] === "true")["data-tab"];
  setContext("table");
  strip.children.find((b) => b["data-tab"] === "table").click();
  check("choosing a tab selects it", strip.children.map((b) => b["aria-selected"]), TABS.map((x) => String(x === "table")));
  ok("and draws its groups", panel.children.some((g) => g["data-group"] === "rowscols"));
  for (const g of panel.children) {
    ok(`${g["data-group"]}: no small lane holds more than three`, lanesOf(g).every((l) => l["data-lane"] !== "small" || l.children.length <= 3));
    ok(`${g["data-group"]}: a large lane holds one face`, lanesOf(g).every((l) => l["data-lane"] !== "large" || l.children.length === 1));
  }
  const gear = panel.children.flatMap((g) => g.children[1].children).filter((c) => String(c["data-menu"]).startsWith("gear-"));
  ok("the Table tab draws a ⚙", gear.length > 0);
  check("the open tab survives a redraw", buildRibbon().children[0].children[0].children.find((b) => b["aria-selected"] === "true")["data-tab"], "table");
  setContext(null);
  check("out of the table, a redraw is back on the tab before it", buildRibbon().children[0].children[0].children.find((b) => b["aria-selected"] === "true")["data-tab"], tabBefore);

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
  ok("the header draws the ribbon, File at the start of its tab row and ☰ at the end", /^\s*buildRibbon\(\[menuToggle\(menubar\)\], \[fileButton\]\),$/m.test(header));
  ok("and the menu bar folded behind ☰", header.includes('"data-folded": "folded"'));

  const tail = { tagName: "BUTTON", children: [] };
  const withEnd = buildRibbon([tail]);
  check("what the header hands it ends the tab row, before ⌃", withEnd.children[0].children.at(-2), tail);
  ok("⌃ is the row's last control", withEnd.children[0].children.at(-1).className.includes("ribbon-collapse"));
  const lead = { tagName: "BUTTON", children: [] };
  const withStart = buildRibbon([tail], [lead]);
  check("and what it hands first starts it", withStart.children[0].children[0], lead);
}
