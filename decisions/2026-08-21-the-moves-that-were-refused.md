# 2026-08-21 · The moves that were refused, and the grid under them

`NOTES-PLAN` thing four names ten overflow moves and decision 12 says none is
hard-coded. Two shipped the night before — compress and spill — and the other
eight were **refused by name**, on the argument that a word which compiles and
does nothing is the defect class `tests/settings_live.rs` exists to catch. This
is the record of building the rest, and of the four bugs that turned up
underneath them.

## What `גלישה` accepts now

Seven moves and the empty list:

| value | thing four | what it does |
|---|---|---|
| `"דחיסה"` | 5 | compress to the minimum gap — none at all |
| `"רצף"` | 4 | run the region in: one paragraph, not a block each |
| `"הקטנה"` | 7 | drop a type size, down a ladder, to a floor |
| `"כיווץ_אותיות"` | 6 | tighten the letterforms |
| `"חלוקה"` | 9 | redistribute inside a fixed total |
| `"צף"` | 8 | the notes marked `צף: true` are the ones that move |
| `"עמוד_הבא"` | 10 | spill to the next page — the default |
| `()` | — | a fixed box that stays fixed and clips |

Three of the ten are **still refused, and now say why**: clamp, shift-both-ways
and cascade are decision 6's invariant — a note is never printed off the paper
and never on top of another — so they run unconditionally on every region. A
writer who lists one is told that rather than handed a switch that is not one.
`_ap_spill_always` is that message.

## The order is the policy, read against spill

`גלישה` was already an array rather than a value, because a writer wants
*compress, then spill* and the order is the thing they mean. With seven moves
that ordering needs a rule, and spill is the pivot:

- everything **before** `"עמוד_הבא"` shrinks this page's demand, tried in turn
  until the page fits — `("הקטנה", "עמוד_הבא")` shrinks rather than spills, and
  `("עמוד_הבא", "הקטנה")` spills rather than shrinks;
- everything **after** it is kept for what spill cannot help: a single entry
  taller than the whole region, which has no next page that would be any roomier.

## The walk had to become page-major

The old `_ap_assign` walked the notes carrying a page cursor. That is enough for
spill and enough for nothing else: **shrinking a band is a decision about a
page**, and it cannot be taken one note at a time by a loop that does not yet
know which notes the page will hold. So the walk is over pages now — each takes
what is anchored on it plus what the page before carried, decides how it is set,
keeps what fits and hands on the rest. A note still never moves backwards.

It returns `(page, scale, tracking, runin)` per note instead of a page, and
`_ap_on_page` hands the renderer the same values back. The two disagreeing is
the one real limit `NOTES-PLAN` names, and the shape here is what makes it
impossible rather than merely unlikely.

Measured, on `ov_shrink2` / `ov_clip2` — three notes into a 0.6cm region:

| | `גלישה: ("הקטנה",)` | `גלישה: ()` |
|---|---|---|
| type size | **8.2pt** (10.2 × 0.8) | 10.2pt |
| entry pitch | 8.02pt | 9.37pt |
| all three inside the region | yes | no |

and on `ov_runin`, six notes run in are **one line** where they were six.

## The baseline grid, and the bug it caused

`רשת_בסיס` is document-level and off by default. Every line advances by the grid
or by a whole multiple of it, so a commentary at 9pt and a body at 12pt meet line
for line — which is the drift that makes amateur parallel typesetting look wrong.

It is exact because of `top-edge: 0.75em` / `bottom-edge: -0.25em`: the line box
becomes exactly `1em` whatever the font, so the advance is exactly
`leading + size` and the arithmetic has something true to solve. Measured on
`grid_on`, body line advance is **16.00pt** against a declared 16pt grid, where
`grid_off` gives the font's own 16.92pt.

**And the first version of it broke every overflow move.** The grid leading was
applied by `_bl_snap`, a `context` block wrapped around the apparatus body — and
`measure()` of content with a `context` block inside it comes back at almost
nothing. Every entry measured about half a line, every region looked like it
fitted, and not one move ever fired. It was invisible in the output, because a
region that thinks it fits renders exactly as it did before.

The leading is resolved by the caller now and passed in as a plain length
(`_ap_lead`), so the walk and the renderer get the same number and neither is
measuring a `context`.

## Two bugs found underneath, one fixed and one recorded

**A region's declared height was never the overflow cap.** `_sf_cap` read the
apparatus's `גבהים` and the page reserve, and `#אזור("צר", גובה: 2cm)` reached
only the *drawing* of the slot. So a declared region overflowed in silence: the
slot clipped what it was handed and the walk deciding what to hand it was still
working from the whole reserve. Fixed — the declared height is the cap.

**A declared region larger than the room prints off the paper.** With no
`אזור_הערות`, `ov_shrink.ksav` puts five notes into a declared 2cm region on a
sheet with 25.47pt of actual room under the footer, and the fifth prints at
**y=853.90 on an 841.89pt page**. `_ap_room` now measures the room where the
footer actually starts rather than taking the bottom margin for it — the margin
is 42.87pt and the room is 25.47pt, because the page number and its clearance
live in that margin too. That much is fixed; what is **not** fixed is the
declaration itself. `#מסמך` sets the page margins before any `#אזור` line in the
body has run, so a region cannot enlarge the reserve it needs, and the honest
answer is probably to refuse the declaration rather than clamp it. `ov_shrink`
and `ov_clip` are kept in the corpus as the reproduction.

## `שומר_מקום`, which was reverted the night before

Built again, and this time at the site that can move the page. The version that
was reverted collapsed the block *inside* the slot, which frees room nothing else
can reach — the room a page-foot region occupies comes off the bottom margin
before any of that runs. Dropping the region out of the list is what moves the
page, so that is where it is decided, in `_sf_page_streams` and `_pp_page_bands`.

## What is named and could be named otherwise

`רצף`, `הקטנה`, `כיווץ_אותיות`, `חלוקה`, `צף`, `הקטנה_מזערית`, `רשת_בסיס`,
`מספור_שורות`. Decision 14 says the naming is Shaul's; these were chosen to be
overruled. See [The words for the note system](2026-08-20-the-words-for-the-note-system.md).
