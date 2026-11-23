// The writer's own ribbon, as data (#233, step 7; `docs/ui-architecture.md` §8, §10).
//
// What is held here — the §10 fences that are about `RibbonLayout`:
//
//   1. the shape names no menu, so no layout can hide a command;
//   2. a stored layout is read part by part, and `readShell` keeps it whole
//      across a JSON round trip, drawing the same ribbon after as before;
//   3. the default layout draws exactly §5;
//   4. a saved ribbon survives a version that removes actions (dropped, never a
//      throw) and one that adds them (placed in their default group, or behind
//      a kept tab's `⋯` when their tab was deleted; never dropped);
//   5. a ribbon with every tab deleted still leaves a working `☰ תפריט`;
//   6. export → import round-trips, and an import with unknown ids loads and
//      says how many; nothing in a file is run;
//   7. the renderer draws a layout: a renamed tab, a user tab, a hidden tab, a
//      merged tab the caret's context still finds, a pinned user tab.

import { check, ok, notOk, installChrome, fakeView } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";
import { commands } from "../tools/commands.mjs";
import * as runtime from "../.tmp-test/runtime.mjs";
import { settings } from "../.tmp-test/settings.mjs";
import { SHELL_DEFAULTS, readShell, readRibbon } from "../.tmp-test/shellsettings.mjs";
import { placed, tabTree } from "../.tmp-test/placement.mjs";
import {
  defaultLayout,
  exportLayout,
  fromOf,
  importLayout,
  layoutTree,
  migrate,
  shownTabs,
  tabName,
} from "../.tmp-test/ribbonlayout.mjs";
import { buildPinnedTab, buildRibbon, menuToggle, setContext } from "../.tmp-test/shelltabs.mjs";

const src = (f) => readFileSync(path.join(dirOf(import.meta.url), "..", "src", f), "utf8");
const ids = (g) => ({ group: g.group, face: g.face.map((a) => a.id), more: g.more.map((a) => a.id), gear: g.gear.map((a) => a.id) });
const shape = (tabs) => tabs.map((n) => ({ tab: n.tab, groups: n.groups.map(ids) }));
const dom = (e) => JSON.stringify(e, (k, v) => (k === "parentNode" || k === "listeners" ? undefined : v));

export async function run() {
  // ------------------------------------------------- 1. no menu
  const s = src("shellsettings.ts");
  const types = s.slice(s.indexOf("export interface RibbonItem"), s.indexOf("const ID ="));
  ok("the ribbon's types are where the fence looks", types.includes("export interface RibbonLayout"));
  notOk("no RibbonLayout field can name a menu", /\bmenu\w*\??\s*:/i.test(types));
  notOk("and readRibbon reads none", /\.menu\b/.test(s.slice(s.indexOf("export function readRibbon"))));

  // ------------------------------------------------- the list
  installChrome();
  runtime.setView(fakeView("שלום"));
  const reg = commands();
  runtime.setRegistries(reg, []);
  const { BUILT_IN } = await import("../.tmp-test/actionsurface.mjs");
  const list = placed({ builtIns: BUILT_IN.map((a) => a.id), commands: reg, macros: [], styles: [] });

  // ------------------------------------------------- 2. reading
  for (const junk of [undefined, null, 7, "x", [], {}, { version: 2, tabs: [] }, { version: 1, tabs: "no" }]) {
    check(`a stored ${JSON.stringify(junk)} is no ribbon`, readRibbon(junk), undefined);
  }
  check(
    "a bad part costs only that part",
    readRibbon({
      version: 1,
      known: ["bold", 7, "bold"],
      tabs: [
        { id: "home", hidden: "yes", groups: [{ id: "font", items: [{ action: "bold", face: true }, { face: true }, "x", { action: "bold" }] }, { id: 5 }] },
        { id: "Bad Id!", groups: [] },
        { id: "home", groups: [] },
        { id: "user:k1", name: "  קונטרס  ", from: ["notes", 3], groups: "none" },
      ],
    }),
    {
      version: 1,
      tabs: [
        { id: "home", groups: [{ id: "font", items: [{ action: "bold", face: true }] }] },
        { id: "user:k1", from: ["notes"], name: "קונטרס", groups: [] },
      ],
      known: ["bold"],
    },
  );
  const def = defaultLayout(list);
  check("readShell keeps a ribbon", readShell({ ribbon: def }).ribbon, def);
  check("and a JSON round trip keeps it", readShell(JSON.parse(JSON.stringify({ ribbon: def }))).ribbon, def);
  ok("a junk ribbon is no ribbon, not an error", !("ribbon" in readShell({ ribbon: { version: 9 } })));
  check("toolbarTab may pin a user tab", readShell({ toolbarTab: "user:k1" }).toolbarTab, "user:k1");

  // ------------------------------------------------- 3. the default
  check("the default layout draws §5", shape(layoutTree(def, list)), shape(tabTree(list).filter((n) => n.groups.length)));
  check("no ribbon is the default too", shape(shownTabs(undefined, list)), shape(tabTree(list)));
  check("it knows every action", new Set(def.known).size, list.length);
  check("every built-in tab is itself", def.tabs.map(fromOf), def.tabs.map((t) => [t.id]));

  // ------------------------------------------------- 4. versions
  // A version that removes an action: the layout names it, the list does not.
  const gone = "cmd:no-such-command";
  const older = structuredClone(def);
  older.tabs[1].groups[0].items.unshift({ action: gone, face: true });
  older.known.push(gone);
  let m;
  try {
    m = migrate(older, list);
  } catch (e) {
    m = null;
    ok(`loading an unknown id never throws (${e})`, false);
  }
  check("a removed action is dropped", m.dropped, [gone]);
  notOk("from the layout", JSON.stringify(m.layout).includes(gone));
  check("and from what is known", m.layout.known.includes(gone), false);

  // A version that adds one: the saved layout did not know it.
  const insertTab = def.tabs.find((t) => t.id === "insert");
  const fresh = insertTab.groups[0].items[0];
  const before = structuredClone(def);
  before.known = before.known.filter((k) => k !== fresh.action);
  for (const t of before.tabs) for (const g of t.groups) g.items = g.items.filter((i) => i.action !== fresh.action);
  // …and the writer has renamed Insert and moved its first group to the end.
  const ins = before.tabs.find((t) => t.id === "insert");
  ins.name = "הכנסה שלי";
  ins.groups.push(ins.groups.shift());
  m = migrate(before, list);
  const back = m.layout.tabs.find((t) => t.id === "insert").groups.find((g) => g.id === insertTab.groups[0].id);
  ok("a new action is placed", m.added.includes(fresh.action));
  check("in its default group, with its default face", back.items.at(-1), fresh);
  check("and the writer's order is kept", m.layout.tabs.find((t) => t.id === "insert").groups.at(-1).id, insertTab.groups[0].id);
  check("migrating twice is migrating once", migrate(m.layout, list).added, []);

  // …in a merged tab: the one whose `from` lists its default tab.
  const merged = structuredClone(before);
  const homeT = merged.tabs.find((t) => t.id === "home");
  const insT = merged.tabs.find((t) => t.id === "insert");
  homeT.from = ["home", "insert"];
  homeT.groups.push(...insT.groups);
  merged.tabs = merged.tabs.filter((t) => t !== insT);
  m = migrate(merged, list);
  ok("a merged tab takes its sources' new actions", JSON.stringify(m.layout.tabs.find((t) => t.id === "home")).includes(`"${fresh.action}"`));

  // …when its tab was deleted: behind the `⋯` of a tab the writer kept.
  const deleted = structuredClone(before);
  deleted.tabs = deleted.tabs.filter((t) => t.id !== "insert");
  deleted.tabs[0].hidden = true;
  m = migrate(deleted, list);
  const kept = m.layout.tabs[1];
  ok("never dropped when its tab is gone", m.added.includes(fresh.action));
  check("behind the ⋯ of the first tab still shown", kept.groups.at(-1).items.find((i) => i.action === fresh.action), {
    action: fresh.action,
    face: false,
  });

  // ------------------------------------------------- 5. every tab deleted
  const empty = { version: 1, tabs: [], known: def.known };
  check("an empty ribbon draws no tabs", shownTabs(empty, list), []);
  const shellBefore = settings.shell;
  try {
    settings.shell = { ...SHELL_DEFAULTS, variant: "tabs", ribbon: empty };
    const r = buildRibbon();
    check("the strip is empty but drawn", r.children[0].children.length, 0);
    const bar = { setAttribute(k, v) { this[k] = v; } };
    const toggle = menuToggle(bar);
    toggle.click();
    check("and ☰ still opens the menus", bar["data-folded"], "open");
    const header = src("appheader.ts");
    ok("☰ does not depend on the ribbon", /const folded = variant === "tabs" && shell\.menubar === "auto";/.test(header));
    settings.shell = { ...SHELL_DEFAULTS, variant: "toolbar", ribbon: empty };
    check("a pinned toolbar on an empty ribbon draws nothing, without throwing", buildPinnedTab().children.length, 0);

    // ----------------------------------------------- 7. the renderer
    const mine = structuredClone(def);
    mine.tabs.find((t) => t.id === "insert").name = "הכנסה שלי";
    mine.tabs.find((t) => t.id === "view").hidden = true;
    const tableT = mine.tabs.find((t) => t.id === "table");
    mine.tabs.unshift({
      id: "user:k1",
      name: "קונטרס",
      from: ["table"],
      groups: [{ id: "user:g1", name: "סימנים", items: [{ action: "footnote", face: true }, { action: "bold", face: false }] }, ...tableT.groups],
    });
    mine.tabs = mine.tabs.filter((t) => t !== tableT);
    settings.shell = { ...SHELL_DEFAULTS, variant: "tabs", ribbon: mine };
    setContext(null);
    const rib = buildRibbon();
    const strip = rib.children[0];
    const names = strip.children.map((b) => b.children[0]);
    ok("a user tab is drawn with its name", names.includes("קונטרס"));
    ok("a renamed tab with the writer's name", names.includes("הכנסה שלי"));
    notOk("a hidden tab is not drawn", strip.children.some((b) => b["data-tab"] === "view"));
    strip.children.find((b) => b["data-tab"] === "user:k1").click();
    const panel = rib.children[1];
    const g1 = panel.children.find((g) => g["data-group"] === "user:g1");
    check("a user group carries its name", g1["aria-label"], "סימנים");
    ok("with its face", dom(g1).includes('"data-action":"footnote"'));
    ok("and its ⋯", dom(g1).includes('"data-menu":"more-user:g1"'));
    check("a built-in tab not renamed follows lang", tabName({ tab: "home" }), tabName(shownTabs(undefined, list)[0]));

    // A hidden tab is hidden everywhere: the pin and the caret do not bring it back.
    const hid = structuredClone(mine);
    hid.tabs.find((t) => t.id === "home").hidden = true;
    settings.shell = { ...SHELL_DEFAULTS, variant: "toolbar", toolbarTab: "home", ribbon: hid };
    notOk("a pinned toolbar does not draw a hidden tab", buildPinnedTab()["data-tab"] === "home");
    settings.shell = { ...SHELL_DEFAULTS, variant: "tabs", ribbon: mine };

    strip.children.find((b) => b["data-tab"] === "home").click();
    setContext("table");
    check("Table merged into a user tab: the caret still finds it", strip.children.find((b) => b["aria-selected"] === "true")["data-tab"], "user:k1");
    setContext(null);
    check("and gives Home back", strip.children.find((b) => b["aria-selected"] === "true")["data-tab"], "home");

    settings.shell = { ...SHELL_DEFAULTS, variant: "toolbar", toolbarTab: "user:k1", ribbon: mine };
    check("the toolbar can pin a user tab", buildPinnedTab()["data-tab"], "user:k1");
    settings.shell = { ...SHELL_DEFAULTS, variant: "toolbar", toolbarTab: "table", ribbon: mine };
    check("and pinning Table finds where Table went", buildPinnedTab()["data-tab"], "user:k1");

    // ----------------------------------------------- 2. persists, same DOM
    settings.shell = { ...SHELL_DEFAULTS, variant: "tabs", ribbon: mine };
    const drawn = dom(buildRibbon());
    settings.shell = readShell(JSON.parse(JSON.stringify(settings.shell)));
    check("a stored ribbon restores the same DOM", dom(buildRibbon()), drawn);
    buildRibbon().children[0].children.find((b) => b["data-tab"] === "home")?.click();
  } finally {
    settings.shell = shellBefore;
    setContext(null);
    // The open tab is module state: hand Home back to the files that follow.
    settings.shell = { ...SHELL_DEFAULTS, variant: "tabs" };
    buildRibbon().children[0].children.find((b) => b["data-tab"] === "home").click();
    settings.shell = shellBefore;
  }

  // ------------------------------------------------- 6. import / export
  const file = exportLayout(renamed());
  function renamed() {
    const l = structuredClone(def);
    l.tabs[0].name = "בית שלי";
    return l;
  }
  const im = importLayout(file, list);
  check("export → import round-trips", im.ok && im.layout, readRibbon(renamed()));
  check("with nothing unknown", im.unknown, 0);
  const foreign = JSON.parse(file);
  foreign.tabs[0].groups[0].items.push({ action: "cmd:rm -rf", face: true }, { action: "fromTheFuture", face: false });
  const im2 = importLayout(JSON.stringify(foreign), list);
  ok("an import with unknown ids loads", im2.ok);
  check("and says how many", im2.unknown, 2);
  notOk("which are dropped, never run", JSON.stringify(im2.layout).includes("rm -rf"));
  check("not JSON is said", importLayout("{", list), { ok: false, reason: "notJson" });
  check("JSON that is not a ribbon is said", importLayout(JSON.stringify(def), list), { ok: false, reason: "notRibbon" });
  ok("an import only parses", !/\b(eval|Function|runPlaced|run)\(/.test(src("ribbonlayout.ts")));
}
