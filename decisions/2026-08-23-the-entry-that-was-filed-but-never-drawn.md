# 2026-08-23 · The entry that was filed but never drawn

Five findings from the 23 August code audit, all in or under the apparatus
filing path, fixed as one chunk because they are one defect family seen from
five sides: **two halves of one system answering different questions about the
same note** — where it was filed versus where drawing looks for it; what the
walk budgeted versus what the slot clipped; what the writer wrote versus what
the reserve scanner could see.

## B1 · A note into a named region lost its entry

`#הערה(ערוץ: "c", אזור: "r")` files by channel name and draws by re-derived
region. `_rg_show` filtered its region's window with
`_ch_region(t, group) == rg`, which reads the channel's *declarations* — and a
channel named only at the note never declared any region, so the filter answered
"c" against a question about "r". Numbered, queryable, drawn by nothing. The
side-placement variant lost the same way one level down: filed under a margin
stream named for the channel, which the margin walk does not enumerate because
it enumerates side regions and declared side channels.

Fixed at the root: filing now records what it did — `_ap_note` carries the
region on the entry (`אזור:`), `_cn_note` fills it in, and membership reads it.
A window between two dump markers can hold entries filed to another region, so
the filter stays; what it filters on is filing truth rather than declaration
guesswork. The side variant files under the **region's** stream label, which is
the stream the margin walk already looks for.

## B2a · The reserve scanner could not see `אזור:`

`auto_notes_region_cm_on` collected used channels from `ערוץ:`/`channel:`
arguments only, so one of the five destinations the chooser writes reserved
zero and its regions printed off the paper. The scan now takes the region
argument as naming the target (the region wins when both are given, matching
the filing), while skipping declarations outright — a `#ערוץ("c", אזור: "r")`
line writes no note into anything, and keyed-on-notes still holds.

## B2b · A declared height with no reserve printed off the paper

This is the sitting refuse-or-grow question of 21 August, and the answer fell
out of B2a. The reserve is computed **before layout**, by reading the source —
so once the scanner sees `#הערה(אזור:)` notes and the heights they point at,
the default is **grow**: the page foot reserves exactly what the body's foot
regions declare, and the footer's clip block exists to keep anything that asks
for more visible rather than off-paper. No second compile pass is needed;
the scan was always the second pass.

The refuse half needs no new word: declaring the reserve explicitly
(`#מסמך(אזור_הערות: …)`), which overrides the scan as before, plus
`חריגה: "סירוב"` on a region refuses the over-ask with the number that would
have fitted — both built and fenced since 21 August. A document-wide
refuse-without-declaring switch would mint a word the naming record reserves
for Shaul; none is invented here.

## B4 / B10 · The walk and the slot resolved one height two ways

A channel-declared `גובה` reached the slot renderer raw — no clamp, no refusal —
while `_sf_cap` gave the walk the whole reserve for that stream, and a
`שורות` height was budgeted against the apparatus line but drawn against the
ambient leading and size. One number now: `_ch_region_height` routes the
channel arm through `_ap_fit_room` like the region arm, `_sf_cap` consults the
channel record in the same precedence order the slot uses, and `_ap_slot`
takes the caller's `קו` so both ends resolve against the same line. The
user-visible contract is fenced behaviourally: entries past a declared slot
spill and print somewhere, and a two-row region shows two one-line entries.

## B3 / B5 · One margin, one occupancy

Two independently placed side apparatuses interleaved, because the page
foreground walked each stream alone and collision machinery that cannot see
the other streams is not collision machinery. There is one `_sn_placed` now:
all streams' items merged in document order, one assignment, one cursor —
which also makes the carry branch's new pinned-note check meaningful across
streams. That branch placed a carried note at the next page's floor
unconditionally, overprinting a `הזזה: false` gloss anchored near the top of
the page it landed on; the carried note clears held intervals like any other.

## B11 · A quoted parenthesis derailed the scanner

`closing_paren` documented that strings were pre-blanked, which was false for
its keeping-strings callers; `"a)b"` closed the argument list mid-value and
the call was read short. It skips quoted spans wholesale now, honouring
escapes, and says so in its own comment instead of promising what no caller
guarantees.

## What was checked and not changed

- The foot/above placement variant of `_ch_note_in` files into the shared foot
  collector, whose drawer re-derives placement with the same default the filing
  used — audited, consistent, untouched.
- Two channels sharing one region still reserve it once; a region declared at
  the back still reserves nothing.
- Notes given both arguments number by their channel series inside the region;
  grouping is a property of channels and was not part of this defect.
