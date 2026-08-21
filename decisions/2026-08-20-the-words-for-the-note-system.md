# 2026-08-20 · The words for the note system

`NOTES-PLAN.md` decision 14 says the structure of Part 2 is arguable and the
vocabulary is Shaul's, and that whoever builds it asks before inventing names.
The work was handed over for a night with *no interruptions*, so asking was not
available and the alternative to deciding was leaving the whole plan unbuilt.

So every name is decided here, and this file exists so that overruling any of
them is a search-and-replace against a list rather than an archaeology dig. Each
row says what was picked, what else was considered, and why. **Nothing in this
file is settled in the sense Part 0's decisions are settled.** It is a set of
defaults chosen by somebody who is not the baal habus, written down in the shape
that makes them cheap to change.

## The rule that produced most of them

**Prefer a word this product already uses to a word that is merely correct.** A
name already in `ksav.typ`, in `_en_values`, or on a command the writer has met
is a name they have already learnt. Two of the five destinations and three of the
region keys needed nothing invented at all, and that is the whole reason the list
below is short.

## Destinations · the values `ערוץ:` accepts

The destination *is* the stream (decision 4), so these five values are the whole
of what a note picks.

| value | English | where it prints | new? |
|---|---|---|---|
| `"רגל"` | `foot` | Typst's real footnote area, the live page foot | **no** — already a validated placement on `#אזור` (`_ch_places`) and already in `_en_values` |
| `"סוף_מדור"` | `section` | the end of the section | **no** — same |
| `"סוף"` | `end` / `document` | the back of the sefer | **no** — same |
| `"צד"` | `side` | the side column | the value is new to `ערוץ:`; the word is not — `#הגדרות_זרמים(פריסה: "צד")` already means this column, and `side: "צד"` is already in `_en_values` |
| `"קובץ"` | `file` | a companion volume | **new**. `NOTES-PLAN` Part 2 proposes it and it is kept |

`"קובץ"` is the one that was argued about. It means *file*, and what the writer
is making is a **volume** — `"כרך"` — or an **appendix** — `"נספח"`. Both are
better descriptions of the artefact. `"קובץ"` won on two grounds: it is the word
in the plan the user read and approved the shape of, and the thing the engine
actually produces is a second output file, which is what the writer will be
handed and what they will have to name. If this one is overruled, `"כרך"` is the
recommendation.

The fifth destination is not a value of `ערוץ:` at all — it is `אזור: "<name>"`,
a named region, because that is what recovers two separately-numbered apparatuses
in the same place.

## Regions · the keys `#אזור` grows

`#אזור` had a name and a placement. A region is a general page-layout mechanism
with notes as one customer, so it has to be able to say what *kind* of thing it
is.

| key | English | what it says | considered instead |
|---|---|---|---|
| `פריסה` | `layout` | `"טורים"` (a grid) or `"תיבה"` (a fixed box) | `סוג` (kind) — rejected: `פריסה` is already this prelude's word for an arrangement, in `#הגדרות_זרמים(פריסה:)` |
| `טורים` | `columns` | the column track sizes | — already the document-level word for columns |
| `יחידה` | `unit` | the chunk two columns synchronise on — `סימן`, `סעיף`, a heading level | `גוש` (block), `מקטע` (segment); `מקטע` is taken by `#מקטע_עמוד` |
| `גלישה` | `overflow` | what happens when it is full — see below | `הצפה` (flooding) — rejected as the word for a disaster rather than for a policy |
| `שומר_מקום` | `holds_space` | whether the box keeps its height on a page with nothing in it | `שריון` (reservation) — shorter, and says nothing about *when* |
| `גובה` | `height` | in cm/mm/pt/in **or a percentage of the sheet** | — already the word, and percent-of-sheet already works |

## Overflow · the ten moves, named

`גלישה` takes an **array**, not a single value, and that is a decision rather
than a detail. The ten moves in `NOTES-PLAN` thing four are not alternatives; a
writer wants *compress, then drop a size, then spill* and the order is the
policy. One value per region would have forced a menu of arrangements, which is
the exact thing decision 10 rules out.

| move | value | note |
|---|---|---|
| clamp | — | **not a value.** Never printing off the paper is the invariant (decision 6), so it is always on and cannot be turned off |
| shift, both directions | `"הזזה"` | |
| cascade | `"מפל"` | |
| run the band in | `"רצוף"` | one paragraph rather than one line per note |
| compress toward the minimum gap | `"דחיסה"` | |
| tighten the letterforms | `"צמצום"` | character-level justification |
| drop a type size | `"הקטנה"` | |
| redistribute inside a fixed total | `"חלוקה"` | two bands sharing 6cm get 4 and 2, not 3 and 3 |
| spill to the next page | `"עמוד_הבא"` | **the default**, and the strongest (decision 5, decision 15) |
| per-note shift policy | `נייד:` | not a region value at all — it is a key on the *note*, because it is that note's own permission to be moved |

`גלישה: ()` — an empty list — is a region that does none of them and clamps.
That is a real thing to ask for and it is what a fixed box meant before any of
this existed.

Degrading to a footnote is deliberately **not** on the list. It is an export
concern (decision 15) and lives at document level.

## Slant

`סגנון: "italic"` is what every settings dictionary in the prelude already says,
and it stays. `"נטוי"` is accepted beside it, because a Hebrew document asking
for a slant in English was the odd thing and `#נטוי` is a command this product
already gives the writer. It is **not** added to `_en_values`, which maps English
*to* Hebrew: `text(style:)` would then be handed a Hebrew word by every other
caller of `_val`.

## What was left alone

`#הגדרות_מספור`, `#התחל_מספור` and `#המשך_מספור` were named on 20 August in
[Starting the count again](2026-08-20-starting-the-count-again.md) and are not
re-opened here. `NOTES-PLAN` Part 2's first draft invented `#סדרה` and
`#סדרה_אתחול` for them, which is recorded there as one of its three flaws.
