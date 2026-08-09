// The documentation, checked the way the application is.
//
// `readme.test.mjs` opens by arguing that *"documentation that names a key the
// application does not have is the same bug as a menu item that does nothing …
// and it is the easiest of all of them to ship, because prose compiles no matter
// what it says."* It is right, and it then asserts twelve key names and two
// phrases over **one** of nine prose files, and zero numbers — which is how
// nineteen false claims survived forty-five green assertions.
//
// This file is the rest of that argument. Four fences, in the order they fail:
//
//   1. The shortcut card is what its generator produces, byte for byte.
//   2. Every counted claim in a living page equals what measures it, and every
//      number beside a fenced noun is a declared claim.
//   3. Every relative link in a tracked page resolves to a tracked file.
//   4. The living/log partition covers every tracked `.md` exactly once.
//
// Deliberately **not** named `docs.test.mjs`, which the audit asked for: that
// name belongs to `src/docs.ts`, and this project's one reliable convention is
// one test file per module. Breaking it to free a name would cost more than the
// name is worth.

import { ok, check } from "./harness.mjs";
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { card } from "../tools/card.mjs";
import path from "node:path";
import {
  facts,
  CLAIMS,
  LOGS,
  RUNTIME,
  NOUNS,
  numericClaimsIn,
  markedClaimsIn,
  trackedMarkdown,
  livingPages,
  isLog,
  coveredBy,
  logDate,
  APP,
  ROOT,
} from "./docfacts.mjs";

export async function run() {
  const tracked = trackedMarkdown();
  const living = livingPages(tracked);
  const F = facts();

  // ------------------------------------------------------------- the card
  //
  // `card.mjs` reads `bindings.ts` and `i18n.ts` through the same esbuild path
  // the runner uses, so the card *cannot* disagree with the application — a
  // genuinely good design that was run once, by hand, on 4 August, and never
  // again. By 6 August `docs/shortcuts.md` was seventeen rows short and three
  // rows wrong, and the wrong ones were the dangerous kind: `Ctrl+Alt+D` was
  // printed as "Mark as deleted" while the application had rebound it to
  // **Endnote**. A generator nothing re-runs is a hand-written file with extra
  // steps.
  {
    // Imported, not spawned. This was `execFileSync(process.execPath, …)` — a
    // whole `node` — and cost **273 ms of a 2,000 ms suite**, 14%, to reprint a
    // markdown file, in the suite whose runner header celebrates removing six
    // spawns for costing 55% of the loop. The generator is a function now and
    // still prints when it is run, which is how the card is regenerated.
    const generated = await card();
    const onDisk = readFileSync(path.join(ROOT, "docs/shortcuts.md"), "utf8");
    const norm = (s) => s.replace(/\r\n/g, "\n").trimEnd();
    check(
      "docs/shortcuts.md is what `node tools/card.mjs` prints (rerun it)",
      norm(onDisk),
      norm(generated),
    );
    // The generator's value is that it cannot invent a name. Ten of the bindings
    // are structure operations with no `sc.` string; they are named where every
    // other surface reads their names from, and the card now looks there. A row
    // printing a bare id is a row nobody has named in either language.
    const unnamed = [...onDisk.matchAll(/^\| .+ \| `([\w.]+)` \|/gmu)].map((m) => m[1]);
    check("every binding on the card is named in both languages", unnamed, []);
  }

  // ------------------------------------------------------------ the numbers
  //
  // Forward: every declared claim must appear, spelled with the measured number.
  {
    for (const [file, factName, text] of CLAIMS) {
      if (RUNTIME.includes(factName)) continue; // `run.mjs` owns these two
      const n = F[factName];
      ok(
        `${factName} is a fact something measures`,
        typeof n === "number" && Number.isFinite(n) && n > 0,
      );
      const want = text(n);
      const body = readFileSync(path.join(ROOT, file), "utf8");
      ok(`${file} says "${want}"`, body.includes(want));
    }
  }

  // Backward: a number standing beside a fenced noun in a living page must be
  // one of the declarations above. This is the half that survives a year — a new
  // sentence saying "142 commands" fails until somebody declares it, so the fence
  // cannot be outgrown by prose the way a hand-written list silently is.
  {
    const declared = new Set();
    for (const [file, factName, text] of CLAIMS) {
      const n = RUNTIME.includes(factName) ? null : F[factName];
      declared.add(`${file}::${factName}::${n}`);
    }
    const stray = [];
    for (const file of living) {
      const body = readFileSync(path.join(ROOT, file), "utf8");
      for (const c of numericClaimsIn(body)) {
        const runtime = RUNTIME.includes(c.fact);
        const key = `${file}::${c.fact}::${runtime ? null : c.number}`;
        if (!declared.has(key)) stray.push(`${file}: "${c.said}"`);
      }
    }
    check("no living page states a fenced count that nothing checks", stray, []);
  }

  // ── the marked numbers ────────────────────────────────────────────────────
  //
  // The escape hatch for the numbers the sweep above has to decline. `NOUNS`
  // records the one it declined and why — *"'documents' is deliberately not
  // here… a sweep that reports two false positives to catch one truth is a
  // sweep people learn to silence"* — and the price was that `oracleDocuments`
  // had a forward claim and no reverse one: the README could carry a *second*
  // documents number, wrong, and nothing here would look at it.
  //
  // A marker needs no noun. `**1,035**<!--=oracleDocuments-->` renders as
  // nothing, so a reader sees the sentence and this sees which fact it is.
  // Girsa's shape, taken for the reason the 9 August report gives it that row.
  {
    const wrong = [];
    const unknown = [];
    let marked = 0;
    for (const file of living) {
      const body = readFileSync(path.join(ROOT, file), "utf8");
      for (const c of markedClaimsIn(body)) {
        marked += 1;
        if (!(c.fact in F)) {
          unknown.push(`${file}: "${c.said}" names no measured fact`);
          continue;
        }
        if (F[c.fact] !== c.number) {
          wrong.push(`${file}: "${c.said}" — the tree has ${F[c.fact]}`);
        }
      }
    }
    ok("the pages carry marked numbers", marked > 0, `${marked} of them`);
    check("every marked number names a fact this repository measures", unknown, []);
    check("and every marked number is what that fact measures", wrong, []);
  }

  // The two nouns whose counts only a finished run knows are still swept for, so
  // a *wrong* one is caught here even though the right one is checked elsewhere.
  ok(
    "the runtime facts are claimed somewhere, so `run.mjs` has something to check",
    RUNTIME.every((f) => CLAIMS.some(([, name]) => name === f)),
  );

  // -------------------------------------------------------------- the links
  //
  // Four links to `Girsa/docs/start-here.md` pointed at `../../Girsa/...` — a
  // path out of this repository into an untracked sibling directory, which
  // resolves on exactly one machine on earth and 404s for every reader on
  // GitHub. One of them was hardcoded inside `card.mjs`, so regenerating the
  // card would have written it back. The same sweep catches `LICENSE`, which
  // named `engine/src/spell.rs` — a file that has not existed since the spell
  // checker became a directory.
  {
    const broken = [];
    // Tracked, plus untracked files git would accept — `--others
    // --exclude-standard` is exactly "everything but the ignored". Tracked alone
    // is the tighter rule and the wrong one in practice: it fails a page the
    // moment it names a file added in the same change and not yet staged, which
    // is a fence that punishes writing the documentation at the same time as the
    // code. What it must still refuse is `dist/`, `pkg/` and the untracked
    // sibling directory — and it does, because those are ignored.
    const targets = new Set(
      execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
        cwd: ROOT,
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean)
        .map((p) => p.replace(/\\/g, "/")),
    );
    for (const file of [...tracked, "LICENSE"]) {
      const body = readFileSync(path.join(ROOT, file), "utf8");
      const dir = path.posix.dirname(file);
      for (const m of body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/gu)) {
        const href = m[1];
        if (/^(?:https?:|mailto:|#)/u.test(href)) continue;
        const [rel] = href.split("#");
        if (!rel) continue;
        const resolved = path.posix.normalize(path.posix.join(dir, decodeURI(rel)));
        const full = path.join(ROOT, resolved);
        const isDir = existsSync(full) && statSync(full).isDirectory();
        // A directory is a legitimate target on GitHub; a file has to be tracked,
        // because an untracked one is exactly the link that works for its author
        // and nobody else.
        if (!targets.has(resolved) && !isDir) broken.push(`${file} → ${href}`);
      }
    }
    check("every relative link in a tracked page resolves to a tracked path", broken, []);

    // The same question asked of paths that are not links, because the ones that
    // go wrong mostly are not. `LICENSE` argued its whole case on the behaviour
    // of `engine/src/spell.rs` — a file that stopped existing when the spell
    // checker became a directory — and no link check would ever have seen it,
    // because it is a sentence, not a link.
    //
    // Fenced code blocks are skipped: `cp pkg/ksav_wasm.d.ts …` is an
    // instruction about a build output, not a reference to a file in the tree,
    // and treating the two the same would make this fence noise within a week.
    // Living pages only, unlike the link sweep above. A dated log entry naming
    // `spell.rs` was telling the truth in June; a page a reader is sent to today
    // is not.
    const missing = [];
    for (const file of [...living, "LICENSE"]) {
      const body = readFileSync(path.join(ROOT, file), "utf8")
        .replace(/^```[\s\S]*?^```/gmu, "")
        // A path wrapped across a line still names one file.
        .replace(/\/\n\s*/gu, "/");
      const dir = path.posix.dirname(file);
      for (const m of body.matchAll(
        /(?:^|[\s`([])([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.*{},-]+)+)(?=[\s`)\].,;:]|$)/gmu,
      )) {
        const p = m[1];
        if (!/\.(?:rs|ts|mjs|typ|json|toml|yml|html|css|ksav|py)$/u.test(p)) continue;
        if (/[*{]/u.test(p)) continue; // a glob names a family, not a file
        // Tried from the repository root and from the two crate roots the prose
        // writes paths relative to, which is how these pages are actually read.
        const tries = [p, `ksav/${p}`, `ksav/app/${p}`, `ksav/engine/${p}`, path.posix.join(dir, p)];
        if (!tries.some((c) => targets.has(path.posix.normalize(c)))) missing.push(`${file}: ${p}`);
      }
    }
    check("every source path a page names in prose exists", missing, []);
  }

  // --------------------------------------------------------- the partition
  //
  // The exemption list, checked from both ends.
  //
  // `registry.rs`'s `ONLY_AT_TOP` is what this is written against: nine commands
  // exempted from a sweep, six of them provably wrong, and not one able to make
  // the test red no matter what it did — unfalsifiable by construction. An
  // exemption is only safe when leaving something out is as loud as putting
  // something in.
  {
    /** Every counted claim in a page that is no longer true. */
    const staleIn = (file) =>
      numericClaimsIn(readFileSync(path.join(ROOT, file), "utf8")).filter((c) =>
        RUNTIME.includes(c.fact) ? true : c.number !== F[c.fact],
      );

    const idle = [];
    const undated = [];
    for (const [entry, why] of Object.entries(LOGS)) {
      const pages = coveredBy(entry, tracked);
      ok(`the log ${entry} covers a tracked page`, pages.length > 0);
      ok(`…and says why it is exempt`, typeof why === "string" && why.length > 20);
      for (const page of pages) {
        ok(`${page} is on disk`, existsSync(path.join(ROOT, page)));
        // The lifecycle, checked rather than asserted. A record is exempt
        // because it was true on a *date*, so it has to carry one — which is
        // why `decisions/` names its files `YYYY-MM-DD-slug.md` and why a
        // living page cannot be moved in there without looking like what it is.
        if (!logDate(page)) undated.push(page);
      }
      // And — the part that stops this being a skip list — the exemption must be
      // excusing something. A log qualifies because it states counts that were
      // true on their date and are false now; if the sweep would pass over
      // everything it covers anyway, the entry is buying nothing and its only
      // effect is to switch the sweep off for pages that did not need it.
      //
      // Found by mutation, and the mutation is the reason this exists: adding
      // `docs/start-here.md` here with a plausible-sounding sentence turned the
      // backward sweep off for a living page and the suite stayed green — which
      // is `ONLY_AT_TOP` exactly, reproduced inside the fence written against it.
      if (!pages.some((p) => staleIn(p).length)) idle.push(entry);
    }
    check(
      "every exempted log is exempted from something (drop the ones that are clean)",
      idle,
      [],
    );
    check("and every page it covers is a dated record", undated, []);

    // Default-deny is arithmetic on this list — every tracked `.md` that is not
    // covered is swept — so asserting the two sets add up to the tracked set
    // would be asserting subtraction. What can actually go wrong is an entry
    // that is too *wide*: `docs/` here would switch the sweep off for three
    // living pages at once and every count above would still balance. So the
    // pages that are documentation by definition are named, and an exemption
    // that reaches one of them is red.
    check(
      "no exemption reaches a page that is documentation",
      ["README.md", "ksav/README.md", "spec.md", ...tracked.filter((f) => f.startsWith("docs/"))]
        .filter((f) => !living.includes(f)),
      [],
    );
    ok("there are living pages to check", living.length > 0);
    ok("and there are records being kept apart from them", living.length < tracked.length);
    ok("and the fenced nouns are actually a list", NOUNS.length > 0);

    // The split itself, stated as a test.
    //
    // Nine dated units lived inside three root files that were also live
    // documentation, and every stale number in the repository sat at that seam.
    // What stops it re-forming is not a rule anybody remembers: it is that the
    // record has an address. So the address is asserted — `decisions/` holds
    // dated files and an index that explains the contract, and the three root
    // files it came out of are not there to be edited back into.
    {
      const records = coveredBy("decisions/", tracked).filter((f) => !f.endsWith("README.md"));
      ok("the record is a directory of dated files", records.length >= 9);
      check(
        "every one of them is named by its date",
        records.filter((f) => !/^decisions\/\d{4}-\d{2}-\d{2}-[\w-]+\.md$/.test(f)),
        [],
      );
      ok("and the directory explains its own contract", tracked.includes("decisions/README.md"));

      // …and the index is the whole of it. A record with an address nobody can
      // reach from the front door is a record kept in the same way a directory
      // nobody opens is documentation. `decisions/README.md`'s table was two
      // entries short of the directory when this was written, and both of them
      // were from the days the table was last edited — which is the ordinary
      // way an index falls behind: it is edited by whoever remembers.
      {
        const index = readFileSync(path.join(ROOT, "decisions/README.md"), "utf8");
        check(
          "and every record is in its index",
          records.filter((f) => !index.includes(f.slice("decisions/".length))),
          [],
        );
      }
      check(
        "the merged files are gone rather than left to drift",
        tracked.filter((f) => f === "fixes.md" || f === "plan-notes-and-ui.md"),
        [],
      );
      ok("and spec.md is a living page again", living.includes("spec.md"));
    }
  }

  everyProseChordIsTheRightOne(tracked);
}

// ------------------------------------------------- and the keys, by name
//
// Every fenced number in these pages was checked and **no word in them was**,
// which is the shape of every documentation failure this repository has actually
// shipped. `docs/start-here.md` — the page the root README hands a new reader —
// said `Ctrl+Alt+F` "takes a note you already wrote inline and sends its prose
// to the end". `Ctrl+Alt+F` inserts a footnote. The chord moved on 4 August and
// the sentence did not, and it then survived the commit that *built this fence*
// and swept that exact file for numbers, with the wrong key one line away.
//
// So: every `Ctrl+…` written in prose must be on the generated card, and the
// sentence around it must name what the card says that key does. The first half
// alone would not have caught it — `Ctrl+Alt+F` is on the card, bound to
// something else. It is the second half that reads the sentence.
//
// `docs/shortcuts.md` is exempt because it *is* the card. It is generated from
// `bindings.ts` and `i18n.ts`, and is checked against them above.
function everyProseChordIsTheRightOne(tracked) {
  const card = readFileSync(path.join(ROOT, "docs/shortcuts.md"), "utf8");
  // `| `Ctrl+B` · `Ctrl+Shift+B` | Bold | מודגש |` → each chord, and the label.
  const rows = [];
  for (const line of card.split("\n")) {
    const m = /^\|\s*(`[^|]+`)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (!m || m[2] === "What it does") continue;
    const chords = [...m[1].matchAll(/`([^`]+)`/g)].map((c) => c[1]);
    for (const chord of chords) rows.push({ chord, label: m[2] });
  }
  ok("the card was parsed", rows.length > 30, `${rows.length} rows`);

  // Words worth matching on: the label's own, minus the ones that carry no
  // meaning. "Insert a footnote" and "Footnote" both have to match a sentence
  // about footnotes.
  const STOP = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "at", "on", "as", "for"]);
  // Singular and plural are the same word for this purpose: the card says
  // "Commands" and the prose says "the command palette".
  const stem = (w) => (w.endsWith("s") ? w.slice(0, -1) : w);
  const meaningful = (label) =>
    label
      .toLowerCase()
      .split(/[^a-z']+/u)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem);

  const pages = tracked.filter(
    (f) => !isLog(f) && f !== "docs/shortcuts.md" && f.endsWith(".md"),
  );
  const wrong = [];
  const unknown = [];
  for (const page of pages) {
    const text = readFileSync(path.join(ROOT, page), "utf8");
    // The paragraph, not the sentence. Prose here wraps, a table row is one line,
    // and what a key does is regularly said in the clause *before* the one the
    // chord sits in — splitting on full stops rejected three sentences that were
    // perfectly correct, which is how a fence teaches everybody to widen its
    // exemption list instead of reading its failures.
    for (const sentence of text.split(/\n[ \t]*\n/u)) {
      for (const m of sentence.matchAll(/`(Ctrl\+[A-Za-z0-9+]+)`/g)) {
        const chord = m[1];
        const candidates = rows.filter((r) => r.chord === chord);
        if (!candidates.length) {
          unknown.push(`${page}: ${chord}`);
          continue;
        }
        const said = sentence.toLowerCase().split(/[^a-z']+/u).map(stem).join(" ");
        const fits = candidates.some((r) => {
          const words = meaningful(r.label);
          return words.length === 0 || words.some((w) => said.includes(w));
        });
        if (!fits) {
          wrong.push(
            `${page}: ${chord} is ${candidates.map((c) => JSON.stringify(c.label)).join(" / ")} — ` +
              `${JSON.stringify(sentence.trim().slice(0, 90))}`,
          );
        }
      }
    }
  }
  check("every chord in prose is a chord the app has", unknown, []);
  check("and the sentence around it says what that chord does", wrong, []);
}
