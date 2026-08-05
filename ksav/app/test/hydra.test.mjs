import { check, ok, notOk } from "./harness.mjs";
import { assignKeys, hydraFor, allHydras, entryFor, closesAfter } from "../.tmp-test/hydra.mjs";
import { STRUCTURE_ACTIONS } from "../.tmp-test/structure.mjs";

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
  const fromName = table.entries.filter((e) => e.action.id.toLowerCase().includes(e.key));
  ok("most keys are mnemonic", fromName.length >= table.entries.length - 2);
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

}
