# Ksav — Lamdan audit, 2026-08-30

Scope: fresh design-critique sweep of the whole repository, region by region (engine, app/editor,
shell/wasm/tools/templates, test + audit apparatus, prose/licenses). Written as fix-and-refine:
nothing here is a plain "delete" — every item is a consolidation, distillation, gating, or
local fix whose intent survives. Prior audits in `lamdan/` and `decisions/` were used for the
recurrence check (a large fraction of their findings are genuinely fixed; those are credited at
the end, not re-litigated).

Each item below is shaped so it can be lifted directly into one GitHub issue.

---

## 1. The page-foot reserve is an eleventh hand-rolled Typst lexer living beside the real parser that already owns this job — rebuild it on the parser

- **Lens:** 2 · **Verdict:** rewrite → **fix and refine**
- **The problem:** `auto_notes_region_cm` and its scanner family re-lex Typst by hand — strings,
  comments, parens, identifiers — in a crate that ships the real Typst lexer and already uses it
  in `parse::partition` (parse.rs:177). Members: `named_arg` (lib.rs:352), `channel_declarations`
  (:399), `closing_paren` (:636), `code_only` (:908), `code_only_with` (:922),
  `declared_region_cm` (:566). The file admits it: "and this is the eleventh scanner in this
  repository" (lib.rs:810) and code_only_with: "the last thing this repository needs is a twelfth
  of these" (lib.rs:916-917). The two halves already drifted 0.04cm, papered over
  (`BAND_GAP_CM=0.45` vs a *measured* 0.41).
- **Why it costs:** every edit to a piece of Typst syntax must be re-taught to Rust constants;
  the drift bill arrives as the reserve guessing wrong. Recurrence of duplication-2026-08-09 §2.8
  ("Ksav's own internal copies") — the one top prior finding still outright live.
- **Refine:** rebuild the reserve as one `parse::partition(body)` pass (comments→skip,
  strings→channels, content-blocks/arg-ranges→name-match for `#מדף_`/`#ערוץ`/`#מסמך`) plus the
  existing arithmetic. Delete the hand lexer family. First commit: add a
  `parse::apparatus_shape(body)` helper behind a gate the current scanner tests
  (lib.rs:3211-3701) run against both; flip when byte-identical.
- **Cost:** the arithmetic is untouched, only the lexing; ~twenty reserved-region tests become the
  regression net. Incremental.
- **Also (lens 3, related):** replace the `DEFAULT_REGION_CM=3.0` prediction with a one-shot
  measure-and-recompile when a document uses an apparatus without declaring heights — the repo
  already owns reading compiled layout back (notemarks::note_markers, probe), so the fixed-point
  is buildable; the `RESERVE_CACHE` and its FNV hash then retire.

## 2. The compiled-then-heal seam recomposes "what the compiler will see" in three places — centralize it, keep the heal

- **Lens:** 2 · **Verdict:** wrong-but-keep → **fix (centralize)**
- **The problem:** the editor's text and the compiler's text differ whenever a document is
  unbalanced (which, while typing `#הערה[`, is every keystroke). `compile.ts` compiles the
  *healed* copy, and the heal is re-derived independently at `runCompile` (compile.ts:323-328),
  `compileUnfocused` (:211) and `bodyOnScreen` (:283), each a chance for one to heal where the
  others didn't. The one law that keeps them reconcilable — "healing never inserts/removes a
  newline" — was breached silently once (`*/` repair, brackets.ts:250-260).
- **Refine:** keep the speculative heal (blanking the preview mid-keystroke is the worse failure —
  this is the best wrong answer), but produce one `RenderPlan { body, offset, healed }` once per
  compile and store it beside `lastResult`; `runCompile`, `bodyOnScreen`, `jump`, `diagview`,
  `compileForExport` all read it. First commit: introduce the type, make `bodyOnScreen` return it,
  migrate ~6 callers.
- **Cost:** incremental; the payoff is deleting the invariant-audit from three module headers.

## 3. `main.ts` is a 14,971-line monolith and still growing — the runtime refactor extracted state but not chrome

- **Lens:** 2 · **Verdict:** rewrite → **fix (continue the split)**
- **The problem:** at whole-repo-2026-08-05 main.ts was 5,653 lines; now 14,971. `runtime.ts`
  extracted the *state*, but the chrome — toolbar/builders (`buildToolbar` main.ts:6145,
  `buildInsertMenu` :6724, `buildFormatMenu` :6587, `buildDocsMenu` :6287), pane chrome
  (:2269-4342), palette (:9084-9261), tab strip (:4342-4590) — stayed despite `panelviews.ts`
  already owning panel bodies. 73 direct getElementById/querySelector lookups; shared module-level
  mutable DOM. RECURRENT and costlier (the whole-repo-08-07 §6 split never reached the chrome).
- **Refine:** two consecutive PRs — (a) lift the menu builders into a `ribbon.ts` taking
  (registry, categories); (b) lift palette + pane chrome into `palette.ts`/`panechrome.ts`; keep
  `main.ts` as boot + wiring. (b) is a big-bang move; the test surface for these is nonexistent
  today, so the gain is directly measurable.
- **Cost:** the menu builders close over module state, so extraction needs a small context object;
  ~3-4k lines moved, one large re-render risk.

## 4. The speculative-heal invariant is guarded, but it is exercised by a sync test and by three re-derivations — a single `RenderPlan` (item 2) is the load-bearing fix; keep the invariant test

(rolled into item 2 — do not file as a separate issue)

## 5. Two full scans of the whole library on the typing path, one serving a Map that is `.get()`-ed once

- **Lens:** 3 · **Verdict:** rewrite → **fix (local)**
- **The problem:** compile.ts:428 iterates `docs.library()` for `idOf`, then compile.ts:431 does
  `new Map(docs.library().map(...))` for `updatedOf` — two full scans + materialisations on the
  debounced typing path, where this repo spent its whole perf budget.
- **Refine:** one loop building both maps (or one `Map<id,{title,updated}>` plus a title→id
  index). First commit within one function; no signature change. Also: `parts.collect` (sync) is a
  second graph-walk whose only caller is a test (parts.test.mjs:17); the live path uses
  `collectAsync`. Refine: make a single async `collectCore`, drop the sync copy or share the
  visit/cycle/`MAX_DEPTH` core so cap semantics cannot diverge (delete-the-copy, keep-the-intent).

## 6. The English command vocabulary is generated by regex over Typst *source text* — the exact text-boundary bug the facts regime was built to retire

- **Lens:** 3 · **Verdict:** wrong-but-keep → **fix (generate from a value, not prose)**
- **The problem:** `COMMAND_EN`/`PARAM_EN`/`PARAM_EN_BY_COMMAND` (emit-engine.mjs:118-222) are built
  by a ~200-line regex-and-paren-counting parser over `ksav.typ`; its own comment admits
  `rgb("…")` would hide a paren (:200-202). The floors only catch a drop below a count — a param
  *rename* (the normal edit) passes silently and ships a wrong English snippet to exactly the
  audience the surface exists for. This is the "value crosses a language boundary as text" bug the
  generated-facts/`facts.gen.json` regime was invented to cure, recreated at the English seam.
- **Refine:** have `facts.rs` serialize the pairing it already has (`commands.rs` carries he/en for
  the subset); emit a `param_en` table from Rust, keep the `_en_params` read only as a cross-check
  (like facts.mjs's retained count-scan), not the source of truth. First commit: add `param_en` to
  facts + facts.gen.json, switch emit-engine.mjs to it.
- **Cost:** one generator + its fixture regenerate; the bound checks stay. Incremental.

## 7. Templates cover the two real apparatus arrangements, but no test ties the surface's guarantees to a *reachable* command set

- **Lens:** 3 · **Verdict:** wrong-but-keep → **fix (add the set-level predicate)**
- **The problem:** per-template probes are excellent (each renders >5 runs, templates.rs:216-226;
  gemara bands against paper edge :138-169; sidenote in margin :115-135) — but nothing asserts the
  *collective* guarantee (every note kind / side-by-side stream / both indexes is demonstrated
  somewhere a writer can reach). templates.rs:101-114 make "you can no longer reach the apparatus"
  a prose claim, not a predicate, and it can regress one command at a time.
- **Refine:** one test that walks every template probe and asserts a declared "covered set" is
  present in some `template_body`. First commit: the test + the one template edit it surfaces;
  incremental.
- **Note (related):** the `-en` templates are really translations, not "documents of their own"
  (templates.rs:14-18); fix the comment to say "translations kept in step by the English-template
  test," and extend the test to fail if one copy alone drifts structurally.

## 8. The commands registry ships its documentation inside the wire contract

- **Lens:** 2 · **Verdict:** wrong-but-keep → **fix (split wire from prose)**
- **The problem:** commands.rs entries carry long-form *why* essays and deprecation histories
  inside `cmd!` literals that serialize to the client (`commands_json`), so every explanation
  ships to the editor as opaque text — the same prose-as-value crossing facts.rs was built to stop
  (facts.rs:1-37).
- **Refine:** split the wire struct (he/en/category/insert/deprecated) from the documentation
  (desc_*, the essays); keep `commands_json()` the lean shape, move prose to the facts artifact or
  docs. All consumers (facts.rs, emit-containers.rs, menu generators) read only the lean set.
  Incremental. (Keep the `every_registered_command_is_defined` fence lib.rs:4217.)

## 9. `notemarks.rs` reads the printed marker glyph (good) but infers note-number by a fragile sibling-pairing walk (fragile)

- **Lens:** 3 · **Verdict:** wrong-but-keep → **fix (annotate, don't infer)**
- **The problem:** pairing the marker run to the writer's text depends on the prelude always laying
  every apparatus as «marker» «body» siblings in one frame (notemarks.rs:29-43), enforced by no
  type; six documented exception classes follow. Reading the *printed glyph* (scheme-agnostic,
  :274-289) needs none of the pairing.
- **Refine:** keep `first_byte`/glyph-reading; annotate the prelude's markers with an id
  (`_ksav_ap_marker` already keys entries) and read that tag instead of the pending-walk; delete
  `Pending`, the collect sibling logic, and the tag rule. ~8 pairing tests become the net.
  Incremental; requires one ksav.typ change.

## 10. The decision record has metastasized into a second, unshipped documentation layer — distill, don't explain-in-three-places

- **Lens:** 1 · **Verdict:** rewrite → **fix (distill to code + git log)**
- **The problem:** prose is ~42% of code bytes, and ~87% of it is record/narrative, not
  documentation: `decisions/` ~940KB (99 files in ~5 weeks), `lamdan/` ~643KB, `NOTES/HANDOFF/
  AUDIT` ~190KB. Every surviving function carries an essay recounting the lamdan finding that
  produced it, and the same history is stored in `lamdan/*.md` **and** `decisions/` **and** the
  doc-comment — three venues for one fact. `escape.rs:18-22` even embeds the *pre-fix wrong*
  character tables purely to explain history. Most specifically: the whole-repo-08-05/07 monoliths
  (~283KB) are linked to by nothing living; `decisions/2026-08-09-lamdan-three-repos.md` (94KB) is
  a second-order narration of `lamdan/three-repos-2026-08-09.md`.
- **Refine:**
  - Retire the two `lamdan/whole-repo-2026-08-05/07.md` monoliths and the
    `decisions/2026-08-09-lamdan-three-repos.md` meta-log to `git log`/`decisions/` (their durable
    rules are already distilled into CONTRIBUTING.md §4); zero living pages link to them.
  - Fork `decisions/` into a timestamped one-line-per-entry `LOG.md` (git history keeps the full
    text); keep the enforcement fences (documentation.test.mjs) intact on compaction.
  - Rewrite `decisions/README.md` from a narrative index into a `date · one-line decision` table.
  - Keep the genuinely living layer whole: README, CONTRIBUTING, docs/start-here, docs/
    troubleshooting, docs/girsa, spec.md (~259KB — this earns its keep).
- **Cost:** near-zero reader behavior change; git history preserves everything. This is Ksav's
  share of the cross-repo prose-tax finding (see Interop §A).

## 11. The test/documentation tower is the most expensive guard on the least load-bearing invariant

- **Lens:** 1 · **Verdict:** wrong-but-keep → **fix (cap it, re-aim it)**
- **The problem:** ~1,800 lines of the newest, fussiest machinery verify that markdown/i18n text
  agrees with each other and with source strings (documentation.test.mjs:457 lines re-deriving
  shortcut cards, README sentences, every `*.rs` path; coverage.test.mjs; help.test.mjs) — and
  `run.mjs:223-257` re-sweeps the *same two numbers* a second time. The seam that breaks the
  product (compiled doc ≠ what the writer sees) is guarded by a *thinner* engine net. Each member
  is self-aware and caught real bugs; the subject is derivative.
- **Refine:** delete run.mjs's backward sweep of the two numbers (documentation.test.mjs already
  owns them); redirect the tower's growth budget into `assert_same_page`-style engine equivalence
  oracles (inline vs deferred, region spellings) and one more real-codec graphic check in prose
  .test.mjs's style. Concrete, startable, no coverage lost.

## 12. `chrome.test.mjs` is a real net still carrying the positional-slice disease it was written to retire

- **Lens:** 3 · **Verdict:** rewrite → **fix (re-home the behavioral truths)**
- **The problem:** presence-prohibitions and PANELS wiring are genuinely right (classList absences,
  tokens), but the file is studded with 600-char looks-ahead: `MAIN.slice(at, at+600).includes(
  "closeOnEscape()")` (chrome.test.mjs:147), slices around `renderPaletteList` (:267),
  `runAction` (:276-279), `runRow`. A refactor that moves a call >600 chars re-churns it red (or
  green while a second handler exists). This is the §7 "fence made of string matches" — RESOLVED
  in kind, but recolonized higher.
- **Refine:** keep the absence-prohibitions; export `closeOnEscape`, the palette dispatcher, and
  the rebuild/reveal keys from their modules, and assert the property on the function, not 600
  chars around the call (same move panels.test.mjs already makes with PANELS). Net-shortens file.

## 13. The `audit/` directory is a committed, test-shaped morgue that can never fail

- **Lens:** 1 · **Verdict:** don't-build → **fix (distill to conclusions, stop growing)**
- **The problem:** `audit/` is ~118 tracked files (fixtures/results/shots/tools) that CI neither
  runs nor references — added wholesale by "Preserve Ksav and Shall audit artifacts." It *looks*
  like a gate and is not; much is archaeology about a *different* project on a Windows path
  (audit/tools/run-harness.sh:14 hardcodes a sibling repo). Golden outputs nothing compares.
- **Refine:** replace the tracked fixtures/results/shots with a single `audit/README.md` stating
  the 2-3 conclusions (e.g. "build-context probes re-confirmed the §6 sibling-dependency; no gate
  asserts it"), stop tracking new probe output, and let the screenshots/results stay in git
  history. ~90 fewer tracked files; nothing loses coverage because nothing has it. (Fix-and-refine
  framing: you are not losing evidence, you are stopping a directory that masquerades as a gate.)

## 14. notes-corpus fine-grained claims remain asserted by zero tests

- **Lens:** 2 · **Verdict:** rewrite → **fix (assert the advertised claims)**
- **The problem:** off-page overflow is genuinely fenced (`no_corpus_document_prints_below_the_
  text_area`, notes_acceptance.rs:93-164), but the corpus's structural claims are eyeballed:
  flowtest page-count/column-flow, perdaf register, vilna 3→2→full wrap, numorder 1-6 column-major
  sequence, boxover positions. `run.sh:5` says plainly "It does not assert."
- **Refine:** write one parameterized test per structural claim *in probe's terms* (structural,
  no golden y-values): perdaf "both columns break at the same row," numorder "sequence is
  1,2,3…6 in column-major," vilna "row column-counts are [3,3,2,full]". Converts ~6 unasserted
  headline rows into honest assertions; instrument rule README.md:138-167 kept.

## 15. `watch.forget` has no caller

- **Lens:** 1 · **Verdict:** delete → **fix (wire or drop)**
- **The problem:** a public `forget` on the file-watch surface exists with no caller; the watcher
  teardown contract is stated twice and enforced in neither place consistently. External §4.2
  confirmed it callerless; still true at HEAD.
- **Refine:** add the one lifecycle caller, or delete the method + its route. Prefer adding the
  caller if Tauri teardown actually needs it (which is the cheaper of the two).

## 16. Dead/vestigial: nil

Nothing else in the source reads as a wrong artifact. `git.rs` (version control for a sefer),
`sefarim.rs` (catalogue), and `spell/*` were considered for deletion and **rejected** — they
serve real wants. The code-signing gap (unsigned installers asking the least-technical audience
to defeat OS warnings) is a real **product** adoption blocker, but it is a policy/money decision
already documented (release.yml:184-198); record it as a product note, not an engineering bug.

---

## Interop with Girsa (shared seam)

### A · The prose-tax finding is the same disease in one shared patient
Both repos carry ~85-90% of their prose as record/narrative, not documentation, and both built
machines to keep prose true to code that are themselves prose. (Ksav's share: item 10 above;
Girsa's: Girsa items 8-10 and 12 in its own audit.) Do not fix one without the other — the effort is the
same, and a fix in one teaches the fix in the other.
- **Refine:** adopt one convention across both: author an invariant once (code or a shipped
  contract), reference it from doc comments, and let `git log`/a one-line dated log carry history.

### B · Cite the compiler, not the prose
Ksav's English-vocabulary seam (item 6) and Girsa's hand-twinned 140-command boundary (Girsa items
5-6) are the same bug at the shared seam: a supervising truth (Typst source / `spec.md` / the Rust
`#[tauri::command]`) is read back by a hand-written regex or a bare string, and the pair drifts.
Emit each pairing from the authoritative code once, and cross-check rather than re-derive.
- Note that Girsa's spec-§12 "MCP on both ends" claim is **false** (spec.md §12 never mentions
  MCP) and is being asserted in Girsa's record — see Girsa item 13 in its audit.

### C · Product-identity questions only you can answer
- Is Ksav's WASM build (a 52-line, CI-smoked module) a bet you're still paying for, or a product
  surface? It is now genuinely exercised, so this is a continuation decision, not a repair.
- The "editor↔compiler seam" is the whole bet. Keep one shared notion of "the document as it will
  be compiled" (item 2) as the seam's load-bearing law.

---

## Credit — what is genuinely healthy at this HEAD (lens 1 holds)
Do not re-litigate; these were materially fixed since the Aug-05/07 audits and verified at HEAD:
the two-mode `spans.ts` lexer making the `(רש"י)` corruption *unrepresentable* (whole-repo-08-07
§6 RESOLVED); the generated facts/`engine.gen`/`services.gen` regime (registry §8 RESOLVED); the
single registry + per-runtime transports (three-repos §4 RESOLVED); the wasm build actually built
+ smoke-run in CI; `assert_same_page`, `probe.rs`, and the apparatus-mark glyph diagnosis;
`includedParts` now `collectAsync` + bounded LRU (external §3.2 RESOLVED); incremental spell-check
and cached flattenGlyphs (external §3.1/§3.6 RESOLVED); both escape table copies collapsed into
one `escape.rs` authority.

## Red flag for a future audit
If a *future* run produces the same top-three as this one, treat it as a coverage bug, not
corroboration — re-open items 1 and 3 specifically, which are the two known-live Recurrents here.