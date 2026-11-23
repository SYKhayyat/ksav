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

  // ------------------------------------------------- drag and drop
  const gtab = (l, id) => tab(l, id).groups.map((g) => g.id);
  const tabNode = (t) => ({ tab: t.id });
  const dTab = E.drop(base, tabNode(base.tabs[2]), tabNode(base.tabs[0]));
  check("a tab dropped on a tab takes its place", ids(dTab).slice(0, 3), [base.tabs[2].id, base.tabs[0].id, base.tabs[1].id]);
  check("a tab dropped on a tab behind it takes its place too", ids(E.drop(base, tabNode(base.tabs[0]), tabNode(base.tabs[2]))).indexOf(base.tabs[0].id), 2);
  check("a tab dropped on itself is unchanged", E.drop(base, tabNode(home), tabNode(home)), base);
  check("a tab dropped on a group is refused", E.drop(base, tabNode(home), { tab: home.id, group: g0.id }), base);
  const g1 = home.groups[1];
  check("a group dropped on a group of its tab takes its place", gtab(E.drop(base, { tab: "home", group: g1.id }, { tab: "home", group: g0.id }), "home").slice(0, 2), [g1.id, g0.id]);
  const dg = E.drop(base, { tab: "home", group: g0.id }, tabNode(target));
  check("a group dropped on another tab goes last in it", [gtab(dg, "home").includes(g0.id), gtab(dg, target.id).at(-1)], [false, g0.id]);
  const dg2 = E.drop(base, { tab: "home", group: g0.id }, { tab: target.id, group: target.groups[0].id });
  check("on a group of another tab, before it", gtab(dg2, target.id)[0], g0.id);
  check("a group onto a tab that has its id is refused", E.drop(twin, { tab: "user:a", group: "g" }, { tab: "user:b" }), twin);
  check("a group dropped on a command is refused", E.drop(base, { tab: "home", group: g0.id }, { tab: "home", group: g0.id, action: a0 }), base);
  check("a command dropped on a command of its group takes its place", items(E.drop(base, { tab: "home", group: g0.id, action: a1 }, { tab: "home", group: g0.id, action: a0 }), "home", g0.id).slice(0, 2), [a1, a0]);
  const tg = target.groups[0];
  const dc = E.drop(base, { tab: "home", group: g0.id, action: a0 }, { tab: target.id, group: tg.id });
  check("a command dropped on a group goes last in it, off its old group", [items(dc, target.id, tg.id).at(-1), items(dc, "home", g0.id).includes(a0)], [a0, false]);
  check("and is still known", dc.known, base.known);
  const dc2 = E.drop(base, { tab: "home", group: g0.id, action: a0 }, { tab: target.id, group: tg.id, action: tg.items[0].action });
  check("on a command of another group, before it", items(dc2, target.id, tg.id)[0], a0);
  check("a command already in the target group is refused", E.drop(put, { tab: "home", group: g0.id, action: a0 }, { tab: target.id, group: target.groups[0].id }), put);
  check("a command dropped on a tab is refused", E.drop(base, { tab: "home", group: g0.id, action: a0 }, tabNode(target)), base);

  // ------------------------------------------------- reset
  const messy = E.toggleHidden(E.rename(E.remove(base, { tab: "home", group: g0.id, action: a0 }), { tab: "home" }, "x"), "home");
  check("reset puts a built-in tab back to §5", tab(E.resetTab(messy, "home", list), "home"), home);
  check("and leaves the other tabs", E.resetTab(messy, "home", list).tabs.slice(1), messy.tabs.slice(1));
  check("a user tab has no default", E.resetTab(added.layout, "user:mine", list), added.layout);
  const m2 = E.merge(base, t1.id, t2.id);
  const r2 = E.resetTab(m2, t1.id, list);
  check("a merged tab goes back to the first it was", tab(r2, t1.id).from, [t1.id]);
  check("and the tab it absorbed comes back, right after", ids(r2).slice(0, 2), [t1.id, t2.id]);
  check("with its groups, not a copy of the first's", tab(r2, t2.id).groups.map((g) => g.id), t2.groups.map((g) => g.id));
  check("no tab is drawn twice", new Set(ids(r2)).size, ids(r2).length);

  check("no edit touched the layout it was given", JSON.stringify(base), frozen);
}
