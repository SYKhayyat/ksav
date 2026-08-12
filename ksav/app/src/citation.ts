// Writing a citation into the document — the one place, and the ref goes with it.
//
// **Found by writing a kuntres.** The Mekoros panel ("where is this phrase
// from?" → pick a hit → it lands as a footnote) built its markup inline, in
// `main.ts`, as `#מראה_מקום[${place.display}]` — the printed string and nothing
// else. One line above it, a comment said *"the ref travels with it, because
// that is what makes it re-printable later (spec.md §10.2)."* It did not.
// `Mekor.ref` was on the object, typed, arriving from Girsa, and read by
// nothing.
//
// Everything downstream of that ref was already built and already tested:
//
//   - `#מראה_מקום(מקור: …)` files it in `#metadata` (`ksav.typ`),
//   - `#מראה_מקומות()` sorts and prints the source index from those entries,
//   - a ref in a compiled PDF is a link to the page it names.
//
// All of it was dead for every citation the editor could insert by itself. The
// *other* door into the same feature — a packet handed over by Girsa, rendered
// to markup in Rust by `ksav_engine::source` — writes `מקור:` and has an engine
// test that says so (`engine/tests/from_girsa.rs`). Two doors, one feature, one
// of them quietly not doing it: this repository's own bug family, in the
// feature whose entire argument is *"the ref is stored in the document, not
// just the printed string."*
//
// So there is one producer now, it is this file, and `citation.test.mjs` sweeps
// `src/` to keep it the only one.

import type { Mekor } from "./api";
import { scan, splitArgs, topLevelColon } from "./spans";
import { typstContent, typstString } from "./typst-escape";

/**
 * A place Girsa named, as the markup that goes in the document.
 *
 * Two things it is careful about, and both were wrong at the call site it
 * replaces:
 *
 * **The ref.** Written as `מקור:` whenever there is one. Guarded rather than
 * assumed — Girsa can answer with a place it cannot address, and `מקור: ""`
 * would file an empty entry in the source index, which is worse than no entry
 * because it is one nobody can follow.
 *
 * **The escaping.** `display` is Girsa's string, not this application's. A `]`
 * in it closes the call and takes the sentence with it, which is exactly the
 * failure `typst-escape.ts` was written for — and this call site was one of the
 * ones it never reached.
 */
export function citationMarkup(place: Pick<Mekor, "display" | "ref" | "range">): string {
  const shown = typstContent(place.display ?? "");
  return place.ref
    ? `#מראה_מקום(מקור: ${typstString(place.ref)}${characters(place.range)})[${shown}]`
    : `#מראה_מקום[${shown}]`;
}

/**
 * The named argument that carries which characters of the place were quoted, or
 * nothing.
 *
 * `תווים: "4-19"` — half-open, counted in the text as the reader was shown it.
 * `"4-"` is *from there to the end*, which is what a highlight that runs off the
 * last word means and what an editor who later adds a word to the se'if should
 * still get.
 *
 * **Nothing is the right answer for the whole place.** A document that quotes a
 * whole se'if says so by saying nothing, which is what every document written
 * before this argument existed already says, and what makes them all still
 * correct. `girsa_ksav::characters` decides it the same way and this has to
 * match it byte for byte, because the two doors write into one document and
 * `#מראה_מקומות()` reads both.
 *
 * Until now this side could not write the argument at all — the field existed in
 * `girsa-source`, the Rust door wrote it, and the editor's own insertion path
 * had no way to express it.
 */
function characters(range: Mekor["range"]): string {
  if (!range) return "";
  const { from, to } = range;
  if (from === 0 && to == null) return "";
  return `, תווים: ${typstString(to == null ? `${from}-` : `${from}-${to}`)}`;
}

// ---------------------------------------------------------------- what it carries
//
// A source note's whole value is the half that does not print. `#מראה_מקום` is
// `footnote(text(size: 0.92em, body))` — a footnote, eight per cent smaller —
// and given `מקור:` it also files the canonical ref that `#מראה_מקומות()`
// collects and that lets the document be reprinted in another citation style.
// Written without one it contributes nothing to the index.
//
// Nothing on screen said which kind you were looking at. The inventory's line
// was blunt: *a source note's entire value is invisible*. So it is a question
// that can be asked now, and `sourcenote-lint.ts` asks it on every line.

/** The two spellings of the source-note command. */
const SOURCE_NOTE = ["מראה_מקום", "sourcenote"];

/** One source note in the document, and whether its ref is there. */
export interface SourceNote {
  from: number;
  to: number;
  /** True when the note carries a `מקור:` / `source:` argument. */
  indexed: boolean;
}

/**
 * Every source note in the text, each saying whether it is in the index.
 *
 * Through `scan` rather than a regex, for the reason `spans.ts` exists: the
 * name inside a string literal and the name that is really prose are both
 * things `#\w+` gets wrong. `topLevelColon` is what tells a named argument from
 * a nested call that happens to contain a colon.
 */
export function sourceNotes(doc: string): SourceNote[] {
  const out: SourceNote[] = [];
  for (const n of scan(doc).nodes) {
    if (!SOURCE_NOTE.includes(n.name)) continue;
    let indexed = false;
    if (n.args) {
      for (const g of splitArgs(doc, n.args.from, n.args.to)) {
        const colon = topLevelColon(doc, g.from, g.to);
        if (colon < 0) continue;
        const key = doc.slice(g.from, colon).trim();
        if (key === "מקור" || key === "source") indexed = true;
      }
    }
    out.push({ from: n.nameFrom - 1, to: n.to, indexed });
  }
  return out;
}
