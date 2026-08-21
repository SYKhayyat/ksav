# 2026-08-22 · The three that were owed

Three things were left open at the end of the note-system wave and written down
rather than fixed. All three are fixed.

## A box that clips no longer does it in silence

`גלישה: ()` is a writer asking for a box that stays fixed, and it stays the one
arrangement in the application that may lose text. What it may not be is silent:
a note short by four lines looks exactly like a note that was four lines shorter,
and `NOTES-PLAN` thing four has said *and always warn* since it was written.

It cannot be a compiler warning — Typst 0.15 gives a prelude `panic` and nothing
quieter, and refusing to compile is the wrong answer to a writer who asked for a
fixed box. So it is a mark at the clipped edge.

**The first attempt measured, and was backed out.** `_ap_slot` is handed the
region's *furniture* and not only its prose, so `measure` answers 64.26pt for a
four-word note in a 34.02pt box and a mark hung on that fires on every fixed box
there is. A false alarm on all of them is worse than none.

The fact belongs to the walk that decided it. `_ap_fill` knows there was no
`"עמוד_הבא"` to move the overflow to; it records that per group, `_ap_assign`
carries it on the entry's record, `_ap_on_page` collects it for the page and
`_ap_setting` hands it to the renderer beside every other per-page fact. Four
cases are fenced: it clips and says so, it has room and stays quiet, it spills
and stays quiet, and `סימן_חיתוך: none` silences it for a sefer that wants the
clean edge.

## A note beside the text can be referred to

`שם` reached every collector but this one, so a gloss in the margin was the only
kind of note that could not be cross-referenced: `#הפניה_להערה` came out as a red
`?` naming a note that is on the page, correctly numbered, two inches away.
Cross-references are for exactly the apparatus a gloss belongs to.

`_sn_note` now takes the name and records the **printed** marker under it, for
the same reason the page-foot apparatus records the printed one: a column
lettered א ב ג is referred to as «עיין הגהה ב», and a reference saying 2 would
name a note the reader cannot find. Both doors — a channel placed at the side and
a region placed at the side — are fenced, because those two call paths have
disagreed about something twice now.

## The line address was quadratic

`_ln_at` was called once per entry and read every numbered line in the document
each time. On a release build, an apparatus addressed by line:

| entries | by line | by dibbur hamaschil |
|---|---|---|
| 40 | 0.19s | — |
| 160 | 0.97s | 0.36s |
| 640 | **14.87s** | 1.59s |

Four times the entries, **15.3 times** the time, against 4.45 for the same
document with the address left out. The same fault as `_ap_entry_height` a day
earlier, in a function written a day after it — which is what a walk inside a
per-entry loop always is, and it is worth saying plainly that knowing that did
not stop me writing one.

A query answers in **document order**, and document order is `(page, y)` order for
the body flow, so the last mark at or before a marker is found by halving rather
than by reading. After: **1.86s** for the 640-entry sefer and 4.15 times the cost
for four times the entries — within a sixth of what the same sefer costs with no
address at all.

## What is left, and it is not a defect

`probe` walks laid-out frames and a clip is a paint operation, so it cannot tell
a masked note from a printed one. `nothing_is_truncated.rs` therefore proves the
words reached a frame, not that a reader can see them. `svgdump` sees the
rectangle — it is what confirmed the fixed box clips at 34.02pt rather than
running off the sheet, so decision 6 holds — and the limit is named in that file
rather than papered over.
