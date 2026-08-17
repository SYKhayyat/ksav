import { check, ok } from "./harness.mjs";
import {
  ACTION_COMMAND,
  BREAKS,
  BREAK_COMMAND,
  BREAK_GLYPH,
} from "../.tmp-test/actions.mjs";
import { commands } from "../tools/commands.mjs";
import { DEFAULT_KEYS } from "../.tmp-test/bindings.mjs";
import { DICTS } from "../.tmp-test/i18n.mjs";

// The registry was the single source of truth and `ACTIONS` held a hand-written
// second copy beside it. They had already drifted:
//
//     commands.rs:89   cmd!("רשימה", …, "#רשימה(\n  פריט[|],\n  פריט[],\n)")
//     main.ts:427      { id: "bullets", run: () => insertSnippet("#רשימה(\n  פריט[|],\n)") }
//
// **Clicking the toolbar's • gave you a two-item list. Pressing Ctrl+Shift+8
// gave you a one-item list.** Same operation, same product, two documents.
//
// The previous report's fix — one registry plus a fence — was right and worked
// wherever it was applied. What it could not do is reach `main.ts`, the one
// module no test can see, which is why the copy survived there. This file is the
// part of it that *can* be reached: the table `main.ts` now generates its
// actions from, checked against `commands.rs` itself.

export async function run() {
  const reg = commands();
  const byHebrew = new Map(reg.map((c) => [c.he, c]));

  ok("the registry was read", reg.length > 100);
  ok("the action table is not empty", Object.keys(ACTION_COMMAND).length >= 15);

  // The fence that matters. Renaming a command in Rust used to leave a toolbar
  // button quietly inserting a string nobody had checked against the engine
  // since it was typed; now it is a failing test with the name in it.
  const missing = Object.entries(ACTION_COMMAND).filter(([, he]) => !byHebrew.has(he));
  check("every action inserts a command the registry defines", missing, []);

  // A deprecated command still compiles and is deliberately kept out of the
  // palette and the menus — so an *action* pointing at one is a button offering
  // something the rest of the product has stopped offering.
  const stale = Object.entries(ACTION_COMMAND)
    .filter(([, he]) => byHebrew.get(he)?.deprecated)
    .map(([id, he]) => `${id} → ${he}`);
  check("and none of them is a deprecated one", stale, []);

  // Each of these has a shipped key binding, which is the half that made the
  // drift visible: two ways to ask for the same operation, two answers.
  const unbound = Object.keys(ACTION_COMMAND).filter((id) => !DEFAULT_KEYS[id]);
  check("every one of them is reachable from the keyboard", unbound, []);

  // ------------------------------------------------------------------ the breaks
  //
  // A single newline in the source is a *space* on the page, so the shortest way
  // to any visible break is two lines. Five commands answer that, and **two of
  // them had no door of any kind** — `#מעבר_עמוד`, the break every writer arrives
  // already knowing, and `#מעבר_טור` — reachable only by name from the registry
  // section at the bottom of the Insert menu. The two that did have keys sat in a
  // named row that printed neither of them.
  //
  // The fix is a list, and this is what keeps the list true. Derived from the
  // engine rather than agreed with it: a sixth break added to the prelude is a
  // failing test naming the command, not a row nobody wrote.
  {
    const inEngine = reg
      .filter((c) => c.he.startsWith("מעבר_") && !c.deprecated)
      .map((c) => c.he);
    ok("the engine has breaks to be reachable", inEngine.length >= 4);
    const doored = new Set(Object.values(BREAK_COMMAND));
    check(
      "every break the engine offers has a door",
      inEngine.filter((he) => !doored.has(he)),
      [],
    );

    // …and the other direction, which is the half that rots: a door to a command
    // the engine stopped publishing inserts a call nothing defines.
    const known = new Set(reg.map((c) => c.he));
    check(
      "and every door names a command the engine defines",
      Object.entries(BREAK_COMMAND)
        .filter(([, he]) => !known.has(he))
        .map(([id, he]) => `${id} → ${he}`),
      [],
    );

    // A row with no face renders `undefined` beside its name, and a row with no
    // words renders the key it was looked up by. Both are what a hand-kept list
    // fails as, which is the whole reason this one is checked.
    check(
      "every break has a glyph",
      BREAKS.filter((id) => !BREAK_GLYPH[id]),
      [],
    );
    for (const lang of ["he", "en"]) {
      check(
        `every break is named and explained in ${lang}`,
        BREAKS.filter((id) => !DICTS[lang][id] || !DICTS[lang][id + "Lede"]),
        [],
      );
    }

    // `hiddenBreak` is the one member that is not a registry command — a comment
    // pair the editor writes, so the break is in the source and never on the
    // page. Stated here so that "every other member has a command" is an
    // assertion rather than an omission.
    check(
      "every break but the hidden one inserts a command",
      BREAKS.filter((id) => id !== "hiddenBreak" && !BREAK_COMMAND[id]),
      [],
    );
    ok("…and the hidden one deliberately does not", !BREAK_COMMAND.hiddenBreak);
  }

  // The specific pair the finding is about, asserted by value rather than by
  // shape — because "they agree" is the claim, and the claim was false.
  {
    const bullets = byHebrew.get(ACTION_COMMAND.bullets);
    ok("the bullet command exists", !!bullets);
    check(
      "and the list it writes has the two items the registry declares",
      (bullets?.insert.match(/פריט\[/g) ?? []).length,
      2,
    );
  }

  // The table snippet was written out three times and the three happened to
  // agree, which is luck and not a property. There is one now.
  {
    const table = byHebrew.get(ACTION_COMMAND.table);
    ok("the table command exists", !!table);
    // `commands.rs:97-102` records what this fixed: a bare `עמודות: 2` lets
    // Typst size each column to its contents, so an empty new table rendered as
    // a thumbnail shoved against the margin.
    ok(
      "and it declares track sizes rather than a bare column count",
      /עמודות:\s*\(/.test(table?.insert ?? ""),
    );
  }
}
