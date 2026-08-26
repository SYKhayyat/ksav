# 2026-08-25 · Five small apparatus corrections

Five defects in the numbering and placement machinery, each fixed at the root
and fenced, committed one per commit across 24 August.

## A restart governs its own series, asked per note (`3cc5415`)

A document that restarts counts moved *every* default-channel note onto the
query-numbering path — `_nr_any()` is a document-global question, and a sefer
that numbers a list of psakim anywhere renumbered all nested notes into
colliding 1..N runs. Governance is a property of one note at one location, so
the decision now sits inside the note's own context: governed notes take their
rank from a query scoped after the governing restart, exactly as the
collect-then-render apparatus does it; ungoverned notes keep Typst's own
footnote counter, balanced and free.

## The name-mark reads its counter after the step (`346060b`)

Every named note recorded its predecessor's number. State reads inside one
context share one snapshot, so the read beside the footnote saw the counter
*before* that footnote stepped it. The mark is written in its own later
context now, where the step has happened; which path the note took is carried
out on `_fnt_gov`.

## The contents' own title is furniture (`1a8f201`)

Typst renders `תוכן`'s title as a heading, and under a numbered document rule
the title printed "0." — the counter read before anything had stepped. The
title is set unnumbered, always.

## A note whose line the walk has left is carried, not copied (`6dafede`)

In the margin walk, a note whose marker sits on a page the cursor has already
left answered "beside my line" with a place that no longer exists — and using
its source-line height on the new page copied a y from a page it is not on,
pushing every later note a full leaf down while the margin stood empty.
Carried notes clear intervals like any other, whatever their `הזזה` asks;
`התעלם` still takes no part when its own page is current.

## שורות heights resolve on the Rust side too (`a93fd91`)

The scanner priced `שורות(2)` against a flat guess while the drawn slot used
`par.leading + text.size`, so the reserve taken off the margin and the block
Typst drew disagreed by exactly the ratio of the guess — one sitting document
under-reserved into 116 near-blank leaves. One constant, both sides, unit
test asserting the two answers to the millimetre.
