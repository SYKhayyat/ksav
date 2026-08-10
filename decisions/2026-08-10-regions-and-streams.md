# Fixed regions: percent heights, any number of them, and regions for peer streams — 10 August 2026

Three asks, one apparatus, and the same shape underneath all three: the engine
could already do more than the product could say.

## 1. A region height may be a percentage of the page

Band heights were centimetres. A centimetre is a measurement somebody took off a
printed page, and it is wrong the moment the sefer moves from A4 to A5 —
`(1.5cm, 1cm)` on A5 is a fifth of the sheet rather than a twelfth.

`#הגדרות_מדפים(גבהים: (15%, 10%))` now means a percentage of the **sheet**, and
so does `#הגדרות_זרמים(גבהים: ("מקורות": 10%))`.

The care needed is that this is one claim implemented in two languages, and they
have to agree about what the percentage is *of*:

- `length_cm` in `engine/src/lib.rs` turns the ratio into the centimetres taken
  off the bottom margin. It needs the sheet, so `auto_notes_region_cm_on` takes
  it and `sheet_height_cm` reads it from the config — the explicit
  `page_width_cm`/`page_height_cm` pair if the document set one, the named paper
  otherwise.
- `_ap_fixed_height` in `engine/typst/ksav.typ` resolves the same ratio against
  `page.height`.

The reason the second one exists at all: a bare ratio handed to `block(height:)`
resolves against the **enclosing block**, and for the page-foot apparatus the
enclosing block is the reserve the bands are already sitting in. `20%` would have
come out a fifth of the reserve — a fifth of a fifth — and shrunk further the
more page the writer asked for. Rust would have reserved the right amount and the
page would have shown the wrong one, which is the failure mode where only the
invisible half is correct.

`a_percent_region_is_a_percent_of_the_page` in `tests/page_geometry.rs` measures
the gap between two bands on A4 and on A3 and asserts it grew by 20% of the
difference in sheet height. A ratio resolved against the reserve would not move
at all.

Bounded at 60% of the sheet. The reserve is added to the bottom margin, and `%`
makes "more page than there is" a plausible typo rather than an exotic one;
past the bound the regions clip, which is visible, where a document that will not
lay out is not.

## 2. More than two or three regions

Not an engine limit and never was. The prelude defines seven tiers per family
(`הערה_א…ז`, `מדור_א…ז`, `מדף_א…ז`) and named streams are unlimited. The caps
were both in the UI:

- `NOTE_CHOICES` cards carried exactly two markers, `insert` and `insert2`. That
  is now `insert` plus `more: []`, read through `markersOf`, and the layer a
  surface asks for is an **index** rather than `"primary" | "secondary"` — the
  old vocabulary simply ran out at two and could not name a third stream. Every
  card renders one button per marker it has.
- `bandStyleRows` in `app/src/main.ts` looped over `[1, 2, 3]` with a comment
  explaining that a document with more would keep them. True, and no use at all
  to the writer who wanted a fourth and had no way to ask. It is now a row per
  declared region, with add and remove, and `styles.withoutTier` — the other half
  of `withTier`, which had never existed, so the panel could grow the tuple and
  never shrink it.

`emit-note-fixtures.mjs` grew the same way: it emitted `primary`/`secondary`/
`both` and would have rendered a three-stream card's third region empty on every
page and called that a pass.

## 3. Regions are not only for notes-on-notes

They never were, in the engine. `#הערה_זרם("שם")` gives any number of independent
peer apparatuses at the foot of the page — each numbered on its own, stacked or
side by side, each pinnable to a slot by `#הגדרות_זרמים(גבהים:)`. Three streams
rendered correctly. The only two places the product mentioned streams offered
exactly two of them, and neither mentioned the regions.

**And there was a live bug of the class fixed the day before.** `declared_band_cm`
read `#הגדרות_מדפים`'s array and nothing else, so a three-stream document with
declared heights still got the flat 3 cm default and printed its third stream at
y=823.62 — below the page number at 799.02, on its way off an 841.89pt sheet.
The bands' version of exactly this had been fixed in `ef1cbb2` and never swept to
the sibling one function away, which is the failure mode the 7 August report named
and this repository keeps rebuilding.

So the reserve is now computed **per apparatus**: the bands' array and the
streams' dictionary are both read, both shapes parse, and a document carrying
both pays for both — because the footer renders them into the same block, one
under the other. `BAND_COMMANDS`/`STREAM_COMMANDS` replaced the single
`PAGE_APPARATUS_COMMANDS`, and the fence that holds that list against the prelude
now chains the two halves rather than checking a third statement of them.

The product side:

- A fourteenth chooser card, `stream-regions` — *several parallel streams, each in
  a fixed region*. It occupies a new `parallel-fixed` column, not a second card in
  `page × fixed`: `#מדף_` bands are **tiers**, an ordered stack where ב is a note
  on א, and streams are **peers**. A writer choosing between them is choosing
  between layers of commentary and commentaries side by side, which is a real
  question. The four other rows of the new column are refusals with reasons, so
  `everyGridCellIsAnswered` still has an answer for every cell.
- **Styles ▸ Parallel streams**, which had no UI at all: the stacked/side-by-side
  choice, and a named region per stream with add, remove, rename and a height in
  cm or percent. Renaming rewrites `זרמים`, `כותרות` and `מספור` with it —
  otherwise a stream stays ordered and titled under a name nothing writes into
  any more, and its region prints empty with nothing saying why.

## Also swept

- `templates/gemara.ksav` opened with a comment explaining that
  `auto_notes_region_cm` "reserves a flat 3 cm … and never reads `גבהים`". That
  stopped being true in `ef1cbb2`. A load-bearing comment that has become false is
  worse than none, because it is the one a person reads before changing the file.
- `readme.test.mjs` asserted the literal string `"thirteen note layouts"` while
  `documentation.test.mjs` derived the same number from `NOTE_CHOICES`. Adding a
  card turned one red for wanting fourteen and the other red for not finding
  thirteen. The literal is gone; both now read the count from the chooser.

Both suites green: 4,319 editor assertions across 69 files, 467 engine tests.
