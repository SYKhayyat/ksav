# 2026-08-21 · A region that asks for room nobody made

The corpus documents written for thing four's overflow moves turned the
whole-corpus invariant fence red, and the fence was right. This is the finding
underneath it, corrected — because the first diagnosis, written a few hours
earlier in [The moves that were refused](2026-08-21-the-moves-that-were-refused.md),
named the wrong cause and claimed a fix that does not fix it.

## What actually happens

```
#אזור("צר", מיקום: "רגל", גובה: 2cm)
```

in a document that never said `#מסמך(אזור_הערות: …)`. Five notes into it, and
the fifth prints at **y=853.90 on an 841.89pt sheet** — off the paper, which is
the one thing `NOTES-PLAN` decision 6 forbids outright. In `ov_runin` even the
**page number** is pushed to 848.62, past the edge.

## The cause, which is one line and not the one I named

The page footer clips its content — and only when a reserve was declared:

```typst
if reserve != 0pt {
  block(width: 100%, height: reserve, clip: true, { … })
}
```

With no reserve there is no block, no height and no clip, so a page-foot region
draws at whatever height it declared, straight off the bottom of the sheet. The
comment on that branch says exactly what it is for — *"a clipped note is visible
as a problem, a note printed past the paper edge is not"* — and the branch it is
written in is the one case that cannot reach it.

The earlier record blamed `_ap_room` taking the bottom margin for the room, and
said measuring the room at the footer fixed it. **It did not.** The room is now
measured at the footer, which is a better number and is worth keeping, and the
document still prints off the paper, because nothing was clipping it either way.
Measuring a bound more accurately does nothing when the bound is not applied.

## Why it is not fixed here

The honest fix is almost certainly to **refuse the declaration**, not to clamp
it. `#מסמך` sets the page margins before any `#אזור` line in the body has run, so
a region physically cannot enlarge the reserve it needs — and a region that
declares 2cm in a document with 25.47pt under the footer has asked for something
the page cannot give. Clamping it silently hands the writer a 2cm region that is
not 2cm, which is the same class of lie as printing past the edge, one step
quieter.

That is a change to what `#אזור` may *say*, and it wants deciding rather than
guessing: whether the reserve grows to fit the regions declared in the body
(a second compile pass), or the declaration is refused with the number that
would fit. Both are real answers and they are not the same product.

`ov_shrink2` / `ov_clip2` are the same pair with `אזור_הערות` declared, and they
stay inside the page and exercise every move — so nothing about the moves is
blocked on this.

## The disproof list had the same shape as the bug

`notes_acceptance.rs` already carried a `DISPROOFS` list for corpus documents
that exist to fail, and its own doc comment says an exemption that has stopped
being needed is a stale claim. It had no way to know. A row could be fixed
underneath and sit there for ever, quietly excusing a document that passes.

So the fence now checks its own exemptions: **every disproof must still be
printing past the page number**, and must still be in the corpus. The moment one
is fixed, the suite fails and the row has to go. That is the same shape as
`registry.rs`'s `ONLY_AT_TOP` — the fourth instance of it in this repository, and
the reason it keeps being rebuilt is that an exemption nobody re-checks is
indistinguishable from a bug nobody found.

## One more thing the fence caught

`grid_on` printed its page number 0.91pt lower than every other document. A
baseline grid normalises the line box to exactly 1em, which is what makes the
body advance exact — and it was reaching the page number, which is furniture and
has no business drifting. The number is off the grid now; the apparatus stays on
it, because holding register with the body is the whole reason a writer turns one
on.
