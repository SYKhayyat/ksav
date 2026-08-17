# 2026-08-17 · A clamp is not a mapping

A second sitting on 17 August, after the release. A long kuntres on הלכות הבדלה
— שו"ע או"ח סי' רצ"ו–ש', six simanim, two apparatus bands at the foot of the
page, notes on notes, a table, a page break, an English footnote in a Hebrew
document — written in the assembled application through its own menus, palette
and toolbar, the way `HANDOFF.md`'s live tracker asks for.

Three things came out of it. Two are bugs in Ksav, both of the same shape and
neither visible to a green suite. One is an operations failure that had never
run successfully and could not have.

## 1 · A table of contents printed above the document's own title

Build a title page — `#שער`, `#תת_שער` — then press `Ctrl+Shift+O`. Page one
opens with the table of contents, and the sefer's own title sits underneath it.

`headings.addContents` spliced `#תוכן()` at character zero. That is the right
place for a running head, which configures and prints nothing where it stands,
and the wrong place for printed matter. Two different meanings of "the top of
the document", read as one.

It now goes in after the title block, which is `spans.NOT_HEADINGS` — the set
of commands that make a title and are not sections, kept for exactly this
distinction and already written down. Only the *leading* run: a `#שער`
half-way down a collection is a second title page and does not drag the
contents past a chapter. A document with no title block still gets it at
character zero, which is what every document that has one looks like today.

## 2 · Every table operation left the caret where the text used to be

Insert a table. Press *add a column after*. Type one character.

    #טבלה(עמודות: (1fr, 1fr, 1fr),
      כותרץת_תא[], כותרת_תא[], כותרת_תא[],

It lands inside the command name, and the table stops being a table.

One line, shared by all eighteen table operations:

    return { text, caret: Math.min(ctx.pos, text.length) };

The old offset, clamped. A clamp is not a mapping. It is right only when the
edit happened after the caret, which for a table operation is almost never —
inserting a column rewrites the call from `עמודות:` onward and moves every
cell — and it always yields a *legal* position, so nothing ever errored and
nothing ever noticed. The list operations next door had returned a real caret
all along; only the table adapter threw it away.

`table.caretIn` answers it once for all of them: stay in the cell you were in,
the same distance from its closing bracket, and never outside the cell's body.
The six operations that genuinely move the writer's cell — a row or column
inserted before it, a row or column moved — say where it went; the other twelve
take the default.

### And then the same class in the lists, which is the part that matters

The table half was found by writing. The list half was found by asking the
question again next door, which is the step this repository has skipped often
enough to have a name for it. Six of the list operations return a caret that is
not in any item:

- moving an item put it at `moved + 1`, one past the item's start — between the
  `פ` and the `ר` of `פריט`;
- converting a list to numbers, letters or bullets parked it after the new
  command name, outside every item;
- deleting an item left it in the gap the item had been in.

Same failure, same invisibility, same next keystroke.

### The fence, and the trap inside the fence

`structure.test.mjs` already swept every action at every caret position of a
corpus, asking two questions: does `enabled` agree with `run`, and does an
enabled operation actually change the document. Neither can see where the caret
lands. The third question is now asked beside them: **if a position was inside a
body before the operation, the caret it returns must be inside one after.**

That phrasing is load-bearing. The gap *before* a cell call is inside the table
and outside every cell, and typing there breaks the cell whether an operation
ran or not — so the property is not "the caret is always safe", it is "an
operation never makes it worse". One exemption, and it is not a queue: a list
with no items left has no body at all, and only deleting a one-item list's only
item can produce that; lists have no *delete the whole list*, so refusing it
would be a dead end.

The fence caught nothing when it was first written. It carried `#רשימה\b`, and
a JavaScript word boundary is defined on `[A-Za-z0-9_]` — there is no boundary
between `ה` and `(`, so the pattern matched no list at all. That is the trap
`headings.canAddContents` carries a paragraph about, rebuilt inside the check
written to catch its cousin. Without the `\b` the sweep types at 1,571
positions instead of 774, and each of the four fixes fails it when reverted.

## 3 · The deploy workflow could not have worked

Pushing `v0.1.1` fires three workflows. `ci` and `release` went green.
`deploy` failed: `build the offline bundle` succeeded, and `publish` failed in
two seconds having run no steps at all — no log, nothing in the API.

Enabling GitHub Pages creates a `github-pages` **environment**, and its default
deployment policy is *the default branch and nothing else*. `deploy.yml`'s only
automatic trigger is a tag. A tag is not a branch. So the job was refused before
it started, and every tagged release would have been refused the same way; the
site had never been published because it never could be.

The environment now carries a deployment branch policy of type `tag` matching
`v*`, and https://sykhayyat.github.io/ksav/ answers 200.

`deploy.yml`'s "before the first run" note said one of the two preconditions. It
now says both, with the part that makes them different: **Pages being off fails
loudly at the top of the workflow with a sentence; the environment policy fails
silently at the bottom with nothing at all.**

## 4 · A dialog that refused, wiped its own refusal, and closed

Put the caret on a `#סעיף` line, open Insert ▸ *a section with its own page*,
fill the form in, press **Add**. The dialog closes, the document does not
change, and nothing anywhere says why.

Everything up to the last step was right. `#מקטע_עמוד` sets up a page and cannot
do that inside a container; `mode.ts` says so; `insertSnippet` turns the refusal
into the sentence the writer needs — *you cannot start a new page from inside a
list, table, heading or note; close it first* — in the status bar. Then the
dialog ran `scheduleCompile()` unconditionally, and a compile with nothing to
compile wrote `✓ 3 עמ׳ · 18ms` over that sentence a few milliseconds later.

`insertSnippet` now returns whether anything went in, and the three callers that
follow it with a compile ask. Fenced by reading `main.ts` from
`insert.test.mjs`: a source check is weaker than a behavioural one, and it is
the strongest thing available at a seam whose whole problem is that no test can
import it — which is why that file exists at all.

## The exports, which are the part the tracker asks for

Both ran. **PDF** hands the browser `קונטרס-הבדלה.pdf`, named from the document
rather than `document.pdf`. **Typst source** hands over 281 KB — the whole
prelude inlined plus the document, importing nothing — and it compiles on its
own, through an engine with no source resolver on it at all, to the same three
pages, with the title, the table, the English footnote and the mareh-mekomos
band all on them. That is `assemble_source`'s claim, checked on a real sefer
rather than the three-line corpus in `tests/assemble.rs`.

The status bar says nothing after an export. Not the 16 August failure — it is
not stuck on *rendering…* — it simply does not mention that a file was handed
over. Left alone: a browser download is its own confirmation, and inventing a
message for it is not obviously an improvement.

## 5 · The notes drawer numbers notes in a series that is on no page

Open the notes list on this kuntres and it shows ten rows numbered **1 to 10**.
The page numbers those same notes **1, 2** in the ביאור band and **א, ב** in the
mareh-mekomos band, because parallel streams number independently and in their
own schemes — which the engine does correctly, and which now has the two tests
it never had.

So the panel whose job is *find the note you are looking at* prints an ordinal
that appears nowhere in the document. A writer reading footnote `ב` at the foot
of the page and opening the drawer to find it will not find a `ב`.

`panelrows.noteList` sets `chip: String(i + 1)` — the row's position in a flat
list — into the slot the reader takes for the note's number. Not fixed here, and
deliberately, because the fix is a design decision and there are two:

- **Reimplement the numbering in the editor.** Group by channel, read
  `#הגדרות_זרמים`'s `מספור`, format. It is the complete answer and it is a
  second spelling of a rule the engine already owns — the exact seam this
  repository is named for.
- **Ask the engine.** A compile already knows every marker it drew; carrying
  them back on the response makes the drawer's number *the* number by
  construction, and no rule is written twice.

The second is almost certainly right and it is not a one-line change, so it is
written down rather than started at the end of a sitting.

## 6 · Nine English words in the one panel a writer opens to search their sefer

Found on the way to something else: reaching for find-and-replace to move the
caret, and being handed `Find`, `Replace`, `next`, `previous`, `all`,
`match case`, `regexp`, `by word`, `replace all` — CodeMirror's panel, as
CodeMirror wrote it, left-to-right in a Hebrew document. Every other surface in
this product is translated. Nobody had asked this one, because it is not ours.

`EditorState.phrases` exists for exactly this. The entries live in `i18n.ts`
under a `find.` prefix, keyed on the library's own literals — a phrase table is
a translation of somebody else's strings, not a dictionary of our own names —
and the English side is deliberately the identity. A `phraseCompartment`
reconfigures on the language switch, alongside the panes, because
`rerenderChrome` rebuilds our DOM and cannot reach a panel CodeMirror owns.

Fenced in `language.test.mjs`: every label the panel draws has a key in both
dictionaries, none of them is still the English word on the Hebrew side, and
the list in `main.ts` and the list in the test agree — so a tenth label added
by a CodeMirror upgrade is a red suite rather than one English word nobody
notices.

## 7 · Moving a section moved the blank line with it

The last thing the sitting found, and it was found by pressing the arrow one
more time to confirm the caret fix above. Move a section down in a document
written with a blank line between sections: it comes back with one newline
between them and two at the end. Press it again and the spacing drifts again.
At the end of a document it is worse — the last section has no trailing
newline, so swapping past it produces `גוף ב.#כותרת1[א]`.

A swap exchanges two adjacent blocks and the whitespace between them belongs to
neither. `moveSection` swapped the spans whole, so each block's trailing
whitespace travelled with it. Each block is now split into its words and the
whitespace that follows, the words are exchanged, and the whitespace stays.

The interesting part is the test that was already there. `moving back restores
the document exactly` is exactly the right property and it passed for as long
as the bug existed, for two reasons worth keeping: it ran on **one** document
whose sections all end the same way, and swapping the two gaps *consistently*
round-trips anyway. A round trip cannot see a transformation that is its own
inverse. So the corpus is four documents with different separators, and the
separator between the sections and the one that ends the file are asserted by
name.

## What the sitting did not find

The apparatus held. Two parallel streams in fixed regions — ביאור and
מראי מקומות — went in from the note chooser, which asks where the note should
appear and how the layers are arranged and then writes the commands itself. A
`#הערה_ב` inside a `#הערה_זרם` produced the two-tier numbering, and the chooser
added the `#הגדרות_הערות` line that makes it print without being asked. Six
simanim numbered א׳–ו׳ and each restarted its se'ifim at א. Gershayim inside
parentheses — `(ברכות נ״א ע״ב)` — compiled, which is the shape that used to
produce Typst's `unclosed string`. An English footnote in a Hebrew document set
left-to-right in the same series.

## What is still open from it

**A table cannot be filled in from the keyboard.** Lists own `Enter`, `Tab`,
`Shift+Tab` and `Alt`+arrows. Tables have eighteen ribbon operations and no
navigation at all: `Tab` inside a cell is not bound to anything table-shaped, so
it falls through and inserts indentation into the markup. In Word, `Tab` is how
every table is filled, and it is the single most-used key a table has.

The design is not free. `bindings.test.mjs` holds *no two actions ship on one
combination*, and `list.indent` already holds `Tab`. The honest resolution is
that a **structure** action is already scoped — `list.indent` cannot fire
outside a list — so two structure actions of different structures may share a
key when the caret can only be in one of them, which `structureAt`'s
innermost-wins rule guarantees. That is a change to the invariant and to the
dispatcher, not a new binding, and it is written down here rather than slipped
in.
