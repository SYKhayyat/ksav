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

Eighteen controls, one per key, in the same shape the destination knobs already
use: one table pairing each key with the prelude's argument name, its kind and
its label, and a panel that draws a row per entry. A knob in the model with no
control is then not expressible rather than something nobody noticed.

**All eighteen, `מיקום` included.** The first draft left the placement out on the
reasoning that the chooser owns *where the notes go* — and that was wrong on the
facts. The chooser writes a placement exactly once, when a preset *creates* a
region; after that it only picks which destination the panel is about. So a
region’s placement was changeable nowhere in the application, and not through the
channel either, because a channel pointed into a region takes the **region’s**
placement and its own is ignored. A writer who put a region at the foot of the
page and wanted it at the back of the sefer had to edit the source.

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

## What holds it, in three layers

**The model.** `channels.test.mjs` renders a region declaration, reads it back,
rewrites one knob and checks the seventeen beside it are still there, in both
languages.

**The panel, built and pressed.** The controls moved out of `main.ts` into
`panelviews.ts`, which exists for exactly this reason — a panel drawn where no
test can build it is a panel nothing has ever built. `panelviews.test.mjs` now
builds this one against the DOM stub, presses one control the way a writer does,
hands what the shell was asked for to `writeRegion`, and reads the line that lands
in the document. Nothing is asserted about a callback in isolation: the claim is
*press this and the sefer says that*.

Four mutations, each caught by the assertion that names it:

| mutation | what failed |
|---|---|
| drop the trailing comma on a one-member tuple | *unticking down to one keeps the comma* (and three model assertions) |
| write the set in tick order rather than the engine’s | *ticking a move writes the tuple in the engine’s order* |
| skip one knob’s row | *every knob is drawn* |
| quote a switch, so Typst reads a string | *a switch goes in bare, not quoted* |

**The real browser.** Vite dev server, the engine on 7878, the actual application
in Chromium. A document with a region and a note; the styles panel opened; the
region picked; controls pressed. All eighteen rows rendered in Hebrew. Ticking
shrink, then next-page, then compress wrote
`גלישה: (u05d3u05d7u05d9u05e1u05d4, u05d4u05e7u05d8u05e0u05d4, u05e2u05deu05d5u05d3_u05d4u05d1u05d0)` — the engine’s order, not the order of the
clicks. Unticking to one kept the comma; unticking to none wrote `()`. A switch
went in bare and clearing it removed the key. The placement select moved the
region to the back of the sefer. And after every one of those the status line read
**✓ 1 עמֳ · 14ms** — the engine accepted everything the panel wrote, and the
document stayed one page, which is the blank-sheet fix holding in the assembled
application too.

## One thing found on the way

The destination panel has been writing a bare `טורים` into English documents for
as long as it has had a column control: `טורים` was not in this module's argument
table at all. It is now, spelled `columns` — which is `עמודות` everywhere else and
`טורים` on these two commands, through the `extra` the prelude gives them. This
module is read for `#ערוץ` and `#אזור` and nothing else, so the narrow reading is
the right one here.
