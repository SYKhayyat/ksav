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
