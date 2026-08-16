# A look of its own

**2026-08-16**

The rule, as it was given:

> anything that is a separate command should have its own style, which can be
> customized by the user — whether heading, source footnote, siman, seif

It arrived as the answer to a smaller question. The 11 August inventory had said
*a source note looks exactly like a footnote*, and this repository had recorded —
twice, in the prelude and in `marks.ts` — that this was as it should be:

> a `#מראה_מקום` is a footnote and takes the note styles, and giving it a second
> styling channel would be two authorities for one fact

That is right about the rule and was the wrong conclusion. *Style all your
footnotes differently* is not an answer to somebody who wants their mareh
mekomos set apart from their notes, and the same sentence was doing the same
work for `#סימן`: a siman is a heading, so style all your level-1 headings —
including the ones that are not simanim.

## What the rule does not mean

It does not mean a styling channel per command. There is still exactly **one
authority per class**, and the reason given for refusing is still the reason:
two commands able to set one look is the drift this product keeps paying for.

What changed is which authority. A class of marks already resolves its look in
three layers — the shipped default, the class, this instance — with `כפה` on the
global to sweep the one-offs back, and it is keyed by *name*. So a command that
draws something belongs **in** that register rather than beside it, and joining
it is four lines: a row in `_mk_defaults`, and rendering through `_mk_conf`.

## What joined it

| | |
|---|---|
| `#מראה_מקום` | the 0.92em it has always printed at, written where a control can read it |
| `#סימן` | nothing of its own over the level-1 heading — so it prints exactly as before |
| `#סעיף` | `משקל: "bold"`, which is the `strong` it was written with |
| `#אות` | the same, and separately: a sefer that uses both on one page is why they are two commands |

Every one of them ships with what it printed yesterday, which is the whole
constraint: a sefer written before today reprints identically.

Two things the tests are specifically about, because both would be silent:

**The look must not reach past the thing.** A `#סעיף`'s look belongs to its
letter — a class default that swallowed the body would restyle the halacha along
with the letter that opens it. `a_seif_styles_its_letter_and_not_its_halacha`.

**The look must not touch the indexes.** Several of these commands exist *for*
their index. A citation is collected because it carries a `מקור:`, whatever it
looks like; a siman is collected however large it is set. `ברשימה: false` is the
knob that says *not in the index*, and it now means that on a source note too —
which leaves it a footnote, because being unlisted is not being unprinted.

## Styled and collected came apart

They were one list with two exceptions on the end for as long as *having a look*
and *being in an index* happened to coincide. They are two questions:

- `#סעיף` and `#אות` have a look and are in no index. A sefer does not want a
  list of its own seifim; it wants them set the way it sets them.
- `#סימן` has both, and was collected years before it was styleable.

So `STYLED_CLASSES` is what `_mk_defaults` styles and `MARK_CLASSES` is what
`_mk_titles` collects, neither nests inside the other, and
`enginefacts.test.mjs` holds each to its own half of the prelude.

## The fence, and the inventory it prints

A rule stated in prose is the shape this repository has a whole test file about.
It cannot be held by a regex — *has a look* is answered by five authorities, a
per-level ramp for headings, a per-tier one for notes, per-band, per-stream, and
the class register — so it is a sweep over the **registry**: every command the
engine offers either has a look somebody can set, or is named with the reason it
is not one of:

- **is itself a style** — `#הדגשה` *is* bold; what weight bold is is a different feature (18)
- **a position, not a look** — `#מרכז`, `#מעבר_עמוד` (14)
- **styled by the thing it is part of** — `#תא`, `#פריט` (5)
- **prints nothing at all** — `#סמן`, `#כלול` (8)
- **a configuration or an index** — `#הגדרות_*`, `#תוכן`, `#ערוץ` (15)
- **no look of its own yet** — the twenty-four the rule still owes

That last list is a claim rather than a skip list: each name must still be a
command, and must still be absent from `_mk_defaults`, so giving one a look turns
the fence red until its row is removed. It can only shrink. Mutated in both
directions — a command dropped from the table was named as unclassified, and one
listed as having no look after it had been given one was named as a lie.

## A door for each, added the same day

The first cut of this made every styled command customizable and left one way to
say so: name the class inside `#הגדרות_סימונים`. That was answered plainly —

> each thing which is its own command should have its own styling you can
> customize, so one for siman, one for seif, one for mareh makom, one for each
> header, one for each custom style

— and *set it inside the marks configuration* is not that. So every styled
command has a `#הגדרות_<שמו>` of its own: `#הגדרות_סימן(גודל: 1.6em)` is a
sentence about simanim, and `#הגדרות_גמרא(סגנון: "italic")` about gemara
references. Ten of them, three lines each.

They are doors, not authorities. All of them write through one setter into one
store, so the per-command spelling and the several-at-once spelling are two ways
of saying one thing and cannot disagree — asserted, because that is the property
worth having and the one that would rot quietly. The store stays knob-major, so
a class-major write merges rather than replaces: setting the siman must not wipe
a size the sefer set for its gemara references two lines earlier.

`כפה` is read per class as well as globally now. Through a door it means *every
siman, no exceptions* and says nothing about the other classes; through the
shared command it is still one switch over everything, which is what a writer
setting six classes at once means by it.

They are written out rather than generated because a `#let` name in Typst is a
literal. What keeps the list honest is the fence: every styled class must have a
door in the registry *and* a binding in the prelude, so a class added without one
is red. Mutated by deleting a row, which named `ערך`.

**What is not done yet**: the Styles drawer still writes the several-at-once
spelling. Nothing is broken by that — it sets the same store — but a document
styled from the panel reads worse than one styled by hand, which is backwards.
`HANDOFF.md` carries it.

## And then: as granular as it goes

The door is the command; the command is not always one thing. Asked how granular
this should be, the answer was *as granular as you can* — so the pieces a
command draws separately are settable separately:

| | |
|---|---|
| `#סימן` | the word `סימן`, the number, the separator, the title |
| `#פסוק` | the reference in parentheses, apart from the quotation |
| `#גמרא` | the masechta and the daf |
| `#ציון_מקור` | the place, apart from the sefer |

Two of those were **looks with no way to reach them at all**. A pasuk's
reference has been `text(size: 0.82em, fill: luma(95))` written inline in the
prelude since it was first drawn; the place after a cited sefer was half of a
concatenated string. Both are parts now, shipping exactly the values they
printed.

A part's look nests *inside* its command's, which is the property that makes it
worth having: `#הגדרות_סימן(גודל: 1.4em)` scales the whole heading, and
`#הגדרות_סימן(מספר: (משקל: "bold"))` bolds the numbers and says nothing about
the titles. So a part carries only its difference, and the two settings compose
instead of fighting.

A part name nothing declares stops the compile and **names the ones that exist**
— `כותרות` for `כותרת` is a typo a writer will make, and a control that reads
back what was typed and changes nothing on the page is the failure this whole
mechanism is against.

The parts are declared once, in `_mk_part_defaults`, and `marks.ts` holds the
same list for the panel. The fence compares them and caught its own reader
first: `#גמרא`'s two parts are written on one line, and a reader that knew only
the spread-over-lines shape reported that a gemara reference has a masechta and
no daf.

## What the twenty-four are

`שער`, `תת_שער`, `כותרת_בהערה`, `ציטוט`, `הערת_צד`, `אזהרה`, `הצלחה`, `תיבה`,
`מקור`, `קו_מפריד`, `תמונה`, `נוסחה`, `נוסחה_בשורה`, `הערת_ימין`, `הערת_שמאל`,
`הערת_גיליון`, `מדור_א`–`מדור_בדרגה`, `הערתסיום`, `הוספה`, `מחיקה`, `הערת_עורך`.

The side notes are the ones the margins already asked for by name — *configurable
width* — and the three review marks are the ones a reader sees most often
without being able to touch. `HANDOFF.md` carries the item.

**Eleven of the twenty-four are done since.** The eight blocks — `#ציטוט`,
`#הערת_צד`, `#אזהרה`, `#הצלחה`, `#תיבה`, `#מקור`, `#שער`, `#תת_שער` — took the
block knobs and a door each; the three review marks are below. Thirteen left,
and `test/enginefacts.test.mjs` holds the list so this paragraph cannot drift
away from it.

## The review marks, and a channel that was the wrong shape

`#הוספה`, `#מחיקה` and `#הערת_עורך` were the interesting case, because they were
the one group in the twenty-four that had a channel already:

```typst
#הגדרות_סקירה(צבע_הוספה: …, צבע_מחיקה: …, צבע_הערה: …)
```

Three colours. It was wrong twice over, and the two are worth separating.

**Not granular enough.** A reviewer could recolour a deletion and could not
unstrike it, could not set it smaller, and could not set *this* deletion apart
from the others — because three keys held one value each and there was no
instance layer at all. The strike itself was written into the command, where
nothing could reach it. `קו_חוצה` is a register knob now, beside `קו_תחתון`,
which is where a line through a word belonged from the start.

**And a second authority.** This is the failure the register exists to end: two
tables deciding what a mark looks like, agreeing right up until a document uses
both. So the switch keeps the three names — documents say them — and *routes*
them: `#הגדרות_סקירה(צבע_מחיקה: red)` and `#הגדרות_מחיקה(צבע: red)` are one
setting with two spellings, and a test asserts the two paint identical pages.

What stayed in `_rv_cfg` is what is genuinely not a look: which view the document
is in (markup, final, original) and whether a comment prints its reviewer's name.
An insertion being absent from the original view is not a style — it is what the
mark means.

One thing that had to be decided rather than derived: a comment rides the
sidenote engine, so it prints a `✎` in the line and its body in the margin. The
class's size goes to the body only. A comment set at 1.5em with a 1.5em pencil in
the middle of the sentence is not what anybody means by *make my comments
bigger*.

## The register moved, because Typst has no forward references

Four more commands took a class after the review marks — a heading inside a
note, an endnote's reference mark, and the two formulas — and the first of them
would not compile.

`#let` in Typst is visible only after its own line. The register was written for
the block commands and sits with them, two thirds of the way down the prelude,
and half the commands that need a look of their own are defined above it: the
banded tiers, the sidenotes, a heading inside a note. `#כותרת_בהערה` calling
`_mk_render` is *"unknown variable"*, and no amount of `context` defers it —
`context` defers evaluation, not name resolution.

So the register machinery moved to the top, above every command, with
`_doc_align` (its one dependency further down) beside it. The commands that
render through it did not move. The order now says what was always true: the
register is the authority for what a command looks like, so it comes before the
commands.

## The four, and the one that was drawing somebody else's look

`#הערתסיום`, `#נוסחה` and `#נוסחה_בשורה` are the plain case — a look nobody
could reach, now a class and a door each. Two notes on them:

- The endnote's class covers the **mark**, the superscript number the command
  leaves in the text, because that is all this command prints. The body is set
  by `#הערות_בסוף`, which is a separate command with a door of its own. One
  command styling another's output is exactly the second authority this register
  exists to prevent, and the test asserts it in both directions.
- The two formulas are two classes, not one. A sefer that wants its displayed
  equations a shade smaller than the prose is saying nothing about the `x` in
  the middle of a sentence, and the size that reads well is not the same size.

`#כותרת_בהערה` is the interesting one. It had a look and it was **borrowing**
it: weight and colour came off `#הגדרות_כותרות`, the document's real headings,
so a sefer that coloured its chapter titles coloured the lemmas in its footnotes
too and had no way to say otherwise.

The fix is not a different default. The document's headings are a good base and
stay the base — per level, so nothing written before this reprints — with the
class over them and the heading's own arguments over that. What was missing was
never a value; it was any way to disagree with the one it had.

### A test that could not fail, caught by mutating it

`a_formula_is_still_set_left_to_right` first asserted that `a` lays out to the
left of `b`. It passes with the `text(dir: ltr, …)` wrapper deleted: Typst sets
an equation's own glyphs left to right whatever the paragraph around them does.
`ONLY_AT_TOP` again — the fifth instance this repository has found, and the
mutation pass is the only reason it was found at all.

What the wrapper actually holds is everything *around* the mathematics. Without
it a numbered equation goes flush to the left margin instead of centred, and its
number prints `)1(`, because parentheses are ordinary text in a right-to-left
paragraph. Both are on the page and both are now asserted.

## Two apparatuses that were never missing an authority

The last seven on the list — `#מדור_א` through `#מדור_ה` and `#מדור_בדרגה`, and
`#הערת_גיליון`, `#הערת_ימין`, `#הערת_שמאל` — turned out not to be the case the
list said they were.

They were on it as *no look of its own yet*, and both had one:

| | the configuration that already existed |
|---|---|
| the section tiers | `#הגדרות_מדורגות` — per tier: numbering, columns, size, slant, colour; and the rules, the gaps between bands and between entries, the band labels |
| the side column | `#הגדרות_הערות_צד` — the ratio, the gutter, the least gap between notes, the size, the colour |

What they were missing is a **surface**. The Styles drawer had eight sections —
headings, lists, tables, channels, notes, page bands, streams, marks — and
neither of these two. Every one of those controls was reachable only by typing
the command into the document.

This is the same complaint that produced the *fixed regions* and *streams*
sections a few days earlier, in the same panel, and it was already written down.
`styles.ts` has carried this sentence since:

> `bands` is the **page** bands and not the section ones: the section apparatus
> is `#הגדרות_מדורגות`, a fourth configuration with no panel section of its own

A finding, correctly diagnosed, recorded in a comment beside the code it was
about, and left there. That is the failure mode this repository has now named
four times — *the class is stated in prose, one instance is fixed, the siblings
are never swept*.

So: two sections, ten in all, and the engine gained the knob each apparatus was
short of — a weight for the three banded apparatuses (a nusachos band set
lighter than the peirush above it says which is which faster than a size does),
and a slant and a weight for the side column (a peirush running down the margin
in italic is an ordinary arrangement, and until now the writer wrote `#נטוי`
inside every note by hand).

The tiers and the page bands stay two kinds and two stores, which is the thing
the old comment was right about: writing `#מדור_א`'s override against the
page-band global would compare a setting to the wrong default. There is a test
that sets one and reads the other.

## The panel writes the door now, and the several-at-once does not survive

The rule was *anything that is a separate command has a style the writer can
set*, and half of it was done in the engine while the Styles drawer still wrote
the shape the doors replaced:

```typst
#הגדרות_סימונים(גודל: ("סימן": 1.6em))   ← what the panel wrote
#הגדרות_סימן(גודל: 1.6em)                ← what a writer would type
```

Backwards, and it reads in the finished document as a class name buried in a
call about marks in general rather than as a sentence about simanim.

But the spelling is the smaller half.

**A door refuses a knob. The shared command could not.** `_mk_set` stops the
compile on a knob its class has no answer for; `#הגדרות_סימונים` stored a
knob-major dictionary and let `_mk_conf` ignore whatever did not apply. So a
fill written onto a gemara reference was accepted, kept in the store, and never
read — and the panel offered fourteen controls whatever the class was, most of
them doing nothing for most of them. A control that reads back what was typed
and changes nothing is the failure this register exists to end; it was inside
the register, one level quieter than the one it is known for.

The knobs are the class's now — `marks.knobsOf`, held against `_mk_knobs`,
`_mk_block_knobs` and `_mk_block_classes` in the prelude — and the migration
*forced* that: with a door, offering the wrong knob writes a document that will
not compile, which is a harder failure than the silent one it replaced.

**The parts are reachable.** A siman prints four things and a pasuk two, and
`#הגדרות_פסוק(מקור: (גודל: 1.2em))` could be reached only by typing it. There is
a part chooser under the class chooser and the same knob rows under that. A
part carries a text look and, where the command invents the words rather than
printing what was typed, its own `טקסט`.

Which found a hole underneath: a part's dictionary was read and **never
checked**, so `#הגדרות_פסוק(מקור: (גדול: 2em))` was accepted, stored and changed
nothing on the page — a misspelling that looks exactly like a setting that did
not take. The same check the outer level had, one level in.

**`#הגדרות_סימונים` is deprecated, not deleted.** *Still compiles, no longer
advertised*, which is the field this registry already has and the argument for
it is already written in its doc comment: a command that exists in documents
cannot simply be removed. It is out of the toolbar, the Insert menu and the
palette, and a document that has the line goes on printing what it always did —
there is a test that sets a siman's size both ways and compares the pages.

One thing worth knowing about all of this: `state.update` runs its closure when
the state is *read*. A document that sets a knob and never uses the class never
reaches the check. That is how every `#הגדרות_*` in this prelude behaves.

## The last two, and a picture nobody could see

`#קו_מפריד` and `#תמונה` came last because neither is a run of text, and the
list is empty now.

**A rule prints no glyphs.** A size, a slant or a weight on it would be a control
with nothing behind it, so it answers to four knobs of its own — thickness,
colour, how far it runs, where it sits — and to none of the text ones.
`_mk_knobs_of` grew a third branch for it, and the panel offers four controls
rather than fourteen because the engine refuses the other ten by name.

It is also **the one class with no per-instance layer**, and that is a property
of the command rather than of the register. Typst prints a bare function name as
text: make `#קו_מפריד` take arguments and every document, template, Org import
and docx import that writes the bare form prints the word *קו_מפריד* across the
page instead of a line. Measured before deciding, not assumed.

**A picture draws two things**, and the register already had the shape: the block
knobs frame the picture, the text knobs reach the caption — which is the only
text a figure prints, so a caption's size needs no second name. `רוחב` and
`יישור` were parameters and are knobs now, so a sefer can say once that its
pictures are 60% and centred; the parameters still work and still win.

### The alignment that was accepted and ignored

Writing that turned up a bug older than any of this work: `#תמונה(…, יישור: …,
כיתוב: …)` **did nothing**. A figure is a block that fills the column and centres
itself, so the `align` the command wrapped it in moved nothing. Every captioned
picture in every sefer has been centred regardless of what the writer asked for,
silently, since the command was written.

Nothing could have caught it. A picture is neither a glyph nor a shape, so
`probe` could not find one at all — the same gap `strokes` filled for lines, one
element along. The test that covered this asserted that the document compiled and
that the caption printed, and both were true the whole time.

`probe::pictures` exists now, and the fix is conditional on purpose: the figure
is wrapped in a block sized to the picture **only when there is an alignment to
apply**, because a figure with none is centred by Typst and that is what every
sefer with a picture in it currently prints. Both halves are asserted — the
aligned one moves, the unaligned one lands exactly where it always did.

That is three things the probe could not see, found in one day: a line, a
picture, and before them a fill. The pattern is worth stating plainly — **the
probe reads what it was last asked about**, so a feature whose output is a new
kind of frame item arrives untested by construction.
