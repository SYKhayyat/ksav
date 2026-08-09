// Write the client's copy of what the *engine* already knows, from the engine.
//
// Three facts had been typed out twice, in two languages, with nothing between
// them:
//
//   - **The document defaults.** `DocConfig::default()` (Rust) and
//     `settings.ts`'s `DEFAULTS` (TypeScript) both said Frank Ruhl Hofshi / 12 /
//     2.5 cm / 0.75 em / 1.2 em / a4. Drift here is *silent* rather than loud,
//     which is the bad kind: the Rust value always wins on the wire, so a
//     default changed in one place shows up as the app's sliders reading one
//     number while the page is laid out to another.
//   - **The Hebrew↔English command pairing.** The pairing is *made* by the
//     prelude — `#let h1 = כותרת1` is the whole reason `#h1` compiles — and
//     `markdown.ts` re-typed ~100 of the pairs by hand so that an export would
//     recognise both spellings. A command renamed in the prelude simply stopped
//     exporting under its new name. It is read from `ksav.typ` rather than from
//     `commands.rs` because the registry is deliberately a *subset*: it stops at
//     tier ג, on the argument that a chooser card with seven tiers on it is
//     unreadable, while the prelude defines all seven and an export has to
//     handle a document that used one.
//   - **The redistribution notices.** `notices.rs` is now the one table (see the
//     module comment there for why it is Rust and not Markdown); the About panel
//     had a fourth hand-kept copy.
//
// None of these can be fetched at runtime instead. `markdown.ts` is a pure
// module that runs in tests and in an offline export; `DEFAULTS` has to be
// readable synchronously while the chrome is being built; and the About panel
// has to render in a browser build that may never reach a server. So they are
// generated, and `npm test` runs the --check form — a default changed in Rust
// and not regenerated here is a red test rather than a number that disagrees
// with itself.
//
// # Where the Rust facts come from
//
// Two of the three used to be read by **parsing this repository's Rust source
// text** — `src.indexOf("impl Default for DocConfig")` and a `.slice`, then a
// regex per field; the same again for `pub static NOTICES`. Reflowing either
// block changed what the client shipped, and for the defaults it changed it
// *silently*, because the Rust value always wins on the wire: the editor's
// sliders would have read one number while the page was laid out to another.
//
// They come from `engine/facts.gen.json` now, which `engine/src/facts.rs`
// serialises and `cargo test --test facts` keeps honest. The prelude is still
// read as text and that is a different thing: `#let h1 = כותרת1` is a
// *declaration in a language*, not a value literal, and reading it is how this
// file knows about the four tiers per family the Rust registry deliberately
// stops short of.
//
//   node tools/emit-engine.mjs          # rewrite app/src/engine.gen.ts
//   node tools/emit-engine.mjs --check  # fail if it is stale

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runAsScript } from "./generated.mjs";
import { commands as sharedCommands } from "./commands.mjs";
import { facts, insistFactsAreCurrent } from "./facts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, "..");
const PRELUDE = join(APP, "..", "engine", "typst", "ksav.typ");
const CONTAINERS = join(APP, "..", "engine", "tests", "fixtures", "containers.json");
const OUT = join(APP, "src", "engine.gen.ts");

// Before a line of it is read. This module is imported by `test/run.mjs`, so
// this is what makes an unblessed Rust edit a red `npm test` and not only a red
// `cargo test` in CI.
insistFactsAreCurrent();

/**
 * Fields of `DocConfig` that deliberately do **not** become app defaults.
 *
 * Both are cases where the same name means something different on the two sides
 * of the seam, so copying the value across would be worse than not having it.
 */
const NOT_A_SETTING = {
  // `DocConfig.lang` is the language the *document* is written in; `Settings.lang`
  // is the language of the interface. A Hebrew speaker writing an English
  // document needs them to differ, and `settings.ts` says so at length.
  lang: "the app's `lang` is the interface language, not the document's",
  // Which pages to export is a property of one export, decided at the moment of
  // exporting and never persisted. See `DocConfig.pdf_pages` in api.ts.
  pdf_pages: "a property of one export, not of the document",
};

// ---------------------------------------------------------------- Rust reading

/**
 * The Hebrew↔English pairing, as the prelude *makes* it.
 *
 * Two forms: a bare alias (`#let h1 = כותרת1`) and one wrapped so its
 * parameters may be given in English (`#let banded_notes = _en(הערות_מדורגות)`).
 * Anything beginning `_` is the prelude's own plumbing — states, labels, the
 * numbering arrays — and is not a command anybody types.
 *
 * There is a third form this cannot see, and it is a real one:
 * `#let hlevel(body, level: 1) = …` is a *separate definition* rather than an
 * alias, because its parameter is named `level` where `#כותרת`'s is `רמה`, and
 * `_en` translates arguments but a `#let x = y` does not. Nothing in the prelude
 * records that the two are the same command — only `commands.rs` knows that. So
 * the two sources are unioned rather than one being preferred, and the check
 * below is the one that can actually be made: where both speak, they agree, and
 * every English name the registry advertises is a name the prelude defines.
 */
function readAliases() {
  const src = readFileSync(PRELUDE, "utf8");
  const LINE = /^#let ([A-Za-z][A-Za-z0-9_]*) = (?:([^\s_(][^\s(]*)|_en\(([^\s,)]+))/;
  const byHebrew = new Map();
  for (const line of src.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const he = (m[2] ?? m[3]).trim();
    // Hebrew-named only. `#let sources = מראה_מקומות` pairs; a hypothetical
    // ASCII-to-ASCII `#let` would not be a translation of anything.
    if (!/^[֐-׿][֐-׿_0-9]*$/.test(he)) continue;
    // First alias wins, so a second English spelling of one command (there are
    // none today) would not silently replace the first.
    if (!byHebrew.has(he)) byHebrew.set(he, m[1]);
  }
  return byHebrew;
}

/**
 * The text of a parenthesised block starting at `open`, comments stripped.
 *
 * `_en_params` and the `extra:` dictionaries are Typst dictionaries spanning
 * many lines with `//` notes between the entries — including notes that argue
 * why a particular pairing is *absent*, which a line-at-a-time regex would read
 * as an entry. Counting parentheses is the only honest way to find the end, and
 * `_en_params` has `rgb("…")` nowhere so there is no string to hide one in.
 */
function parenBlock(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) {
      return src
        .slice(open + 1, i)
        .split(/\r?\n/)
        .map((l) => l.replace(/\/\/.*$/, ""))
        .join("\n");
    }
  }
  return "";
}

/** `key: "value"` pairs of a dictionary block, in declaration order. */
function dictPairs(block) {
  return [...block.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]);
}

/**
 * The parameter pairing, Hebrew → English, as `_en` itself makes it.
 *
 * The mirror image of `readAliases`, and needed for the same reason one level
 * down: an English alias whose parameters are still Hebrew is not English, and
 * `#mktable(עמודות: 3)` is not a thing anybody would type. The prelude states
 * the pairing once, in `_en_params`, and the two tables below are that
 * statement crossing the seam as a *value* — `facts.rs:20-28`'s rule applied to
 * the one table that lives in Typst rather than in Rust.
 *
 * Two directions of ambiguity, both handled here rather than at the call site:
 *
 *   - **Two English spellings of one Hebrew word.** `colour` and `color` both
 *     map to `צבע`. Going back the other way needs one answer, so the first
 *     declaration wins — which is the British spelling the prelude writes first
 *     everywhere else.
 *   - **Two Hebrew words for one English one.** `טורים` (text columns) and
 *     `עמודות` (table columns) are both `columns`, which is exactly what `extra`
 *     exists for. So the per-command overrides are kept as their own table
 *     rather than flattened into the global one, and a reader merges them in the
 *     same order `_en` does: `_en_params + extra`.
 */
function readParams() {
  const src = readFileSync(PRELUDE, "utf8");
  const at = src.indexOf("#let _en_params = (");
  if (at < 0) return { global: new Map(), byCommand: new Map() };
  const global = new Map();
  for (const [en, he] of dictPairs(parenBlock(src, src.indexOf("(", at)))) {
    if (!global.has(he)) global.set(he, en); // first English spelling wins
  }

  // `#let banded_config = _en(הגדרות_מדורגות, extra: (columns: "טורים"))`, and
  // `#let document = _en(מסמך, extra: (` over eleven lines. Keyed by the Hebrew
  // command, because that is the name a registry snippet is written with.
  const byCommand = new Map();
  for (const m of src.matchAll(/#let [A-Za-z][A-Za-z0-9_]* = _en\(([^\s,)]+),\s*extra:\s*\(/g)) {
    const he = m[1].trim();
    const block = parenBlock(src, m.index + m[0].length - 1);
    const over = new Map();
    for (const [en, heParam] of dictPairs(block)) over.set(heParam, en);
    if (over.size) byCommand.set(he, over);
  }
  return { global, byCommand };
}

/**
 * The commands Typst treats as containers, as the engine **measured** them.
 *
 * Not read from the prelude's text: whether `#כותרת1` is a container is a fact
 * about `heading()`, and whether `#שער` is one is a fact about `align()` — both
 * inside Typst, neither visible in a `#let` line. `engine/examples/emit-containers.rs`
 * asks the compiler for all 136 bindings and `cargo test --test containers`
 * re-asks, so this file is a cache of a measurement rather than a fourth list of
 * command names.
 *
 * It is what lets `legalAt` grey `#מעבר_עמוד` where it would blank the page and
 * offer it where it would not. The rule it replaces was *"is the caret inside
 * any brackets at all"*, which greyed the button inside bold text and inside a
 * document title for nothing.
 */
function readContainers() {
  const j = JSON.parse(readFileSync(CONTAINERS, "utf8"));
  return j.containers ?? [];
}

/** Every name the prelude binds at all, alias or definition. */
function preludeNames() {
  const src = readFileSync(PRELUDE, "utf8");
  const out = new Set();
  for (const line of src.split(/\r?\n/)) {
    const m = /^#let ([A-Za-z֐-׿][\w֐-׿]*)/.exec(line);
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * Every command in the registry: the pairing and the two flags on it.
 *
 * Through `tools/commands.mjs`, which is the one reader. This file had its own —
 * the fifth reader of `commands.rs`, and byte-identical to the one in
 * `commands.mjs` down to the comment explaining the slice. Four of those readers
 * were reconciled when the count went 116 to 115; this one was not, because
 * nothing swept `tools/`.
 */
function readCommands() {
  return sharedCommands().map((c) => ({
    he: c.he,
    en: c.en,
    category: c.category,
    deprecated: c.deprecated,
  }));
}

/**
 * `DocConfig::default()` as `[{ name, value, absent }]`.
 *
 * `absent` is `null` in the JSON and it is the whole reason the defaults are
 * serialised rather than described: for the four per-edge margins and the note
 * region, absent means *follow the uniform margin* / *decide from the document*,
 * which is a different instruction from any number. It is emitted below as a
 * missing key rather than as a value. `settings.ts` argued this in prose; the
 * generator does it, and `an_absent_default_is_present_as_null` in
 * `engine/tests/facts.rs` stops serde from ever dropping the field instead.
 */
function readDefaults() {
  return Object.entries(facts().doc_defaults).map(([name, value]) => ({
    name,
    value,
    absent: value === null,
  }));
}

/** The redistribution table, as `notices.rs` states it. */
function readNotices() {
  return facts().notices.map((n) => ({
    kind: n.kind,
    name: n.name,
    copyright: n.copyright,
    licence: n.licence,
    url: n.url,
    selectable: n.selectable,
  }));
}

// ---------------------------------------------------------------- emitting

function emit(aliases, params, containers, commands, defaults, notices, hebrew, markupEscapes) {
  const q = (v) => JSON.stringify(v);
  const settable = defaults.filter((d) => !(d.name in NOT_A_SETTING) && !d.absent);
  const omitted = defaults.filter((d) => d.absent).map((d) => d.name);

  const defaultRows = settable.map((d) => `  ${d.name}: ${q(d.value)},`).join("\n");
  const aliasRows = [...aliases]
    .map(([he, en]) => `  ${q(he)}: ${q(en)},`)
    .join("\n");
  const paramRows = [...params.global]
    .map(([he, en]) => `  ${q(he)}: ${q(en)},`)
    .join("\n");
  const containerRows = containers.map((n) => `  ${q(n)},`).join("\n");
  const paramExtraRows = [...params.byCommand]
    .map(
      ([he, over]) =>
        `  ${q(he)}: { ${[...over].map(([h, e]) => `${q(h)}: ${q(e)}`).join(", ")} },`,
    )
    .join("\n");
  const noticeRows = notices
    .map(
      (n) =>
        `  { kind: ${q(n.kind)}, name: ${q(n.name)}, copyright: ${q(n.copyright)}, ` +
        `licence: ${q(n.licence)}, url: ${q(n.url)}, selectable: ${n.selectable} },`,
    )
    .join("\n");

  return `// Generated by app/tools/emit-engine.mjs from engine/facts.gen.json
// (the engine's own \`DocConfig::default()\`, registry and notices, serialised by
// engine/src/facts.rs) and from the prelude's \`#let\` lines.
// Do not edit by hand: run \`node tools/emit-engine.mjs\`.
// \`npm test\` fails when this file and the engine disagree.
//
// Three facts the engine already knows, which this side used to know separately:
// the document defaults, the Hebrew↔English command pairing, and what the engine
// redistributes. See the generator's header for why each is generated rather
// than fetched.

/**
 * The engine's own document defaults, as \`DocConfig::default()\` states them.
 *
 * The four per-edge margins and the note region are **absent** rather than
 * zero — absent means "follow the uniform margin" / "decide from the document",
 * which is a different instruction from any number. (${omitted.join(", ")})
 */
export const DOC_DEFAULTS = {
${defaultRows}
} as const;

/**
 * The English alias of every command, keyed by its Hebrew name.
 *
 * From the prelude's own \`#let\` lines, which are what *make* the pairing —
 * so this covers the four tiers per family that the palette registry stops
 * short of, and an export meets a document that used one.
 */
export const COMMAND_EN: Readonly<Record<string, string>> = {
${aliasRows}
};

/**
 * The English name of every *parameter*, keyed by its Hebrew one.
 *
 * From the prelude's \`_en_params\`, which is what makes the pairing: an English
 * alias is not a plain binding but a wrapper that renames its named arguments
 * through that table. An English alias whose parameters are still Hebrew is not
 * English, so a command written into an English document needs this as much as
 * it needs \`COMMAND_EN\`.
 *
 * Where two English spellings share one Hebrew word (\`colour\`/\`color\` → \`צבע\`)
 * the first the prelude declares is the one here, because going back the other
 * way needs one answer.
 */
export const PARAM_EN: Readonly<Record<string, string>> = {
${paramRows}
};

/**
 * Per-command overrides, exactly as the prelude's \`extra:\` states them.
 *
 * Two Hebrew parameters can share one English word — \`טורים\` (text columns) and
 * \`עמודות\` (table columns) are both \`columns\` — so the commands that need the
 * other reading say so at their own alias, and a reader merges these over
 * \`PARAM_EN\` the same way \`_en\` merges \`extra\` over \`_en_params\`. Keyed by the
 * **Hebrew** command name, because that is the name a registry snippet carries.
 */
export const PARAM_EN_BY_COMMAND: Readonly<Record<string, Readonly<Record<string, string>>>> = {
${paramExtraRows}
};

/** The parameter pairing in force inside a given command, Hebrew → English. */
export function paramsOf(heCommand: string): Readonly<Record<string, string>> {
  const over = PARAM_EN_BY_COMMAND[heCommand];
  return over ? { ...PARAM_EN, ...over } : PARAM_EN;
}

/**
 * Every command whose body is a Typst **container**, in Hebrew.
 *
 * Measured by the engine (\`engine/examples/emit-containers.rs\`) rather than
 * written down, because it is a fact about what each command's definition
 * expands to: \`#כותרת1\` is a \`heading()\` and \`#הערה\` a \`footnote()\`, both
 * containers; \`#שער\` is \`align(center, text(…))\` and \`#הדגשה\` a \`strong()\`,
 * both transparent. Fifty-three of the prelude's bindings are containers and
 * nothing about their names separates them from the rest.
 *
 * Typst refuses \`pagebreak()\` inside one, in English, from the middle of a
 * blanked preview — so this is what \`legalAt\` greys the page-level commands on.
 */
export const CONTAINERS: readonly string[] = [
${containerRows}
];

/**
 * Which Hebrew characters are marks, which separate words, which fold to what.
 *
 * From \`girsa-hebrew\` by way of \`engine/facts.gen.json\`, because a browser tab
 * cannot call a Rust crate. \`sefarim.ts\`'s \`fold\` wrote these out by hand and
 * had **one** of the four word-breaking characters — maqaf. Paseq ׀, sof
 * pasuq ׃ and nun hafukha ׆ sit in the same block, separate words the
 * same way, and were being deleted, so \`בן׃איש\` folded to \`בןאיש\` and found
 * nothing. Its geresh list was also missing \`U+2018\`, so a name pasted with a
 * left curly quote folded differently from the same name with a right one.
 *
 * Both were true of the Rust and Typst copies as well. Three implementations of
 * one rule need an oracle, not three careful readings — \`engine/tests/one_want.rs\`
 * and \`test/sefarim.test.mjs\` are that oracle — and the *tables* underneath the
 * rule need not be written three times at all.
 */
export const HEBREW = {
  /** ־ maqaf, ׀ paseq, ׃ sof pasuq, ׆ nun hafukha. */
  wordBreaking: ${q(hebrew.word_breaking.join(""))},
  /** The combining-mark block, inclusive. Everything in it but the four above. */
  markRange: [${q(hebrew.mark_range[0])}, ${q(hebrew.mark_range[1])}] as const,
  /** Every spelling of a geresh, then the one character they fold to. */
  geresh: [${q(hebrew.geresh[0].join(""))}, ${q(hebrew.geresh[1])}] as const,
  /** Every spelling of gershayim, then the one they fold to. */
  gershayim: [${q(hebrew.gershayim[0].join(""))}, ${q(hebrew.gershayim[1])}] as const,
  /** The letters Hebrew attaches to the front of a word, \`ד\` included. */
  prefixLetters: ${q(hebrew.prefix_letters.join(""))},
} as const;

/**
 * Every character Typst reads as markup inside a \`[…]\` body.
 *
 * From \`engine/src/escape.rs\`. This side had **five** of them — \`\\\\ [ ] # $\` —
 * and \`girsa-ksav\`'s escaper had ten, and both write \`#מראה_מקום(מקור: …)[…]\`
 * out of the same Girsa \`display\` string. The five missing were \`*\` (strong),
 * \`_\` (emph), \`<\` and \`>\` (a label) and \`@\` (a ref), all of which appear in
 * Sefaria titles. Same feature, two doors, two documents.
 */
export const MARKUP_ESCAPES = ${q(markupEscapes)};

/** A character class matching every Hebrew combining mark but not the four. */
export function markPattern(flags = "gu"): RegExp {
  const hex = (c: string) => (c.codePointAt(0) ?? 0).toString(16);
  const cls = [...HEBREW.wordBreaking].map((c) => \`\\\\u{\${hex(c)}}\`);
  const [lo, hi] = HEBREW.markRange;
  const range = \`\\\\u{\${hex(lo)}}-\\\\u{\${hex(hi)}}\`;
  // A negated lookahead rather than a hand-split range: splitting the block
  // around four holes is how \`sefarim.ts\` came to have one of them.
  return new RegExp(\`(?!\${cls.join("|")})[\${range}]\`, flags);
}

/** Both spellings of a command, for a table that must accept either. */
export function bothSpellings(he: string): readonly string[] {
  const en = COMMAND_EN[he];
  return en ? [he, en] : [he];
}

/**
 * Expand a Hebrew-keyed table so it answers to the English aliases too.
 *
 * The pairing comes from the registry, so a command renamed in Rust keeps
 * working here — which is exactly what a hand-written second copy could not do.
 * A name the registry does not know keeps its single key rather than throwing:
 * some entries are prelude-only spellings the palette never offers.
 */
export function withAliases<T>(byHebrew: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [he, value] of Object.entries(byHebrew)) {
    for (const name of bothSpellings(he)) out[name] = value;
  }
  return out;
}

/** One embedded thing and the notice it owes. See engine/src/notices.rs. */
export interface BundledNotice {
  readonly kind: "font" | "lexicon";
  readonly name: string;
  readonly copyright: string;
  readonly licence: string;
  readonly url: string;
  /** A text face a writer may choose. False for the maths font, which has no letters. */
  readonly selectable: boolean;
}

export const BUNDLED_NOTICES: readonly BundledNotice[] = [
${noticeRows}
];

/** The font families the engine bundles and a writer may choose. */
export const BUNDLED_FONTS: readonly string[] = BUNDLED_NOTICES.filter(
  (n) => n.kind === "font" && n.selectable,
).map((n) => n.name);
`;
}

const aliases = readAliases();
const params = readParams();
const containers = readContainers();
const commands = readCommands();
const defaults = readDefaults();
const notices = readNotices();
// `girsa-hebrew`'s character rules, measured by `src/facts.rs` and serialised
// with the rest. Nothing here interprets them; they cross as values.
const hebrew = facts().hebrew;
// `engine/src/escape.rs`'s `MARKUP`, so the client cannot hold a shorter list.
const markupEscapes = facts().markup_escapes;

// The registry and the prelude have to agree about the pairing, and until now
// nothing said so. The registry's `en` field is what the palette shows, what the
// toolbar tooltips read and what the generated documentation prints; the
// prelude's `#let` is what actually compiles. Two ways that goes wrong, both
// silent: the registry advertises an English name Typst never bound, and the two
// disagree about which English name a Hebrew command wears.
const bound = preludeNames();
const problems = [];
for (const c of commands) {
  if (!bound.has(c.he)) {
    problems.push(`  ${c.he}: in the registry, never bound by the prelude`);
  }
  if (!bound.has(c.en)) {
    problems.push(`  ${c.he}: registry advertises "${c.en}", which the prelude does not define`);
  }
  const made = aliases.get(c.he);
  if (made && made !== c.en) {
    problems.push(`  ${c.he}: registry says "${c.en}", prelude aliases it to "${made}"`);
  }
}
if (problems.length) {
  console.error(
    "engine/src/commands.rs and engine/typst/ksav.typ disagree about the " +
      "Hebrew↔English pairing:\n" +
      problems.join("\n"),
  );
  process.exit(1);
}

// The registry's independently-defined twins — `#let hlevel(body, level: 1)`,
// which is `#כותרת` under an English parameter name rather than an alias of it.
// The prelude cannot say they are the same command; the registry can, and both
// spellings have to reach `markdown.ts` either way.
for (const c of commands) if (!aliases.has(c.he)) aliases.set(c.he, c.en);

// An empty read generates a file that typechecks, breaks everything at runtime
// and looks like a successful regeneration. The floors are kept even though
// three of the four tables now arrive as serialised values rather than as parsed
// text — a truncated artefact and a table that lost its rows both land here, and
// the cost of the check is four comparisons.
for (const [what, rows, least] of [
  ["aliases (engine/typst/ksav.typ)", aliases, 120],
  ["parameter names (engine/typst/ksav.typ)", params.global, 40],
  ["containers (engine/tests/fixtures/containers.json)", containers, 30],
  ["commands (engine/facts.gen.json)", commands, 100],
  ["document defaults (engine/facts.gen.json)", defaults, 25],
  ["notices (engine/facts.gen.json)", notices, 4],
  ["Hebrew prefix letters (engine/facts.gen.json)", hebrew.prefix_letters, 8],
  ["markup escapes (engine/facts.gen.json)", [...markupEscapes], 10],
]) {
  const count = rows.length ?? rows.size;
  if (count < least) {
    console.error(
      `read only ${count} ${what}, expected at least ${least}.\n` +
        "The prelude has been reformatted past this generator's parser, or the\n" +
        "engine's facts artefact is truncated.",
    );
    process.exit(1);
  }
}
if (notices.some((n) => !n.name || !n.copyright)) {
  console.error("a notice arrived without a name or a copyright line");
  process.exit(1);
}

const built = emit(aliases, params, containers, commands, defaults, notices, hebrew, markupEscapes);

/** Every generated output, as `[path, wanted, label]`. */
export const OUTPUTS = [[OUT, built, "src/engine.gen.ts"]];

runAsScript(import.meta.url, OUTPUTS, "engine facts", "node tools/emit-engine.mjs");
