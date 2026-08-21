# 2026-08-21 · What the stress test found

The spill mechanism was built, fenced, mutation-checked and driven in a real
browser, and every one of those said it worked. Then it was pushed — three notes
in one region, three hundred words in a one-line region, a bolded word, sixty
chapters, and every value of every region key — and every one of those found
something. Six findings; four fixed and fenced, one fixed and left honest about
what it does not verify, and one that the measurements on this box are too noisy
to characterise, which is itself the finding. Two were silent, which is the only kind worth being frightened of;
one had been failing CI for a fortnight; and one is a wall that is measured here
and not fixed.

## 1. A sefer that dropped sixteen words a page, every seventh page

Three hundred words into a region one line tall. Count what comes out:

```
distinct: 267   total: 299
missing:   113–129, 230–245
duplicated: 97–112, 214–229
```

One page in seven printed the **previous** page's slice again, and the slice it
owed was never printed. No gap on the page, no short line, no warning — the
apparatus looked exactly as it should and the sefer was missing thirty-three
words out of three hundred.

The cause is one line. The renderer worked out which slice it was showing as
`floor(offset / slot)`, where `offset` is `slot × k`. That is `k` in arithmetic
and it is not `k` in floating point: once `k` is large enough `slot × k / slot`
lands a hair under the integer, `floor` takes it down to `k − 1`, and that page
draws the slice before it.

The walk already knows the number exactly — it is the page minus the page the
note started on, an integer — so it now says so instead of encoding it in two
lengths for the renderer to divide back out.

**Why nothing caught it:** every existing fence used a note that spanned two
pages, and at `k = 1` the arithmetic is exact. The bug lives at `k ≥ 7`. A fence
that counts words over twenty-one slices now exists, and the mutation that
restores the division fails it.

## 2. One asterisk cost a note its cut

`_ct_text` answered `none` for anything that was not bare words, and a body it
refused fell back to the window — which slides the whole note by a fixed distance
and **cuts through a line of type** to do it. Measured on a forty-word note with
one bolded word in it: a line split across two pages, its top half on one and its
bottom half on the next.

Words with a look on them are not an edge case. A peirush has bold lemmas, a
citation has an emphasised title, a note has an underlined heading. Nearly any
real note was one asterisk away from being sliced.

So the words come out of the markup rather than the markup disqualifying the
words. `_ct_split` walks the body into one atom per word, each atom the word
*and its own look*, rebuilt from the element's own fields — `fields()` minus the
body, handed back to `func()` — so an underline keeps its stroke and a highlight
keeps its fill. A word with no look on it stays a bare string, which leaves the
ordinary case exactly as it was.

The window stays, and now earns its place: it is what happens when the body has
**no words at all** — a table, a figure, a box — where there is genuinely no seam
and slicing is the honest answer.

The fence asserts both halves, because a cut that dropped the styling would pass
a word count and be a worse bug than the window it replaced: every word once, and
the highlighted word still highlighted, on one page only.

It also cost a corpus. `giant_spill_uncuttable.ksav` was a note with a bolded
word in it — and it is not uncuttable any more, so it now holds a `box`, which
is.

## 3. The way out of the notes chooser was 87px above the screen

CI's assembled-app job had been red for a fortnight on one check of 723:

```
notes-chooser's way out is on the screen
```

The chooser scrolls its picked card into view when it opens — added because at
1280×720 the card and the button that writes it landed below the fold. Scrolling
the card **in** scrolled the title and the `×` **out**: measured at `top: -87` in
a box whose own top is at 86.

One visibility fix traded for another, in the same panel, by the same reasoning.
The answer is that neither should move: a head in a box that scrolls is sticky,
which the drawers have been for a while and the chooser was not. `.styles-head`
now carries it, the two demands stop being in tension — the card comes to the
middle, the way out stays where a hand expects it — and in a container that does
not scroll it does nothing at all. Verified against the real application: 723
checks, all green.

## 4. `גובה: auto` was an internal error, in four places at once

The other three findings came from documents written by hand to be nasty. This
one came from a fence written to be dull: every value of every region key,
rendered, and the only question asked is whether the engine either does it or
refuses in a sentence a writer could act on.

It failed on its first run, on the least exotic value in the table:

```
#אזור("צר", גובה: auto)
  → "cannot compare auto and length"
```

`auto` is the word a writer reaches for to say *as tall as it needs*, which is
exactly what leaving the key out means. It reached a comparison against a length
and came back as an error from inside Typst, about nothing the writer had done
wrong.

**And fixing it was the second half of the finding.** Four places read a region's
`גובה` and each decided for itself what counted as declared; three of them tested
`!= none`, which lets `auto` through. Two were fixed, the test was re-run, and it
failed *differently* — `none` multiplied by an integer, from a slot with no
height — because the third reader was still there. Which is this repository's own
recurring shape, named in `ksav-girsa-diagnosis-without-sweep`: a class named, one
instance fixed, the siblings never swept.

So the reading is written once now, as `_rg_height_of`, and the five callers ask
it. The same normalisation also catches a case nobody had written a document
for: `_ap_fixed_height` hands back `auto` of its own accord for a percentage
height on a page that is itself `auto` tall, which is every continuous-mode
document.

The fence stays, at 70 values and 17 combinations in 8.8 seconds, because the
vocabularies are read out of the prelude — a move added tomorrow is rendered the
day it is added, and the panel now offers all of them to anybody who opens it.

## 5. The window slid 2.34 lines, so it cut the third one in half

The window is what a body with no words in it falls back to, and it slid by
exactly the height of the slot. A slot is not a whole number of lines: 34.02pt of
region against a 14.38pt line advance is **2.34 lines**, so the third line of a
note began inside the slot and ended outside it — top of the glyphs on one page,
bottom of them on the next.

It slides by two whole lines now, 28.76pt, and is clipped to the same rather than
to the slot, leaving 5.25pt of white space at the foot of the region. Both
rectangles are in the SVG and neither is visible to `probe`, which reads frame
items — the corpus README's standing warning, earned again.

The unit had to be got right twice. A line's **box** is 16.83pt at this size and
its **advance** is 14.38: the first is its ascender and descender, the second is
where the next line starts. Using the box gave a step of 33.66pt, which is 2.34
lines wearing a different number. `_ap_advance` measures two lines less one.

## 6. What is not fixed — measured properly, on a release build

**A collected apparatus is quadratic in the text collected into it.** That is now
a claim worth making, because the instrument it was measured on repeats. The
first version of this section refused the word "quadratic" and it was right to,
on the evidence it had.

A debug build on this box gave ±100% on identical work — the same twenty-chapter
document timed 48.8s, 55.1s, 97.5s and 133.5s across one afternoon. So the
release build was made and every number taken twice:

| notes | words each | pages | release, run 1 | run 2 |
|---|---|---|---|---|
| 30 | 24 | 12 | 1.41s | 1.34s |
| 60 | 24 | 23 | 5.75s | 5.51s |
| 120 | 24 | 46 | 31.1s | 34.8s |
| 120 | **1** | 36 | **2.23s** | **2.53s** |

Five per cent apart, not a hundred. And the shape is unmistakable: **four times
the work for twice the notes**, twice over. The last row says where it lives —
same note count, same bodies, only shorter notes, and fourteen times faster. It
is the text collected into one block, not the number of notes.

For scale: the same notes at the **page foot** cost 3.7s, and an ordinary body
word costs about a three-hundredth of a collected one.

## Three hypotheses, all refuted by measurement

Recorded so nobody spends an afternoon re-running them.

**1. The per-entry state bracket.** Every entry brackets its body with an
`_ap_origin` update, so a collected block makes two state events per note where a
page foot makes two per page. Debug said removing them saved a seventh, which was
inside the noise. Release says removing them costs **12.3s against 5.6s** — the
brackets make it more than twice as *fast*. Whatever they do to what Typst
memoises, they are helping, and the hypothesis was not merely wrong but backwards.

**2. The synthetic oblique.** Ksav has no italic Hebrew face and shears the
glyphs, boxing every word, and the shipped ramp sets tier two and below italic —
exactly a per-word cost of this shape. Forcing `סגנון: "normal"`: no improvement.

**3. The numbering walk.** `_nr_numbers` asked `_nr_origin` for every entry and
`_nr_origin` queries the whole document — one full query per note in a block
showing every note, which is a genuine O(n·m). It is one query and one merge pass
now, and it is worth keeping on its own merits, but it does not move these
documents: they restart no numbering, so `_nr_any()` short-circuits before the
walk begins. A sefer that restarts per siman reaches it on every entry.

## What is left to try

Typst's own `typst_timing` against the release binary, which is the one
instrument not yet used. Everything above is bisection by document, and bisection
by document has now been taken as far as it goes: it says *where* the cost is —
the text inside a collected block — and it cannot say *what* is doing it.

One more fact for whoever picks it up, because it is the sort that saves a day:
the debug and release builds disagree about the sign of hypothesis 1. Measure on
release.
