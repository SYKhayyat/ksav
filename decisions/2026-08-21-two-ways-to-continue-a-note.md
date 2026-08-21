# 2026-08-21 · Two ways to continue a note, and why both stay

A note taller than the region it lives in has to be continued onto the next page.
The engine now has two mechanisms for that, chooses between them per entry, and
keeps both on purpose.

## What was shipped first, and what it cost

The **window**. The note is emitted whole into every page it runs through, and
each page paints all but its own share outside the slot — `move` shifts paint and
not layout, so the block stays put and the content slides up inside it. Page two
resumes exactly where page one stopped, to the point.

It has one property nothing else has: it is exact on **any** content. A table, a
figure, a nested apparatus — none of them has a seam, and the window does not
need one.

It also has a cost that was written down at the time and left standing:

> The whole note is emitted into every page it runs through and only masked.
> Text extraction, copy, and Ksav's own search of the printed page see it once
> per page.

That is not cosmetic. A four-page note is in the PDF's text layer four times.
Ctrl-F finds it four times, a copy-paste of pages 2–3 yields the whole note
twice, and the DOCX export carries every repeat. The page looked right and the
*document* was wrong — which is this repository's recurring bug family, the
working engine behind a surface that lies.

## What was added

The **cut**. Each page carries only its own words, via `_ct_fit` — the same
binary-search-over-`measure` primitive the berech is built on, the one
benchmarked in `the-route-to-watch-was-not-the-risk` and found to cost nothing
warm. `_ct_pages` turns a body into one slice per page; the renderer draws slice
*k*, where *k* falls out of the offset the walk already computed.

Measured on `giant_spill`, a fifty-word note in a 1.2cm region:

| | before | after |
|---|---|---|
| words in the text layer | 100 (fifty, twice) | 50 |
| note number printed | once, then slid off | once |
| lines painted outside the slot and clipped | 2 | 0 |

## Why the window stays

Because Typst has no general content-to-string. `_ct_text` recovers the words
from a `text` element and from a `sequence` of `text` and `space`, which is what
a note body usually is — and answers `none` for everything else. A body with one
bolded word in it is already `none`.

So the choice is per entry: cut where there are words, window where there are
not. A partly cut body would drop whatever could not be sliced, and that is the
failure the whole mechanism exists to end, so it is all or nothing per note.

`a_body_that_cannot_be_cut_is_still_spilled_by_the_window` is the window's own
test, and it asserts the cost as well as the behaviour — the whole note on both
pages, and the slot-exact step between them. Asserting the cost is how it stays a
known trade rather than something rediscovered in a year.

## Three things that had to be got right, and were nearly not

**The measurement has to be in the apparatus's own typography.** `_ct_fit`
measured at whatever was ambient. An apparatus is set at 0.85em of the body, so a
prefix measured at 12pt and printed at 10.2pt is measured at the wrong size and
the cut lands in the wrong place. `עטיפה` is how the caller says how this text is
set, and it is not optional decoration.

**The first slice is not set like the others.** It carries the note's number, and
often an address and a lemma before that. Measuring every slice as if it were
bare makes the first one a few words too generous — and a few words too generous
is one line past a region that clips, which is the silent truncation being fixed.
So `עטיפה` takes the slice index too.

**The walk and the renderer have to count the same way.** The walk decides how
many pages a note spans; the renderer decides what goes on each. They divide
differently — the window's count is height over slot, the cut's is however many
slices there turn out to be, and `ceil` on the height rounds a note that ends a
third of the way down a page up to a whole one. Counting it in the walk the same
way the renderer will cut it is what keeps a document from reserving a page that
comes out empty.

## The bug this uncovered on the way past

The offset used to be applied to the **group** — every entry in a region slid
together. A continuation page's region can hold the spilling note *and* a note
that begins on that page, and the second one is not spilling: it was slid off the
slot with the first. Moving the decision into the entry fixed it, and no test had
ever asked.

## What is still open

A note whose body is words **and one bolded word** falls back to the window,
because `_ct_text` refuses anything with structure in it. `meander`'s
`bisect.typ` recurses into nested content, and that is the next thing worth
taking from it — recorded in `a-layout-engine-with-no-direction` and not built
here.

## The two knobs

Both are a region's, beside the other overflow settings, because both are
judgements about *this* sefer:

- **`תפר`** — how far back the cut may look for a better seam, in words. A
  paragraph break four words earlier is worth taking and one forty words earlier
  is a hole in the page. Eight, which is what it was as a constant.
- **`סימן_בהמשך`** — whether a continued note carries its number again. `false`,
  which is how a continued note has always been set, and also what the window
  does on its own, so the two mechanisms agree on the page without being forced
  to.
