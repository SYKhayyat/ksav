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
- [ ] #3 i18n completeness + e2e switch test. (High)
- [ ] #70 verify a breakable Typst box: does it draw an **empty border** at the foot of
  the page it breaks from, and is a fifth `חריגה:` answer wanted at all? Third-party
  research, **unmeasured here** — one probe, then a decision. (Medium, from #5)
- [ ] #15 two-document glue second flow (probe exists). (High)
- [ ] #67 Typst package resolution missing — @preview/@local imports fail. (High)

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
