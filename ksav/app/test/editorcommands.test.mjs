
// The structure commands: what the menu, the keymap and the ribbon actually do.
//
// These thirteen functions were `main.ts`'s (wave 6 of #188) and they are the
// leaf layer of `installHooks`'s dependency graph — nothing here needed another
// main-local, which is why it could move with no seam at all.
//
// The assertions are about the two things that are easy to get wrong and
// invisible afterwards: where the caret lands after a command edits the
// document, and whether a command that did nothing says so.

import { check, ok, notOk } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { dirOf } from "../tools/paths.mjs";
import path from "node:path";

const SRC = path.resolve(dirOf(import.meta.url), "..", "src");
const EC = readFileSync(path.join(SRC, "editorcommands.ts"), "utf8");
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
const CODE = stripComments(EC);

export async function run() {
  const mod = await import("../.tmp-test/editorcommands.mjs");

  for (const name of [
    "applyHiding",
    "insertFold",
    "hideBlockHere",
    "hideLineHere",
    "hiddenBreak",
    "makeListHere",
    "addContentsHere",
    "replaceAll",
    "foldToLevel",
    "foldListsToDepth",
    "runStructureAction",
    "entityAct",
    "adoptPageSetupAsDefault",
  ]) {
    check(`editorcommands exports ${name}`, typeof mod[name], "function");
  }

  // ---- where the caret lands ----------------------------------------------
  //
  // `applyHiding` replaces a range and puts the selection where the module
  // computed it. That is the whole point of `Edit` carrying `select`: a hiding
  // command that left the caret at the edit's start would drop the writer at the
  // top of the hidden region every time.
  ok(
    "applyHiding uses the selection the module computed, not the edit's start",
    /selection:\s*\{\s*anchor:\s*edit\.select\[0\],\s*head:\s*edit\.select\[1\]\s*\}/.test(CODE),
  );

  // A hidden break places the caret *after* its own closer, on the new line, so
  // what is typed next joins the text that follows rather than the marker.
  ok(
    "a hidden break leaves the caret after the closer",
    /anchor:\s*sel\.from\s*\+\s*text\.length/.test(CODE),
  );

  // Every command that changes the document recompiles it; a silent edit would
  // leave the preview showing the previous text.
  for (const cmd of ["applyHiding", "replaceAll", "hiddenBreak"]) {
    ok(`${cmd} asks for a recompile`, new RegExp(`function ${cmd}\\([\\s\\S]{0,400}scheduleCompile\\(\\)`).test(CODE));
  }

  // ---- and it says so when there is nothing to do --------------------------
  //
  // Both "already a list" and "nothing to make a list from" are different
  // sentences, and both are `warn` — a command that quietly did nothing is the
  // failure the writer reports as "the button is broken".
  ok("makeListHere distinguishes the two reasons", /why\.alreadyAList/.test(CODE) && /why\.nothingToList/.test(CODE));
  ok("addContentsHere says when the contents already exist", /why\.contentsAlready/.test(CODE));
  ok("...and warns rather than silently returning", /setStatus\(t\("why\.contentsAlready"\),\s*"warn"\)/.test(CODE));
  ok(
    "folding to a depth reports when there is nothing to fold",
    /setStatus\(\s*effects\.length\s*\?/.test(CODE) && /t\("noHeadings"\)/.test(CODE),
  );

  // ---- the move did not smuggle the shell in ------------------------------
  //
  // If this file needed a `wire…` seam, it was not the leaf layer it looked like
  // and `installHooks` cannot be moved next.
  notOk("editorcommands takes no wiring seam", /\bwire[A-Z]\w*\(/.test(CODE));
  notOk("editorcommands does not import main", /from\s+"\.\/main"/.test(CODE));
}
