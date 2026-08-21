# 2026-08-21 · Truncation is never the answer

Shaul's ruling on the finding in `NOTES-SPILL-FINDINGS.md`, in his own words, and
the four things built to satisfy it. With it, the seven items left over from the
note-system wave are done.

## The finding, and why it was the last real one

A note taller than its own region was **not** clipped-and-warned, not spilled,
not refused. It was masked away — `_ap_slot` draws with `clip: true` — so the
reader lost it, silently, with an empty page available next door. Neither
`"עמוד_הבא"` nor `"דחיסה"` moved it by a single point.

The cause is not the policy. A page footer is composed afresh on every page and
has no continuation, so there is physically nowhere for the second half of a
block to land. `גלישה` was pointed at a surface that could not honour any answer
it gave, which is why a seventh overflow move would not have helped either.

## What was built: the note spills through its own region

`_ap_assign` already handed the renderer a per-note decision that the renderer
read back — the scale, the tracking, whether the region runs in. One more field
finishes it: **`span`**, how many pages this entry needs, and **`slot`**, how
much of it each page shows.

A note three times its region occupies three consecutive pages. It is emitted
whole into each of them and each draws a different part, by sliding the content
inside a window that does not move. `move()` shifts **paint and not layout**, so
page two's window resumes exactly where page one's stopped — measured at 34.02pt
on a 1.2cm region, which is the region, to the hundredth.

| | before | after |
|---|---|---|
| `giant_spill` — 50 words, 1.2cm region | 1 page, the rest masked away | **2 pages**, step 34.02pt |
| `spill/giant` — 60 long words, 40pt region | 1 page, ran under a clip to y=961 | **7 pages**, every word |

**The cost, and it is real.** The whole note is emitted into every page it runs
through and only masked, so text extraction, copy, and Ksav's own search of the
printed page see it once per continuation page. Cutting the body at a word
boundary would give a clean text layer and works only on text — worth building
for the common case, with this as the fallback for a table or an image. It is
Route B of the four costed in `NOTES-SPILL-FINDINGS.md`, chosen because it is the
one that loses nothing on any content.

## The configuration that was behind everything

Every finding of the last two days turned out to be one shape: **a region
declares a height in a document that declared no reserve.** The footer's whole
apparatus block is written inside `if reserve != 0pt`, so with no reserve there
was no block, no height and no clip — and that single case produced the truncated
notes, the reading that looked like printing off the paper, the region heights
that did nothing, and the dead `שומר_מקום`.

`_ap_free` is the answer: the bottom margin, less the page number and its
clearance, recorded beside the reserve so `_ap_room` has a bound either way.
`אזור_הערות` is no longer load-bearing — `spill/giant` spills to seven pages
without one.

The first attempt put a fixed-height block in the footer's `else` branch and
moved **every** page number in the corpus down 49.6pt, because a fixed-height
block draws its height whether or not it has anything in it. The bound belongs to
the region, not to the footer.

## Thing three's grid, which needed no new word

The naming record's open question was what to call grid-versus-box, `פריסה` being
taken. It answers itself: a region whose channels sit side by side **is** the
parallel-column arrangement, and `פריסה: "צד"` has meant that since channels
existed. What it could not do was set the widths or keep the columns level.

- `טורים` — the widths, one per channel. Measured: `(1fr, 2fr)` → `(1fr, 4fr)`
  moves the column 58.6pt.
- `יחידה` — what the columns are synchronised on. One grid row per unit, and a
  grid row starts level by construction.

Without `יחידה` each channel is one long cell and the columns drift apart by
however much their contents differ, which is what makes amateur parallel
typesetting look wrong and what no care inside a column can fix.

## `קובץ` — a fourth placement, and the writer picks

`#אזור(מיקום: "קובץ")` is a companion volume: its own sheet, its own page count
restarting from 1, which is what separates a volume from a section. Bound at the
back by default; `#מסמך(כרך_נפרד: true)` holds it out of the body for a file of
its own.

`compile_companion` cuts the two halves from **one source**, and the boundary
costs nothing to find: compile once with the companion held out and once with it
bound in, and the first one's page count *is* where the companion starts in the
second. Nothing has to be located in a laid-out document, because the difference
between the two documents is exactly the thing being looked for.

The companion is cut out of the bound document rather than laid out alone, and
that is not an optimisation. A companion addressed by `ראש: ("עמוד", …)` cites
**the sefer's** pages; rendered on its own with the body hidden, every one of
those addresses would read page 1 — a volume whose whole purpose is to say where
in the sefer each entry belongs, saying it wrongly on every line.

## The fourth source position was already built

Thing one's last home — a note whose prose lives in another file — was recorded
as blocked on the deferred model being one-string-in-one-string-out. That reading
was wrong. `#כלול` expands **textually, in the engine, before Typst sees
anything**, and `_nb_find` resolves a body with a **document-wide query**. A sefer
of many files is one document by the time either runs, so the pairing is not
one-string-in-one-string-out — it is one *document* in, and the document is
however many files the writer split it into.

Which makes it many-to-many for nothing: any file may hold bodies for markers in
any other, in either direction, and a file may do both at once.
`tests/cross_file_notes.rs` is what says so, because *"it should already work"* is
not a claim this repository accepts about anything. A name no file answers is
still drawn in red — the excuse a silent failure would hide behind is exactly
that the body might be elsewhere.

## What is still not built

The clean text layer for a spilling note — cutting the body at a word boundary
rather than windowing it. It is worth having for the common case, and this is
the fallback it would fall back to.
