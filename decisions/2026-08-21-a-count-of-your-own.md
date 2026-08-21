# 2026-08-21 · A count of your own

`NOTES-PLAN` thing five, Part 7 item 7. The plan's own words for what was
missing:

> **Any number of named series**, running at once. Each renumbers on insert in
> the middle. Each restarts per siman, per chapter, or at a mark dropped
> anywhere. Each with its own shape. **Not tied to notes** — a plain numbered
> series in running text.

The last clause is the whole point, and it is the same sentence Part 1 opens
with about regions: *a general capability trapped inside one of its customers.*
Until now the only renumbering machinery in this engine lived inside the footnote
apparatus. A writer numbering a list of opinions, a set of variants or a count of
simanim wants exactly this and has no note anywhere.

## What it is

```typst
#הגדרות_מונה("דעות", מספור: "א")
דעה #מונה("דעות") ראשונה.        →  דעה א ראשונה.
דעה #מונה("דעות") שניה.          →  דעה ב שניה.

#הגדרות_מונה("נוסחאות", מספור: "(1)")
נוסח #מונה("נוסחאות") כאן.       →  נוסח (1) כאן.

דעה #מונה("דעות") שלישית.        →  דעה ג שלישית.
#התחל_מספור(שם: "דעות")
דעה #מונה("דעות") שוב.           →  דעה א שוב.
ונוסח #מונה("נוסחאות") שוב.      →  ונוסח (2) שוב.
```

Two series running at once, each with its own shape, and the restart that names
one leaves the other alone. A series nobody configures counts 1, 2, 3 in the
document's own ink.

## Three decisions inside it

**It is a rank, not a counter.** `#מונה` prints *how many marks of this series
lie before it*, read out of a query. Nothing is stored, nothing has to converge,
and **renumbering on insert is free**: a mark typed in the middle is simply one
more mark before the ones after it. That is the rule this engine has been built
on since counters were found not to survive page breaking, and it is why the
plan's estimate for this item — a week — came out at an evening.

**The restart is the one the writer already knows.** `#התחל_מספור()` restarts
every count, exactly as it did before this existed and in every sefer already
written; `#התחל_מספור(שם: "דעות")` narrows it to one series. A second command
with a second vocabulary would have been the mistake `NOTES-PLAN` Part 2 records
its own first draft making, when it invented `#סדרה` and `#סדרה_אתחול` for
machinery that was already in the tree.

`_nr_origin` therefore learnt one question — *whose series is this restart
about* — and a restart that names nobody still governs everything, named series
included. Two counts running at once are two counts; a `#התחל_מספור("דעות")`
that also reset the notes would make them one again.

**The category is `footnote` and the feature is not.** A category in this
registry says *what a writer would look under*, and somebody looking for
"numbering" finds `#הגדרות_מספור`, `#התחל_מספור` and `#המשך_מספור` there. The
comment beside the row says the rest out loud, so the next reader does not
conclude from its neighbours that this is a note feature.

## What it does not do yet

The plan's `[U]` stands untouched: **a markerless stream needs addressing by
line, page, daf or siman instead** — a second addressing system, which seforim
use constantly. Nothing here is that, and nothing here forecloses it.
