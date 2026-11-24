// The placement data, and the fences that keep it a statement rather than a hope.
//
// `placement.ts` says where every action lives (docs/ui-architecture.md §4).
// These hold it to the two things it describes — the registry the engine
// publishes and the `BUILT_IN` table the shell runs — in both directions, so a
// command added in Rust or an action added to the table cannot land in no menu,
// and a placement cannot outlive the thing it placed.

import { check, ok } from "./harness.mjs";
import { commands } from "../tools/commands.mjs";
import {
  ACTION_PLACE,
  FACE,
  GROUPS,
  CONTEXTUAL,
  HOME,
  HOME_GROUPS,
  LAUNCHER,
  MAX_FACE,
  MAX_ICON_FACE,
  MAX_LARGE,
  MENUS,
  PLACE_OF_CATEGORY,
  PLACE_OVERRIDE,
  SIZE,
  TABS,
  TAB_GROUPS,
  btnKey,
  isConfig,
  menuOfGroup,
  placed,
  resolveKey,
  shellPlace,
  tabOf,
  tabTree,
} from "../.tmp-test/placement.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";
import { ICON_OF } from "../.tmp-test/icons.mjs";

export async function run() {
  const { BUILT_IN } = await import("../.tmp-test/actionsurface.mjs");
  const builtIns = BUILT_IN.map((a) => a.id);
  const reg = commands();
  const list = placed({
    builtIns,
    commands: reg,
    macros: [{ id: "macro:x", name: "x" }],
    styles: [{ id: "style:y", name: "y" }],
  });
  const byId = new Map(list.map((a) => [a.id, a]));

  // ------------------------------------------------ 1. every action has a home
  //
  // The floor (§4, rule 1). An action `placed()` cannot place is dropped, so
  // this is what makes dropping it a failure rather than a disappearance.
  check(
    "every BUILT_IN action is placed",
    builtIns.filter((id) => !byId.has(id)),
    [],
  );
  check(
    "every ACTION_PLACE entry names a BUILT_IN action",
    Object.keys(ACTION_PLACE).filter((id) => !builtIns.includes(id)),
    [],
  );
  check(
    "every live registry command is placed, once",
    reg
      .filter((c) => !c.deprecated)
      .filter((c) => list.filter((a) => a.command?.he === c.he).length !== 1)
      .map((c) => c.he),
    [],
  );
  check("no id is placed twice", list.length - byId.size, 0);
  ok("macros and styles are placed", byId.has("macro:x") && byId.has("style:y"));

  // ------------------------------------------------ 2. deprecated commands have no place
  {
    const dep = reg.filter((c) => c.deprecated).map((c) => c.he);
    ok("the registry has deprecated commands to test against", dep.length > 0);
    check(
      "no deprecated command is placed",
      list.filter((a) => a.command && dep.includes(a.command.he)).map((a) => a.command.he),
      [],
    );
  }

  // ------------------------------------------------ 3. a config is never a face
  {
    const cfg = list.filter((a) => a.command && isConfig(a.command));
    ok("the registry has configs to test against", cfg.length > 10);
    check("every config is behind ⚙", cfg.filter((a) => !a.gear).map((a) => a.id), []);
    check("no config is a face button", cfg.filter((a) => a.place.face).map((a) => a.id), []);
  }

  // ------------------------------------------------ 4. the tables name real things
  {
    const cats = [...new Set(reg.map((c) => c.category))];
    check("every category the engine publishes has a place", cats.filter((c) => !(c in PLACE_OF_CATEGORY)), []);
    check(
      "every category place names a category the engine publishes",
      Object.keys(PLACE_OF_CATEGORY).filter((c) => !cats.includes(c)),
      [],
    );
    const names = new Set(reg.map((c) => c.he));
    check("every override names a real command", Object.keys(PLACE_OVERRIDE).filter((he) => !names.has(he)), []);

    const allGroups = MENUS.flatMap((m) => GROUPS[m]);
    check("group ids are unique across the bar", allGroups.length, new Set(allGroups).size);
    const badGroup = (p) => !GROUPS[p.menu]?.includes(p.group);
    check(
      "every place names a group of its own menu",
      list.filter((a) => badGroup(a.place)).map((a) => `${a.id} → ${a.place.menu}/${a.place.group}`),
      [],
    );
    check(
      "every category and override names a known group",
      [...Object.values(PLACE_OF_CATEGORY), ...Object.values(PLACE_OVERRIDE)]
        .filter((p) => !menuOfGroup(p.group))
        .map((p) => p.group),
      [],
    );
    check(
      "every TAB_GROUPS key is a tab",
      Object.keys(TAB_GROUPS).filter((t) => !TABS.includes(t) || t === "home"),
      [],
    );
    const onTabs = Object.values(TAB_GROUPS).flat();
    check("every group a tab draws exists", onTabs.filter((g) => !menuOfGroup(g)), []);
    check("no group is drawn on two tabs", onTabs.length, new Set(onTabs).size);
    check("every contextual tab is a tab", [...CONTEXTUAL].filter((t) => !TABS.includes(t)), []);
    check("every family id resolves", shellPlace("foldLevel3")?.group, "folding");
  }

  // ------------------------------------------------ 5. every face key resolves
  {
    const missing = [];
    for (const [group, keys] of Object.entries(FACE))
      for (const k of keys) {
        const a = resolveKey(k, list);
        if (!a) missing.push(`${group}: ${k} (unknown)`);
        else if (a.place.group !== group) missing.push(`${group}: ${k} (lives in ${a.place.group})`);
        else if (!a.place.face) missing.push(`${group}: ${k} (not face)`);
      }
    check("every FACE key resolves to an action in that group", missing, []);
    const homeMissing = HOME.flatMap((h) => [...h.face, ...h.more].filter((k) => !resolveKey(k, list)));
    check("every HOME key resolves", homeMissing, []);
    check(
      "every HOME pick is marked home",
      HOME.flatMap((h) => [...h.face, ...h.more].filter((k) => !resolveKey(k, list)?.place.home)),
      [],
    );
  }

  // ------------------------------------------------ 6. no wall of buttons
  //
  // Rule 2, counted by size: a group leads with at most two large faces, draws
  // at most six labelled ones, and the icon-only rows (Font, Paragraph) at most
  // ten. Counted on what `tabTree` draws, which is what the writer sees.
  {
    const over = [];
    for (const tab of tabTree(list))
      for (const g of tab.groups) {
        const n = (size) => g.face.filter((a) => a.kind !== "style" && (a.place.size ?? "small") === size).length;
        if (n("large") > MAX_LARGE) over.push(`${tab.tab}/${g.group}: ${n("large")} large`);
        if (n("large") + n("small") > MAX_FACE) over.push(`${tab.tab}/${g.group}: ${n("large") + n("small")} labelled`);
        if (n("icon") > MAX_ICON_FACE) over.push(`${tab.tab}/${g.group}: ${n("icon")} icons`);
      }
    check("no group draws more faces than its size caps", over, []);
    check(
      "no Home group lists more faces than it may draw",
      HOME.filter((h) => h.face.length > MAX_FACE + MAX_ICON_FACE).map((h) => h.group),
      [],
    );
  }

  // ------------------------------------------------ 6b. sizes and icons
  {
    const sizeKeys = Object.keys(SIZE).filter((k) => !resolveKey(k, list));
    check("every SIZE key resolves", sizeKeys, []);
    // A large face is mostly picture and an icon face is only picture: neither
    // may stand there without one.
    check(
      "every large or icon face has an icon",
      list.filter((a) => a.place.size && a.place.size !== "small" && !a.place.icon).map((a) => a.id),
      [],
    );
    check(
      "every icon a face carries is ICON_OF's",
      list.filter((a) => a.place.icon && ICON_OF[a.id] !== a.place.icon && ICON_OF[a.command?.he] !== a.place.icon).map((a) => a.id),
      [],
    );
    check("every launcher is an action behind ⚙", [...LAUNCHER].filter((id) => !byId.get(id)?.gear), []);
  }

  // ------------------------------------------------ 7. every name in both languages
  {
    const need = [
      ...MENUS.map((m) => "menu." + m),
      ...TABS.map((t) => "tab." + t),
      ...MENUS.flatMap((m) => GROUPS[m]).map((g) => "grp." + g),
      ...HOME_GROUPS.map((g) => "grp." + g),
      // Every face button and every Home pick has a short label: a tab button
      // draws its label always (§5, rule 1), and the menu row's sentence is too
      // long for it.
      ...list.filter((a) => a.place.face && a.kind !== "style").map(btnKey),
      ...HOME.flatMap((h) => h.face).map((k) => btnKey(resolveKey(k, list))),
    ];
    for (const lang of ["he", "en"]) {
      check(`every shell name has a ${lang} entry`, [...new Set(need)].filter((k) => !(k in DICTS[lang])), []);
    }
    // The shell actions' own labels: `sc.<id>` or the bare id, which is how
    // `actionName` finds them. The doors are labelled by their command, the
    // structure actions by `structure.label`, the fold families by `tf`.
    const shell = list.filter((a) => a.kind === "shell" && !a.command && !/^(foldLevel|foldListDepth)\d+$/.test(a.id) && !/^(list|heading|table|note)\./.test(a.id));
    for (const lang of ["he", "en"]) {
      check(
        `every shell action has a ${lang} label`,
        shell.filter((a) => !("sc." + a.id in DICTS[lang]) && !(a.id in DICTS[lang])).map((a) => a.id),
        [],
      );
    }
  }

  // ------------------------------------------------ 8. the views follow the floor
  {
    check("a format/page action is drawn on Layout", tabOf({ menu: "format", group: "page" }), "layout");
    check("a format/font action has no tab of its own", tabOf({ menu: "format", group: "font" }), undefined);
    check("a notes action is drawn on Notes", tabOf({ menu: "notes", group: "notes" }), "notes");
    check("Tools' commands are drawn on View", tabOf({ menu: "tools", group: "commandsGroup" }), "view");
    check("the status-bar toggles are on no tab", tabOf({ menu: "view", group: "interface" }), undefined);
    check("the strip runs in Word's order", TABS, ["home", "insert", "layout", "notes", "sources", "review", "view", "table"]);
    const order = list.map((a) => MENUS.indexOf(a.place.menu));
    ok("placed() returns menu order", order.every((x, i) => i === 0 || order[i - 1] <= x));
    check("bold is placed under its key's id", byId.get("bold")?.command?.he, "הדגשה");
    check("…and lives in Format ▸ Font", byId.get("bold")?.place.group, "font");
  }
}
