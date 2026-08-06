# The note apparatus — eleven options, and how to check them

`spec.md` (repo root) is the product-level description of the eleven note layouts
Ksav supports. This file is the engineering companion: how they are built, what
each one costs, and how to verify one is actually working.

## Verify by rendering, never by compiling

Every apparatus bug this project has had compiled cleanly and was wrong on the
page. `compile(...).ok()` cannot see an orphaned number, a note in the wrong
column, or a second section reprinting the first section's notes.

`ksav_engine::probe` reads the laid-out document instead: it walks the
`PagedDocument` and returns every text run with its page, x/y position and font
size. `tests/apparatus.rs` is built on it and is where a new apparatus claim
belongs.

To look at a document yourself:

```sh
cargo run --example probe -- mydoc.ksav
# y=  78.79 x= 273.8 [12.0] ‹the main text line›
# y=  84.96 x= 124.2 [ 9.4] ‹the sidenote, beside it›
```

Each line is one visual line: its y, the x of its leftmost run, the distinct font
sizes on it, and its text. That is enough to answer "did this land where it
should".

## The one ground rule

Typst has exactly **one** native page-bottom footnote series, and it is the only
thing that truly floats at the live page foot, balanced against the text across
page breaks. There is no second one. Every two-layer option therefore either
spends that series on one layer and sends the other elsewhere, or puts both
layers somewhere that is not the live page foot.

There is no way around this and no plan to find one — see the closing note in
`spec.md`.

## The three mechanisms

Each option is built on one of three mechanisms.

**1. Native footnotes.** `הערה`, `הערה_על_הערה`, and the tiered `הערה_א…ז`. Typst
does the placement and balancing. Nesting works because Typst hoists a footnote
inside a footnote into its own entry.

The one trap: a footnote entry lays out as «number» «body», so anything
block-level at the start of the body (a `pad`, a `block`) pushes the body onto the
next line and orphans the number. Tier indents are inline `#h`.

Numbering is one running sequence across every tier, because it is Typst's own
footnote counter — a tier-2 note nested in note 1 takes number 2, and the next
tier-1 note is 3. `#הגדרות_הערות(מספור: ("1", "א", "i"))` gives each tier its own
scheme and its own count instead, so the *shape* of a marker says which block to
read it in. That is the one thing size and slant cannot say at the point of
reference, where the reader actually is. It is opt-in because the shared sequence
is the property most documents want: numbers that never repeat.

Typst hands the `numbering` callback its single footnote counter, so that counter
cannot be used to count a tier. The number is instead the note's rank among the
real notes of its own tier, read out of a query — the same read-only ranking the
collect-then-render apparatus uses, and it converges for the same reason.

**2. Collect-then-render.** `מדור`+`הערות_מדורגות` (section bands),
`מדף` (per-page bands), `הערה_זרם` (parallel streams), `הערתסיום`+`הערות_בסוף`
(endnotes), and sidenotes. A note drops inline `metadata` in the main flow; the
apparatus queries for it and renders it somewhere else.

Everything about this mechanism follows from one constraint: **the rendering side
must never write.** A page footer is re-laid-out many times during page breaking,
so any counter or state write there fails to converge. So numbering is never a
counter — it is the *rank of a note among its kind*, derived from a query. Reading
is free; writing is not.

Two consequences worth knowing:

- *Nested notes must be force-registered.* A note's body is stored, not displayed,
  so a nested note inside it would never run. `box(place(hide(body)))` runs it
  invisibly. The `box` matters: without it the hidden machinery can break the line
  its marker sits on.

- *Re-displayed bodies re-register.* When the apparatus displays a stored body,
  the nested notes in it run again and emit their metadata again, so a raw query
  grows on every pass. Each apparatus therefore brackets its rendered block with
  `_ksav_ap_open` / `_ksav_ap_close`, and a registration is a phantom exactly when
  more opens than closes precede it. This is a **document-order** test. Two things
  that do not work and were both tried: keying notes by their content (two notes
  reading "עיין שם" become one note), and comparing page coordinates (a native
  footnote also sits below an apparatus block on the page while being outside it).

**3. Reserved page regions.** `מדף` and `הערה_זרם` render into the page *footer*,
which lives in the bottom margin. Unlike a native footnote it does **not** push the
text up — so with nothing reserved it grows straight off the bottom of the sheet.
`מסמך(אזור_הערות: 3cm)` enlarges the bottom margin by that much and renders the
apparatus in a clipped block of exactly that height, with the page number below it
at a fixed offset.

The engine sets this automatically (`auto_notes_region_cm`) when the body uses one
of those commands, and to nothing otherwise — a document of plain footnotes must
not lose page height to a reserve it never uses.

Per-band fixed heights (`הגדרות_מדפים(גבהים:)`, `הגדרות_זרמים(גבהים:)`) turn this
into the "fixed regions" layout: a band always occupies its slot, so a band that
is empty on this page does not let the bands below it drift up.

## The banded apparatus, and why there is only one of it

Three of the collect-then-render apparatuses group their notes and print the
groups as stacked bands: `#מדור_` (section bands, in the flow), `#מדף_` (per-page
bands, in the footer) and `#הערה_זרם` (parallel streams, also in the footer).
They were written out three times, and it cost exactly what duplication costs:
the א,ב,ג-over-1,2,3 numbering convention shipped backwards, and the correction
then had to be made **by hand in a second copy of the same array, months later**.
One decision, two edits, and nothing anywhere that would have noticed if only one
of them had been made. Two other things were quietly written twice and
differently — the fixed-height slot (array-indexed for bands, dictionary-keyed
for streams) and the per-group configuration lookup.

They are now one implementation, `_ap_*` in `ksav.typ`, and the three differ in
five arguments and nothing else:

| | `#מדור_` section bands | `#מדף_` page bands | `#הערה_זרם` streams |
|---|---|---|---|
| a *group* is | a tier integer | a tier integer | a stream name |
| config state | `_md_cfg` | `_pp_cfg` | `_sf_cfg` |
| notes labelled | `ksav-md` | `ksav-pp` | `ksav-sf` |
| numbered within | the section | the document | the document |
| rendered | in the flow, at the dump call | the page footer | the page footer |
| printed around | an optional title, a per-band label | — | per-stream headings; stacked **or** side by side |

The pieces, all in `ksav.typ`:

- **`_ap_pick(cfg, key, g, fb)`** — what a knob is worth *for this group*. A
  dictionary is keyed by group name, an array is per-tier (1-based, falling back
  outside its range), anything else is one value for every group. Those are not
  three conventions bolted together; they are the three shapes an answer can take,
  and each of the three apparatuses had only ever used one of them.
- **`_ap_note(cfg, lbl, scope, g, body)`** — the collector. Registers in the main
  flow, force-registers nested notes, prints a marker numbered by query.
- **`_ap_entries(shown, scope, g)`** — the numbering rule, and the only place the
  section-scoped apparatus differs from the two document-scoped ones: `shown` is
  what a band prints, `scope` is what it counts against.
- **`_ap_group`** — one group's block: entries, columns, fixed-height slot.
- **`_ap_bands`** — the rule above the apparatus, the groups, the dividers, and
  the `_ksav_ap_open`/`_ksav_ap_close` bracket.

Two tests hold it, both in `engine/tests/apparatus_golden.rs`. One pins the
laid-out page — every run's page, x, y, size and text — for 41 documents covering
every knob of all three, so a change to the shared core that moves anything is a
diff rather than a discovery. The other counts: the numbering array, the
apparatus rule, the divider, the force-registration and the fixed-height slot may
each appear **once** in `ksav.typ`, and all three collectors must go through
`_ap_note`. A pinned layout cannot see a fourth copy being written — a new copy
renders a new page and says nothing. Counting can.

## Where each option lives in `ksav.typ`

| Option | Commands | Mechanism |
|---|---|---|
| 1 Footnotes | `הערה` | native |
| 2 Endnotes | `הערתסיום` + `הערות_בסוף` | collect |
| 3 Section endnotes | same, dumped per section | collect |
| 4 Fixed regions | `מדף_א…ז` + `הגדרות_מדפים(גבהים:)` | collect + region |
| 5 Parallel streams | `הערה_זרם` / `הערת_תוכן` / `הערת_מקור` | collect + region |
| 6 Side notes | `עם_הערות_צד` + `הערת_גיליון`; `עם_הערות_דו_צד` + `הערת_ימין`/`הערת_שמאל` | collect + place |
| 7 Nested footnotes | `הערה` inside `הערה` | native |
| 8 Two endnote blocks | `מדור_א` + `מדור_ב` + `הערות_מדורגות` | collect |
| 9 Footnotes + endnote block | `הערה` with `הערתסיום` inside | native + collect |
| 10 Footnotes + companion doc | two documents | — |
| 11 Endnotes with footnotes | `הערתסיום` with `הערה` inside | collect + native |

## Deferred bodies — the twelfth thing, which is not a twelfth option

`#הערה_בשם("א")` places a marker whose body is defined elsewhere, by
`#גוף_הערה("א")[…]`. This is orthogonal to all eleven layouts above: it changes
where the prose sits **in the source file**, and nothing about the page.

```
בראשית ברא#הערה_בשם("א") אלקים…
#גוף_הערה("א")[עיין רש״י שם.]

#הערה_בשם("א", סוג: הערתסיום)            // an endnote
#הערה_בשם("א", סוג: מדור_בדרגה, 2)       // a section band, tier 2
#הערה_בשם("א", סוג: הערה_זרם, "מקורות")  // the mekoros stream
```

One command reaches all eleven because every note command in `ksav.typ` takes its
body as the **last positional argument**. `סוג` is the command itself (a value,
not a name), the extra positionals a layout needs pass through ahead of the body,
and named arguments pass through untouched. A new layout is reachable the day it
is written, with nothing here to update.

**Mechanism.** A definition is inert: it stores its body in `#metadata`, which is
never laid out — so a nested note inside a deferred body does *not* fire at the
definition site, only where the reference puts it. The reference queries for its
definition; Typst introspection reads the finished document, so a definition may
sit after the reference, before it, or in another chapter. The query result does
not depend on layout, so there is no feedback loop and it converges on the first
pass. This is the only collect-then-render mechanism here that needs no
`_ksav_ap_open` bracketing, for that reason.

**One trap, and it is in Rust, not Typst.** The page-foot reserve
(`auto_notes_region_cm`) is chosen by reading the source for calls, and the
deferred form names its layout as a *value* — `סוג: מדף_בדרגה` has no bracket
after it. Without `apparatus_is_named_as_kind` a document of deferred page-bands
compiles perfectly and lays its apparatus off the bottom of the sheet.

**The same trap, one layer up, and it took longer to find.** Every surface in
the app that asked "what notes are in this document" asked it by looking for a
command that opens a note body — and `#הערה_בשם` opens none. The notes pane, its
jump list, the tier `⁑` writes, the right-click menu and the "collected and
never rendered" warning were therefore all blind on a document written this way,
which is to say: turning on deferred bodies turned the rest of the note UI off.
Both features were tested, separately, and both were green. The editor's answer
is `notes.notesIn`, which builds one list out of both spellings, and
`app/test/deferrednotes.test.mjs`, which is `assert_same_page` in TypeScript —
a corpus deferred in bulk, every surface asked twice, and the two answers
required to match.

**Verification.** `tests/deferred_notes.rs` renders each of the eleven layouts
twice — bodies inline, then bodies deferred — and asserts every text run landed
on the same page at the same coordinates at the same size. Equivalence is the
claim, so equivalence is what is tested; the rest of that file is the failure
modes (a dangling name, a duplicate definition, a body far from its marker).

The editing side lives in the app: `src/deferred.ts` is the pure model (scan,
jump, exile, recall, retarget, remove, lint), `src/deferred-lint.ts` the
CodeMirror wiring, and `src/notes.ts` the index every surface reads. A pair is
written in the language of the note it stands for — `#note_named` / `#note_body`
in an English document — for the same reason the tiered-note button writes
`#tier2` there.

## Structure inside a note

A note body is ordinary content, so `#רשימה`, `#טבלה`, `#קוד` and the rest already
work inside one, to any depth, with no note-specific variants. This is worth
stating because the LaTeX way is the opposite: `bigfoot` documents grow a parallel
`fnitem` / `fnenum` / `fntable` / `fncode` vocabulary, one command per structure
per context.

Two of the three reasons for that vocabulary do not exist here. LaTeX caps list
nesting at four levels, so a note wanting deeper structure must `\setlistdepth`
and declare each level; Typst has no cap. And LaTeX's list skips are absolute
lengths, so a list set at footnote size keeps body-size air around it and has to
be re-tuned with `nosep`; Typst's are `em`-relative and Ksav's defaults are
written that way, so they scale on their own. Measured: a list inside a note has
the same spacing-to-size ratio as the same list in the body, 1.86 either way.

The third reason is real, and it is the one thing here that is note-specific:

**`#כותרת_בהערה[…]`** — a heading inside a note that is not a heading. `#כותרת`
there is still a real heading: it steps the document counter, so a three-line
footnote renumbers every section after it, and it lands in `#תוכן`, so the table of
contents lists a line that lives in the margin. Structure inside a note is a matter
of appearance, not of outline. Weight and colour follow `#הגדרות_כותרות` so these
match the document's real headings; the sizes are a compressed ramp of their own,
because 1.6em of a 0.85em note is still larger than the text being annotated.

It emits a line break after and *nothing* before, which is the footnote-entry trap
again: `block`, `v(weak: true)`, `linebreak` and `parbreak` all orphan the number
at the head of an entry — `parbreak` does not collapse there the way it does at the
head of a page. All four were measured. The break above is the writer's own blank
line, exactly as for a heading in prose:

```
#הערה[#כותרת_בהערה[פתיחה] הגוף הראשון

#כותרת_בהערה[המשך] הגוף השני]
```

Opening a note with one costs no blank line and puts the number and the heading on
one line, which is what a lemma wants anyway.

## Known limits

- **Sidenote stacking is per page.** A note whose marker is near the foot of the
  page, or a run of long notes, can be pushed past the bottom of the column. There
  is no spill onto the next page.
- **The auto page-foot reserve is a fixed 3cm** and is chosen by looking for those
  commands in the document text. A document with unusually heavy per-page
  apparatus should set `notes_region_cm` explicitly; overflow is clipped, which is
  visible, rather than run off the sheet, which is not.
- **Collect-then-render costs queries.** Each note runs a query per layout pass to
  find its own rank. This is fine for ordinary documents and has not been profiled
  on a full sefer.
- **A Hebrew marker is a synthetic superscript; a digit is a real one.** With
  `#הגדרות_הערות(מספור: ("1", "א", …))` the two tiers' markers are made
  differently, and it shows. A digit uses the font's own `sups` glyph — full
  nominal size, sitting on the baseline (measured: 12.0pt at the text baseline in
  a 12pt document). Hebrew letters and roman numerals have no such glyph, so Typst
  synthesises one by shrinking and raising (7.2pt, 4.2pt above the baseline). Both
  read correctly; they are not optically the same weight. A document that wants
  them to match should pick schemes from the same side of that line — all letters,
  or all digits with different separators.
