# 2026-08-20 · A knob that turns nothing

`NOTES-PLAN.md` Part 7 item 5 asked for *"the render-diff fence over every
settings dictionary — enumerate the dicts, generate two values per key, render,
diff, on the right instrument"*, and estimated three days. It is
`engine/tests/settings_live.rs`, it covers all eleven dictionaries, and it found
**six settings that were declared, documented, and changed nothing on the page**
— none of which was the one it was written for.

## Why the two obvious fences do not work

The plan is right about both, and both were re-confirmed here.

**Grep does not work.** 28 hits over 120 keys, 27 of them false, because the mark
register looks its knobs up through a string variable — `c.at(key)` — so the
literal never appears anywhere near the code that reads it.

**`probe` alone does not work**, and this is the one that cost real time. It
reads text runs: page, x, y, size, text, face. **It could not see the colour of
text at all.** `probe::fills` reads filled *shapes* — a highlight, a cell
background, a rule — and a coloured word is none of those; it is a glyph with a
paint on it. So the fence's first run reported the `צבע` key of **eight**
dictionaries as dead, in a product where colour has worked for months.

That is the plan's own lesson arriving on schedule: *an instrument that cannot
see the property under test returns "no difference", which is indistinguishable
from a pass.* `TextRun` now carries `fill`, and it is the third kind of thing
that turned out to be invisible to every test here.

## The shape

For each of the eleven `#let _X_defaults = (…)` dictionaries — read out of
`ksav.typ`, never from a list in the test — and each key in it: render a document
twice, differing only in that key, and diff the whole page. Text runs for
position, size, face and colour; fills; strokes; page sizes.

It fails in **two** ways and both are the point:

1. **A key changed nothing.** The bug it was written for.
2. **A key has no contrasting value in the table.** The fence against the fence
   going stale. A hand-kept list of *what to check* rots in silence; a hand-kept
   list of *how to vary each kind of value* fails loudly the first time it is
   incomplete. The table is keyed by **key name**, because `גודל` is a size in
   all eleven blocks that have one — so a twelfth apparatus that grows a `גודל`
   is covered the day it exists.

A third list, `OVERRIDE`, is where a shared name means something else in one
block, and it is worth having for its own sake: `קו` is *is there a rule*
everywhere except on a table, where it is *how thick the rules are*. A name that
means one thing in eleven places and another in the twelfth is something a writer
will get wrong, and it should have to be written down to survive.

Mutation-tested: `inset: c.at("מרווח", …)` replaced by a constant, and the fence
named `#הגדרות_טבלאות(מרווח: …)` and nothing else.

## What it found

### 1 · The endnote block's slant — a sixth site

`_es_text()` mapped `סגנון` to `text(style:)`, the request the bundled Hebrew
families answer with the upright face. Six sites asked the dead way in all; the
plan named four, reading the code found a fifth (`_mk_render`), and **this one
nobody found by reading at all.** It turned up because a machine rendered every
key of every dictionary twice and looked at the pages.

### 2 · A heading's alignment has never worked

`#הגדרות_כותרות(יישור: "מרכז")` and `(יישור: "ימין")` put the same heading at
x=480.8. Two faults, one on top of the other:

- The written word never became an alignment. `_doc_align` is the one place that
  turns `"מרכז"` into `center`, `_mk_frame` uses it, and the heading rule and the
  table did not — so a word that has always worked on `#מסמך` was a compile error
  on a heading.
- And under that: **`align` inside a shrink-wrapped `block` has nothing to align
  within.** The heading's block had no width, so it was centring the heading
  inside the width of the heading.

That second one is the **third** time this exact shape has been paid for here.
The page number in the footer was centred inside the width of one digit — x=519.62
of a 595.28pt page — and there is a third instance noted beside `_mk_frame`. Look
hard at any `align` whose parent is a `block` with no width.

**A title page's title ships `יישור: "center"`**, so this is not a knob nobody
set: `#שער` has never been centred. It is now, at x=241.8.

### 3 · A table's header row has never been shaded

`#כותרת_תא` built its own `table.cell(fill: …)` inside a `context`, because the
colour lives in a state and reading one needs a context. **A `table.cell` wrapped
in a `context` stops being a cell.** Measured against raw Typst:

```typst
#table(columns: 2, table.cell(fill: red)[א], [ב])            // paints the cell
#table(columns: 2, context { table.cell(fill: red)[א] }, [ב]) // paints nothing
```

So the shipped grey header *and* `צבע_כותרת` have both been invisible for as long
as the command has existed. The cell's **bold** came through, which is what made
it look like a working feature.

The table paints them now — it is the only scope that knows both the colour and
which positions were asked for as headers, and `_kd_kind` already says which
those are, off the same mark that tells a `#תא` from ordinary content.

### 4 · The reviewer's name printed on a comment and nowhere else

`#הוספה(מאת: "שאול")` and `#מחיקה(מאת:)` accepted the argument and **never used
it**. `_rv_by` renders it, `#הגדרות_סקירה(שמות:)` exists to switch it on and off,
and `#הערת_עורך` was the only caller — so the switch did nothing in two of the
three places it claims to govern.

### 5 · Small capitals

`smallcaps` asks the font for `smcp` and the six bundled faces have none, so
`רברבתי` printed nothing different. The same defect as the slant, one row down
the same dictionary. Drawn now rather than requested — lower-case letters set as
capitals a size smaller — with `smallcaps` still on the outside so a family that
carries the feature uses its real one. Hebrew has no case, so it is untouched by
construction, which is exactly why the setting is worth having in a Hebrew
document: a sefer's English title page is where it is reached for.

### 6 · A single numbering scheme meant nothing

`#הגדרות_הערות(מספור: "א")` fell through a `type(…) == array` test and did
nothing. The setting worked only when written as a tuple and was silent when
written the obvious way — while `_ap_pick`, three apparatuses over, has always
taken a scalar to mean *every group*.

## What the fence's own failures taught

Three of its first reports were the **document's** fault, not the product's, and
each is a claim worth writing down:

- `מספור`, `ריווח_מספור` and `התחלה` have nothing to say about a bulleted list.
- `צבע_פס` paints nothing in a table with no stripes — and asking for the stripes
  in the document, which comes *after* the fence's own settings line, overwrote
  the key under test and reported `פסים` itself dead. Order was the whole of it,
  and `before` exists for that.
- `מרווח` on the side column is the gutter, so it changes how wide the main
  column is — and a document of one short line wraps the same at any width.

A fence's document is as much a claim as its assertion.
