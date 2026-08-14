# One question at a time — 14 August 2026

The notes chooser asked its two questions correctly and showed the answer to
every one of them at once. It now asks one, then asks the second about what
survives the first, and the two views it had before are a press away.

## What was on the screen

Opening the panel put all of this in front of a writer, in this order:

- a lede and a caveat sentence;
- two quick buttons for the everyday footnote and endnote;
- the body-placement block, four buttons and two options;
- a thirty-cell grid — five places by six arrangements, refusals included;
- the selected arrangement as a card, once one was selected;
- **and then all fourteen arrangements as full cards**, in two groups, each with
  a page sketch, a name, a description, sometimes a caveat, and one to three
  buttons.

That is somewhere past fifty controls about a decision the person opening the
panel has usually already made. The grid was added because twelve cards each
encoded a *where* and a *how* together and nothing said which was which; it
answered that, and then sat above the twelve cards it was meant to replace.

## The rule

**A chooser asks one question, then asks the next one about the answers that
survive it.** The first question has five answers and every one of them is a
place a person can picture. The second has at most six, and only the ones that
can print in the place just chosen — two of six down a margin, exactly one for a
separate volume, and, as it happens, all six at the foot of a page, which is the
one place nothing is refused.

Two things carried over from the grid rather than being lost with it:

- **A refused arrangement is shown, with its reason.** A writer who cannot see
  that "fixed regions at the end of the document" was considered has no way to
  tell a wrong question from a gap in the product.
- **The reason is in words, in the panel.** The grid put it in a `title`, which
  is a tooltip: absent on a touch screen, absent to anyone not hovering, and
  absent to a reader reading the button's text. The guided view has room for the
  sentence and prints it.

## What was kept, and why it is a setting

Both older views are still there under `notesChooserView`, which defaults to
`guided`:

- `matrix` — the whole grid at once. It is the only view that shows the *shape*
  of the question, and comparing arrangements is a real thing to want.
- `cards` — every arrangement as a card. It is where the descriptions live.

All three reach the same fourteen arrangements and write the same commands. The
switch is at the top of the panel, where anybody would change it, and repeated
as a row in Settings, where somebody who has decided they want the grid will
look for it.

## The panel moved to where a test can build it

The chooser's DOM was 230 lines in `main.ts`, which no test imports — so the
rewrite above could not have been checked before it shipped. It is
`panelviews.notesPanel` now, taking a view and an actions object like the three
panels that moved there before it, and `panelviews.test.mjs` builds it and
presses it: that the second question offers exactly what can print at the chosen
place, that every refusal says why in the panel, that all three views reach all
fourteen arrangements, that no arrangement is offered for use before both
questions are answered.

`howAfterWhere` is a function rather than a line in the shell for the same
reason. Changing the first answer has to drop a second answer the new first one
refuses — `page` × `fixed` is an arrangement, `document` × `fixed` is a stated
refusal — and a panel showing a card for a cell it has just greyed out is the
kind of thing two copies of a rule produce.

## The answer was below the fold

The assembled run found this and nothing else could have: at 1280×720 the card
for the chosen arrangement, and the button that writes it, landed at y=835 —
past the bottom of the screen. Answering both questions put the answer where the
person who answered them could not see it.

The run clicked it regardless, because a driver scrolls and reports success. The
check that caught it is the one that measures every click before making it, and
what it printed was the box: `button.note-use at 845,835 84×24 in 1280×720`.
That is the whole finding in one line, and it is the difference between a click
that works and a control a person can find.

The panel now brings the card into view when it appears — `nearest`, so a card
already on screen does not jump.

And then the next run found what that broke, which is the argument for keeping
this step: `button.nq-view at 922,-55`. Scrolling the answer on had scrolled the
view switcher — the control that changes what the whole panel *is* — off the top
of its own box. It is sticky now. A fix measured only by the thing it was aimed
at is a fix that has moved the problem.

## Two counts that were written in the wrong places

- The stylesheet said `repeat(5, …)` for the matrix's columns. That was true
  until `parallel-fixed` became a sixth `how`, after which the last column was
  laid out in an implicit track of a different width. The panel now sets
  `--nm-cols` from `NOTE_HOW.length` and the stylesheet reads it.
- `layout` and `previewFrac` aside, every shipped preference is now asserted to
  be named in `main.ts`. A preference nothing can change is a constant with a
  loader in front of it, and this repository already has one story about a
  preference that silently reverted for years.

## What is not fixed

Nothing about this touches which arrangements exist. `notes.ts` decides that,
`notepaths.test.mjs` holds it, and the fourteen are unchanged.
