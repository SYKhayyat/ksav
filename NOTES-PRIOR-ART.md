# Prior art for the note system: what exists, what is usable, what is not

Written 2026-08-21, alongside `NOTES-SPILL-FINDINGS.md`. Six sources, surveyed
because the page-foot apparatus cannot spill and it was worth knowing whether
anyone had already solved it.

**Nobody has.** But two of these hand us machinery we were about to build, one is
the same product as Ksav built by someone else, and one exposed a real bug.

Everything measured here was measured against a moving tree — the prelude had 782
uncommitted insertions while I worked. Qualitative results held; point values
drifted. Re-run before quoting.

---

## The finding that gates half of this: Ksav cannot load Typst packages

```
#import "@preview/meander:0.4.4"
→ error: file not found (searched at typst.toml)
```

There is **no package resolution anywhere in the repository** — no `PackageSpec`,
no `@preview` handling, in Rust or in TypeScript. `typst-as-lib` is the
integration crate and packages are not wired to it.

So the entire Typst package ecosystem is currently unreachable. Two of the
sources below are packages that would help. Neither can be imported today.

Three ways out, in ascending order of commitment:

- **Vendor the source.** Ksav already embeds its prelude as a file, so a package's
  `.typ` sources can ride along the same way. Works today, no engine change,
  costs a fork that will drift.
- **Wire offline package resolution** — a bundled directory of vendored packages
  the `World` impl resolves against. Keeps upstream identity, no network.
- **Wire real resolution with a network fetch.** Biggest change, and it puts a
  download in the compile path of an offline-first writing app. Probably wrong.

This is a decision for Shaul, not a bug to fix. It is also the highest-leverage
item in this document: it is the difference between "we write our own splitter"
and "we import one that already works."

---

## 1 · meander — the splitting primitive, already built

<https://typst.app/universe/package/meander> · source
<https://github.com/Vanille-N/meander.typ> · MIT · 0.4.4, June 2026 · ~3,000
lines of Typst

A page layout engine with image wrap-around and **text threading**. Takes
obstacles (`placed`), containers (`container`), and flowing content, and threads
the content through the containers, wrapping around the obstacles.

**Why it matters.** its `bisect.typ` (in the package, not in this repository) is exactly the primitive
`NOTES-SPILL-FINDINGS.md` Route C needs — described in its own header as
"iteratively add content until it no longer fits inside the box." It fits
content, recursively splits inner content, and falls back to `split-word` with
hyphenation when a single word overruns. That is `fitPrefix(content, width,
height) → (head, tail)`, mature and tested, which is the same function the berech
needs (see §5).

**It also refutes a claim we were about to accept.** `sefer-engine`'s survey (§4)
scores Typst ❌ on L-shape because regions must be rectangular and share a width.
That is true of Typst's *native* region model. meander computes around it:
`container(width: 60%)` followed by `container()` threads text between containers
of **different widths**. So the ❌ is about the primitive, not about the
achievable result.

**Two caveats, one serious.**

- It operates on the **main flow**, not the page footer. It does not solve note
  spill directly.
- **There are zero occurrences of `rtl`, `ltr`, or `dir` in its entire source.**
  For a layout engine that is not "fine by inheritance" — container `align`
  handling is exactly where LTR assumptions hide. Anyone adopting this must test
  Hebrew first, and that test is the gate, not a formality.

---

## 2 · marginalia — the side-note policy we are missing

<https://typst.app/universe/package/marginalia> · 0.3.1

Configurable margin notes with smart positioning.

**Why it matters.** It solves `dense.ksav` precisely. Ksav's side notes are
`place`d absolutely and only ever shift **down**, which is how they walked off
the sheet at y=827.27. marginalia has collision avoidance with a configurable
`clearance` and a **per-note policy**: `shift: false` / `auto` / `true` /
`"avoid"` / `"ignore"`. It also has inner/outer placement with book-mode margin
swapping on even and odd pages, labelled and referenceable notes (`#note[]<xyz>`
then `@xyz`), and `counter: none` for markerless notes.

`a1b97c6` says the clamp-and-shift walk was built here already. **Worth diffing
against marginalia's policy set anyway**, because ours is unconditional and
theirs is a choice — and this repository's standing preference is that a
judgement-call constant becomes a setting with the old value as its default.

**It also confirms our wall, independently.** From its own documentation:
*"Wideblocks do not handle pagebreaks well... This is a limitation of Typst which
does not (yet) provide a robust way of detecting and reacting to page breaks."*
That is the third independent source saying what `NOTES-SPILL-FINDINGS.md` Part 4
concluded.

---

## 3 · Typst forum: "How to create Running footnotes"

<https://forum.typst.app/t/how-to-create-running-footnotes/7352>

Someone wanting footnotes run together on one line — `¹ note | ² note | ³ note` —
rather than one per line. Two working answers.

**It confirms our `[X]` rather than overturning it.** `notes-corpus`'s
`runin.ksav` and `runin2.ksav` record that run-in is impossible with **native
footnote rendering**. Both forum answers agree, and both work around it the same
way Ksav already does: collapse the native entry and draw the apparatus yourself
in the page footer. Our architecture is the community's answer. That is
reassuring and unlocks nothing.

**One technique worth naming.** To collapse the native area to nothing:

```typst
#show footnote.entry: none
#set footnote.entry(separator: none, clearance: 0pt, gap: 0pt, indent: 0pt)
```

This is the switch between the two regimes in `NOTES-SPILL-FINDINGS.md`: collapse
it and you render everything yourself with no splitting available; leave it
populated and Typst renders and **splits** for you. Anyone working on Routes A or
D should know it exists, because it is the thing you must *not* do if you want
Typst's splitting.

**One trap we already solved.** The second answer collects entries during layout:

```typst
#show footnote.entry: it => { collected-footnotes.update(e => e + (it,)) }
#set page(footer: context display-footnotes())   // …which then clears the state
```

This is writing state during layout and clearing it from the footer. Ksav's
`_ksav_rank` query-based numbering exists specifically because a footer is laid
out many times per page and a counter does not converge. Do not adopt this; the
first answer's `query(footnote).filter(...)` is the shape we already use.

**One warning worth carrying.** From the thread: laying the footer out as a grid
*"could mess with readers. So the PDF probably is not fully accessible."* That is
the same class of cost as Route B's duplicated text layer.

---

## 4 · sefer-engine — the same problem, a different engine

<https://github.com/Abe1018776/sefer-engine>

A Hebrew sefer production engine on **SILE** and **WeasyPrint**, producing
tzuras hadaf pages with two commentary columns and the L-shape wrap.

**What it names for us.** Its `research-alternatives.md` surveys twelve engines,
and every one that can flow content between page zones has **frame chaining**:
SILE's `frametricks` `next=`, ReportLab's `Frame` plus `FrameBreak`, LaTeX
flowfram's flow frames. **Typst has no such primitive** — the survey cites
Typst's own creator: regions in a sequence must share a width, and regions can
only be rectangular. That is exactly why `_ap_slot` cannot spill. It is an engine
gap, not a Ksav bug.

**What is usable.** `PAGINATION_SPEC.md` states the overflow rule concretely:
split at the nearest paragraph break, else at a sentence boundary, carry the
remainder to the next page's column, and do not repeat the column header on the
continuation. That is Route C, specified well enough to implement.

**Where we are ahead.** They *estimate* — "~45–50 Hebrew characters per line,"
"lines ≈ height / 13.5." Talmudifier, the other prior art in their survey,
repeatedly generates test PDFs with line numbers to measure column heights, which
its own author calls "ponderous and very hacky." Ksav has `measure()` returning
real geometry at compile time. One pass, real numbers.

**Why we cannot adopt their architecture.** Each page is compiled as an
*independent* SILE document and merged with `pdfunite`, deliberately, to avoid
cross-page reflow. That is a batch pipeline: the paginator fixes every page
before typesetting, so an edit that pushes one line across a page boundary
invalidates all downstream pagination. Ksav is 234 pages cold in 979ms and **59ms
after a one-character edit**. Own-the-pagination in the compile-each-page-
separately sense is ruled out, and should be written down as ruled out rather
than re-proposed.

---

## 5 · RavText — the incumbent, and the bug it exposed

<https://yiddishe-kop.com/articles/ravtext-seforim-publishing>

An InDesign CEP extension (ExtendScript + Vue) that builds tzuras hadaf by
manipulating `TextFrame.paths` into non-rectangular polygons. $490 one-time,
requires InDesign CS6+, described as "the standard tool in the frum publishing
world." No layout mechanism to port — it is an interactive DTP plugin, not a
compiler.

### 5a · A real bug: Hebrew numbers have no gershayim

The לשון נקיה rule it advertises, Typst already handles. Verified:

```
numbering("א", 15) → טו    16 → טז    115 → קטו   215 → רטו   315 → שטו
```

Never י״ה or י״ו, and it holds above 100. Ksav inherits this because `_ap_mark`
routes through Typst's `numbering`.

**But gershayim is missing, and it belongs inside the number:**

```
numbering("א׳", 15) → טו׳      ← geresh appended as a suffix
                      ט״ו       ← what a printed sefer has
```

Gershayim sits before the last letter, which a Typst numbering pattern cannot
express. Single letters come out right (`א׳`) purely by accident, so this stays
invisible until note 11. `grep` finds no helper in `ksav.typ` that builds a
Hebrew number — the gershayim code there is index normalisation (`_ix_gershayim`,
`:7596`) and siman headings (`:7340`). So note markers, region entry numbers and
Hebrew page numbers all print `טו` where a sefer prints `ט״ו`.

Wants to be a format choice — bare / geresh / gershayim — with today's behaviour
as the default so nothing already written repaginates. Small, self-contained, and
it does not touch the apparatus.

### 5b · The berech is computable, and it works

RavText's core trick is analysing content length and reshaping the frame. We can
compute the same result. Binary-search `measure()` for the largest prefix that
fits the column, render it beside the neighbouring block, render the remainder
full-width below:

```typst
#context {
  let w = 150pt
  let h = 80pt
  let fits(n) = measure(block(width: w, ws.slice(0, n).join(" "))).height <= h
  let lo = 0
  let hi = ws.len()
  while lo < hi {
    let mid = calc.ceil((lo + hi) / 2)
    if fits(mid) { lo = mid } else { hi = mid - 1 }
  }
  grid(columns: (w, 1fr), column-gutter: 8pt,
       block(width: w, ws.slice(0, lo).join(" ")), gemara)
  block(width: 100%, ws.slice(lo).join(" "))
}
```

Measured: knee at word 20, words 001–020 in the column, 021 onward continuing in
the full-width band. **140/140 words, 0 duplicated, 0 lost.** Compile 0.699s
against 0.665s for a hardcoded split — about **34ms**, including process startup,
for roughly seven `measure` calls.

`vilna.ksav` already stacks three columns → two → full width, so multiple knees
generalise by stacking rows, each with its own computed split.

### 5c · The unification worth acting on

The berech and note-splitting are **the same function**:

> `fitPrefix(content, width, height) → (head, tail)`

Route C is that function applied across a page break. The berech is that function
applied across a knee. meander's `bisect.typ` is that function, already written.
Build or vendor it once and both fall out.

This materially changes the cost of Route C, which `NOTES-SPILL-FINDINGS.md`
lists as the most expensive of the four. It is not, if the berech is wanted
anyway — and it is the strongest argument found so far for choosing it.

Same limitation in both cases, and it must be stated when it ships: **word
granularity**. A note or column containing a table, a figure or a nested
structure has no boundary to cut at and needs a different route.

### 5d · Two smaller steals

- **Sizing in lines, not points.** "Add or remove lines from any column with a
  single click." The typesetter adjusts in **lines**. We offer `#אזור(גובה: 40pt)`
  and a percent-of-sheet reserve, neither of which is a unit anyone doing this
  work thinks in. `גובה: 3 שורות` is the same setting in the language of the
  craft, over arithmetic the engine already does.
- **ברך / ברכיים — "knees."** The authentic term for the step where a frame
  indents around its neighbour. `NOTES-PLAN` says "L-shape" and "Vilna wrap,"
  both borrowed from English tooling. Given `פריסה` is already contested in the
  naming record, the real word is available.

**Where we are already ahead.** RavText's קישורים panel registers each story and
scans for references pointing at markers that do not exist. `problems()` in
`app/src/deferred.ts:357` already reports `dangling`, `orphan` and `duplicate` in
both directions, with jump-to-the-other-half on one key — and it runs live in the
editor rather than as a pre-print scan.

---

## 6 · Typsastra — Ksav's twin

<https://github.com/Sovichea/typsastra> · MIT · v0.7.0

Not a layout tool. **The same product as Ksav, built by someone else.** A Tauri
desktop app with Typst at the centre, live PDF preview, complex-script-first
editing, language providers with per-language editing policy, spellcheck, word
completion, diacritic-aware search, multi-file projects, shipping `.msi`,
`.AppImage`, `.deb` and an experimental macOS build. Khmer instead of Hebrew,
research papers instead of seforim.

Not a competitor for seforim. It is the same engineering problem solved
independently, which makes it the most useful thing in this document for the
editor half of Ksav rather than the engine half.

Worth reading in that tree:

- `benchmarks/fixtures/` — `01-page`, `20-pages-interaction`, `30-pages`,
  `100-pages`, with a `results/` directory. Directly comparable to
  `examples/bench-incr.rs`, and **they benchmark interaction, which we do not.**
- `third_party/khmer_segmenter` and `toolchains/enhanced-unicode` — they built
  their own segmentation and Unicode toolchain rather than living with defaults.
  Ksav's Hebrew equivalents are worth comparing.
- `src-tauri/resources/examples/02-multilingual-writing/05-script-and-direction-samples/02-bidirectional-rendering/`
  — a worked bidi example to read against ours.
- They patch `pdfjs-dist`, not Typst. And they appear to have **no package
  support either**, so that gap is not unique to us.

---

## What none of this solves

The page-foot apparatus still cannot spill. meander is main-flow, marginalia is
margins, the forum thread is styling, sefer-engine is a different engine,
RavText is InDesign, Typsastra is an editor. `NOTES-SPILL-FINDINGS.md` Part 6
remains the live decision, unchanged except that **Route C got cheaper** — because
its hard part already exists in `bisect.typ`, and because building it buys the
berech at the same time.

## What this needs from Shaul

1. **Package support: vendor, offline resolution, or nothing.** Gates meander and
   marginalia both.
2. **Which of the four spill routes.** Route C's cost estimate has changed; the
   trade table in `NOTES-SPILL-FINDINGS.md` Part 6 should be re-read with §5c in
   mind.
3. **Gershayim** — small enough to just do, but it is a visible change to how
   every Hebrew number prints, so it wants his word and a default that preserves
   today's output.
