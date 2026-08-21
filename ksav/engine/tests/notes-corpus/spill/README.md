# spill — the documents behind `NOTES-SPILL-FINDINGS.md`

Twenty documents, added 2026-08-21, behind every number in
`NOTES-SPILL-FINDINGS.md` at the repository root. They are in a subdirectory
rather than alongside the main corpus because they were written while the note
system was another session's working area.

Run from `ksav/engine`:

```sh
cargo run -q --example probe   -- tests/notes-corpus/spill/FILE.ksav
cargo run -q --example svgdump -- tests/notes-corpus/spill/FILE.ksav
```

**Which instrument.** `probe` reads frame items. It cannot see `clip`, so a
masked note and a note drawn off the sheet look identical to it — that mistake is
made twice in this set's own history and is written up in Part 7 of the findings.
Anything involving `clip`, `move`, `place`, `hide` or `fill` needs `svgdump`.

## The page footer is top-anchored

| File | Claim |
|---|---|
| `foot_keep.ksav` / `foot_drop.ksav` | A footer block collapsing from 100pt to 0 moves the block below it up by **exactly 100pt** — 914.60 → 814.60 — while the body stays at 78.79. The footer stacks downward from its top, and the text area is unaffected by anything inside it. |

## A region's declared height is ignored when the region is empty

| File | Claim |
|---|---|
| `rg_both.ksav` | Control, two page-foot regions, no declared heights, both occupied. UPPER 719.62, LOWER 742.43. |
| `rg_full40.ksav` / `rg_full200.ksav` | `#אזור(גובה:)` is **exact when the region has content** — LOWER at 770.42 and 930.42, a difference of exactly 160pt for a declared difference of 160pt. |
| `rg_h.ksav` / `rg_none.ksav` | **[X] And ignored entirely when it is empty.** 60pt declared vs nothing declared: both put LOWER at 719.62. Byte-for-byte the same outcome. Cause at `ksav.typ:2934-2938` — the empty-slot re-add reads the *stream* height dictionary, so a height declared on `#אזור` never enters it. |

## Overflow between notes works

| File | Claim |
|---|---|
| `ov_plain.ksav` | 20 notes into a `גובה: 60pt` region → 3 pages, notes 01–09 / 10–18 / 19–20, all twenty rendered, maxy 799.02. The assignment walk carries whole notes forward correctly. |
| `ov_next.ksav` / `ov_free.ksav` | Identical results with `גלישה: "עמוד_הבא"` and with no declared height at all. |

## Overflow *within* one note does not

| File | Claim |
|---|---|
| `giant.ksav` | **[X] One ~160pt note into a 40pt slot is not carried.** 1 page, maxy 961.47 on an 841.89pt sheet. `svgdump` shows a clip rect of exactly `v 40`, so it is masked, not merely overhanging — either way the reader does not get it, and nothing says so. |
| `giant_next.ksav` / `giant_sq.ksav` | **[X] Neither spill policy moves it by a single point.** `"עמוד_הבא"` and `"דחיסה"` both give maxy 961.47. |
| `giant_mid.ksav` | **[X] Not even with a free page next door.** The same note mid-document, page 2 available: all 60 words stay on page 1, maxy 961.47. This is not "there was nowhere to go." |
| `giant_noh.ksav` | The control with no declared height — no 40pt clip rect in the SVG, only the footer's own 85.04pt one. |

## The native footnote area *does* flow

| File | Claim |
|---|---|
| `nat_giant.ksav` | **One oversized native footnote splits mid-note.** 80 words, 300pt page → מילה01–37 on page 1, מילה38–80 on page 2, maxy 257.13. Splitting does not have to be invented. |
| `nat_bands.ksav` | **Stacked bands inside one entry split too, across three pages.** BANDA 36 / BANDA 4 + BANDB 36 / BANDB 4, 80/80 words. The band boundary survives the split. This is the result that makes re-basing onto the native stream thinkable. |

## Continuation by two windows

| File | Claim |
|---|---|
| `win.ksav` | **The mechanism, standalone.** Identical content in two 40pt clipped blocks, the second wrapped in `move(dy: -40pt)`: paints from 101.11 and from 61.11. Exactly 40pt, so the second window resumes where the first stopped. No slicing, no word boundaries, works on any content. |
| `footwin.ksav` | **The same thing in a real page footer**, driven by `here().page()`: 800.20 on page 1, 760.20 on page 2. Four lines of Typst. |
| `compose_win.ksav` | **Route D's partial trial** — 30 native footnotes plus a windowed footer box, `margin: (bottom: 5cm)`. Compiles and paginates; the visible window lands clear of the lowest native entry on both pages. **Read this one with `svgdump`.** `probe` reports an overlap on page 2 that does not exist — it is the clipped-away half of the window, and `move()` shifts paint, not layout. |

## The cost this set does not show

`probe` reports the *whole* note on every page a two-window continuation touches,
because the full content is emitted into every frame and only masked. That is not
a probe artifact — it is true of the PDF too, and it means text extraction, copy,
Ksav's own printed-page search, screen readers and DOCX export all see the note
repeated. Any document here that uses the window trick carries that cost.
