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
//   node tools/emit-engine.mjs          # rewrite app/src/engine.gen.ts
//   node tools/emit-engine.mjs --check  # fail if it is stale

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runAsScript } from "./generated.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, "..");
const ENGINE = join(APP, "..", "engine", "src");
const PRELUDE = join(APP, "..", "engine", "typst", "ksav.typ");
const OUT = join(APP, "src", "engine.gen.ts");

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
 * Read one Rust string literal starting at `i` (which must be the opening `"`).
 *
 * Hand-rolled rather than regexed because the `insert:` snippets in
 * `commands.rs` carry escaped quotes — `"#צבע(rgb(\"#b91c1c\"))[|]"` — and a
 * regex that stops at the first `"` cuts them in half. Returns the decoded
 * value and the index just past the closing quote.
 */
function readString(src, i) {
  if (src[i] !== '"') return null;
  let out = "";
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (c === "\\") {
      const n = src[j + 1];
      out += n === "n" ? "\n" : n === "t" ? "\t" : n;
      j++;
      continue;
    }
    if (c === '"') return { value: out, end: j + 1 };
    out += c;
  }
  return null;
}

/** The `cmd!(…)` arguments of one macro call, as decoded strings/booleans. */
function readCmdArgs(src, from) {
  const args = [];
  let i = from;
  for (;;) {
    while (i < src.length && /[\s,]/.test(src[i])) i++;
    if (src[i] === ")") return { args, end: i + 1 };
    if (src[i] === '"') {
      const s = readString(src, i);
      if (!s) return null;
      args.push(s.value);
      i = s.end;
      continue;
    }
    // The only non-string argument the macro takes is the `deprecated` flag.
    if (src.startsWith("true", i)) {
      args.push(true);
      i += 4;
      continue;
    }
    if (src.startsWith("false", i)) {
      args.push(false);
      i += 5;
      continue;
    }
    return null;
  }
}

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

/** Every command in the registry: the pairing and the two flags on it. */
function readCommands() {
  const src = readFileSync(join(ENGINE, "commands.rs"), "utf8");
  const table = src.slice(src.indexOf("pub static COMMANDS"));
  const out = [];
  let i = 0;
  for (;;) {
    const at = table.indexOf("cmd!(", i);
    if (at < 0) break;
    i = at + 5;
    // The macro's own two arms are `macro_rules!` bodies, not entries — they are
    // above `pub static COMMANDS` and so already sliced away.
    const parsed = readCmdArgs(table, i);
    if (!parsed || parsed.args.length < 6) continue;
    const [he, en, category, , , , deprecated] = parsed.args;
    out.push({ he, en, category, deprecated: deprecated === true });
    i = parsed.end;
  }
  return out;
}

/** `impl Default for DocConfig` as plain values. */
function readDefaults() {
  const src = readFileSync(join(ENGINE, "lib.rs"), "utf8");
  const at = src.indexOf("impl Default for DocConfig");
  if (at < 0) return [];
  const body = src.slice(at, src.indexOf("\n}", src.indexOf("DocConfig {", at)));
  const out = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^([a-z_0-9]+):\s*(.+),$/.exec(line);
    if (!m) continue;
    const [, name, valueSrc] = m;
    const value = decodeDefault(valueSrc);
    if (value === undefined) continue;
    out.push({ name, value, absent: value === null });
  }
  return out;
}

/** One Rust default expression as the JSON value it stands for. */
function decodeDefault(src) {
  const s = src.trim();
  // `None` is not `undefined` and not `0`: for the four per-edge margins it is
  // the whole meaning of "follow the uniform margin", so it is emitted as an
  // *absent key* rather than as a value. `settings.ts` argued this in prose;
  // now the generator does it.
  if (s === "None") return null;
  if (s === "String::new()") return "";
  if (s === "Vec::new()") return [];
  if (s === "true") return true;
  if (s === "false") return false;
  if (s.startsWith('"')) {
    const lit = readString(s, 0);
    return lit && s.slice(lit.end).trim() === ".to_string()" ? lit.value : undefined;
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return undefined;
}

/** The redistribution table, as `notices.rs` states it. */
function readNotices() {
  const src = readFileSync(join(ENGINE, "notices.rs"), "utf8");
  const table = src.slice(src.indexOf("pub static NOTICES"), src.indexOf("\n];", src.indexOf("pub static NOTICES")));
  const out = [];
  for (const chunk of table.split("Notice {").slice(1)) {
    const field = (name) => {
      const m = new RegExp(`\\b${name}:\\s*(.+?),\\n`, "s").exec(chunk);
      return m ? m[1].trim() : null;
    };
    const str = (name) => {
      const v = field(name);
      if (!v || !v.startsWith('"')) return null;
      return readString(v, 0)?.value ?? null;
    };
    const kind = field("kind");
    if (!kind) continue;
    out.push({
      kind: kind.replace("NoticeKind::", "").toLowerCase(),
      name: str("name"),
      copyright: str("copyright"),
      licence: str("licence"),
      url: str("url"),
      selectable: field("selectable") === "true",
    });
  }
  return out;
}

// ---------------------------------------------------------------- emitting

function emit(aliases, commands, defaults, notices) {
  const q = (v) => JSON.stringify(v);
  const settable = defaults.filter((d) => !(d.name in NOT_A_SETTING) && !d.absent);
  const omitted = defaults.filter((d) => d.absent).map((d) => d.name);

  const defaultRows = settable.map((d) => `  ${d.name}: ${q(d.value)},`).join("\n");
  const aliasRows = [...aliases]
    .map(([he, en]) => `  ${q(he)}: ${q(en)},`)
    .join("\n");
  const catRows = commands
    .map((c) => `  ${q(c.he)}: ${q(c.category)},`)
    .join("\n");
  const noticeRows = notices
    .map(
      (n) =>
        `  { kind: ${q(n.kind)}, name: ${q(n.name)}, copyright: ${q(n.copyright)}, ` +
        `licence: ${q(n.licence)}, url: ${q(n.url)}, selectable: ${n.selectable} },`,
    )
    .join("\n");

  return `// Generated by app/tools/emit-engine.mjs from engine/src/{lib,commands,notices}.rs.
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

/** The category key of every registry command, keyed by its Hebrew name. */
export const COMMAND_CATEGORY: Readonly<Record<string, string>> = {
${catRows}
};

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
const commands = readCommands();
const defaults = readDefaults();
const notices = readNotices();

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

// An empty parse generates a file that typechecks, breaks everything at runtime
// and looks like a successful regeneration. If a table is ever reformatted past
// these parsers, say so here rather than three modules downstream.
for (const [what, rows, least] of [
  ["aliases (engine/typst/ksav.typ)", aliases, 120],
  ["commands (engine/src/commands.rs)", commands, 100],
  ["document defaults (engine/src/lib.rs)", defaults, 25],
  ["notices (engine/src/notices.rs)", notices, 4],
]) {
  const count = rows.length ?? rows.size;
  if (count < least) {
    console.error(
      `parsed only ${count} ${what}, expected at least ${least}.\n` +
        "The table has been reformatted past this generator's parser.",
    );
    process.exit(1);
  }
}
if (notices.some((n) => !n.name || !n.copyright)) {
  console.error("a notice parsed without a name or a copyright line");
  process.exit(1);
}

const built = emit(aliases, commands, defaults, notices);

/** Every generated output, as `[path, wanted, label]`. */
export const OUTPUTS = [[OUT, built, "src/engine.gen.ts"]];

runAsScript(import.meta.url, OUTPUTS, "engine facts", "node tools/emit-engine.mjs");
