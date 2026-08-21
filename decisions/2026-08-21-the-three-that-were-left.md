# 2026-08-21 · The three that were left, and the four bugs under them

`NOTES-PLAN.md` had three open items at the start of this wave. All three are
built. Getting there turned up four defects that had nothing to do with them,
three of which lose the writer's text — which is the only fault this application
may not have.

## Thing one's fourth home — a note's prose in a separate file

Three homes shipped: inline, the foot of the file, the end of the section. The
fourth was deliberately not stubbed, and the reason was true as far as it went:
the deferred model is one string in and one string out, so a body written into
*another* document has nowhere to go, and `problems()` would report every marker
in the sefer as an orphan by construction.

Both halves are now answered rather than worked around.

`fileNewBody` returns the entry for the companion **beside** the text instead of
inside it — one string in, one string and one errand out, which the caller runs —
and it adds the `#כלול` line to this document if it is not there, because a body
in a file nothing includes is a body nothing prints. `problems()` takes what the
neighbouring documents define and refer to; the compile path already reads every
included document to build its request, so filling that in costs nothing and is
never staler than the last compile.

The engine needed no change at all: `#כלול` expands textually before Typst sees
anything and the pairing is a document-wide query, so a sefer of many files is
one document and a marker here finds a body there.

## The line address — `ראש: ("שורה",)`

Refused by name until now, and the two routes it had tried were both dead ends
that were re-measured before this was built:

- **`counter(par.line)` cannot be read back.** `counter(par.line).at(marker)`
  answers `(0,)` at a location whose margin visibly prints a number.
- **Arithmetic on the baseline grid counts the wrong thing.** Paragraph spacing
  occupies grid rows that are not lines, so a marker on the line the margin
  numbers 5 comes out 8.

What both missed is that Typst hands the layout back once per line: **the
`numbering` function of `par.line` is called at each line, in that line's place.**
So the function records where it was, and the address is a query over the record —
the same mechanism as everything else here that has to survive page breaking. The
number in the margin and the number in the entry are now one call, so they cannot
disagree, and `the_line_in_the_entry_is_the_line_in_the_margin` holds them there.

Two things fell out of building it:

**The rule is *last line at or above*, not *nearest*.** A line's mark comes back
at 107.08pt and a marker written on that same line at 112.63pt — the mark is
placed where the line starts and the marker sits below it. Nearest was tried
first and picked the line *below*, because the flow is full of paragraphs with no
ink in them (the anchors this prelude drops to mark where a region's scope ends,
among others) and one of those falls between the last line of the prose and the
apparatus under it.

**The apparatus was numbering its own lines.** `_ap_wrap` has said it should not
since a band of commentary came out with stray digits down its edge — but that is
the *banded* renderer, and a collected region does not go through it. Cosmetic
until the address was built on the same record, at which point an entry near the
foot of the text was addressed to one of the apparatus's own lines.

## The Vilna wrap — a grid region whose shape changes down the page

`טורים` said one set of widths for the whole region, so every row had the same
number of columns; the three-then-two-then-full-measure daf could be drawn by
hand and not asked for.

`טורים` now reads as a list of row plans when it is given one, and as one plan for
every row when it is given widths — which is what every document written before
this gives, so nothing moves.

```typst
טורים: (1fr, 2fr, 1fr)                one shape, every row
טורים: ((1fr, 2fr, 1fr), (2fr, 1fr))  a shape per row, in order
טורים: ((רוחב: …, ערוצים: …), …)       and everything about a row
```

A row plan says `רוחב`, `ערוצים`, `מרווח`, `ריווח`, `ריק`, `יישור`, `עודף`, and
takes from the region whatever it does not say. Rows past the end of the list
repeat the last plan, or cycle the whole list under `מחזור`. Five keys are new on
the region — `מחזור`, `מרווח_טורים`, `ריווח_טורים`, `ריק`, `עודף` — and two of
those were numbers written into the renderer.

What makes it a *wrap* rather than a table is `ריק`: a cell for a channel with
nothing to say in that row is either kept blank, which holds the register, or
**dropped**, and then the row's remaining columns take the width. Dropped is the
knee — the Rashi column disappears from the row where the Rashi ends and the
gemara widens into it, with nobody counting rows.

## The four bugs

### 1 · A row plan silently dropped a channel

The first draft had no answer for a channel with something to say and no column
in its row, and its answer was silence. **The first version of the test asserted
that**, which would have frozen it in place. A plan is the writer saying how the
columns sit, not that a peirush may vanish on the simanim they did not think
about. `עודף` now decides where it goes — a row of its own at the full measure
(the Vilna answer, and the default), a column appended to the row, or a refusal
naming the channel and the unit. What it may not do is go nowhere.

### 2 · A region beside or above the text lost every note filed into it

`#הערה(אזור: "x")` asked `place == "רגל"` and sent everything else to the
collected dump. Right for the back of the sefer, the end of a section and a
companion volume; wrong for the four the page furniture draws. A note written
into a region placed at the side or above the text was **filed into a collector
nothing ever draws** — the words appeared on no page at all, with the marker still
in the sentence and no complaint from anything.

Not a rare corner: `#הערה(אזור:)` is one of the five destinations the chooser
writes, and `מיקום` is one of the region panel's own controls. The two clicks
that lose a peirush are next to each other.

Half of it was a second hole: the walk that draws the margin iterates the
*declared* channels, and a note written this way files into a channel named for
the region that nobody declares. Fixed both ends.

### 3 · A band above the text was cut off

`_sn_tail_pages` was filtered to `"רגל"` earlier the same day, to stop it
measuring every collected note in the document. That filter was one bucket too
small: a band above the text is page furniture with the same overflow policy and
the same need to carry, and it was never asked how many pages it wanted. Measured
on the corpus that found it: **36 words of 60**, the rest on no page.

### 4 · A note carrying a link was not cut, it was repeated

`_ct_inline` named nine kinds and a link was none of them, so a note with a link
in it fell back to the window — which works, and repeats the whole note in the
text layer of every page it spans. A link is one body with a look on it in exactly
the sense the list is about. It needs two lines of its own because the rebuild
hands an element's fields back as *named* arguments and a link's destination is
positional.

## The shape all of these share, for the fourth time this week

**A function answering a two-valued question about a ten-valued input, with a
catch-all for the cases nobody enumerated.** `_sf_where` was that this morning.
`_rg_height_of` was that yesterday. `_ch_note_in` and `_sn_tail_pages` are that
here. `_ch_kind` has had the correct four-way answer for a channel since side
channels existed, and each of these was written beside it.

The correction is the same every time: **answer the question that was asked and
let the caller compare.**

## What the tests learned

Three fences in this wave were written, run, and found to prove nothing:

- the paragraph check in `atom_cut.rs` passed under a deliberate `parbreak()` in
  the rebuild. It turns out a paragraph break inside an apparatus costs exactly
  zero — the renderer sets `block(spacing: 0pt)` — so the danger is not a
  paragraph, it is a *block*, and `the marked word sits alone on its line` is what
  catches that, on eight elements at once;
- the last-word check compared `None` to `None`, because `מילה50` is Hebrew then
  digits and Typst shapes it into two runs, so no single run contains the token.
  A claim that cannot find its subject now fails rather than passing;
- the whole truncation sweep passed on a corpus where **every document was an
  error**, because a stray space between `)` and `[` made every compile fail and
  the sweep counted a refusal as an answer. It now asserts that none of the
  ordinary arrangements refuses.

And one limit is written down rather than worked around: `probe` walks laid-out
frames and a clip is a paint operation, so it cannot tell a masked note from a
printed one. `nothing_is_truncated.rs` therefore proves the words reached a
**frame**, not that a reader can see them. That is the weaker claim; it still
catches every bug listed at the top of that file, and overstating it would have
been the third time an instrument here was asked a question it cannot see.
