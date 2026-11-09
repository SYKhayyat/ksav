import { check, notOk, ok } from "./harness.mjs";
import { analyze, enclosingGroups, findNextCloser, moveOutTarget, pairedDelimiters } from "../.tmp-test/brackets.mjs";
import { DEFAULTS } from "../.tmp-test/settings.mjs";

// Bracket healing: the speculative repair that keeps the preview alive while
// a command is half-typed. Its invariant — healed text is balanced, and
// healing it again changes nothing — is the last block in this file.
export async function run() {

// 0. what closes itself as you type — two switches, not one.
{
  const both = pairedDelimiters(true, true);
  const bracketsOnly = pairedDelimiters(true, false);
  const quotesOnly = pairedDelimiters(false, true);
  ok("brackets bring the maths delimiter with them", bracketsOnly.includes("$"));
  notOk("…and not the gershayim", bracketsOnly.includes('"'));
  ok("quotes are the gershayim and the geresh", quotesOnly.includes('"') && quotesOnly.includes("'"));
  notOk("…and bring no bracket with them", quotesOnly.includes("("));
  check("neither is everything off", pairedDelimiters(false, false), []);
  check("both is the union", both.length, bracketsOnly.length + quotesOnly.length);
  // The default, said here rather than only in the settings file: brackets
  // pair, quotes do not. In Hebrew `"` and `'` stand inside words several times
  // a line, so pairing them by default would be the product fighting the writer.
  ok("brackets ship on", DEFAULTS.autoPairBrackets === true);
  ok("quotes ship off", DEFAULTS.autoPairQuotes === false);
}

// 1. balanced document — nothing to report, healed === input
{
  const t = `#כותרת1[שלום]\n\nטקסט עם #הדגשה[הדגשה] וגם #הערה[הערה].\n`;
  const a = analyze(t);
  check("balanced: no problems", a.problems.length, 0);
  check("balanced: unchanged", a.healed, t);
}

// 2. inline unclosed — closes at end of its own line, not end of document
{
  const t = `שלום #הדגשה[עולם\nשורה שניה שלא קשורה.\n`;
  const a = analyze(t);
  check("inline: one problem", a.problems.length, 1);
  check("inline: kind", a.problems[0].kind, "unclosed");
  check("inline: names the command", a.problems[0].cmd, "הדגשה");
  check("inline: healed", a.healed, `שלום #הדגשה[עולם]\nשורה שניה שלא קשורה.\n`);
}

// 3. block unclosed — runs to the blank line, not to EOF
{
  const t = `#הערה[\n  גוף ההערה\n  עוד שורה\n\nפסקה חדשה לגמרי.\n`;
  const a = analyze(t);
  check("block: cmd", a.problems[0].cmd, "הערה");
  check("block: healed", a.healed, `#הערה[\n  גוף ההערה\n  עוד שורה]\n\nפסקה חדשה לגמרי.\n`);
}

// 4. block unclosed — stops at the next same-indent #command
{
  const t = `#הערה[\n  גוף\n#כותרת1[הבאה]\n`;
  const a = analyze(t);
  check("block/next-cmd: healed", a.healed, `#הערה[\n  גוף]\n#כותרת1[הבאה]\n`);
}

// 5. nested unclosed — closers land innermost-first at the same point
{
  const t = `#רשימה(\n  פריט[ראשון]\n  פריט[שני\n\nאחרי.\n`;
  const a = analyze(t);
  check("nested: two problems", a.problems.length, 2);
  check("nested: healed", a.healed, `#רשימה(\n  פריט[ראשון]\n  פריט[שני])\n\nאחרי.\n`);
}

// 6. THE Hebrew case: gershayim must not be treated as string delimiters
{
  const t = `#טבלה(עמודות: 2, תא[רש"י], תא[שו"ע])\n`;
  const a = analyze(t);
  check("gershayim: balanced", a.problems.length, 0);
}
{
  const t = `#טבלה(עמודות: 2, תא[רש"י], תא[שו"ע\n\nאחרי.\n`;
  const a = analyze(t);
  check("gershayim: still finds the real drop", a.problems.length, 2);
  check("gershayim: healed", a.healed, `#טבלה(עמודות: 2, תא[רש"י], תא[שו"ע])\n\nאחרי.\n`);
}

// 7. brackets inside comments are prose, not structure
{
  const t = `// כאן יש [ סוגר פתוח\n#הדגשה[טקסט]\n/* וגם [ כאן */\n`;
  check("comments ignored", analyze(t).problems.length, 0);
}
{
  const t = `http://example.com//x[y]\n`;
  check(":// is a URL not a comment", analyze(t).problems.length, 0);
}

// 8. stray closer — deleted
{
  const t = `טקסט] רגיל\n`;
  const a = analyze(t);
  check("stray: kind", a.problems[0].kind, "stray");
  check("stray: healed", a.healed, `טקסט רגיל\n`);
}

// 9. unterminated block comment
{
  const t = `טקסט\n/* פתוח ולא נסגר\n`;
  const a = analyze(t);
  check("unterminated comment flagged", a.problems.some(p => p.kind === "unterminatedComment"), true);
}

// 10. wrong-kind closer: ) closing while [ is open
{
  const t = `#צבע(אדום)[טקסט)\n\nאחרי.\n`;
  const a = analyze(t);
  check("mismatched kind: reports", a.problems.length > 0, true);
}

// 11. argument group knows its command name
{
  const t = `#כותרת(רמה: 2)[לא נסגר\n\nאחרי.\n`;
  const a = analyze(t);
  check("arg group: cmd name", a.problems[0].cmd, "כותרת");
}

// 11. Moving out of a bracket — the pair around the caret, and all of them
//
// #121: the first implementation was its own scan with a scalar `depth` and a
// `targetCloser` it overwrote, so mixed nesting could answer with the wrong
// closer. These are the cases it got wrong, one assertion each, plus the
// boundaries it had no answer for at all (a caret already touching a closer).
//
// Every case is real markup: `(` is structure only after a `#command`, which is
// the scanner's rule and not this module's, so `(ב)` in running prose is text
// and has no group to leave.
{
  // `#הדגשה[א #הערה(ב) ג]` — a paren group inside a bracket group.
  const mixed = "#הדגשה[א #הערה(ב) ג]";
  const inParen = mixed.indexOf("ב") + 1;
  check(
    "the innermost pair is the one the caret is in",
    moveOutTarget(mixed, inParen),
    mixed.indexOf(")") + 1,
  );
  check("all of them leaves the outer bracket too", moveOutTarget(mixed, inParen, "outermost"), mixed.length);

  // The failure that made this an issue: a closer *behind* the caret. The old
  // scan walked forward from `targetCloser` and could return a `]` two groups
  // earlier than the caret.
  const backwards = "#הערה[א] #הדגשה[ב]";
  const inside = backwards.lastIndexOf("ב") + 1;
  check(
    "a closer before the caret is not the one it moves out of",
    moveOutTarget(backwards, inside),
    backwards.length,
  );

  // Typed nesting, three deep, mixed: `#א[#ב[#ג(ד)]]`.
  const deep = "#א[#ב[#ג(ד)]]";
  const at = deep.indexOf("ד") + 1;
  check("innermost of three", moveOutTarget(deep, at), deep.indexOf(")") + 1);
  check("outermost of three", moveOutTarget(deep, at, "outermost"), deep.length);
  const stack = enclosingGroups(deep, at);
  check("the stack is outermost first", stack.map((g) => g.ch).join(""), "[[(");
  check("…and ends at the group the caret is in", stack[stack.length - 1].closer, ")");

  // A caret already touching a closer: `|]` steps past it, `]|` has nothing to
  // do and says so by not moving.
  const before = "#הערה[א]";
  check("a caret before a closer steps past it", moveOutTarget(before, before.length - 1), before.length);
  check("a caret after a closer does not move", moveOutTarget(before, before.length), before.length);

  // Malformed text, which is the state this editor is in for most of a
  // keystroke: a stray closer inside does not end the group early, and an
  // unclosed group has nowhere to move to.
  const stray = "#הערה[א ] ב]";
  check("a stray closer inside does not end the group early", moveOutTarget(stray, stray.indexOf("ב") + 1), stray.length);
  check("an unclosed opener has nowhere to move to", moveOutTarget("#הערה[אב", 6), null);
  check("nothing around the caret means nothing to do", moveOutTarget("שלום", 2), null);

  // Inside a comment is not structural, so the caret is not "in" a group there
  // either — the same rule the lint and the healer keep.
  const commented = "#הערה[א] // ] סוף";
  check(
    "a bracket in a comment is not a group",
    moveOutTarget(commented, commented.length),
    null,
  );

  // `findNextCloser` is the name the editor had before, kept as a reading of
  // the same answer rather than a second one.
  check("the old name answers the same", findNextCloser(deep, at), moveOutTarget(deep, at));
}

// 12. THE INVARIANT: healed text is always balanced, and healing is idempotent
{
  const cases = [
    `שלום #הדגשה[עולם\n`,
    `#הערה[\n גוף\n\nאחרי\n`,
    `#רשימה(\n פריט[א\n פריט[ב\n\nx\n`,
    `טקסט] רגיל [ועוד\n`,
    `#טבלה(עמודות: 2, תא[רש"י\n\nz\n`,
    `((([[[\n`,
    `]]])))\n`,
    ``,
  ];
  for (const [i, t] of cases.entries()) {
    const once = analyze(t).healed;
    const twice = analyze(once);
    check(`invariant ${i}: healed is balanced`, twice.problems.length, 0);
    check(`invariant ${i}: idempotent`, twice.healed, once);
  }
}
}
