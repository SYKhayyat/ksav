# The note system — decisions, plan, and evidence

**Status:** plan agreed in shape, not in detail. Nothing is built.
**Engine:** Typst 0.15 (`ksav/engine/Cargo.toml`).
**Evidence:** `ksav/engine/tests/notes-corpus/` — every claim below is re-runnable.

---

## Contents

| Part | What is in it |
|---|---|
| **0** | **Decisions already made.** Settled; do not re-litigate. |
| **1** | **The five things.** The model: source position · stream/destination · region · overflow · counters. Plus document-level settings. |
| **2** | **A concrete surface.** Proposed syntax (names are placeholders) and **the UI: writing a note is one pick.** |
| **2b** | **The terrain.** Where the code is, five non-negotiable engine rules, four dead ends, what this makes stale, what a parallel session already built. **Read before writing a line.** |
| **2c** | **Acceptance criteria.** Corpus documents that fail today and must pass. |
| **3** | **What works** — with the file that proves each. Designs A, B and **C (the recommendation)**. |
| **4** | **What does not work** — ten disproven things, so nobody retries them. |
| **5** | **Bugs to fix**, independent of the plan. |
| **6** | **The chooser** — the original problem, still open. |
| **7** | **Where to start.** |
| **8** | **Rejected proposals**, with reasons, and what was worth taking. |
| **9** | **Market.** |

## For whoever picks this up

**Run this first.** It prints every measurement this document cites, in about a
minute:

```sh
cd ksav/engine && sh tests/notes-corpus/run.sh
```

**Evidence tags.** **[V]** verified here by rendering and reading back where the
words landed · **[V-EXT]** verified elsewhere, source named · **[U]** unverified ·
**[X]** disproven here.

Do not re-derive **[V]** items. Do not assume the opposite of an **[X]**.

**Two instruments, and picking the wrong one produces confident nonsense:**

```sh
cargo run -q --example probe   -- file.ksav   # page, x, y, size, text
cargo run -q --example svgdump -- file.ksav   # fill, glyph shape
```

`probe` cannot see colour or slant. Asked about them it returns "no difference,"
which looks exactly like a passing test — it reported colour as dead when colour
is live. `assert out.ok()` cannot see a single bug in this document.

**Authority.** Sections marked **[SHAUL]** are decided and are not to be
re-litigated. Sections marked **[CLAUDE]** are proposals — argue with them freely.
Naming throughout Part 2 is placeholder and is Shaul's call.

---

# Part 0 — Decisions already made **[SHAUL]**

These came out of the design conversation and are settled.

| # | Decision |
|---|---|
| 1 | **No migration.** The eighteen commands and eleven chooser cards are replaced, not preserved. Documents written the old way are not a constraint. |
| 2 | **The model is five things** — source position, stream/destination, region, overflow, counters. Everything a writer can say is one of them. |
| 3 | **Source position belongs elsewhere in the UI.** It changes the file, never the page, and must not appear in the note-layout chooser. |
| 4 | **Routing lives on the stream, not the note.** Exceptions come from declaring more streams. |
| 5 | **Spill to the next page is the strongest overflow move**, and the default worth reaching for. |
| 6 | **Notes never overlap and never print off the paper.** This is an invariant, not an option. |
| 7 | **Notes-as-data is a compilation target, not an authoring surface.** The writer keeps typing `#הערה[…]`; the compiler emits the series. |
| 8 | **Counters are general** — any number of named series, usable anywhere, not only for notes. |
| 9 | **Offer the shared-sequence numbering option** too. It is free, it never repeats a number, and some writers will not mind the interleaving. |
| 10 | **As many options as possible, with one conceptual idea.** Options come from orthogonal axes, never from a menu of arrangements. |
| 11 | **Presets must be derived from the axes**, so they can be taken apart. A preset that cannot be dismantled is a cell. |
| 12 | **Configurability is the default.** A judgement-call constant becomes a setting whose default is the current value. |
| 13 | **The bugs in Part 4 get fixed** regardless of the plan. |

---

# Part 1 — The five things

## Thing one — where the note sits in your source

Four options. All work today, and all produce byte-identical pages — **[V] by the
repo's own test**, not by me: `tests/deferred_notes.rs::every_note_layout_lays_out_identically_with_deferred_bodies`
renders each layout twice, inline then deferred, and asserts every run landed on
the same page at the same coordinates at the same size.

1. **Inline** — where it belongs.
2. **End of file.**
3. **End of its section.**
4. **A separate file.**

**UI:** one global setting, one per-note override. Not in the note-layout chooser
(decision 3).

## Thing two — where the note prints

A note names its **stream**. The stream was declared once and owns the
destination.

### The five destinations

**1. Bottom** — Typst's real footnote area. Grows, pushes the text up, splits long
notes, balances at breaks. **There is exactly one.** Spend it on the apparatus
that must breathe and stay with its text.

**2. End** — end of document *or* of each chapter · new page or not · heading
none / default / **custom text** · columns · several independent blocks · two
blocks side by side with a width ratio.

**3. Side** — outer / inner / right / left / top · beside its own word or stacked
from the top · column ratio · gutter.

**4. A separate document** — a companion volume. The easiest of the five: nothing
has to fit on a page.

**5. A section** — thing three.

**A note on a note takes the same five.**

### Why routing lives on the stream **[SHAUL, decision 4]**

- You move three hundred haaros to the back of the sefer by changing **one word**.
- The engine must know nesting depth **before** laying out a page. A header
  declaration gives it that; a per-note decision does not, and past five levels it
  stops settling.

Exceptions are more streams:

| Stream | Hangs off | Prints | Numbered |
|---|---|---|---|
| ביאורים | the body | bottom | 1 2 3 |
| מקורות | the peirush | the back | א ב ג |
| נוסחאות | the peirush | a separate file | (1) (2) (3) |

### Per stream

destination · numbering scheme · restart rule · head of entry (thing five) ·
arrangement (paragraphs / run-in) · columns · overflow (thing four) · size · slant
· weight · colour · indent per level · gap between entries · **the marker's own
look, set independently of the entry** · title · rule above · rule between blocks

### Per note

A note may overrule what describes **it**: size, slant, colour, indent, label, and
whether it may be moved.

The one real limit: **two notes must never compute their positions from different
answers to the same question.** A note may change a shared arrangement — ask for a
wider slot and push its neighbours — but may not privately disagree about what the
arrangement is.

## Thing three — how a region gets made

Two mechanisms, split by behaviour.

### The grid — flows, needs no measuring, side arrangements only

- **Columns run in parallel** **[V]**.
- **Rows run in sequence and give register** **[V]**.
- **Rows and columns combine** — one grid.
- **Varying the column count per row gives the Vilna wrap** **[V]**.
- **The chunk is `#סימן`/`#סעיף`.** Chunk size is the whole synchronisation dial:
  one row per sefer = no sync; per chapter = loose; per siman = tight; per page =
  exact register.
- **Sync costs page density.** If one side runs longer the other's page bottom is
  empty. Inherent — reledpar's author says so plainly.
- **[X] It can only do side arrangements.** A grid column fills from the top and
  continues at the top of the next page. Rashi beside the text, yes; Mishna Berura
  underneath it, never.

### The box — fixed, goes anywhere, never grows

- **A fixed strip at the foot is just a box at the bottom.** Not a second "bottom."
- **A margin column is a box** — tall and narrow. Same problem, same fixes.
- **It never grows.** A box that grows is a flowing region, and growing one loops:
  taller band → less text → different break → different notes → different height.
  That loop hangs SILE and costs talmudifier five minutes a page. **If you need
  growth, you needed the bottom.**
- **Sizes** in cm/mm/pt/in **or percentage of the sheet** — percentage survives
  A4 → A5.
- **Whether a box holds its space** on pages with no content is a setting.

### Repaint

Not about fitting. *"Typst arranged this correctly; paint it differently."* Lay
out, look at what it decided, run again pinning those breaks, draw bands instead
of a list. `hide()` makes it free — a hidden footnote reserves exactly what a real
one does **[V]**.

## Thing four — what happens when it doesn't fit

Only boxes have this problem. **The three destinations that lose text today are
exactly the three that are boxes.**

**Why this is the main event and not a robustness concern.** A study of a real
published sefer (Shefa Shlomo, 17 pages, reference scans) measured **five times
more note text than body text.** In a real sefer the notes are five-sixths of the
page. A mechanism that holds nine of them is not failing at the margins — it is
failing at the normal case.

### The invariant **[SHAUL, decision 6]**

> A note may be moved, shrunk, run in, or pushed to the next page. It may never be
> printed on top of another note, and it may never be printed off the paper.

Everything currently broken violates exactly this.

### The ten moves — the writer picks

1. **Clamp** — never place below the text area.
2. **Shift both directions** — down for collisions, back up to stay on the page.
3. **Cascade** — re-adjust notes already placed.
4. **Run the band in** — one paragraph, not one line each.
5. **Compress** toward the minimum gap.
6. **Tighten the letterforms** — character-level justification **[V]**.
7. **Drop a type size.**
8. **Per-note shift policy** — the notes that may float move first.
9. **Redistribute inside a fixed total** — two bands sharing 6cm get 4 and 2, not
   3 and 3. The total never changes, so nothing above moves. Provably stable.
10. **Spill to the next page** — the strongest **[SHAUL, decision 5]**.

Plus **degrade gracefully** (a margin note with no margin becomes a footnote — the
same answer as Word export) and **always warn**.

### How you know

`measure()` before **[V]** · `query` after **[V]** · `hide()` to reserve **[V]** ·
the probe from Rust, which sees split points `query` cannot **[V]**.

**One constraint forces all of it:** a footnote entry **containing nested notes
cannot split across a page** **[V]**. Any design wrapping an apparatus in one
parent must know the band fits before emitting it.

## Thing five — counters

- **Any number of named series**, running at once.
- **Each renumbers on insert in the middle.**
- **Each restarts** per siman, per chapter, or at a mark dropped anywhere.
- **Each with its own shape** — `1 2 3`, `א ב ג`, `(1) (2) (3)`, roman, symbols.
- **Not tied to notes** — a plain numbered series in running text.

### Numbering is an axis with three settings

| | How | The numbers | Cost |
|---|---|---|---|
| **Shared sequence** | one footnote counter, painted two ways | interleave `1,3,5` / `2,4,6` — but **never repeat** | **free** |
| **Independent counters** | your own | clean per stream, restartable | needs thing five |
| **Independent by mechanism** | footnote area + box | two genuinely separate counts | needs spill |

Shared sequence is a real choice, not a fallback: zero build cost, zero overflow
risk, and unambiguous references. Two limits for its card: **[X]** it cannot do
notes-on-notes (they interleave rather than pool), and its tag must be
**structural** — a string search misfiles everything, because a parent note
contains its child **[V]**.

### What stands at the head of an entry

One setting, four ingredients, any combination: **a number** · **a fixed label**
per stream · **the quoted words** from the body · **nothing**.

On quoting: track live so editing the sentence doesn't strand the note; frozen
copy as fallback. One or two words — that constraint is what makes live tracking
realistic. Default to no number when quoting.

**[U]** A markerless stream needs addressing by line, page, daf or siman instead —
a second addressing system, which seforim use constantly.

### Referring to a note

**Cross-references.** Writing "see note 12" and having the 12 stay correct after
you insert a note earlier. **Position-based numbering and automatic
cross-references are not in tension** — a reference asks, at build time, what
number the note turned out to be. Does not exist today; nothing in the model
blocks it. **[SHAUL: keep numbering as it is; cross-references wanted.]**

**One note, two markers.** "See above, note 12" as a second marker pointing at an
existing note — common in seforim.

**Careful: something adjacent already exists and is not this.**
`tests/deferred_notes.rs::the_same_body_may_be_referenced_twice` shows that two
`#הערה_בשם("א")` markers against one `#גוף_הערה("א")` **render the body twice** —
two markers, two entries, the prose repeated. That is the opposite of what is
wanted.

What is wanted: the second marker prints the **first note's number** and creates
**no second entry**. The naming machinery is there and tested; the reuse-without-
duplication behaviour is not.

### Why this is load-bearing

- Design A gives pooling **and** run-in free, but **the notes inside get no
  numbering at all** **[V]**. Without counters that design is unnumbered.
- **Run-in exists only here.** Typst's footnotes refuse it **[X]**.

**Guard:** a marker pointing at a label not in the list currently fails
unreadably. That will happen on every rename.

## Document level

Settings that belong to the sefer rather than to a stream.

- **The PDF right-to-left flag.** Ksav does not set it — nothing in `src/` sets
  viewer direction, so readers do not open two-page spreads the correct way. It is
  the difference between a PDF containing Hebrew and a sefer. **[U]** whether
  Typst's export exposes it or it needs post-processing. **[SHAUL: agreed.]**
- **Binding side** — feeds outer/inner in thing two.
- **Gematria folio numbering** — exists (`מספור_עברי`).
- **Digital output mode** — `page(height: auto)` makes overflow *impossible by
  definition*. For a sefer read on a screen it deletes this entire problem class,
  free.
- **Baseline grid** — every line and block snapping to a fixed rhythm. Matters for
  a parallel page: body at 12pt and commentary at 9pt drift visually against each
  other even in perfect per-page register, and that drift is what makes amateur
  parallel typesetting look wrong. Off by default.
- **Word export mapping** — foot notes → Word footnotes, end notes → Word
  endnotes, **margin notes and section commentaries have no equivalent at all.**
  Say so at export; a stated downgrade beats a silent one.
- **Warning thresholds.**

---

# Part 2 — A concrete surface **[CLAUDE — names are placeholders]**

The plan above is shapes. This is one way to say them. **Every name here is a
guess and naming is Shaul's**, but the *arity and argument structure* is the part
worth arguing about.

## Thing one

```typst
#הגדרות_מקור(מיקום: "בשורה")        // בשורה · סוף_הקובץ · סוף_המדור · קובץ
#הערה(מקור: "סוף_הקובץ")[…]         // the per-note override
```

## Thing two — declaring streams

```typst
#ערוץ("ביאורים",  מקור: auto,        מיקום: "רגל",  מספור: "1")
#ערוץ("מקורות",   מקור: "ביאורים",   מיקום: "סוף",  מספור: "א",
      עמוד_חדש: true, כותרת: [מקורות וציונים], טורים: 2)
#ערוץ("נוסחאות",  מקור: "ביאורים",   מיקום: "קובץ", מספור: "(1)")
#ערוץ("גיליון",   מקור: auto,        מיקום: "צד",   צד: "חיצוני",
      מיקום_בצד: "לצד_המילה", גלישה: "עמוד_הבא")

בראשית ברא#הערה("ביאורים")[עיין רש״י שם] אלקים.
```

`מקור: auto` means the body text. `מקור: "ביאורים"` is a note on a note. One
stream, one destination — if two notes go different places they are two streams.

## Thing three — regions

```typst
// a grid: three columns, synchronised per siman
#אזור("דף", פריסה: "טורים", טורים: (1fr, 2fr, 1fr), יחידה: סימן)

// a box: 15% of the sheet, at the foot, spilling forward
#אזור("שער_הציון", פריסה: "תיבה", מיקום: "רגל",
      גובה: 15%, גלישה: "עמוד_הבא", שומר_מקום: true)

#ערוץ("שער_הציון", מקור: "ביאורים", אזור: "שער_הציון", מספור: "א")
```

`שומר_מקום` is whether the box holds its space on pages with nothing in it.

## Thing four — overflow, on the region

```typst
גלישה: "עמוד_הבא"     // spill — the default
      | "דחיסה"        // compress
      | "רצוף"         // run the band in
      | "הרחבה"        // widen, full width below the columns
      | "חלוקה"        // redistribute inside a fixed total
      | "מחיר"         // price them all and pick the cheapest
```

The invariant is not in this list — it is guaranteed under all of them.

## Thing five — counters

```typst
#סדרה("סק", מספור: "א", אתחול: סימן)     // declare
… ואם כן יש לעיין#מונה("סק") בדבר …        // emit the next number
#סדרה_אתחול("סק")                          // restart here, anywhere
```

And the head-of-entry setting on a stream:

```typst
#ערוץ("נוסחאות", ראש: ("מילים",), מילים: 2)   // quoted words, no number
#ערוץ("מקורות",  ראש: ("מספר", "תווית"), תווית: [מקור: ])
```

## The UI **[SHAUL]**

**Writing a note is one pick: which of the five.** That is the entire gesture.
There is no "declare a stream, then reference it" — **the destination *is* the
stream.**

This is not a simplification imposed on a richer model. It matches the engine:
there is exactly one real bottom, so one stream per destination is close to what
is available anyway. And it does the Mishna Berura page with no stream vocabulary
at all — MB picks **bottom**, ShT picks **a section**.

| | |
|---|---|
| **Writing a note** | pick one of five. If "a section", pick which. |
| **Destinations** | settings live here — numbering, size, run-in, overflow, columns |
| **Sections** | made in the region screen; a named list |
| **Counters** | add a series |
| **Source position** | global, one override — and not in this chooser (decision 3) |

**Two refinements it needs.**

*"A section" expands to "which section."* Sections are made and named by the
writer, so the fifth option is a short list. That is also what recovers the case a
flat five would foreclose: **two separately-numbered apparatuses in the same
place.** Mekoros in one block at the back and haaros in another are both "end" —
as one choice you get one of them; as two named sections placed at the end you get
both. So the honest shape is **four singular destinations plus a named list.**

*Settings move from the stream to the destination.* They still exist; they are
just keyed by destination rather than by a declared stream name.

**What it forecloses:** two differently-numbered apparatuses at the *same*
destination, except through sections. At the bottom that costs nothing — the
engine has one real bottom regardless. At the end and the side it is a real limit,
and "make it a section" is the escape.

**It does not break decision 4**, though it looks like it might. Depth is
**lexical either way** — `#הערה(רגל)[… #הערה(אזור)[…]]` shows the nesting in the
source, so the engine reads it without laying anything out. And "move an apparatus
without retyping three hundred notes" survives: you change the destination's
settings, not the notes.

One thing does change, for the better: **a sub-note's parent is whatever note the
caret is inside** — determined rather than chosen, which is what a writer means
anyway.

**Four things with no home yet:** the marker's own look · per-note overrides ·
where a destination's numbering scheme is set (probably the destination's own
settings) · **a preview**, because someone building a Gemara page needs to see the
page. The current chooser's small sketches are the one thing worth keeping.

**Four things with no home yet:** where a stream's numbering is set (probably
screen 2) · the marker's own look · per-note overrides · **a preview**, because
someone building a Gemara page needs to see the page. The current chooser's small
sketches are the one thing worth keeping.

---

# Part 2b — The terrain: what the engine already knows

**Read this before writing a line.** Everything above describes the target.
This is the ground it has to be built on, and each item below is a rule someone
learned the hard way. An implementer who does not know them will re-invent a bug
that is already recorded in the code.

## Where the code is

| Concern | File |
|---|---|
| The chooser to be replaced | `app/src/notes.ts` — `NOTE_CHOICES` at `:133`, the where × how grid |
| **Streams, already modelled correctly** | `app/src/channels.ts` — the editor half of one authority with the prelude |
| Which commands open a note body | `app/src/note-commands.ts` — hand-written on purpose; read its header before "simplifying" it |
| Thing one | `app/src/deferred.ts`, `deferred-lint.ts` |
| Collected-and-never-rendered lint | `app/src/apparatus.ts`, `apparatus-lint.ts` |
| The one shared band renderer | `engine/typst/ksav.typ` — `_ap_pick / _ap_mark / _ap_wrap / _ap_note / _ap_entries / _ap_group / _ap_bands` |
| Channels in the prelude | `ksav.typ` — the `_ch_*` block |
| Page-foot reserve | `engine/src/lib.rs` — `auto_notes_region_cm`, `length_cm` |
| Instruments | `engine/examples/probe.rs`, `svgdump.rs`, `bench-incr.rs` |

## Five rules that are not negotiable

**1. The rendering side must never write.** A page footer is laid out many times
during page-breaking, so any counter or state *write* there fails to converge.
Numbering is therefore **a note's rank among its own kind, read out of a query** —
`_ksav_rank` (`ksav.typ:1005`), never a counter. Reading is free; writing is not.
This is why restart must mean "rank since the last restart mark" and not "set to
1."

**2. Depth must be a lexical literal.** Discovering nesting depth through `state`
finds one level per layout pass and Typst caps at five, so 5-deep nesting never
converges. That is why tiers are explicit commands rather than a depth counter,
and it is the mechanical reason routing lives on the stream (decision 4).

**3. Nested notes must be force-registered** — `box(place(hide(body)))`
(`ksav.typ:1469`). A stored body is not laid out, so a nested note inside it would
never run. **The `box` matters:** without it the hidden machinery breaks the line
its marker sits on.

**4. Phantom registrations are detected by document order, never by content or
coordinates.** When an apparatus re-displays a stored body, the nested notes in it
emit their metadata again. Each apparatus brackets its block with
`_ksav_ap_open`/`_ksav_ap_close` and a registration is a phantom when more opens
than closes precede it (`_ksav_real_of`, `:968`). **Two approaches that were tried
and are wrong:** keying by content (`repr(body)` — two notes reading "עיין שם"
become one note) and comparing page coordinates (a native footnote also sits below
an apparatus block while being outside it).

**5. There is one band renderer and a test counts the copies.**
`tests/apparatus_golden.rs` requires the numbering array, the apparatus rule, the
divider, the force-registration and the fixed-height slot to appear **exactly
once** in `ksav.typ`, and all three collectors to go through `_ap_note`. It exists
because a pinned layout cannot see a *fourth* copy being written — which is how
there came to be three, and how the א/ב-over-1/2/3 convention shipped backwards
and had to be corrected by hand in a second copy months later.

## Four dead ends, so nobody spends a day on them

Reported by another agent testing against 0.15.1 **[V-EXT]**, except where noted.
Each is something an implementer would reasonably try.

**1. Typst has exactly two page-anchored streams** — the main flow and the
footnote area. **There is no script-level way to make a third.** This is the fact
underneath the whole grid-or-box distinction: anything that is not one of those
two does not flow, and therefore has to be a box you manage.

**2. Floats cannot serve as a band.** Floats **do not split** — an oversized
bottom float is pushed to the next page and then overflows the page bounds and
clips. Do not reach for `place(bottom, float: true)` to build an apparatus.

**3. `page(footer:)` renders arbitrary per-page content but does not reserve space
reactively.** It can paint anything, keyed off `here().page()`, but it cannot make
room for itself. **This is the direct cause of the nine-note cap** — Ksav's page
bands and streams render there, so they grow into the margin and off the sheet
rather than pushing the text up.

**4. Nested entries follow layout, not their anchor.** With a parent note spanning
pages 1→2, *all* nested entries landed on page 2 — where the parent's text ended —
including one anchored in the parent's first sentence. Relevant to design A, and
another reason design C (where the second apparatus is a box rather than a nested
note) is the steadier shape.

**And one confirmed here, not inherited [V]:** pooling into a band happens **only
when a page has exactly one parent entry**. With several parents you get parent,
child, parent, child (`nest.ksav`). That is what forces the single-parent-per-unit
structure in designs A and C.

## The page-foot reserve changes three things, not one

Anything that inflates `margin.bottom` moves the text region, **the footer's
descent**, and **where anything printed after the footer's content lands**. All
three have been wrong here before — one version put the page number at y=838.93 of
841.89, inside every printer's dead zone.

**Probe the page number, not just the notes.** Held by
`tests/page_geometry.rs::the_page_foot_line_does_not_move_when_the_document_grows_an_apparatus`.

## Documents that are now stale

- **`spec.md`** — says commentary beside the main text needs a different backend or
  a multi-month build. Contradicted **[V]**; the eleven-option framing is replaced
  by decision 1.
- **`engine/README-notes.md`** — documents three mechanisms. There are four; it
  never mentions channels.

Both should be updated as part of this work, not left to contradict it.

## Already built by a parallel session (2026-08-20)

Check these before building thing five — they overlap it:

- `decisions/2026-08-20-starting-the-count-again.md` — **restart numbering exists**:
  `#הגדרות_מספור(אפס_לפי: N)`, `#התחל_מספור()`, `#המשך_מספור()`, read by the
  prelude for notes and by `numbering.ts` for siman numerals.
- `decisions/2026-08-20-a-marker-is-not-where-the-note-is.md` — a fifteen-
  arrangement sweep of marker numbering in fixed regions.

---

# Part 2c — Acceptance criteria

Each is a corpus document that currently fails and must pass. This is what "done"
means; nothing here is a matter of judgement.

| Thing | Done when |
|---|---|
| **Sidenote clamp** | `dense.ksav` — max y ≤ 799.02 (currently **827.27**), all 20 notes at distinct y |
| **Thing four, boxes** | `boxover.ksav` — 20 notes give **20 distinct y positions** (currently **9**) and max y ≤ 799.02 (currently 802.57) |
| **Thing four, invariant** | no corpus document produces two runs at the same y in the same lane, and none exceeds the text area |
| **Thing five, numbering** | `oneparent.ksav` — the MB notes carry their own numbers (currently **none**; the 2/3/4 shown are the ShT markers) |
| **Thing five, run-in** | a band renders as one flowing paragraph — impossible in native footnotes **[X]**, so this proves the band is being built rather than delegated |
| **Design C, end to end** | `compose_long.ksav` — 30 ShT at **30 distinct y positions** (currently 9) and max y ≤ 799.02 (currently 802.57), with the MB band still run-in and still on the sheet |
| **Thing two, streams** | two streams declared with different destinations, both reachable from one note-writing gesture |
| **Italic bug** | `k_slant_a` vs `k_slant_b` — **differing** SVG (currently byte-identical) |
| **`ריווח` bug** | `gap_0em` vs `gap_6em` — **differing** output (currently byte-identical) |
| **The chooser** | `NOTE_CHOICES` is gone and `notes.ts` references `channels.ts` |

**And a regression bar:** every document in the corpus that passes today must
still pass. `flowtest`, `perdaf`, `vilna`, `asym`, `pinned`, `boxdesign`,
`pass_real`/`pass_hide` are working behaviour, not just evidence.

---

# Part 3 — What works

Re-run everything: `sh tests/notes-corpus/run.sh`

| Claim | File | Evidence |
|---|---|---|
| **Grid columns flow in parallel** | `flowtest` | 70 paragraphs each → 6 pages; page 1 main 1–17 / comm 1–12, both continuing at their own rate |
| **Rows give exact register** | `perdaf` | daf 3 breaks at the same point in both columns and both resume together |
| **The Vilna wrap** | `vilna` | 3 columns (y 83–296) → 2 columns (329–413) → full width (445–490) |
| **Per-column numbering** | `asym`, `percol` | left 5 notes א–ה, right 2 notes א–ב, each block at the foot of its own column |
| **Design A — one parent per page** | `oneparent`, `pinned` | run-in MB on one line, ShT pooled below, 3 pages, max y = 799.02 |
| **Design B — box under the footnotes** | `boxdesign` | MB 1,2,3,4 (Typst's counter) + ShT א,ב,ג,ד (the band's own) — two independent counts |
| **`hide()` is a perfect spacer** | `pass_real`/`pass_hide` | identical breaks: p1→LN1, p2→LN18, p3→LN35 |
| **Character-level justification** | `n_base`/`n_wide` | 8 lines vs 7 under column strain. Only bites under tension |
| **Colour is live** | `k_col_a`/`k_col_b` | `fill="#ff4136"`, 27 glyphs — via **svgdump**; probe says identical |
| **Numbering order in a grid is column-major** | `numorder` | 1,2,3 down one column then 4,5,6 — reledpar's warning does not apply |
| **Long notes split, continuation unmarked** | `split` | y=179→605 page 1, resumes y=742→754 page 2 |
| **`measure()` returns real geometry** | `measure` | `height=210.96pt width=360pt` |
| **The grid holds at length** | — | 150 rows, 9,000 lines, **324 pages, clean exit** |

## Design C — A and B composed **[V] — and this is the recommendation**

A's single-parent run-in band in the footnote area, with B's box holding the ShT
instead of nested footnotes. `compose.ksav`:

```
y=682   א ב ג ד                       ← ShT markers, superscript, in the band
y=685   MB1 MB2 MB3 MB4               ← run-in, one line, in the real footnote area
y=716   א SHT1  ב SHT2  ג SHT3  ד SHT4 ← the box below, its own count
y=799   page number
```

**It takes the good half of each and drops A's fatal constraint.** Because the ShT
are a *different mechanism* rather than nested footnotes, rule "a nested band
cannot split" no longer applies. `compose_long.ksav` — thirty long notes, the same
content that destroys design A:

| | max y (sheet is 841.89) |
|---|---|
| **Design A** (`spanning`) | **1477.69** — 636pt off the paper, page number with it |
| **Design C** (`compose_long`) | **802.57** — the ShT box overflowing, nothing else |

So design C gives:

- **run-in MB**, from A
- **a banded, capped ShT**, from B
- **two genuinely independent counts**, from B
- **no chunking requirement**, because the parent has no nested notes to keep it
  from splitting — which is the whole cost of A

**What it still needs:** the ShT box caps at nine like every box
(`compose_long` gives 9 distinct ShT positions for 30 notes). That is thing four,
which every design needs anyway.

**Design A remains useful** where you want the ShT *pooled by Typst* rather than
placed in a box. Design B remains the simplest if you do not need run-in.

**Typst compiles incrementally** — the premise of every "own the pagination"
proposal, measured false:

```
pages=  47  cold= 204ms  identical=  7ms  after-1-char-edit= 12ms
pages= 117  cold= 450ms  identical= 20ms  after-1-char-edit= 31ms
pages= 234  cold= 979ms  identical= 29ms  after-1-char-edit= 59ms
```

A 234-page parallel-column sefer compiles cold in under a second. Edit cost scales
linearly but with a ~17× advantage — under 100ms to roughly 400 pages.
(`examples/bench-incr.rs`.)

---

# Part 4 — What does not work

| Claim | File | Evidence |
|---|---|---|
| **[X] Run-in in native footnotes** | `runin`, `runin2` | one note per line, both approaches. `box(it)` is worse — it loses the 17pt→6.7pt compression the manual version gets |
| **[X] No independently-numbered parallel footnote streams** | `twostream`, `twostream2p` | stream A gets 1,3,5 — not 1,2,3. `numbering` changes how one number is *drawn* |
| **[X] A nested band cannot split** | `spanning` vs `spanning_flat` | nested: content to y=1477 on an 841.89pt sheet. Same band without nesting: max y=799.02 |
| **[X] Rows are not bands** | `rows`, `nested` | the top row finishes entirely before the bottom starts |
| **[X] `columns()` is not grid columns** | `cols` | it snakes one stream; cannot hold a second commentary |
| **[X] Rotation does not paginate** | `rot` | 1 page, max y = 1077.57 on an 841.89pt sheet |
| **[X] Split points are not in `query`** | `split` | a two-page note is one entry with one location — where it *started* |
| **[X] Boxes overflow at nine** | `boxover` | 20 notes → **9 distinct y positions**, rest overprint, max y = 802.57 |
| **[X] Tagged nesting interleaves** | `nest` | MB, ShT, MB, ShT — pooling needs exactly one parent entry |
| **[X] Side notes walk off the paper** | `dense` | max y = **827.27** on an 841.89pt sheet |

**[U] The true continuous Vilna column shape** — the edge changing line by line —
is not available, and neither reledmac nor SILE offers it. Discrete rows of
differing widths approximate it **[V]**.

---

# Part 5 — Bugs to fix **[SHAUL, decision 13]**

## Side notes walk off the paper **[V]** — `dense`

20 notes on one paragraph reach **y=827.27 on an 841.89pt page**. **Ksav only ever
shifts a colliding note down; it never shifts back up.** One line, and it is the
only bug currently printing onto paper that cannot be printed.

## Config-driven italic renders nothing **[V]** — `k_slant_a`/`k_slant_b`

Tiers are meant to be distinguished by size, colour and **slant**. Slant renders
nothing — byte-identical SVG.

Ksav already diagnosed this in writing (`ksav.typ:2940`): *"`emph` is a request
for an italic face, and every Hebrew family this engine bundles ships none, so on
paper Typst hands back the upright face and the emphasis is invisible."*

```
plain / #emph / #text(style: italic)  → all identical
#נטוי[…]                              → the only one that renders
```

Not Hebrew-specific — it is the bundled fonts, not the script. `#נטוי` (`:2979`)
works because it applies `skew(ax: -12deg)` per word. Four sites still route
through `text(style:)`: `_ap_wrap` (`:1209`), `_sn_wrap` (`:3778`), headings
(`:2408`), `_fn_wrap`.

**Why it survived:** `slanting_commands` in `lib.rs` fences the *commands* and
nothing fences the *configuration*. Commit `72ae855` is titled *"the sweep the
italic fix should have had."*

## `#הגדרות_הערות(ריווח:)` is dead **[V]** — `gap_0em`/`gap_6em`

Two settings for one thing. `#הגדרות_הערות(ריווח:)` is declared at `ksav.typ:840`
and read **nowhere**; `ריווח_הערות` is declared at `:2655` and applied at `:2836`.
The dead one is where a writer would look. And `_fn_own_keys` (`:794`) carefully
excludes it from per-note override — someone reasoned correctly about the
semantics of a setting that has never done anything.

## Error translation loses information **[V]**

`diagnostics.rs:930` maps a Typst error to *"Invalid syntax here — check brackets,
commas."* The error I triggered was a wrongly-shaped dictionary; no bracket was
missing. The sibling message is precise: *"no parameter called `x` — check the
spelling."* Wrong name gets a real answer; wrong value sends you hunting.

## The fence for this class

Both dead knobs are *"declared, documented, changes nothing."* No test sees them.

**Grep does not work** — 28 hits over 120 keys, **27 false positives** (the marker
register is looked up by string variable). **`probe` alone does not work** — it
reported colour dead when colour is live.

**Render-diff on the right instrument works.** Make it a permanent fence over every
settings dictionary in `ksav.typ`, not just the note ones. Two hours found two real
bugs in one config block out of roughly a dozen.

**The lesson:** an instrument that cannot see the property under test returns "no
difference," indistinguishable from a pass. When the harness says DEAD, first
confirm the instrument can see the property.

---

# Part 6 — The chooser

**This is the problem that started the conversation and it is the one thing the
engine research did not touch.**

Today: four models, and the ✻ panel — the surface writers actually use — writes
`#מדף_א` and `#הערתסיום` directly. `notes.ts` contains **zero** occurrences of
`ערוץ`. A writer who wants two bands picks the card that looks right and gets the
tiered-footnote mechanism, which interleaves and shares a counter. `native.ksav`
and `small.ksav` in the corpus are that exact failure and its intended fix.

**What replacing it means concretely:**

1. **Delete `NOTE_CHOICES`** (`app/src/notes.ts:133`) and the where × how grid with
   it. Eleven cards, five `NoteWhere` values, six `NoteHow` values — all cells.
2. **What replaces it is one pick** (Part 2, *The UI*): which of the five
   destinations. Not a card, not a grid, not a stream to declare first — the
   destination *is* the stream. Everything else is settings behind it.
3. **`channels.ts` already models this correctly** and is the editor half of one
   authority with the prelude. It stays as the machinery; what changes is that the
   writer never meets the word "channel" — they pick a place.
4. **Keep the sketches.** The small page diagrams on the current cards are the best
   thing about it and the new screens need them more, not less — a preset should
   show what it builds.
5. **Presets are derived** (decision 11). A preset sets stream declarations and a
   region, and the writer can then take it apart. Never a separate list.
6. **Impossible combinations say why**, not merely grey out: *"two balanced
   apparatuses at the live page foot — Typst has one, so the second becomes a box."*

**The honest note:** everything in Parts 1–5 is engine work. A writer feels none of
it directly. **This part is what they would feel**, and it is the part with the
least measurement behind it.

---

# Part 7 — Where to start

**First, the bugs — independent of every decision:**

1. **Sidenote clamp.** One line. The only failure currently printing off the paper.
2. **Config-driven italic** — route the four sites through the synthetic oblique.
   Extend `slanting_commands` to cover configuration, not just commands.
3. **`ריווח`** — make the note-settings knob write through to the live setting.
4. **The render-diff fence** over every settings dictionary.

**Then the three the plan cannot ship without:**

5. **Spill** (thing four). Without it every box caps at nine — including design C's
   ShT box, which is otherwise the recommended shape. This is the single highest-
   value item in the document: it fixes the page bands, the streams and the side
   notes with one mechanism, and it is what the paying customer in Part 9 is
   blocked on.
6. **Counters** (thing five). Without them a run-in band is unnumbered, and run-in
   does not exist at all outside a band you build yourself.
7. **Measurement** (thing three) — needed by any *fixed* region. Note that design C
   removes the *chunking* requirement, so measurement is needed for fitting, not
   for deciding page breaks.

**Then the model**, and the chooser last, because it is the surface over everything
else.

**The shape to build toward — design C** (Part 3). Single-parent run-in band in
Typst's real footnote area, a box below it for the second apparatus, spill on the
box. It is the only arrangement that gives run-in, two independent counts, a
capped page shape, **and** no chunking requirement. Measured working; the one
thing it lacks is item 5.

**Two things to settle before building, both Shaul's:**

- **Naming** for Part 2. The structure is arguable; the words are not mine.
- **Which overflow move is the default** per destination. Decision 5 says spill is
  strongest; whether a margin note spills or converts to a footnote by default is
  still open.

---

# Part 8 — Rejected, with reasons

| Proposal | Why not |
|---|---|
| **Fork Typst's layout crate** for N page-anchored footnote areas | **Not needed for the shape we want — but be precise about why.** A fork would give N *balanced* areas. Without one you get **one balanced area plus N fixed boxes**, and design C **[V]** shows that is enough for the Mishna Berura page. What a fork would actually buy is a *second balanced* apparatus and per-stream apportionment of the page foot — real, but small against a permanent rebase tax on a fast-moving compiler. **Do not repeat the claim that "N areas work without a fork":** two tagged streams share **one** area and **one** counter **[V]**. |
| **Stitch PDFs** | Two documents cannot see each other: numbering, cross-references, index, contents all die. Assumes a Python pipeline; Ksav is Rust → WebAssembly, previewing in-browser. |
| **Headless Chrome + own paginator** | Circular — **CSS has no footnotes**. Its premise that Typst re-lays-out the whole book is **measured false [V]**; its promised sub-100ms edit loop is **already delivered** at 59ms/234 pages. |
| **Switch engines for Hebrew quality** | Wrong, and it appeared three times. Nikud and te'amim placement is the **font's mark-attachment tables**; any HarfBuzz shaper handles it and Typst uses one. |
| **LaTeX / reledmac** | Speed complaint fair. But **bigfoot cannot be ported** — it rests on `\vsplit` (returns the part that fits *and* the remainder), the output routine, and insertions. Typst has none; `measure()` gives total height, not the two pieces. |

**The correction that matters:** the "measure, cache, solve" architecture was right
and the oracle was wrong. **Typst is its own measurement oracle** — `measure()`
in-process **[V]**, `page(height: auto)` + export out-of-process **[V-EXT]**.

**Taken from them:** caching unit measurements · pinning breaks to structural
boundaries **[V]** · rendering only dirty pages · bigfoot's cost model and run-in
per series · reledpar's sync dial · `marge`'s two-directional shift and cascade ·
`marginalia`'s per-note shift policy · `obelisk`'s baseline grid ·
`toffee-tufte`'s graceful degradation · Chezky's tag-and-sort · talmudifier's
variable-width row bands · image-diff auditing against reference scans ·
notes-as-data · character-level justification · `page(height: auto)` for digital
output, where overflow is impossible by definition.

**All work with Typst. None require the expensive move.**

**On the difficulty:** three independent systems fail at the same point, all
because the region *grows* — Typst's own footnote spill had an infinite-loop bug;
SILE's parallel package hangs when one side overruns; ConTeXt's columnsets are the
philosophically correct model and its own mailing list shows experienced users
unable to synchronise two texts. `talmudifier` succeeds at the Vilna shape and pays
**five minutes per page**, rendering test PDFs with line numbers on and extracting
the text back to count lines. Its author: *"ponderous and very hacky. If you know a
better way, let me know."*

**Ksav is holding the better way.** `probe.rs` reads the laid-out document
directly.

---

# Part 9 — Market

The Typst forum post and its repository describe a customer building Ksav by hand:
RTL sefer pages, gematria folio numbers in running heads, vowelised chapter
openers, two separately-labelled note streams, footnotes anchored to their
reference page, two-column note blocks with full-width spillover. Previously solved
by hiring people and using Tag Software.

Their two hard missions — two-column notes and spillover — are `not_started` and
`blocked_on_m1`. Audit score 48.3 against reference scans.

**"Two-column note blocks with full-width spillover"** is a real requirement Ksav
lacks — and note that it is, again, an *overflow* feature.

---

# Sources

Everything consulted, so nobody re-finds it.

**Typst**
- Parallel text via a grid, on facing pages — https://forum.typst.app/t/how-to-typeset-two-texts-in-parallel-on-pairs-of-facing-pages/1314/2
- Parallel columns flowing between pages — https://forum.typst.app/t/how-can-i-have-parallel-content-in-columns-on-the-same-page-with-the-content-flowing-between-pages/7517/3
- Footnote infinite loop when a note never fits — https://github.com/typst/typst/issues/5496 · fix https://github.com/typst/typst/pull/5498
- A long footnote spanning pages — https://github.com/typst/typst/issues/5405
- Character-level justification, added 0.14 — https://typst.app/docs/changelog/0.14.0/ · reference https://typst.app/docs/reference/model/par/

**The Hebrew sefer market**
- Paid help wanted, complex Hebrew sefer layout — https://forum.typst.app/t/paid-help-wanted-complex-hebrew-sefer-layout-in-typst/8741
- That customer's pipeline, both hard missions unstarted — https://github.com/Abe1018776/chezky-kohn-shefa-yoel-auto-design
- Hebrew Typst discussion — https://hed.im/tags/%D7%98%D7%99%D7%99%D7%A4%D7%A1%D7%98

**Prior art worth reading before building**
- `talmudifier` — Talmud page layouts, Python + XeLaTeX `paracol`, ~5 min/page — https://github.com/subalterngames/talmudifier
- reledpar manual — the chunk model and the five synchronisation settings — https://mirrors.mit.edu/CTAN/macros/latex/contrib/reledmac/reledpar.pdf
- How reledpar synchronises pages, by its author — http://geekographie.maieul.net/185
- bigfoot — multiple footnote apparatus, split costs, run-in per series — https://ctan.org/pkg/bigfoot · paper https://tug.org/TUGboat/tb25-0/kastrup.pdf
- manyfoot — https://ctan.org/pkg/manyfoot · FAQ https://texfaq.org/FAQ-multfoot
- ConTeXt columnsets, and its own users unable to synchronise — https://www.mail-archive.com/ntg-context@ntg.nl/msg109376.html

**Typst packages solving pieces of this**
- `marge` — margin notes; **the two-directional shift** — https://typst.app/universe/package/marge/ · https://github.com/EpicEricEE/typst-marge
- `marginalia` — per-note shift policy, has an RTL test — https://typst.app/universe/package/marginalia/ · https://github.com/nleanba/typst-marginalia
- `deixis` — unified note engine, margin spillover — https://typst.app/universe/package/deixis/ · https://github.com/inspiros/typst-deixis
- `obelisk` — the absolute baseline grid — https://typst.app/universe/package/obelisk/
- `toffee-tufte` — graceful degradation to footnotes — https://typst.app/universe/package/toffee-tufte/
- `scholia` — **not relevant**; a STEM study-notes template despite the name — https://typst.app/universe/package/scholia/
