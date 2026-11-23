import { check, ok, notOk, installChrome, fakeView } from "./harness.mjs";
import { commands } from "../tools/commands.mjs";
import * as runtime from "../.tmp-test/runtime.mjs";
import { settings, wireSettingsWrite } from "../.tmp-test/settings.mjs";
import { readShell } from "../.tmp-test/shellsettings.mjs";
import { getLang, setLang, t, tf } from "../.tmp-test/i18n.mjs";
import { currentPlaced } from "../.tmp-test/shellmenu.mjs";
import { defaultLayout, exportLayout } from "../.tmp-test/ribbonlayout.mjs";
import {
  applyImport,
  buttonMenu,
  customizeState,
  listed,
  openCustomize,
  tabMenu,
  treeKey,
  visibleNodes,
  whereLabel,
} from "../.tmp-test/ribboncustomize.mjs";

// The customize drawer and the right-click quick path (#233, step 8; §8).
//
// What `ribbonedit.test` cannot ask: that the drawer is an ARIA tree a keyboard
// can drive in either direction, that every edit lands in `settings.shell` at
// once (so the ribbon above follows), that an import says what it dropped and
// an export says what it wrote, that the floor line is there in both languages,
// and that a right-click on a button or a tab does its one edit with the drawer
// shut.

const walk = (n, f, out = []) => {
  if (n && typeof n === "object") {
    if (f(n)) out.push(n);
    for (const c of n.children ?? []) walk(c, f, out);
  }
  return out;
};
const textOf = (n) => (typeof n === "string" ? n : (n?.children ?? []).map(textOf).join(""));

export async function run() {
  const chrome = installChrome();
  const lang = getLang();
  const shellWas = settings.shell;

  // ---- the DOM the drawer and the popup need, over the harness's.
  const make = document.createElement;
  const mounted = [];
  let focused = null;
  const classes = () => {
    const s = new Set();
    return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) };
  };
  document.createElement = (tag) => {
    const n = make(tag);
    n.style = {};
    n.classList = classes();
    n.focus = () => (focused = n);
    n.remove = () => mounted.includes(n) && mounted.splice(mounted.indexOf(n), 1);
    return n;
  };
  const drawer = { classList: classes() };
  const body = document.createElement("div");
  const byId = document.getElementById;
  document.getElementById = (id) => (id === "ribbon-drawer" ? drawer : id === "ribbon-drawer-body" ? body : byId(id));
  document.querySelectorAll = (sel) => (sel === ".ribbon-menu" ? [...mounted] : []);
  document.body = { append: (n) => mounted.push(n) };
  const urlWas = Object.getOwnPropertyDescriptor(globalThis, "URL");
  chrome.set("URL", { createObjectURL: () => "blob:x", revokeObjectURL() {} });

  const writes = [];
  wireSettingsWrite({ applyChange: (k) => writes.push(k), setPageSetup() {}, rememberConfig() {} });
  runtime.setView(fakeView("שלום"));
  runtime.setRegistries(commands(), []);

  try {
    setLang("he");
    settings.shell = { ...readShell(shellWas) };
    delete settings.shell.ribbon;
    const list = currentPlaced();
    const def = defaultLayout(list);
    const ribbon = () => readShell(settings.shell).ribbon;
    const find = (pred) => walk(body, pred);
    const rc = (k) => find((n) => n["data-rc"] === k)[0];

    // ------------------------------------------------- the door
    openCustomize();
    ok("the door opens the drawer", drawer.classList.contains("open"));
    check("on §5 when the writer has no ribbon", customizeState().layout, def);
    notOk("which is not theirs yet", customizeState().custom);
    check("nothing is written by opening", ribbon(), undefined);
    check("the floor line is there, in Hebrew", textOf(rc("floor")), t("rcFloor"));
    ok("and says the menus stay", /תפריט/.test(textOf(rc("floor"))));
    const tree = find((n) => n.role === "tree")[0];
    ok("the writer's ribbon is an ARIA tree", !!tree);
    check("its tabs are level-1 treeitems", walk(tree, (n) => n.role === "treeitem" && n["aria-level"] === "1").length, def.tabs.length);
    check("exactly one is in the tab order", walk(tree, (n) => n.role === "treeitem" && n.tabindex === "0").length, 1);
    ok("every command is a listbox option", find((n) => n.role === "option").length >= def.known.length);
    check("Reset all is off with nothing to reset", rc("resetAll").disabled, "disabled");

    // ------------------------------------------------- the keyboard, RTL
    const home = def.tabs[0];
    const g0 = home.groups[0];
    const s = () => customizeState();
    check("the first tab is selected", s().sel, { tab: home.id });
    ok("← opens a tab in Hebrew", treeKey({ key: "ArrowLeft", altKey: false }) && s().expanded.has(home.id));
    check("and aria-expanded says so", walk(body, (n) => n.role === "treeitem" && n["aria-selected"] === "true")[0]["aria-expanded"], "true");
    check("focus follows the selection", focused?.["data-node"], walk(body, (n) => n["aria-selected"] === "true")[0]["data-node"]);
    treeKey({ key: "ArrowLeft", altKey: false });
    check("← again goes into it", s().sel, { tab: home.id, group: g0.id });
    treeKey({ key: "ArrowRight", altKey: false });
    check("→ goes back out", s().sel, { tab: home.id });
    treeKey({ key: "ArrowRight", altKey: false });
    notOk("→ on an open tab closes it", s().expanded.has(home.id));
    treeKey({ key: "End", altKey: false });
    check("End is the last tab", s().sel, { tab: def.tabs.at(-1).id });
    treeKey({ key: "Home", altKey: false });
    check("Home is the first", s().sel, { tab: home.id });
    treeKey({ key: "ArrowDown", altKey: false });
    check("↓ is the next", s().sel, { tab: def.tabs[1].id });
    treeKey({ key: "ArrowUp", altKey: false });
    notOk("a key that is not the tree's is not taken", treeKey({ key: "q", altKey: false }));
    check("so far, nothing written", ribbon(), undefined);

    // ------------------------------------------------- every edit is live
    writes.length = 0;
    treeKey({ key: "ArrowDown", altKey: true });
    check("Alt+↓ moves the tab, in settings at once", ribbon()?.tabs.map((x) => x.id).slice(0, 2), [def.tabs[1].id, home.id]);
    ok("through applyChange(\"shell\") — the ribbon above follows", writes.includes("shell"));
    ok("the layout is now the writer's", s().custom);
    check("and selection went with it", s().sel, { tab: home.id });
    treeKey({ key: "ArrowUp", altKey: true });
    check("Alt+↑ puts it back", ribbon().tabs.map((x) => x.id), def.tabs.map((x) => x.id));
    ok("Reset all is on now", !rc("resetAll").disabled);

    treeKey({ key: "Enter", altKey: false });
    treeKey({ key: "ArrowLeft", altKey: false });
    treeKey({ key: "Enter", altKey: false });
    treeKey({ key: "ArrowLeft", altKey: false });
    const a0 = g0.items[0];
    check("Enter opens, and ← walks to a command", s().sel, { tab: home.id, group: g0.id, action: a0.action });
    treeKey({ key: " ", altKey: false });
    check("Space flips its face", ribbon().tabs[0].groups[0].items[0].face, !a0.face);
    treeKey({ key: " ", altKey: false });
    treeKey({ key: "Delete", altKey: false });
    notOk("Delete removes it from the tab", ribbon().tabs[0].groups[0].items.some((i) => i.action === a0.action));
    ok("and it is still known — still in its menu", ribbon().known.includes(a0.action));
    check("focus walks up, not off the tree", s().sel, { tab: home.id, group: g0.id });

    // ------------------------------------------------- the list
    const a = list.find((x) => x.id === a0.action);
    ok("a command says its menu", whereLabel(a, def).startsWith(t("menu." + a.place.menu)));
    ok("and the tabs it is on", whereLabel(a, def).includes(t("tab.home")));
    check("off the ribbon, it says only its menu", whereLabel(a, ribbon()), t("menu." + a.place.menu));
    ok("\"not on my ribbon\" finds it", listed(list, ribbon(), "", "off").some((x) => x.id === a0.action));
    notOk("and only what is off", listed(list, ribbon(), "", "off").some((x) => x.id === g0.items[1].action));
    ok("a query by id finds it", listed(list, def, a0.action, "all").some((x) => x.id === a0.action));
    check("a query for nothing finds nothing", listed(list, def, "zzzz-no-such", "all"), []);
    ok("a menu filter keeps to that menu", listed(list, def, "", "menu:" + a.place.menu).every((x) => x.place.menu === a.place.menu));
    notOk("no style is listed — a style is the document's", listed(list, def, "", "all").some((x) => x.kind === "style"));
    check("visibleNodes: closed tabs only", visibleNodes(def, new Set()).length, def.tabs.length);
    check("an open tab shows its groups", visibleNodes(def, new Set([home.id])).length, def.tabs.length + home.groups.length);

    // ------------------------------------------------- import and export
    applyImport("not json");
    check("an import that is not JSON says so", textOf(rc("status")), t("rcImportNotJson"));
    applyImport('{"version":1,"tabs":[]}');
    check("JSON that is not a ribbon says so", textOf(rc("status")), t("rcImportNotRibbon"));
    const before = JSON.stringify(ribbon());
    check("and neither wrote anything", JSON.stringify(ribbon()), before);
    const file = JSON.parse(exportLayout(def));
    file.tabs[0].groups[0].items.unshift({ action: "cmd:not-in-this-version", face: true });
    file.tabs = file.tabs.slice(0, 2);
    applyImport(JSON.stringify(file));
    check("an import counts what it dropped", textOf(rc("status")), tf("rcImportUnknown", "1"));
    check("and is applied at once", ribbon().tabs.map((x) => x.id), def.tabs.slice(0, 2).map((x) => x.id));
    notOk("without the unknown id", JSON.stringify(ribbon()).includes("not-in-this-version"));
    applyImport(exportLayout(def));
    check("a clean import says only that", textOf(rc("status")), t("rcImported"));

    chrome.clear();
    rc("export").click();
    check("export says what it wrote, in the drawer", textOf(rc("status")), tf("exported", "ksav-ribbon.json"));
    ok("and on the status bar", chrome.status().includes(tf("exported", "ksav-ribbon.json")));

    rc("resetAll").click();
    check("Reset all deletes the writer's ribbon", ribbon(), undefined);
    check("and says so", textOf(rc("status")), t("rcResetDone"));

    // ------------------------------------------------- English
    setLang("en");
    openCustomize();
    check("the floor line in English", textOf(rc("floor")), t("rcFloor"));
    ok("says the menus stay", /menu/i.test(textOf(rc("floor"))));
    ok("→ opens a tab in English", treeKey({ key: "ArrowRight", altKey: false }) && s().expanded.has(home.id));
    treeKey({ key: "ArrowLeft", altKey: false });
    notOk("← closes it", s().expanded.has(home.id));
    setLang("he");

    // ------------------------------------------------- right-click, drawer shut
    drawer.classList.remove("open");
    const onFace = g0.items.find((i) => i.face);
    const menu = buttonMenu(home.id, g0.id, onFace.action, 10, 20);
    const keys = (m) => walk(m, (n) => n.role === "menuitem").map((n) => n["data-rc-menu"]);
    check("a face button's menu", keys(menu), ["rcMenuMoveMore", "rcMenuRemove", "rcMenuCustomize"]);
    ok("is a role=menu popup, mounted", menu.role === "menu" && mounted.includes(menu));
    check("its first item has focus", focused?.["data-rc-menu"], "rcMenuMoveMore");
    check("where it was clicked", [menu.style.left, menu.style.top], ["10px", "20px"]);
    walk(menu, (n) => n["data-rc-menu"] === "rcMenuMoveMore")[0].click();
    notOk("Move to ⋯ closes the popup", mounted.includes(menu));
    const it = ribbon().tabs[0].groups[0].items.find((i) => i.action === onFace.action);
    check("and is written straight through", it.face, false);
    check("a ⋯ button has no Move to ⋯", keys(buttonMenu(home.id, g0.id, onFace.action, 0, 0))[0], "rcMenuRemove");

    const other = def.tabs[1];
    const og = other.groups[0];
    const om = buttonMenu(other.id, og.id, og.items[0].action, 0, 0);
    ok("off Home, Add to Home is offered", keys(om).includes("rcMenuAddHome"));
    walk(om, (n) => n["data-rc-menu"] === "rcMenuAddHome")[0].click();
    ok("and puts it on Home", ribbon().tabs[0].groups.at(-1).items.some((i) => i.action === og.items[0].action));
    ok("while it stays where it was", ribbon().tabs[1].groups[0].items.some((i) => i.action === og.items[0].action));
    walk(buttonMenu(other.id, og.id, og.items[0].action, 0, 0), (n) => n["data-rc-menu"] === "rcMenuRemove")[0].click();
    notOk("Remove takes it off that tab", ribbon().tabs[1].groups[0].items.some((i) => i.action === og.items[0].action));

    const tm = tabMenu(home.id, 0, 0);
    check("a tab's menu", keys(tm), ["rcRename", "rcHide", "rcMenuCustomize"]);
    walk(tm, (n) => n["data-rc-menu"] === "rcHide")[0].click();
    check("Hide hides it", ribbon().tabs[0].hidden, true);
    notOk("the drawer stayed shut", drawer.classList.contains("open"));

    walk(buttonMenu(other.id, og.id, og.items[1].action, 0, 0), (n) => n["data-rc-menu"] === "rcMenuCustomize")[0].click();
    ok("Customize… opens the drawer", drawer.classList.contains("open"));
    check("on that button", s().sel, { tab: other.id, group: og.id, action: og.items[1].action });
    ok("with its tab open", s().expanded.has(other.id));
    ok("on the writer's own ribbon", s().custom && s().layout.tabs[0].hidden === true);
  } finally {
    setLang(lang);
    settings.shell = shellWas;
    if (urlWas) Object.defineProperty(globalThis, "URL", urlWas);
    chrome.restore();
  }
}
