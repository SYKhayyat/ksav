# 2026-08-21 · A blank sheet at the end of every sefer with notes

Found while chasing something else: `giant_spill` rendered three pages where two
held the note. The third was empty. Narrowing it took four documents and ended
somewhere much larger than the spill.

## What it actually was

```
#מסמך[
שלום#מדף_א[קצרה].
]
```

One line of body, one short note. **Two pages.** The second is empty but for its
page number. The same for a declared region at `מיקום: "רגל"`, for two bands, for
a section band, and — with two blank sheets rather than one — for any note that
spills.

Not for a document with no notes, and not for a native footnote. So: everything
that goes through `_sn_tail_pages`.

## The cause, which is half of a mechanism that is otherwise right

`_sn_tail_pages` adds the pages a carried note needs past the end of the body.
That walk has a real problem to solve and solves it: on the first layout pass no
note has a position, so the walk asks for nothing; the positions arrive on the
next pass and the answer grows — but Typst only runs another pass when something
it *watches* changed, and neither a `pagebreak()` nor a `metadata` value nor a
new label is enough. Measured at the time: the walk computed `last=1 want=2` and
the page never appeared, and three notes stayed missing on every pass.

What Typst watches is a laid-out frame, so the answer is written into one as a
hidden numeral whose glyphs change exactly when the answer does. That is right,
it is documented at length in place, and removing it costs `giant_spill` half its
note — checked, not assumed.

The half that was missing: it was emitted **whether or not there was anything to
watch**. With no pages to add, a `place`d numeral at the end of a flow carrying
nothing else still needs a frame to hang off, and Typst opened a sheet for it.

```typst
if want > last { place(hide[#want]) }
```

`want > last` is the same condition the loop below already runs on, so no pass
that grows `want` goes unnoticed: the numeral appears on that pass, and its
appearance is itself the frame change that earns the next one.

## Why the suite could not see it

Every fence here reads **where words landed**. A blank sheet has no words on it.
So every assertion about every apparatus was true, on a document one page longer
than the writer wrote — page counts were never the question, only positions.

That is worth naming, because it is the same failure as the one this repository
keeps recording in the other direction: the instrument could not see the property
under test, so it reported the property as fine. `probe` reading frame items
cannot see a `clip`. A suite reading text runs cannot see an empty page.

`tests/page_count.rs` is the fence, and it asserts **exact** counts rather than
bounds — `>= 1` passes on the very bug it would be written for. It also asserts
the case where a longer document is correct, and getting that right cost the
test's first draft: a region at the back of the sefer does **not** open a sheet.
`עמוד_חדש` defaults to `auto`, and `auto` means each placement keeps its own
habit — the back of the sefer follows on, because it is a section of this volume,
and a companion held for a file of its own starts a sheet, because that is what
makes it a separate volume. `עמוד_חדש: true` is what asking looks like, and the
fence checks both values of it.

## The part that is still uncomfortable

`query(_sn_tail_label)` returns **two** elements on an affected document —
`(last: 1, want: 1)` and `(last: 2, want: 2)` — where `_sn_tail_pages()` has
exactly one call site. The reading that fits: the numeral pushed the tail onto a
second page, the context re-evaluated there, and both frames survived. It fits
the evidence and it is not proven, and the fix does not depend on it being right.
Written down rather than tidied away, because the next person to touch this walk
should know that the number of tail elements is not necessarily one.
