# 2026-08-21 · What the night did not build

`NOTES-PLAN.md` decision 17 says the scope is all of it. Most of it is built and
each chunk has its record beside this one. This is the other half of an honest
report: what is **not** built, why, and what the next person needs to know before
starting on it. Nothing here is blocked; it is simply not done.

## 1 · Thing three's *grid* — the parallel-column page as a region

The **box** half of thing three is complete: `#אזור` takes a placement, a height
in cm/mm/pt/in or as a percentage of the sheet, an overflow policy, and any
number of channels pointed into it.

The **grid** half is not. What the plan asks for is:

```typst
#אזור("דף", פריסה: "טורים", טורים: (1fr, 2fr, 1fr), יחידה: סימן)
```

— a page split into parallel columns synchronised on a chunk, which is the Vilna
page. **The mechanism exists and is proved**: `flowtest` runs 70 paragraphs down
two columns over six pages, `perdaf` gives exact register per daf, and `vilna`
does the three-then-two-then-full-width wrap. What is missing is the *region*
being one of them, with `יחידה` as the synchronisation dial.

Two things the next person should know before starting:

**`פריסה` is taken.** On a region it already means how the channels *inside* it
sit — stacked or side by side — so grid-or-box needs its own word, and the
naming record's `פריסה` row is wrong on this point. `סוג` was rejected there for
being vague; with `פריסה` occupied it is worth reopening.

**A grid is not a note destination.** It builds a parallel-text page whether or
not a single note is involved — an original facing a translation needs it with no
apparatus at all — which is the plan's own argument for why regions belong
outside the note feature. Building it as *a note thing* is the mistake this whole
plan is written to undo.

## 2 · `שומר_מקום` — whether a box holds its space on an empty page

Named in thing three, **written and then reverted the same night**, and the
reason is the one this repository cares most about.

It was implemented — `_ap_slot` collapsing to zero height when its region has
nothing on this page, with `true` as the default so nothing already written
changes. Then it could not be **demonstrated**. Four documents were tried; on
none of them did the setting move anything on the page, because a page-foot
region's space comes off the bottom margin and collapsing the block inside the
reserve frees room that nothing else uses. The visible case is two regions where
the upper one is empty and the lower should rise — and that case did not
reproduce either.

A setting that compiles and changes nothing is precisely what
`tests/settings_live.rs` was built the same night to catch, and `_rg_own`'s keys
are on `#אזור` rather than in a `_X_defaults` dictionary, so **that fence would
not have caught this one**. Shipping it would have been adding a dead knob to the
one part of the prelude that had just been swept for them.

So it is not there. When it is built it needs a corpus document that shows the
difference, and `settings_live.rs` needs extending to cover the region keys —
which is the more valuable half of that work.

## 3 · The six overflow moves that are refused by name

`גלישה` accepts `"דחיסה"`, `"עמוד_הבא"` and the empty list. The other six the
plan names — the two-directional shift, the cascade, run-in, character-level
tightening, dropping a type size, redistributing inside a fixed total — are
**refused with the list of those that exist** rather than accepted and ignored.

Two of them are already *in* the engine and are not settings: the side column
clamps, shifts both ways and cascades unconditionally, because those are what
keep the invariant rather than choices about it. The rest are real work, and
`"הקטנה"` is the one to build first — dropping a type size is the move a writer
reaches for before spilling, and it is the one that needs the assignment walk and
the renderer to agree about which pages were shrunk.

## 4 · The baseline grid

Named at document level and not built. It matters for a parallel page: body at
12pt and commentary at 9pt drift against each other even in perfect per-page
register, and that drift is what makes amateur parallel typesetting look wrong.
Off by default when it exists.

## 5 · The fourth source position — a separate file

Three of thing one's four homes ship: inline, the end of the file, the end of the
section. The fourth is deliberately **not** stubbed, and the reason is in
[The cells were the product](2026-08-20-the-cells-were-the-product.md): the
deferred model is one-string-in-one-string-out, and `problems()` reports a marker
with no body as an orphan — so splitting a pair across two documents makes every
marker in the sefer an orphan by construction. It is a change to the model, not
another branch in the filing, and an option that quietly files somewhere else is
a control that lies.

## 6 · `קובץ` — the companion volume prints, and is not a second file

`#הערה(ערוץ: "קובץ")` is a placement the model accepts. What it does **not** yet
do is produce a second output file: the engine compiles one document, and a
companion volume is a second compile of the same source with the body hidden and
that channel's notes shown. Nothing about the model blocks it; it is Rust work on
the export side, and until it exists the destination is honest only if the
interface says what it does.

## 7 · The addressing system a markerless stream needs

`ראש: ("ציטוט",)` now produces an apparatus addressed by dibbur hamaschil with no
numbers anywhere — which is the arrangement the plan marks `[U]`:

> A markerless stream needs addressing by line, page, daf or siman instead — a
> second addressing system, which seforim use constantly.

The first half arrived tonight and the second did not. Worth knowing which,
because a markerless apparatus without it is reachable and half-useful.
