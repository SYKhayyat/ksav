# 2026-08-21 · A place on the page is not a stream

The styles panel has had a section called *"where the notes go"* for as long as
channels have existed, and it answers one question well: a destination is a
**stream**, it owns its numbering and its type, and four knobs — numbering, type
size, columns, heading — hang off `#ערוץ`.

A **region** is a different thing. It is a place on the page: how tall it is,
what it does when a note outgrows it, what it does when it asks for more room
than the page has, whether it holds its slot on a page it has nothing on, what an
entry says before it says anything of its own. `#אזור` is that line and it takes
eighteen keys.

The editor wrote four of them, and only ever at the moment a preset created the
region. Everything else was reachable by typing into the source and by nothing
else — which is the shape this repository has now recorded three times in a
month: a working engine behind a surface that does not reach it.

## What it now offers

Seventeen controls, one per key, in the same shape the destination knobs already
use: one table pairing each key with the prelude's argument name, its kind and
its label, and a panel that draws a row per entry. A knob in the model with no
control is then not expressible rather than something nobody noticed.

`מיקום` is the one key deliberately absent. The chooser owns *where the notes
go*, and offering it twice is two controls that can disagree.

## Three things the controls had to get right

**A set is not a string.** `גלישה` takes a tuple of overflow moves and `ראש` a
tuple of entry-head ingredients. Both are rendered as a box per member, because a
writer picking several of seven wants the seven where they can be compared — and
written back in the prelude's own order, since for `גלישה` **the order is the
policy**: the moves are tried in the order they are listed, so a box ticked last
must not become the move tried last.

**A tuple of one keeps its comma.** `("הקטנה")` is a parenthesised string and
`("הקטנה",)` is a tuple — the difference between a region that shrinks and a
region that does nothing and says nothing about it.

**Three of the ten moves are not on the list and cannot be.** Clamping, shifting
and cascading always apply; they are how a note is kept off the edge of the paper
and off its neighbour. A writer looking for clamping and not finding it should
read why, so the note saying so sits beside the control rather than in the
documentation.

## The list that is not hand-kept

The vocabularies — the overflow moves, the overflow policy, the ingredients of an
entry head, the units a grid region synchronises on, the keys `#אזור` accepts —
are now **read out of the prelude by the generator** and emitted into
`engine.gen.ts` as `VOCABULARY`. A panel offering a choice has to know what the
choices are, and a second copy of a list that lives in another file is the thing
that goes stale.

The reader that does it had a bug worth recording: it read from `#let NAME = (`
to the next line beginning with `)`, which is right for the tuples written across
several lines and wrong for the ones written on one — so the overflow vocabulary
came out as three moves and eleven fragments of a panic message. It balances
parentheses now. The lesson is the ordinary one: a parser written against the
half of the corpus you happened to look at.

## The fences

- `channels.test.mjs` holds `REGION_KNOBS` against `VOCABULARY.regionKeys` in
  **both** directions, so a key added to `#אזור` has to arrive with a control and
  a control cannot name a key `#אזור` does not accept.
- Every knob and every choice member must have a label in both languages.
- `coverage.test.mjs` asserts the panel draws from the table and that the rows
  are reached on the destination that is a place.
- `enginefacts.test.mjs` used to sweep a hand-written seven argument names and
  two value names against the prelude; it now sweeps every knob's argument and
  every choice's value. An English key whose value has to be Hebrew is worse than
  no English key — the name exists, so using it looks supported, and then it
  errors.

## What the fences do not cover, and it is worth saying

The **model** is proven: 282 assertions in `channels.test.mjs` render a region
declaration, read it back, rewrite one knob and check the sixteen beside it are
still there, in both languages. The **wiring** is checked the way the destination
knobs are checked — by reading `main.ts` for the loop and the call. That is the
existing convention here and it is weaker than it looks: this repository already
has a record of a panel guard that passed on a mention of the thing it wanted.

No harness renders the styles panel today, which is why the check is what it is.
A harness that mounted it and clicked a box would be the right fence and is not
built.

## One thing found on the way

The destination panel has been writing a bare `טורים` into English documents for
as long as it has had a column control: `טורים` was not in this module's argument
table at all. It is now, spelled `columns` — which is `עמודות` everywhere else and
`טורים` on these two commands, through the `extra` the prelude gives them. This
module is read for `#ערוץ` and `#אזור` and nothing else, so the narrow reading is
the right one here.
