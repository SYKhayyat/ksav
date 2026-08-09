// One reader of the engine's command registry, for everybody.
//
// # The finding this file answers
//
// Seven files read the command registry, in **four** different implementations,
// and they already disagreed about how many commands exist.
//
//   - `coverage.test.mjs` and `notecommands.test.mjs` held a **byte-identical**
//     200-character regex. Two files, one string, no import between them.
//   - `emit-insertion-fixtures.mjs` held the same regex minus one group.
//   - `emit-engine.mjs` held a real character-level reader — the correct one.
//   - `docfacts.mjs` and `tools/card.mjs` both counted with the naive
//     `/^\s*cmd!\(/gmu`.
//
// The naive pair is the one that mattered, because it counts **the macro's own
// recursive expansion**. `commands.rs:39` is
//
//     ($he:literal, …, $ins:literal) => { cmd!($he, …, $ins, false) };
//
// — the six-argument arm of `macro_rules! cmd` delegating to the seven-argument
// arm. It is a `cmd!(` at the start of a line and it is not a command. So the
// structured parsers saw **115** and the counters saw **116**, and since
// `docfacts.mjs` is the fence that guards this repository's counted claims, the
// wrong number was the *enforced* one: `ksav/README.md` twice and
// `docs/start-here.md` once told the reader there are 116 commands.
//
// # And then the parser itself went
//
// Extracting one parser fixed the disagreement and left the cause: a table of
// Rust **values** was being read as Rust **source text**, so its formatting was
// a build input to the client. `commands.rs` was the least dangerous of the four
// tables read that way — its reader was hand-rolled precisely because a regex
// cut the escaped quotes in `#צבע(rgb(\"#b91c1c\"))[|]` in half — but the same
// mechanism on `impl Default for DocConfig` had no fence at all and would have
// changed the app's document defaults silently.
//
// So the engine serialises its own tables now (`engine/src/facts.rs`) and this
// module reads `engine/facts.gen.json`. The character-level `cmd!` reader is
// gone: there is nothing left to be the only correct implementation *of*.
// Everything below is the same API the seven callers already use.

import { facts } from "./facts.mjs";

/**
 * Every command in the registry, in the order the table declares them.
 *
 * Each is `{ he, en, category, desc_he, desc_en, insert, deprecated }` — the
 * fields of `Command` in `engine/src/commands.rs`, as serde wrote them.
 */
export function commands() {
  return facts().commands;
}

/**
 * How many commands the registry declares.
 *
 * The number the documentation is fenced against. It is a function rather than
 * a constant so that nothing can cache a stale one, and it goes through the same
 * artefact as everything else so it cannot disagree with what the app offers.
 */
export function commandCount() {
  return commands().length;
}
