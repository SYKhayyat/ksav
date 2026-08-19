// The ribbon's groups, held to the same taxonomy the menubar is held to.
//
// # The finding
//
// A writer said: *"Table is still under lists. That is not at all accurate."*
// They were looking at `main.ts`, where the ribbon read
//
//     tbGroup(t("cat.list"), [b("רשימה", "•"), b("ממוספרת", "1."), b("טבלה", "▦")]),
//
// — the table button hand-placed inside the group captioned **Lists**.
//
// The word doing the work in that report is *still*. Tables already had their
// own menu (`menus.ts`, whose header says so in as many words) and every table
// command was already categorised `table` in `commands.rs`. Both places that
// *publish* the taxonomy were right. The one place a writer actually looks was
// wrong, and had been through the entire menu rewrite, because the ribbon is
// assembled by hand and consults neither.
//
// # Why a test and not just a fix
//
// Moving one button costs a line. What that line does not buy is any reason to
// believe the next hand-placed button lands in the right group — and the last
// one survived a deliberate rewrite of exactly this taxonomy, in silence. The
// defect is not the misfiled button; it is that nothing could see it.
//
// The check is possible at all because the captions **are** registry category
// keys: `tbGroup(t("cat.table"), …)` names a category the engine publishes, so
// membership can be asked of the registry rather than of a second list kept
// here. A group whose caption is not a `cat.*` key — the paragraph-style
// dropdown, the tools group — is not making a claim about categories and is
// skipped rather than guessed at.
//
// # On reading `main.ts` as text
//
// `chrome.test.mjs`'s header is a long argument against exactly this, and it is
// right about what it describes: that file identified surfaces by the *names of
// locals*, over 5,600 lines, and two pure renames blinded it. The shape matched
// here is not a name that might recur — it is the literal call `tbGroup(t("cat.
// X"), [ … ])`, which occurs only in the toolbar and only where a group is
// declared. The mutation that matters is checked below: move a button between
// groups and this file goes red.

import { check, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";
import { commands } from "../tools/commands.mjs";

const MAIN = readFileSync(path.join(dirOf(import.meta.url), "..", "src", "main.ts"), "utf8");

/**
 * Every `tbGroup(t("…"), [ … ])` in the file, as `{ caption, body }`.
 *
 * Bracket-matched rather than regex-terminated: a group's body contains nested
 * brackets (`b("x", "•")`, object literals) and a lazy `\]` stops at the first
 * of them, which credits a group with three buttons when it has five.
 */
function groups() {
  const out = [];
  const open = /tbGroup\(t\("([^"]+)"\),\s*\[/g;
  for (let m; (m = open.exec(MAIN)); ) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < MAIN.length && depth > 0; i++) {
      if (MAIN[i] === "[") depth++;
      else if (MAIN[i] === "]") depth--;
    }
    out.push({ caption: m[1], body: MAIN.slice(m.index + m[0].length, i - 1) });
  }
  return out;
}

/** A group's body with its comments removed — a command name quoted in prose is
 *  not a button, and the groups here carry long ones. */
function code(body) {
  return body.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
}

/** The Hebrew command names a group's `b("…", …)` buttons insert. */
function buttonsIn(body) {
  // `\bb\(` and not `b\(`, so `guest(…)` is not counted here — a guest is
  // checked separately, and by a rule that is deliberately different.
  return [...code(body).matchAll(/(?:^|[^A-Za-z0-9_])b\("([^"]+)"/g)].map((m) => m[1]);
}

/**
 * A group's declared guests: `guest("command", "glyph", "why")`.
 *
 * The reason is captured because it is the thing being required. A guest whose
 * justification is an empty string is an exception with no argument behind it,
 * which is the state this mechanism exists to make impossible to reach quietly.
 */
function guestsIn(body) {
  return [...code(body).matchAll(/\bguest\("([^"]+)",\s*"[^"]*",\s*"([^"]*)"/g)].map((m) => ({
    command: m[1],
    why: m[2],
  }));
}

export async function run() {
  const reg = commands();
  const byHe = new Map(reg.map((c) => [c.he, c]));
  const categories = new Set(reg.map((c) => c.category));
  const found = groups();

  // The parse itself, asserted before anything is concluded from it. A regex
  // that silently matches nothing turns every check below into a check of an
  // empty list, which is the cheapest possible green.
  ok("the toolbar declares groups", found.length >= 5);
  ok(
    "the toolbar's groups carry buttons",
    found.reduce((n, g) => n + buttonsIn(g.body).length, 0) >= 10,
  );

  // ------------------------------------------------- 1. captions are real
  //
  // A caption of `cat.X` claims the engine publishes a category `X`. A typo
  // here would put a group under a key that resolves to nothing and files its
  // buttons under a heading no writer can match to anything else in the product.
  {
    const claimed = found.map((g) => g.caption).filter((c) => c.startsWith("cat."));
    check(
      "every cat.* group caption names a category the engine publishes",
      claimed.filter((c) => !categories.has(c.slice(4))),
      [],
    );
  }

  // ------------------------------------------------- 2. membership matches
  //
  // The one that was red. `#טבלה` is categorised `table` and sat under
  // `cat.list`.
  {
    const wrong = [];
    for (const g of found) {
      if (!g.caption.startsWith("cat.")) continue;
      const want = g.caption.slice(4);
      for (const he of buttonsIn(g.body)) {
        const cmd = byHe.get(he);
        if (!cmd) {
          wrong.push(`${he} (in ${g.caption}) is not a registry command`);
          continue;
        }
        if (cmd.category !== want) wrong.push(`${he} is ${cmd.category}, shown under ${g.caption}`);
      }
    }
    check("every button sits in the group its category names", wrong, []);
  }

  // ------------------------------------------------- 2b. guests are declared
  //
  // The escape hatch, kept narrow. A guest is a button the ribbon puts
  // somewhere its category does not name *on purpose* — the ribbon groups by
  // what a writer reaches for, the registry by what a command is — and the only
  // thing required of one is that it be a real command and carry a stated
  // reason. The exception lives beside the button in `main.ts`, never in a list
  // here: a list here would be a second opinion about the taxonomy, kept in the
  // file whose whole job is to hold no opinion of its own.
  {
    const guests = found.flatMap((g) => guestsIn(g.body));
    check(
      "every declared guest is a registry command",
      guests.filter((g) => !byHe.has(g.command)).map((g) => g.command),
      [],
    );
    check(
      "every declared guest says why it is a guest",
      guests.filter((g) => g.why.trim().length < 10).map((g) => g.command),
      [],
    );
  }

  // ------------------------------------------------- 3. tables have a home
  //
  // Named explicitly rather than left implicit in (2), because (2) is also
  // satisfied by deleting the button — and a table nobody can insert from the
  // ribbon is a worse answer to the report than the misfiling was.
  {
    const table = found.find((g) => g.caption === "cat.table");
    ok("the ribbon has a Tables group", Boolean(table));
    ok("the Tables group can insert a table", Boolean(table && buttonsIn(table.body).includes("טבלה")));
    const lists = found.find((g) => g.caption === "cat.list");
    ok("the Lists group no longer holds the table", Boolean(lists) && !buttonsIn(lists.body).includes("טבלה"));
  }
}
