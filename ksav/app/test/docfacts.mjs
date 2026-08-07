// What the documentation is allowed to say, and what measures it.
//
// The failure this exists to stop is the one `card.mjs:40-46` already wrote
// down, in its own comment, one paragraph below the table that prevents it:
//
// > *"The card said '104 of them' for as long as there were 104, and then for a
// > while after there weren't — which is the exact failure this generator exists
// > to prevent, reproduced one paragraph below the table that prevents it."*
//
// At the point this file was written, nineteen numbers across five prose pages
// were false: 104 commands when there were 116, 29 and 30 bindings when there
// were 52, 389 assertions when there were 3,528, four CI jobs when there were
// five. Every one of them survived 45 green assertions in `readme.test.mjs`,
// which asserts twelve key *names* over one of nine prose files and **zero
// numbers**. Prose compiles no matter what it says.
//
// The shape here is two sweeps in opposite directions, because a hand-written
// list of claims fails by omission and a regex over prose fails by leaking:
//
//   forward   every declared claim must equal what measures it   → catches drift
//   backward  every number beside a fenced noun in a living page
//             must be a declared claim                           → catches a new
//                                                                  unfenced claim
//
// The backward sweep is what makes this different from a list somebody has to
// remember to extend. Writing a new number about commands into `docs/` fails the
// suite until it is declared, which is the only arrangement under which "the
// documentation is checked" stays true a year from now.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { DEFAULT_KEYS } from "../.tmp-test/bindings.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
export const APP = path.resolve(HERE, "..");
export const ROOT = path.resolve(APP, "..", "..");

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const count = (rel, re) => (read(rel).match(re) ?? []).length;

/** Every `.rs` under a directory, recursively. */
function rustFiles(rel) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".rs")) out.push(full);
    }
  };
  const start = path.join(ROOT, rel);
  if (existsSync(start)) walk(start);
  return out;
}

// ---------------------------------------------------------------- the facts
//
// Each is measured where it lives, and nowhere else. `commandCount` is
// deliberately the same expression `card.mjs` uses, because two ways of counting
// the same thing is the disease rather than a second opinion.

/**
 * The numbers, and the one sentence each that says where it came from.
 *
 * Two are absent and cannot be here: how many assertions the app suite runs and
 * across how many files. Nothing can know those without running, and this module
 * runs *inside* the suite it would be counting. They are checked by `run.mjs`,
 * after the tally, which is the only place that has the answer — see `RUNTIME`.
 */
export function facts() {
  const engineRust = [...rustFiles("ksav/engine/src"), ...rustFiles("ksav/engine/tests")];
  const testAttrs = engineRust.reduce(
    (n, f) => n + (readFileSync(f, "utf8").match(/^\s*#\[test\]/gmu) ?? []).length,
    0,
  );
  // What `cargo test` builds: one binary per `tests/*.rs`, plus one per crate
  // target. Existence and not `#[test]` content, because cargo builds a unit-test
  // binary for `main.rs` and prints a `Running` line for it whether or not it
  // holds a single test — and the number in the README is there to match what a
  // developer sees when they run the command.
  const integration = readdirSync(path.join(ROOT, "ksav/engine/tests")).filter((f) =>
    f.endsWith(".rs"),
  ).length;
  const unitTargets = ["ksav/engine/src/lib.rs", "ksav/engine/src/main.rs"].filter((f) =>
    existsSync(path.join(ROOT, f)),
  ).length;

  return {
    // The command registry. One `cmd!(` per command, bilingual, in one file.
    commands: count("ksav/engine/src/commands.rs", /^\s*cmd!\(/gmu),
    // Keyboard bindings the application ships with, from the object the editor
    // itself installs — which is what makes the card unable to disagree with it.
    bindings: Object.keys(DEFAULT_KEYS).length,
    // Document templates. One `.ksav` each, all of which `assets.rs` compiles.
    templates: readdirSync(path.join(ROOT, "ksav/engine/templates")).filter((f) =>
      f.endsWith(".ksav"),
    ).length,
    // The note options. Counted from `spec.md`'s status table, which is the
    // document that *defines* them — "These are THE note options. There are
    // eleven, and nothing else." `NOTE_CHOICES` is deliberately not the
    // authority: it holds twelve records because one option ships as two
    // chooser cards (sidenotes down one margin and down both), so counting it
    // would replace a true number with a false one.
    noteLayouts: (read("spec.md").match(/^\| \d+ \| .+ \| (?:one|two|one×N) \|/gmu) ?? []).length,
    // Lexicon entries: every line that is not a comment. The generator writes
    // its own count into the header, so the header is checked against the file
    // too — a stale header would otherwise become the authority for the docs.
    hebrewEntries: lexicon("ksav/engine/assets/lexicon-he.txt"),
    englishEntries: lexicon("ksav/engine/assets/lexicon-en.txt"),
    engineTests: testAttrs,
    engineBinaries: integration + unitTargets,
    // Top-level jobs in the CI workflow: a two-space key at the top level of
    // `jobs:`, which is the only place they can be.
    ciJobs: ciJobs(),
  };
}

/** Non-comment lines in a lexicon, checked against the count in its own header. */
function lexicon(rel) {
  const text = read(rel);
  const entries = text.split("\n").filter((l) => l && !l.startsWith("#")).length;
  const header = text.match(/^# ([\d,]+) entries/mu);
  if (header && Number(header[1].replace(/,/g, "")) !== entries) {
    throw new Error(
      `${rel}: the header says ${header[1]} entries and the file has ${entries}. ` +
        `Rerun the builder — the header is what the docs quote.`,
    );
  }
  return entries;
}

function ciJobs() {
  const yml = read(".github/workflows/ci.yml");
  const at = yml.indexOf("\njobs:");
  if (at < 0) return 0;
  // Everything from `jobs:` to the next top-level key, then the two-space keys
  // inside it. Parsed rather than grepped for `^  \w+:` over the whole file
  // because `on:` and `env:` have two-space keys of their own.
  const rest = yml.slice(at + 1).split("\n");
  let n = 0;
  for (const line of rest.slice(1)) {
    if (/^\S/.test(line)) break;
    if (/^ {2}[A-Za-z][\w-]*:\s*$/.test(line)) n++;
  }
  return n;
}

/** The two facts only a finished run knows. `run.mjs` supplies them. */
export const RUNTIME = ["appAssertions", "appTestFiles"];

// ---------------------------------------------------------------- the pages
//
// Default-deny: every tracked `.md` is fenced unless it is covered here as a log.
//
// The distinction is a lifecycle, not a quality judgement, and it is the one
// §10 of the audit identified as the real defect — three files merged a *spec*
// (edited in place, always current) with a *log* (append-only, never edited),
// and every stale number lived at that seam. A dated entry saying "2,276
// assertions" was true on its date; rewriting it would destroy the record. A
// sentence in `docs/start-here.md` saying "there are 107 commands" is simply
// false today.
//
// **The seam is now a directory.** The nine dated units that lived inside those
// three files are `decisions/YYYY-MM-DD-*.md`, one each, and `spec.md` is a
// living page again. That turns the exemption from a list of files somebody
// maintains into a property of where a file *is* — which is the difference
// between an exemption you can be talked into and one you have to perform a
// visible rename to obtain.
//
// It also lets the lifecycle be checked rather than asserted. A log is exempt
// because it is a record of a day, so every page an entry covers must **carry
// its date in its name**. That is a stronger fence than the one it replaces:
// the mutation that forced this rule into existence — adding
// `docs/start-here.md` to the list with a plausible sentence, which switched the
// sweep off for a living page with the suite green — now fails twice, on the
// date and on the load-bearing check below.
//
// Everything is checked from both ends: each entry must cover a tracked page,
// each covered page must be dated, the exemption must be excusing something
// real, and the union of logs and living pages must be exactly the tracked set.
// So this cannot become what `registry.rs`'s `ONLY_AT_TOP` was: a skip list
// that quietly grows and whose entries are unfalsifiable by construction.
export const LOGS = {
  "decisions/": "The dated record — nine waves, audits and resolutions, each true on its date and never edited afterwards. See decisions/README.md.",
  "lamdan/": "Audit reports, each dated and kept verbatim so its fixes are legible beside it.",
};

/** Does this exemption cover that page? A trailing `/` means the directory. */
export function covers(entry, file) {
  return entry.endsWith("/") ? file.startsWith(entry) : file === entry;
}

/**
 * The pages an exemption covers, in tracked order.
 *
 * A directory entry covers what is *tracked* under it rather than what is on
 * disk, so an untracked scratch file cannot quietly join the record.
 */
export function coveredBy(entry, tracked = trackedMarkdown()) {
  return tracked.filter((f) => covers(entry, f));
}

/**
 * A log's date, read off its name — `decisions/2026-08-04-borrowed-wave.md`.
 *
 * `null` for a page with no date in it, which is what the partition check
 * refuses. The index page of a log directory is the one thing that is *not* a
 * record and is exempted by name here, because a directory that cannot explain
 * itself is worse than one file that has to be named twice.
 */
export function logDate(file) {
  if (file.endsWith("/README.md")) return "index";
  const m = /(\d{4}-\d{2}-\d{2})[^/]*\.md$/.exec(file) ?? /(\d{4}-\d{2}-\d{2})\.md$/.exec(file);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- the claims
//
// Every counted claim a living page makes, as the literal text that must appear
// in it. Literal and not a pattern: a pattern that stopped matching would pass
// silently, which is how `chrome.test.mjs`'s Escape block came to survive the
// handler being deleted. `text` is built from the measured fact, so the only way
// to make one of these pass is for the page to say the true number.
export const CLAIMS = [
  ["README.md", "bindings", (n) => `all ${n} bindings`],
  ["ksav/README.md", "commands", (n) => `**${n} commands**`],
  ["ksav/README.md", "commands", (n) => `searches all ${n} commands`],
  ["ksav/README.md", "templates", (n) => `${n} templates (all compile)`],
  ["ksav/README.md", "noteLayouts", (n) => `all ${word(n)} note layouts`],
  ["ksav/README.md", "ciJobs", (n) => `green across all ${word(n)} jobs`],
  ["ksav/README.md", "appAssertions", (n) => `${group(n)} assertions`],
  ["ksav/README.md", "appTestFiles", (n) => `across ${n} files`],
  ["ksav/README.md", "engineTests", (n) => `${n} tests`],
  ["ksav/README.md", "engineBinaries", (n) => `${n} binaries`],
  ["docs/start-here.md", "commands", (n) => `There are ${n} commands`],
  ["docs/start-here.md", "hebrewEntries", (n) => `${group(n)} Hebrew entries`],
  ["docs/start-here.md", "englishEntries", (n) => `${group(n)} English`],
  ["docs/start-here.md", "bindings", (n) => `all ${n} bindings`],
  ["docs/from-word.md", "commands", (n) => `has ${n} bilingual commands`],
  ["docs/from-word.md", "templates", (n) => `${word(n)} templates that all build`],
  ["docs/shortcuts.md", "commands", (n) => `There are ${n} of them`],
];

/** Small numbers read as words in prose, which is how these pages write them. */
const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];
export function word(n) {
  return WORDS[n] ?? String(n);
}

/** Thousands separated, which is how the larger counts are written. */
export function group(n) {
  return n.toLocaleString("en-US");
}

// ------------------------------------------------------- the backward sweep
//
// Nouns whose counts are fenced. A number standing next to one of these in a
// living page must belong to a declared claim.
//
// `RE` allows up to two words between the number and the noun, which covers
// "116 bilingual commands" and "3,528 editor assertions" without reaching so far
// that it starts matching across sentences. Markdown emphasis around either half
// is stripped first, so `**116 commands**` is seen the same as `116 commands`.
export const NOUNS = [
  ["commands?", "commands"],
  ["bindings?", "bindings"],
  ["templates?", "templates"],
  ["note layouts?", "noteLayouts"],
  ["assertions?", "appAssertions"],
  ["engine tests?", "engineTests"],
  ["binaries", "engineBinaries"],
  ["Hebrew entries", "hebrewEntries"],
];

/** Every `.md` git tracks, which is the set a reader can actually reach. */
export function trackedMarkdown() {
  return execFileSync("git", ["ls-files", "*.md"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"));
}

/** Is this page a record rather than documentation? */
export function isLog(file) {
  return Object.keys(LOGS).some((entry) => covers(entry, file));
}

/** The tracked pages that are documentation rather than record. */
export function livingPages(tracked = trackedMarkdown()) {
  return tracked.filter((f) => !isLog(f));
}

export function numericClaimsIn(text) {
  const flat = text.replace(/\*\*/g, "").replace(/`/g, "");
  const out = [];
  for (const [pattern, fact] of NOUNS) {
    // A comma counts as a thousands separator only when three digits follow it.
    // Written as `[\d,]*` it swallowed the one in "CodeMirror 6, command palette"
    // and reported a claim that six commands exist — the sweep's first catch was
    // itself, which is the right order for a sweep to fail in.
    const re = new RegExp(
      String.raw`\b(\d{1,3}(?:,\d{3})+|\d+)\s+(?:[\w'’-]+\s+){0,2}(${pattern})\b`,
      "gu",
    );
    for (const m of flat.matchAll(re)) {
      out.push({ number: Number(m[1].replace(/,/g, "")), noun: m[2], fact, said: m[0] });
    }
  }
  return out;
}
