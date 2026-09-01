## Scope

The fixed section — an `#אזור` box at the page foot (`פריסה: "תיבה"`, `מיקום: "רגל"`) — is a box, and every box caps: `compose_long` gives 9 distinct ShT positions for 30 notes. This issue proposes making the fixed section literally **two documents glued at a seam**: the section laid out as its own flow in the band below a fixed horizontal line, then composited per page over the body.

Measured working at the layout level on 2026-08-27 (`examples/glue.rs` — a probe with arbitrary margins); the plumbing (feeding the region's collected entries into the second document) is the build.

## The idea

- **Doc A** — the body, same sheet, `margin.bottom` = the seam. Its text area stops exactly at the seam. This is the existing reserve behaviour (`auto_notes_region_cm`), just stated as a margin.
- **Doc B** — the section alone, same sheet, `margin.top` = the same seam, `margin.bottom` = above the page number. Its text area **is** the band, and it flows.
- **Glue** — for each page N, overlay A's page N with B's page N. Both halves are cut from **one source** (the `compile_companion` pattern: two compiles of one source already exist and are tested), so markers and entries stay paired, and `_ksav_rank` is a document-order query identical on every layout pass — markers in A and entries in B number identically without any cross-document channel.

## Why it buys what a box cannot

- A flow paginates: **no nine-note cap, no clip, no overlap, nothing off-paper** — NOTES-PLAN decision 6's invariant holds by construction.
- **Spill is pagination**, free — no per-page assignment walk, no carry-in/carry-out.
- No windowed-spill text-layer artefact (the whole note repeated on every continuation page — the cost named in `decisions/2026-08-21-truncation-is-never-the-answer.md`).
- It is **not** frame chaining (nothing flows zone-to-zone) and **not** owning the pagination (Typst paginates both documents; the glue is post-layout compositing), so it does not collide with the two rulings in `decisions/2026-08-21-what-the-engine-will-not-do.md`.
- It is the in-engine form of NOTES-PLAN Part 8's rejected "Stitch PDFs" — with the "two documents cannot see each other" objection mostly gone, because both halves come from one source.

## Measured (2026-08-27, A4, seam 21.7 cm = y 615.12)

- **Doc A** (bottom margin 8 cm): body stops at y=238; page number below the seam.
- **Doc B** (top 21.7 cm, bottom 2.5 cm): **30 entries → 5 pages**; each page's band holds ~7; the next continues at y=623; max y=756.96 < band bottom 771.02; page number at 799.02. No cap, no clip, no overlap.
- **Glue**: one background, complementary text areas [70.9, 615.1] + [615.1, 771.0].
- Artefacts: `.preview-tmp/glue-a.ksav`, `glue-b.ksav`, `glue-merge.py`, `glued-preview.html` (all untracked scratch).

## Open questions / costs

- **Page-number position is margin-dependent** (measured: A's at 689.88 mid-margin, B's at the canonical 799.02). The glue needs one shared rule — probably B draws the number and A suppresses its own.
- **`DocConfig::from_json` clamps per-edge margins to 7 cm** — a 21.7 cm seam top margin is silently rejected (the first compile fell back to default margins). The clamp must be raised or a dedicated band setting added.
- Every consumer of the compile output learns to composite: preview SVGs (done by hand in the experiment), PDF export, `pagetext`/`probe`, the acceptance harness.
- Restart markers (`#התחל_מספור`) and `ראש: ("עמוד", …)` addresses need the same source-derived facts injected into doc B.
- Page-count mismatch semantics (empty band / blank body) need deciding.
- A flow is a **queue**, not a per-page assignment: the band shows the next chunk in order, which is exactly what spill is (decision 15). It cannot do "this page's ShT under this page's MB" matched by body page — but neither can the box.

## Acceptance criteria

A corpus document with 30+ notes in a foot region renders all of them on-sheet across several pages; markers in the body and entries in the band number identically; the band height is fixed per page; the page number appears once at the canonical position; and the two compiles stay inside the preview budget (the current number is ~59 ms for 234 pages; two documents are expected to stay well under 200 ms).
