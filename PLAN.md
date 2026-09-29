# PLAN — ksav (work top to bottom, one issue per worker session)

Worker loop: pick the top unchecked item, fix ONLY that issue + its resolving test, commit, check it off, stop. Do not batch. Do not reorder.
Already done (closed): #2? no — #2 open. Done: #4, #10, #13, #16, #17, #18, #24, #25, #26, #27, #28, #29, #30, #40, #41, #49.

## SKIP — do not work (see AI_ISSUE_ROUTING.md)
- #36 watch.forget — FALSE POSITIVE (callers at main.ts:740,827).
- #29 registry "docs in the wire" — FALSE POSITIVE, measured: the essays are
  `///`/`//` comments (15,181 of 40,053 bytes, none a value); the literals are 22
  chars at the median and `commands_json` is 224 bytes a row. The descriptions
  stay — the palette displays and searches them. What was missing was a fence, and
  `engine/tests/registry_wire.rs` (column set, length, size, the four deprecation
  notices) is it. See decisions/2026-09-25-the-registry-wire-is-a-palette.md.
- #12 does not exist.

## Phase 1 — Foundations first (unblock everything below)
- [x] #25 heal seam ×3 → centralize into one RenderPlan; runCompile/compileUnfocused/bodyOnScreen derive from it. (High)
- [x] #27 all three English tables are facts values now; each with a cross-check that exits 1. (High)
- [x] #28 the templates' collective guarantee is a predicate; it found three unreachable capabilities. (Medium)
- [x] #29 FALSE POSITIVE, measured; the fence it was missing is `engine/tests/registry_wire.rs`. (Medium)

## Phase 2 — Security Criticals
- [x] #50 missing-chapter marker injects name into Typst unescaped. (High→Critical)
- [x] #51 opening .ksav executes customCommands with no warning. (High)
- [x] #53 engine SVG innerHTML + attribute passthrough. (High)
- [x] #52 asset names unvalidated; ksav.typ shadows prelude. (High) — the shadowing was
  already closed by resolver order; what was real is a **panic** in `typst-as-lib`'s
  path handling, i.e. one unauthenticated request could take a worker thread down.

**Phase 2 complete.** Four Highs, all fixed at the root with a fence that was shown
to fire. Two of them (#52, and #29 before it) turned out to be mis-identified: what
was actually there was smaller or larger than the report said, and the fix list was
still right.

## Phase 3 — Correctness Highs
- [x] #2 note-layout hazards (CHANNEL/REGION split, unclamped heights, paren scan).
  (Critical) — six of the audit's seven no longer reproduce; the deliverable is
  `engine/tests/note_layout.rs`, and what was left was a note sent to a
  **destination the document never declared**, landing silently in the page foot.
- [x] #6 audit fire-and-forget (127 void, no fence). (High) — measured **51 of 93
  sites** had a callee with no error handling at all; 48 converted to one wrapper,
  3 of them found to be synchronous and put back. The fence is the inventory.
- [x] #2′ non-linear note fixtures — both branches reached and fenced: B3's sort
  needs a reversed anchor order, B5's carry needs a bounded sheet and a page
  break. **9 of 11 tests now fail with their fix removed.** (from #2)
- [x] #5 parser/config/installer hardening. (High) — **16 of 50 setters** accepted a
  typo, and the check was *inside* the `update` closure, so it fired on the next
  note rather than on the typo. The other four sub-items have no site: `purge_ratio`
  has no owner, the installer does not exist here, git probing is already bounded
  and locale-free, grammar spans already carry line+column.
- [x] #3 i18n completeness + e2e switch test. (High) — 11 keys had Hebrew and no
  English, and `t` falls back to the **key name**, so `refreshTitle` was a panel
  heading in English. The switch mechanism already existed and needed only a fence.
- [x] #71 a language switch left **114 Hebrew strings** standing; now **9** — two
  catalogue keys (`untitled`, a document's own name, which must never be tagged, and
  `registriesFailed`, an error path) and seven composed, all of them Hebrew that
  belongs there. What is left to argue about rather than fix: `troubleSaid`'s
  deliberate `"he · en"` status line, which an English interface reads Hebrew-first.
  Found by a real browser, and the browser test now fences the ceiling at 9. (from #3)
- [x] #70 a breakable Typst box, measured. (Medium, from #5) — **the forwarded claim
  does not reproduce.** A breakable block re-fits its background to *each page's own*
  text (13.9 + 169.2 + 22.9 = 206.0 = the fill height, on all four pages), so there is
  no empty border. This also removed the strongest reason to vendor `meander` in #73.
  **The instrument could not answer the question at all until `Fill`/`Stroke` grew
  `width`/`height`**: a fill that spans a break *starts above* the last line, so the
  origin looks correct and is silent about the empty band that was the subject. An
  origin is not a shape. (from #70)
- [x] #74 an unbreakable block taller than the text area **silently loses content off
  the sheet**. (from #70) — Reported now, and the content still goes off the sheet,
  because the fix is to **say so**, not to silently move it. The threshold is the
  **page**, not the text area, and that is what makes it safe: a running head and a
  folio sit in the margins quite legally, so a text-area threshold would warn on
  every document with a header — and **a folio cannot be below the bottom of the
  page**. The audit also needs the writer to have asked for it, so it scans the
  body for `breakable: false` and an ordinary document pays one pass and no more.
  Measured: 285pt of a block reported as not printed at all, naming the line, while
  the same content splittable and an unsplittable block that *fits* both stay
  silent. **Latent when filed** — nothing in Ksav set `breakable: false`; #65 and #43
  are the only things that would. (from #70)
- [x] #76 opposing margins can consume the whole page — **a gap in my own #15 work**,
  and a second one I did not know was there. (from #70) — Two defects, and my first
  report on this was wrong in a way worth recording: **I set `cfg.margin_cm` directly
  in Rust, so `from_json` never ran and I measured a path the application does not
  have.** Through the real path `margin_cm: 11` *was* clamped and reported. The pair
  check was still needed (`inner 20 + outer 20` on A4 → a text region 19cm wider than
  the sheet, silently), and #15 had in fact left the **old A5 constant standing on the
  uniform path** — 7cm is the A5 instance of `2m ≤ short_side − 1`, so A4 was refusing
  a 9cm margin that it can hold. Both fixed: a uniform margin is bounded by the sheet,
  and a pair is checked as a pair, with **a value the writer did not set never the one
  moved** — reducing a default is the app un-choosing on their behalf, which is the
  sentence #15 exists to fix. My first rule ("the second edge gives way") was wrong and
  a pre-existing fence caught it the same day: `inner 13 + outer 0` clamped the edge
  that was already 0. **The larger margin gives way.**
- [x] #75 a bare hex colour is refused as *"something's off near a #"*. (from #70) —
  Fixed, and **the `#` is the one character the writer got right**: Typst 0.15 dropped
  the bare literal, so `#eef3ff` fails with *"the character `#` is not valid in code"* and
  the message was answering with advice about a missing space. The **line** is now
  consulted to tell a removed syntax from a genuine stray `#`, and it had to be the
  line: the raw error is identical for both. A hex run is only a colour if it is
  **delimited** — `#1234zz` is not, and *"write `rgb("#1234")`"* is advice that cannot
  work. It also produced **two** errors, the second being the parser blaming the comma
  around the hole it left, so one mistake is now one message. (from #70)
- [ ] #72 a sefer cannot read the disk at all, and that was never a decision. `#import
  "helper.typ"`, `read()`, absolute paths — all refused; only bundled packages resolve.
  The sandbox is *right* (`packages_root()` is a root a document cannot escape), but it
  means a sefer is one file forever. Proposal: `packages_root()` a second time, per
  sefer. **Cheap half first:** `@local` alone in the `app_data_dir()` that already holds
  the dictionary. Decision, not a task — autosave, `git.rs` and the file tree all move. (from #15)
- [x] #77 parallel streams. (from #15) — **Decided (build it), and found mostly
  already built.** `הגדרות_זרמים(פריסה: "צד")` is side-by-side, a column per stream, with
  a per-stream `טורים` count, and measured over seven pages each stream **keeps its column
  on every page** with its content flowing through it. #77's requirement is therefore
  already met for notes. Split into the two gaps that remain: **#78** arbitrary content in
  a stream (it is a *note* command, and the question said "not just notes") and **#79**
  whether a stream can occupy the **page body** rather than the read-only footer.
  `examples/streams.rs` proves the architecture — each stream its own band-sized document,
  pages zipped by index — and **duplicates what `פריסה: "צד"` does**, so it is evidence
  and must not become a second mechanism. (from #15)
- [ ] #73 bundle real Typst libraries, starting with `meander`. #67 made it possible for
  the first time; #70 has now **removed the main reason** (they thread cleanly). What
  remains is the uncomfortable one: page-breaking is what a typesetting app most needs
  to control. (from #15)
- [x] #15 two-document glue. (High) — **the seam is fixed; the premise is not.** The
  7 cm margin clamp was *silently* refusing a 21.7 cm seam, which is the bug the app
  already names one layer up; a margin is now bounded by the sheet and a refusal is
  reported. And the box does not cap: 30 entries draw in 4 pages where the proposal
  measured 5, so "why it buys what a box cannot" lists properties the box already
  has. Reopened on a worked sheet-count, not a preference. (from #15)
- [x] #27 all three English tables are facts values now; each with a cross-check that exits 1. (High)
- [x] #28 the templates' collective guarantee is a predicate; it found three unreachable capabilities. (Medium)
- [x] #29 FALSE POSITIVE, measured; the fence it was missing is `engine/tests/registry_wire.rs`. (Medium)

## Phase 2 — Security Criticals
- [x] #50 missing-chapter marker injects name into Typst unescaped. (High→Critical)
- [x] #51 opening .ksav executes customCommands with no warning. (High)
- [x] #53 engine SVG innerHTML + attribute passthrough. (High)
- [x] #52 asset names unvalidated; ksav.typ shadows prelude. (High) — the shadowing was
  already closed by resolver order; what was real is a **panic** in `typst-as-lib`'s
  path handling, i.e. one unauthenticated request could take a worker thread down.

**Phase 2 complete.** Four Highs, all fixed at the root with a fence that was shown
to fire. Two of them (#52, and #29 before it) turned out to be mis-identified: what
was actually there was smaller or larger than the report said, and the fix list was
still right.

## Phase 3 — Correctness Highs
- [x] #2 note-layout hazards (CHANNEL/REGION split, unclamped heights, paren scan).
  (Critical) — six of the audit's seven no longer reproduce; the deliverable is
  `engine/tests/note_layout.rs`, and what was left was a note sent to a
  **destination the document never declared**, landing silently in the page foot.
- [x] #6 audit fire-and-forget (127 void, no fence). (High) — measured **51 of 93
  sites** had a callee with no error handling at all; 48 converted to one wrapper,
  3 of them found to be synchronous and put back. The fence is the inventory.
- [x] #2′ non-linear note fixtures — both branches reached and fenced: B3's sort
  needs a reversed anchor order, B5's carry needs a bounded sheet and a page
  break. **9 of 11 tests now fail with their fix removed.** (from #2)
- [x] #5 parser/config/installer hardening. (High) — **16 of 50 setters** accepted a
  typo, and the check was *inside* the `update` closure, so it fired on the next
  note rather than on the typo. The other four sub-items have no site: `purge_ratio`
  has no owner, the installer does not exist here, git probing is already bounded
  and locale-free, grammar spans already carry line+column.
- [x] #3 i18n completeness + e2e switch test. (High) — 11 keys had Hebrew and no
  English, and `t` falls back to the **key name**, so `refreshTitle` was a panel
  heading in English. The switch mechanism already existed and needed only a fence.
- [x] #71 a language switch left **114 Hebrew strings** standing; now **9** — two
  catalogue keys (`untitled`, a document's own name, which must never be tagged, and
  `registriesFailed`, an error path) and seven composed, all of them Hebrew that
  belongs there. What is left to argue about rather than fix: `troubleSaid`'s
  deliberate `"he · en"` status line, which an English interface reads Hebrew-first.
  Found by a real browser, and the browser test now fences the ceiling at 9. (from #3)
- [ ] #70 verify a breakable Typst box: does it draw an **empty border** at the foot of
  the page it breaks from, and is a fifth `חריגה:` answer wanted at all? Third-party
  research, **unmeasured here** — one probe, then a decision. (Medium, from #5)
- [x] #15 two-document glue. (High) — **the seam is fixed; the premise is not.** The
  7 cm margin clamp was *silently* refusing a 21.7 cm seam, which is the bug the app
  already names one layer up; a margin is now bounded by the sheet and a refusal is
  reported. And the box does not cap: 30 entries draw in 4 pages where the proposal
  measured 5, so *"why it buys what a box cannot"* lists properties the box already
  has. Reopened on a worked sheet-count, not a preference. (from #15)
- [x] #67 Typst package resolution. (High) — **decided in August, read today.** Offline
  bundled resolution, not vendored source and not network: a compile that reaches the
  network can hang, and an editor 59ms after a keystroke cannot have that in its
  path. The remaining gap was the *sentence* — a missing `@preview/…` import said
  *"a file (e.g. an image) wasn't found"*, the very wart the issue opened with — and
  it now names the spec as written and lists what **is** bundled. (from #67)

## Phase 4 — Mediums (engine quality)
- [ ] #63 include diamond, #62 tokenizer quadratic, #60 undecodable assets, #59 pdf_pages 0→all, #58 reserve scan hits prose, #57 quote-blind named_arg, #56 32-bit asset cache, #55 single-slot reserve cache, #54 wasm timeout kills unrelated.
- [ ] #20 deferred/numbering scans to Rust, #19 spans.ts Rust port, #21 styles walkers onto walkArgs.
- [ ] #7 keyed updates (5× replaceChildren).

## Phase 5 — Features / proposals (Info/Low, after engine is safe)
- [ ] #66 smart navigation — type any sefer+location (Hebrew/English/phonetic), insert the text; parenthesized list → combined source-sheet block. Works for every sefer, shared parser with Girsa.
- [ ] Writer tools: #48 shiurim, #47 zmanim/dates, #46 rashei-teivos/dict, #45 gematria, #44 nikud/shemos toggles.
- [ ] #64 linked commentary ordering — sort peirush into reference order via linkers (auto/explicit, scoped, stable sort; generalises sortBodies).
- [ ] #68 transfer source headings into sorted commentary (companion to #64) — configurable levels/scope/shift, copy+V1 with easy regenerate, live sync deferred.
- [ ] #69 templated headings and lists — per-level קידומת/סיומת *orthogonal* to מספור/התחלה/כיוון/צעדים (e.g. דף alone, ב alone, or דף ב together; up/down) via _hd_show + _hb_num; lists per-depth same shape.
- [ ] #43 top/bottom streams proposal, #65 commentary wrapped around central block (berech/Vilna knees via measured fitPrefix; in-flow wrap, not horizontal seam like #15/#43), #42 Rust-rewrite vision (decision only).
- [ ] Interop/docs: #39, #38, #37, #35, #34, #33, #32, #31.
- [ ] Frontend: #23 i18n hoist, #22 main.ts split, #11 Leo workflow, #9/#8 LibreOffice UX, #14 UAT.

## Routing rule for new issues
Any AI opening an issue here MUST insert it into the phase above it belongs in (foundations → security → correctness → quality → features), not append at the end. Security/foundational items go in Phase 1–2 even if filed later. See AI_ISSUE_ROUTING.md.
