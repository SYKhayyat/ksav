# The page-foot slot: what `שומר_מקום` was standing on, and why it does not hold

A message to the session that built and reverted `שומר_מקום` on the night of
2026-08-21, written 2026-08-21 from a parallel session.

It has two halves. The first is about the knob you reverted: **you were right,
and your own diagnosis was stronger than the conclusion you drew from it.** The
second is about what turned up underneath while checking it, which is a larger
problem than the knob and is the reason this file exists.

Every number below came from `cargo run --example probe` or `--example svgdump`
on a document I can hand you. Reproductions are at the end.

---

## Read this before trusting any single number

**You were editing `ksav.typ` while I was measuring it.** At the time of writing
the tree is `61a3779` plus **782 uncommitted insertions and 119 deletions** in
the prelude, mtime moving minute by minute — and your new untracked corpus files
say what you are on: `hold_yes.ksav` / `hold_no.ksav` (`שומר_מקום`, being rebuilt)
and `ov_clip` / `ov_shrink` / `ov_runin` (overflow moves). Some of what follows
may already be answered by work I could not see.

That is not a complaint, it is a caveat with teeth. The same file measured twice
inside the same minute gave me two different answers:

```
tests/notes-corpus/spill/giant.ksav   06:04:0x  →  maxy 835.77
tests/notes-corpus/spill/giant.ksav   06:04:34  →  maxy 961.47
```

Identical bytes, identical command. So:

- **The qualitative findings held in both states** and are what this document is
  for: the giant note is not carried (all 60 words on page 1, with page 2 free,
  in both readings); `rg_h` and `rg_none` are identical in both readings; a
  region's declared height is honoured when occupied in both readings.
- **The absolute point values did not hold** and should be re-measured, not
  quoted. Where I give a `maxy`, treat it as "past the page number" or "off the
  sheet" rather than as a figure.

Every claim here is re-runnable from `tests/notes-corpus/spill/`. Re-run it
against your own tree before acting on it. If a number disagrees with yours,
yours is probably the newer one.

---

## Summary

1. The revert was correct. For a single page-foot region the setting is not
   undemonstrated, it is **undemonstrable** — no corpus document could ever show
   it working, so the next person should not go looking for one.
2. Underneath it: **`#אזור(גובה:)` is ignored entirely when the region is empty
   on a page.** Not your bug — it arrived in `14d827e` on 13 August. But it is
   why your four documents were flat, and it means the "hold the space" side of
   your switch does not currently exist for region-declared heights.
3. Underneath that: **a note taller than its slot is not carried to the next
   page.** It is not clipped-and-warned, not spilled, not refused. The reader
   loses it, silently, with an empty page available next door.
4. The cause is the **surface**, not the policy. `_ap_slot` draws into the Typst
   page footer, which is redrawn per page and has no continuation. `"עמוד_הבא"`
   and `"דחיסה"` both move an oversized note by exactly zero points.
5. Typst's **native footnote area does flow**, including a single oversized entry
   and including stacked bands inside one entry. Splitting is not a thing that
   has to be invented.
6. **Shaul's decision: it must work.** Not refuse-at-compile-time, not
   grow-and-warn. The content must reach the next page. **Four** routes to that
   are costed in Part 6; the choice between them is his, not ours. If he wants a
   starting point rather than a menu, Route D gives up least — and one of its
   pieces is four lines of Typst.

---

## Part 1 · Your revert was right, and for a stronger reason than you gave

Your note says the four documents were flat because "a page-foot region's space
comes off the bottom margin and collapsing the block inside the reserve frees
room that nothing else uses."

That is correct, and it is a complete impossibility proof rather than a failed
experiment. `אזור_הערות` takes the reserve off the bottom margin **once, at
document level, for every page** (`ksav.typ:4136-4141`), and the apparatus
renders in the footer, inside that margin. The text area's height is a
document-level constant. Nothing a block does inside the footer can change it.

Measured, in raw Typst, so the mechanism is visible without Ksav in the way:

```
footer: [#block(height: 100pt)[] #block[LOWERBAND]]   →  LOWERBAND y=914.60
footer: [#block(height:   0pt)[] #block[LOWERBAND]]   →  LOWERBAND y=814.60
body in both cases                                    →  BODYWORD  y= 78.79
```

The body does not move. It cannot. Two consequences worth writing into the
record, because your note currently implies the opposite:

- **"When it is built it needs a corpus document that shows the difference"** is
  not achievable for a single page-foot band. Whoever picks that up will spend
  the time discovering it is impossible. For *stacked* regions a corpus document
  is trivial — the files at the end of this took five minutes — so the sentence
  is true of one case and false of the other, and it currently reads as one case.
- The footer **is** top-anchored, so the "upper region empty, lower should rise"
  intuition was right. The 100pt collapse above moves the lower band by exactly
  100pt. Your case did not reproduce for a different reason, which is Part 2.

---

## Part 2 · Why your four documents were flat: `#אזור(גובה:)` is dead on an empty page

Two page-foot regions, upper one empty, `probe`:

```
rg_both      no heights, both occupied        UPPER 719.62   LOWER 742.43
rg_full40    #אזור(גובה:  40pt), occupied     UPPER 716.98   LOWER 770.42
rg_full200   #אזור(גובה: 200pt), occupied     UPPER 716.98   LOWER 930.42
rg_h         #אזור(גובה:  60pt), EMPTY                       LOWER 719.62
rg_none      no height,          EMPTY                       LOWER 719.62
```

`rg_full200` minus `rg_full40` is **exactly 160pt**, so a region's declared
height is honoured precisely when the region has content. `rg_h` and `rg_none`
are **identical**, so it is ignored entirely when the region is empty.

Cause, from `_sf_page_streams` at `ksav.typ:2934-2938`:

```typst
let fixed = _sf_cfg.get().at("גבהים", default: (:)).keys()
let streams = _sf_order(_sf_cfg.get(), present + fixed.filter(s => not present.contains(s)))
```

The re-add that keeps an empty slot alive reads the **stream** height dictionary.
A height declared on `#אזור(גובה:)` lives in `_rg_rec` and never enters that
list, so the region has no member in `streams`, never enters `regions`, and
`_ap_bands` never calls `block_of` for it. `_ap_slot` is never reached — which is
why nothing you did to `_ap_slot` could show up on any document.

So the switch offered a choice between two behaviours when only one of them
exists. For a region that declares its own height, the "hold the space" side —
the default, and what the comment at `:2935` asserts, *"so a stream never drifts
into another's place"* — is not happening today, with no setting involved.

**Three things follow.**

- The slot machinery you were building on is not from your wave. `_ap_slot`,
  `_ch_region_height` and the `fixed` re-add all arrived together in **`14d827e`,
  13 August**, 147 commits earlier. The occupied case has worked since then and
  you did not disturb it. The empty-region gap is that commit's.
- Your proposal to extend `settings_live.rs` to the region keys is therefore not
  a fence for a future knob. **It fails on the tree as it stands.** That makes it
  the first thing worth doing, and you had already identified it as the more
  valuable half.
- You predicted your own blind spot exactly — `_rg_own`'s keys hang off `#אזור`
  rather than living in a `_X_defaults` dictionary, so the sweep walks past them
  — and then landed in it. The prediction is worth keeping in the record; it is
  the reusable part.

**Severity, from Shaul: low.** Nothing is lost and the body does not move. The
only consequence is a band sliding up on pages where its neighbour is empty.
Drift, not truncation. Do not spend a night on it.

---

## Part 3 · The larger problem: a note taller than its slot is not carried

Overflow **between** notes works, and works well. Twenty notes into a
`גובה: 60pt` region:

```
ov_plain  (60pt slot)          pages=3   20/20 rendered   maxy=799.02
ov_next   (+ גלישה עמוד_הבא)    pages=3   20/20 rendered   maxy=799.02
ov_free   (no declared height)  pages=3   20/20 rendered   maxy=799.02

page 1: notes 01–09      page 2: notes 10–18      page 3: notes 19–20
```

In order, all twenty present, nothing past the page number at 799.02. The
assignment walk carries whole notes forward and it is correct.

Overflow **within one note** does not work at all:

```
one ~160pt note into a גובה: 40pt slot        →  pages=1   maxy=961.47
  the same + גלישה: "עמוד_הבא"                 →  pages=1   maxy=961.47
  the same + גלישה: "דחיסה"                    →  pages=1   maxy=961.47
  the same, mid-document, page 2 available     →  all 60 words on page 1, maxy=961.47
```

Sheet height is 841.89pt. Neither spill policy moves the note by a single point,
**not even when there is a free page immediately after it**. That last line is
the important one: this is not "there was nowhere to go."

`svgdump` shows a real clip rectangle of exactly the declared height —
`<path d="M 0 0h 453.54v 40h -453.54Z"/>`, present with `גובה: 40pt` and absent
without it — so the overhang is masked rather than merely drawn past the edge. I
could not cleanly establish from the SVG nesting which glyphs fall inside that
clip group, and it does not change the verdict either way: **the reader does not
get the text, and nothing says so.**

This is the second member of a class, not a one-off. `spanning.ksav` in
`notes-corpus` is the first: a footnote entry containing nested notes cannot
split, and runs to y=1477.69 on the same 841.89pt sheet. Its control,
`spanning_flat.ksav`, is the same band at the same length with no nesting, and
splits correctly at 799.02. Same shape: **an item that cannot be divided is
placed whole, wherever that lands.**

---

## Part 4 · Why: the footer cannot flow

`_ap_slot` (`ksav.typ:2043`) is

```typst
context block(width: 100%, height: _ap_fixed_height(h), clip: true, body)
```

drawn inside the Typst **page footer**. A footer is composed from scratch on
every page. It has no continuation, no "rest of this block goes on the next one."
There is physically nowhere for the second half of a note to land.

So `גלישה` is not missing a case. It is pointed at a surface that cannot honour
any answer it gives. Adding a seventh overflow move would not help; the six that
are refused by name in your own note are refused for a reason that sits one layer
below all of them.

Two corollaries:

- `clip: true` is what makes the failure **silent**. Without it the note would at
  least be visibly wrong. With it, it looks like a short note.
- `#אזור(גובה:)` reads to a writer as a reservation and behaves as a suggestion.
  That is the specific thing Shaul objects to: *the feature must not promise
  something it cannot do.*

---

## Part 5 · What does flow: the native footnote area

Typst's own footnote stream splits, for free, and it splits more than I expected.
Three measurements, all on a deliberately short 300pt page so the split is forced:

**One oversized entry splits mid-note.**

```
one 80-word native footnote, 300pt page   →  pages=2   80/80 words   maxy=257.13
   page 1: מילה01 → מילה37
   page 2: מילה38 → מילה80
```

**Stacked bands inside one entry also split, and across more than two pages.**

```
two bands (A then B, divider between) in ONE native footnote entry, 300pt page
   page 1: BANDA 36 words
   page 2: BANDA  4 words, BANDB 36 words
   page 3: BANDB  4 words
   80/80 words, maxy 257.13
```

That second one is the load-bearing result. The multi-band page-foot apparatus —
the thing regions exist to build — is structurally capable of living in the
native stream and flowing correctly. The band boundary survives the split; band B
simply starts where band A finished.

**And a whole band splits**, which `spanning_flat.ksav` already established at
799.02 on a normal sheet.

### The wall that is still there

Typst has **exactly one** native footnote area. So one page-anchored stream can
flow; a genuinely independent second one cannot. That is unchanged, it is the
same constraint design B in `NOTES-PLAN` ran into, and no amount of cleverness
moves it. What the second measurement shows is that the constraint is **weaker
than it looks**: several *bands* can share the one stream and still split. It is
one *area*, not one *band*.

---

## Part 6 · Three routes, and what each actually costs

Shaul's instruction is that the content must reach the next page. All three of
these do that. They differ in what they give up.

### Route A — re-base the page-foot apparatus onto the native footnote stream

Typst does the splitting. This is mostly **deletion**:

- `_ap_slot`'s `clip: true` goes; clip is what makes the loss silent.
- `_ap_on_page`, the per-page assignment walk, stops being needed for the flowing
  region. Typst assigns. That whole mechanism is replaced by the engine doing it.
- `אזור_הערות`, the document-level bottom-margin reserve, stops being needed for
  that region — the native area takes its own space out of the text block, per
  page, by how much it actually needs. Which also dissolves Part 1 entirely, and
  with it the `שומר_מקום` question: there is no fixed reserve left to hold or
  release.

**What it costs.** The apparatus is currently built by *querying* which notes are
on a page and drawing them in the footer. Native entries appear in **source
order**, which `nest.ksav` already showed produces interleaving — MB, ShT, MB,
ShT — rather than pooling into bands. Getting bands back means getting all of a
page's notes into one entry, and the only way `NOTES-PLAN` found to do that is
design A's **pinned page breaks** (`pinned.ksav`), which works and requires the
writer to declare the breaks. That is not acceptable for general writing.

So Route A is clean where the apparatus is one band and unsolved where it is
several. **I have not found a way to get automatic band pooling in the native
stream.** Anyone who claims Route A is a small change should be asked this
question first.

### Route B — spill inside the footer, with two windows onto the same content

The footer cannot continue a block, but nothing stops the *same* content being
drawn twice through two different windows. Page N shows the first 40pt; page N+1
draws the identical content shifted up by 40pt inside its own 40pt window.

Measured, and it is exact:

```
page 1   #block(height: 40pt, clip: true, LONG)                    → LONG paints from y=101.11
page 2   #block(height: 40pt, clip: true, move(dy: -40pt, LONG))   → LONG paints from y= 61.11
```

Exactly 40pt of shift. The second window resumes precisely where the first
stopped, with no slicing of content, no measuring of where a word boundary falls,
and no risk of cutting mid-glyph. It works on any content, including a table or
an image that no word-level split could handle.

**And it holds in a real page footer, not just as a standalone block.** A footer
that reads its own page number and shifts by `40pt * (p - 1)`:

```typst
#set page(footer: context {
  let p = here().page()
  block(width: 100%, height: 40pt, clip: true, move(dy: -40pt * (p - 1), LONG))
})
```

```
page 1: window paints from y=800.20
page 2: window paints from y=760.20      ← exactly 40pt higher
```

The block stays at the same footer position on every page; only the content
inside it moves. So page 2's window shows the slice that page 1's window ended
on. This is the whole mechanism, and it is four lines.

**What it costs, and this is not small.** `probe` shows the *entire* note on both
pages, because the full content is emitted into every frame and only masked. In
the PDF that means:

- text extraction, copy, and **Ksav's own "search the printed page"** (`c7a49a9`)
  see the whole note on every page it continues through;
- screen readers read it repeatedly;
- DOCX/HTML export has no clip to honour, so the note comes out duplicated — and
  this repository is named for the preview not lying;
- file size grows with each continuation.

Visually perfect, structurally dirty. It is a real b'dieved and should be
labelled as one if it is chosen.

### Route C — measure and cut the body

Binary-search the note's body for the largest prefix that fits the remaining
slot, render that prefix on page N and the remainder on page N+1. `measure()`
returns real geometry at compile time (`measure.ksav`: `height=210.96pt
width=360pt`), so the search is available in Typst itself.

**What it costs.** Content cannot be sliced arbitrarily in Typst — you can only
cut at a boundary you can express, which in practice means words in a text body.
A note containing a table, a figure or a nested structure has no such boundary
and falls back to one of the other routes. Plus O(log n) `measure` calls per
split, on every layout pass.

Cleanest output of the three. Narrowest applicability.

### Route D — A and B composed: native stream for the primary band, windowed box for the secondary

This is design C from `NOTES-PLAN` (`compose.ksav`, `compose_long.ksav`) with
Route B bolted onto its weak half, and it is the one I would put in front of
Shaul first.

Design C already puts the run-in Mishna Berura in the **native footnote area**
and Shaar HaTziyon in a **box below it**, with two independent counts — and it
measured `maxy 802.57` on the same content that ran design A to `1477.69`. Its
one remaining defect is `boxover.ksav`: the box caps at nine notes and the rest
overprint.

Route B fixes exactly that box. So:

- the **primary** band flows natively, for free, with a clean text layer;
- the **secondary** band flows by two-window continuation;
- band pooling survives, because the two bands are on different surfaces rather
  than fighting for order inside one stream;
- the duplicated-text cost is confined to the smaller apparatus, instead of
  applying to the whole page foot.

**Status: composed from two halves that are each measured, not itself measured
end to end.** I built a partial version — 30 native footnotes plus a windowed
footer box over two pages — and it compiled and paginated, with the visible
window landing clear of the lowest native entry on both pages (MB ends at
`y=700.16`, the visible ShT window sits at `729.34`).

**The real risk it carries, stated plainly.** The native footnote area *grows*
with how many notes land on a page; the footer window is at a fixed position. A
page with enough primary notes will push the native area down into the window.
That is not a new problem — it is the two-apparatuses-share-one-reserve question
that `אזור_הערות` already exists to answer, and `NOTES-PLAN`'s page-foot reserve
section is about. But Route D makes it load-bearing rather than theoretical, and
it needs solving before this ships. Do not treat the two-page trial above as
evidence that it is safe; it is evidence that it is worth pursuing.

### The honest comparison

| | splits any content | clean PDF text layer | keeps band pooling | work |
|---|---|---|---|---|
| A · native stream | yes | yes | **only for a single band** | medium, plus an unsolved problem |
| B · two windows | yes | **no — duplicated text** | yes | small |
| C · measure and cut | **text only** | yes | yes | large |
| D · A + B composed | yes | partly — duplication confined to the secondary band | yes | small–medium, plus the reserve-collision question |

No route is clean on all three columns. That is the actual state of the problem
and it should be put to Shaul that way, rather than as a recommendation dressed
up as a finding — but if he wants a starting point rather than a menu, **D is
the one that gives up least**, and its unknown is a question this repository
already has to answer for other reasons.

---

## Part 7 · Instrument warning, third instance

`probe` reads **frame items**. `clip: true` is a paint operation. So a clipped
note reports its full extent — `y=961.47` — and looks identical to a note drawn
past the page edge. I reported it as "drawn through the bottom of the paper"
before checking, and that was wrong; `svgdump` shows the clip rect.

This is the third time this exact disease has bitten in this area, and the
`notes-corpus` README already documents the other two:

1. **Colour** — `probe` cannot see `fill`, and reported a live setting as dead.
2. **`y=` field-splitting** — `y={:7.2}` is right-aligned, so `awk '{print $2}'`
   silently reads `x=` for any y ≥ 1000, under-reporting exactly the catastrophic
   overflows the runner exists to find.
3. **Clipping** — `probe` cannot see `clip`, so masked content and overhanging
   content are indistinguishable.

It bit a **fourth** time in the same afternoon, on Route D. Measuring whether the
native footnote area collides with the windowed footer box, I got this:

```
page 1: lowest MB entry y=700.16   ShT content top y=729.34   clear
page 2: lowest MB entry y=700.16   ShT content top y=689.34   *** OVERLAP ***
```

There is no overlap. The window block sits at the same footer position on every
page and `move()` shifts **paint, not layout**, so the 689.34 is ShT's
clipped-away, invisible text. A checker written this way would report a collision
on every continuation page of every document and be wrong every time.

The pattern each time: *an instrument that cannot see the value returns a
plausible answer rather than an error.* Worth adding cases 3 and 4 to that
README. And worth the reflex — before believing any measurement in this area, ask
which instrument would notice if the answer were wrong. Anything involving
`clip`, `move`, `place`, `hide` or `fill` needs `svgdump`, not `probe`. Anything
about **where a reader's eye lands** needs `svgdump`, full stop.

---

## Part 8 · What Shaul has decided

- **It must work.** Refusing at compile time and growing-with-a-warning were both
  put to him and both rejected. The note must reach the next page.
- **The empty-region gap is low priority.** Nothing is lost, the body does not
  move, it is drift. Not worth a night.
- **`settings_live.rs` over the region keys is worth doing** and is the first
  item, because it fails on today's tree.
- The choice between routes A, B and C is **his**, and the trade table above is
  what he needs in order to make it. Do not pick one and present it as the
  finding.

---

## Reproductions

Run from `ksav/engine`. `probe` for position, `svgdump` for anything about how a
glyph is drawn.

```sh
cargo run -q --example probe   -- FILE.ksav
cargo run -q --example svgdump -- FILE.ksav
```

**Empty region ignores its declared height** — the two files differ only in
`גובה: 60pt`, and produce identical output:

```
#אזור("עליון", מיקום: "רגל")
#אזור("תחתון", מיקום: "רגל", גובה: 60pt)
#ערוץ("צעל", אזור: "עליון")
#ערוץ("צתח", אזור: "תחתון")
BODY#הערה_זרם("צתח")[LOWERNOTE]
```

Add `#הערה_זרם("צעל")[UPPERNOTE]` for the occupied control, where the height is
honoured to the point.

**A note taller than its slot** — vary `גובה` and add `גלישה` to confirm that
neither policy moves it:

```
#אזור("תחתון", מיקום: "רגל", גובה: 40pt)
#ערוץ("צתח", אזור: "תחתון")
BODYSTART#הערה_זרם("צתח")[GIANT <~60 words of Hebrew>]
```

**The native stream splits stacked bands** — the result that makes Route A
thinkable:

```
#set page(height: 300pt)
BODYSTART#footnote[#block[BANDA <40 words>]#line(length: 30%)#block[BANDB <40 words>]]
```

**The two-window continuation** — Route B, and it is exact:

```
#let LONG = [ <30 words> ]
#block(width: 200pt, height: 40pt, clip: true, LONG)
#pagebreak()
#block(width: 200pt, height: 40pt, clip: true, move(dy: -40pt, LONG))
```

**The same thing in a real footer, driven by the page number** — this is the
whole of Route B's mechanism, and it wants a body long enough to force two pages:

```
#set page(footer: context {
  let p = here().page()
  block(width: 100%, height: 40pt, clip: true, move(dy: -40pt * (p - 1), LONG))
})
```

**Route D's partial trial** — native footnotes plus a windowed footer box. Note
the `margin: (bottom: 5cm)`; without a reserve the two surfaces have nothing
keeping them apart, which is the open question in Route D:

```
#set page(margin: (bottom: 5cm), footer: context { …the window above… })
<30 paragraphs, each ending> #footnote[מב.. …]
```

Read the result with `svgdump`, not `probe` — see Part 7 before drawing any
conclusion about whether the two surfaces overlap.

All twenty documents are committed at
**`ksav/engine/tests/notes-corpus/spill/`**, with a README mapping each file to
the claim it carries. They are in a subdirectory rather than alongside the main
corpus because the note system was your working area while they were written —
move them up if you would rather they sat with the rest, nothing depends on the
path.
