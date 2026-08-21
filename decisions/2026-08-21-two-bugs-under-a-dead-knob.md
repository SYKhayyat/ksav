# 2026-08-21 · Two bugs under a dead knob

`שומר_מקום` — whether a region keeps its slot on a page where it has nothing in
it — was written the night before and **reverted the same night**, because it
could not be shown to change anything on four documents. The reasoning at the
time was the right reasoning: shipping a setting that cannot be demonstrated is
the defect class `tests/settings_live.rs` exists to catch, and `_rg_own`'s keys
sit on `#אזור` rather than in a `_X_defaults` dictionary, so that fence would not
have caught it.

The reasoning was right and the diagnosis was wrong. The setting was not dead.
**Neither of its two answers was happening**, so there was nothing for the word
to switch between — and the reason was two bugs underneath it, both of which
were doing visible damage to documents that never mentioned `שומר_מקום` at all.

## One · a region that declared a height was not laid out on a page it was empty on

`_sf_page_streams` builds the page's regions from the streams *present* on it,
plus the streams with a declared slot — and "a declared slot" was read out of
`#הגדרות_זרמים(גבהים: …)`, which is a dictionary of **stream** heights. A region
that declared its own height with `#אזור("עליון", גובה: 1.2cm)` was in neither
list, so on a page where it had no notes it simply did not exist, and the regions
below it moved up into its place.

That is the opposite of what declaring a height means. The whole reason a writer
declares one is fixed geometry — *this band is always here, so the band under it
never moves* — and it was the one thing the feature did not do.

The page's fixed regions now include every declared region, with its members
being the channels pointed into it, and a region nobody declared a channel for
being its own channel, which is how `#הערה(אזור: "x")` names one.

## Two · regions printed in the order a note was written

The region list was built by walking the streams present on the page, so its
order was the order the first note of each region happened to appear in the
sefer. A page whose first note is in the lower region drew that region first.

So two regions **swapped places from page to page** — the upper commentary
printing under the lower one on every page that happened to begin with a note in
the lower one. Regions print in declaration order now.

Neither bug needed `שומר_מקום` to be reachable. Both were live in any document
with two page-foot regions, which is the arrangement the whole region model
exists for.

## What it does now, measured

`hold_yes.ksav` and `hold_no.ksav` differ in one word. Two regions of 1.2cm, the
upper one empty on page one:

| | `שומר_מקום: true` | `שומר_מקום: false` |
|---|---|---|
| the lower region on page 1 | **733.45** | **688.63** |
| the lower region on page 2 | 733.45 | 733.45 |

44.82pt from one word, and the second row is the half that matters as much: a
held region sits in the same place on every page, which is what it was declared
for. Both are in `tests/overflow_moves.rs`.

## The lesson, which is not the one that was drawn last night

"I cannot demonstrate this setting" was treated as evidence that the setting was
dead. It was evidence that *something* was wrong, and the setting was the last
place to look — it was three lines and the machinery under it was three hundred.
Reverting was still the right call for the night, because shipping it would have
been shipping a knob that did nothing. But the finding to write down was **"a
declared region height does nothing visible"**, which is a much larger claim than
"this key does nothing", and it was there to be made.

That is the same shape as [Broken beats unannounced](../ksav/../decisions/README.md):
the symptom was reported at the size of the smallest thing that could explain it.
