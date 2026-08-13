// The menu taxonomy, and the fence that keeps it total.
//
// The finding was that Insert held every category the registry publishes,
// including the eighteen commands that change text already written — bold,
// italic, colour, three alignments. `menus.ts` states the rule; this holds it to
// the registry, in both directions, so that a category added in Rust cannot
// quietly appear in the wrong menu and cannot quietly appear in none.

import { check, notOk, ok } from "./harness.mjs";
import { MENU_OF, categoriesIn, menuOf } from "../.tmp-test/menus.mjs";
import { ACTION_COMMAND, PLACED_COMMANDS, actionForCommand } from "../.tmp-test/actions.mjs";
import { DEFAULT_KEYS } from "../.tmp-test/bindings.mjs";
import { commands } from "../tools/commands.mjs";

export async function run() {

// -------------------------------------------------- 1. every category is placed
//
// The fence. `menuOf` falls back to Insert so that an unplaced category can
// never vanish from the product entirely — a command in the wrong menu is a
// nuisance, a command in no menu is a feature nobody can find — and this is what
// keeps the fallback a floor rather than a habit.
{
  const cats = [...new Set(commands().map((c) => c.category))];
  ok("the registry publishes categories", cats.length > 5);
  check(
    "every category the engine publishes has a menu",
    cats.filter((c) => !(c in MENU_OF)),
    [],
  );
  check(
    "and every placement names a category the engine publishes",
    Object.keys(MENU_OF).filter((c) => !cats.includes(c)),
    [],
  );
}

// -------------------------------------------------- 2. the rule, as cases
//
// Insert puts something new on the page; Format changes what is already there.
// Stated as the four cases that were wrong, so that the sentence in the module
// comment has something behind it.
{
  check("bold changes what is written", menuOf("style"), "format");
  check("alignment changes what is written", menuOf("align"), "format");
  check("a footnote puts something on the page", menuOf("footnote"), "insert");
  check("so does an image", menuOf("image"), "insert");
  check("a table brings its own menu", menuOf("table"), "table");
  check("an unplaced category still reaches a writer", menuOf("nonesuch"), "insert");
}

// -------------------------------------------------- 3. the three menus partition
{
  const cats = [...new Set(commands().map((c) => c.category))];
  const insert = categoriesIn("insert", cats);
  const format = categoriesIn("format", cats);
  const table = categoriesIn("table", cats);
  check("nothing is shown twice", insert.length + format.length + table.length, cats.length);
  check("and nothing is shown nowhere", [...insert, ...format, ...table].sort(), [...cats].sort());
  // Order is the registry's, not this module's: it is already the order the
  // palette, the completions and the help page present.
  check("the order is the registry's", insert, cats.filter((c) => insert.includes(c)));
}

// -------------------------------------------------- 4. contents left the list
//
// It was `list`, with nothing anywhere saying why — a table of contents is not a
// list somebody types, it is generated from the headings the same way a
// cross-reference is generated from its target.
{
  const toc = commands().find((c) => c.en === "toc");
  ok("the registry still has a table of contents", !!toc);
  check("and it is a cross-reference", toc.category, "reference");
  check("so it is offered from Insert", menuOf(toc.category), "insert");
}

// -------------------------------------------------- 5. the shortcut on a row
//
// Every menu row for a command prints the key that also runs it, read through
// the live bindings. The pairing is `ACTION_COMMAND`; this checks it is
// invertible, which is what the menus rely on.
{
  const names = Object.values(ACTION_COMMAND);
  check("no two actions claim one command", new Set(names).size, names.length);
  for (const [id, he] of Object.entries(ACTION_COMMAND)) {
    check(`${id} is the door to ${he}`, actionForCommand(he), id);
  }
  ok("a command with no door has no key to print", actionForCommand("ציטוט") === undefined);
  // The thirteen that had a key all along and no surface that listed a command
  // ever printed it.
  const withKeys = Object.keys(ACTION_COMMAND).filter((id) => DEFAULT_KEYS[id]);
  ok("most doors ship a key", withKeys.length >= 13, `${withKeys.length} of ${names.length}`);
}

// -------------------------------------------------- 6. the one door that places
//
// `toc` does not splice its command in at the caret: a table of contents goes at
// the top of the document and there may only be one. The exception is declared
// beside the rule so the shell cannot grow a silent special case.
{
  check("one command is placed rather than inserted", [...PLACED_COMMANDS], ["toc"]);
  for (const id of PLACED_COMMANDS) {
    ok(`${id} is still a door to a command`, id in ACTION_COMMAND);
  }
}

// -------------------------------------------------- 7. the drawer's own key
{
  ok("every command has a door of its own", !!DEFAULT_KEYS.commandsDrawer);
  ok(
    "beside the palette's, not on top of it",
    DEFAULT_KEYS.commandsDrawer !== DEFAULT_KEYS.palette,
  );
  notOk(
    "and nothing else holds it",
    Object.entries(DEFAULT_KEYS).some(
      ([id, key]) => id !== "commandsDrawer" && key === DEFAULT_KEYS.commandsDrawer,
    ),
  );
}

}
