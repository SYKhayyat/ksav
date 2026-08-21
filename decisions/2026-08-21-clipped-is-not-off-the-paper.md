# 2026-08-21 · Clipped is not off the paper, and green is not CI

Two corrections to things written earlier the same day, both of the same kind: a
claim made from an instrument that could not see the property under test.

## One · the notes are not printed off the paper, they are silently truncated

[A region that asks for room nobody made](2026-08-21-a-region-that-asks-for-room-nobody-made.md)
says a page-foot region declaring more height than the page has *"prints off the
paper — y=853.90 on an 841.89pt sheet"*. That reading came from `probe`.

`probe` reads **frame items**. `clip: true` is a paint operation, so a clipped
note reports its full extent and is indistinguishable from one drawn past the
page edge. `svgdump` on the same document shows the clip rectangle —
`453.54 × 49.61` — so the overhang is **masked**.

Which is worse, not better. A note past the paper edge is visible as a fault the
moment anyone looks at the page. A clipped one reads as a short note: the writer
sees an apparatus, the reader sees an apparatus, and the missing half of it
announces nothing. `clip: true` is what makes the failure silent.

The comment in `_ap_assign` justifying force-placing an over-tall entry said in
so many words that *"placed and clipped a reader can see"*. That was the
reasoning for the behaviour and it was false. It is corrected in place.

This is the **third** instance of one disease in this area, and `notes-corpus`'s
README already documented the other two — `probe` cannot see `fill`, and a
right-aligned `y=` field breaks `awk` field-splitting for y ≥ 1000. A parallel
session found a fourth the same afternoon: `move()` shifts paint and not layout,
so a collision checker written against `probe` reports an overlap on every
continuation page and is wrong every time.

The reflex worth keeping: **before believing any measurement here, ask which
instrument would notice if the answer were wrong.** Anything involving `clip`,
`move`, `place`, `hide` or `fill` needs `svgdump`. Credit for the correction, and
for the four routes out of the underlying problem, goes to
`NOTES-SPILL-FINDINGS.md`.

## Two · the suite was green and CI was red, for eight commits

Three commits went out today on a green `cargo test`. `cargo test` is one of the
gate's **nine** checks, and the other eight caught things it structurally cannot:

- `cargo fmt` on the new test files
- clippy: `.err().expect()` on a `Result` whose `Ok` type is not `Debug`
- `src/engine.gen.ts` stale, because document parameters were added and the
  generated file was never re-emitted

And then three fences caught one real widening, from three directions.
`_ap_own_keys` grew `ציטוט` and `צף`, and: `enginefacts.test.mjs` said the panel
must offer exactly what the engine accepts; `styles.test.mjs` said every knob the
panel writes needs the engine's own English name; and then said the panel needs
one too. All three were right. The panel offers both arguments now.

The rule that would have prevented all of it is already written down and was not
followed: **`cargo test` is not the gate.** `node tools/gate.mjs`, every time,
before pushing.

## …and it was already red

CI has been failing since `a1b97c6`, the first commit of the previous night, on
five assembled-app checks that all name the notes chooser. The chooser panel was
**rebuilt** that night — from two questions (*where*, then a menu of six
arrangements) to one question with six destinations, because a menu of
arrangements is the cell-shaped thing the note model was rebuilt to remove.

`app/test/notepaths.test.mjs` was deleted with the old model.
`.github/scripts/acceptance.mjs` was not. Its step 16 still drives
`[data-nq="where"]`, `[data-how]` and a thirty-cell grid against a panel that
emits `[data-nq="destinations"]`, `[data-dest]` and no grid at all. Rewritten
here for the model that exists.

The general lesson is the one this repository keeps re-learning under a different
name: **a surface was changed and one of its two test suites was updated.** The
offline suite was, the assembled-app suite was not, and nothing tied them
together — so the feature was correct, the unit tests were green, and the only
check that drives the real panel had been failing for eight commits without
anyone reading it.
