// The engine's four tables, as the engine serialised them.
//
// # The finding
//
// Everything this side of the seam generates from the engine used to be
// obtained by **parsing Rust source text**:
//
//   - `emit-engine.mjs` found `impl Default for DocConfig` with `indexOf`,
//     `.slice`d to the next `\n}`, and ran a regex per field.
//   - the same file sliced `pub static NOTICES` and regexed five fields out of
//     each `Notice {` chunk.
//   - `commands.mjs` walked `pub static COMMANDS` character by character to read
//     the `cmd!` macro's string literals.
//   - `emit-services.mjs` matched one `svc("name", Method, "/path", …)` per line.
//
// Two of the four had noticed what that means. `services.rs` carried a
// `#[rustfmt::skip]` and a paragraph saying its formatting was a build input;
// `commands.mjs` carried a hand-rolled string reader precisely because a regex
// cut the escaped quotes in `#צבע(rgb(\"#b91c1c\"))[|]` in half. The `DocConfig`
// block carried nothing at all — and it was the worst one to leave, because its
// failure is silent in the direction that hides: the Rust value always wins on
// the wire, so a default the parser missed shows up as the editor's sliders
// reading one number while the page is laid out to another.
//
// `#[rustfmt::skip]` is a fence around one symptom. The cause is that a *value*
// crossed a language boundary as *source text*. It no longer does:
// `engine/src/facts.rs` serialises all four tables, `cargo test --test facts`
// keeps `engine/facts.gen.json` honest, and this module reads that file. Reflow
// any of those four Rust files however you like — the generated TypeScript comes
// out byte-identical.
//
// # What is still read as text, deliberately
//
// `disagreements()` counts declarations — `cmd!(`, `svc(`, `Notice {`, and the
// fields of `struct DocConfig` — and reports when a count differs from the
// JSON's. That is a text scan of Rust and it is kept on purpose, because it is
// the opposite failure mode from the one above: a count that disagrees can only
// ever produce a loud refusal, never a wrong value, and it is invariant under
// every reflow rustfmt can perform — a `svc(…)` broken across seven lines is
// still exactly one `svc(`. It is what makes an unblessed Rust edit a red
// `npm test` and not only a red `cargo test` in CI, which matters because the
// npm suite is the loop anybody actually runs while working.

import { readFileSync } from "node:fs";
import path from "node:path";
import { ENGINE } from "./paths.mjs";

/** `engine/facts.gen.json` — written by `KSAV_BLESS=1 cargo test --test facts`. */
export const ARTEFACT = path.join(ENGINE, "facts.gen.json");

/** How to make it current again, said the same way everywhere. */
export const REGENERATE = "KSAV_BLESS=1 cargo test --test facts   (in ksav/engine)";

let cached = null;

/**
 * The whole artefact: `{ doc_defaults, commands, notices, services }`.
 *
 * Read once. Every generator and half the suite want the same four tables, and
 * re-reading a 40 KB JSON per caller is the sort of thing that is invisible
 * until the inner loop is six process spawns long, which this repository has
 * already paid for once.
 */
export function facts() {
  if (cached) return cached;
  let raw;
  try {
    raw = readFileSync(ARTEFACT, "utf8");
  } catch {
    throw new Error(
      `engine/facts.gen.json is missing. Generate it with:\n  ${REGENERATE}`,
    );
  }
  cached = JSON.parse(raw);
  return cached;
}

/** One Rust file of the engine, as text. Only `disagreements` reads these. */
function rust(name) {
  return readFileSync(path.join(ENGINE, "src", name), "utf8");
}

/**
 * The body of a `pub static NAME … = &[ … ];` style table.
 *
 * Slicing to `\n];` and not to the next `]`: every one of these tables contains
 * bracketed things (`&["assets/fonts/…"]`, `#הדגשה[|]`) and stopping at the
 * first of them would count a fraction of the rows and call the file stale for
 * no reason. The declaration's own terminator is the only unambiguous end.
 */
function table(src, decl) {
  const at = src.indexOf(decl);
  if (at < 0) return null;
  const end = src.indexOf("\n];", at);
  return end < 0 ? null : src.slice(at, end);
}

/** How many times a literal token appears in a string. */
function occurrences(hay, needle) {
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

/**
 * Where the committed artefact and the Rust it claims to describe disagree.
 *
 * Returns a list of human sentences; empty means they agree as far as counting
 * can tell. This cannot see a *renamed* command or a *changed* default — that is
 * what `cargo test --test facts` is for — but it does catch the case that
 * actually happens, which is a table gaining or losing a row and nobody running
 * cargo before pushing.
 */
export function disagreements() {
  const f = facts();
  const out = [];

  const commands = table(rust("commands.rs"), "pub static COMMANDS");
  const services = table(rust("services.rs"), "pub const SERVICES");
  const notices = table(rust("notices.rs"), "pub static NOTICES");

  for (const [what, body, token, wanted] of [
    ["commands (engine/src/commands.rs)", commands, "cmd!(", f.commands.length],
    ["services (engine/src/services.rs)", services, "svc(", f.services.length],
    ["notices (engine/src/notices.rs)", notices, "Notice {", f.notices.length],
  ]) {
    if (body === null) {
      out.push(`  ${what}: the declaration is not where this check looks for it`);
      continue;
    }
    const found = occurrences(body, token);
    if (found !== wanted) {
      out.push(`  ${what}: ${found} × \`${token}\` in the Rust, ${wanted} in facts.gen.json`);
    }
  }

  // `DocConfig`'s fields, from the struct rather than from `impl Default` —
  // the struct is the declaration, and it is the one rustfmt will always keep
  // one field per line.
  const lib = rust("lib.rs");
  const at = lib.indexOf("pub struct DocConfig {");
  const body = at < 0 ? null : lib.slice(at, lib.indexOf("\n}", at));
  if (body === null) {
    out.push("  document defaults (engine/src/lib.rs): `pub struct DocConfig` is not there");
  } else {
    const fields = [...body.matchAll(/\bpub\s+[a-z_0-9]+\s*:/g)].length;
    const wanted = Object.keys(f.doc_defaults).length;
    if (fields !== wanted) {
      out.push(
        `  document defaults (engine/src/lib.rs): ${fields} fields on \`DocConfig\`, ` +
          `${wanted} in facts.gen.json`,
      );
    }
  }

  return out;
}

/**
 * Refuse loudly if the artefact and the Rust have parted company.
 *
 * `process.exit` rather than a throw, and the same shape the generators' own
 * floor checks use: a stale artefact is a failure a reader meets before they
 * know how this repository is put together, and a stack trace is not the thing
 * to hand them. The message names the command.
 */
export function insistFactsAreCurrent() {
  const problems = disagreements();
  if (!problems.length) return;
  console.error(
    "engine/facts.gen.json no longer matches engine/src/*.rs:\n" +
      problems.join("\n") +
      `\n\nRegenerate it with:\n  ${REGENERATE}\n` +
      "then regenerate this side with:\n  npm run fixtures",
  );
  process.exit(1);
}
