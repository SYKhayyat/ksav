import { ok, check } from "./harness.mjs";
import { dirOf } from "../tools/paths.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TIERS, tierCommand, DEFAULT_NOTE_KIND } from "../.tmp-test/note-commands.mjs";
import { unrendered, addDump } from "../.tmp-test/apparatus.mjs";
import {
  NOTE_CHOICES,
  applyChoice,
  choiceForCommand,
  conversionTargets,
  markersOf,
  noteAt,
  noteFor,
  notesIn,
  tieredNoteAt,
} from "../.tmp-test/notes.mjs";
import { plan } from "../.tmp-test/insert.mjs";

// Every question the note path answers, asked in **both** languages.
//
// `note-commands.ts` opens with the diagnosis and this file is the cure it did
// not get:
//
//   > *"Nothing failed, nothing was logged, and 2,580 tests passed: every one of
//   > them asked the question in Hebrew."*
//
// The list of note commands was centralised. What was not centralised is every
// *other* place a note command was written as a Hebrew string literal, and there
// were four of them — `noteFor`'s match, `choiceForCommand`'s match,
// `openNoteMenu`'s conversion targets, and `RULES[].fix`. All four were found by
// an external audit rather than by this suite, for exactly the reason quoted
// above, so the cure is the suite and not the four sites.
//
// The rule: **anything that matches or writes a command name is asked in `he`
// and in `en`, from the same table, in the same assertion.** A finding that only
// one language can see is a finding this file is supposed to be unable to have.

const HERE = dirOf(import.meta.url);
const MAIN = readFileSync(path.join(HERE, "..", "src", "main.ts"), "utf8");
const NOTES_SRC = readFileSync(path.join(HERE, "..", "src", "notes.ts"), "utf8");
const APPARATUS_SRC = readFileSync(path.join(HERE, "..", "src", "apparatus.ts"), "utf8");

/** A document that is unambiguously written in `lang`, for `docLang` to read. */
function docIn(lang) {
  return lang === "en" ? "#bold[a] some plain English prose here.\n" : "#הדגשה[א] טקסט בעברית כאן.\n";
}

const LANGS = ["he", "en"];

export async function run() {
  // ------------------------------------------------- §6.1 a tiered note is a note
  //
  // `tieredNoteAt` calls `tierCommand(tier, docLang())` on purpose, so in an
  // English document it produces `#fnote[|]` and `#tier2[|]`. Matched against
  // the cards' Hebrew literals those were not notes at all — so `plan` fell
  // through to a plain splice and skipped the two things only the note path
  // does: the `nested` card's `head` line (the one that makes a two-layer
  // apparatus's markers say which layer they point into) and
  // `settings.deferNoteBodies`.
  for (const lang of LANGS) {
    const doc = docIn(lang);
    for (let tier = 1; tier <= TIERS.length; tier++) {
      const snippet = `#${tierCommand(tier, lang)}[|]`;
      const found = noteFor(snippet);
      ok(`${lang}: tier ${tier} (${snippet}) is recognised as a note`, !!found, snippet);
    }
    // And through the real door, which is what a toolbar press goes through.
    const p1 = plan(doc, doc.length, doc.length, "", tieredNoteAt(doc, doc.length, lang), lang);
    check(`${lang}: a tier-1 insertion is planned as a note`, p1.kind, "note");
  }

  // Tier 2 and above have to carry the `nested` card, which is the one that owns
  // the configuration line. Asked by *card id* rather than by the string, so a
  // renamed marker cannot make this pass by accident.
  for (const lang of LANGS) {
    const inside = `#${tierCommand(1, lang)}[`;
    const doc = docIn(lang) + inside;
    const snippet = tieredNoteAt(doc, doc.length, lang);
    const found = noteFor(snippet);
    ok(`${lang}: a note inside a note is tier 2`, !!found, snippet);
    check(`${lang}: and it is the nested card`, found?.choice.id, "nested");
    ok(
      `${lang}: whose head line is the one that makes the layers legible`,
      !!found?.choice.head,
    );
  }

  // ------------------------------------------------- §6.2 conversion, both ways
  //
  // The menu offered twelve Hebrew commands whatever the document was, and
  // `convertNote` writes `#${command}[…]` verbatim — so an English writer's only
  // offer was to rewrite `#fnote` as `#הערה`: a change of language presented as a
  // change of layout.
  for (const lang of LANGS) {
    const current = tierCommand(1, lang);
    const targets = conversionTargets(current, lang);
    ok(`${lang}: the menu offers something to convert to`, targets.length > 2);
    const wrongLang = targets.filter((c) => (lang === "en" ? /[֐-׿]/u.test(c) : /^[A-Za-z]/.test(c)));
    check(`${lang}: and every offer is in the document's language`, wrongLang, []);
    // The `c !== note.command` exclusion compared a Hebrew list against an
    // English command, so the note's own layout was offered as a conversion.
    ok(
      `${lang}: the note's own command is not offered`,
      !targets.includes(current),
      current,
    );
  }

  // The trap in the obvious fix, named in the audit: translating the targets
  // without fixing `choiceForCommand` makes `choice` null, skips `scaffold`, and
  // reproduces *"converting a footnote to an endnote produced an endnote with no
  // `#הערות_בסוף()`"* — the collected-and-never-printed failure, performed by
  // the product and then reported back to the writer as a lint.
  for (const lang of LANGS) {
    const unscaffolded = [];
    for (const target of conversionTargets(tierCommand(1, lang), lang)) {
      if (!choiceForCommand(target)) unscaffolded.push(target);
    }
    check(`${lang}: every offered conversion knows its layout`, unscaffolded, []);
  }

  // Both spellings of the same command reach the same card, which is the whole
  // claim `sameCommand` makes.
  for (const c of NOTE_CHOICES) {
    for (const marker of markersOf(c)) {
      const he = /^#([A-Za-z0-9֐-׿_]+)/u.exec(marker)?.[1];
      if (!he) continue;
      check(`choiceForCommand(${he}) is ${c.id}`, choiceForCommand(he)?.id !== undefined, true);
    }
  }

  // ------------------------------------------------- §6.3 the repair
  //
  // Detection was bilingual from the start — `collectors` and `dumps` both list
  // the English aliases — and the repair was a Hebrew literal, including the
  // argument name. The worst of the four cases was a Hebrew command, a Hebrew
  // parameter and an English stream name in one call, written into the writer's
  // document by a button labelled "render the notes".
  {
    const he = "בראשית#הערתסיום[עיין שם] ברא.\n";
    const en = "In the beginning#endnote[see there] he created the world.\n";
    check("he: the fix is spelt in Hebrew", unrendered(he)[0]?.fix, "#הערות_בסוף()");
    check("en: the fix is spelt in English", unrendered(en)[0]?.fix, "#endnotes()");

    const heBand = "בראשית#מדור_א[עיין שם] ברא.\n";
    const enBand = "In the beginning#band1[see there] he created the world here.\n";
    check("he: the banded fix is Hebrew", unrendered(heBand)[0]?.fix, "#הערות_מדורגות()");
    check("en: the banded fix is English", unrendered(enBand)[0]?.fix, "#banded_notes()");
  }

  // The streamed case, where the command, the parameter **and** the value all
  // have to be right — and the value is the writer's, so it must not be
  // translated even though the parameter beside it must be.
  {
    const en =
      'In the beginning#endnote(stream: "sources")[see there] he created the world here.\n';
    const p = unrendered(en)[0];
    ok("en: a streamed endnote is reported", !!p);
    check("en: and its stream is read", p?.stream, "sources");
    const written = addDump(en, p).text;
    ok("en: the repair names the command in English", written.includes("#endnotes("), written);
    ok("en: the repair names the parameter in English", written.includes("stream:"), written);
    ok("en: and leaves the writer's stream name alone", written.includes('"sources"'), written);
    ok("en: with no Hebrew anywhere in the call", !/[֐-׿]/u.test(written.split("#endnotes")[1] ?? ""), written);

    const he = 'בראשית#הערתסיום(זרם: "מקורות")[עיין שם] ברא.\n';
    const heWritten = addDump(he, unrendered(he)[0]).text;
    ok("he: the repair is unchanged", heWritten.includes('#הערות_בסוף(זרם: "מקורות")'), heWritten);
  }

  // A repaired document is a document the lint no longer complains about. The
  // round trip, in both languages, because a fix in the wrong language *looks*
  // like a fix and leaves the notes exactly as invisible as they were.
  for (const [lang, doc] of [
    ["he", "בראשית#הערתסיום[עיין שם] ברא.\n"],
    ["en", "In the beginning#endnote[see there] he created the world here.\n"],
    ["he-band", "בראשית#מדור_א[עיין שם] ברא.\n"],
    ["en-band", "In the beginning#band1[see there] he created the world here.\n"],
  ]) {
    const p = unrendered(doc);
    check(`${lang}: one problem before the repair`, p.length, 1);
    check(`${lang}: and none after it`, unrendered(addDump(doc, p[0]).text).length, 0);
  }

  // ------------------------------------------------- the index, both languages
  //
  // `notesIn` and `noteAt` are what the notes pane, the jump list and the
  // right-click menu are built on. They read the shared list, so they were the
  // half that got fixed — asserted here anyway, because this file's job is that
  // no note question is asked in one language only.
  for (const lang of LANGS) {
    const marker = `#${DEFAULT_NOTE_KIND[lang]}[`;
    const doc = `${docIn(lang)}${marker}a note]\n`;
    const found = notesIn(doc);
    check(`${lang}: the note is in the index`, found.length, 1);
    ok(`${lang}: and is found at its marker`, !!noteAt(doc, doc.indexOf(marker) + 2));
  }

  // ------------------------------------------------- the prohibition
  //
  // A `#`-prefixed **Hebrew** command name in a string literal, anywhere in the
  // note family except the one table that is allowed to hold them.
  //
  // That table is `NOTE_CHOICES`: its markers are Hebrew because Hebrew is this
  // product's canonical spelling, and `applyChoice` spells them for the document
  // as its first act. Everywhere else, a `#הערה` in quotes is a command whose
  // language is a property of *the source file* rather than of the writer's
  // document, which is the shared cause of all three of §6.1–§6.3:
  //
  //   - `noteFor` matched against those literals, so an English tiered note was
  //     not a note (§6.1);
  //   - `choiceForCommand` matched against them, so an English conversion found
  //     no layout and silently skipped its scaffolding (§6.2);
  //   - `RULES[].fix` **was** one — `"#הערות_בסוף()"` — written straight into
  //     the writer's document by the button that repairs it (§6.3).
  //
  // Comments are stripped first. Every one of the fifty-odd `#הערה` in these
  // files' prose is documentation, and a sweep that cannot tell a docstring from
  // a value is a sweep that gets switched off.
  {
    // Trailing comments as well as whole-line ones. The first thing this sweep
    // caught was a `// ` note at the end of a `return`, which is documentation
    // like all the rest. `// ` with the space, so a `://` in a URL is not read
    // as the start of one.
    const stripComments = (src) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "")
        .replace(/\/\/[ \t].*$/gm, "");
    // The canonical table, cut out by its own declaration. Named rather than
    // pattern-matched so that renaming it fails this test loudly instead of
    // quietly widening what is allowed.
    const CARDS = "export const NOTE_CHOICES: NoteChoice[] = [";
    const notesBody = stripComments(NOTES_SRC);
    const at = notesBody.indexOf(CARDS);
    ok("notes.ts still declares NOTE_CHOICES where this sweep expects it", at >= 0);
    // To the closing `];` at column 0, which is how this file's top-level arrays
    // end and is the only boundary that does not need a bracket counter.
    const cardsEnd = notesBody.indexOf("\n];", at);
    const outsideCards =
      notesBody.slice(0, at) + notesBody.slice(cardsEnd < 0 ? notesBody.length : cardsEnd);

    const offenders = [];
    for (const [file, src] of [
      ["notes.ts (outside NOTE_CHOICES)", outsideCards],
      ["apparatus.ts", stripComments(APPARATUS_SRC)],
    ]) {
      for (const m of src.matchAll(/["'`]#[֐-׿][^"'`\n]*["'`]/gu)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    check("no Hebrew command literal outside the canonical table", offenders, []);
  }

  // And the menu does not go back to scraping the cards. The audit's own route
  // in was that `openNoteMenu` had its own copy of the question `notes.ts`
  // answers, so the fix is that it has none.
  ok(
    "the note menu asks notes.ts for its targets",
    MAIN.includes("conversionTargets(note.command"),
  );
  ok(
    "and does not build them out of NOTE_CHOICES itself",
    !MAIN.includes("NOTE_CHOICES.flatMap(markersOf)"),
  );

  // ------------------------------------------------- applyChoice, both languages
  //
  // The end of the road: what actually lands in the document.
  for (const lang of LANGS) {
    const doc = docIn(lang);
    for (const c of NOTE_CHOICES) {
      const { text } = applyChoice(doc, doc.length, c, 0, false, {}, lang);
      const added = text.slice(doc.length);
      if (lang !== "en") continue;
      ok(
        `en: applying ${c.id} writes no Hebrew command`,
        !/#[֐-׿]/u.test(added),
        added,
      );
    }
  }
}
