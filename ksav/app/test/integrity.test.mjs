// M3 · data integrity: no export silently drops the writer's words.
//
// The audit question is narrow and answerable: **every word the document prints
// should be findable in the text an export produces.** Nothing here judges the
// conversion's form — markdown's `**`, org's `/`, plain text's bullets are all
// fine and none of them are read — only whether the prose arrived.
//
// It is written against the engine's own `examples/` and `templates/` because
// those are the documents a writer actually opens: a template is what a new
// sefer starts as, and a word lost from one is lost before the writer has typed
// anything. Built this way it found two real defects on its first run:
//
//   · `#פסוק[ref][verse]` and `#הגדרה[term][definition]` exported **only the
//     first body** — the verse and the definition, i.e. the content, were left
//     behind. Every definition list in every template.
//   · `#note_named["name"]` kept its quotes while `#note_body["name"]`
//     stripped them, so the two halves of one note had different names, the
//     export deleted the note, and the lint called a well-formed note broken.
//
// # The instrument, and the three times it lied before it told the truth
//
// A word comparator over Hebrew is easy to get wrong in ways that look like
// product faults, and each one cost a false report here: splitting tokens before
// stripping nikud joined `ו־גופן` into one word (U+05BE, the maqaf, lives inside
// the nikud block); stripping punctuation only *inside* a token turned
// `טקסט[fn:1]` into `טקסטfn1`; and counting a call's configuration text as prose
// demanded that an export carry its own apparatus headings. The comparator is
// therefore stated once, below, with both halves normalised the same way — and
// the DROPPED mask is part of the *question*, not a tolerance.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok } from "./harness.mjs";
import { DROPPED } from "../.tmp-test/interchange.mjs";
import { scan, plainText } from "../.tmp-test/spans.mjs";
import { scan as scanDeferred } from "../.tmp-test/deferred.mjs";
import { HEBREW } from "../.tmp-test/engine.gen.mjs";
import { fromOrg, toOrg } from "../.tmp-test/org.mjs";
import { toMarkdown, toPlainText } from "../.tmp-test/markdown.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..", "..", "engine");

/**
 * Nikud and taamim, which no export format carries and which are not words.
 *
 * **From `HEBREW.markRange`, not written out.** `prohibitions.test.mjs` refuses a
 * hand-written Hebrew mark block in .ts/.mjs/.rs/.py/.typ anywhere in the tree,
 * and this file is a `.mjs` in that tree — the first version of this line spelled
 * the range out as an escape and the full run went red on it, which is the
 * prohibition doing its job. The range also holds four characters that *separate
 * words* (maqaf, paseq, sof pasuq, nun hafukha); deleting them would join two
 * words into one that nothing matches.
 */
const MARKS = new Set(
  Array.from(
    { length: HEBREW.markRange[1].codePointAt(0) - HEBREW.markRange[0].codePointAt(0) + 1 },
    (_, i) => String.fromCodePoint(HEBREW.markRange[0].codePointAt(0) + i),
  ).filter((ch) => !HEBREW.wordBreaking.includes(ch)),
);
const strip = (t) => [...t].filter((ch) => !MARKS.has(ch)).join("");

/**
 * The comparison unit: maximal runs of letters and digits.
 *
 * **Split first, strip second.** Every non-letter is a separator in the original
 * text — maqaf, punctuation, the brackets of an export's own footnote marker —
 * so `ו־גופן` is two tokens and `טקסט[fn:1]` is `טקסט`, and only then does the
 * nikud come off each token. Doing it the other way round joined words together
 * and reported them missing.
 */
const words = (t) =>
  t
    .split(/[^\p{L}\p{N}]+/u)
    .map(strip)
    .filter((w) => w.length > 1);

/** The document as it prints: deferred notes inline, apparatus config masked. */
function printable(src) {
  // `#הערות_בסוף_צד(כותרות: ("תוכן": [ביאורים]))` states what the apparatus
  // headings say. Those words *do* print on the page, and an export that leaves
  // out the note apparatus leaves them out with it — a decision, not a loss, and
  // the masking is where the decision is written down rather than a tolerance
  // invented to make the check pass.
  const s = scan(src);
  const chars = [...src];
  for (const n of s.nodes) {
    if (!DROPPED.has(n.name)) continue;
    for (let i = n.from; i < n.to; i++) chars[i] = " ";
  }
  // A deferred note's *name* is an identifier, not content: `#note_body["scope"]`
  // prints nothing where the word `scope` is written, so the oracle must not ask
  // the export to carry it. This is the same masking as the apparatus config
  // above and for the same reason — the question is what the reader sees.
  const defer = scanDeferred(chars.join(""));
  for (const r of [...defer.refs, ...defer.defs]) {
    for (let i = r.nameFrom; i < r.nameTo; i++) chars[i] = " ";
  }

  // **Without `resolveDeferred`.** The oracle must not be built by the code under
  // test: when it was, a marker whose body the resolver could not find was
  // deleted from the export *and* from the expectation, and the quoted-note
  // defect passed this file's own corpus check. `plainText` reads
  // `contentGroups`, so a note's prose is prose where the writer filed it.
  return plainText(chars.join(""));
}

/** Every prose word an export of `src` did not carry. */
function lost(src, out) {
  const have = new Set(words(out));
  const want = words(printable(src));
  return [...new Set(want.filter((w) => !have.has(w)))];
}

const corpus = [
  ...readdirSync(join(ENGINE, "examples"))
    .filter((f) => f.endsWith(".ksav"))
    .map((f) => join(ENGINE, "examples", f)),
  ...readdirSync(join(ENGINE, "templates"))
    .filter((f) => f.endsWith(".ksav"))
    .map((f) => join(ENGINE, "templates", f)),
];

export async function run() {
  ok("the corpus is the engine's own documents", corpus.length >= 10, `${corpus.length} files`);

  // A document that prints nothing would satisfy every assertion below without
  // testing anything, so the oracle itself is checked once: the shipped sample
  // has prose, and its note prose is in the oracle rather than being masked by
  // the DROPPED filter.
  {
    const sample = readFileSync(join(ENGINE, "examples", "sample.ksav"), "utf8");
    const oracle = words(printable(sample));
    ok("the oracle is not empty", oracle.length > 50, `${oracle.length} words`);
    ok("…and it holds the note bodies", oracle.includes("קינון"), oracle.slice(0, 6).join(" "));
  }

  // ---------------------------------------------------------- the three formats
  //
  // One assertion per format rather than one per document: when something breaks,
  // the message should say *which format* stopped carrying the words, because
  // that is the fact that decides where the fix goes.
  const formats = [
    ["org", (s) => toOrg(s)],
    ["markdown", (s) => toMarkdown(s)],
    ["plain text", (s) => toPlainText(s)],
  ];
  for (const [name, convert] of formats) {
    const failures = [];
    for (const file of corpus) {
      const src = readFileSync(file, "utf8");
      const missing = lost(src, convert(src));
      if (missing.length) failures.push(`${file.split(/[\\/]/).pop()}: ${missing.slice(0, 6).join(", ")}`);
    }
    ok(`no prose is lost in ${name}`, failures.length === 0, failures.slice(0, 3).join(" | "));
  }

  // ---------------------------------------------------------- the two defects
  //
  // Named here so the corpus check above cannot be satisfied by a fix that works
  // only because the templates happen to have changed. These are the smallest
  // documents that show each one.
  {
    const verse = "#פסוק[דברים כ״ד, א׳][וְכָתַב לָהּ סֵפֶר כְּרִיתֻת]";
    for (const [name, convert] of formats) {
      ok(`a second body survives ${name}`, lost(verse, convert(verse)).length === 0, lost(verse, convert(verse)).join(" "));
    }
    const definition = "#רשימת_הגדרות(\n  הגדרה[מונח][ההסבר עצמו],\n)";
    for (const [name, convert] of formats) {
      ok(`a definition list survives ${name}`, lost(definition, convert(definition)).length === 0, lost(definition, convert(definition)).join(" "));
    }
    const named = '#note_named["שם ההערה"]\n#note_bodies[\n#note_body["שם ההערה"][גוף ההערה כאן.]\n]';
    for (const [name, convert] of formats) {
      ok(`a quoted named note survives ${name}`, lost(named, convert(named)).length === 0, lost(named, convert(named)).join(" "));
    }
  }

  // The smallest reproduction of what the round trip found, named so the corpus
  // check above cannot be satisfied by the templates changing. An Org footnote
  // definition whose citation was deleted is still a paragraph in the file.
  {
    const org = "טקסט\n[fn:1] גוף ההערה שלא הוזכרה.\n";
    ok(
      "an uncited Org note keeps its body",
      fromOrg(org).body.includes("גוף ההערה"),
      fromOrg(org).body,
    );
  }

  // ---------------------------------------------------------- out and back
  //
  // A **round trip**, which is the claim the plan's item actually makes and the
  // export checks above do not: not "the words are in the file", but "the file can
  // be read back and still has them". Org is the format that can answer it — Ksav
  // exports Org and imports Org, so the pair is testable in one process — and it
  // is the honest place to look for a *lossy* pair, because a converter that drops
  // a body on the way out and a reader that drops it on the way in both look fine
  // on their own.
  //
  // What is compared is the imported document's own words against the exported
  // one's, through the same comparator, so markup the reader adds is not counted
  // as prose. Nothing is masked here: `toOrg` has already flattened the apparatus
  // config that `DROPPED` exists for.
  {
    const failures = [];
    for (const file of corpus) {
      // The comparison is over prose, so the file's own *markup* is masked:
      // `[fn:1]` is a label, `#+begin_quote` is a block marker, `#+title:` is a
      // keyword. None of them is a word anybody reads, and demanding that an
      // import carry a label forward would ask it to keep the notation instead of
      // the sentence. What is *not* masked is any note body: that is prose, and a
      // note whose citation was deleted must not take its paragraph with it.
      // The import gets the file **unmasked** — masking is a statement about what
      // to look for, and changing the input would change the thing being
      // measured. It did, for one draft of this: blanking `[fn:1]` turned every
      // note definition into an ordinary paragraph, the importer kept them all as
      // prose, and the assertion passed while the defect it exists for was live.
      const org = toOrg(readFileSync(file, "utf8"));
      const expectation = org
        .replace(/\[fn:[^\]]*\]/g, " ")
        .replace(/^\s*#\+\w[\w-]*:.*$/gm, " ")
        .replace(/^\s*#\+(begin|end)_\w+.*$/gim, " ");
      let back;
      try {
        back = fromOrg(org).body;
      } catch (e) {
        failures.push(`${file.split(/[\/]/).pop()}: import threw ${e.message}`);
        continue;
      }
      const missing = lost(expectation, back);
      if (missing.length) {
        failures.push(`${file.split(/[\/]/).pop()}: ${missing.slice(0, 6).join(", ")}`);
      }
    }
    ok(
      "an Org export can be imported and keeps its words",
      failures.length === 0,
      failures.slice(0, 3).join(" | "),
    );
  }
}