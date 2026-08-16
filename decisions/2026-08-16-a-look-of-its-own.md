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
