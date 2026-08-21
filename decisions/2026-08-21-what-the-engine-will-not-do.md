# 2026-08-21 · What the engine will not do, and what that rules out

Two constraints, from outside this repository, that decide more than any
preference does. Both are written down here because their value is in ruling
options *out*, and an option ruled out silently gets re-proposed.

## One · Typst has no frame chaining

Every engine that can flow content from one page zone into another has a
primitive for it. SILE has `frametricks` with `next=`. ReportLab has `Frame`
plus `FrameBreak`. LaTeX has `flowfram`'s flow frames. Typst has none, and its
own creator is on record about why: **regions in a sequence must all have the
same width, and regions can only be rectangular.**

That is the whole explanation for `_ap_slot`. A page footer is composed afresh on
every page and has nowhere to continue into, so a block inside it cannot be
carried — and no amount of work *inside the footer* will produce a continuation.
It is an engine gap and not a Ksav bug, which matters because the two call for
different responses: a bug gets fixed where it is, and a gap gets routed around.

Three independent sources now say the same thing. `NOTES-SPILL-FINDINGS.md`
Part 4 reached it by measurement; the `marginalia` package says it in its own
documentation — *"a limitation of Typst which does not (yet) provide a robust way
of detecting and reacting to page breaks"*; and the sefer-engine survey reaches
it by citing the creator. That is about as settled as an engine limitation gets.

**What it leaves.** Either move to a surface that does flow — Typst's native
footnote area splits, measured three ways, including stacked bands inside one
entry splitting across three pages — or do the splitting yourself. Ksav now does
both: the shipped spill draws the same note through a window that moves, and
`fitPrefix` is the plan for cutting it properly.

**And one thing it does not rule out.** The survey scores Typst ❌ on the L-shape
— text flowing out of a narrow column into a full-width zone below it. That ❌ is
about the *native region model*, and it is not a statement about the achievable
result: `meander` threads text between containers of different widths, and a knee
can be computed rather than flowed. The ❌ is right about the mechanism and wrong
as a limit on the page.

## Two · live preview rules out owning the pagination

The obvious answer to "the engine will not paginate this the way I want" is to
paginate it yourself. sefer-engine does exactly that: each page is compiled as an
independent SILE document and the results are merged with `pdfunite`,
deliberately, to avoid cross-page reflow.

That is a **batch** architecture. The paginator fixes every page before any
typesetting happens, so an edit that pushes one line across a page boundary
invalidates all downstream pagination.

Ksav is 234 pages cold in 979ms and **59ms after a one-character edit**. That
number is the product. A writer sees the page as they type, and the whole reason
this engine was chosen over a batch one is that the preview cannot lie and cannot
lag. Compile-each-page-separately trades the thing the application is for.

So it is ruled out. Not "expensive", not "later" — **ruled out**, and this
paragraph exists so that nobody costs it again.

**What it constrains rather than forbids.** Anything that runs per layout pass
has to be cheap enough for that 59ms. A binary search per split, re-run on every
pass, is the one route in `NOTES-SPILL-FINDINGS.md` that could cost it — and it
is also the route that gives the cleanest output and the one the berech needs
anyway. It gets benchmarked against the real number before it is committed to,
which is a different discipline from being ruled out.

## The shape of both

Neither of these is a decision about what to build. They are facts about the
ground, and the reason to write them down is that both look like choices from a
distance: *"why not just chain the frames"* and *"why not just paginate it
ourselves"* are the two questions this note answers once.
