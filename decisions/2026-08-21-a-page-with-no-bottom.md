# 2026-08-21 · A page with no bottom, and a flag that was already right

Two of `NOTES-PLAN`'s document-level items. One of them was already done by
somebody who is not in this repository; the other deletes the whole of thing four
for a sefer read on a screen.

## The PDF right-to-left flag was a hypothesis, not a finding

The plan says:

> **The PDF right-to-left flag.** Ksav does not set it — nothing in `src/` sets
> viewer direction, so readers do not open two-page spreads the correct way.
> **[U]** whether Typst's export exposes it or it needs post-processing.
> **[SHAUL: agreed.]**

The premise is right and the conclusion does not follow. **Typst 0.15 writes it
itself**, in `typst-pdf`'s `build_metadata`, derived from the document's
*language* — and `#מסמך` has set `lang: "he"` since it was written. Measured on
the exported bytes: a Hebrew document carries `/ViewerPreferences << /Direction
/R2L >>` and an English one `/L2R`.

So the flag has been correct all along, for a reason nobody here chose. That last
clause is why `engine/tests/pdf_document.rs` exists rather than a line saying
*done*: it is one byte in a file nothing in this repository had ever looked at,
so the day Typst changes how it derives that — or a writer sets `שפה` to
something else — the sefer opens its spreads back to front and every other test
stays green.

This is the same lesson as the marker item on 17 August: *a design written down
is a hypothesis, not a finding.* Fifteen minutes of looking at the artefact said
so before a line was written.

## `רציף` — one page, as tall as the sefer is

> **Digital output mode** — `page(height: auto)` makes overflow *impossible by
> definition*. For a sefer read on a screen it deletes this entire problem class,
> free.

And it does, exactly. A note that will not fit is a sentence about a page bottom,
and a continuous page has none: `_pg_text_bottom` answers `none`, and both spill
walks already read that as *no bottom*, so the whole of thing four **turns itself
off** rather than being switched off. The side column has no ceiling to clamp
against and nothing to carry forward; the page-foot reserve never runs out.

Three decisions in it.

**It is a document setting, not a preview one.** The same sefer printed is the
one exported. A mode that showed a writer a page shape their PDF does not have
would be the preview lying about the page, which is the defect this repository is
named for.

**The width still comes from the paper.** A continuous sefer is a column of a
stated width, not an infinite plane, so only the height goes to `auto`. Typst's
`paper:` and `width:`/`height:` are alternative spellings of one setting, so
asking for one dimension means giving the other — hence `_pg_paper_width`.

**The page has to grow for its notes, or they fall off the bottom of it.** This
is the part that was not free, and it is worth writing down because it is the
paged failure reappearing in the mode that is supposed to make it impossible:
`height: auto` makes the sheet as tall as its **flow**, and a side note is not in
the flow — it is painted from the page's foreground and takes no space at all.
Measured: a short body with twenty long notes beside it gave a page **183.49pt
tall** with the notes drawn hundreds of points below its own bottom edge.

The answer is the shape the extra pages already use: ask the walk how far down
the notes reach and give the flow that much room, hidden, at the end. It moves
nothing in front of it, so the answer is the same on the next pass.

`dense.ksav` is the document that proves it — the one that reached y=827.27 on an
841.89pt sheet before any of this, and needs two pages with spill. Continuous, it
is one page and cannot overflow.

## What is still owed at document level

**The baseline grid** is not built. It matters for a parallel page — body at 12pt
and commentary at 9pt drift against each other even in perfect per-page register,
and that drift is what makes amateur parallel typesetting look wrong — and it is
its own piece of work rather than a flag.

**Binding side** needed nothing: `שולי_כריכה` and `דו_צדדי` have fed
outer/inner since the per-edge margins were built, and `#מסמך` states
`binding: right` for Hebrew rather than leaving it to `binding: auto`, which
reads the *text* direction and would re-bind a document that flips direction
half way through.

**Gematria folio numbering** exists (`מספור_עברי`), as the plan says.
