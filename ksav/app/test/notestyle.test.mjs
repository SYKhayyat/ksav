// One look for every note, and each apparatus still able to say otherwise.
//
// # The report
//
// *"Footnotes and endnotes should share a default style, and either should be
// easy to change on its own. Today the two apparatuses are styled separately
// with no shared default and no easy per-apparatus edit."*
//
// Both halves were true, and the second was worse than reported. Footnotes had
// a full set of knobs behind `#הגדרות_הערות`. **Endnotes had none at all** —
// `#הגדרות_הערות_סיום` carried a numbering scheme and nothing else, and the
// section at the back was set in the body face at the body size with no way to
// say otherwise. So "change either on its own" was not a UI gap for one of the
// two; there was nothing to change.
//
// # The sweep, which is the part a fence has to hold
//
// The handoff says *"sweep all note surfaces, not only the two named"*, and
// this repository's recorded failure is naming a class in prose, fixing one
// instance, and never touching the siblings. There are **six** note
// apparatuses: the page-foot footnotes, the endnote section, the stacked
// section bands, the per-page bands, the parallel streams and the side column.
// So the assertions below are written per kind off `styles.NOTE_KINDS` and
// checked against the prelude, rather than as a paragraph about footnotes and
// endnotes with four siblings left out of it.
//
// The knob list is read out of `ksav.typ` for the same reason: a shared style
// the panel offers six knobs for and the engine reads five of is a control that
// silently does nothing, which is the exact defect class this repository keeps
// producing.

import { check, ok } from "./harness.mjs";
import * as styles from "../.tmp-test/styles.mjs";
import * as panelviews from "../.tmp-test/panelviews.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
const ENGINE = path.join(HERE, "..", "..", "engine");
const PRELUDE = readFileSync(path.join(ENGINE, "typst", "ksav.typ"), "utf8");
// The generated registry, not the Rust table — see the same note in
// `styleediting.test.mjs`, and `runner.test.mjs` for the rule.
import { COMMAND_EN } from "../.tmp-test/engine.gen.mjs";
const MAIN = readFileSync(path.join(HERE, "..", "src", "main.ts"), "utf8");

/** A Typst tuple of quoted names, as a list. */
function preludeList(name) {
  const m = new RegExp(`#let ${name} = \\(([^)]*)\\)`, "u").exec(PRELUDE);
  return m ? [...m[1].matchAll(/"([^"]+)"/gu)].map((x) => x[1]) : null;
}

/** The state each apparatus keeps its configuration in. */
const STATE_OF = {
  notes: "_fn_cfg",
  endnotes: "_es_cfg",
  bands: "_pp_cfg",
  streams: "_sf_cfg",
  tiers: "_md_cfg",
  sidenotes: "_sn_cfg",
};

export async function run() {
  // ------------------------------------------------- the shared layer exists

  {
    ok("the prelude has a shared note style", PRELUDE.includes("#let _nt_cfg = state("));
    ok("...with a command to set it", PRELUDE.includes("#let הגדרות_טקסט_הערות(..opts)"));
    ok("...spelled in English too", PRELUDE.includes("#let notes_text_config = _en(הגדרות_טקסט_הערות)"));
    check("...and known to the registry", COMMAND_EN["הגדרות_טקסט_הערות"], "notes_text_config");
  }

  {
    // The knobs the panel offers are the knobs the engine reads. Off `_nt_keys`
    // rather than off a list written here, so the two cannot drift.
    const engine = preludeList("_nt_keys");
    ok("the prelude declares _nt_keys", Array.isArray(engine));
    check(
      "the shared knobs are exactly what the engine reads",
      Object.keys(styles.SHARED_NOTE_FIELDS).sort(),
      [...engine].sort(),
    );
  }

  // ------------------------------------------------------------- the sweep

  {
    // **The authority is the prelude, not `NOTE_KINDS`.**
    //
    // The first version of this block walked `styles.NOTE_KINDS` and asked the
    // prelude about each entry. Dropping `endnotes` from that list — which is
    // precisely the "fixed one instance, never swept the siblings" regression
    // this file exists to catch — passed, 38 of 38, because removing an entry
    // only removed an iteration. A fence that reads its own subject list off
    // the thing it is guarding cannot fail for the reason it was written; this
    // repository calls that `ONLY_AT_TOP` and it has now happened twice in two
    // days.
    //
    // So the set comes from `ksav.typ`: every apparatus whose configuration is
    // read through `_nt_under` is one that falls back to the shared style, and
    // `NOTE_KINDS` has to name exactly those. An apparatus wired in the engine
    // and missing here fails, and a kind here that the engine never wired fails
    // too.
    const wired = new Set(
      [...PRELUDE.matchAll(/_nt_under\((_[a-z]{2})_cfg\.get\(\)\)/gu)].map((m) => m[1]),
    );
    const kindOf = Object.fromEntries(Object.entries(STATE_OF).map(([k, v]) => [v.slice(0, 3), k]));
    const fromEngine = [...wired].map((st) => kindOf[st]).filter(Boolean).sort();
    check(
      "the apparatuses that read the shared style are exactly the ones named here",
      [...styles.NOTE_KINDS].sort(),
      fromEngine,
    );

    // **Every read, not merely one per apparatus.** The version above this one
    // asserted that each apparatus is wired *somewhere*, and each of them has
    // two read sites — the note and the block that renders it — so unwiring one
    // of the two passed. This is the prohibition instead: a note apparatus's
    // configuration is read through `_nt_under`, full stop.
    //
    // The exception is a read that asks for **one named knob**,
    // `_es_cfg.get().at("מספור")` and its like. Those are arrangement — a
    // numbering scheme, a set of heights, a stream order — and arrangement has
    // no shared default to fall back to, which is the whole reason `_nt_keys`
    // is five keys and not everything an apparatus has.
    // Line by line, which is both simpler and honest: a regex with a
    // fixed-width window around each read reports whichever occurrences the
    // previous match happened to leave, and the first draft of this did exactly
    // that and flagged five legitimate reads.
    const bare = [];
    for (const [i, line] of PRELUDE.split(/\r?\n/u).entries()) {
      for (const st of Object.values(STATE_OF)) {
        if (!line.includes(`${st}.get()`)) continue;
        if (line.includes(`_nt_under(${st}.get())`)) continue;
        // One named knob: a numbering scheme, a set of heights, a stream order.
        // Arrangement has no shared default to fall back to, which is why
        // `_nt_keys` is five keys and not everything an apparatus has.
        if (line.includes(`${st}.get().at(`)) continue;
        if (line.includes(`_sf_order(${st}.get()`)) continue;
        bare.push(`${st} at line ${i + 1}: ${line.trim().slice(0, 60)}`);
      }
    }
    check("no apparatus reads its own ink without the shared style under it", bare, []);

    const kinds = panelviews.STYLE_SECTIONS.map((s) => s.kind);
    for (const kind of styles.NOTE_KINDS) {
      // Each of them has a section of its own — *"each still changeable"*.
      // Endnotes had none, which is how a whole apparatus went unstyleable
      // without anybody noticing.
      ok(`${kind} has a section in the styles panel`, kinds.includes(kind));
    }
    ok("the shared section is offered too", kinds.includes("noteText"));
  }

  {
    // A knob set on an apparatus wins over the shared answer, which requires
    // knowing which knobs the writer actually set — a shipped default and a
    // chosen value are the same thing in a dictionary. `_מפורש` is that record,
    // and without it the shared layer would be either always or never in force.
    ok("the engine records which knobs were set explicitly", PRELUDE.includes("#let _nt_explicit("));
    for (const cmd of [
      "הגדרות_הערות",
      "הגדרות_מדורגות",
      "הגדרות_מדפים",
      "הגדרות_זרמים",
      "הגדרות_הערות_סיום",
      "הגדרות_הערות_צד",
    ]) {
      const at = PRELUDE.indexOf(`#let ${cmd}(..opts)`);
      ok(`${cmd} records what it was given`, at >= 0 && PRELUDE.slice(at, at + 400).includes("_nt_explicit(d, opts.named())"));
    }
  }

  // ------------------------------------------- endnotes got knobs to be given

  {
    const at = PRELUDE.indexOf("#let _es_defaults = (");
    ok("the prelude declares _es_defaults", at >= 0);
    // The whole call, not its first line: the defaults grew a comment and a
    // line per knob when endnotes got knobs at all, and a fence that reads one
    // line would have gone quiet at exactly the moment it had something to say.
    const line = PRELUDE.slice(at, PRELUDE.indexOf("\n)", at));
    for (const knob of Object.keys(styles.SHARED_NOTE_FIELDS)) {
      ok(`an endnote section can be given ${knob}`, line.includes(`${knob}:`));
    }
    // `auto`, not a value: a shipped value is indistinguishable from a chosen
    // one, and the whole of the shared layer is that distinction.
    ok("...and none of them ships with an answer", !/(גופן|גודל|סגנון|צבע|ריווח): (?!auto)/u.test(line));
    ok("...and the section actually sets the text it resolves", PRELUDE.includes("set text(.._es_text())"));
    ok(
      "...including when several streams are printed side by side",
      (PRELUDE.match(/set text\(\.\._es_text\(\)\)/gu) ?? []).length >= 2,
    );
  }

  // ------------------------------------------------------- and it is visible

  {
    // The half that makes precedence legible. An apparatus overruling the
    // shared style says so, by knob name — otherwise the shared control appears
    // to do nothing for that apparatus and nothing on the screen says why.
    ok("an apparatus that overrules the shared style says so", /function overridingShared\(/.test(MAIN));
    ok(
      "...naming the knobs it is answering for itself",
      /overridingShared[\s\S]{0,800}SHARED_NOTE_FIELDS\[k\]\.label/.test(MAIN),
    );
    ok(
      "...on every one of the six and not on the other sections",
      /styles\.NOTE_KINDS as readonly string\[\]\)\.includes\(section\.kind\)/.test(MAIN),
    );
    ok("the shared section has rows", /function sharedNoteRows\(\)/.test(MAIN));
    ok("...and the endnote section has its own", /function endnoteStyleRows\(\)/.test(MAIN));
  }
}
