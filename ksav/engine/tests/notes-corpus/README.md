# notes-corpus — the documents behind every claim in `NOTES-PLAN.md`

Every `[V]` and `[X]` in `NOTES-PLAN.md` was produced by rendering one of these
and reading back where the words landed. They are here so the claims can be
re-checked instead of believed.

## How to run one

```sh
cd ksav/engine
cargo run -q --example probe   -- tests/notes-corpus/flowtest.ksav   # position, size
cargo run -q --example svgdump -- tests/notes-corpus/k_slant_b.ksav  # fill, glyph shape
```

`probe` reports every text run's page, x, y, font size and text. `svgdump` emits
page 1 as SVG.

**Which instrument to use matters.** `probe` reports position, size and text — and
**not fill or style**. Asking it about colour returns "no difference," which looks
exactly like a passing test. It reported colour as dead when colour is live. Use
`svgdump` for anything about how a glyph is *drawn*.

## Run them all

```sh
sh tests/notes-corpus/run.sh
```

## What each file establishes

### The parallel page

| File | Claim |
|---|---|
| `flowtest.ksav` | **Grid columns flow across pages** in parallel, each at its own rate. 70 paragraphs each → 6 pages, main 1–17 / commentary 1–12 on page 1, both continuing. |
| `perdaf.ksav` | **Rows give exact register.** One row per daf → both columns break at the same point and resume together. |
| `vilna.ksav` | **The Vilna wrap.** Rows with differing column counts: three columns, then two, then full width. |
| `rows.ksav` | **[X] Rows are not stacked bands.** The top row fills page 1, spills to page 2, finishes, *then* the bottom row starts. |
| `nested.ksav` | **[X] Nesting does not help** — inner rows stack linearly while outer columns run parallel. |
| `cols.ksav` | **[X] `columns()` is not grid columns.** It snakes one stream: page 1 col 1 → page 1 col 2 → page 2 col 1. Cannot hold a second commentary. |
| `numorder.ksav` | **Note numbering in a grid is column-major**, in source order — 1,2,3 down the first column then 4,5,6. reledpar's "reads across columns" warning does not apply. |
| `asym.ksav` | **Per-column independent numbering.** Left 5 notes א–ה, right 2 notes א–ב, each block at the foot of its own column. |
| `percol.ksav` | Same, one row per siman, three simanim. |

### The Mishna Berura page

| File | Claim |
|---|---|
| `oneparent.ksav` | **Design A works.** One parent footnote holding all MB for a se'if → MB run-in on one line, ShT pooled below. |
| `pinned.ksav` | **Design A across pages.** Explicit page breaks, one band per page. Three pages, max y = 799.02, nothing overflows. |
| `spanning.ksav` | **[X] A footnote entry containing nested notes cannot split.** 30 nested notes → content runs to y=1477 on an 841.89pt sheet, 636pt off the paper. |
| `spanning_flat.ksav` | **The control.** Same band, same length, *no* nested notes → max y = 799.02, splits correctly. Nesting is the cause. |
| `boxdesign.ksav` | **Design B works.** MB in the footnote area (1,2,3,4) + ShT in a footer box (א,ב,ג,ד) — two genuinely independent counts. |
| `boxover.ksav` | **[X] Boxes overflow at nine.** 20 ShT on one page → 9 distinct y positions, the rest overprint, band runs to y=802.57. |
| `nest.ksav` | **[X] Tagged nesting interleaves** — MB, ShT, MB, ShT — instead of pooling. Also shows the string-search tag misfiling every entry, because a parent contains its child. |
| `compose.ksav` | **Design C — A and B composed.** Run-in MB in the footnote area, ShT in the box below with its own count. Takes the good half of each. |
| `compose_long.ksav` | **Design C drops A's fatal constraint.** Thirty long notes: max y **802.57**, against design A's **1477.69** on identical content. The ShT box still caps at nine — that is thing four. |

### Numbering

| File | Claim |
|---|---|
| `tagged.ksav` | **Two tagged streams survive.** 40 + 40 notes, 4 pages, zero lost, nothing below the page number. |
| `twostream.ksav` | **[X] But they share one counter.** Stream A gets 1,3,5 — not 1,2,3. |
| `twostream2p.ksav` | Same at scale — one interleaved list, 1…72, across four pages. |
| `native.ksav` | The original reported bug: `#הערה` + `#הערה_ב` → body markers 1, 3, 4, sub-note between the parents. Correct behaviour for that mechanism; not what the writer wanted. |
| `small.ksav` | The same content via `#מדף_א`/`#מדף_ב` → two separate bands, two separate counts. |

### Overflow and fitting

| File | Claim |
|---|---|
| `dense.ksav` | **Side notes escape their column.** 20 notes on one paragraph → the last runs to **y=827.27** on an 841.89pt sheet, past the page number at 799.02. Note *where*: the side column is carved out of the **text area** by a grid (`#עם_הערות_צד`), so the notes have escaped it downward into the page's bottom margin. Cause: notes are `place`d absolutely and only ever shift **down**. |
| `split.ksav` | **[X] Split points are not recoverable from `query`.** A note spanning two pages is one entry with one location — where it started. |
| `pass_real.ksav` / `pass_hide.ksav` | **`hide()` is a perfect spacer.** Identical page breaks (LN1 / LN18 / LN35). Two-pass repaint needs no height arithmetic. |
| `measure.ksav` | `measure()` returns real geometry at compile time: `height=210.96pt width=360pt`. |
| `n_base.ksav` / `n_wide.ksav` | **Character-level justification works** — 8 lines vs 7 under column strain. Only bites under tension; a full-width paragraph shows nothing. |
| `rot.ksav` | **[X] Rotation does not paginate.** One page, content at y=1077.57 on an 841.89pt sheet. |

### Dead settings

| File | Claim | Instrument |
|---|---|---|
| `gap_0em.ksav` / `gap_6em.ksav` | **[X] `#הגדרות_הערות(ריווח:)` is dead.** Byte-identical output. | `probe` |
| `k_slant_a.ksav` / `k_slant_b.ksav` | **[X] Config-driven italic renders nothing.** Byte-identical SVG. | **`svgdump`** |
| `k_col_a.ksav` / `k_col_b.ksav` | **Colour is live** — `fill="#ff4136"`, 27 glyphs. `probe` says these are identical; it cannot see fill. | **`svgdump`** |
| `runin.ksav` / `runin2.ksav` | **[X] Run-in is impossible in native footnotes.** Two approaches, one note per line both times. `runin.ksav` does compress 17pt → 6.7pt. | `probe` |

## Reading `probe` output without fooling yourself

`probe` prints `y={:7.2}`, so the column is **right-aligned to seven characters**:

```
y=  78.79 x=  70.9 ...     ← two spaces after `y=`
y=1477.69 x= 295.2 ...     ← none
```

Splitting on whitespace and taking the second field therefore reads `x=` for any
y ≥ 1000 — **it silently under-reports exactly the catastrophic overflows this
corpus exists to find.** The first version of `run.sh` did this and reported the
rotation test at 988.29 when the truth is 1077.57; the wrong number reached
`NOTES-PLAN.md`.

Extract the number, do not field-split:

```sh
grep -o 'y=[ ]*[0-9.]*' | tr -d 'y= ' | sort -g | tail -1
```

Same disease as the colour case, one layer up: an instrument that cannot see the
value returns a plausible answer rather than an error.

### The block bug

| File | Claim |
|---|---|
| `sn_p_none.ksav` / `sn_p_note.ksav` | **[X] Every side note breaks its own line out of the paragraph.** One paragraph: 78.79/95.71/112.63/129.55 without notes, 78.79/95.71/**132.43**/149.35 with. ~20pt added at each note, so a document's body spacing is wrong in proportion to how many notes it has. |
| `lay_none` / `lay_bare` / `lay_boxed` | **The cause and the fix, isolated in raw Typst.** `layout()` is block-level: bare it gives 78.79/132.43/186.07; `box(layout(…))` gives 78.79/95.71/112.63/129.55, identical to no call at all. |

## Thing four's overflow moves, and the grid

Each of these is a **pair**: two documents differing in one word, so the move is
a difference on the page rather than a claim in a prelude. A move that cannot be
told apart from not having it is not built.

| Files | Claim |
|---|---|
| `ov_shrink2` / `ov_clip2` | **`"הקטנה"` drops a type size.** Three notes into a 0.6cm region: **8.2pt** with the move, **10.2pt** without, and the region overruns without it. The floor is 80% and the ladder stops at the first rung that fits. |
| `ov_runin` | **`"רצף"` runs the region in.** Six notes, **one line** — `1 קצרה א2 קצרה ב…` — where stacked they are six. |
| `ov_shrink` / `ov_clip` | **[X] A region that declares more height than the page has under the footer loses its notes, silently.** Five notes into a declared 2cm region on a sheet with 25.47pt of real room. `probe` reports the fifth at y=853.90 on an 841.89pt page and that reading is an artifact: `probe` reads frame items and cannot see `clip`, so masked content and overhanging content are indistinguishable. `svgdump` shows the clip rectangle (453.54 × 49.61), so the notes are **truncated away**, which is worse — a note past the paper edge is visible as a fault, a clipped one reads as a short note. Neither `"עמוד_הבא"` nor `"דחיסה"` moves it, because a page footer is composed afresh per page and has no continuation. See `NOTES-SPILL-FINDINGS.md`. |
| `hold_yes` / `hold_no` | **`שומר_מקום` holds a slot or frees it.** Upper region empty on page 1: the lower region sits at **733.45** holding and **688.63** freeing, and at 733.45 on both pages when it holds. Two bugs were under this — a declared region was not laid out at all on a page it had nothing on, and regions printed in note order rather than declaration order, so two of them swapped places from page to page. |
| `grid_on` / `grid_off` | **A baseline grid advances by exactly the grid.** A declared 16pt grid gives a body line advance of **16.00pt**; without it the font's own metrics give 16.92pt. Exact because `top-edge`/`bottom-edge` normalise the line box to 1em, so the advance is `leading + size` and nothing depends on the family. |
| `addr_page` | **[X] A region at `מיקום: "סוף"` never renders.** Two notes filed into it, and nothing prints at the end of the document — so the four positional addresses (`עמוד`, `דף`, `סימן`, `שורה`) are written and unexercised. |

## Adding to this corpus

A new claim in `NOTES-PLAN.md` should arrive with a file here and a row above. The
rule that produced every bug in that document: **render it and look at where the
words landed.** Nothing that compiles cleanly is evidence of anything.
