import { ok, check } from "./harness.mjs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  notesIn,
  noteAt,
  noteDepthAt,
  tieredNoteAt,
  convertNote,
  deleteNote,
} from "../.tmp-test/notes.mjs";
import {
  deferAllInlineNotes,
  problems,
  resolveDeferred,
  scan,
} from "../.tmp-test/deferred.mjs";
import { unrendered } from "../.tmp-test/apparatus.mjs";

// Where a note's words sit in the file must not change what the editor knows
// about it.
//
// # The bug this file is the fence for
//
// A note can be written two ways. Inline:
//
//     פתיחה#הערה[עיין שם] סוף.
//
// or deferred — a marker here, the prose at the end of the file, which is the
// org-mode arrangement and the whole reason `settings.deferNoteBodies` exists:
//
//     פתיחה#הערה_בשם("1") סוף.
//     #גוף_הערה("1")[עיין שם]
//
// The engine treats these as the same note and proves it: `deferred_notes.rs`
// lays out all eleven layouts twice and asserts every text run landed on the
// same page at the same coordinates at the same size. The editor did not.
// `notesIn` looked for a command that opens a note body; `#הערה_בשם` opens
// none, so on the second document it found **nothing** — the notes pane, its
// jump list, the "hang another note off this one" action and the whole
// right-click convert/delete menu were empty on a document full of notes. `⁑`
// inside a deferred body wrote tier א, a note *beside* the note the writer was
// standing in. And the lint that catches the quietest failure in the product —
// notes collected and never rendered — could not see a deferred collector at
// all, because `#הערה_בשם("1", סוג: הערתסיום)` names its layout as a *value*
// and contains no `#הערתסיום` to find. Verified against the compiler: with no
// dump call, both spellings print the marker and lose the prose.
//
// Two features that had been tested apart and were mutually exclusive
// together. Nothing failed and nothing was logged.
//
// # Why this file is shaped like an oracle
//
// The strongest test in the engine suite is `assert_same_page`, which needs no
// knowledge of what a layout *should* look like — only that two spellings of
// one document agree. This is that test on the editor's side: every document
// below is deferred in bulk by the product's own `deferAllInlineNotes`, and
// every note surface has to give the same answers for both copies. A surface
// that learns about one spelling and not the other fails here by construction,
// which is the only thing that would have caught the original.

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SRC = path.join(HERE, "..", "src");

/** The corpus. Every one of these is deferred in bulk and asked twice. */
const CORPUS = {
  "one footnote": `פתיחה#הערה[עיין שם] וסוף.`,
  "two notes, one sentence": `א#הערה[ראשונה] ב#הערה[שניה] ג.`,
  "a note with markup in it": `א#הערה[עיין #הדגשה[שם] ובמה שכתב] ב.`,
  "a gershayim in the prose": `א#הערה[דברי רש"י שם] ב.`,
  "an endnote, with its dump": `א#הערתסיום[עיין שם] ב.\n\n#הערות_בסוף()\n`,
  "an endnote, without one": `א#הערתסיום[עיין שם] ב.`,
  "a band note, without its dump": `א#מדור_א[פירוש] ב.`,
  "a band note, with it": `א#מדור_א[פירוש] ב.\n\n#הערות_מדורגות()\n`,
  "a page band": `א#מדף_א[פירוש] ב#מדף_ב[הערה עליו] ג.`,
  "a stream note": `א#הערת_תוכן[ביאור] ב#הערת_מקור[מקור] ג.`,
  "a sidenote": `#עם_הערות_צד[\nא#הערת_גיליון[בצד] ב.\n]`,
  "a tiered note": `א#הערה_א[פירוש] ב#הערה_ב[הערה עליו] ג.`,
  "an explicit tier": `א#הערה_בדרגה(3)[עמוק] ב.`,
  "a note inside a note": `א#הערה[חיצונה #הערה_ב[פנימית] סוף] ב.`,
  "a note in a table cell": `#טבלה(עמודות: 2,\n  תא[א#הערה[עיין] ב],\n  תא[ג],\n)`,
  "a note in a list item": `#רשימה(\n  פריט[ראשון#הערה[עיין רש"י]],\n  פריט[שני],\n)`,
  "a note after a comment": `// הערה על המסמך\nא#הערה[עיין שם] ב.`,
  "an English footnote": `Opening#fnote[see there] and the end.`,
  "an English endnote": `Opening#endnote[see there].\n\n#endnotes()\n`,
  "an English tiered note": `A#tier1[commentary] B#tier2[a note on it] C.`,
  "a document with a title": `#שער[ספר]\n\nא#הערה[עיין שם] ב.`,
};

/** What a note is, for comparison purposes — everything but where the bytes are. */
const shape = (n) => `${n.command}/${n.depth}/${n.text}`;

/** The lint's answer, likewise. */
const warnings = (doc) => unrendered(doc).map((p) => `${p.command}/${p.fix}/${p.stream ?? "-"}`);

/**
 * Row `i`, or an empty stand-in.
 *
 * The failure this file exists to catch is "the list is empty", and a test that
 * reads `.command` off `undefined` answers it with a stack trace instead of a
 * named assertion — which is how you find out a fence held without finding out
 * what it held against.
 */
const at = (rows, i) => rows[i] ?? {};

export async function run() {

// -------------------------------------------------- 1. the equivalence oracle

for (const [label, inline] of Object.entries(CORPUS)) {
  const { text: deferred, moved } = deferAllInlineNotes(inline);
  ok(`${label}: the bulk defer moved something`, moved > 0);
  ok(`${label}: and produced a different document`, deferred !== inline);

  const a = notesIn(inline);
  const b = notesIn(deferred);

  // The heart of it: the same notes, in the same order, at the same depths,
  // with the same words — however far the words moved.
  check(`${label}: the same number of notes`, b.length, a.length);
  check(`${label}: the same notes, in the same order`, b.map(shape).join(" | "), a.map(shape).join(" | "));

  // The lint that exists so a sefer does not go to print with a sentence
  // missing has to warn about both spellings or neither.
  check(`${label}: the same unrendered-apparatus warnings`, warnings(deferred).join(" | "), warnings(inline).join(" | "));

  // Only over the notes both spellings found: the count above is the assertion
  // that carries "one of them is missing notes", and a loop that walks off the
  // shorter list turns a named failure into a stack trace.
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const [x, y] = [a[i], b[i]];
    // A caret in the note's prose is in the note, wherever the prose is. This
    // is what `⁑` reads, and it answered 0 in every deferred body.
    check(
      `${label}: note ${i + 1} — the depth at the start of its prose`,
      noteDepthAt(deferred, y.bodyFrom),
      noteDepthAt(inline, x.bodyFrom),
    );
    check(
      `${label}: note ${i + 1} — the tier a sub-note would get`,
      tieredNoteAt(deferred, y.bodyTo),
      tieredNoteAt(inline, x.bodyTo),
    );
    // Right-clicking the marker finds the same note either way.
    check(
      `${label}: note ${i + 1} — noteAt on its marker`,
      noteAt(deferred, y.from)?.command,
      noteAt(inline, x.from)?.command,
    );
    ok(`${label}: note ${i + 1} — the prose is reachable`, y.hasBody);
  }

  // Deferring is supposed to be a rewrite of where the words live and nothing
  // else, so putting them back has to give the document back. This is the
  // path the Word and Markdown exports take, and it is the cheapest possible
  // check that the bulk rewrite is not quietly lossy.
  check(
    `${label}: deferred and resolved is the document again`,
    resolveDeferred(deferred).replace(/\s+$/, ""),
    inline.replace(/\s+$/, ""),
  );

  // Neither spelling may leave a marker without prose or prose without a
  // marker; the bulk defer writing one of those would be a silent loss.
  check(`${label}: no dangling or orphaned notes`, problems(deferred).length, 0);
}

// -------------------------------------------------- 2. the two ends are one note

{
  const doc = `פתיחה#הערה_בשם("1") סוף.\n\n#גוף_הערה("1")[עיין שם]\n`;
  const note = at(notesIn(doc), 0);
  ok("a deferred note is in the index at all", !!note);
  check("with its layout, not the marker's name", note.command, "הערה");
  check("and its prose, from the other end of the file", note.text, "עיין שם");
  ok("and it knows it is deferred", !!note.deferred);
  check("named by the pair's name", note.deferred?.name, "1");

  ok("noteAt finds it from the marker", !!noteAt(doc, doc.indexOf("#הערה_בשם") + 2));
  ok("and from the prose", !!noteAt(doc, doc.indexOf("עיין") + 1));
  check("in prose between them it is not in a note", noteAt(doc, doc.indexOf("סוף")), null);

  // Convert rewrites the marker, which is where a deferred note's layout is
  // decided. Rewriting the body instead would have produced two notes.
  const converted = convertNote(doc, note, "הערתסיום");
  ok("convert changes the marker's layout", converted.text.includes("סוג: הערתסיום"));
  check("and leaves exactly one body behind", scan(converted.text).defs.length, 1);
  check("and the prose is untouched", at(notesIn(converted.text), 0).text, "עיין שם");
  check("and the note is now an endnote", at(notesIn(converted.text), 0).command, "הערתסיום");

  // Delete takes both halves. Taking the marker alone would trade the note for
  // an orphan warning, which is a worse document than the one being deleted.
  const deleted = deleteNote(doc, note);
  check("delete removes the note entirely", notesIn(deleted.text).length, 0);
  check("including the prose at the end of the file", scan(deleted.text).defs.length, 0);
  ok("and leaves the sentence joined up", deleted.text.startsWith("פתיחה סוף."));
}

// -------------------------------------------------- 3. depth through the marker

{
  // A note written inside a deferred body is inside that note, however far
  // away the marker is. `⁑` there used to write tier א — a note beside the one
  // the writer was standing in.
  const doc = `טקסט#הערה_בשם("1") ס.\n\n#גוף_הערה("1")[עיין #הערה_ב[ועיין] שם]\n`;
  const rows = notesIn(doc);
  check("both notes are listed", rows.length, 2);
  check("the deferred one first", at(rows, 0).command, "הערה");
  check("its child beneath it", at(rows, 1).command, "הערה_ב");
  check("at depth 1, though its bytes are elsewhere", at(rows, 1).depth, 1);
  check("two notes deep, a new note is tier ג", tieredNoteAt(doc, doc.indexOf("ועיין") + 2), "#הערה_ג[|]");
  check("in the outer body it is tier ב", tieredNoteAt(doc, doc.indexOf("עיין ") + 1), "#הערה_ב[|]");
  check("and in the sentence it is tier א", tieredNoteAt(doc, 2), "#הערה_א[|]");
}

// -------------------------------------------------- 4. half-written notes

{
  const doc = `פתיחה#הערה_בשם("1") סוף.`;
  const note = at(notesIn(doc), 0);
  ok("a marker with no body is still a note in the list", !!note);
  check("with no prose to show", note.hasBody, false);
  check("and its lint is the dangling one", problems(doc)[0]?.kind, "dangling");
}
{
  const doc = `א#הערה[חצי`;
  const note = at(notesIn(doc), 0);
  ok("a half-typed inline note is still listed", !!note);
  check("reported as far as it got", note.text, "חצי");
}

// -------------------------------------------------- 5. the marker follows the document

// A generated command follows the document's language, not the interface's —
// the rule `tierCommand` and `setStyleArgs` already keep. Exiling a `#fnote`
// used to write two Hebrew commands into an English document, and recalling it
// brought back `#הערה`.
{
  const { text } = deferAllInlineNotes(`Opening#fnote[see there] and#endnote[or here] the end.`);
  ok("an English document gets English markers", text.includes("#note_named("));
  ok("and English bodies", text.includes("#note_body("));
  ok("and its named argument in English", text.includes("kind: endnote"));
  ok("with no Hebrew anywhere in the rewrite", !/הערה_בשם|גוף_הערה|סוג:/.test(text));
  const rows = notesIn(text);
  check("a kindless English marker is a #fnote, not a #הערה", at(rows, 0).command, "fnote");
  check("and the endnote keeps its own spelling", at(rows, 1).command, "endnote");
}
{
  const { text } = deferAllInlineNotes(`פתיחה#הערה[עיין שם] סוף.`);
  ok("a Hebrew document keeps Hebrew markers", text.includes("#הערה_בשם("));
  ok("and Hebrew bodies", text.includes("#גוף_הערה("));
}

// -------------------------------------------------- 6. one list of the names

// The three command names had a copy in `deferred.ts` and a second in
// `ksav-lang.ts`, which is the arrangement the head of `note-commands.ts` was
// written about. A regex can hold "there is one" perfectly.
{
  const NAMES = /"(?:הערה_בשם|גוף_הערה|גופי_הערות|note_named|note_body|note_bodies)"/;
  const allowed = new Set(["note-commands.ts"]);
  const offenders = [];
  for (const f of (await readdir(SRC)).filter((f) => f.endsWith(".ts"))) {
    if (allowed.has(f)) continue;
    const body = await readFile(path.join(SRC, f), "utf8");
    body.split("\n").forEach((line, i) => {
      const s = line.trim();
      if (s.startsWith("//") || s.startsWith("*") || s.startsWith("/*")) return;
      if (NAMES.test(line)) offenders.push(`${f}:${i + 1}`);
    });
  }
  check("only note-commands.ts spells the deferred commands out", offenders, []);
}

}
