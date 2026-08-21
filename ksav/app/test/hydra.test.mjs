import { check, ok, notOk } from "./harness.mjs";
import { assignKeys, hydraFor, allHydras, entryFor, closesAfter } from "../.tmp-test/hydra.mjs";
import { STRUCTURE_ACTIONS } from "../.tmp-test/structure.mjs";
import { SRC } from "../tools/paths.mjs";

// A hydra's keys are generated, never hand-listed. A hand-written table would be
// a second place to forget an operation — which is the exact failure this
// codebase keeps producing, so the test that matters most here is "every
// operation got a key".

export async function run() {

// ---------------------------------------------------------------- coverage

{
  for (const hydra of allHydras()) {
    const actions = STRUCTURE_ACTIONS.filter((a) => a.structure === hydra.structure);
    check(
      `${hydra.structure}: every operation has a key`,
      hydra.entries.length,
      actions.length,
    );
    const keys = hydra.entries.map((e) => e.key);
    check(`${hydra.structure}: no two share a key`, new Set(keys).size, keys.length);
    for (const k of keys) {
      ok(`${hydra.structure}: "${k}" is one typeable character`, /^[a-z0-9]$/.test(k));
    }
  }
}

{
  const kinds = allHydras().map((h) => h.structure);
  check("one hydra per structure", kinds.join(","), "list,table,heading");
}

// ---------------------------------------------------------------- determinism
//
// The property that keeps a writer's fingers working: the same registry gives
// the same keys, every time and in every session.

{
  const a = hydraFor("table").entries.map((e) => `${e.key}:${e.action.id}`).join(" ");
  const b = hydraFor("table").entries.map((e) => `${e.key}:${e.action.id}`).join(" ");
  check("the same hydra twice is the same hydra", a, b);
}

{
  // An operation added later must not displace an earlier one's key.
  const actions = STRUCTURE_ACTIONS.filter((a) => a.structure === "table");
  const before = assignKeys(actions.slice(0, 4));
  const after = assignKeys(actions);
  for (const e of before) {
    const now = after.find((x) => x.action.id === e.action.id);
    check(`${e.action.id} kept its key when the registry grew`, now.key, e.key);
  }
}

// ---------------------------------------------------------------- the keys make sense

{
  const table = hydraFor("table");
  const byId = Object.fromEntries(table.entries.map((e) => [e.action.id, e.key]));
  // Registry order decides ties: "insert row above" is declared first, so it
  // takes r and "below" falls to b.
  check("row-above took r", byId["table.rowAbove"], "r");
  check("row-below fell to b", byId["table.rowBelow"], "b");
  // Most keys come from the operation's own name. Not all can — the last few
  // operations in a long hydra exhaust their own letters and fall through to the
  // alphabet, which is the price of guaranteeing every one gets a key at all.
  // **The operations a writer reaches first keep a key from their own name.**
  //
  // This was "all but two of them", which is a statement about a hydra of
  // twenty rather than about the assignment: the longer the list, the more of
  // its own letters it has exhausted by the end, so four new operations pushed
  // a bound that was never about them. Growing the slack every time the list
  // grows is a fence that reports nothing.
  //
  // What is worth holding is what a writer actually meets. Assignment is in
  // registry order and the registry is in the order these are reached for, so
  // the head of the list is where a mnemonic matters and the tail is where
  // "there is a key at all" matters. Both are asserted, and neither moves when
  // the list grows.
  const head = table.entries.slice(0, 12);
  const strays = head.filter((e) => !e.action.id.toLowerCase().includes(e.key));
  check("the first twelve keys all come from their own names", strays.map((e) => e.action.id), []);
  const keys = table.entries.map((e) => e.key);
  check("every operation has a key", keys.filter(Boolean).length, table.entries.length);
  check("...and no two share one", new Set(keys).size, keys.length);
}

{
  // A level is its own digit. `heading.level7` as `l` would be unlearnable.
  const heading = hydraFor("heading");
  const byId = Object.fromEntries(heading.entries.map((e) => [e.action.id, e.key]));
  for (let i = 1; i <= 9; i++) {
    check(`level ${i} is the key "${i}"`, byId[`heading.level${i}`], String(i));
  }
}

// ---------------------------------------------------------------- overrides
//
// Configurable like Emacs: a writer's own key wins outright rather than
// queueing behind the generated one.

{
  const h = hydraFor("table", { "table.rowDelete": "r" });
  const byId = Object.fromEntries(h.entries.map((e) => [e.action.id, e.key]));
  check("the override took the key", byId["table.rowDelete"], "r");
  ok("and the action that had it moved aside", byId["table.rowBelow"] !== "r");
  const keys = h.entries.map((e) => e.key);
  check("still no duplicates", new Set(keys).size, keys.length);
  check("still no operation left out", h.entries.length,
        STRUCTURE_ACTIONS.filter((a) => a.structure === "table").length);
}

// ---------------------------------------------------------------- lookup and exit

{
  const h = hydraFor("list");
  const first = h.entries[0];
  check("a key finds its action", entryFor(h, first.key).action.id, first.action.id);
  check("case does not matter", entryFor(h, first.key.toUpperCase()).action.id, first.action.id);
  notOk("an unbound key finds nothing", entryFor(h, "%"));
}

{
  const byId = Object.fromEntries(
    allHydras().flatMap((h) => h.entries).map((e) => [e.action.id, e.action]),
  );
  ok("deleting the table closes the hydra", closesAfter(byId["table.delete"]));
  ok("deleting the section closes it", closesAfter(byId["heading.delete"]));
  notOk("adding a row does not — repeating is the point", closesAfter(byId["table.rowBelow"]));
  notOk("nor does adding an item", closesAfter(byId["list.addItem"]));
}

// ------------------------------------------------- who actually gets the key
//
// Everything above tests that the keys are *generated* correctly. None of it
// could have caught what was wrong, which is that in vim or emacs mode not one
// of them did anything.
//
// The keys were a `Prec.highest(keymap.of(hydraKeymap()))` entry in the
// editor's extensions, under a comment stating it was "ahead of everything,
// including the mode keymaps". Driven in a browser with vim on: open a list
// hydra, press the `a` the panel offers for "new item", and vim goes to INSERT.
// Press `b` and the caret moves back a word, leaves the list, and the structure
// watch closes the panel. Escape did not close it either — vim took that to
// leave visual mode. Eleven operations on screen with their keys beside them,
// and every one of them a lie.
//
// No position in that array could have fixed it: `@replit/codemirror-vim`
// handles keys from a ViewPlugin event handler, and a plugin's DOM handlers run
// ahead of the whole `keymap` facet whatever its precedence. Precedence orders
// facet inputs against one another; it does not order a facet against a plugin.
//
// So these assertions are about *placement*, which is the thing that was wrong,
// and they are read off the source because the alternative — importing
// `main.ts` — boots the application (see `test/modules.mjs`).
{
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const main = await readFile(join(SRC, "main.ts"), "utf8");
  // Comments stripped before the prohibition sweep, or the paragraph in
  // `main.ts` explaining what the old arrangement was trips the test that
  // forbids it. Every source-level prohibition in this suite has to do this;
  // the one that did not was this one, on its first run.
  const code = main.replace(/^\s*(?:\/\/|\*|\/\*).*$/gm, "");

  // The bug, stated as a prohibition. A keymap entry cannot outrank a plugin,
  // so putting the hydra back in one puts every key back to doing nothing.
  check(
    "the hydra's keys are not a keymap entry",
    /keymap\.of\(\s*hydraKeymap\(\)\s*\)/.test(code),
    false,
  );
  check("and `hydraKeymap` is gone entirely", code.includes("function hydraKeymap"), false);

  // Where they are instead: `window`, capture phase — above the content element
  // every one of those plugin handlers is attached to, so being first is a fact
  // about the DOM rather than a hope about a library's internals.
  ok(
    "they are a capture-phase listener on window",
    /window\.addEventListener\(\s*"keydown",\s*captureHydraKeys,\s*true\s*\)/.test(main),
  );
  ok(
    "and it is removed again",
    /window\.removeEventListener\(\s*"keydown",\s*captureHydraKeys,\s*true\s*\)/.test(main),
  );

  // The pairing is the part that rots. A capture listener on `window` that
  // outlives its panel eats every keystroke in the application, so it must come
  // off through the path *every* way of closing goes through — the ×, the
  // backdrop, the Escape sweep and `closePanel` alike — which is the panel
  // registry's own `close` hook, not `closeHydra`.
  const wiring = main.slice(main.indexOf('wirePanel("hydra"'));
  const hook = wiring.slice(0, wiring.indexOf("\n  });"));
  ok("removed by the panel registry's close hook", hook.includes("removeEventListener"));
  ok("beside the state it is paired with", hook.includes("openHydraState = null"));

  // Modified keys are handed on rather than swallowed, or Mod-S stops saving
  // the moment a panel is up.
  const handler = main.slice(main.indexOf("function captureHydraKeys"));
  const body = handler.slice(0, handler.indexOf("\n}\n"));
  ok("modified keys are let through", /ctrlKey \|\| .*metaKey \|\| .*altKey\) return/.test(body));
  ok("Escape closes the panel here, before a mode can take it", body.includes('"Escape"'));
  // Keys with a name rather than a character — Tab, Enter, the arrows — are not
  // hydra keys, and swallowing them would trap the keyboard in a panel whose
  // own × is reachable by Tab.
  ok("named keys are not swallowed", body.includes("event.key.length !== 1"));
}

}
