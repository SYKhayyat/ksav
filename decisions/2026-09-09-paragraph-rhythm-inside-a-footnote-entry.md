# 2026-09-09 · Paragraph rhythm inside a footnote entry

Fixes #41. `#הגדרות_הערות(ריווח_פסקאות:)` sets the spacing between the
paragraphs *inside* a multi-paragraph native footnote entry — the normal case in
a sefer, where a note runs several times the body — leaving the gap *between*
entries (`ריווח`) and the document's own paragraph spacing untouched. `none`
(default) is a byte-identical no-op; the value follows the tuple convention
(`(none, 1em)` spaces tier 2 only).

The interesting half is the mechanism, because the obvious one does not work on
this engine.

## What the community idiom does here

The Typst-forum answer to "space the paragraphs of one footnote" is
`#show footnote.entry: it => [#show par: set block(spacing: …); #it]`. Measured
on this engine it does nothing: even `5em` leaves the entry's paragraph gaps at
the document's own value. The footnote area resolves at page level, and
`block(spacing:)` is exactly the lever the gap note at `_fn_wrap` had already
measured dying there. The same is true of a scoped `set block(spacing:)` and of
wrapping the entry in a `block(spacing: …)`.

`par(spacing:)` — the same lever `#מסמך` uses for the document's paragraph
spacing — does reach the entry. So the setting is applied through a
`#show footnote.entry` wrapper whose body is `[#show par: set par(spacing: r);
#it]`.

## Two scoping traps, both measured

- **A `set` or `show` written at the start of the entry content orphans the
  number** onto a line of its own — the block bug this file has documented three
  times. Wrapping the *whole entry* (the `footnote.entry` show rule) keeps the
  number glued; scoping per note does not.
- **A `show` does not propagate from a function body the way a `set` does.**
  `#הגדרות_הערות` emits `set footnote.entry(gap:)` at its own body level and it
  reaches the caller; the same `show footnote.entry:` emitted from the same
  place scopes to the function's own block and does nothing at all. The wrapper
  is therefore registered in `#מסמך`, whose block IS the document.

## How a per-entry, per-tier value rides one global rule

The wrapper runs at page level and cannot see a tier. The note knows its tier,
so `#הערה_בדרגה` updates a state (`_fn_rhythm`) to its own `_fn_pick`ed value at
creation, and the wrapper's `context` reads it back. The read resolves per entry
at creation, not per page at layout — verified by two entries with different
values rendering each its own. Nesting works because the inner note re-arms the
state for itself and the outer note's update runs after its body was evaluated.

## The byte-identity promise

A document that never mentions the knob — or a tier asked for `none` — renders
byte-identically to one written before it existed. The wrapper is registered on
every document (it lives in `#מסמך`), so the default has to be a true no-op and
not merely an unset one: `_fn_rhythm_wrap` returns the entry untouched when the
state is `none`, and `the_untouched_paragraph_rhythm_is_byte_identical` diffs the
whole page (position, size, text of every run) against the no-config render.

## Tests

Four new fences in `notes_acceptance.rs`: the byte-identity promise; the knob
spacing the paragraphs while `ריווח` (the inter-entry gap) is unchanged; the
per-tier tuple reaching tier 2 and not tier 1; and a long multi-paragraph entry
still splitting across pages under the rhythm, nothing below the page number.
`settings_live.rs` now exercises `ריווח_פסקאות` too — its `_fn_defaults` document
gained a multi-paragraph note, because a document of single-paragraph notes
renders every value of the knob identically. The engine's 980 tests became 984;
editor assertions move to 7,585, because this record itself adds a page for the
documentation fence to check.