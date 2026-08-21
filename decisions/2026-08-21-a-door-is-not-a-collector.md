# 2026-08-21 · A door is not a collector

`#הערה_זרם` became a **door**: it reads where its channel was placed and calls
one of two collectors — the margin or the page foot. Before that it *was* the
page-foot collector, and the change broke three separate fences, each of which
was right to fire and each of which needed a different fix. That is worth a
record, because the three between them describe what this repository actually
asserts about its own apparatus.

## Why there is a door at all

`#הערה(ערוץ: "x")` and `#הערה_זרם("x")` are two spellings a writer may use for
one act. They gave two different answers: a channel placed beside the text
printed in the margin through the first and at the foot of the page through the
second. A placement is a property of the *channel*, so it cannot depend on which
command was typed — that is the complaint the eighteen note commands answered and
it had grown back in miniature.

The dispatch could not live at either door. Typst resolves a name where the
closure is written, `_sn_note` is defined below both, and a check written at
either one could only reach half the model. So there is one `_note_to`, defined
below everything it routes to, and both doors call it.

## Fence one · the page-foot reserve

`lib.rs` derives, from the prelude, every command that renders into a page
footer, and asserts the reserve lists cover all of them. **A missing one means a
document using it keeps its full text height and the apparatus runs off the
bottom of the sheet** — so this fence is load-bearing.

It caught the rename immediately, in the right direction: the new internal name
`_sf_stream_note` renders into the footer and nothing covered it.

Its *other* direction then caught the door — `הערה_זרם` was listed and no longer
named a footer-rendered command. My first fix was to follow calls transitively,
and **that over-reached**: `banded_config` mentions a band command and is a
configuration command that renders nothing. A closure over "names it" is not a
closure over "is one".

The fix that holds is narrower. What makes a listed prefix *dead* is the command
going away, so direction two asks whether the prelude defines it at all rather
than how it renders. Direction one — the half that protects the page — is
untouched and still exact.

## Fence two · the shared core

`apparatus_golden.rs` asserts that each public collector is the thin wrapper it
claims to be: its first few lines must call `_ap_note`, because *"a banded
apparatus that does not call it is a second implementation."*

A door does not call `_ap_note` and never should — it calls the collector that
does. The fence is now pointed at `_sf_stream_note`, which is the thing whose
thinness was ever the claim. Asking a router why it does not collect is asking
the wrong object.

## Fence three · the English names

Adding the side placements meant adding `side` to `_en_values`, which already had
it: a region's `פריסה: "צד"` — channels laid out beside each other — and a note's
`מיקום: "צד"` — printed beside the text. One word, two jobs, and the same English
word for both, so there is one entry and it is right that there is.

A duplicate key in a Typst dictionary is **a compile error for every document**,
not a warning. One careless line in a shared lookup table takes the whole app
down, and what caught it was the diagnostics test rather than anything about
channels.

## What the three have in common

Each asserted something true about the old shape and slightly wrong about the
new one, and in each case the repair was to ask the *same question of a different
object* — not to weaken the claim. A fence that has to be loosened to accept a
refactor is usually a fence that was measuring the wrong thing; a fence that has
to be **re-aimed** was measuring the right thing at the wrong target.

The one to be careful about is fence one. Its first fix was a loosening dressed
as a generalisation, and it passed. The second fix is narrower than the original
in one direction and identical in the other, which is the shape a correction
should have.
