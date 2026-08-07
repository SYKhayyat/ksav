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
export function citationMarkup(place: Pick<Mekor, "display" | "ref">): string {
  const shown = typstContent(place.display ?? "");
  return place.ref
    ? `#מראה_מקום(מקור: ${typstString(place.ref)})[${shown}]`
    : `#מראה_מקום[${shown}]`;
}
