# 2026-08-20 · A note cannot place itself

The first five items of `NOTES-PLAN.md` Part 7 — the bugs, which are independent
of every decision in the plan. Four of them turned out to be one finding said
four ways, and the fourth is the one that reorganised the apparatus.

## The finding

**A sidenote was doing its own layout from inside the sentence it was written
in, and that is not a thing a sentence can do.** Everything below follows from
it.

## 1 · Every side note added about 20pt to the body around it

`sn_p_none` against `sn_p_note` — one paragraph, twice, the second with two
sidenotes in it:

```
no notes    78.79  95.71  112.63  129.55       ← 16.92pt apart, ordinary leading
two notes   78.79  95.71  132.43  149.35 …     ← 36.72pt at each note
```

`_sn_note` did its placement inside `layout(sz => …)`, and `layout` is
block-level: called from the middle of a paragraph it ends the line it sits on.
Isolated against raw Typst in `lay_none` / `lay_bare` / `lay_boxed`, which is
where the plan left it.

This is the **third** instance of the class in this repository. `e0bd3f3` is
*"Italic was a block, so every emphasised phrase broke its own paragraph"*. The
lesson was written down and applied to `#נטוי`, and never swept.

**And `place()` is the same** — measured here and not previously recorded: three
bare `#place(dx: 10pt, dy: 5pt)[X]` calls in one paragraph took it from 16.92pt
leading to 39.24pt. The plan suspected it; this is the number.

## 2 · Boxing the call fixes the paragraph and breaks the placement

`box(layout(…))` restores the body exactly — 78.79 / 95.71 / 112.63 / 129.55,
byte-identical to the paragraph with no notes — and the boxed call still receives
the enclosing column's width (293pt inside `#עם_הערות_צד` on A4, identical to the
bare call). Both halves of the plan's proposed fix are confirmed.

**It also moves every note off the paper sideways.** `place` inside a box anchors
to the box, and the box is wherever the marker happens to sit in the line, so the
notes went to **x = −73.6** on a 595.28pt page. The plan's one-line fix is right
about the paragraph and wrong about the page, and only a rendered measurement
says so: the document compiles, the body is perfect, and the notes are off the
left edge.

## 3 · So the column is drawn by the page, not by the note

The two things a note cannot do from inside its own sentence are *not break it*
and *reach the next page*. `place(dy:)` moves within the page it is on, which is
why the column simply grew off the sheet — `dense.ksav`, max y **827.27** on an
841.89pt page, over the page number and into the border no printer will mark.

The apparatus now works the way the per-page bands already did:

- `#הערת_גיליון` contributes **only** its marker and one `metadata` element.
- `#עם_הערות_צד` still reserves the empty column, and now also records *how many*
  columns and on which sides (`_sn_shape`).
- `#מסמך` installs `_sn_page_column()` as the page **foreground**, unconditional
  and read-only, exactly as it installs the header and the page bands. It renders
  nothing for a document with no side notes.
- One walk, `_sn_placed` → `_sn_assign`, decides where every note goes, in page
  coordinates, and both callers go through it. Two copies of a greedy stack that
  disagree by one gap is a note printed on top of its neighbour.

That also moved the renderer above the document wrapper in `ksav.typ`, because a
Typst closure resolves its names where it is written: a renderer defined after
`#מסמך` is not there when `#מסמך` runs. `_pp_page_bands` sits above the wrapper
for the same reason, so this is that convention rather than a new one.

### What it buys

| | before | after |
|---|---|---|
| `dense.ksav` max y | **827.27** on an 841.89pt sheet | **799.02** — the page number, and nothing below the text area |
| `dense.ksav` notes printed | 20, three of them off the paper | 20, on two pages |
| body leading around a note | 36.72pt | 16.92pt, the same as everywhere else |
| note column x | 214.3, then −73.6 when boxed | 70.9 — the left margin |

Clamp, two-directional shift, cascade and **spill** are all in the one walk.
Spill is the default (decision 15) and it is cheap here for the reason the plan
gives: the next page's column already exists and is already empty.

## 4 · A note that spills off the end of the sefer

Spilling into the next page's column works right up to the last page, where there
is no next one. Twenty dense notes on a one-page document lost three: no error,
no warning, no gap on the page. `#מסמך` therefore appends exactly as many pages
as the carry needs, after the body — only ever after, so nothing in front of them
moves, so the assignment is the same on the next pass and asks for the same
number of pages.

**And it did not work, for a reason worth writing down.** On the first layout
pass no note has a position, so the walk asks for no pages. The positions arrive
on the next pass — but Typst only runs another pass when something it *watches*
changed, and a `pagebreak()` is not watched. Neither is a `metadata` value, nor a
new label: measured, the walk computed `last=1 want=2` and the pages never
appeared. What is watched is the laid-out frame, so the answer is written into
one — `place(hide[#want])`, a hidden numeral whose glyphs differ exactly when the
answer does, out of the flow so it costs no space.

## 5 · Config-driven slant renders

`emph` is a request for an italic face and the bundled Hebrew families ship none,
so `text(style: "italic")` comes back upright. `#נטוי` has sheared the frame into
a synthetic oblique for months; nothing else did.

**Five sites asked the dead way, not the four the plan names.** The fifth is
`_mk_render`, and it is the one a reader sees: `#גמרא`, `#פסוק` and `#ציון_מקור`
ship `סגנון: "italic"` as their *default*, so three of the eight mark classes
have promised an italic since they were written and never once printed one.
`_ap_wrap` is every banded apparatus (whose shipped ramp slants every tier below
the first), `_fn_wrap` every footnote tier, `_sn_wrap` the side column, and the
heading rule slants every level past six — which was the whole of what
distinguished level seven from level six.

There is now one `_ks_skew`, `#נטוי` is a caller of it, and `_ks_style` is what
every `סגנון` value goes through. `"נטוי"` is accepted beside `"italic"`, because
a Hebrew document asking for a slant in English was the odd thing.

`k_slant_a` against `k_slant_b`, and `mk_slant_a` against `mk_slant_b`, now
differ. Both had to be read with **svgdump**: `probe` cannot see a fill or a
shear and answers *no difference*, which is what a passing test looks like.

## 6 · `ריווח` is live, and Typst made it expensive

`#הגדרות_הערות(ריווח:)` was declared, documented, and read by nothing.

The gap between two footnote entries is `footnote.entry(gap:)` and Typst resolves
it **at page level**. Everything else was measured and leaves it at exactly
16.93pt:

| attempt | result |
|---|---|
| `#set footnote.entry(gap: 6em)` in the document body | 16.93pt |
| `clearance`, `indent`, in the body | 16.93pt |
| `show footnote.entry: set block(spacing: 6em)` in the body | 16.93pt |
| the command emitting its own `set` | 16.93pt |
| a `show footnote.entry` in `#מסמך` wrapping the entry in `block(spacing: 6em)` | 16.93pt |
| `#מסמך`'s own `set`, inside a `context` so it could read the writer's value | 16.93pt |
| `#מסמך`'s own `set`, at its own top level | **78.73pt** |

And that last level cannot read a state the body sets, because reading one needs a
`context` and the `context` is what breaks the reach.

So the writer's gap is **drawn** rather than set: the difference between what they
asked for and what the document already spaces entries by, added under the entry's
own last line — under and never over, because a footnote entry lays out as
«number» «body» and anything block-level at the start orphans the number. It may
be negative, which is what lets `ריווח: 0em` tighten a document whose default is
looser. Read per note at the note's own call site, so a sefer may change it at
siman ten and mean it — which is more than Typst's own setting can do.

`gap_0em` now spaces entries 8.26pt apart and `gap_6em` 69.46pt. They were
byte-identical.

### What a rendering slant broke, and what that says about the readers

A slant is drawn by shearing each **word** into a box of its own, because a
sheared frame is a block and one box around a passage is an unbreakable slab. So
the moment configuration-driven slant started rendering, an apparatus entry
stopped being one text run and became one run per word — and two things that had
been reading the page for months turned out to depend on it being one run.

**`notemarks` lost every slanted note's marker.** It pairs a marker — generated
text, which resolves to no place in the writer's file — with the writer's own
prose beside it, and its pending state deliberately did not cross a frame
boundary. The prose is now *inside* a child frame, so there was nothing beside
the marker at all. The rule it was protecting against is a marker leaking
*sideways*, into the apparatus at the foot of the page. Both hold if the pending
is cleared when a frame **ends** rather than when one begins: the first child may
consume what its parent left waiting, and no later sibling can.

**`probe::Line::contains` asked the wrong object.** It looked inside a single
run, so a phrase that is a run per word was not on the page as far as any test
was concerned — and this was **already true of `#נטוי`**, months before tonight.
`Line` now carries the line's text in reading order, taken as the runs arrive
and before they are sorted by `x`, and `contains` asks that.

Reading order is walk order, which is the fact `pagetext` — the printed-page
search — is built on, and it is why that feature was **not** affected: Typst lays
a paragraph out in logical order and expresses bidi as positions. Checked rather
than assumed, because *"search cannot find italic words"* is exactly the kind of
thing that would have shipped silently.

## 7 · The fence, and why the old one could not have caught any of this

`inline_text.rs` already held *"no command breaks the paragraph it was written
in"* — over the `style` category, which has eighteen commands.
`#הערת_גיליון` is in `footnote`, which has forty-two.

That is `ONLY_AT_TOP` again: a fence scoped to the category the bug was reported
in cannot fail for the reason it was written under, because the sibling it was
meant to catch is one category over. The filter is gone; the fence now asks the
**whole registry**, and carries two declared lists — commands that are
block-level on purpose, and snippets it cannot exercise — so that a command going
quiet is never read as a command behaving.

## 8 · The other half of thing four: the page footer

`boxover` was the plan's `[X]` for *"boxes overflow at nine"* — twenty notes,
**nine distinct positions**, the other eleven printed on top of each other and
the last of them past the page number at y=802.57. A study of a real published
sefer measured five times more note text than body text, so a mechanism that
holds nine of them is not failing at the margins; it is failing at the normal
case.

The footer renders *the notes registered on this page*. It had to render *the
notes assigned to it* — that is the whole change, and it is one word.

**Why this converges where three other systems hang.** Typst's own footnote spill
had an infinite-loop bug, SILE's parallel package hangs when one side overruns,
and talmudifier pays five minutes a page. Every one of them fails because the
region *grows*: a taller band means less text, a different break, different
notes, a different height. **This region does not grow.** Its height is
`#מסמך(אזור_הערות:)` — *declared* — so moving a note from one page to the next
changes nothing about the text area, moves no page break, and cannot change which
notes are anchored where. `_ap_assign` is one forward walk and gives the same
answer on every pass.

Each group's capacity is its own declared slot when the apparatus sets fixed band
heights, and otherwise the whole reserve, which the groups share in the order
they are written. A note taller than the whole region is placed and clipped
rather than carried for ever: clipped is visible, carried is a note that was
written and never printed.

| | before | after |
|---|---|---|
| `boxover` | 1 page, **9** of 20 notes, max y **802.57** | 3 pages, **20** of 20, max y 799.02 |
| `compose_long` | 1 page, 9 of 30 ShT, max y **802.57** | 4 pages, **30** of 30, max y 799.02 |

`compose_long` is `NOTES-PLAN` Part 3's design C at length — *"the one thing it
lacks"*, in the plan's own words. It does not lack it now.

The carry off the *end* of the sefer goes through the same tail as the side
column's, and deliberately so: the question is *how long the document is* and
there is one of those.

## 9 · What a rebuilt apparatus broke, and what each break was worth

Everything below was found by the suite, and every one of them is a place where
something had been reading the page and had quietly depended on the old shape.

- **An editor's comment collected and was never drawn.** Comments ride the
  sidenote engine — four streams, not three — and my renderer knew about three.
  It also passed its pencil in as a closure, which cannot travel in a note's
  metadata, so what travels now is the *kind* and the marker is chosen from it.
- **The prelude printed a stray `}`.** A brace left over from the old nesting, at
  markup level in a file that is markup by default. An `#import` ignores it; the
  **exported** `.typ`, which inlines the prelude, printed it as text on page one.
  Only `assemble.rs` could see that, and it did.
- **A weak page break stopped being dropped**, because the tail hook emitted a
  hidden numeral into every document rather than only the ones with side notes.
  One measured instance in the suite; it would have been every sefer with a
  deferred section and no side notes.
- **`the_configured_width_is_the_width` was passing on the defect.** It asked
  whether a wider ratio moves the body, on a document of one short line — whose
  left edge in a right-to-left page is set by how wide the words are, not by how
  wide the column is. It only ever passed because the sidenote broke the
  paragraph into pieces whose positions did depend on the column.
