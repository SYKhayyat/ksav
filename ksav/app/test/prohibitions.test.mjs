// The classes this repository has already named, as executable prohibitions.
//
// # Why this file exists
//
// The 9 August three-repository report's finding is not a list of bugs. It is a
// habit, and it counted eighteen instances of it:
//
//   > the diagnosis is written down correctly and the sweep never runs
//
// A class named in prose, one member fixed, the siblings left standing. And the
// prose is not vague — in nine of the twelve cases in its §1 it states the
// *class*, in general terms, correctly. `note-commands.ts:20-23` says *"a
// hand-maintained array that only one language ever walked."* `facts.rs:20-28`
// says *"a value crossed a language boundary as source text."* Those are class
// statements. A repository that can name the class and does not sweep it is not
// out of time; it is missing the step where a named class becomes an executable
// prohibition.
//
// **This repository invented that step and then scoped it to two directories.**
// `runner.test.mjs`'s `nothingIsCopiedBackIn` is exactly the right instrument
// and it sweeps `test/` and `tools/` — 60-odd `.mjs` files out of a product
// that is mostly Rust, TypeScript and Typst.
//
// So: repo-wide, every language, seeded with the class statements. The rule for
// the future is the second half of it — **when a finding names a class, the
// commit adds the sweep.** Girsa and sefer-crates carry the same file.
//
// # How a prohibition is written here
//
// Each one is a *class*, not an instance, and each carries the finding that
// produced it. Comments are stripped before matching, because every paragraph
// below that explains what the old arrangement was would otherwise trip the
// test that forbids it — and an exemption is always a **claim with a test
// attached**, never a name on a skip list: if an exempt file stops containing
// the thing it is exempt for, that is a red suite too.

import { check, ok } from "./harness.mjs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../tools/paths.mjs";

/** Directories that hold other people's code, or output. */
const SKIP = new Set([
  "target",
  "node_modules",
  ".git",
  "dist",
  ".tmp-test",
  ".corpus-cache",
  // The record. `decisions/` and `lamdan/` describe the defects at length and
  // quote the code that had them; a prohibition that forbade *naming* a bug
  // would forbid recording it.
  "decisions",
  "lamdan",
]);

/** Every source file in the repository, with comments stripped. */
function sources() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|mjs|js|rs|typ|py)$/u.test(name)) continue;
      // This file states each forbidden pattern as a literal in order to look
      // for it, which is the one exemption every prohibition sweep needs and the
      // only one any of them has.
      if (name === "prohibitions.test.mjs") continue;
      out.push([path.relative(ROOT, full).replace(/\\/gu, "/"), strip(readFileSync(full, "utf8"))]);
    }
  };
  walk(ROOT);
  return out;
}

/**
 * Comments out, in all five languages this repository is written in.
 *
 * `//` and `/* … *​/` cover TypeScript, Rust and Typst; `#` covers Python and
 * TOML-ish lines. A string containing `//` (a URL) survives, which is fine: no
 * prohibition below is spelled like a URL.
 */
function strip(s) {
  return (
    s
      // A block comment must **begin its own line**, and that is not
      // fussiness: `i18n.ts` contains a `/*` inside a Hebrew string, and a
      // greedy-from-anywhere strip swallowed everything from there to the next
      // `*/` — three hundred lines, including the one instance of `כסב` this
      // suite exists to forbid. A sweep that silently deletes the region it is
      // sweeping is the failure mode with the worst shape: it reports green.
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gmu, "")
      .replace(/^\s*(\/\/|#).*$/gmu, "")
      .replace(/\s(\/\/|#)\s.*$/gmu, "")
  );
}

/**
 * The prohibitions.
 *
 * `where` narrows the sweep to the files a rule can sensibly apply to; `allow`
 * lists the owners, each of which is then asserted to *actually contain* the
 * thing it owns.
 *
 * A rule states either `contains` — literal fragments, written with
 * `String.raw` so a backslash in the forbidden text is a backslash here — or
 * `match`, a regular expression, for the two classes that are genuinely a
 * shape rather than a string.
 */
const RULES = [
  {
    // G6, relayed from Girsa — the class: **a test that asserts the size of a
    // registry instead of the property the registry must have.**
    //
    // `services.rs` had `assert_eq!(SERVICES.len(), 15)` with the message *"add
    // the new service to this list too"*, which is a test admitting it will go
    // red for a good change and asking to be edited rather than telling anyone
    // anything. `header.test.mjs` had `check("there are eight of them",
    // EXPORTS.length, 8)`, and adding an Org export turned it red while saying
    // nothing whatever about whether Org export works.
    //
    // Both are the same mistake: a count is a fact about today, and a registry
    // that is *supposed* to grow makes it a tripwire on the wrong wire. What
    // survives a sixteenth service — names are distinct, paths are distinct,
    // every name is spellable in all four targets — is what those tests assert
    // now, and a floor (`>= 15`) is how a suite says "this is populated"
    // without saying "this is finished".
    //
    // Only ALL-CAPS registries are swept, and the scoping is the rule rather
    // than a convenience. `problems.length, 0` is a fact about one input and is
    // exactly right. `SERVICES.len(), 15` is a fact about the product's size.
    // In this codebase a registry is a screaming-case constant, so the case is
    // the difference between the two.
    //
    // That also leaves `manifests.rs` outside, where it belongs: its count is
    // over a *local* — `girsa-…` dependency lines found by a scan that provably
    // cannot see the `[dependencies.girsa-…]` table form — so the number is a
    // tripwire for the scan's blind spot rather than a claim about how many
    // dependencies there ought to be, and the exact names are asserted
    // immediately below it. It carries no exemption here because it never
    // matches; an exemption that is never exercised is a name on a skip list,
    // which this file's header refuses.
    what: "no test pins the exact size of a registry",
    where: /\.(rs|mjs|ts)$/u,
    match: /\b[A-Z][A-Z0-9_]{2,}\s*(?:\.len\(\)|\.length|\.size)\s*,\s*\d+\s*[,)]/u,
  },
  {
    // §1 #2 and dup §1.1 — the class: **the Hebrew mark block, written out by
    // hand.** `U+0591–U+05C7` is not "the marks": four characters in it are
    // punctuation that separates words (maqaf ־, paseq ׀, sof pasuq ׃, nun
    // hafukha ׆), and every hand-written copy of the range in this product got
    // that wrong or half-wrong. `spell/hebrew.rs` had the whole block with
    // nothing excluded; `sefarim.ts` had it split around exactly one hole,
    // because maqaf was the one that had been found; `build_lexicon.py` had the
    // whole block in Python.
    //
    // `girsa-hebrew` is the authority. The Typst prelude and the generated
    // TypeScript are the two places that cannot call it, and both get the answer
    // as a value.
    what: "nothing writes the Hebrew mark block out by hand",
    where: /\.(ts|mjs|rs|py|typ)$/u,
    contains: [
      // The four spellings the block was written in across this product: two
      // Rust/Typst escapes, one Python character class, one bare literal range.
      String.raw`0591`,
      String.raw`\u0591-\u05c7`,
      String.raw`\u0591-\u05c7`,
      "\u0591-\u05c7",
    ],
    allow: [
      // The prelude cannot call Rust. `one_want.rs` executes it against the
      // same corpus the other implementations are executed against.
      "ksav/engine/typst/ksav.typ",
      // The oracle itself, which has to name the range in order to sweep it.
      "ksav/engine/tests/one_want.rs",
      // The engine's serialiser: it *measures* the block by asking the crate,
      // which is the one place the two endpoints have to be written down.
      "ksav/engine/src/facts.rs",
    ],
  },
  {
    // §1 #12 — the class, stated at `lib.rs:692`: **nothing else is allowed to
    // build a string literal by hand.** The rule was right and it was enforced
    // at the site that prompted it and nowhere else — `sefarim.rs:381` was a
    // byte-identical copy in the same crate, forty lines from a `use super::*`,
    // and there were two more in TypeScript.
    what: "nothing builds a Typst string literal by hand",
    where: /\.(ts|mjs|rs)$/u,
    contains: [
      String.raw`replace('\\', "\\\\")`,
      String.raw`.replace(/\\/g, "\\\\")`,
    ],
    allow: ["ksav/engine/src/escape.rs", "ksav/app/src/typst-escape.ts"],
  },
  {
    // dup §1.2 — the class: **two escapers for one markup language.**
    // `girsa-ksav`'s escaped ten characters and `typstContent` escaped five,
    // and both write `#מראה_מקום(מקור: …)[…]` out of the same Girsa `display`
    // string. A hand-written character class here is a second opinion about
    // what Typst reads as markup.
    what: "nothing carries its own list of Typst markup characters",
    where: /\.(ts|mjs)$/u,
    contains: [String.raw`([[\]#$])`, String.raw`([\[\]#$])`],
    // No owner. The list is `engine/src/escape.rs`'s and arrives here as
    // `MARKUP_ESCAPES`; a character class spelled out on this side is, by
    // construction, a second opinion.
    allow: [],
  },
  {
    // §1 #9 — a prohibition this repository already wrote, scoped to two
    // directories. `.pathname` on a `file://` URL is still percent-encoded, so
    // a checkout under `C:\Users\Some One\` resolves to `Some%20One` and the
    // suite dies at import time with a path nobody can read.
    what: "nothing hand-rolls a path from import.meta.url",
    where: /\.(ts|mjs|js)$/u,
    contains: ["import.meta.url).pathname"],
    allow: [
      // `tools/paths.mjs` is deliberately **not** here: it is the fix, not an
      // owner. It calls `fileURLToPath`, so it does not contain the forbidden
      // expression at all, and listing it would be an exemption with nothing
      // behind it — which the owner check below turns into a red suite.
      //
      // States the pattern in order to look for it — the same exemption this
      // file takes for itself. `runner.test.mjs` sweeps `test/` and `tools/`;
      // this one sweeps the repository, and both are worth having: a helper
      // directory has copies a whole-tree sweep would drown in.
      "ksav/app/test/runner.test.mjs",
    ],
  },
  {
    // §1 #8 — the class, stated at `facts.rs:20-28`: **a value crossed a
    // language boundary as source text.** Four tables were read by parsing Rust;
    // they are serialised now. The prohibition is the class, not the four:
    // nothing on this side opens a `.rs` file to read a value out of it.
    //
    // Two exemptions, both of which read Rust for something that is not a
    // One exemption: `facts.mjs` counts declarations — `cmd!(`, `svc(`,
    // `Notice {` — which can only ever refuse loudly, never produce a wrong
    // value, and survives every reflow rustfmt can perform.
    what: "no generator reads a value out of Rust source",
    where: /^ksav\/app\/(tools|src)\/.*\.(ts|mjs)$/u,
    match: /\.rs["'`]/u,
    allow: ["ksav/app/tools/facts.mjs"],
  },
  {
    // §1 #15 — the class: **keying on another crate's English `Display`.**
    // `girsa_post::PostError` is the one error type that crosses the seam, and
    // both frontends matched its prose with four character-identical regexes.
    // It has `code()` now. The words after the colon are not API and nothing
    // may treat them as such.
    what: "nothing matches girsa-post's English prose",
    where: /^ksav\/app\/src\/.*\.ts$|^ksav\/app\/test\/.*\.mjs$/u,
    contains: ["refused it", "is not running", "could not reach"],
    allow: [
      // The test corpus: real strings, as the crate produces them.
      "ksav/app/test/diagnostics.test.mjs",
    ],
  },
  {
    // §1 #14 — `כסב` is kaf-samekh-bet, a transliteration of the Latin "Ksav"
    // back into Hebrew, i.e. wrong; the application is `כְּתָב`. Girsa has a test
    // literally named *"nowhere in src spells the sibling כסב"* and it cannot
    // read this tree, so the misspelling sat in `i18n.ts` — in the application
    // whose own name it is, in the string that tells the reader it needs Girsa.
    //
    // And the sibling's name is spelled two ways here: `גִּרְסָא` pointed in
    // `diagnostics.ts`, unpointed `גרסא` eight times in `i18n.ts`. Both are
    // readable; one product should pick one.
    what: "nothing spells this application כסב",
    where: /\.(ts|mjs|rs|typ)$/u,
    contains: ["\u05DB\u05E1\u05D1"],
    allow: [],
  },
  {
    // The other half of the same finding: the *sibling's* name was spelled two
    // ways here \u2014 pointed `\u05D2\u05B4\u05BC\u05E8\u05B0\u05E1\u05B8\u05D0` in `diagnostics.ts`, unpointed seven
    // times in `i18n.ts`.
    //
    // A blanket ban would be wrong, and that is the interesting part:
    // `\u05D2\u05E8\u05E1\u05D4` / `\u05D2\u05E8\u05E1\u05D0\u05D5\u05EA` is the ordinary Hebrew word for *version*, and
    // `i18n.ts` legitimately says it about the document history. So the rule is
    // on the shapes that can only be the **application** \u2014 the bare name, with
    // or without a glued preposition, and not the plural or the `\u05D4` form. That
    // is narrower and true, where the obvious rule would have been neither.
    //
    // `names.ts` holds the pointed spelling; `${GIRSA}` composes with the
    // preposition at the call site.
    what: "nothing spells the sibling application unpointed",
    where: /^ksav\/app\/src\/.*\.ts$/u,
    match: /[\u05DE\u05D1\u05DB]?\u05E9?\u05D2\u05E8\u05E1\u05D0(?![\u05D5\u05D4])/u,
    allow: [],
  },
  {
    // The class: **a key combination decided somewhere other than
    // `DEFAULT_KEYS`.** There were two, and they were the two errands that go
    // to Girsa.
    //
    // `wireKeys` answered `Ctrl+Shift+L` and `Ctrl+Shift+M` by comparing
    // `e.key` to a letter on the window. Four things follow from that and every
    // one of them is invisible from the code that does it: neither chord could
    // be rebound; neither reached `tools/card.mjs`, the key list or `F1`, all
    // three of which read the table; both went on firing while Vim or Emacs
    // held the keyboard, since `buildShortcutKeymap` returning nothing only
    // stands down *this* table; and `Ctrl+Shift+L` is `left`, so the editor
    // aligned the paragraph and the window linkified the selection — two
    // actions on one combination, which is the single rule the table has.
    //
    // A *bare* key is not this class and is not forbidden: the hydra reads
    // `q` and `Escape` with no modifier at all, having deliberately taken the
    // keyboard, and it lets every modified key through untouched. What is
    // forbidden is a modifier flag and a letter, together, outside the table.
    what: "no combination is decided outside the bindings table",
    where: /^ksav\/app\/src\/.*\.ts$/u,
    match: /(ctrlKey|metaKey|altKey)[\s\S]{0,200}?\.key(\.toLowerCase\(\))?\s*===\s*["'][A-Za-z0-9]["']/u,
    allow: [],
  },
  {
    // The class: **a surface prints a chord without asking whether a mode has
    // taken the keyboard.** There were twenty.
    //
    // `buildShortcutKeymap` returns nothing at all while Vim or Emacs is really
    // installed — that is *how* a mode wins, rather than by out-ranking
    // anything — but `keybindings()` goes on returning the whole table, and
    // every menu's `<code>`, every toolbar tooltip, the snapshot note, the
    // spelling tooltip, the switcher heading, the fold levels, the help panel
    // and the palette rows printed it. Under a mode, all twenty named a key
    // that did nothing. The shortcut list was the single surface that knew,
    // because it was the single surface that had been told, and even it went on
    // reading the chord to answer its own search box.
    //
    // So `readable` is now reachable in `src/` from one module: whoever wants to
    // print a key calls `keyHint`, which is given the mode and cannot answer
    // without it. `tools/card.mjs` is outside this sweep and stays outside — the
    // card is a printed page, there is no mode to ask about, and chords are the
    // whole content.
    what: "no surface spells a chord without going through keyHint",
    where: /^ksav\/app\/src\/.*\.ts$/u,
    contains: ["readable("],
    allow: ["ksav/app/src/bindings.ts"],
  },
  {
    // dup §1.3 — the class: **a hand-written table of which commands are
    // headings.** There were five. `spans.ts` derives it from the document and
    // is the authority; `markdown.ts` keeps the two rows that are deliberately
    // *not* headings-by-role. A third list of `כותרת1`/`כותרת2`/`כותרת3` is a
    // fourth opinion, and every one of them so far has been missing the English
    // half, the levels past three, or both.
    what: "nothing keeps a private list of heading commands",
    where: /^ksav\/app\/src\/.*\.ts$/u,
    // A *level*, not merely the name. `actions.ts` maps `h1: "\u05DB\u05D5\u05EA\u05E8\u05EA1"` \u2014 an
    // action id to a command, which is a pairing and not a claim about
    // hierarchy, and its own header explains at length why it lives apart from
    // `main.ts` precisely so a pairing sweep can read it honestly. The class
    // here is a table that says how deep a heading is.
    match: /\u05DB\u05D5\u05EA\u05E8\u05EA1["']?\s*:\s*1\b/u,
    // `spans.ts` alone. `markdown.ts`'s surviving pair is `שער`/`תת_שער`, which
    // are the two the export deliberately maps to `<h1>`/`<h2>` *without* being
    // headings by role — so it names no `כותרת` at all and needs no exemption,
    // which is the shape a correct second table has.
    allow: ["ksav/app/src/spans.ts"],
  },
  {
    // The class: **a raw control character inside a source file.** Twice in the
    // same file, and both times a string literal that was meant to hold
    // something printable: a NUL used as a separator, written as the byte
    // instead of as the escape, and a sentinel value that was meant to be a
    // space.
    //
    // The bug is not the character. It is that ripgrep treats a file containing
    // a NUL as **binary and stops searching it** — silently, at the first one —
    // so `main.ts`, the largest module in the application, answered every search
    // with partial results and said so in a warning nobody reads. A tool that
    // quietly stops working is the exact shape this suite is for, and it cost an
    // hour of "why does this grep find nothing".
    //
    // Tab and the two line endings are the whole of the legitimate set.
    // Anything that genuinely needs one of the others has an escape in every
    // language here, and an escape is greppable, diffable and visible in a
    // review, which the byte is not.
    //
    // Stated as a `probe` rather than a `match` on purpose: a regular expression
    // for this has to *contain* the characters it forbids, either as literals —
    // which is the bug — or as escapes, which is one editor away from being
    // turned back into literals. That is how the second instance got in. A loop
    // over character codes cannot be corrupted into passing.
    what: "no source file carries a raw control character",
    where: /\.(ts|mjs|js|rs|typ|py)$/u,
    probe: hasControlChar,
    allow: [],
  },
  {
    // The class: **another program's internal alphabet, shown to a reader.**
    //
    // `git status` reports state as two letters out of `M A D R C U ?` — an
    // alphabet that is neither English nor Hebrew, and that a writer of a sefer
    // has no reason to have learned. There are six states and there are six
    // words for them in both languages, so a drawer printing the letter has
    // handed the reader a lookup table instead of an answer.
    //
    // Written as a property access rather than as the letters themselves,
    // because forbidding `"M"` would forbid the alphabet in the module whose
    // job is to translate it. Reading `.staged` or `.worktree` *is* the act of
    // handling a raw status code, `git.ts` is the one place that may, and
    // `stateKey` is what everybody else asks. Mutation-tested by moving the
    // `f.worktree` test out of `git.ts` and into `main.ts`, which goes red
    // naming `main.ts`.
    //
    // TypeScript only, and that is the scope rather than an oversight: the
    // engine's own `git.rs` builds these fields and cannot be forbidden from
    // touching them. What the rule is about is the client, where the letters
    // would reach a screen.
    // The trailing `(?!["'])` is not decoration. Written without it, this rule
    // matched the i18n key `"git.staged"` in both dictionaries and named
    // `i18n.ts` and `main.ts` as violators — a false positive on a *string*,
    // for a rule about a *property access*. That is how a sweep teaches people
    // to silence it. An interface key is always inside quotes and always
    // closed by one immediately after, and a property access never is.
    // (The key was renamed to `git.readyToCommit` as well, because it reads
    // better; the guard stays, because the next key is not renamed yet.)
    what: "only git.ts reads git's status letters",
    where: /^ksav\/app\/(src|tools)\/.*\.(ts|mjs)$/u,
    match: /\.(?:staged|worktree)\b(?!["'])/u,
    allow: ["ksav/app/src/git.ts"],
  },
  {
    // The class: **a second place that starts a program the product already
    // drives from one.**
    //
    // Version control runs `git` as a subprocess, and every invocation has to
    // carry seven pieces of environment or it can stop and wait for a human
    // that is not there: terminal prompts off, askpass empty, ssh in batch
    // mode, the credential manager silenced. `git.rs` sets them in the one
    // function that spawns, and a test inside it holds that there is exactly
    // one such function. This is the same claim one level out — a second
    // module starting git anywhere in the product would be a second place to
    // forget them, and the symptom is a drawer that hangs rather than an error
    // anybody can read.
    //
    // Scoped to the product's own source. `docfacts.mjs` and
    // `documentation.test.mjs` run `git ls-files` to enumerate what is tracked,
    // which is a build-time question about this repository and not version
    // control for a writer's sefer; they are outside the sweep by path rather
    // than by exemption, because they are not the thing the rule is about.
    what: "one place in the product starts git",
    where: /^ksav\/(app\/src|app\/src-tauri\/src|engine\/src|wasm)\/.*\.(ts|rs)$/u,
    contains: [
      String.raw`Command::new("git")`,
      String.raw`spawn("git"`,
      String.raw`execFile("git"`,
      String.raw`execFileSync("git"`,
    ],
    allow: ["ksav/engine/src/git.rs"],
  },
  {
    // The class: **the last compile is not the pages on screen, and reaching
    // for the wrong one of them is invisible until a compile fails.**
    //
    // `runtime.lastResult` is stored unconditionally, failed compiles included,
    // and a failed compile carries `pages_svg: []`. The redraw is deliberately
    // skipped in that case — a writer mid-keystroke keeps looking at the last
    // good page rather than at a blank rectangle — so from that moment the two
    // records disagree, and everything that wanted *the pages* and reached for
    // the compile got the empty one.
    //
    // Two instances, found nine days apart and identical in shape. Print read
    // `lastResult.pages_svg` and produced a **blank sheet**, silently, on the
    // one output that is paper; `preview.ts` grew `currentPages()` for it. Then
    // the narrowed preview asked `lastResult.pages_lines` whether it needed to
    // ask the engine anything, got a stale non-empty answer, never asked, and
    // hid every page of a document using the section boundaries of one the
    // writer had already left. Neither is a bug in the reader; both are the
    // same reader reading the wrong record.
    //
    // So `pages_*` off `lastResult` is the shape, and there is no owner: the
    // record of what is drawn is written by drawing, in `preview.ts`, and
    // `currentPages()` and `hasPageLines()` are what everything asks — including
    // `preview.ts` itself, which never looks at the compile at all. `lastResult`
    // keeps its other consumers, which want the *compile* and not the pages:
    // the diagnostics, the healed count, and whether it succeeded at all.
    what: "the pages on screen are asked of the preview, not of the last compile",
    where: /^ksav\/app\/src\/.*\.ts$/u,
    match: /lastResult[?.\s]*\.\s*pages_/u,
  },
  {
    // The class: **a file is handed to the writer and nothing says so.**
    //
    // Found by exporting a PDF from the assembled application on 16 August and
    // watching the status bar read *rendering…* for eleven seconds while the
    // file sat in the downloads folder. `exportPdf` announced its *start* and
    // then said something only if something was wrong; Markdown, Org and plain
    // text said nothing at all, so they left standing whatever the last
    // operation had put there.
    //
    // `handOver` in `exports.ts` is the answer for the seven export routes, and
    // `exports.test.mjs` holds them to it. It could not see the eighth:
    // `exportDictionary` in `main.ts` wrote `ksav-dictionary.txt` and returned
    // in silence, one module outside that file's reach — which is this
    // repository's own habit, named in this file's header, of scoping the sweep
    // to where the instance was found.
    //
    // So the rule is about the *gesture*: a `download(` and the sentence that
    // names the file live within a few lines of each other. Not the enclosing
    // function, which would mean parsing one out of a ten-thousand-line file; a
    // window is enough, because the announcement belongs next to the handover
    // anyway.
    //
    // What it looks for is `exported` — the one message that says a file's name
    // back — rather than a particular surface, because the surface is not
    // always the status bar. The crash panel's rescue button relabels *itself*,
    // and it is right to: the writer is looking at a dialog covering an
    // application that has just crashed, and a line on the status bar behind it
    // is not an answer to *did my words reach the disk*.
    //
    // `dom.ts` and `files.ts` are out of scope rather than exempt, and the
    // difference matters: they *define* the mechanism, and `files.ts`'s own call
    // is the fallback inside `saveAs`, whose announcement is `save.ts`'s — a
    // save that reports itself twice is worse than one that reports itself once.
    what: "a file handed to the writer is announced beside the handover",
    where: /^ksav\/app\/src\/(main|exports)\.ts$/u,
    probe: (body) => {
      const lines = body.split("\n");
      return lines.some((line, i) => {
        if (!/(?<![\w.])(?:files\.)?download\(/u.test(line)) return false;
        const near = lines.slice(Math.max(0, i - 3), i + 8).join("\n");
        return !/"exported"|handOver\(/u.test(near);
      });
    },
  },
];

/** Any character below space that is not tab, newline or carriage return. */
function hasControlChar(body) {
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) return true;
  }
  return false;
}

/** Does this file break the rule? */
function breaks(rule, body) {
  if (rule.probe) return rule.probe(body);
  if (rule.match) return rule.match.test(body);
  return rule.contains.some((fragment) => body.includes(fragment));
}

export async function run() {
  const files = sources();
  ok("the sweep found the repository", files.length > 150, `${files.length} files`);
  // Every language, or a rule that only ever looks at TypeScript would pass by
  // never meeting the Rust it is about.
  for (const ext of ["ts", "mjs", "rs", "typ", "py"]) {
    ok(
      `…including its ${ext} files`,
      files.some(([f]) => f.endsWith(`.${ext}`)),
    );
  }

  for (const rule of RULES) {
    const looked = files.filter(([f]) => rule.where.test(f));
    ok(`${rule.what}: the sweep reached some files`, looked.length > 0, `${looked.length}`);

    // A rule with no exemptions says so by having none. `rule.allow` was
    // required, so the first prohibition that genuinely applied everywhere had
    // to write `allow: []` to say "nothing" — and an empty list reads like an
    // exemption somebody removed rather than one that never existed.
    const allow = rule.allow ?? [];
    const guilty = looked
      .filter(([f]) => !allow.includes(f))
      .filter(([, s]) => breaks(rule, s))
      .map(([f]) => f);
    check(rule.what, guilty, []);

    // An exemption is a claim with a test attached. A file listed as the owner
    // of a rule and no longer containing what it owns is either a moved
    // authority nobody updated here, or a rule that has quietly stopped
    // matching anything at all — and the second is how a green sweep comes to
    // guard nothing.
    for (const owner of allow) {
      const found = looked.find(([f]) => f === owner);
      ok(`…and ${owner} is in the sweep`, !!found);
      if (found) {
        ok(`…and still owns "${rule.what}"`, breaks(rule, found[1]), owner);
      }
    }
  }
}
