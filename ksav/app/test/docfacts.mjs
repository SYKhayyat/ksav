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
import { commandCount, offeredCount } from "../tools/commands.mjs";
import { dirOf } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
export const APP = path.resolve(HERE, "..");
export const ROOT = path.resolve(APP, "..", "..");

/**
 * A file, read once per suite run.
 *
 * Nothing under this root changes while the suite runs — it is a checkout, not
 * a workspace being edited — and `documentation.test.mjs` reads the same nine
 * prose files four to six times each: once for the forward claim sweep, once
 * for the backward one, once for the links, once for the partition. **580 KB of
 * prose, read five times.**
 *
 * The suite is a three-second inner loop and this file was about a third of it.
 * A cache is the whole fix and there is nothing to invalidate: a `Map` that
 * outlives the run would be wrong, and this one does not — the process ends.
 */
const fileCache = new Map();
const read = (rel) => {
  const held = fileCache.get(rel);
  if (held !== undefined) return held;
  const body = readFileSync(path.join(ROOT, rel), "utf8");
  fileCache.set(rel, body);
  return body;
};
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
    // The command registry, through the one parser.
    //
    // It was `count("…/commands.rs", /^\s*cmd!\(/gmu)`, and that regex counts
    // **the macro's own recursive expansion** — `commands.rs:39` is the
    // six-argument arm of `macro_rules! cmd` delegating to the seven-argument
    // arm, a `cmd!(` at the start of a line that is not a command. So this file
    // said 116 while every structured reader in the repository said 115, and
    // because this file is the fence that guards counted claims, **the wrong
    // number was the enforced one**: `ksav/README.md` twice and
    // `docs/start-here.md` once told the reader there are 116 commands.
    //
    // A counter that cannot see what it is counting is worth less than no
    // counter, because it is believed.
    commands: commandCount(),
    // What the editor *offers*, which is a different number and was being
    // reported as this one. A deprecated command still compiles and is no
    // longer put in front of anybody, so three pages saying "there are N
    // commands and `#` offers all of them" were wrong by exactly the count of
    // deprecations — and the fence was enforcing the half that was wrong.
    offered: offeredCount(),
    // Keyboard bindings the application ships with, from the object the editor
    // itself installs — which is what makes the card unable to disagree with it.
    bindings: Object.keys(DEFAULT_KEYS).length,
    // Document templates. One `.ksav` each, all of which `assets.rs` compiles.
    templates: readdirSync(path.join(ROOT, "ksav/engine/templates")).filter((f) =>
      f.endsWith(".ksav"),
    ).length,
    // The note destinations, counted from `channels.ts` — the one pick the
    // chooser asks for.
    //
    // This used to count `NOTE_CHOICES`, and before that rows in `spec.md`'s
    // status table, on the stated grounds that the cards were "deliberately not
    // the authority". That reasoning was the tell: the claim being defended was
    // *"there are eleven note options and nothing else"*, and the fence guarding
    // this repository's counted claims had to pick which artifact to count in
    // order to get the answer the prose wanted. When a fence has to choose its
    // evidence, the prose is wrong.
    //
    // The cards are gone and the claim went with them. A writer meets **one
    // question with six answers**, so that is what is counted, off the table
    // that renders it. See §4 of the 7 August report, and Part 6 of
    // `NOTES-PLAN.md` for why the grid had to go.
    noteDestinations: destinationCount(),
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
    // Documents in the differential parse oracle's corpus, counted off the
    // fixture the generator writes — one JSON object per line, so the corpus
    // grows whenever a template, a note layout or an insertion is added and this
    // number moves without anybody deciding to move it. That is the whole reason
    // it is measured: the README used to say "twelve hundred documents" because
    // an exact number would have been a lie within a week.
    oracleDocuments: (read("ksav/engine/tests/fixtures/scan-oracle.json").match(
      /^\s*\{"id":/gmu,
    ) ?? []).length,
  };
}

/**
 * The destinations the chooser offers, off the table that renders them.
 *
 * Sliced to the `DESTINATIONS` array by name, not matched over the whole file:
 * `channels.ts` also holds the presets, and two of those declare an `id` on a
 * line of their own. A count that included them would have read eight, which is
 * the shape of mistake this whole module exists to make impossible — a number in
 * a living page that nothing actually measures.
 */
function destinationCount() {
  const src = read("ksav/app/src/channels.ts");
  const at = src.indexOf("export const DESTINATIONS");
  if (at < 0) throw new Error("channels.ts no longer declares DESTINATIONS");
  const end = src.indexOf("\n];", at);
  return (src.slice(at, end).match(/^\s{4}id: "/gmu) ?? []).length;
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
  ["issue-notes.md", "bindings", (n) => `all ${n} bindings`],
  ["ksav/README.md", "commands", (n) => `**${n} commands**`],
  ["ksav/README.md", "offered", (n) => `searches all ${n} commands`],
  ["ksav/README.md", "templates", (n) => `${n} templates (all compile)`],
  ["ksav/README.md", "noteDestinations", (n) => `all ${word(n)} destinations`],
  ["ksav/README.md", "ciJobs", (n) => `green across all ${word(n)} jobs`],
  ["ksav/README.md", "appAssertions", (n) => `${group(n)} assertions`],
  ["ksav/README.md", "appTestFiles", (n) => `across ${n} files`],
  ["ksav/README.md", "engineTests", (n) => `${n} tests`],
  ["ksav/README.md", "engineBinaries", (n) => `${n} binaries`],
  // The one claim that carries a marker: `documents` is too common a noun to
  // fence, so the reverse sweep declines it and the marker is what closes the
  // gap. See `markedClaimsIn`.
  ["ksav/README.md", "oracleDocuments", (n) => `over **${group(n)}**<!--=oracleDocuments--> documents`],
  // Both numbers, because the page says both and they are different facts: the
  // registry declares them, the editor offers the ones that are current.
  ["docs/start-here.md", "commands", (n) => `declares ${n} commands`],
  ["docs/start-here.md", "offered", (n) => `offers all ${n} of them`],
  ["docs/start-here.md", "hebrewEntries", (n) => `${group(n)} Hebrew entries`],
  ["docs/start-here.md", "englishEntries", (n) => `${group(n)} English`],
  ["docs/start-here.md", "bindings", (n) => `all ${n} bindings`],
  ["docs/from-word.md", "commands", (n) => `has ${n} bilingual commands`],
  ["docs/from-word.md", "templates", (n) => `${word(n)} templates that all build`],
  ["docs/shortcuts.md", "offered", (n) => `There are ${n} of them`],
];

/**
 * Does a page make this claim?
 *
 * Whitespace-insensitive on both sides, because a claim is a sentence in prose
 * and prose does not know where its lines end. `numericClaimsIn` reached that
 * conclusion already — *"every space in a pattern is `\s+`"* — after a paragraph
 * reflow put a newline inside "engine tests" and hid a number that had been
 * wrong by nineteen. The forward check went on comparing a raw literal, so the
 * same reflow did the opposite there and turned a true page red: rewriting a
 * paragraph around "green across all eight jobs" failed the suite over a line
 * break, with the page saying exactly what it is supposed to say.
 *
 * Fail-safe rather than fail-open, so it is a papercut and not a hole — and it
 * is still one rule spelled two ways in one file, which is the shape everything
 * else here exists to stop. Both directions read this now, and so does
 * `run.mjs`, which owns the two claims only a finished run can measure.
 */
export function says(body, want) {
  const flat = (s) => s.replace(/\s+/gu, " ");
  return flat(body).includes(flat(want));
}

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
  // Two facts, one noun, and they are two different true numbers: the registry
  // declares 124 commands and the editor offers the 122 that are not
  // deprecated. A sweep that knew only the first *enforced* it onto three
  // sentences about what a reader can reach, which is the surface contradicting
  // the mechanism with a test holding the surface in place.
  //
  // A claim is accepted when it matches a declaration for **either** fact in
  // that file. That is weaker than one noun per fact and it is what the English
  // supports: nothing in "searches all 122 commands" says which of the two
  // numbers it is, and inventing a second noun to disambiguate would be prose
  // written for the fence.
  ["commands?", ["commands", "offered"]],
  ["bindings?", "bindings"],
  ["templates?", "templates"],
  ["assertions?", "appAssertions"],
  ["engine tests?", "engineTests"],
  ["binaries", "engineBinaries"],
  ["Hebrew entries", "hebrewEntries"],
  // "documents" is deliberately **not** here, though `oracleDocuments` is a
  // measured fact with a declared claim. The word is too common to fence: it
  // matched "10 document templates" and "41 documents" in `README-notes.md`,
  // neither of which is a corpus size, and a sweep that reports two false
  // positives to catch one truth is a sweep people learn to silence. The
  // forward claim is the fence that matters here — the corpus grows whenever a
  // template or an insertion is added, and the README stops containing the
  // sentence the moment it does.
];

/**
 * Every `.md` git is not ignoring, which is the set a reader can actually reach
 * — and, deliberately, the set *this change* will hand them.
 *
 * One spawn per run. `coveredBy` and `livingPages` both default to calling this,
 * and `documentation.test.mjs` calls all three — so a suite that spawns `git`
 * once per *question* spawned it three times to ask about one unchanging list.
 */
let trackedCache = null;
export function trackedMarkdown() {
  if (trackedCache) return trackedCache;
  // `--cached --others --exclude-standard` — everything but the ignored, which
  // is the same list the link sweep in `documentation.test.mjs` takes and for
  // the same reason, written there and not swept to here: a page written in
  // this change is part of this change, staged or not. Reading only the index
  // made this list **shorter before `git add` than after it**, and one
  // assertion is raised per page — so the suite reported one total to whoever
  // ran it before committing and a different one to CI afterwards. The
  // documentation fence then demanded a number that could not be measured
  // until the commit that would have to contain it already existed. It cost a
  // red remote to notice.
  trackedCache = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"));
  return trackedCache;
}

/** Is this page a record rather than documentation? */
export function isLog(file) {
  return Object.keys(LOGS).some((entry) => covers(entry, file));
}

/** The tracked pages that are documentation rather than record. */
export function livingPages(tracked = trackedMarkdown()) {
  return tracked.filter((f) => !isLog(f));
}

/**
 * Numbers a page marks as being about a named fact.
 *
 * Girsa's shape, taken here for the reason the 9 August report gives it the
 * row: *"Readme numbers — Girsa: `<!--=name-->` markers, both directions,
 * `--write` fixer. Ksav: regex prose sweep with four documented retreats, no
 * fixer."*
 *
 * The sweep in `numericClaimsIn` reads *a number standing beside a fenced
 * noun*, which is the right instrument for prose and has one failure it names
 * itself: a noun too common to fence. `NOUNS` records the retreat —
 * *"'documents' is deliberately not here… a sweep that reports two false
 * positives to catch one truth is a sweep people learn to silence"* — and the
 * consequence is that `oracleDocuments` has a forward claim and no reverse one.
 *
 * A marker needs no noun. `**1,035**<!--=oracleDocuments-->` renders as
 * nothing, so a reader sees the sentence and the fence sees which fact the
 * number is about. It is the escape hatch for exactly the numbers the sweep has
 * to decline, and it is not a replacement for it: a marker is something
 * somebody has to add, and the sweep's whole value is over prose nobody marked.
 */
export function markedClaimsIn(text) {
  const out = [];
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)\*{0,2}<!--=([A-Za-z][A-Za-z0-9]*)-->/gu)) {
    out.push({ number: Number(m[1].replace(/,/g, "")), fact: m[2], said: m[0] });
  }
  return out;
}

export function numericClaimsIn(text) {
  const flat = text.replace(/\*\*/g, "").replace(/`/g, "");
  const out = [];
  for (const [pattern, fact] of NOUNS) {
    // A comma counts as a thousands separator only when three digits follow it.
    // Written as `[\d,]*` it swallowed the one in "CodeMirror 6, command palette"
    // and reported a claim that six commands exist — the sweep's first catch was
    // itself, which is the right order for a sweep to fail in.
    // A space inside a *noun* is a line wrap waiting to happen.
    //
    // The gap between the number and the noun was already `\s+`, so it crossed a
    // wrapped line fine. The space inside `engine tests` was a literal one, and
    // `ksav/README.md` had "397 engine\n      tests" in it — a number that had
    // been wrong by nineteen for some time, standing beside a fenced noun, in a
    // living page, invisible to the sweep written to catch exactly that, because
    // a paragraph reflow had put a newline in the middle of the phrase.
    //
    // The sweep's job is to read prose, and prose does not know where its lines
    // end. Every space in a pattern is `\s+`.
    const re = new RegExp(
      String.raw`\b(\d{1,3}(?:,\d{3})+|\d+)\s+(?:[\w'’-]+\s+){0,2}(${pattern.replace(/ /gu, String.raw`\s+`)})\b`,
      "gu",
    );
    for (const m of flat.matchAll(re)) {
      // `facts` plural: a noun can name more than one measured thing, and the
      // caller decides whether *any* of them was declared. Written as one fact
      // it forced a sentence about what the editor offers to carry the number
      // of what the registry declares.
      const facts = Array.isArray(fact) ? fact : [fact];
      out.push({ number: Number(m[1].replace(/,/g, "")), noun: m[2], facts, said: m[0] });
    }
  }
  return out;
}
