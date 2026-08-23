# 2026-08-23 · The knob that read nothing

Five audit findings about controls that compile and change nothing, fixed as one
chunk because they share one root: **a key accepted by a writer-facing surface
and never read by the thing that renders**. Four of the five were found before —
the 21 August record says this exact class was caught four times previously —
and each survived because the check lived in one door while the store took
everything.

## B6 · Four channel keys read only by region paths

`ראש`, `מספור_כתובת`, `דף_ראשון` and `שומר_מקום` sat in `_ch_own` since they
existed, and their only readers were the region-record paths — so
`#ערוץ("פירוש", ראש: ("מספור",))` compiled, passed strict validation, changed
nothing. Wired through where the model says they belong: `_rg_head_cfg` folds
the channels' declarations in first and the region's last (a region is a place;
it stays the authority), and the `שומר_מקום` filter falls back to member
channels when the region record does not answer. A channel nobody declared as a
region is its own place, which is the reading `שומר_מקום` on a channel always
meant.

## B7 · `mark` had no English spelling

`watermark`, `clip_mark`, `continued_mark` and `refmark` were in `_en_params`
and plain `mark` was not — so `#counter_config("x", mark: …)` panicked, while
the apparatus configuration commands (which did not validate) stored the
argument under `"mark"` and no renderer ever read that key. One table row,
`mark: "סימן"`, fixes both directions at once.

## B8 · Nested dictionary keys could not be spelled in English

`_en` renames a call's own arguments and stops there, but a part setting *is*
another dictionary — `gemara_config(masechta: (weight: "bold"))` stored the
English words whole. `_mk_set` canonicalises two levels deep now, before
anything validates or stores, so the English writer reaches a part's prefix,
weight or colour exactly as the Hebrew writer does.

## B9 · Five setters stored unknown keys in silence

`הגדרות_הערות`, `הגדרות_מדורגות`, `הגדרות_מדפים`, `הגדרות_זרמים` and
`הגדרות_סימונים` inserted every named argument unchecked, while four sibling
setters refuse what they do not know. Each now validates against its own
defaults dictionary **before** the state update — the reason `#הגדרות_מספור`
gives in its own comment applies to every one of them: an update closure runs
only when something reads it, so a typo checked inside would compile clean on
documents that never read the state.

The one judgement call is `גלישה` on `#הגדרות_זרמים`, which was doubly dead:
not in the defaults, and `_sf_spill` reads moves from region and channel records
only. It is **refused**, not wired — overflow belongs to the region by decision
12, two streams sharing a region share its answer, and a per-stream knob would
let them disagree. Wiring it would have put a word into the language that looks
like a switch and is not one, which is precisely the class the settings fence
was built to stop.

## C2b · The gap that arrived as a dictionary

`_sf_page_streams` read `ריווח_פריט` with a bare `.at`, so a per-stream
dictionary arrived whole as the gap — the exact bug fixed in `_ap_group` and
recorded at 3384, unswept in its sibling. It goes through `_ap_pick` like every
other knob there.
