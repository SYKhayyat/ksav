// One want, satisfied once — the fence.
//
// The Lamdan report's §3 counted eight concepts that this repository states two
// or three times, in two or three languages, with nothing between the copies:
// the document defaults, the Hebrew↔English command pairing, the redistribution
// notices, the `#כלול` directive rule, the Hebrew name normaliser, the running
// head's alignment table, "where may this command go", and "strip the markup".
//
// Every one of them had already been *corrected by hand in every copy at least
// once*, which is the tell: a duplication that has been repaired in parallel is
// a duplication that will be repaired in parallel again, and next time somebody
// will miss a copy. `sefarim.rs`'s own header claims "exactly one list and it is
// this one" — true of the list, false of the algorithm that indexes it.
//
// So the shape of the fix is: **one authority per concept, and where a language
// boundary genuinely forbids sharing code, a generated artefact or an executed
// equivalence oracle.** This file holds the app half. `engine/src/notices.rs`,
// `engine/tests/one_want.rs` and `test/spans.test.mjs` hold the rest.
//
// What is asserted here, and why each one is a thing that actually broke:
//
//   1. The generated file really came from the engine, and covers what the app
//      needs. A generator that silently parsed nothing emits a file that
//      typechecks and breaks everything at runtime.
//   2. `settings.ts` ships the engine's defaults, field for field. The Rust
//      value wins on the wire, so drift here shows as sliders that disagree with
//      the page rather than as an error.
//   3. No module re-states the pairing by hand. This is the prohibition, and it
//      is the one that stops the finding from growing back.
//   4. Every Hebrew name the export tables are keyed by is a command the prelude
//      actually defines — because `withAliases` keeps an unknown key rather than
//      throwing, a typo would otherwise be a silently un-exported command.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { check, ok } from "./harness.mjs";
import {
  BUNDLED_FONTS,
  BUNDLED_NOTICES,
  COMMAND_EN,
  DOC_DEFAULTS,
  bothSpellings,
  withAliases,
} from "../.tmp-test/engine.gen.mjs";
import { DEFAULTS } from "../.tmp-test/settings.mjs";
import { toMarkdown } from "../.tmp-test/markdown.mjs";
import { plainText } from "../.tmp-test/spans.mjs";
import { dirOf } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
const SRC = path.resolve(HERE, "..", "src");
const ENGINE = path.resolve(HERE, "..", "..", "engine");
const PRELUDE = path.join(ENGINE, "typst", "ksav.typ");

export async function run() {
  const prelude = await readFile(PRELUDE, "utf8");

  /** Every name the prelude binds — the only names that compile. */
  const defined = new Set();
  for (const m of prelude.matchAll(/^#let\s+([A-Za-z֐-׿_][A-Za-z0-9֐-׿_]*)/gmu)) defined.add(m[1]);
  ok("the prelude was read", defined.size > 200);

  // ------------------------------------------- 1. the generated file is real

  {
    const pairs = Object.entries(COMMAND_EN);
    ok("the pairing covers the whole registry", pairs.length >= 130);
    const strays = pairs.filter(([he, en]) => !defined.has(he) || !defined.has(en));
    check("every paired name is one the prelude defines", strays, []);

    // The four tiers per family that `commands.rs` deliberately stops short of.
    // The palette does not offer them — a chooser card with seven tiers on it is
    // unreadable — but the prelude defines them and a document may use one, so
    // an export that cannot read `#tier6` is an export that loses a note.
    for (const [stem, en] of [
      ["הערה", "tier"],
      ["מדור", "band"],
      ["מדף", "pageband"],
    ]) {
      for (const [i, t] of ["א", "ב", "ג", "ד", "ה", "ו", "ז"].entries()) {
        check(`#${stem}_${t} pairs with #${en}${i + 1}`, COMMAND_EN[`${stem}_${t}`], `${en}${i + 1}`);
      }
    }

    check("both spellings of a paired command", bothSpellings("כותרת1"), ["כותרת1", "h1"]);
    check("and one spelling of an unpaired name", bothSpellings("לא_קיים"), ["לא_קיים"]);
    check(
      "withAliases expands a Hebrew-keyed table",
      withAliases({ כותרת1: 1 }),
      { "כותרת1": 1, h1: 1 },
    );
  }

  // ------------------------------------------- 2. the defaults are the engine's

  {
    ok("the defaults were parsed", Object.keys(DOC_DEFAULTS).length >= 20);
    const drifted = Object.entries(DOC_DEFAULTS).filter(([k, v]) =>
      Array.isArray(v) ? JSON.stringify(DEFAULTS[k]) !== JSON.stringify(v) : DEFAULTS[k] !== v,
    );
    check("settings.ts ships the engine's defaults, field for field", drifted, []);

    // The four per-edge margins are **absent**, not zero: absent means "follow
    // margin_cm", so moving the one margin slider still moves all four. A
    // generator that emitted 0 for `None` would have quietly pinned every
    // document's margins at nothing.
    for (const k of [
      "margin_top_cm",
      "margin_bottom_cm",
      "margin_inner_cm",
      "margin_outer_cm",
      "notes_region_cm",
    ]) {
      ok(`${k} stays absent rather than zero`, !(k in DOC_DEFAULTS) && !(k in DEFAULTS));
    }

    // `lang` means the *document's* language in the engine and the *interface's*
    // here, which is the one place a shared name would have been worse than two.
    check("the interface language is the app's own", DEFAULTS.lang, "he");

    check("the bundled fonts come from what the engine embeds", BUNDLED_FONTS, [
      "Frank Ruhl Hofshi",
      "David Libre",
      "Cascadia Mono",
    ]);
    check("the default font is one of them", BUNDLED_FONTS.includes(DEFAULTS.font), true);
    ok("every notice carries its copyright line", BUNDLED_NOTICES.every((n) => n.copyright));
    ok(
      "the maths font is notified but not offered",
      BUNDLED_NOTICES.some((n) => n.name.includes("Computer Modern") && !n.selectable),
    );
  }

  // ------------------------------------------- 3. nobody re-states the pairing

  {
    // The prohibition. A module may name commands in *one* language freely —
    // `notes.ts` is Hebrew, the English half comes from `note-commands.ts` — but
    // writing a Hebrew name and its English twin side by side is re-stating what
    // the prelude already says, and that copy is the one that goes stale.
    //
    // Two modules are exempt and both argue for themselves in their own headers:
    // `engine.gen.ts` *is* the mirror, checked stale by `npm test`, and
    // `note-commands.ts` answers a question the pairing cannot — which commands
    // *open a note body* — over a set that is neither the registry's nor the
    // prelude's alias list.
    const EXEMPT = new Set(["engine.gen.ts", "note-commands.ts"]);
    const offenders = [];
    for (const f of (await readdir(SRC)).filter((f) => f.endsWith(".ts"))) {
      if (EXEMPT.has(f)) continue;
      const body = await readFile(path.join(SRC, f), "utf8");
      const code = body
        .split("\n")
        .filter((l) => {
          const s = l.trim();
          return !(s.startsWith("//") || s.startsWith("*") || s.startsWith("/*"));
        })
        .join("\n");
      let paired = 0;
      for (const [he, en] of Object.entries(COMMAND_EN)) {
        if (code.includes(`"${he}"`) && code.includes(`"${en}"`)) paired++;
        else if (code.includes(`${he}:`) && new RegExp(`\\b${en}:`).test(code)) paired++;
      }
      // A handful is a module that happens to mention both spellings of a few
      // commands for its own reasons; a table is dozens. The number is the
      // difference between a coincidence and a second copy of the registry.
      if (paired >= 8) offenders.push(`${f} (${paired} pairs)`);
    }
    check("no module carries a second copy of the pairing", offenders, []);
  }

  // ------------------------------------------- 4. the export tables are real

  {
    // `withAliases` keeps an unrecognised key rather than throwing, which is
    // right — some prelude spellings are not in the pairing — but it means a
    // mistyped Hebrew name produces a table entry that simply never matches. So
    // the names are checked against the prelude, from the export's own side.
    const md = await readFile(path.join(SRC, "markdown.ts"), "utf8");
    const keys = new Set();
    for (const m of md.matchAll(/^\s{2,}([֐-׿][֐-׿_0-9]*):/gmu)) keys.add(m[1]);
    // `...tiered("מדור")` names a *stem*, not a command: the seven names it
    // stands for are `מדור_א` … `מדור_ז`, and those are what have to exist.
    for (const m of md.matchAll(/\.\.\.tiered\("([֐-׿][֐-׿_0-9]*)"\)/gu)) {
      for (const t of ["א", "ב", "ג", "ד", "ה", "ו", "ז"]) keys.add(`${m[1]}_${t}`);
    }
    ok("the export tables were read", keys.size >= 50);
    const unknown = [...keys].filter((k) => !defined.has(k));
    check("every export-table name is a command the prelude defines", unknown, []);

    // And the point of all of it, from the outside: both spellings export the
    // same, including the tier the palette never offered.
    check("a Hebrew tier-6 note exports", toMarkdown("א#הערה_ו[הערה]").includes("[^1]"), true);
    check("and so does its English twin", toMarkdown("a#tier6[note]").includes("[^1]"), true);
    check("a Hebrew list exports", toMarkdown("#רשימה(פריט[א])").trim(), "- א");
    check("and its English twin", toMarkdown("#bullets(item[a])").trim(), "- a");
  }

  // ------------------------------------------- 5. "strip the markup", once

  {
    // Six askers, six regexes, one question — the word count, the notes pane's
    // gist, the note-chooser's preview, the review excerpt and two footnote
    // widgets. Each was wrong in its own direction, which is what a duplicated
    // rule looks like when nobody compares the copies.
    check("markup goes, words stay", plainText("#הדגשה[חזק] ועוד"), "חזק ועוד");
    check("comments are not words", plainText("// הערה\nטקסט"), "טקסט");
    check("block comments too", plainText("/* בלוק */ אחרי"), "אחרי");
    // Three of the six used `\([^()]*\)` for an argument list, which stops at
    // the first *inner* `)` — so a colour left a stray paren in the word count
    // and in the preview.
    check("a nested paren does not leak", plainText('#צבע(rgb("#b91c1c"))[אדום]'), "אדום");
    // And the other direction: prose inside an argument list is still prose.
    // `#סימן("א", [דיני תפילה])` prints those words, and every regex that ate
    // the whole `(…)` threw them away.
    check("content inside an argument list is words", plainText('#סימן("א", [דיני תפילה])'), "דיני תפילה");
    // A settings call prints nothing, so it contributes nothing.
    check("a call with no body contributes nothing", plainText('#כלול("פרק ג")'), "");
    // Markup becomes a space, never nothing: two adjacent calls are two words.
    check("adjacent calls stay two words", plainText("#הדגשה[א]#הדגשה[ב]"), "א ב");
    check("native heading markers go too", plainText("= כותרת\nגוף"), "כותרת גוף");

    // The prohibition. `spans.ts` is the scanner and `plainText` is the answer;
    // a module that writes `replace(/#…/)` has gone back to guessing where a
    // command ends, which is the whole of §1 one level up.
    const offenders = [];
    for (const f of (await readdir(SRC)).filter((f) => f.endsWith(".ts"))) {
      if (f === "spans.ts") continue;
      const body = await readFile(path.join(SRC, f), "utf8");
      body.split("\n").forEach((line, i) => {
        const s = line.trim();
        if (s.startsWith("//") || s.startsWith("*") || s.startsWith("/*")) return;
        if (/\.replace\(\s*\/[^/]*#\[/.test(line)) offenders.push(`${f}:${i + 1}`);
      });
    }
    check("only spans.ts strips markup with a regex", offenders, []);
  }
}
