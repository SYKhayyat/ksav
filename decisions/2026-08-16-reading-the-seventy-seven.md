# Reading the seventy-seven

**2026-08-16**

`decisions/2026-08-11-marking-up-the-ui-inventory.md` carries seventy-seven
unchecked boxes and was the source of most of the last month's work. It is a
**log**: never edited after its date, by that directory's own contract. So its
boxes are stale in both directions — a dozen of them describe work that shipped
days later and still read `- [ ]`, and nothing distinguishes those from the ones
nobody has touched.

This is the reconciliation. Every box was read against the code as it is now,
and the verdicts are below. That record is not edited; this one answers it.

## How each verdict was reached

Not by recognising the sentence. This repository quotes a margin note in the
comment above the fix, which makes a full-text search for the report's own words
a strong signal — but a comment quoting a complaint is evidence that somebody
read it, not that the thing works. So each verdict rests on one of:

- a **test** naming the behaviour (`engine/tests/references.rs`,
  `page_setup_asks.rs::the_footer_too_and_the_page_number_survives_it`,
  `app/test/bidi.test.mjs`, `renumber.test.mjs`);
- a **mechanism** in the source that could not be there if the defect were
  (`hiding.ts`'s `FOLD_OPEN`, `settings.panelPlacement`, `lists.makeList`,
  `insert.insertionAt`'s language resolution, `paneplaces.ts`);
- or a **decision written down** where the ask was a question rather than a
  defect.

## Seventy-six were done

**The five-item order of work.** All of it. The open set is `opendocs.ts`, panes
are `panes.ts` with the arrangements offered as a picker, tabs are `tabs.ts`, and
chips 29 and 30 are gone — `header.ts` says so in the comment where they used to
be. The undo fix (item 1) was overtaken rather than done: there is no single
history to reset, because a document is an `EditorState`.

**The broken one.** Emacs mode does nothing was the largest item in the record
and its cause was somewhere else entirely: `loadSettings` threw, so
`settings.editingMode` was `"default"` by the time boot read it (see the 12
August record). `keymodes.loadError()` — documented, and with no caller anywhere
— has one now, in `editingModeNote`, so a mode that fails to arrive says so
instead of a static sentence claiming it worked.

**The three traced.** The undo-across-swap is the open set. The red gutter wedge
has a legend, in help, deliberately without a button — *a gutter wedge is a thing
to recognise, not a thing to run*. The source note that looked exactly like a
footnote got the half that was actually wrong: `sourcenote-lint.ts` marks the
line to say whether this note is in the index, as `info` rather than `warning`,
because a source note without a ref is a perfectly good citation footnote. The
other half — configure the difference — was **answered rather than built**:
`ksav.typ` holds that a `#מראה_מקום` is a footnote and takes the note styles, and
a second styling channel would be two authorities for one fact.

**The eleven reported.** Every one: the caret on a spell-checked word
(`spell.ts`), source and preview scroll (`scrollmap.ts`), italic
(`lib.rs:1609`, with a test), heading at any level (`headings.ts`), `#סימן`
renumbering (`numbering.ts` and a test file that opens by quoting the report),
prose mode on reopen (per document in the open set), the Layout chip's side
effect (the chip is gone), the crash notice over nothing (the stash now carries
its document's id and asks *that* document whether it already has the text), Word
import's bracket warning, the history modal's language (the 12 August finding),
the untitled notes drawer, and drawers that could not be closed without scrolling
— `panelHead` builds every drawer's head and it is sticky, *"sticky here rather
than in each drawer… one of them being fixed and the next not is how this became
a report in the first place"*.

**The five from the second pass.** `#סמן` and `#הפניה` render — the mark prints
its own number, because *"see 3" needs a 3 to point at* — with
`engine/tests/references.rs` opening on the margin note. `#סעיף` renumbers with
`#סימן`, which is what made it a family. The style commands no longer jump the
view: `editDoc` dispatches the *minimal* change and leaves the selection alone,
so CodeMirror maps the caret through an insertion above it. Comments in a
right-to-left document have a base direction per line. And the page footer:
*"this was `if custom … else if מספור`, so writing anything into the footer
switched the page numbers off"* — both print now, and a test says so.

**Parts three and four.** The command vocabulary, the note apparatus axes, the
style override model with its `כפה`, heading styles per level, the marks index
over a class, the fold and the two hides named, section moves, live shortcuts in
the menus, Contents moved out of Format and into Insert with the reason, zoom,
floating drawers, per-level list numbering, a list that starts at 0 or 1,
paragraph breaks inside an item, snapshots by hand, Org in both directions, the
page range on every route that has pages, justify folded into one control with
the three edges, the keyboard modes with every command as `:` and `M-x`,
clickable help, the drawer holding every command, menus that reopen where they
were left, choosing what enters the contents, the font list, running heads
movable into the document, and git.

**The command set.** `#אות` was renamed from `osource` — *the letter that opens a
clause*, the inline sibling of `#סעיף` — with the old spelling kept working.
`#gemara` and `#commentary` earned their places by being established as a
collectable mark and a facing-commentary layout, which answers open question 6.
`#הגדרות_סקירה` names its three views in the menu. Side notes have a test for
*one side without the other*.

## One was open, and it is fixed here

**`#dh` still called itself a lemma.** *"Nobody has ever called a `#dh` a lemma.
The English name is wrong for the people who use it; דיבור המתחיל is the term."*
The command's English alias was corrected to `dh` in an earlier wave — a later
test even cites it as the family's convention — but its description still read
`Lemma (d"h)`, which names the thing by the word its users do not use and
parenthesises the one they do.

Now `Dibbur hamaschil (d"h)`, in the registry and in the three interface strings
that carried the same word. The registry is generated into four clients, so the
correction reaches all of them from one line in Rust.

## The open questions at the end of that record

Of the six, four are answered: narrowing was built, the unfocused-tab compile
policy is `settings.tabCompile` with the three endings the question named, the
note apparatus axes were settled by the notes chooser, and question 6 is above.

**Question 1 stands** — which shipped arrangements are worth having as default
tabs — and it is a question for a writer rather than for the code.

**Question 5 stands and is not ours**: inventory items 59 to 156 have no verdict,
and silence on them is not consent.

## What this changes about the tracker

Nothing in `HANDOFF.md` inherits from the seventy-seven. The reconciliation item
is done, and what it produced is one commit's worth of renaming and this record.
That is the honest outcome of a checklist written five weeks and nine waves ago:
the work happened, and the list it was written on could not say so.
