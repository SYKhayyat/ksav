import { ok, check } from "./harness.mjs";
import { dirOf } from "../tools/paths.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NOTE_BODY_COMMANDS, TIERS, tierCommand, DEFAULT_NOTE_KIND } from "../.tmp-test/note-commands.mjs";
import { unrendered, addDump } from "../.tmp-test/apparatus.mjs";
import { DESTINATIONS, pickFor, pickLine } from "../.tmp-test/channels.mjs";
import { canonicalName, nameIn } from "../.tmp-test/mode.mjs";
import {
  applyPick,
  destinationTargets,
  noteAt,
  noteDestination,
  noteFor,
  notesIn,
  retargetNote,
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
//
// The `where` x `how` grid is gone and the questions changed shape with it — a
// note now moves by changing an *argument* rather than by changing command — but
// the rule did not change, and neither did the reason for it.

const HERE = dirOf(import.meta.url);
const MAIN = readFileSync(path.join(HERE, "..", "src", "main.ts"), "utf8");
const NOTES_SRC = readFileSync(path.join(HERE, "..", "src", "notes.ts"), "utf8");
const CHANNELS_SRC = readFileSync(path.join(HERE, "..", "src", "channels.ts"), "utf8");
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
  // Hebrew literals those were not notes at all — so `plan` fell through to a
  // plain splice and skipped the two things only the note path does: the
  // destination's scaffolding, and where the prose is filed.
  for (const lang of LANGS) {
    const doc = docIn(lang);
    for (let tier = 1; tier <= TIERS.length; tier++) {
      const snippet = `#${tierCommand(tier, lang)}[|]`;
      const found = noteFor(snippet);
      ok(`${lang}: tier ${tier} (${snippet}) is recognised as a note`, !!found, snippet);
      // Every tier is a stream at the live page foot — that is what a tier *is*
      // — so the destination is the same one an ordinary note has. A sub-note's
      // parent is the note the caret is in, and nothing about it is a pick.
      check(`${lang}: tier ${tier} goes to the page foot`, found?.pick.dest, "foot");
    }
    // And through the real door, which is what a toolbar press goes through.
    const p1 = plan(doc, doc.length, doc.length, "", tieredNoteAt(doc, doc.length, lang), lang);
    check(`${lang}: a tier-1 insertion is planned as a note`, p1.kind, "note");
  }

  // A note inside a note is tier 2, in both languages, and the tier command is
  // written through rather than replaced by the destination's own spelling: the
  // pick has no vocabulary for a tier, so losing the marker would flatten every
  // sub-note into its parent's series.
  for (const lang of LANGS) {
    const inside = `#${tierCommand(1, lang)}[`;
    const doc = docIn(lang) + inside;
    const snippet = tieredNoteAt(doc, doc.length, lang);
    const found = noteFor(snippet);
    ok(`${lang}: a note inside a note is tier 2`, !!found, snippet);
    const r = applyPick(doc, doc.length, found.pick, false, { marker: found.marker }, lang);
    ok(
      `${lang}: and the tier command is what lands in the document`,
      r.text.slice(doc.length).startsWith(`#${tierCommand(2, lang)}`),
      r.text.slice(doc.length),
    );
  }

  // Every note command, in both spellings, reaches the same destination. This is
  // the whole claim `sameCommand` makes, asked of the one table that decides
  // where a note prints — and a table walked in one language only is the defect
  // this file exists for.
  {
    const disagreed = [];
    for (const command of NOTE_BODY_COMMANDS) {
      const he = canonicalName(command);
      const en = nameIn(he, "en");
      if (en === he) continue;
      const a = pickFor(he, "");
      const b = pickFor(en, "");
      if (a.dest !== b.dest || a.region !== b.region) disagreed.push(`${he}/${en}`);
    }
    check("both spellings of a note command reach the same destination", disagreed, []);
  }

  // ------------------------------------------------- §6.2 conversion, both ways
  //
  // The menu offered twelve Hebrew commands whatever the document was, and
  // `convertNote` wrote `#${command}[…]` verbatim — so an English writer's only
  // offer was to rewrite `#fnote` as `#הערה`: a change of language presented as a
  // change of layout.
  //
  // A note does not change command to move any more, so the offers are
  // destinations rather than commands and there is nothing left to spell wrong
  // in the list. The language question moved to what the *conversion writes*,
  // which is where it always mattered.
  for (const lang of LANGS) {
    const marker = `#${DEFAULT_NOTE_KIND[lang]}[a note]`;
    const doc = docIn(lang) + marker + "\n";
    const note = noteAt(doc, doc.indexOf(marker) + 2);
    ok(`${lang}: the note is found`, !!note);
    const targets = destinationTargets(doc, note);
    ok(`${lang}: the menu offers somewhere to send it`, targets.length >= 4, targets.length);
    check(
      `${lang}: the note's own destination is not offered`,
      targets.filter((p) => p.dest === noteDestination(doc, note).dest && !p.region).length,
      0,
    );
    for (const pick of targets) {
      const moved = retargetNote(doc, note, pick, lang);
      // …and the scaffolding the new destination needs, which is what
      // `applyNotePick` does for an inserted note. Without it, sending a note to
      // the back produces a stream nothing prints.
      const added = moved.text;
      if (lang !== "en") continue;
      ok(
        `en: sending a note to ${pick.dest} writes no Hebrew command`,
        !/#[֐-׿]/u.test(added),
        added,
      );
    }
  }

  // Sending a note somewhere and reading it back is the round trip that makes
  // the menu honest: a conversion that writes an argument nothing can read is a
  // note that quietly stayed where it was.
  for (const lang of LANGS) {
    for (const d of DESTINATIONS) {
      const pick = { dest: d.id, region: d.id === "region" ? "שער" : null };
      const line = pickLine(pick, lang);
      const command = /^#([A-Za-z0-9֐-׿_]+)/u.exec(line)[1];
      const args = /\(([\s\S]*)\)\[/u.exec(line)?.[1] ?? "";
      const read = pickFor(canonicalName(command), args);
      check(`${lang}: ${d.id} round-trips through the markup it writes`, read.dest, d.id);
      check(`${lang}: …with its region`, read.region, pick.region);
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
  // note family.
  //
  // There used to be an exemption for `NOTE_CHOICES` — a table of Hebrew marker
  // literals that `applyChoice` spelled for the document as its first act. The
  // table is gone, and with it the exemption: nothing in these three files may
  // hold a command name as a literal any more, because a command's language is a
  // property of the *writer's document* and never of the source file that
  // mentions it. That is the shared cause of all three of §6.1–§6.3:
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

    const offenders = [];
    for (const [file, src] of [
      ["notes.ts", NOTES_SRC],
      ["channels.ts", CHANNELS_SRC],
      ["apparatus.ts", APPARATUS_SRC],
    ]) {
      for (const m of stripComments(src).matchAll(/["'`]#[֐-׿][^"'`\n]*["'`]/gu)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    check("no Hebrew command literal anywhere on the note path", offenders, []);
  }

  // And the menu does not go back to keeping its own copy of the question. The
  // audit's own route in was that `openNoteMenu` answered "what could this note
  // become" for itself, so the fix is that it has no answer of its own.
  ok(
    "the note menu asks notes.ts where a note could go",
    MAIN.includes("destinationTargets(doc, note)"),
  );
  ok(
    "and does not build the list out of the destination table itself",
    !/destinationTargets|DESTINATIONS/.test(
      MAIN.slice(MAIN.indexOf("function openNoteMenu"), MAIN.indexOf("function closeNoteMenu")).replace(
        "const targets = destinationTargets(doc, note);",
        "",
      ),
    ),
  );

  // ------------------------------------------------- applyPick, both languages
  //
  // The end of the road: what actually lands in the document.
  for (const lang of LANGS) {
    const doc = docIn(lang);
    for (const d of DESTINATIONS) {
      const pick = { dest: d.id, region: d.id === "region" ? "shaar" : null };
      const { text } = applyPick(doc, doc.length, pick, false, {}, lang);
      const added = text.slice(0, text.length);
      if (lang !== "en") continue;
      ok(
        `en: sending a note to ${d.id} writes no Hebrew command`,
        !/#[֐-׿]/u.test(added),
        added,
      );
      // …nor a Hebrew *parameter*, which is the half `_en_params` exists for and
      // the half that was forgotten twice: `#endnote(זרם: "sources")` is an
      // English command taking a Hebrew argument name.
      ok(
        `en: …and no Hebrew parameter name`,
        !/[֐-׿]+\s*:/u.test(added),
        added,
      );
    }
  }
}
