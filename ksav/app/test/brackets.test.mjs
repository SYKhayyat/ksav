import { check, notOk, ok } from "./harness.mjs";
import { analyze, pairedDelimiters } from "../.tmp-test/brackets.mjs";
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
