# 2026-08-28 · Superscript markers for footnotes and citations

Fixes #18. Footnote (`#הערה`) and citation (`#מראה_מקום`) markers printed inline at full body size on the baseline, indistinguishable from the text and collapsing adjacent pairs like `5051` into one number. The audit baseline showed the same rendering and did not flag it, and Vilna-style inline numbers are a real tradition, so the issue hesitated — but a reader of a sefer expects a raised superscript for a footnote reference.

Root is one class: every note apparatus that numbers in the body rendered its marker without `super` or with `super` but at body size and no separation. The native tiered footnotes (`הערה_בדרגה`) returned `_hb_num` from `numbering:` without `super`; `מראה_מקום` used `footnote(context ...)` with no `numbering:` at all, so Typst's default was inline; the sidenote fallback `footnote(_sn_wrap)` was the same; the banded apparatus already used `super` but at body size.

Family, swept:
- native tiered footnotes — both the ungoverned `footnote(..rest)` path and the two governed `numbering: _ => _hb_num` paths now return `super(text(size: 0.68em, ...) + h(0.08em))`
- citation footnotes (`מראה_מקום`) and sidenote fallback — now `footnote(numbering: n => super(text(size: 0.68em, str(n)) + h(...)))`
- banded apparatus — body marker `super(_ap_mark)` and entry head `super(_ap_mark)` now explicit `0.68em` plus thin space
- side-column markers `_sn_mark_of` — now `super(text(size: 0.68em, ...) + h(...))`

Size `0.68em` is Typst's `super` reduced size stated explicitly, plus a `0.08em` hair space after the marker so `1`+`2` cannot be read as `12`. Walk/draw still use the same number, so markers and entries stay paired; `_ksav_rank` unchanged.

## The correction: the hair space is *not* weak

The sweep originally shipped `h(0.08em, weak: true)`, and the `weak` flag was a real regression: Typst trims markup whitespace adjacent to a weak space element, so the space *after* a marker was absorbed into the 0.08em and the marker glued itself to the following word — `ראשון#הערה[…]` printed `ראשון1`, and an entry's number printed `1מילה01` with no space before the body. The cut/window tests that assert *every word exactly once* failed for the same reason: the reading of the first word of a cut entry began with the number run. Dropping `weak` keeps the hair gap between adjacent markers (they stay separate runs with a visible `x` gap) and restores the ordinary space after a marker, at the cost of the 0.08em not collapsing at a line end — an invisible fraction of a point.

Tests: `apparatus_marks.rs` asserts markers are smaller than the body and sit on its line — the raised half of "superscript" is a shift of the glyph within the line box that the probe cannot see (run `y` is the line's baseline), so it is guarded structurally by the `super()` wrapper and the prohibitions below — and that two adjacent `#הערה` markers do not collapse (visible `x` gap, both small). Prohibitions: `footnote(context` without `numbering:` and `numbering: _ => if numbered { _hb_num` without `super` are now forbidden, so a future bare footnote cannot slip back.

Counts: `engineTests` 976 → 980, editor assertions 7,565 → 7,569.

Mutation: reverting any one `super(text(size: 0.68em` to plain `_hb_num` makes `footnote_and_sourcenote_markers_are_superscript_small_and_raised` fail on size/y and `adjacent_footnote_markers_do_not_collapse` fail on size, and the new prohibitions fail naming the file.
