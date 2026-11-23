import { check, ok } from "./harness.mjs";
import { commands } from "../tools/commands.mjs";
import { placed } from "../.tmp-test/placement.mjs";
import { defaultLayout } from "../.tmp-test/ribbonlayout.mjs";
import * as E from "../.tmp-test/ribbonedit.mjs";

// The edits the customize drawer makes (#233, step 8; §8 "What a writer can do").
//
// Pure, so every one is fenced here without a DOM: the drawer is then only a
// question of which button calls which of these, which `ribboncustomize.test`
// asks. Each case also checks the layout it was given is unchanged — the drawer
// holds the last layout it wrote, and an edit that mutated it would make *undo
// by reopening* lie.

export async function run() {
  const { BUILT_IN } = await import("../.tmp-test/actionsurface.mjs");
  const list = placed({ builtIns: BUILT_IN.map((a) => a.id), commands: commands(), macros: [], styles: [] });
  const base = defaultLayout(list);
  const frozen = JSON.stringify(base);
  const ids = (l) => l.tabs.map((t) => t.id);
  const tab = (l, id) => l.tabs.find((t) => t.id === id);
  const items = (l, t, g) => tab(l, t).groups.find((x) => x.id === g).items.map((i) => i.action);
  const home = tab(base, "home");
  const g0 = home.groups[0];
  const a0 = g0.items[0].action;
  const a1 = g0.items[1].action;

  // ------------------------------------------------- begin, ids
  check("begin with nothing saved is §5", E.begin(undefined, list), base);
  check("begin with a saved layout migrates it", E.begin({ ...base, known: [] }, list).known, base.known);
  let n = 0;
  const seq = () => ["home", "x", "x", "y"][n++] ?? "z";
  const taken = { ...base, tabs: [...base.tabs, { id: "user:x", groups: [] }] };
  check("a fresh id skips one already taken", E.freshId(taken, seq), "user:home");
  n = 1;
  check("and keeps trying", E.freshId(taken, seq), "user:y");
  ok("a fresh id is user:", E.freshId(base).startsWith("user:"));

  // ------------------------------------------------- tabs
  const added = E.addTab(base, "  שלי  ", "home", "user:mine");
  check("a new tab lands after the one named", ids(added.layout).slice(0, 2), ["home", "user:mine"]);
  const mine = tab(added.layout, "user:mine");
  check("named, trimmed, from nothing, one empty group", [mine.name, mine.from, mine.groups.length, mine.groups[0].items], ["שלי", [], 1, []]);
  check("without `after` it is last", ids(E.addTab(base, "x", undefined, "user:z").layout).at(-1), "user:z");
  check("a long name is cut at 80", tab(E.addTab(base, "א".repeat(200), undefined, "user:z").layout, "user:z").name.length, 80);

  check("rename a built-in tab", tab(E.rename(base, { tab: "home" }, "ראשי"), "home").name, "ראשי");
  const renamed = E.rename(base, { tab: "home" }, "ראשי");
  ok("an empty name puts a built-in back on its catalogue name", !("name" in tab(E.rename(renamed, { tab: "home" }, " "), "home")));
  check("an empty name leaves a user tab's name alone", tab(E.rename(added.layout, { tab: "user:mine" }, ""), "user:mine").name, "שלי");
  check("rename a group", tab(E.rename(base, { tab: "home", group: g0.id }, "שלי"), "home").groups[0].name, "שלי");
  check("a command has no name to change", E.rename(base, { tab: "home", group: g0.id, action: a0 }, "x"), base);

  const hidden = E.toggleHidden(base, "home");
  check("👁 hides", tab(hidden, "home").hidden, true);
  ok("and shows again, with no key left behind", !("hidden" in tab(E.toggleHidden(hidden, "home"), "home")));
  check("a hidden tab keeps its groups", tab(hidden, "home").groups, home.groups);

  check("remove a tab", ids(E.remove(base, { tab: "home" })).includes("home"), false);
  check("remove a group", tab(E.remove(base, { tab: "home", group: g0.id }), "home").groups.length, home.groups.length - 1);
  check("remove a command", items(E.remove(base, { tab: "home", group: g0.id, action: a0 }), "home", g0.id).includes(a0), false);
  check("removing a command keeps it known — it is still in its menu", E.remove(base, { tab: "home", group: g0.id, action: a0 }).known, base.known);

  check("move a tab forward", ids(E.move(base, { tab: "home" }, 1)).slice(0, 2), [base.tabs[1].id, "home"]);
  check("past the start is clamped", ids(E.move(base, { tab: "home" }, -1)), ids(base));
  check("past the end is clamped", ids(E.move(base, { tab: base.tabs.at(-1).id }, 5)), ids(base));
  check("move a command", items(E.move(base, { tab: "home", group: g0.id, action: a0 }, 1), "home", g0.id).slice(0, 2), [a1, a0]);
  check("move a group", tab(E.move(base, { tab: "home", group: g0.id }, 1), "home").groups[1].id, g0.id);

  const [t1, t2] = [base.tabs[0], base.tabs[1]];
  const merged = E.merge(base, t1.id, t2.id);
  check("merge removes the second", ids(merged).includes(t2.id), false);
  check("and the merged tab is both", tab(merged, t1.id).from, [t1.id, t2.id]);
  check("with the second's groups appended", tab(merged, t1.id).groups.map((g) => g.id), [...t1.groups, ...t2.groups].map((g) => g.id).filter((v, i, a) => a.indexOf(v) === i));
  check("a tab merged with itself is unchanged", E.merge(base, "home", "home"), base);
  const twin = { ...base, tabs: [{ id: "user:a", from: [], groups: [{ id: "g", items: [{ action: a0, face: true }] }] }, { id: "user:b", from: [], groups: [{ id: "g", items: [{ action: a0, face: true }, { action: a1, face: false }] }] }] };
  check("a shared group id is folded, each command once", E.merge(twin, "user:a", "user:b").tabs[0].groups, [{ id: "g", items: [{ action: a0, face: true }, { action: a1, face: false }] }]);

  // ------------------------------------------------- groups
  const ng = E.addGroup(base, "home", "שלי", "user:g");
  check("a new group goes last", tab(ng.layout, "home").groups.at(-1), { id: "user:g", name: "שלי", items: [] });
  const target = base.tabs.find((t) => t.id !== "home");
  const moved = E.moveGroupTo(base, { tab: "home", group: g0.id }, target.id);
  check("move a group to another tab: gone from the first", tab(moved, "home").groups.some((g) => g.id === g0.id), false);
  check("and last in the second", tab(moved, target.id).groups.at(-1).id, g0.id);
  check("moving into a tab that has that group id is refused", E.moveGroupTo(moved, { tab: target.id, group: g0.id }, target.id), moved);

  // ------------------------------------------------- commands
  const put = E.addItem(base, { tab: target.id, group: target.groups[0].id }, a0);
  check("a command may be on more than one tab", E.whereIs(put, a0).map((w) => w.tab), ["home", target.id]);
  check("in one group it is there once", E.addItem(base, { tab: "home", group: g0.id }, a0), base);
  check("an added command is known", E.addItem({ ...base, known: [] }, { tab: "home", group: g0.id }, a0).known, [a0]);
  check("behind ⋯ when asked", E.whereIs(E.addItem(base, { tab: target.id, group: target.groups[0].id }, a0, false), a0)[1].face, false);
  const was = g0.items[0].face;
  check("Space flips the face", tab(E.toggleFace(base, { tab: "home", group: g0.id, action: a0 }), "home").groups[0].items[0].face, !was);

  // ------------------------------------------------- reset
  const messy = E.toggleHidden(E.rename(E.remove(base, { tab: "home", group: g0.id, action: a0 }), { tab: "home" }, "x"), "home");
  check("reset puts a built-in tab back to §5", tab(E.resetTab(messy, "home", list), "home"), home);
  check("and leaves the other tabs", E.resetTab(messy, "home", list).tabs.slice(1), messy.tabs.slice(1));
  check("a user tab has no default", E.resetTab(added.layout, "user:mine", list), added.layout);
  const m2 = E.merge(base, t1.id, t2.id);
  check("a merged tab goes back to the first it was", tab(E.resetTab(m2, t1.id, list), t1.id).from, [t1.id]);

  check("no edit touched the layout it was given", JSON.stringify(base), frozen);
}
