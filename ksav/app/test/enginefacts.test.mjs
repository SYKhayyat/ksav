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
//   2. A document falls back to the engine's defaults, field for field, and the
//      app keeps **no copy** of them. The Rust value wins on the wire, so drift
//      here shows as sliders that disagree with the page rather than as an
//      error — and until `Settings` stopped extending `DocConfig` there were
//      thirty fields for it to drift in.
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
  TEMPLATE_FIELDS,
  bothSpellings,
  withAliases,
} from "../.tmp-test/engine.gen.mjs";
import { INSTANCE_KEYS, instanceCommands } from "../.tmp-test/styles.mjs";
import { CLASS_PARTS, MARK_CLASSES, STYLED_CLASSES } from "../.tmp-test/marks.mjs";
import {
  DEFAULT_CHANNEL,
  PLACEMENTS,
  TIER_CHANNELS as CHANNEL_TIERS,
  englishArg,
  englishValue,
} from "../.tmp-test/channels.mjs";
import { DEFAULTS, defaultPageSetup } from "../.tmp-test/settings.mjs";
// The classification moved to `interchange.ts` when Org arrived and the tables
// stopped being able to say both what a command means and how one format spells
// it. `toMarkdown` is still Markdown's own.
import { CLASSIFIED_NAMES } from "../.tmp-test/interchange.mjs";
import { toMarkdown } from "../.tmp-test/markdown.mjs";
import { plainText } from "../.tmp-test/spans.mjs";
import { commands } from "../tools/commands.mjs";
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

  // -------------------------------------- 1b. TemplateDef is not typed twice
  //
  // §1 #8: `facts.rs` says *"a value crossed a language boundary as source
  // text… so it stops crossing as text"*, and was applied to four tables.
  // `TemplateDef` was the fifth, still typed out by hand in `api.ts` — the one
  // Rust→TypeScript table with none of this protection. A field added in Rust
  // never reached the client; a field renamed became `undefined` at every use.
  //
  // What crosses is the **field names**, not the templates: their bodies are
  // twelve whole documents that `/templates` sends at runtime. So the assertion
  // is that the shape the client is compiled against is the shape the engine
  // actually serialises.
  {
    ok("the template shape came from the engine", TEMPLATE_FIELDS.length >= 8, TEMPLATE_FIELDS.join(", "));
    for (const f of ["id", "he", "en", "category", "lang", "body"]) {
      ok(`…and carries ${f}`, TEMPLATE_FIELDS.includes(f));
    }
    // The prohibition, which is the half that stops it growing back: `api.ts`
    // must **re-export** the type, never declare one. A second declaration
    // typechecks perfectly and is wrong the moment Rust moves.
    const api = await readFile(path.join(SRC, "api.ts"), "utf8");
    ok("api.ts does not declare TemplateDef itself", !/interface\s+TemplateDef\b/.test(api));
    ok("…it re-exports the generated one", api.includes('from "./engine.gen"'));
  }

  // ------------------------------------------- 2. the defaults are the engine's

  {
    ok("the defaults were parsed", Object.keys(DOC_DEFAULTS).length >= 20);
    // `defaultPageSetup()`, not `DEFAULTS`. This asserted that `settings.ts`
    // shipped the engine's defaults *field for field* — which was the right
    // assertion while `Settings extends DocConfig`, and the assertion is gone
    // because the duplication it guarded is gone: the app no longer keeps a
    // copy of the thirty page fields at all. What a document falls back to is
    // read straight from the generated table.
    const fallback = defaultPageSetup();
    const drifted = Object.entries(DOC_DEFAULTS).filter(([k, v]) =>
      Array.isArray(v) ? JSON.stringify(fallback[k]) !== JSON.stringify(v) : fallback[k] !== v,
    );
    check("a document falls back to the engine's defaults, field for field", drifted, []);

    // …and the app holds no second opinion about any of them. This is the
    // prohibition the assertion above turned into: the panel used to fall
    // through to `settings[key]` whenever the document had not said, which for
    // the per-edge margins is their ordinary state — so it could print a top
    // margin the page was not laid out on.
    const held = Object.keys(DOC_DEFAULTS).filter((k) => k in DEFAULTS);
    check("and the app keeps no copy of a page field", held, []);

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
      ok(`${k} stays absent rather than zero`, !(k in DOC_DEFAULTS) && !(k in fallback));
    }

    // `lang` means the *document's* language in the engine and the *interface's*
    // here, which is the one place a shared name would have been worse than two.
    check("the interface language is the app's own", DEFAULTS.lang, "he");

    check("the bundled fonts come from what the engine embeds", BUNDLED_FONTS, [
      "Frank Ruhl Hofshi",
      "David Libre",
      "Cascadia Mono",
    ]);
    // The font a document falls back to, which is a fact about the document and
    // was read off `DEFAULTS` while the app carried a copy of it.
    check("the default font is one of them", BUNDLED_FONTS.includes(fallback.font), true);
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
    //
    // The list comes from the module, not from a regex over its source text.
    // The regex could not tell a table key from a Hebrew word in a comment, it
    // re-derived the seven tier suffixes on its own side, and it needed a floor
    // of fifty to prove it had matched anything — a fence whose subject is the
    // formatting of the file it is guarding. It went red the first time seven
    // rows moved out of a table for a good reason, which is the whole argument
    // against reading source as data, made by the fence itself.
    const keys = new Set(CLASSIFIED_NAMES);
    const unknown = [...keys].filter((k) => !defined.has(k));
    check("every export-table name is a command the prelude defines", unknown, []);

    // And the point of all of it, from the outside: both spellings export the
    // same, including the tier the palette never offered.
    check("a Hebrew tier-6 note exports", toMarkdown("א#הערה_ו[הערה]").includes("[^1]"), true);
    check("and so does its English twin", toMarkdown("a#tier6[note]").includes("[^1]"), true);
    check("a Hebrew list exports", toMarkdown("#רשימה(פריט[א])").trim(), "- א");
    check("and its English twin", toMarkdown("#bullets(item[a])").trim(), "- a");
  }

  // ------------------------------- 4½. what one element may overrule, once

  {
    // `styles.ts` decides which controls the styles panel offers for **one**
    // heading, list, table or note, and `ksav.typ` decides which of them the
    // engine accepts. Two lists, one fact, and both failure directions are bad in
    // a specific way: a control the engine refuses stops the compile the moment
    // somebody uses it, and a knob the engine accepts and the panel omits is a
    // setting reachable only by typing the command — which is the complaint that
    // produced this panel in the first place.
    //
    // The prelude is the authority. Three of its lists are written out (`gebundene
    // #let _xx_own_keys`) and the rest are "every knob this kind's global has",
    // which is the defaults dictionary.
    const preludeList = (name) => {
      const m = new RegExp(`#let ${name} = \\(([^)]*)\\)`, "u").exec(prelude);
      ok(`the prelude declares ${name}`, !!m, () => `${name} is not in ksav.typ`);
      return m ? [...m[1].matchAll(/"([^"]+)"/gu)].map((x) => x[1]) : [];
    };
    /** Every quoted string on one `#let name = …` line, wherever they sit in it. */
    const quotedOn = (name) => {
      const m = new RegExp(`#let ${name} = ([^\n]*)`, "u").exec(prelude);
      ok(`the prelude declares ${name}`, !!m, () => `${name} is not in ksav.typ`);
      return m ? [...m[1].matchAll(/"([^"]+)"/gu)].map((x) => x[1]) : [];
    };
    /** The knob names of a `#let _xx_defaults = (…)` block, which spans lines. */
    const defaultsList = (name) => {
      const at = prelude.indexOf(`#let ${name} = (`);
      ok(`the prelude declares ${name}`, at >= 0, () => `${name} is not in ksav.typ`);
      if (at < 0) return [];
      const block = prelude.slice(at, prelude.indexOf("\n)", at));
      return [...block.matchAll(/^\s{2}([A-Za-z֐-׿_][A-Za-z0-9֐-׿_]*):/gmu)].map((m) => m[1]);
    };

    // Which of the prelude's lists each kind is actually split against. Without
    // this the fence would compare `INSTANCE_KEYS.headings` to `_hd_defaults` while
    // the prelude quietly split headings against something shorter, and agree with
    // itself about a list nothing reads.
    const splitAgainst = {
      headings: "_hd_defaults.keys()",
      lists: "_ls_defaults.keys()",
      tables: "_tb_defaults.keys()",
      notes: "_fn_own_keys",
      bands: "_ap_own_keys",
      streams: "_ap_own_keys",
      marks: "_mk_own_keys",
    };
    const want = {
      headings: defaultsList("_hd_defaults"),
      lists: defaultsList("_ls_defaults"),
      tables: defaultsList("_tb_defaults"),
      notes: preludeList("_fn_own_keys"),
      bands: preludeList("_ap_own_keys"),
      streams: preludeList("_ap_own_keys"),
      // Composed the way the prelude composes it: `_mk_own_keys = _mk_knobs +
      // ("פטור", "ברשימה")`, the six knobs plus the two switches
      // that are not a look at all. Reading only the line would find the two and
      // silently stop asking about the six.
      // Three lines, because the prelude composes it from three: the text knobs
      // every class has, the block knobs only the ones that draw a block answer
      // to, and the two switches that are not a look at all.
      marks: [
        ...preludeList("_mk_knobs"),
        ...preludeList("_mk_block_knobs"),
        ...quotedOn("_mk_own_keys"),
      ],
    };
    for (const [kind, arg] of Object.entries(splitAgainst)) {
      ok(
        `the prelude splits ${kind}'s own arguments against ${arg}`,
        prelude.includes(`, ${arg})`),
        () => `no _cfg_split(…, ${arg}) in ksav.typ`,
      );
    }
    for (const [kind, keys] of Object.entries(want)) {
      ok(`the prelude names something for ${kind}`, keys.length > 0, () => `${kind}: ${keys}`);
      check(
        `the panel offers exactly what the engine accepts per ${kind}`,
        [...INSTANCE_KEYS[kind]].sort(),
        [...keys].sort(),
      );
    }
    // `review` is the one kind with no element to put a setting on — a document is
    // read in one view, and the view is not a property of anything in it.
    check("a document's review view is not a per-element style", [...INSTANCE_KEYS.review], []);

    // And every command the panel will write an override onto has to be one the
    // prelude actually lets take arguments. `#let X(body)` with no `..opts` would
    // accept the panel's write and then refuse to compile.
    const takesOptions = new Set();
    for (const m of prelude.matchAll(
      /^#let\s+([A-Za-z֐-׿_][A-Za-z0-9֐-׿_]*)\s*\(([^=]*)\)\s*=/gmu,
    )) {
      if (m[2].includes("..")) takesOptions.add(m[1]);
    }
    const cannot = [];
    for (const kind of Object.keys(want)) {
      for (const name of instanceCommands(kind)) {
        if (!takesOptions.has(name)) cannot.push(`${kind}: ${name}`);
      }
    }
    check("every command the panel styles per instance takes named arguments", cannot, []);

    // The mark classes, which are a second list the panel could get wrong in the
    // same way. `_mk_defaults` is the prelude's set of *styled* classes and
    // `_mk_titles` its set of *collected* ones — the difference is deliberate (a
    // siman is a heading and a mareh makom a footnote, and neither takes a second
    // styling channel), so both halves are compared rather than one.
    const classKeys = (name) => {
      const at = prelude.indexOf(`#let ${name} = (`);
      ok(`the prelude declares ${name}`, at >= 0, () => `${name} is not in ksav.typ`);
      if (at < 0) return [];
      const block = prelude.slice(at, prelude.indexOf("\n)", at));
      return [...block.matchAll(/^\s{2}"([^"]+)":/gmu)].map((m) => m[1]);
    };
    check(
      "the panel styles exactly the classes the prelude gives a look to",
      [...STYLED_CLASSES].sort(),
      classKeys("_mk_defaults").sort(),
    );
    check(
      "and the marks pane lists exactly the classes the prelude collects",
      [...MARK_CLASSES].sort(),
      classKeys("_mk_titles").sort(),
    );

    // ------------------------------------------------------------- channels
    //
    // The channel model has four tables that exist on both sides of the wire —
    // the built-in tier channels, the three placements, the argument names and
    // the placement *values* — and every one of them is a list the editor could
    // get wrong in the way this file exists to catch: a panel that offers a
    // placement the engine refuses stops the compile the moment somebody picks
    // it, and one that omits a placement the engine accepts is an arrangement
    // reachable only by typing the command.
    check(
      "the editor's built-in channels are the prelude's tiers",
      [...CHANNEL_TIERS],
      quotedOn("_ch_tiers"),
    );
    check(
      "the editor's placements are the prelude's",
      [...PLACEMENTS].sort(),
      quotedOn("_ch_places").sort(),
    );
    check(
      "…and the default channel is the one the prelude writes into",
      DEFAULT_CHANNEL,
      quotedOn("_ch_default")[0],
    );
    // The English spellings, against `_en_params` and `_en_values`. An English
    // command taking a Hebrew parameter is not English, and neither is one
    // taking a Hebrew *value* — which is the whole reason `_en_values` exists.
    for (const he of ["ערוץ", "מקור", "מיקום", "אזור", "גובה", "פריסה", "כותרת"]) {
      const en = englishArg(he);
      ok(
        `the panel's English spelling of ${he} is one the prelude reads`,
        !!en && new RegExp(`\\b${en}:\\s*"${he}"`, "u").test(prelude),
        () => `${he} → ${en} is not in _en_params`,
      );
    }
    for (const he of [...PLACEMENTS, "מוערם", "צד"]) {
      const en = englishValue(he);
      ok(
        `the panel's English spelling of the value ${he} is one the prelude reads`,
        !!en && new RegExp(`\\b${en}:\\s*"${he}"`, "u").test(prelude),
        () => `${he} → ${en} is not in _en_values`,
      );
    }
    // A channel knob the prelude accepts and the editor never writes is not a
    // defect — the panel deliberately offers four of ten — but a knob the editor
    // writes and the prelude refuses stops the compile, so that direction is
    // checked and the other is not.
    const channelOwn = preludeList("_ch_own");
    for (const he of ["מקור", "מיקום", "אזור", "גובה"]) {
      ok(
        `the prelude's #ערוץ accepts ${he}`,
        channelOwn.includes(he),
        () => `_ch_own is ${channelOwn}`,
      );
    }
    const regionOwn = preludeList("_rg_own");
    for (const he of ["מיקום", "גובה", "פריסה", "כותרת"]) {
      ok(
        `the prelude's #אזור accepts ${he}`,
        regionOwn.includes(he),
        () => `_rg_own is ${regionOwn}`,
      );
    }
  }

  // ------------------- 4¾. every separate command has a look of its own
  //
  // The rule, stated on 16 August 2026: **anything that is a separate command
  // has a look of its own, and the writer can set it — whether heading, source
  // footnote, siman, seif.**
  //
  // What it rules out is the answer this product gave twice: *that is really a
  // footnote / really a heading, so style all your footnotes / all your
  // headings*. True about the mechanism and no use to the writer, who wanted
  // their mareh mekomos set apart from their notes and their simanim from their
  // other headings.
  //
  // The rule cannot be held by a regex over the prelude, because "has a look"
  // is answered by five different authorities — a per-level ramp for headings,
  // a per-tier one for notes, per-band, per-stream, and the class register that
  // `_mk_defaults` holds. So this is a sweep over the *registry*: every command
  // the engine offers is either drawn with a look somebody can set, or it is
  // one of the kinds below, by name and with the reason.
  //
  // The last kind is the inventory of what is left. It is a claim and not a
  // skip list: every name in it must still be a command, and must still be
  // absent from `_mk_defaults` — so giving one a look turns this red until the
  // row is removed, which is how the list can only shrink.

  {
    const styled = new Set([
      // The five authorities, each named where it lives.
      ...["כותרת", "כותרת1", "כותרת2", "כותרת3", "כותרת4", "כותרת5", "כותרת6"],
      ...["רשימה", "ממוספרת", "ממוספרת_עברית"],
      "טבלה",
      ...["הערה", "הערה_בדרגה", "הערה_על_הערה"],
      ...["א", "ב", "ג", "ד", "ה", "ו", "ז"].map((x) => `הערה_${x}`),
      ...["בדרגה", "א", "ב", "ג", "ד", "ה", "ו", "ז"].map((x) => `מדף_${x}`),
      ...["הערה_זרם", "הערת_תוכן", "הערת_מקור"],
      ...STYLED_CLASSES,
    ]);

    /** Commands that are not a thing with a look, and why. */
    const NOT_A_LOOK = {
      "is itself a style": [
        "הדגשה", "נטוי", "קו_תחתון", "קו_חוצה", "עיצוב", "סימון", "רברבתי",
        "כתב_רשי", "עילי", "תחתי", "גדול", "קטן", "צבע", "רקע", "גופן_שונה",
        "קוד", "גודל_גופן", "מרווח_אותיות",
      ],
      "a position, not a look": [
        "מרכז", "ימין", "שמאל", "משמאל_לימין", "מימין_לשמאל", "הזחה",
        "מעבר_עמוד", "מעבר_שורה", "מעבר_פסקה", "מעבר_טור", "מרווח",
        "רווח_אופקי", "חסר", "טורים_בלוק",
      ],
      "styled by the thing it is part of": [
        "פריט", "תא", "כותרת_תא", "מיזוג", "רשימת_הגדרות",
      ],
      "prints nothing at all": [
        "כלול", "סמן", "הפניה", "גופי_הערות", "גוף_הערה", "הערה_בשם",
        "הצג_אזור",
      ],
      "a configuration or an index": [
        "תוכן", "רשימת_סימונים", "מפתח_מקורות",
        "מפתח_ענינים", "ערוץ", "אזור", "מקטע_עמוד", "כותרת_עליונה",
        "כותרת_תחתונה", "הערות_מדורגות", "הערות_בסוף", "הערות_בסוף_צד",
        "עם_הערות_צד", "עם_הערות_דו_צד", "עם_פירוש",
      ],
      // What the rule still owes. Each of these draws something a writer would
      // want to set and has no channel — see HANDOFF.md.
      "no look of its own yet": [
        "כותרת_בהערה", "קו_מפריד", "תמונה", "נוסחה", "נוסחה_בשורה",
        "הערת_ימין", "הערת_שמאל", "הערת_גיליון", "מדור_א", "מדור_ב", "מדור_ג",
        "מדור_בדרגה", "הערתסיום", "הוספה", "מחיקה", "הערת_עורך",
      ],
    };

    const names = new Set(commands().filter((c) => !c.deprecated).map((c) => c.he));
    const classified = new Map();
    for (const [why, list] of Object.entries(NOT_A_LOOK)) {
      for (const he of list) classified.set(he, why);
    }

    // Every name in the table is still a command. A row for something that has
    // been renamed is an exemption guarding nothing, which this file's
    // neighbours refuse by name.
    check(
      "every command excused from the rule still exists",
      [...classified.keys()].filter((he) => !names.has(he)),
      [],
    );
    // …and nothing is excused twice, under two different reasons.
    const twice = [];
    for (const [why, list] of Object.entries(NOT_A_LOOK)) {
      for (const he of list) if (classified.get(he) !== why) twice.push(he);
    }
    check("and no command is excused under two reasons", twice, []);

    // The rule itself.
    const unclassified = [...names].filter(
      (he) => !styled.has(he) && !classified.has(he) && !he.startsWith("הגדרות_"),
    );
    check(
      "every command either has a look of its own or is excused by name",
      unclassified,
      [],
    );

    // And the inventory is honest in the other direction: a command listed as
    // having no look yet must genuinely have none.
    check(
      "nothing listed as having no look yet already has one",
      NOT_A_LOOK["no look of its own yet"].filter((he) => styled.has(he)),
      [],
    );
    ok(
      "the rule still owes something, and says how much",
      NOT_A_LOOK["no look of its own yet"].length > 0,
      `${NOT_A_LOOK["no look of its own yet"].length} commands`,
    );

    // …and the other half of the rule: a thing with a look has a **door of its
    // own** to set it through. Naming a class inside a call about marks in
    // general is not "each thing has its own style", which is what this was
    // before — one command, ten classes keyed inside it.
    const noDoor = [...STYLED_CLASSES].filter((cls) => !names.has(`הגדרות_${cls}`));
    check("every styled command has a configuration named for it", noDoor, []);

    // …and the pieces inside it. `_mk_part_defaults` is the authority for which
    // commands draw more than one thing and what each piece is called; the app
    // has to agree, or the panel offers a part the engine will refuse and misses
    // one it would accept.
    /**
     * The two-level table, read in both the shapes the prelude writes it in.
     *
     * A class with several parts is spread over lines; one with one or two is
     * written inline — `"גמרא": ("מסכת": (:), "דף": (:))`. A reader that knew
     * only the first shape saw `גמרא` as having a masechta and no daf, which is
     * this fence catching its own reader before it caught anything else.
     */
    const partsIn = (name) => {
      const at = prelude.indexOf(`#let ${name} = (`);
      ok(`the prelude declares ${name}`, at >= 0, () => `${name} is not in ksav.typ`);
      if (at < 0) return {};
      const block = prelude.slice(at, prelude.indexOf("\n)\n", at));
      const out = {};
      let cls = null;
      for (const line of block.split("\n")) {
        const outer = /^ {2}"([^"]+)":\s*\((.*)$/u.exec(line);
        if (outer) {
          cls = outer[1];
          // Everything named on the same line, which is all of them when the
          // class is written inline and none when it is spread.
          out[cls] = [...outer[2].matchAll(/"([^"]+)":/gu)].map((m) => m[1]);
          if (outer[2].trimEnd().endsWith("),") || outer[2].trimEnd().endsWith(")")) cls = null;
          continue;
        }
        if (!cls) continue;
        const inner = /^ {4}"([^"]+)":/u.exec(line);
        if (inner) out[cls].push(inner[1]);
        else if (/^ {2}\)/u.test(line)) cls = null;
      }
      return out;
    };
    const enginePartsRaw = partsIn("_mk_part_defaults");
    const sorted = (o) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].sort()]));
    check("the panel knows exactly the parts the engine draws", sorted(CLASS_PARTS), sorted(enginePartsRaw));
    // A part belongs to a command that has a look at all.
    check(
      "…and every one of them is on a styled command",
      Object.keys(CLASS_PARTS).filter((cls) => !STYLED_CLASSES.includes(cls)),
      [],
    );
    // The door has to exist in the prelude as well as in the registry: a row in
    // Rust with no `#let` behind it is a palette entry that stops the compile.
    const undefined_ = [...STYLED_CLASSES].filter((cls) => !defined.has(`הגדרות_${cls}`));
    check("…and the prelude defines each of them", undefined_, []);
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
