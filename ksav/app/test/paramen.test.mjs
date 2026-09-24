// The param_en fence can *fire* — not merely run clean on a good day.
//
// #27 moved `PARAM_EN`/`PARAM_EN_BY_COMMAND` from regex-over-source to
// `facts().param_en`, and left the old paren-counting read as a cross-check.
// A cross-check that only ever sees agreeing inputs has never been tested: it
// would sit green through every rename that matters and then exit 1 on the one
// disagreement it was written for.
//
// So three things are pinned here:
//
//   1. the real facts and the real prelude text still agree (the happy path
//      `readParams` takes on every generation);
//   2. each *kind* of disagreement — wrong global pair, missing wrapper,
//      missing override, wrong override value, size skew — produces a named
//      problem rather than a silent pass;
//   3. the problems name the key a human would search for (`צבע`, `מסמך.columns`),
//      so the exit-1 message is actually a diagnosis.
//
// Mutation lives entirely in memory: `paramsFromFacts` and `paramProblems` are
// pure, so a test can clone the blessed tables, break one cell, and expect a
// red without ever writing a bad artefact.

import { check, ok } from "./harness.mjs";
import { facts } from "../tools/facts.mjs";
import {
  paramProblems,
  paramsFromFacts,
  preludeParamsFromText,
} from "../tools/emit-engine.mjs";

export function run() {
  const pe = facts().param_en;
  ok("facts carry a param_en table", Array.isArray(pe.global) && pe.global.length > 0);
  ok(
    "facts carry by-command wrappers",
    Array.isArray(pe.by_command) && pe.by_command.length > 0,
  );

  const fromFacts = paramsFromFacts(pe);
  const fromText = preludeParamsFromText();

  {
    const problems = paramProblems(
      fromFacts.global,
      fromFacts.byCommand,
      fromText.global,
      fromText.byCommand,
    );
    check("blessed facts agree with the prelude text", problems, []);
  }

  {
    // A wrong global pair: the rename `colour` → `colr` that used to ship
    // silently because floors only counted rows.
    const mutated = paramsFromFacts(pe);
    mutated.global.set("צבע", "colr");
    const problems = paramProblems(
      mutated.global,
      mutated.byCommand,
      fromText.global,
      fromText.byCommand,
    );
    ok("a wrong global pair is caught", problems.length > 0);
    ok(
      "the message names the Hebrew key",
      problems.some((p) => p.includes("צבע") && p.includes("colr")),
    );
  }

  {
    // A wrapper dropped from facts while the prelude still has it: the stale
    // artefact case (`KSAV_BLESS` not re-run after adding a band).
    const mutated = paramsFromFacts(pe);
    mutated.byCommand.delete("מסמך");
    const problems = paramProblems(
      mutated.global,
      mutated.byCommand,
      fromText.global,
      fromText.byCommand,
    );
    ok("a missing wrapper is caught", problems.length > 0);
    ok(
      "the message names the command",
      problems.some((p) => p.includes("מסמך") && p.includes("missing")),
    );
  }

  {
    // An override dropped while the wrapper row remains: size-skew path.
    const mutated = paramsFromFacts(pe);
    const over = mutated.byCommand.get("מסמך");
    ok("מסמך carries an extra table", over != null && over.has("טורים"));
    over.delete("טורים");
    const problems = paramProblems(
      mutated.global,
      mutated.byCommand,
      fromText.global,
      fromText.byCommand,
    );
    ok("a missing override is caught", problems.length > 0);
    ok(
      "the message names the parameter",
      problems.some((p) => p.includes("מסמך") && p.includes("טורים")),
    );
  }

  {
    // Wrong override *value* with the same key set — the pair-level compare,
    // not the size compare.
    const mutated = paramsFromFacts(pe);
    const over = mutated.byCommand.get("מסמך");
    over.set("טורים", "columns_wrong");
    const problems = paramProblems(
      mutated.global,
      mutated.byCommand,
      fromText.global,
      fromText.byCommand,
    );
    ok("a wrong override value is caught", problems.length > 0);
    ok(
      "the message carries both sides",
      problems.some(
        (p) => p.includes("מסמך") && p.includes("טורים") && p.includes("columns_wrong"),
      ),
    );
  }

  {
    // Size skew with no other detail: an extra global pair facts invented.
    const mutated = paramsFromFacts(pe);
    mutated.global.set("zzz", "לא_קיים");
    const problems = paramProblems(
      mutated.global,
      mutated.byCommand,
      fromText.global,
      fromText.byCommand,
    );
    ok("a size skew is caught", problems.length > 0);
    ok(
      "the sizes are in the message",
      problems.some((p) => p.includes("global:") && p.includes("pairs")),
    );
  }
}
