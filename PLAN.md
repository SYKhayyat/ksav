# PLAN — ksav (work top to bottom, one issue per worker session)

Worker loop: pick the top unchecked item, fix ONLY that issue + its resolving test, commit, check it off, stop. Do not batch. Do not reorder.
Already done (closed): #2? no — #2 open. Done: #4, #10, #13, #16, #17, #18, #24, #26, #30, #40, #41, #49.

## SKIP — do not work (see AI_ISSUE_ROUTING.md)
- #36 watch.forget — FALSE POSITIVE (callers at main.ts:740,827).
- #12 does not exist.

## Phase 1 — Foundations first (unblock everything below)
- [ ] #25 heal seam ×3 → centralize into one RenderPlan; runCompile/compileUnfocused/bodyOnScreen derive from it. (High)
- [ ] #27 English vocab via regex → generate from facts, not regex over ksav.typ. (High)
- [ ] #29 commands registry prose-in-wire → descriptions out of the wire contract. (Medium)
- [ ] #28 template coverage gate → one test tying every template guarantee to a reachable command set. (Medium)

## Phase 2 — Security Criticals
- [ ] #50 missing-chapter marker injects name into Typst unescaped. (High→Critical)
- [ ] #51 opening .ksav executes customCommands with no warning. (High)
- [ ] #53 engine SVG innerHTML + attribute passthrough. (High)
- [ ] #52 asset names unvalidated; ksav.typ shadows prelude. (High)

## Phase 3 — Correctness Highs
- [ ] #2 note-layout hazards (CHANNEL/REGION split, unclamped heights, paren scan). (Critical)
- [ ] #6 audit fire-and-forget (127 void, no fence). (High)
- [ ] #5 parser/config/installer hardening. (High)
- [ ] #3 i18n completeness + e2e switch test. (High)
- [ ] #15 two-document glue second flow (probe exists). (High)

## Phase 4 — Mediums (engine quality)
- [ ] #63 include diamond, #62 tokenizer quadratic, #60 undecodable assets, #59 pdf_pages 0→all, #58 reserve scan hits prose, #57 quote-blind named_arg, #56 32-bit asset cache, #55 single-slot reserve cache, #54 wasm timeout kills unrelated.
- [ ] #20 deferred/numbering scans to Rust, #19 spans.ts Rust port, #21 styles walkers onto walkArgs.
- [ ] #7 keyed updates (5× replaceChildren).

## Phase 5 — Features / proposals (Info/Low, after engine is safe)
- [ ] #66 smart navigation — type any sefer+location (Hebrew/English/phonetic), insert the text; parenthesized list → combined source-sheet block. Works for every sefer, shared parser with Girsa.
- [ ] Writer tools: #48 shiurim, #47 zmanim/dates, #46 rashei-teivos/dict, #45 gematria, #44 nikud/shemos toggles.
- [ ] #64 linked commentary ordering — sort peirush into reference order via linkers (auto/explicit, scoped, stable sort; generalises sortBodies).
- [ ] #43 top/bottom streams proposal, #65 commentary wrapped around central block (berech/Vilna knees via measured fitPrefix; in-flow wrap, not horizontal seam like #15/#43), #42 Rust-rewrite vision (decision only).
- [ ] Interop/docs: #39, #38, #37, #35, #34, #33, #32, #31.
- [ ] Frontend: #23 i18n hoist, #22 main.ts split, #11 Leo workflow, #9/#8 LibreOffice UX, #14 UAT.

## Routing rule for new issues
Any AI opening an issue here MUST insert it into the phase above it belongs in (foundations → security → correctness → quality → features), not append at the end. Security/foundational items go in Phase 1–2 even if filed later. See AI_ISSUE_ROUTING.md.
