# 2026-08-21 · A region nobody drew

`NOTES-PLAN` marks the second addressing system `[U]` — unbuilt:

> A markerless stream needs addressing by line, page, daf or siman instead — a
> second addressing system, which seforim use constantly.

Building it turned up three bugs in the arrangement it was supposed to address,
each of which made the feature under it unreachable, and none of which had
anything to do with addressing.

## One · a region declared at the end of the sefer printed nothing at all

```typst
#אזור("ביאורים", מיקום: "סוף")
```

is the whole promise of the region model: say where the commentary goes, once, at
the top, and every note filed into it moves. It was half true. The placement was
honoured for **filing** — the notes went into the right collector, got the right
numbers, and could be queried — and the region was drawn only if the writer also
called `#הצג_אזור("ביאורים")` by hand.

So a document that declared where its commentary went and never called that
printed **nothing**. No commentary, no warning, no empty band — the notes were
filed correctly into a region nobody drew. Every region declared at the end of
the sefer is drawn there now, unless the writer placed it themselves.

The guard for "unless the writer placed it themselves" is worth recording,
because the obvious version does not work. `#הצג_אזור` emits a dump marker, so a
guard that queried for one would find the marker the automatic dump had just
emitted, switch itself off on the next layout pass, switch back on the pass
after, and never settle. It is a state the *writer's* call sets and the automatic
one does not — `_cn_shown` — and the rendering was split out of the command so
the automatic path can draw without marking.

## Two · a region's `ראש` never reached anything that draws

`ראש` — what stands at the head of an entry — was accepted on `#אזור`, and both
the renderer and the note-side marker built their configuration out of the
**channels** alone. So a region that asked for an address got the default entry
head and printed a number.

That is the bug that made the address unreachable, and it is the same shape as
`גלישה` not reaching `_sf_cap` earlier the same night: a key accepted on a
region, read nowhere, and therefore a setting that compiles and does nothing.
Both halves read the region now — `_rg_head_cfg`.

## Three · a markerless apparatus still put a marker in the body

Leaving `"מספר"` out of `ראש` is how a writer asks for the markerless
arrangement. It stopped the **entry** printing a number and the **body** went on
carrying a marker — pointing at an entry that had no number to match it, which is
worse than either arrangement on its own.

## And one that was found on the way out

Turning on `#מסמך(מספור_שורות: …)` numbered the **apparatus** as well as the
body: stray digits down the edge of every band, continuing the body's count, so
the numbers in the margin stopped meaning what they say. Line numbers are the
body's.

## What is built, and what is refused

| `ראש` ingredient | |
|---|---|
| `"עמוד"` | `עמ' מז` — the printed page, in the numbering the page itself prints |
| `"דף"` | `דף ב ע"א` — folio and side, counting from `דף_ראשון` |
| `"סימן"` | the document's own division, read out of a query |
| `"שורה"` | **refused by name** |

`"שורה"` is not built. Typst draws line numbers from the layout rather than
keeping them in a counter that can be read back at a marker's own place, so the
address came out empty on every entry — a word that compiles and prints nothing,
which is precisely what this repository spent the night removing. It is refused
with the three that exist rather than shipped hollow. The margin numbers
themselves work; reading one back at an arbitrary location does not.

`ראש` is checked now at all, which it never was: an ingredient nobody recognised
was silently dropped, so `ראש: ("ציטט",)` — one letter out — produced an entry
with no head and no complaint.

## The pattern, for the fourth time tonight

Three of the four bugs here are the same one: **a key accepted on a region and
read by nothing.** `גלישה`, `גובה`, `ראש`, and `שומר_מקום` all had it, in four
separate places, and each was found only by trying to use the thing the key was
for. `#אזור` accepts eleven keys; four of them were decorative. That is a sweep
worth running deliberately rather than discovering one key at a time — the same
finding as [Diagnosis without sweep](2026-08-09-lamdan-three-repos.md), in a
directory that already has a record about it.
