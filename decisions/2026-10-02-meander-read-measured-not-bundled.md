# #73 — `meander`, read and measured: MIT, and it does not do the one thing it was wanted for

**Date:** 2026-10-02
**Issue:** #73 — *Decision: bundle real Typst libraries, starting with meander?*
**Verdict:** **Do not bundle it.** One of the two stated blockers is gone (the licence is MIT, not a question mark), and the capability the issue names as the reason — *addressed routing* — **is not in the package**. What it does do, Ksav already does and fences.

This is the "read it first" step #73 asked for, done. The resolver reads from a
directory, so nothing here is half-adopted: the package was fetched, unpacked and
read in a scratch directory, and **no vendored copy is being committed**. If a
later decision reverses this, the mechanism is unchanged and the shelf is still
empty.

---

## 1. The two objections, resolved

| objection | verdict |
|---|---|
| **Licence and provenance** | **Gone.** `typst.toml` says `license = "MIT"`; the bundled `LICENSE` is the MIT text, © 2025 Neven Villani. Compatible, and it would have been a one-line `THIRD-PARTY-NOTICES.md` entry. |
| **Repository size and build weight** | **Moot.** The tarball is 26 KB and the unpacked `src/` is 3,013 lines. "Permanently, for a package most documents never import" was the objection, and at this size it would not have been the reason. |

Both were real reasons to be careful. Neither is why the answer is no.

---

## 2. The reading

`meander` 0.4.4, from the Typst package registry
(`packages.typst.org/preview/meander-0.4.4.tar.gz`), read in full for the parts that
answer the question.

Its own description is accurate: *"Page layout engine with image wrap-around and
text threading."* That is exactly what it is. The reading is in three parts.

### `reflow(seq)` threads one ordered queue around obstacles

`src/layouts.typ` calls `tiling.separate(seq)` on its argument and threads a single
`flow` value through the boxes it produces, page by page, with `colbreak()` between
pages. Obstacles (`placed`) push the text aside; containers (`container`) receive
it. The natural shape is: *"here is some text and here is some geometry; keep them
out of each other's way."*

### `content(data)` items are consumed strictly in order

`src/threading.typ`, `smart-fill-boxes`, is the heart of it:

```typst
let body-queue = body.rev()
…
if body.data == none {
  if body-queue.len() == 0 { break }
  body = body-queue.pop()
}
```

Items are popped off **one** queue and poured into whatever container is currently
being filled. The steering available is `colbreak()` (stop filling this one, move
on) and `colfill()` (fill the rest of this one with whitespace, then move on) —
which is a way to say *"send the rest of the text to the next region."* Neither
names a particular piece of content.

### There is a query mechanism, and it is not addressing

`src/query.typ` provides `position(tag)`, `width(tag)`, `height(tag)` — and
`elems.typ` gives every element a `tags` field. This is the thing most likely to be
mistaken for addressing, so it is worth being precise: **these address a
*placement*, not a *destination*.** `position(<lemma-3>)` tells you where the
element tagged `lemma-3` already is, so you can position an *obstacle* relative to
it. On the tiling side a tag's job is to make a container invisible to obstacles
sharing that tag (`src/tiling.typ:54`). Nowhere is there a way to say "this lemma
goes in that channel".

**So: addressed routing is absent.** The issue's own framing after its correction —
*"put anything — a lemma, a figure, a summary, a translation, a proof — into a
named stream beside the source, and have the page reflow around it"* — is not
something `meander` provides.

---

## 3. What it does do, measured against Ksav

The honest part of the case survives, and it is worth being fair about it.
`meander` is genuinely good at two things, and **both are things Ksav already has,
measured, and fenced**:

| `meander` | Ksav |
|---|---|
| a note that flows and pushes text aside, across pages | `#הערת_צד`, `#הערת_גיליון` — measured at `y=143.6`, 12.0pt inline beside the source, vs `#הערה` at `y=785.2` in the foot-of-page box (`tests/placements.rs`, `side_column_notes`) |
| named regions with text filling each, in order | `#הגדרות_זרמים` + `#הערה_זרם("תוכן")` — **over seven pages each stream keeps its column on every page with its content flowing through it** (#77) |
| several independent registers, per-series arrangement | `מספור` per-stream numbering, `כותרות` per-stream headings, three endnote streams side by side (`tests/…::footnote_streams`, `endnote_streams_side_by_side`) |
| text flowing across column and page boundaries | `cols(2)` → 35 distinct x-origins; 80 lines through 2 columns, both filled |

And the other two named beneficiaries are settled without it:

- **note spill** is *"a note that must fit"* versus *"a note that flows"*, and a
  spilling note is a block that breaks. **#70 measured that blocks break cleanly** —
  13.9 + 169.2 + 22.9 = 206.0 = the fill height on all four pages, no empty border.
  The measurement that was the last precondition on this issue **removed** this
  reason.
- **addressed routing** — the one capability that would have justified a
  dependency — is what `meander` does not do, and it is what Ksav's own `זרמים`
  already does.

---

## 4. Verdict

**Do not bundle.**

1. **It does not provide the capability the issue names.** After its own correction,
   the case rests on addressed routing; `meander` threads one ordered queue around
   obstacles. Adopting it would buy wrap-around we have and pay for it twice.
2. **The overlap is total, not partial.** Every capability it offers, Ksav has
   measured working — and Ksav's own reaches the page *through* the same Typst
   primitives `meander` builds on, so there is no place a third party could be
   inserted.
3. **The strongest objection never got an answer, and never needed one.** *"A layout
   engine's page-breaking is exactly the thing a typesetting app most needs to
   control, and delegating it to a package is how a bug becomes unfixable-in-place."*
   Adopting it would put a third party in page-breaking for capabilities we already
   have. That is a worse trade at 26 KB than it looks.
4. **The cost of being wrong is asymmetric.** False negative — we declined and later
   want it — is one `git revert` and one directory: the resolver reads from a
   directory and removing it removes the capability with no code change. False
   positive — we adopted and it is wrong — is a dependency in the page-breaking path
   of a typesetting application, forever, plus a namespace any document can import.

This is the outcome #73 predicted for #80: *"a sprint that cannot end in 'no' is not
a sprint."* It ends in "no", on the measurement rather than on taste.

---

## 5. What ships instead

The one durable thing here is a fence, not a package.

**`tests/packages.rs::the_prelude_depends_on_no_third_party_package`** — new, and it
holds the property #73 asked for whatever gets decided: *"nothing in the prelude may
depend on it, so a Ksav without it is still a complete Ksav."* Nothing was checking
that. It is asserted against the **assembled document** (`assemble_source`, which
inlines the whole prelude and adds the import line and the show rule), so it fails
on the import however it is written, and it covers `@preview` **and** `@local` — the
latter because `#import "@local/…"` in the prelude would make every sefer depend on
a directory Ksav does not ship, which is the same failure by a different spelling.

It is the kind of property that holds on the day it is written and is gone the first
time somebody adds one convenient import to solve something. By then it is not a
missing package; it is **every document failing to compile**.

The shelf stays empty on purpose. #67's resolver is real, fenced, and now exercised
against both namespaces by `tests/packages.rs` — so the *next* package decision
starts from a working mechanism and a measured candidate rather than from a
hypothetical.

---

## 6. If this is ever revisited

The cheap way in, if a future need is genuinely a **Typst** page-layout package:
vendor under `packages/preview/<name>/<version>/`, keep upstream `typst.toml`
intact so identity survives, add the licence to `THIRD-PARTY-NOTICES.md`, fence it
(the bundled import compiles and runs; an unbundled version is named rather than
reported as a missing image), and keep it optional. **And measure first**, in the
style of #70 — which is exactly what this document did, and which is why the answer
cost 26 KB to obtain and nothing to undo.

---

## Related

- **#70** — the measurement that removed the note-spill reason. The pattern this
  follows.
- **#67** — the bundled, never-fetched resolver this issue would have used, and
  which is now exercised against two namespaces.
- **#80** — the same discipline applied to a LaTeX package, where adoption is not
  cheap and six of seven claims turned out to be false.
- **`pagerange.ts`, `tests/packages.rs`** — the two parsers that must not drift, and
  the package tests that hold them.