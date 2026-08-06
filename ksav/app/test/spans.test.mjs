// One scanner, and the fences that keep it one.
//
// The finding this file exists for: ten private delimiter matchers in `src/`,
// disagreeing about `"`, `\`, `//` and `{}`, producing six reproduced one-click
// contradictions between surfaces that are supposed to be describing the same
// document. Fixing the six would have left the eleventh matcher free to arrive
// next week, so most of this file is not about the six. It is about making the
// disagreement unrepresentable and then keeping it that way:
//
//   1. a prohibition swept over `src/` — no module but `spans.ts` may hold a
//      delimiter matcher, with the one exemption named and justified;
//   2. the six divergences, each asserted from *both* surfaces that disagreed,
//      because asserting one of them is what let each of these ship;
//   3. cross-surface agreement over a corpus, which is the shape that catches
//      the seventh divergence nobody has thought of yet;
//   4. the name table checked against the engine's own prelude, so a command
//      that exists in `ksav.typ` and not here fails a test rather than quietly
//      falling out of the outline.

import { check, ok, notOk } from "./harness.mjs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import * as spans from "../.tmp-test/spans.mjs";
import * as lists from "../.tmp-test/lists.mjs";
import * as headings from "../.tmp-test/headings.mjs";
import * as tables from "../.tmp-test/table.mjs";
import * as structure from "../.tmp-test/structure.mjs";
import * as markdown from "../.tmp-test/markdown.mjs";
import * as spell from "../.tmp-test/spell.mjs";
import * as brackets from "../.tmp-test/brackets.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SRC = path.resolve(HERE, "..", "src");
const PRELUDE = path.resolve(HERE, "..", "..", "engine", "typst", "ksav.typ");

const BS = String.fromCharCode(92);

function isComment(line) {
  const s = line.trim();
  return s.startsWith("//") || s.startsWith("*") || s.startsWith("/*");
}

export async function run() {
  // ------------------------------------------------------- 1. the prohibition
  //
  // A regex can enforce "any line matching this shape is a bug" perfectly, and
  // that is exactly the guarantee wanted here: the bug was never one wrong
  // matcher, it was that writing a new one was the path of least resistance.
  const names = (await readdir(SRC)).filter((f) => f.endsWith(".ts"));
  check("there is source to check", names.length > 15, true);

  /** A function whose job is to find the delimiter matching another one. */
  const MATCHER = /\bfunction\s+match(?:Bracket|Group|Paren|Delim|InText|Delimiter)\s*\(/;
  const matchers = [];
  for (const f of names) {
    if (f === "spans.ts") continue; // the one that may
    const body = await readFile(path.join(SRC, f), "utf8");
    body.split("\n").forEach((line, i) => {
      if (!isComment(line) && MATCHER.test(line)) matchers.push(`${f}:${i + 1}`);
    });
  }
  check("no module but spans.ts defines a delimiter matcher", matchers, []);

  // The same prohibition by shape rather than by name, because the next one
  // will not be called `matchBracket`. A depth counter next to a bracket
  // literal is what all ten of them looked like.
  //
  // The window was fourteen lines and that was not enough: `notes.notesIn` was
  // the fourteenth scanner of this markup and swept clean, because its `depth`
  // counter and its first bracket literal were fifty-five lines apart. Eighty
  // covers it and still flags nothing that is here today — measured, not
  // guessed. It looks forward only, so the one shape it cannot see is a
  // backwards walk: `mode.ts`'s `nameBefore` is one, it is genuinely wrong on
  // `#הערה("א)ב")[גוף]` (verified — `enclosing` answers `[]` there and
  // `["הערה"]` without the paren), and it is a finding rather than an
  // exemption. Widening the window in that direction should come with the fix.
  const WINDOW = 80;
  const DEPTH = /\b(?:let|var)\s+depth\s*=/;
  const BRACKET_LITERAL = /["'](?:\[|\(|\{|\]|\)|\})["']|0x5[bd]|0x2[89]|0x7[bd]/;
  const counters = [];
  for (const f of names) {
    // `spans.ts` owns this. `bidi.ts` keeps one and says why: it supplies a
    // direction only to lines with no letter in them, it runs against a
    // viewport on every scroll, and the worst a miscount can do is make a blank
    // line inherit from the wrong earlier line. That is an argued exemption
    // rather than an oversight, so it is named here instead of being invisible.
    if (f === "spans.ts" || f === "bidi.ts") continue;
    const body = await readFile(path.join(SRC, f), "utf8");
    const lines = body.split("\n");
    lines.forEach((line, i) => {
      if (isComment(line) || !DEPTH.test(line)) return;
      const window = lines.slice(i, i + WINDOW).filter((l) => !isComment(l)).join("\n");
      if (BRACKET_LITERAL.test(window)) counters.push(`${f}:${i + 1}`);
    });
  }
  check("no module but spans.ts counts bracket depth", counters, []);

  // ------------------------------------------ 2. the six, from both surfaces

  // (1) A gershayim used to switch off every list operation, because this
  // file's matcher read `"` as a string opener and the engine does not.
  {
    const withG = `#רשימה(\n  פריט[דברי רש"י],\n  פריט[שני],\n)`;
    const plain = `#רשימה(\n  פריט[דברי רשי],\n  פריט[שני],\n)`;
    const at = withG.indexOf("דברי") + 2;
    ok("a list survives a gershayim", lists.listAt(withG, at) !== null);
    check(
      "and offers exactly what the same list without one offers",
      structure.availableAt(withG, at).length,
      structure.availableAt(plain, plain.indexOf("דברי") + 2).length,
    );
    check("both items are found", lists.listAt(withG, at).items.length, 2);
    // The same text in a table cell always worked, which is how one document
    // had two answers. Now they are the same answer.
    const tbl = `#טבלה(עמודות: 2,\n  תא[דברי רש"י], תא[שני],\n)`;
    check("a table cell reads it the same way", tables.tableAt(tbl, tbl.indexOf("דברי") + 2).cells.length, 2);
    ok("and the export keeps the abbreviation", markdown.toMarkdown(withG).includes(`רש"י`));
  }

  // (2) `list.hebrew` produced a list that prose mode had never heard of.
  {
    const src = `#רשימה(פריט[א],)`;
    const hebrew = lists.setKind(src, lists.listAt(src, 10), "hebrew").text;
    ok("the ribbon writes #ממוספרת_עברית", hebrew.includes("ממוספרת_עברית"));
    const node = spans.scan(hebrew).nodes.find((n) => n.role === "list");
    ok("and the scanner every surface reads knows it is a list", node != null);
    check("as a Hebrew-lettered one", node.listKind, "hebrew");
    for (const name of ["רשימה", "ממוספרת", "ממוספרת_עברית", "bullets", "numbered", "henum"]) {
      const doc = `#${name}(פריט[א],)`;
      ok(`prose mode sees #${name}`, spans.scan(doc).nodes.some((n) => n.role === "list"));
    }
  }

  // (3) `heading.demote` on `#h6` erased the section from the outline.
  {
    const doc = `#h6[Six]\n\nbody\n`;
    const demoted = headings.demote(doc, headings.headingAt(doc, 2)).text;
    ok("demote past six writes #hlevel", demoted.includes("hlevel"));
    check("and the section is still in the outline", markdownOutlineLevels(demoted), [7]);
    check("and the editing model still finds it", headings.headings(demoted).length, 1);
  }

  // (4) English headings past three printed their own markup in prose mode.
  {
    for (const [doc, level] of [
      ["#h4[Four]", 4],
      ["#h5[Five]", 5],
      ["#h6[Six]", 6],
      ["#hlevel(level: 8)[Deep]", 8],
      ["#כותרת[רגילה]", 1],
      ["#כותרת(רמה: 7)[עמוקה]", 7],
    ]) {
      const n = spans.scan(doc).nodes[0];
      check(`${doc} is a heading`, n.role, "heading");
      check(`…at level ${level}`, n.level, level);
    }
  }

  // (5) A sefer of simanim outlined and folded and had no operations at all.
  {
    const doc = `#סימן("א", [דיני תפילה])\n\nראשון\n\n#סימן("ב", [דיני ברכות])\n\nשני\n`;
    check("both simanim are in the outline", markdownOutlineLevels(doc), [1, 1]);
    check("and in the editing model", headings.headings(doc).length, 2);
    const at = doc.indexOf("ראשון");
    check("standing in a siman's body is standing in a heading", structure.structureAt(doc, at), "heading");
    ok("and the ribbon offers operations there", structure.availableAt(doc, at).length > 0);
    const h = headings.sectionAt(doc, at);
    ok("moving a siman works — it is a text move", headings.moveSection(doc, h, 1) !== null);
    ok("deleting one works", headings.deleteSection(doc, h) !== null);
    // The prelude writes `heading(level: 1, …)` with the level in the
    // definition, so there is no `#סימן` at level 2. Refusing is the honest
    // answer; rewriting it to `#כותרת2` would drop the siman's number.
    check("demoting one does not, and says so", headings.demote(doc, h), null);
    check("neither does unwrapping it", headings.unwrapHeading(doc, h), null);
  }

  // (6) One click on `table.widerColumn` reflowed a three-column table into two.
  {
    const doc = `#טבלה(עמודות: (2fr, 1fr, 1fr),\n  תא[א], תא[ב], תא[ג],\n)`;
    const t = tables.tableAt(doc, doc.indexOf("תא") + 1);
    check("the editing model reads three columns", t.cols, 3);
    const node = spans.scan(doc).nodes.find((n) => n.role === "table");
    check("and so does every other reader", node.cols, 3);
    check("with the track list intact", node.widths, ["2fr", "1fr", "1fr"]);
    ok("the export agrees", markdown.toMarkdown(doc).split("\n")[0].split("|").length === 5);
    // And the round trip the ribbon actually performs.
    const wider = structure.actionById("table.widerColumn").run(doc, doc.indexOf("תא") + 1);
    check("after widening a column it is still three columns", tables.tableAt(wider.text, wider.text.indexOf("תא") + 1).cols, 3);
  }

  // ------------------------------------------- 3. agreement over a corpus
  //
  // The six above are the ones somebody found. This is the shape that catches
  // the seventh: every surface is asked about the same documents and has to
  // give the same answer about what is in them.
  const CORPUS = [
    `#רשימה(פריט[רש"י],)`,
    `#ממוספרת_עברית(פריט[א], פריט[ב],)`,
    `#טבלה(עמודות: (1fr, 2fr),\n  תא[א], תא[ב],\n)`,
    `#טבלה(עמודות: 2,\n  כותרת_תא[א], כותרת_תא[ב],\n  תא[ג], מיזוג(2)[ד],\n)`,
    `#כותרת2[פרק] #הערה[מקור "נאמן"]`,
    `#hlevel(level: 7)[Deep]\n\nbody`,
    `#סימן("א", [דיני תפילה])`,
    `#הדגשה[סוגר ${BS}] בתוך]`,
    `#הערה_זרם("a)b")[גוף]`,
    `// #הערה[מוסתרת]\n#הדגשה[גלויה]`,
    `#רשימה(פריט[חיצוני #רשימה(פריט[פנימי],)],)`,
    `#צבע(rgb("#b91c1c"))[אדום]`,
  ];
  for (const doc of CORPUS) {
    const s = spans.scan(doc);
    const label = JSON.stringify(doc.slice(0, 34));

    // Every list the scanner reports, the list editor finds — and vice versa.
    for (const n of s.nodes.filter((n) => n.role === "list")) {
      const found = lists.listAt(doc, n.args.from);
      ok(`${label}: the list editor finds the list at ${n.from}`, found !== null);
      if (found) check(`${label}: …at the same place`, found.from, n.from);
    }
    // Every table the scanner reports, the table editor finds, with the same
    // column count. This is the pair that disagreed about track lists.
    for (const n of s.nodes.filter((n) => n.role === "table")) {
      const found = tables.tableAt(doc, n.args.from);
      ok(`${label}: the table editor finds the table`, found !== null);
      if (found) check(`${label}: …with the same columns`, found.cols, n.cols);
    }
    // Every heading the scanner reports is in the outline and in the model.
    const scanned = s.nodes.filter((n) => n.role === "heading" && startsLine(doc, n.from));
    check(`${label}: outline and scan agree on headings`, markdownOutlineLevels(doc).length, scanned.length);
    check(`${label}: the model agrees too`, headings.headings(doc).filter((h) => startsLine(doc, h.from)).length, scanned.length);

    // A document the scanner reads as balanced is one the bracket linter calls
    // balanced. These two disagreeing is what made the heal corrupt valid text.
    check(`${label}: the bracket linter finds nothing wrong`, brackets.analyze(doc).problems.length, 0);
    check(`${label}: …so healing is a no-op`, brackets.analyze(doc).healed, doc);

    // No command name survives into the export or into the spell checker.
    const md = markdown.toPlainText(doc);
    for (const n of s.nodes) {
      notOk(`${label}: #${n.name} does not leak into the export`, md.includes("#" + n.name));
      notOk(
        `${label}: #${n.name} is not offered to the spell checker`,
        spell.checkableText(doc).includes(n.name) && !isProse(doc, s, n.name),
      );
    }
  }

  // ------------------------------------ 4. the name table against the engine

  const prelude = await readFile(PRELUDE, "utf8");
  const defined = new Set();
  for (const m of prelude.matchAll(/^#let\s+([A-Za-z֐-׿_][A-Za-z0-9֐-׿_]*)/gmu)) {
    defined.add(m[1]);
  }
  ok("the prelude was read", defined.size > 200);
  const missing = spans.STRUCTURAL_NAMES.filter((n) => !defined.has(n));
  check("every name the scanner knows is a command the engine defines", missing, []);

  // The other direction, which is the one that actually rots: a command the
  // prelude defines as a `heading()` and the scanner has never heard of would
  // be invisible to the outline, to folding and to every heading operation —
  // exactly how `#hlevel` and `#סימן` each came to be known to one surface.
  const headingProducers = [];
  for (const m of prelude.matchAll(/^#let\s+([A-Za-z֐-׿_][A-Za-z0-9֐-׿_]*)\s*\(([^)]*)\)\s*=\s*(.*)$/gmu)) {
    if (/\bheading\(/.test(m[3])) headingProducers.push(m[1]);
  }
  ok("the prelude has heading-producing commands", headingProducers.length >= 8);
  const unknown = headingProducers.filter(
    (n) => spans.scan(`#${n}[x]`).nodes[0]?.role !== "heading",
  );
  check("the scanner classifies every one of them as a heading", unknown, []);

  // And the inverse claim this file makes on purpose: `#שער` is *not* one. It
  // is `align(center, text(…))` with no `heading()` in it, so it never enters a
  // compiled `#תוכן` — and the outline pane listed it at level 1 anyway, so the
  // two surfaces that display a document's structure disagreed about what the
  // structure was.
  for (const name of ["שער", "title", "תת_שער", "subtitle"]) {
    // Not `\b`: JavaScript's word boundary is defined on `[A-Za-z0-9_]`, so the
    // position between `ר` and `(` is not one and `#let שער\b` matches nothing
    // at all. The codebase documents this trap twice, in `headings.ts` and in
    // `addContents`, and this test walked straight into it on the first run.
    const def = prelude.match(new RegExp(`^#let\\s+${name}(?![A-Za-z0-9֐-׿_]).*$`, "mu"))?.[0] ?? "";
    ok(`the prelude defines #${name}`, def.length > 0);
    notOk(`#${name} does not call heading()`, /\bheading\(/.test(def));
    check(`…so the scanner does not call it a section`, spans.scan(`#${name}[x]`).nodes[0].role, "other");
  }
  {
    const doc = `#שער[הכותרת]\n\n#כותרת1[פרק]\n\nגוף\n`;
    const rows = markdownOutline(doc);
    check("the title is still offered for navigation", rows.length, 2);
    check("but only the heading is a section", rows.filter((r) => r.section).length, 1);
    check("and the title sits above every level", rows[0].level, 0);
  }

  // -------------------------------------------------- the memo is transparent
  //
  // `scan` is memoised so that "one scan" is true at runtime and not only in
  // the source. A memo that could return a stale answer would be a worse bug
  // than the one this file fixes, so: same text, same answer; changed text,
  // changed answer.
  {
    const a = `#רשימה(פריט[א],)`;
    const b = `#רשימה(פריט[א], פריט[ב],)`;
    // Identity, not deep equality: the node tree is cyclic (`parent`/`children`),
    // which is also why nothing in this file ever hands a whole node to `check`.
    ok("a repeat scan is the same object", spans.scan(a) === spans.scan(a));
    check("a different document is scanned afresh", spans.scan(b).nodes.length, 3);
    check("and the first one is still right", spans.scan(a).nodes.length, 2);
    spans.clearScanCache();
    check("dropping the memo changes nothing about the answer", spans.scan(a).nodes.length, 2);
  }
}

// -------------------------------------------------------------------- helpers

function startsLine(doc, pos) {
  return doc.slice(doc.lastIndexOf("\n", pos - 1) + 1, pos).trim() === "";
}

/** The outline as `ksav-lang` reports it, without importing CodeMirror. */
function markdownOutline(doc) {
  // `ksav-lang.ts` imports @codemirror/view, which the test bundle stubs out;
  // the outline is pure and lives beside it, so it is reconstructed here from
  // the same scan it uses. Rebuilding it means this file checks the *rule*
  // rather than re-running the implementation and agreeing with itself.
  const rows = [];
  for (const n of spans.scan(doc).nodes) {
    if (!startsLine(doc, n.from)) continue;
    if (n.role === "heading") rows.push({ level: n.level, section: true });
    else if (n.name === "שער" || n.name === "title") rows.push({ level: 0, section: false });
  }
  return rows;
}

function markdownOutlineLevels(doc) {
  return markdownOutline(doc).filter((r) => r.section).map((r) => r.level);
}

/** Is this name also a word in the document's prose? */
function isProse(doc, s, name) {
  for (const g of s.contentGroups) {
    if (doc.slice(g.from, g.to).includes(name)) return true;
  }
  return false;
}
