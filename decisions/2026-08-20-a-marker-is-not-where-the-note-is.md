# 2026-08-20 · A marker is not where the note is

The report was *"adding a second footnote inside a fixed region made the first
marker change to ב as well, so both markers read the same"*, and the handoff's
diagnosis was the obvious one: a `context` resolving against a counter's final
value instead of its value at the marker.

It is not a counter. Ksav has not numbered a note from a counter since the day
it learned that counters do not converge under page-breaking — `_ksav_rank`
reads a **query**, and the whole apparatus is built on that. So the diagnosis
could not have been right, and the first job was to find out what actually was.

## Fifteen arrangements that work

A sweep first, because "fixed region" named two different documents and neither
of my guesses reproduced anything. Fifteen arrangements — the native default
channel, tiers 1 and 2, a declared foot channel, a foot region with a height, a
channel with its own height, a region collected at the end, one at the end of a
section, two channels in one region, Latin numbering, two notes across a page
break, section bands, per-page bands, parallel streams — every one of them
prints א then ב, correctly, in the body and in the band.

The one that fails is a note written **inside another note's body**. And the
sharpest case is the report word for word: two footnotes, one nested note in
each, both nested markers reading ב.

## Why, and it is mundane

`_ap_note` writes the note's registration, then this:

```typst
box(place(hide(body)))
```

which exists so that a nested note registers in the same layout pass. It works.
And it means a nested note's **real** registration sits up in the sefer, at the
outer note's own place, while the marker a reader actually sees is drawn down in
the band, later, when that body is re-displayed.

`_ksav_rank` counts what lies `.before(here())`. Down in the band, `here()` is
after every sibling registration in the sefer, so every nested marker counted all
of them and printed the last number. Two notes, both ב.

The **entries** were right the whole time, because `_ap_entries` numbers them by
walking the collected list rather than by asking where it is standing. That
split — one half of the apparatus numbering by position and the other by order —
is the actual defect, and it had been there since the pre-registration box was
added.

## The fix

A marker inside a re-display is numbered from the entry it is inside: how many
of its own group came before **that entry** in the sefer, plus how many of its
siblings this same entry has already printed. `_ap_group` says which entry it is
re-displaying and from where (`_ap_origin`); `_ap_entries` carries each entry's
own location so that it can. In the body of the sefer the origin is `none` and
nothing changes — which is why the control assertion (two ordinary notes in a
region still read א then ב) is in the fence beside the six new ones.

`_ksav_rank` also split into a raw `_ksav_count` and the clamp, because a caller
that adds two counts must clamp once at the end rather than twice in the middle.

## The fence

Six tests in `apparatus_marks.rs`, and they compare the **markers against the
entries** rather than against a literal: a number is only right if the reader can
follow it from the sentence to the note, and that pairing is exactly what broke.
Two nested notes, three (because two numbers can agree by accident and three
cannot), both numbering schemes, the unnested control, and the same nesting in
the native apparatus where there is no region at all.

The Hebrew-numbering case failed on its first run and the code was right: with
both channels lettered, `א` legitimately appears four times. It now numbers the
outer channel and letters the inner, which is both a decisive count and the
thing a sefer with two apparatuses actually does.

## What this says about the diagnosis in the handoff

It was wrong about the mechanism and right about the class — a value read at the
wrong point. Chasing the stated cause would have found nothing, because the
stated cause does not exist in this engine. The sweep is what found it, and the
sweep is what the item asked for.
