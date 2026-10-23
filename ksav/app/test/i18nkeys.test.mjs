// Every `t("…")` / `tf("…")` literal in the application must be a key the
// dictionaries know, or a `.`-terminated prefix of one (the composed form:
// `t("dest." + pick.dest)`). The fence exists because a wrong key does not
// throw — `t()` falls back to returning the key itself (i18n.ts:48), so a
// misnamed key renders as raw prose to the writer and stays green in every
// gate. That is how the settings drawer's note-body-home dropdown shipped
// rendering `settingsWiring().noteHome.inline` (wave 6, caught by this fence
// in wave 11's audit, together with the places-chooser heading below it).
//
// The dictionaries are the authority: keys are read out of both files (the
// unquoted-identifier form the data modules use), not out of a hand-kept
// list — a key added to one dictionary only is a real gap and passes this
// fence only if the other has it. `hasKey` in i18n.ts is the same set at
// runtime; here it is re-derived from source so the fence cannot be
// satisfied by the fallback it guards against.
//
// Template-literal and variable arguments (`t(\`…\`)`, `t(prefix + suffix)`)
// are out of scope by design: only the *literal* is checkable, and the
// prefix rule catches the composed form's constant half.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ok } from "./harness.mjs";
import { dirOf } from "../tools/paths.mjs";

const SRC = path.join(dirOf(import.meta.url), "..", "src");

function dictKeys(file) {
  const src = readFileSync(path.join(SRC, file), "utf8");
  const keys = new Set();
  // Unquoted identifiers at two-space indent — the dictionary's own shape.
  for (const m of src.matchAll(/^ {2}([a-zA-Z0-9_.\-]+):/gm)) keys.add(m[1]);
  // Quoted keys, for the dotted compound form ("bodyHome.default").
  for (const m of src.matchAll(/^ {2}"([^"]+)":/gm)) keys.add(m[1]);
  return keys;
}

export async function run() {
  const keys = new Set([...dictKeys("i18n-he.ts"), ...dictKeys("i18n-en.ts")]);
  ok("the dictionaries are non-empty", keys.size > 500);

  const stripComments = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

  const misses = [];
  for (const f of readdirSync(SRC)) {
    if (!f.endsWith(".ts") || f.startsWith("i18n-")) continue;
    const lines = stripComments(readFileSync(path.join(SRC, f), "utf8")).split("\n");
    lines.forEach((line, i) => {
      const at = line.indexOf("//");
      const body = at < 0 ? line : line.slice(0, at);
      for (const m of body.matchAll(/\bt(?:f)?\(\s*"([^"]+)"/g)) {
        const key = m[1];
        // A trailing dot is the composed form's constant half: `t("dest." + …)`.
        if (key.endsWith(".")) {
          if (![...keys].some((k) => k.startsWith(key))) {
            misses.push(`${f}:${i + 1}: t("${key}") — no key starts with this prefix`);
          }
        } else if (!keys.has(key)) {
          misses.push(`${f}:${i + 1}: t("${key}") — not a key in either dictionary`);
        }
      }
    });
  }

  ok(
    `every t()/tf() literal in src/ is a known key (${misses.length} misses)`,
    misses.length === 0,
  );
  for (const miss of misses.slice(0, 20)) ok(`  ${miss}`, false);
}
