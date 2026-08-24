# 2026-08-23 · The seam, the wrappers, and four helpers

The audit's remaining confusing behaviors and missing features, closed out.

## F1 · A gloss beside the text can be referred to

`#הערת_גיליון`, `#הערת_ימין` and `#הערת_שמאל` refused `שם:` while `_sn_note`
underneath accepted it — so the wrapper spellings the chooser leads with were
the one way a sidenote could not be named for `#הפניה_להערה`. All three carry
the name now; `name:` arrives through the existing table. Ruled by the owner
when asked: accept everywhere rather than stop documenting it.

## F2 · An English sefer can cite pages in its own words

`עמ' 47` and `דף ב׳ ע"א` were hardcoded Hebrew against this file's own rule
that an invented word takes an answer. The words come from a new `כתובות`
dictionary on the apparatus config, keyed by ingredient (`עמוד`, `דף`, `אמוד`),
said either language — declared on channels, regions, and all three banded
setters that now validate their keys.

## C1 · Refusals that advertise vocabularies that are wrong

The placement refusals listed three of the ten legal placements and hid the
side family from exactly the writer who wanted it; both read `_ch_places`
now. And the row-plan refusal advised `עודף: "שורה"` / `"טור"` — values the
parser refuses, so following the advice earned a second panic. It names
`"שורה_נוספת"` and `"טור_נוסף"` as they are spelt.

## C5 + F3 · Four helpers nobody called

Two were **second implementations**, and the house rule for those is deletion:
`_sn_stack` was the assign walk's finished twin (clamp, shift-both-ways,
cascade — the same three moves `_sn_assign` runs unconditionally), and
`_sn_active` was a second state counting what `_sn_shape` already carries with
more detail. Both gone, with comments left where they sat.

Two were **unfinished wiring**, and those got their callers.
`git.documentChanged` answers *is my sefer among the dirty files* — the
changes list now marks the open document's row. `isOp` guards `api.git`, the
last door before the request leaves: the wire does not read TypeScript, and an
embedder's JavaScript never met a `.d.ts`.

## C3 · The footnote key opens a dialog, and now every page says so

`Ctrl+Shift+F` opens the insert dialog — body field, then add — while the inner
README sold *"a footnote is `Ctrl+Shift+F`"* as if it were one step. The flow is
defensible; the documentation now says what happens, in the README's notes
section, its shortcut list, and `docs/shortcuts.md`.

## C4 · The validation seam, written where a client author looks

The prelude refuses unknown keys by name; `/compile` silently ignores unknown
request fields. Both choices defensible, the seam between them undocumented —
it is stated now on `read_document`, which is the function both services read
requests through: the first is versioning across a wire, the second is honesty
inside a page.

## C6 · The counts

The service table's stale "eleven" went in an earlier chunk today. The
save-route table at `save.ts:109` was re-checked against `saveRoute` and
`save.test.mjs` and found current — recorded here as checked-and-clean, so
nobody re-audits it.
