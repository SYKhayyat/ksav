// The command_en fence can *fire* — not merely run clean on a good day.
//
// #27 has two halves. The first — `PARAM_EN` / `PARAM_EN_BY_COMMAND` — moved off
// a paren-counting read and left the old one as a cross-check; `paramen.test.mjs`
// pins that. This file is the second half: `COMMAND_EN` was still built by
// `readAliases()`, a `/^#let …/` line regex over `ksav.typ`, and it now comes from
// `facts().command_en` — serialised by Rust from Typst's own parse of the
// prelude — with the line scan left behind as a cross-check.
//
// A cross-check that has only ever seen agreeing inputs has never been tested:
// it would sit green through every rename that matters and then exit 1 on the one
// disagreement it was written for. So the same three things are pinned here:
//
//   1. the real facts and the real prelude text still agree, pair for pair and
//      in order (the happy path `readAliases` takes on every generation);
//   2. each *kind* of disagreement — a wrong pair, a pair the facts invented, a
//      missing one, size skew — produces a named problem rather than a silent
//      pass;
//   3. the problem names the command a writer would search for, so the exit-1
//      message is a diagnosis rather than a diff;
//   4. the line scan really is blind in the two directions the generator's
//      comment claims, so that comment stays a measurement rather than a story.
//
// Mutation lives entirely in memory: `aliasesFromFacts` and `aliasProblems` are
// pure, so the test can clone the blessed table, break one cell, and expect a
// red without ever writing a bad artefact.

import { check, ok } from "./harness.mjs";
import { facts } from "../tools/facts.mjs";
import { aliasesFromFacts, aliasProblems, preludeAliasesFromText } from "../tools/emit-engine.mjs";

/** One Hebrew command's English name, from either read. */
const read = (m, he) => m.get(he);

export function run() {
  const ce = facts().command_en;
  ok(
    "facts carry a command_en table",
    Array.isArray(ce) && ce.length > 0 && Array.isArray(ce[0]),
  );

  // The wire shape is `(english, hebrew)` pairs, and both halves are strings. A
  // transposed pair still "typechecks" and still generates; a non-string row is
  // how that would arrive.
  ok(
    "every row is a pair of strings",
    ce.every((r) => Array.isArray(r) && r.length === 2 && r.every((x) => typeof x === "string")),
  );
  ok("every English name is ASCII", ce.every(([en]) => /^[A-Za-z][A-Za-z0-9_]*$/.test(en)));
  ok("every Hebrew name is Hebrew", ce.every(([, he]) => /^[א-ת][א-ת_0-9]*$/.test(he)));

  const fromFacts = aliasesFromFacts(ce);
  const fromText = preludeAliasesFromText();

  // ---------------------------------------------------------------- the rule
  {
    // `אות` is declared twice, and the first declaration wins because going back
    // the other way needs one answer. Both rows are in the wire value; the choice
    // is the reader's, and this is the reader.
    const rows = ce.filter(([, he]) => he === "אות").map(([en]) => en);
    ok(`אות has ${rows.length} English spellings in the facts`, rows.length === 2);
    check("the first English spelling of אות wins", read(fromFacts, "אות"), "os");
  }

  // ------------------------------------------------------- the happy path
  {
    const problems = aliasProblems(fromFacts, fromText);
    check("blessed facts agree with the prelude text", problems, []);
    check("the pairing is the size the generator's floor expects", fromFacts.size >= 120, true);
  }

  // --------------------------------------------------------- the fence fires
  {
    // A renamed alias: the edit that ships a wrong English snippet, because
    // nothing but the cross-check stands between the two reads.
    const mutated = aliasesFromFacts(ce);
    mutated.set("הדגשה", "strong");
    const problems = aliasProblems(mutated, fromText);
    ok("a wrong pair is caught", problems.length > 0);
    ok(
      "the message names the command and both sides",
      problems.some((p) => p.includes("הדגשה") && p.includes("bold") && p.includes("strong")),
    );
  }

  {
    // A command the facts invented, with the text read not knowing about it —
    // the direction a size check alone cannot cover.
    const mutated = aliasesFromFacts(ce);
    mutated.set("פקודה_לא_קיימת", "notacommand");
    const problems = aliasProblems(mutated, fromText);
    ok("an invented pair is caught", problems.length > 0);
    ok(
      "the message names the invented command",
      problems.some((p) => p.includes("פקודה_לא_קיימת") && p.includes("notacommand")),
    );
  }

  {
    // A pair dropped from facts while the prelude still has it: the stale
    // artefact case (`KSAV_BLESS` not re-run after a prelude edit).
    const mutated = aliasesFromFacts(ce);
    mutated.delete("הדגשה");
    const problems = aliasProblems(mutated, fromText);
    ok("a missing pair is caught", problems.length > 0);
    ok("the message says so", problems.some((p) => p.includes("הדגשה") && p.includes("—")));
  }

  {
    // Size skew with no other detail. Reached by dropping *and* adding one, so
    // the per-pair compare is satisfied and only the count can catch it.
    const mutated = aliasesFromFacts(ce);
    mutated.delete("הדגשה");
    mutated.set("מראה_מקומות", "sources");
    const text = new Map(fromText);
    text.delete("הדגשה");
    text.set("מראה_מקומות", "sources");
    const problems = aliasProblems(mutated, text);
    check("a same-size rename is caught by the pair compare", problems, []);
    // And the real thing: the prelude text keeps both, the facts lost one.
    const skew = aliasProblems(mutated, fromText);
    ok("a size skew is caught", skew.length > 0);
    ok("the sizes are in the message", skew.some((p) => p.includes("pairs in facts.gen.json")));
  }

  // ------------------------------------- the line scan's own blind spots
  //
  // Not a claim that the old reader was broken today — it agreed on all 189
  // pairs, and the reason it had to is that Typst will not parse a `#let` whose
  // value is on the next line, so no bare alias can be one reader finds and the
  // other misses. These pin the two directions it *is* wrong in, measured
  // against the real regex, so the comment in `preludeAliasesFromText` cannot
  // rot into a claim nobody checked.
  //
  // The regex is reproduced here rather than imported: `preludeAliasesFromText`
  // reads the *file*, and a test for a reader's blind spots needs to hand it
  // text. A divergence between the two copies would show up as a red here.
  {
    const lineScan = (src) => {
      const LINE = /^#let ([A-Za-z][A-Za-z0-9_]*) = (?:([^\s_(][^\s(]*)|_en\(([^\s,)]+))/;
      const byHebrew = new Map();
      for (const line of src.split(/\r?\n/)) {
        const m = LINE.exec(line);
        if (!m) continue;
        const he = (m[2] ?? m[3]).trim();
        if (!/^[֐-׿][֐-׿_0-9]*$/.test(he)) continue;
        if (!byHebrew.has(he)) byHebrew.set(he, m[1]);
      }
      return byHebrew;
    };

    // Over-reads: a command invented where there is none. A one-line `// #let`
    // is safe — the anchor needs `#` first — but a commented-out *block* of
    // aliases is how one switches several off at once, and nothing in a line
    // distinguishes it from the code under it.
    ok(
      "the line scan reads an alias inside a block comment",
      lineScan("/*\n#let bold = הדגשה\n*/").get("הדגשה") === "bold",
    );
    ok(
      "the line scan reads an alias inside a multi-line string",
      lineScan('#let s = "\n#let bold = הדגשה\n"').get("הדגשה") === "bold",
    );
    ok(
      "the line scan reads an alias inside a raw block",
      lineScan("```typ\n#let bold = הדגשה\n```").get("הדגשה") === "bold",
    );

    // Under-reads: a command that is there and the scan does not see.
    ok(
      "the line scan misses an alias inside a markup block",
      lineScan("#box[#let cell = תא]").size === 0,
    );
    ok(
      "the line scan misses an _en wrapper with a space before the argument",
      lineScan("#let band = _en (מדור_בדרגה)").size === 0,
    );

    // And the fence is symmetric, so a disagreement in *either* direction is
    // reported. The sizes agree here — one row gone, one invented — so the
    // count cannot be what catches it.
    const renamed = new Map(fromText);
    renamed.delete("הדגשה");
    renamed.set("פקודה_לא_קיימת", "invented");
    const problems = aliasProblems(renamed, fromText);
    ok("a same-size swap is caught", problems.length >= 2);
    ok(
      "both directions are reported",
      problems.some((p) => p.includes("הדגשה")) &&
        problems.some((p) => p.includes("פקודה_לא_קיימת") && p.includes("invented")),
    );
  }
}
