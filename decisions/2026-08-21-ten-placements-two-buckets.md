# 2026-08-21 · Ten placements, two buckets

A collected apparatus — notes gathered into one block at the back of the sefer or
the end of a section, rather than sitting at the foot of each page — was
quadratic in the text collected into it. On a release build:

| notes | words each | before | after |
|---|---|---|---|
| 30 | 24 | 1.41s | **0.88s** |
| 60 | 24 | 5.51s | **1.51s** |
| 120 | 24 | 31.1s | **2.23s** |

Four times the work for twice the notes, then five and a half times. Now 1.7×
and 1.5× — sub-linear, because what is left is a shared cost that amortises.

## The cause

```typst
#let _sf_where(t, g) = {
  …
  if _val(p) == "למעלה" { "למעלה" } else { "רגל" }
}
```

Ten placements, two buckets. The page furniture paints two of them — the band
above the text and the band below it — and the catch-all said `"רגל"` for the
other eight: the back of the sefer, the end of a section, a companion volume,
and the five margin placements.

So a note collected at the back of the sefer was, as far as the page-foot
machinery was concerned, a page-foot note. `_sf_page_streams` filtered on this
function, got every collected note in the document, and ran the placement walk
over all of them — **on every page**. That walk measures each entry to decide
what the page can hold. `_ap_on_page` then filtered them out *after* the
measuring, so nothing appeared and everything had been paid for.

`_sn_tail_pages` had the same hole from the other direction: it handed
`_sf_all()` to the carry walk without filtering at all, so carry pages — what a
note needs when the *page furniture* runs out of room — were computed for notes
that print in the flow, where the flow makes its own pages.

Both are one line. `_sf_where` answers with the placement as it is, and the tail
filters the way its neighbour already did.

## How it was found, and how long it should have taken

Typst records its own spans and this engine already links `typst-timing`. One run
of `examples/timing.rs` said it:

```
func call @ksav.typ:3585  _ap_entry_height   30,348 calls
func call @ksav.typ:3671  _ap_fill            1,620 calls
```

Thirty thousand entry measurements for a thirty-note document, in the page-foot
walk, on a document with no page-foot notes.

**Before reaching for that, five hypotheses were formed and every one was refuted
by measurement:**

1. the per-entry `_ap_origin` state bracket — removing it is *slower*, 12.3s
   against 5.6s, so the guess was backwards rather than merely wrong;
2. the synthetic oblique, which boxes every word — forcing an upright style
   changes nothing;
3. `_nr_numbers` asking `_nr_origin` per entry — a real O(n·m), fixed on its own
   merits, and these documents never reach it because they restart no numbering;
4. the apparatus re-laid once per page of the **document** — the same thirty
   notes in a twelve-page and a thirty-page sefer cost the same;
5. the apparatus re-laid once per page **it** spans — shrinking its type so it
   spans fewer pages made it *slower*, 51s against 31s.

Each of those cost a fifteen-minute release rebuild. The profiler cost one, and
answered it. The lesson is not subtle and is worth writing down plainly: **when
something is slow, measure where the time goes before theorising about why.**
Reading the code found the catch-all in seconds *once the profile said which
function to read*; reading it without that pointed at five wrong places.

## The shape of the bug, which this repository already has a name for

A function that answers a two-valued question about a ten-valued input, with a
catch-all for the eight it does not handle. It is the same shape as
`_rg_height_of` earlier the same day — four readers each deciding for themselves
what counted as a declared height, three of them letting `auto` through — and the
same as every entry in `ksav-girsa-diagnosis-without-sweep`. A default that is
right for the case in front of you and wrong for the ones you did not enumerate.

The correction in both cases is the same: **answer the question that was asked,
and let the caller compare.** `_sf_where` now returns where a stream is painted;
the two callers ask about the end they are painting and the eight placements
drawn elsewhere match neither.
