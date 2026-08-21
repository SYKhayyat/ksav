# 2026-08-20 · The cells were the product

`NOTES-PLAN.md` Part 6 and Part 2's *The UI*, plus thing one of Part 1. Two items,
and the second is small only because the first one made room for it.

## Part 6 · One pick, and the grid is gone

The chooser was `NOTE_CHOICES` in `app/src/notes.ts`: eleven cards laid over a
`where` x `how` grid — five places by six arrangements, thirty cells, eleven
filled and nineteen refused. It was a real improvement on the ~25 raw command
names it replaced, and it was still the wrong shape, for a reason the plan states
in one line: **an arrangement had to be somebody's card to exist at all.**

That is not a hypothetical. Three times, code that was already written, tested
and aliased was unreachable because no card named it — `#הערות_בסוף_צד`, the
`#הערה_זרם` fixed regions, and the section-end split, each one greyed out in the
grid with a reason that was **false against the shipped engine**. The comments in
the file that has now been deleted say so, in the first person, three times.

So: writing a note is **one pick — where should it print** — and everything else
is settings behind the destination.

| pick | what the app writes |
|---|---|
| the foot of the page | `#הערה[…]` |
| the back of the sefer | `#הערה(ערוץ: "סוף")[…]` |
| the end of this section | `#הערה(ערוץ: "סוף_מדור")[…]` |
| the side column | `#הערה(ערוץ: "צד")[…]` |
| a companion volume | `#הערה(ערוץ: "קובץ")[…]` |
| a named region | `#הערה(אזור: "<name>")[…]` |

The table lives in `channels.ts` as `DESTINATIONS`, next to the machinery it
names, and the spellings are the ones
[`2026-08-20-the-words-for-the-note-system.md`](2026-08-20-the-words-for-the-note-system.md)
settled from the engine's side. The vocabulary is one table, not two: a
destination's **channel name is its placement** — the destination is the stream,
so the stream is named for its place — and a destination's **id is its English
spelling**, which is why `foot`, `end`, `section`, `side` and `file` are the ids.
An English document writes `#fnote(channel: "end")` with no second table saying
what "end" is called.

### The foot writes a bare `#הערה`, and that is the model

The plan's table gives the foot as `#הערה(ערוץ: "רגל")`. The app writes `#הערה[…]`
instead, and the reason is worth stating because it looks like a shortcut and is
the opposite of one.

`רגל` names the foot as a **place**. The default channel already lives there, and
it is the only stream that is Typst's own balanced series — `_ch_is_native` is
true exactly when a channel's source chain reaches `_ch_default` with every link
at the page foot. A *second* root channel named `רגל` at `רגל` is therefore not
the live page foot at all; it is a fixed box at the bottom of the page, which is
the nine-note cap and the opposite of what "bottom, the live page foot" means.

`pickFor` reads `ערוץ: "רגל"` **back** as the foot, so a document written the long
way is understood. Nothing writes it. And this is what keeps the property
`notepaths.test.mjs` existed for: the toolbar `†`, `Ctrl+Shift+F`, the palette and
the chooser all write the same bytes for an ordinary footnote.

### Four singular destinations plus a named list

*"A region"* expands to *"which region"*, off the document's own `#אזור`
declarations. That is what recovers the one case a flat five forecloses — two
separately-numbered apparatuses in the same place — because two regions placed at
the back are two apparatuses at the back and one destination is one. A document
with no regions says so and says where they are made, rather than offering an
empty list.

### Presets are picks

Decision 11: derived from the axes, never a separate list. A `Preset` is
`{ id, pick, makes? }` and `pick` is an ordinary `NotePick` — so pressing one
leaves the writer holding a value they can change, and the destination row shows
which one they landed on. Five ship: a footnote, an endnote, the Mishna Berura
page (a region at the page foot under the live foot), a side column, and mekoros
at the back. `presetLines` writes the region declaration and — **only when the
region is not at the page foot** — the call that prints it. A region at the foot
is painted by the page furniture, so calling for it renders its notes a second
time; a region anywhere else prints only where it is called for. Both directions
are wrong and the fence checks both.

### A refusal is a sentence

The one genuinely good half of the grid, carried forward with its shape intact:
**a table of reasons, never a fallthrough chain.** A chain always has an answer,
so it can never be incomplete, so nothing can notice when one of its answers is
false — which is how two cells came to be greyed for reasons that were untrue
against the engine that shipped.

`caveatsFor(doc, pick)` answers against the **document in hand** rather than
against a cell, which is the other half of what went wrong: "fixed regions at the
end of the document" was refused statically and forever, and the refusal was
false. Four reasons exist, each an i18n key with a sentence in both languages:

- **`whySecondFootIsABox`** — the plan's own example. *"There is already an
  apparatus at the live page foot. Typst has exactly one balanced series, so the
  second becomes a fixed box."* It costs; it does not block.
- **`whyRegionNeedsAName`** — the one refusal that blocks, because
  `#הערה(אזור: "")` names a region that cannot exist.
- **`whyRegionNotDeclared`** — a warning, not a refusal: the note is still written
  and still prints, and the region can be made afterwards.
- **`whyNotPlaced.side` / `whyNotPlaced.file`** — *the engine cannot place a
  stream there yet.* Derived from `PLACEMENTS`, which `enginefacts.test.mjs` holds
  against `_ch_places` in both directions, so this stops firing the day the engine
  grows the placement and nobody edits a list. Until then the note is written, it
  prints in a region at the page foot, and the writer is told — rather than being
  shown a control that lies about where their words went.

The panel prints these **as sentences under the pick**. The grid put them in a
`title` attribute, which is a tooltip: absent on a touch screen, absent to anyone
not hovering, absent to a screen reader reading the button's text.

### The sketches survived, and so did the preview

The small page diagrams were the best thing about the cards and they are kept, in
`DESTINATIONS[].sketch` — on every destination button and on every preset, so a
pick shows what it builds before it is made. The picked destination then compiles
against the writer's own opening and shows the first page at thumbnail size, which
is the only thing that can tell "at the foot of the page" from "where the prose
happens to stop". Only the picked one: six compiles to open a modal is not a
preview, it is a stall.

### Settings live on the destination

`writeDestination` writes `#ערוץ("סוף", מספור: "א", גודל: "0.9em", …)` — numbering,
size, columns and title, which are the four of `_ch_own`'s knobs the editor has a
control shape for. `גלישה` (overflow) and run-in are deliberately absent: they are
not in `_ch_own` yet, and `_cfg_strict` rejects an unknown key, so writing one
would stop the compile rather than move a note.

The Styles panel's **Note channels** section became **Where the notes go**, and
that is the surface the sentence *"the writer never meets the word channel"* is
about. It picks a **place** — the five destinations plus every region the document
has — and sets what that place looks like; the source and placement rows are gone,
because under this model the destination *is* the placement and a note's depth is
lexical. The knobs are drawn one row per entry of `DESTINATION_KNOBS`, which
carries each knob's prelude argument name **and its i18n label**, so a knob that
exists in the model and not on the panel is not expressible. That is deliberately
stronger than what stood there: the fence used to read `main.ts` for the table's
name as text, and a mutation that cut the loop down to one knob passed it, because
the string was still in the file.

The declaration is **position-independent** — `#ערוץ` is read with `.final()` on
purpose — which is the exact opposite of the `#הגדרות_*` trap that
`emit-note-fixtures.mjs`'s `head`/`exercisesHead` fields were added for. Every
generated case is therefore `exercisesHead: false`, and the property is asserted
directly from the editor's side instead. **`engine/tests/chooser.rs` still asserts
`moved > 0` and will fail on that**; see *What is left* below.

### A sub-note's parent is not a pick — but a layer is still an axis

It is whatever note the caret is inside — determined, never chosen.
`tieredNoteAt` reads the caret and nothing asks. A tier marker handed in as
`sel.marker` is written through verbatim rather than replaced by the pick's own
spelling, because a pick has no vocabulary for a tier and flattening one would
put a sub-note in its parent's series.

**That moves the layer axis; it does not delete it.** It used to be an axis of
the *chooser* — a card carried up to three markers and "layer" meant "the writer
pressed the second button on this card" — and it is an axis of the **caret** now.
Which makes it more `note_insertion.rs`'s business, not less: that suite is about
caret positions, and *inside another note's body* is a position like any other.
It is a content group opened by a call; it is the one place a marker and its
prose can be in different apparatuses; and with a deferred body it is a caret at
the end of the file writing into `#גוף_הערה("1")[…]` while its marker sits pages
away. None of that is reachable from a layer-0 sweep.

So the emitter writes the nested case rather than the picked one: an outer note
at the page foot, then a second note written **at the caret inside it**, in three
shapes — the native chain two deep (`#הערה[#הערה_ב[#הערה_ג[…]]]`, from
`tieredNoteAt`, so it is the string the toolbar's `⁑` would put in), a sub-note
sent to each of the five singular destinations, and a sub-note in a named region,
which is `#הערה[#הערה(אזור: "שער_הציון")[…]]` — the Mishna Berura page, and the
plan's own example of depth being lexical. 1,482 cases: 780 at layer 0, 624 at
layer 1, 78 at layer 2.

### The acceptance criterion, which is inverted

> *"`notepaths.test.mjs` must stop existing in its current form, and
> `channels.test.mjs` must grow to cover what it tested. If `NOTE_CHOICES` is
> still imported anywhere, the cell grid is still alive."*

`app/test/notepaths.test.mjs` is deleted. `NOTE_CHOICES`, `NoteChoice`,
`NoteWhere`, `NoteHow`, `NOTE_WHERE`, `NOTE_HOW`, `choiceAt`, `whyNot`, `BLOCKED`,
`markersOf`, `choiceForCommand`, `conversionTargets` and `applyChoice` are gone
from the tree — nine importers were followed: `panelviews.ts`, `main.ts`,
`insert.ts`, and the six test files and two fixture generators that read them.

`channels.test.mjs` grew from 51 assertions to 192 and carries everything the old
file held: one producer and one path in, the byte-identical surfaces, the
selection wrapped, `main.ts` having no second way to splice a marker, the tier
reading the caret, the notes index, and — in place of "every cell is filled or
explained" — every destination reachable and every caveat a sentence in both
languages.

## Thing one · Where the prose sits, and its first home

Where a note's prose sits in the *file* changes the file and never the page: the
engine's own `every_note_layout_lays_out_identically_with_deferred_bodies` renders
each layout twice and asserts every run landed on the same page at the same
coordinates at the same size. Decision 3 says it must therefore **not** appear in
the note-layout chooser.

It had no other home at all. The global answer existed as two buttons *inside*
that chooser — the one surface it is not allowed to be in — so a writer who wanted
their bodies at the end of the file had to open a panel about note layouts to say
so, and a writer who never opened that panel had no way to discover the
preference existed.

It is a Settings row now, beside the other preferences about reading and writing
the source, with **one override per destination** under it and the three sweeps
(send every note's prose to the end, bring it all back, put the list in reading
order) beside them — because a preference with no way to apply it to the document
in hand is half a feature.

`deferred.BODY_HOMES` is the vocabulary and there are three answers:

| home | where the `#גוף_הערה` calls sit |
|---|---|
| `inline` | in the sentence |
| `file` | one list at the foot of the file — the org-mode arrangement |
| `section` | at the end of the section the marker is in |

`section` is new. Reading order still decides the place *within* the section — a
note added to the first paragraph of a finished chapter belongs above the note
from that chapter's last page — and a document with no headings has no sections,
so it files at the foot of the file, which is the same place rather than a silent
second-best. Every path that files a body takes the home: `fileNewBody`,
`createBody`, `insertDeferred`, `deferInlineNote` and the bulk sweep.

`settings.deferNoteBodies`, the boolean this replaces, is still written and still
read. A writer who set it before there was a third answer does not have to set it
again, and the row that sets the new one keeps the old one in step — a preference
with two spellings that can disagree is the defect family this repository is named
for.

### The fourth position is not built

`NOTES-PLAN` names four: inline, end of file, end of section, **a separate file**.
The fourth is not here and is not stubbed.

The bodies would have to be written into a document this one only *includes*
(`#כלול`), and every function on the deferred path takes one string and returns
one string — `applyPick`, `fileNewBody`, `deferAllInlineNotes`, and, more to the
point, `deferred.problems()`, which reports a marker with no body as an orphan.
Splitting a pair across two documents makes every marker in the sefer an orphan by
construction, so it is a change to the deferred *model*, not another branch in the
filing. Offering it as a fourth option that quietly files at the foot of the file
would have been a control that lies, which is worse than one that is not there.

## A note in code mode was invisible to half its own module

Found by validating the generated fixture rather than by reading anything, and
it was live before this work.

Inside `#רשימה(…)` or `#טבלה(…)` the caret is in code, where a leading `#` is a
syntax error — so `insertionAt` correctly writes the marker **bare**:

```typst
#רשימה(
  פריט[ראשון],הערה_בשם("1"),
  פריט[שני],
)

#גוף_הערה("1")[הגוף]
```

`deferred.ts` scanned the text for `#` and took the name after it, so as far as
that module was concerned this document had **no marker at all**. The page was
right the whole time, which is why nothing noticed. What was wrong was everything
that describes the page: the notes pane and the jump list were empty on it,
`deferAll` skipped it — and `problems()` reported the prose as an **orphan**,
which is the finding the lint offers to fix *by deleting the writer's words*.

The inline half of the same question was already right: `notes.notesIn` reads
`spans.ts` and never asks about the hash, so the same note written inline **was**
found. Two scanners over one markup, disagreeing — which is the family this
repository is named for. There is one scanner now: `callsOf` reads
`spans.ts`'s nodes, which know both modes and comments.

The write half had to move with it, or the fix would have been worse than the
bug. `Ref` and `Def` carry `hash`, and all four rewrites — `retargetRef`,
`deferInlineNote`, `inlineDeferredNote` and both bulk sweeps — put the marker
back the way they found it. Writing a `#` into an argument list is
*"the character `#` is not valid in code"*, which is the 288-of-1,248 failure
`note_insertion.rs` exists for, produced by the button that repairs the note
rather than by the writer. Defer and recall now round-trip a code-mode note
byte-for-byte in both directions, one at a time and in bulk.

## Two things found on the way

**A channel's name is a value, and a value has a language.** The first version
wrote `#channel("סוף", placement: "document")` into an English document and then
`#fnote(channel: "end")` beside it — two literal channel names, one stream the
notes went into and a different one the declaration placed, so the notes landed in
the stream nothing printed. The name is spelt for the document now, and the
default channel is the one exception: `_ch_default` is a Hebrew literal in the
prelude and is not a translated value, so `#channel("fnote", …)` would declare a
*new* channel rather than configure the one every ordinary note goes into.

**A fence that four of six instances can hide behind.** The first draft of the
page-sketch check asked whether each sketch appeared *anywhere on the panel*. Four
of the six are also drawn by a preset or by the picked card, so deleting the
destination row's diagram outright failed for `section` and `file` and passed for
the other four. It is asked of the button itself now. `ONLY_AT_TOP` again, in a
test written the same hour as the thing it holds.

## The mutations

Every fence was broken and watched to go red, and each one names its instance.

| what was broken | what went red |
|---|---|
| `noteFor` stops recognising `#הערתסיום` | *every note command is routed through the note path* — `["הערתסיום","endnote"]` |
| `main.ts` splices `#הערת_גיליון[` directly | *main.ts writes `#הערת_גיליון[` only through insertSnippet*, quoting the line |
| the second-apparatus caveat is dropped | *a second one at the foot says what it costs* — 0, want 1 |
| `pickFor` stops reading `אזור:` | *region reads back as itself* — got `foot` |
| `whySecondFootIsABox` loses its English sentence | *whySecondFootIsABox has a reason in English* |
| a foot region gets a dump call | *preset shaarhatziyun prints its region exactly when it is not at the foot* |
| the panel stops drawing its caveats | three assertions, including *the reason is on the panel* |
| the blocked pick's button stops refusing | *and the button refuses* — got `undefined` |
| the destination row loses its sketch | all six *whose page sketch is on it* |
| a Hebrew command literal returns to `notes.ts` | *no Hebrew command literal anywhere on the note path* — `notes.ts: "#הערה[|]"` |
| an English document gets Hebrew channel values | *no destination writes Hebrew into an English document*, naming four |
| the placement line names a different channel | the same, plus *it is the destination's own line* |
| `section` filing falls through to the file | *before the next heading, not after it* |
| the drawer loses its per-destination rows | *builds one override row per destination* |
| the chooser grows a `data-defer` control again | *the note-layout chooser does not ask the question at all* |
| `scaffold` de-dupes by command name again | *`סוף_מדור` is placed* / *is printed* / *one placement line per destination* |
| a knob's i18n label is misspelt | *columns is labelled in Hebrew* and *in English* |
| the panel draws one knob instead of all of them | *offering every knob a destination has* |
| the Styles section says "channel" again | *without the word 'channel' on the surface* |
| the deferred scanner hunts for a `#` again | ten assertions, including *the pair is consistent* showing the orphan the lint would offer to delete |
| a recall writes the `#` back into an argument list | *and one note back*, quoting `,#הערה[` |

## What is left

- **`engine/tests/chooser.rs` asserts `moved > 0`** — that at least one generated
  case moves its configuration line and renders differently. Under the channel
  model no such line exists: `#ערוץ` and `#אזור` are read with `.final()` by
  design. The fixture is regenerated and correct; that one assertion's premise is
  what changed, and it is engine-side work.
- **`צד` and `קובץ` are not in `_ch_places`.** Until they are, the app writes no
  placement line for those two destinations — deliberately, since `#ערוץ` panics
  on a placement it does not know — and `caveatsFor` says so in words. Adding them
  to `PLACEMENTS` is one edit that `enginefacts.test.mjs` will demand on the day.
- **Overflow and run-in have no control**, because `גלישה` is not in `_ch_own`
  yet and `_cfg_strict` would reject it.
- **The insertion sweep has no case for a note inside a *table* cell's own note.**
  The context table covers thirteen caret positions and the nesting is built on
  top of each of them, so the combination is swept — but only ever one note deep
  per context. Two independent nestings in one document is not covered and would
  be a fourth dimension on an already large grid.
