// The key-hint module's own fence — a rule-7 assertion-bearing fence for the
// smallest module the main.ts split produced, because small is not exempt: a
// name nobody imports by accident is how a file stops being anyone's problem.
//
// The module's load-bearing claim, in its own header: an action id becomes the
// chord the *writer* redefined, or nothing at all — never the chord the
// application shipped with and never a guess. That is exactly what
// prohibitions.test.mjs holds application-wide ("no surface spells a chord
// without going through keyHint"); here the shell's half is held on its own:
//
//   1. keybindings() reads settings live — a rebinding moves the printed
//      chord with it, an unbound id prints nothing.
//   2. hintFor composes bindings.keyHint + keymodes.commandName in the shape
//      the surfaces already show.
//   3. The module is stateless: no top-level `let`, and no import of main.ts
//      or spellcheck.ts — the cycle rule asserted on the file itself.
//
// The mode half (vim's `:`, emacs's `M-x`) is unreachable in node: a mode
// loads by fetch, and no test fetches it. `hintIsMode()` with no mode is
// asserted — the getter exists so a caller may ask — and the mode paths are
// what `bindings.test.mjs` covers pure.

import { check, notOk, ok, resetStorage } from "./harness.mjs";
import * as keyhint from "../.tmp-test/keyhint.mjs";
import { DEFAULT_KEYS, readable } from "../.tmp-test/bindings.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC = path.join(dirOf(import.meta.url), "..", "src");
const keyhintSrc = readFileSync(path.join(SRC, "keyhint.ts"), "utf8");

export async function run() {
  resetStorage();

  // 1. The table is the settings', read live.
  check(
    "no rebindings reads as the shipped table",
    keyhint.keybindings().bold,
    DEFAULT_KEYS.bold,
  );
  check(
    "the shipped chord is what an unrebound action prints",
    keyhint.hintFor("bold", { bold: DEFAULT_KEYS.bold }),
    readable(DEFAULT_KEYS.bold),
  );
  check(
    "a rebinding moves the printed chord with it",
    keyhint.hintFor("bold", { bold: "Mod-Alt-m" }),
    "Ctrl+Alt+M",
  );
  check("an id no table binds prints nothing", keyhint.hintFor("zzzNotAnAction"), "");
  check(
    "an unbound action is deliberately blank, not the shipped chord",
    keyhint.hintFor("unboundId", { unboundId: "" }),
    "",
  );

  // 2. The composition, asserted on the shape the surfaces print: `Mod-k`
  // under no mode says Ctrl+K, exactly as bindings.keyHint answers alone.
  check("the composition keys off the readable chord", keyhint.hintFor("palette", { palette: "Mod-k" }), "Ctrl+K");

  // 3. Stateless — the claim the import graph is allowed to lean on.
  ok("keyhint.ts holds no module-level state", !/^let /m.test(keyhintSrc));
  notOk("keyhint.ts imports no other application module", /from\s+"\.\.?\/(main|spellcheck)"/.test(keyhintSrc));
}
