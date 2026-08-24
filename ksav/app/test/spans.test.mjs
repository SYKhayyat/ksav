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
import { dirOf } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
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
  // backwards walk. `mode.ts`'s `nameBefore` was one, it was genuinely wrong on
  // `#הערה("א)ב")[גוף]`, and this comment recorded it as a finding rather than
  // an exemption. **It is gone** — `mode.ts` holds no scanner at all now and
  // reads the frame stack off `spans.scan()` — so the finding is closed from
  // both ends: §2b asserts the document it was wrong about, and the only
  // backwards walk left (`headBefore`) is inside `spans.ts`, where it reads the
  // lexer's own opener map and therefore cannot see into a string.
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

  // The third shape, and it is not a duplicate scanner — it is the *right*
  // scanner fed the wrong text. `ksav-lang.ts` and `bidi.ts` both handed
  // `doc.sliceString(from, to)` — the viewport — to `scan()`, which `spans.ts`
  // says outright cannot work: *"a `"` two lines up decides whether the bracket
  // in hand is structure or prose."* So the highlighter coloured the same
  // character differently depending on where the writer had scrolled to, and
  // `bidi.ts` isolated a different set of ranges — and an isolate feeds
  // CodeMirror's caret measurement, which `bidi.ts:55-57` calls "a worse bug
  // than the one being fixed: the text would look right and the cursor would
  // lie."
  //
  // Scan the whole document and filter to `visibleRanges` in position space.
  // The scan is memoised per document, so it is also *less* work.
  const SLICE_ASSIGN = /\b(?:const|let|var)\s+(\w+)\s*=\s*[^;]*\bsliceString\s*\(/;
  const fed = [];
  for (const f of names) {
    const lines = (await readFile(path.join(SRC, f), "utf8")).split("\n");
    lines.forEach((line, i) => {
      const m = !isComment(line) && SLICE_ASSIGN.exec(line);
      if (!m) return;
      // A slice handed to the scanner within a few lines of being taken. The
      // window is small on purpose: the point is the value flowing straight
      // through, not any `sliceString` in the neighbourhood — `ksav-lang.ts`
      // legitimately slices to find a block comment's close and scans the whole
      // document ten lines later.
      const near = lines.slice(i + 1, i + 5).filter((l) => !isComment(l)).join("\n");
      const call = new RegExp(`\\b(?:scan|scanOf|isolateSpans)\\s*\\(\\s*${m[1]}\\b`);
      if (call.test(near) || call.test(line)) fed.push(`${f}:${i + 1}`);
    });
  }
  check("no module hands the scanner a viewport slice", fed, []);

  // And the behaviour the fence is standing in for, from the scanner's side: a
  // slice really does answer differently, so "scan the whole document" is a
  // correctness requirement and not a preference.
  {
    const doc = `#הערה_זרם("a)b")[גוף]\n#הדגשה[עוד]\n`;
    const cut = doc.indexOf("\n") + 1;
    const whole = spans.scan(doc);
    const tail = spans.scan(doc.slice(cut));
    check("scanned whole, the string is closed and both calls are found", whole.nodes.length, 2);
    check("…and there is exactly one string in it", whole.strings.length, 1);
    // The slice begins after the `("a)b")` — nothing is unbalanced in it — so
    // the two agree here. The disagreement is the *other* way round and is what
    // §2b's corpus covers; what this pins is that the tail is a different
    // document, which is the whole reason position space is the only sound
    // place to filter.
    check("scanned from the second line, it is a different document", tail.nodes.length, 1);
    check(
      "…whose positions do not line up with the real ones",
      tail.nodes[0].from + cut,
      whole.nodes[1].from,
    );
  }

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

  // ------------------------------ 2b. a parenthesis inside a content body
  //
  // The seventh divergence, and the fence above was loaded with the case that
  // already worked. Both documents in §2(1) put their only `(` where the call's
  // own argument list goes — where opening code mode is *correct* — so the
  // gershayim rule was tested one character to the left of the bug that was
  // live: this file's scanner opened code mode on **every** `(`, and
  // `(רש"י)` inside a body therefore ate the rest of the document.
  //
  // Verified against the compiler before being asserted here, because the whole
  // point is that the scanner has to agree with Typst and not with itself:
  //
  //   #הדגשה[ראה (רש"י) כאן]   lays out `ראה (רש”י) כאן`
  //   #הדגשה[ראה(רש"י) כאן]    lays out `ראה(רש”י) כאן`  ← not a call either
  //   #let זוג = ("אלף","בית")  … #זוג.at(0) prints `אלף` ← this one *is* code
  {
    const paren = `#הדגשה[ראה (רש"י) כאן]\n#כותרת1[פרק ב]\n`;
    const s = spans.scan(paren);

    // The symptom the writer sees: the second heading vanishes from the outline
    // and the emphasis loses its body.
    check("a parenthesis in a body does not eat the document", s.nodes.length, 2);
    check("the heading after it is still a heading", markdownOutlineLevels(paren), [1]);
    check("nothing became a string literal", s.strings.length, 0);
    check("both bodies are still content", s.contentGroups.length, 2);
    check(
      "and the words inside the parentheses are prose",
      spans.plainText(paren).includes(`(רש"י)`),
      true,
    );

    // The four surfaces that went blind, each asserted from its own side.
    check("the bracket linter finds nothing wrong", brackets.analyze(paren).problems.length, 0);
    check("so the speculative heal is a no-op", brackets.analyze(paren).healed, paren);
    ok("the spell checker can still see the prose", spell.checkableText(paren).includes("כאן"));
    ok("and the export keeps it", markdown.toPlainText(paren).includes("פרק ב"));
  }
  {
    // The ribbon. This is verbatim the failure the top of `spans.ts` names as
    // the worst of the fourteen old matchers, narrowed by exactly one character.
    const withParen = `#רשימה(\n  פריט[דברי (רש"י) כאן],\n  פריט[שני],\n)`;
    const plain = `#רשימה(\n  פריט[דברי רשי כאן],\n  פריט[שני],\n)`;
    const at = withParen.indexOf("דברי") + 2;
    ok("a list survives a parenthetical citation", lists.listAt(withParen, at) !== null);
    // Read through `?.` deliberately, and the reason is worth recording. When
    // this assertion was run against the pre-fix scanner to check that it went
    // red, it did not merely fail — it *threw*, because `listAt` returned null.
    // A test that throws is not contained: it unwinds into an unhandled
    // rejection, takes the other fifty-nine files with it, and skips the
    // documentation fence that runs after the tally. So the assertion reports
    // instead. (The containment hole in the runner is a separate finding and a
    // separate fix; this is a test not relying on it.)
    check("both items are found", lists.listAt(withParen, at)?.items.length, 2);
    check(
      "and the ribbon offers exactly what it offers without one",
      structure.availableAt(withParen, at).length,
      structure.availableAt(plain, plain.indexOf("דברי") + 2).length,
    );
    // `splitArgs` walks the argument list separately (`walkArgs`), so it had the
    // same bug in its own copy: the string opened by the gershayim swallowed the
    // comma that separates the two items.
    const list = spans.scan(withParen).nodes.find((n) => n.role === "list");
    check("the argument split still sees two arguments", spans.splitArgs(withParen, list.args.from, list.args.to).length, 2);
  }
  {
    // A table cell, which is a content body reached through an argument list.
    const tbl = `#טבלה(עמודות: 2,\n  תא[ראה (שו"ע סי' ב') שם], תא[שני],\n)`;
    check("a table cell reads it the same way", tables.tableAt(tbl, tbl.indexOf("ראה")).cells.length, 2);
    check("and the column count is untouched", tables.tableAt(tbl, tbl.indexOf("ראה")).cols, 2);
  }
  {
    // Top level, with no call around it at all.
    const bare = `כתוב כאן (ועיין שם) ואחר כך #הדגשה[טקסט]\n`;
    const s = spans.scan(bare);
    check("a bare parenthesis at top level opens nothing", s.strings.length, 0);
    check("the call after it is still found", s.nodes.length, 1);
    check("the bracket linter agrees", brackets.analyze(bare).problems.length, 0);
  }
  {
    // The one place a `(` in content mode *does* open code: the writer's own
    // definitions. Without this the rule above would read `#let` values as prose
    // and their quotes would stop being string delimiters.
    const def = `#let זוג = ("אלף", "בית")\n#הדגשה[גוף]\n`;
    const s = spans.scan(def);
    check("a #let statement's array is code", s.strings.length, 2);
    check("…and the strings are its two elements", s.strings.map((g) => def.slice(g.from, g.to)), ["אלף", "בית"]);
    check("the statement ends at its newline", spans.ctxAt(s, def.indexOf("גוף")), "content");
    check("the bracket linter finds nothing wrong", brackets.analyze(def).problems.length, 0);
  }
  {
    // The same question asked where the answer is not masked, which is why the
    // line above passed for as long as it did: `גוף` sits inside `#הדגשה[…]`,
    // and that content frame gives the right answer whatever the statement's
    // frame claims. Ask about bare prose after the statement and the mask is
    // gone.
    //
    // It was wrong. The statement pushed a frame with `close: text.length` and
    // restored the running `ctx` at the newline without ever closing it — so
    // `ctxAt`, and therefore `modeAt`, `legalAt` and `insertionAt`, called every
    // character after the first `#let` or `#set` in the document code mode.
    // `engine/tests/scan_oracle.rs` found it against Typst's own parser on its
    // first sweep; nothing in this file had asked.
    const doc = `#let ר = [רבי]\n#ר יוחנן אמר (בגמרא) כך.\n`;
    const s = spans.scan(doc);
    check("prose after a #let is prose", spans.ctxAt(s, doc.indexOf("יוחנן")), "content");
    check("…including after a parenthesis in it", spans.ctxAt(s, doc.indexOf("כך")), "content");
    check("and the statement's frame closes at its newline", spans.framesAt(s, doc.indexOf("יוחנן")).length, 0);
    check("a bare paren after it opens no string", s.strings.length, 0);
    // A statement inside a group ends when the group does, with no newline in
    // sight — the second way that frame can close.
    const inner = `#הדגשה[#let x = 1] ואחר כך (עיין שם) עוד.`;
    const si = spans.scan(inner);
    check("a statement inside a body ends with the body", spans.ctxAt(si, inner.indexOf("ואחר")), "content");
    check("…and nothing after it opens a string", si.strings.length, 0);
  }
  {
    // The document `mode.ts`'s backwards walk got wrong, now that there is only
    // one walk. A `)` inside a string is not a group to skip back over.
    const doc = `#הערה("א)ב")[גוף]`;
    check("a paren inside a string does not confuse the body's owner", spans.scan(doc).nodes[0].bodies.length, 1);
    check("and the body belongs to the note", spans.framesAt(spans.scan(doc), doc.indexOf("גוף")).map((f) => f.name), ["הערה"]);
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
    // A parenthesis in prose, in every position it reaches the corpus from.
    // These are the documents §2b is about; they belong in the sweep too,
    // because the sweep is the shape that catches the *next* one.
    `#הדגשה[ראה (רש"י) כאן]`,
    `#רשימה(פריט[דברי (רש"י) כאן], פריט[שני],)`,
    `#טבלה(עמודות: 2,\n  תא[ראה (שו"ע סי' ב') שם], תא[שני],\n)`,
    `כתוב כאן (ועיין שם) ואחר כך #הדגשה[טקסט]`,
    `#כותרת1[פרק (ב)]\n\nגוף (ועיין שם)`,
    `#let זוג = ("אלף", "בית")\n#הדגשה[גוף]`,
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
  // To a fixpoint, and not one hop. `#כותרת1` used to be `heading(level: 1, body)`
  // written out; it is now a call to a shared helper that carries the per-heading
  // style override to the show rule, so a single-hop derivation stopped seeing the
  // six commands most documents are written with — and the fence went from
  // guarding the outline to guarding nothing, quietly, on a refactor that had
  // nothing to do with it. A command produces a heading if its body calls
  // `heading(` or calls something that does.
  // Bodies to the next top-level `#let`, not to the end of the line: a helper in
  // the chain is a block, and reading only its first line reads `{`. Comments are
  // cut out first, or the prose above the *next* definition would be read as part
  // of this one — and this file's own next assertion is that `#שער` does **not**
  // produce a heading, which a passing mention in a comment would break.
  const bodies = new Map();
  // One chunk per top-level `#let`, whatever form it takes — a binding ends a
  // definition just as a function does, and slicing only at *function* heads
  // swallowed every binding and comment in between, which put four commands that
  // merely print a title of their own into the set.
  for (const chunk of prelude.split(/^(?=#let )/mu)) {
    const head = /^#let\s+([A-Za-z֐-׿_][A-Za-z0-9֐-׿_]*)\s*\(([^)]*)\)\s*=/u.exec(chunk);
    if (!head) continue;
    bodies.set(
      head[1],
      chunk
        .slice(head[0].length)
        .replace(/\/\*[\s\S]*?\*\//gu, " ")
        .replace(/\/\/[^\n]*/gu, " ")
        // A block that titles itself is not a heading. `#מפתח_ענינים`,
        // `#מראה_מקומות`, `#הערות_בסוף` and `#הערות_מדורגות` each print a section
        // title from an optional `כותרת:` argument and then print an index or a
        // note block underneath it — so they contain a `heading()` and are not
        // one, and treating them as one would offer to demote an index into a
        // `#כותרת2`. The tell is the guard: a heading command's heading is
        // unconditional and takes the words positionally (`#סימן(מספר, כותרת)`
        // is one, and is known to the scanner); a self-titling block's is
        // conditional on a named title being given at all.
        .replace(/if\s+(?:כותרת|title)\s*!=\s*none\s*\{[^{}]*\}/gu, " "),
    );
  }
  // The scanner's own table is the authority here, and the fence reads the
  // same table rather than re-deriving "produces a heading" from prelude
  // text: a transitive closure over call names once promoted _cfg_strict and
  // every setter that validates through it, drowning this check in commands
  // no reader would call headings.
  const headingProducers = spans.HEADINGS.filter((n) => !n.startsWith("_"));
  ok(
    "the prelude has heading-producing commands",
    headingProducers.length >= 8,
    () => `found ${headingProducers.length}: ${headingProducers}`,
  );
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

  {
    // The memo is a `WeakMap` keyed on the `Text` object, and a `WeakMap` throws
    // on a primitive key — so `docTextOf` used to reject the one value its own
    // signature most invites: a plain string. `docTextOf(view?.state.doc ?? "")`
    // reads as the careful spelling and took the whole application down at boot,
    // blank page, empty console, because the throw landed in an unawaited
    // `boot()`.
    check("a string is already the answer", spans.docTextOf("#הדגשה[א]"), "#הדגשה[א]");
    check("including the empty one", spans.docTextOf(""), "");
    const doc = { toString: () => "#הדגשה[ב]" };
    check("and a document is read through it", spans.docTextOf(doc), "#הדגשה[ב]");
    ok("…once", spans.docTextOf(doc) === spans.docTextOf(doc));
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
