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
- [x] #83 a click on a word from an included chapter puts the caret at that line
  number **in the parent**. (High, from #82) — The engine returns the file and a
  test fences it; `readSpot` dropped it into a two-key `BodySpot` **at the wire
  reader**, so `main.ts` never had it. **`Located` declared `file` and was imported
  nowhere** — `rg "Located" app/src` returned its own declaration and nothing
  else, for the whole life of the bug, reading like a contract. The fence for it
  is **the type, not a test**: `readSpot` now returns `Located`, so a reader that
  forgets a field does not type-check (proven — `TS2741`). `jumpFromClick` asks
  the question `diagview.show` has always asked for a diagnostic, through one
  shared `clickedChapter`, and hands the answer to the one `gotoPart` that opens
  a chapter — so the two paths cannot come to disagree about what a chapter is.
  **Five mutations, all caught, across three fences:** the reader keeping the type
  and discarding the file (goes red on every transport), `jump`'s declared type
  reverted to `BodySpot`, the decision ignoring the open document, the click
  branch removed from `main.ts`, and the branch handing over the raw `file`
  instead of the decision it made.
  **What it did not fix, and why it is not in this fence:** `wire.test.mjs` checks
  that a shape is *declared* and cannot check that it is *read* — measured, **five**
  more wire interfaces are declared and never named (`ClipboardSource`,
  `Linkified`, `RefreshResult`, `Revealed`, `ServiceRow`). All five are
  single-field or flat shapes read structurally, so a blanket "must be named"
  rule would be red on five innocent ones and is not the fence. `Located` was the
  only shape where a reader returned a **different interface**, and that is now a
  compile error.
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
- [x] #72 a sefer cannot read the disk at all, and that was never a decision. `#import
  "helper.typ"`, `read()`, absolute paths — all refused; only bundled packages resolve.
  The sandbox is *right* (`packages_root()` is a root a document cannot escape), but it
  means a sefer is one file forever. Proposal: `packages_root()` a second time, per
  sefer. **Cheap half first:** `@local` alone in the `app_data_dir()` that already holds
  the dictionary. Decision, not a task — autosave, `git.rs` and the file tree all move. (from #15)
  — **Shipped the cheap half, and the deferral was right first.** The blocker was not the
  resolver but that the engine had **no way to be told where anything is**: the compile
  channel is `(name, String)`, so a root on the request means any loopback client and the
  browser build could point a compile at any directory. So the seam is the *first* of the
  two versions the issue named — `set_local_packages_root`, called once from `.setup()`,
  first `set` wins — and the sandbox property is preserved rather than traded. Two
  measured warts closed with it: `missing_package` split on the literal `"packages/"`, so
  a root **not** called `packages` degraded to *"a file (e.g. an image) wasn't found"*, and
  the namespace was lost. Four fences, and the one that matters is
  `a_local_root_does_not_open_the_disk` — a feature whose whole justification is *"still a
  sandbox"* is not done until something says so. **A sefer is still one file**; the
  multi-file decision is untouched and now starts from a working seam.
  `decisions/2026-10-02-local-a-root-the-sandbox-survives.md`
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
- [x] #80 **reledmac + reledpar** for Hebrew RTL text-critical editions — forwarded
  research, **unverified, and a different shape from #73**. It is LaTeX, and #67's
  resolver takes Typst packages only, so this is not "bundle a dependency" but *read it
  for the knowledge* / *adopt a second engine* / *nothing*. The multi-stream half is
  **already answered** — `הגדרות_זרמים(פריסה: "צד")` keeps each stream in its column across
  pages — so the only scope worth a sprint is the text-critical half: lemmata, line
  numbers, and **several independent footnote registers on one page** (the forwarded
  "Bug C" is the most transferable claim in the set). The forwarded verdict, "the only
  system capable of handling it", is a claim of exactly the kind this repository measures
  first. (from #80)
  — **Verified: do not adopt. Six of seven claims are false.** Checked against the CTAN
  page, both official manuals, `reledmac.dtx` (22,852 lines), the three official examples
  and TeX.SE. **Five of the named macros do not exist** (`\Xbeforelemma`,
  `\Xafterlemma`, `\Xledmacinit`, `\Xfootdir`, `\RTLpair` — **0 occurrences** each), so the
  forwarded blueprint could not have been written against this package. The engine advice
  is **inverted**: the manual says RTL `\sameword` *requires* LuaTeX, and the official RTL
  example opens *"In this example, we use Lua\LaTeX."* The central claim — that bidi and
  reledmac collide at the line-measuring level — is contradicted by the manual's **own**
  bidi integration: `\if@RTL` is consumed, the RTL lemma bracket switches *automatically*
  (so Claim 4's "fix" is the defect), footnote direction is automatic per note, and the
  changelog is a decade of bidi fixes. The one real TeX.SE question (#630018) was a
  diacritic pasted onto `\edtext`. And "several independent footnote registers" is
  **already built and fenced** (`מספור` per-stream, `endnote_streams_side_by_side`). The
  residue is exactly **line numbers and lemmata** — and neither is a port, because both
  follow from owning the line, which is a question about Ksav's engine. Licence is LPPL
  1.3: fine to depend on, not to vendor. `decisions/2026-10-02-reledmac-verified-the-claims-are-false.md`
- [x] #73 bundle real Typst libraries, starting with `meander`. #67 made it possible for
  the first time; #70 has now **removed the main reason** (they thread cleanly). What
  remains is the uncomfortable one: page-breaking is what a typesetting app most needs
  to control. (from #15)
  — **Read it, measured it, and the answer is no.** Fetched 0.4.4 and read the source:
  **MIT**, so the licence objection is *gone*, and 26 KB, so the weight objection is moot.
  But `reflow` threads **one ordered queue** around obstacles (`smart-fill-boxes` pops
  `body-queue` in sequence) and the `query`/`tags` mechanism addresses a **placement**,
  not a destination — so the **addressed routing** this issue was corrected to be about is
  **not in the package**. What it does do, Ksav has measured and fenced: side notes,
  named regions with per-stream numbering, content flowing across columns and pages. Both
  named beneficiaries are settled without it (#70 for note spill; routing for the rest).
  And the objection never answered — a third party in the page-breaking path — is the one
  that decides it, because the overlap is *total*. **The durable output is a fence, not a
  package**: `the_prelude_depends_on_no_third_party_package`, asserted on the *assembled*
  document and covering `@preview` **and** `@local`, so "a Ksav without it is still a
  complete Ksav" is now true rather than intended.
  `decisions/2026-10-02-meander-read-measured-not-bundled.md`
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
- [x] #63 include diamond re-expansion. (from #63) — **A budget somebody chose, in two
  limits, and it is a setting.** The exponential is real (2^depth, and the cycle guard
  cannot see it because the first inclusion is popped before the second is looked at) but
  **memoizing would have been the wrong fix**: the writer asked for 128 copies, so the
  flat output has to hold 128 copies, and memoizing saves only the re-walk. What was
  missing was that **nothing bounded the total** — one 200KB part included 128 times
  measured **25.6M lines in 15.9s**, silently. Now `max_lines_warn` (100,000, **reports
  and still lays out**) and `max_lines_refuse` (500,000, **stops the walk at the limit**),
  both settable, read through `clamped` so an out-of-range value is reported like every
  other number, and made coherent with each other. `MAX_DEPTH` stays as the shape
  backstop and is now a *different kind of thing* from the budget.
  **Remaining, and both small:** the settings-dialog rows for the two numbers
  (the keys and the type are in; the two `numberRow`s and their labels are not,
  because adding them turned `browserlang`'s residue fence red and I would not
  land a red suite to save a dialog row). **Also fixed, and it was a real bug rather than a stale list:**
  `browserlang`'s residue fence was red on a clean tree over `registriesGaveUp`
  and `retrySave` — two keys that *both have English values*, so nothing about
  them was legitimately Hebrew. The banners were built with `t("…")` at the
  moment of failure and then lived in the DOM, so they kept the language they
  were born in. They now carry `data-i18n` and re-render on a switch, the same
  way `panels.ts` headings already did.
  **Bonus, pre-existing and not small:** a depth-9 diamond produced **~300 identical**
  "nested too deeply" messages, because the refusal was pushed once per inclusion path and
  nothing deduplicated it. One mistake, one sentence. (from #63)
- [x] #81 a notice raised in one language **stays** in that language. (Low) — The fix
  was already in and works: measured in a real browser, the banner carries
  `data-i18n="registriesGaveUp"` and `data-i18n="retrySave"`, the host is inside
  `document.body`, and after a switch the same two elements read English.
  Removing both attributes puts `browserlang` red on exactly those two keys,
  **four runs out of four** — so the fence is a real fence for this fix. What the
  red was really measuring: **`browserlang` serves `dist/`, and nothing anywhere
  checked that the copy on disk matched `src/`.** `gate.mjs` does not build it and
  the CI app job runs the suite *before* its `vite build`, so the gap is invisible
  in CI and the file always skips there. A `dist/` built on the 28th was being
  asked about a fix committed on the 29th, and the false conclusion — *"the sweep
  does not reach the notice host"* — was written into this plan and the session
  log as an open half. It was **not** the boot-order race the same entries
  concluded next, and `browserlang` is green 6/6 on a correct build.
  **Now refused rather than believed:** `assertFreshBuild()` compares
  newest-of-`src/` against newest-of-`dist/` and goes **red** naming both
  timestamps — not a skip, because a stale build is not a machine that cannot run
  the test, it is a confident fictional measurement, and a skip is that same
  silence with a nicer sign on it. Fenced from both ends by `visibility.test.mjs`,
  beside the acceptance script's `assertFresh`, which already fences this class
  for the server binary. Removing the guard makes a stale `dist/` pass 13/13
  silently. (from #81)
- [~] #82 a part included twice: click goes to the first, a **second gesture offers all
  of them**. (Low) — **The engine half is built; the product half has no site, and
  that is the finding.** `Expanded::lines_of` (`include.rs`) returns every place a
  `(file, line)` landed, ascending, and `line_of` is **its first element by
  construction** rather than by a fence: both are made of one private `matching`
  iterator, so the predicate cannot be written twice and drift. The fence is still
  there (`tests/includes.rs`) because a thing true by construction today can be true
  by accident tomorrow — and the rule worth holding is *"first is reading order"*,
  not the identity. `line_of` stays **lazy**, because it is on the reveal path and it
  is overwhelmingly the first match that answers, so it allocates nothing.
  The other half is blocked, and not by effort. **`BodySpot` is `{line, column}` and
  has no `file`** (`api.ts:670`), `reveal_request` reads `file` off the request and the
  app never sends it, so `lines_of` is reached with `file: None` — and a main-body line
  maps to exactly one expanded line, so the list is always length one. **There is no
  ambiguity to offer until the app can address a place inside a part at all**, which is
  #83 (filed from here: `jump` returns the file and `readSpot` drops it), and behind
  that #72's *"the app has no file tree and a part is not an addressable thing"*.
  Left open deliberately; the order is #83, then #72's decision, then this. (from #63)
- [x] #60 undecodable assets silently dropped; only base64-STANDARD tried. (Medium) —
  **Both halves were one line each, and the line was `decode_payload(data)?`** — the
  `?` on an `Option` in a function returning `Option<Asset>`, so a payload in any
  other spelling, or one corrupted byte in a megabyte, produced *nothing*: the image
  did not exist and nothing said so. Now four alphabets are tried, and every drop
  is **named**. The four are not a ranking — `-`/`_` and `+`/`/` are disjoint
  alphabets, and the padded/unpadded pair decodes identically, so "most canonical
  first" costs one attempt and never changes the answer. Fenced end to end: a
  payload encoded by hand in all four spellings must produce four **identical byte
  strings**, one corrupted byte must produce a **warning naming the asset**, and a
  document with one unreadable image must still render — because a refusal that
  failed the compile would be a different bug. Also found: `name.is_empty()` in
  that condition was unreachable, `diagnose_name` had already refused an empty
  name eight lines earlier with the better sentence.
- [x] #62 tokenizer quadratic,  #59 pdf_pages 0→all, #58 reserve scan hits prose, #57 quote-blind named_arg, #56 32-bit asset cache, #55 single-slot reserve cache, #54 wasm timeout kills unrelated.
  — **Three measured, three fixed, and one of the three was not the bug it was filed as.**
  - **#62 — the quadratic is not real.** `run_of_letters` was asked once per separator and
    scanned to the end of its word, which reads as O(n²) and was filed on that reading. It is
    not: the scan terminates on the next character that is **not** part of a word, and that is
    exactly the set of characters `joins` is called *for* — so the regions do not overlap and
    their lengths sum to at most the text. `examples/bench-tokenize.rs` measures it at five
    sizes across five shapes, work-normalised, and every shape reads **flat**; the one that
    read `QUADRATIC` on a first run was **the shared box**, not the code, and taking the
    minimum of seven runs turned the same shape into a dead-flat 3.88 → 3.88 ms/MB. So the cap
    landed anyway — it makes the bound O(1) per separator *unconditionally* rather than by
    argument about today's rules — and `english::joins` had the identical disease and got it
    too. The correctness fence is the boundary the cap is only allowed to be wrong past:
    `שו"ע` and `נפק"מ` hold, `שו"עאב` splits.
  - **#59 — a typo exported the whole sefer.** `pdf_pages` dropped every token it could not
    read and `pdf_options` read the empty result as *"no restriction"*, so `0` exported every
    page, `0-5` silently meant pages 1–5, and `9-2` exported **nothing**. The editor's own
    `pagerange.ts` already had this right and kept the offcuts — the engine was the copy that
    did not, and the two were never compared. The engine now adopts **that** grammar and
    fails **closed**: every token refused is an error naming them, not an empty range meaning
    everything. A *partly* good spec still exports its readable tokens — refusing the whole
    export over one typo would be worse than the bug. The fence is **exported bytes** in
    `tests/binding.rs`, not parser state, because a fix that taught the parser the right
    answers while leaving `pdf_options` reading empties as "everything" would pass a unit test.
  - **#58 — the last hand-rolled scan of its kind.** The inline reserve reader did
    `body.find("אזור_הערות")` and took the number after the colon, so **prose, a `//` comment,
    a string and a raw block all read as the writer fixing the page-foot reserve** — and
    `grow_inline_reserve` *wrote over* it, silently, shortening the text block of every page.
    `auto_notes_region_cm` had been moved onto the Typst parse long ago (*"with the parser
    now doing the lexing"*, in its own test); the inline reserve had not, and now all three
    readers come through one `find_writer_masmer` off the parse. `inject_reserve_into_writer_masmer`
    had the same disease and wrote an argument into a **commented-out** `#מסמך(` — which is
    what the editor's own "comment out" writes.
- [ ] #56 32-bit asset cache, writable by a header-less caller. **Deliberately not
  done in this round, and the reason is the fix's shape rather than the bug's doubt.**
  The claim is sound — `client_hash` is two 32-bit FNV lanes over a payload the attacker
  controls, so a collision is a ~2^32 birthday walk, and `server.rs`'s `origin_allowed`
  lets a no-`Origin` caller through, which is any process on the machine. But the fix
  the issue names (**SHA-256 of the decoded bytes**) is a **protocol change**, not an edit:
  the hash is **persisted in every `.ksav`** (`docs.ts:345`, read back by `docfile.rs`), so
  it is a file-format break; it must be computed identically in **Rust and in JavaScript**,
  where a synchronous SHA-256 is ~70 hand-written lines because `crypto.subtle` is async
  and `assetHash` is sync and WeakMap-cached; and `engine/tests/assets.rs` holds the two
  implementations against each other, which is the only instrument that makes the change
  safe. A half-migrated hash is worse than a 64-bit one: old files' assets would re-send
  once (fine) but any client and engine out of step would silently stop deduplicating.
  Worth doing whole, with the two sides landing together.
- [x] #61 `is_command` exempted prose before a paren — the checker's best case being
  **absent** rather than wrong.
- [x] #57 named_arg was quote-blind while its neighbour `closing_paren` was not. Two
  scanners disagreeing about where a string is is how an argument list whose first
  string contained `גובה:` answered with the *string's* number, returned before the real
  argument, and sized the foot band from a string — notes off the page, no diagnostic.
  **`code_ranges` is now the only walk in the crate that knows how Typst quotes work**,
  and both scanners use it. The value scan skips strings too: `"מקורות, ביאורים"` used to
  be cut at the comma inside it.
- [x] #55 the one-slot reserve cache, measured before it was touched.
  `examples/bench-reserve-cache` times `parse::apparatus_shape` on real sefer-sized text:
  a miss costs **~3.9 ms at 64 KB, ~17.5 ms at 256 KB, ~72 ms at 1 MB** — past the ~59 ms
  keystroke budget at a megabyte. Two open windows alternate two keys and each call
  evicts the entry the next one wants. Now eight entries, evicting **least-recently-used**,
  because the pattern that breaks a one slot is a *cycle* and any map that drops an
  arbitrary entry turns a 2-cycle into a 100% miss forever. **The instrument got it wrong
  twice first** and both are written into the file: it built both alternating bodies from
  the same template, so they hashed to one key and the "miss" row measured a *hit*
  (3.5 µs where the truth is 72 ms) — an instrument that cannot tell a hit from a miss
  reports the problem as solved. The fences are the only property a cache may have: **the
  answer must not change whatever order keys arrive in**, and the entry count stays
  bounded.
- [ ] #20 deferred/numbering scans to Rust, #19 spans.ts Rust port, #21 styles walkers onto walkArgs.
- [ ] #7 keyed updates (5× replaceChildren).

## Phase 5 — Features / proposals (Info/Low, after engine is safe)
- [ ] #88 show the invisible characters. (Presentation, from #84) — **Whitespace in Ksav
  source is not decoration: it prints.** `main.ts:5910` — *"Typst turns a newline into a
  **space** and a blank line into a **paragraph break**"* — so `first⏎second` prints
  `first second`, a blank line prints two paragraphs, and runs of spaces collapse. Three
  different things produce **different pages** and none is visible. And after #84 the whole
  left margin is invisible characters, so it is also how the indent **shows its own work**.
  Not new: `highlightSpecialChars` is imported at `main.ts:2` and **bidi marks are already
  a solved instance of this exact feature** (`bidi.ts:467`) — an invisible character that
  changes meaning, solved by rendering the character. Off by default: a sefer is full of
  spaces. Not rendering line-break glyphs either; the *meaning* is worth marking and a `·`
  cannot.
- [x] #89 a minimap, **opened rather than permanent**. (Presentation, from #84) — Shaul:
  *"a minimap you can open that basically shows everything in small"*. **Opened removes my
  width objection entirely** — it costs nothing when unwanted, which answers it better than
  defending a permanent strip could. `panels.ts:148`'s `PANELS` registry and
  `overlayPanel` are the home, and `settings.panelPlacement` decides float vs pane for free.
  **The fence, and it is real:** `visibility.test.mjs` runs `planFor(PANELS)` and
  `tools/surfaces.mjs:36` has **deliberately no default** — *"An unclassified panel throws with
  its own name… a fallback is the silent skip one level up."* So the gesture that opens it
  must be declared. **RTL/ LTR needs no work:** `main.ts:678` puts `docConfig().dir` on the
  editor via `contentAttributes`, and `bidi.ts` resolves **per line** — so a minimap that
  inherits from the editor rather than being told a direction gets both free, and my earlier
  RTL worry was the wrong worry. Open: where it sits (lean **pane**, it is about the editor),
  which way it opens a target, and **marks or no marks** — leaning marks, since without them
  it is the outline at a smaller size.
- [x] #87 a folded tag says how long it is. (Presentation, from #84) — `#הערה[… 480
  אותיות]`. **The only item that removes a step rather than adding a view**: it answers
  *"is folding this worth it?"*, which you must answer *before* folding, and a 900-char note
  and a 20-char one currently fold to the same chip. The label machinery is already there
  (`ksav-lang.ts:1147`) and the length is `close − open` over a `Frame`. **A trap worth
  naming:** `Frame.close` is already `text.length` when nothing closes it
  (`spans.ts:250`), so an **unclosed** tag reports the rest of the document — correct and
  useless, on exactly the tag that is broken. Characters or printed lines is a real choice;
  leaning characters.
- [x] #86 click a bracket, select the whole tag — **a setting, a modifier, and two keys.**
  (Presentation, from #84) — *"should be a setting. and maybe there can be a click and a click
  while holding alt or something. there could be kbd ways to select either also."* The
  setting is **what a bare click means** (`body` = the words, `whole` = the tag), leaning
  `whole` because moving a note has no other way while retyping is not what a click is for.
  **`Alt`+click is the other one**, and Alt was checked rather than assumed: it is what
  `main.ts:10810` and `:14235` deliberately let through so *"Mod-S while a hydra is up should
  still save"*, and **`Shift` is the wrong pick** because `Shift`+click already selects a
  range in the preview (`jump.ts:isPlainClick`) — the one modifier that already has a click
  job. Two keys from `keybindings()`; the selection actions join `STRUCTURE_ACTIONS`
  (`structure.ts:988`) and its `Prec.high` keymap, which returns `false` when it has nothing
  to do — *"exactly how Enter stays Enter in ordinary prose."* **Typing over a whole-tag
  selection restores the brackets**, because *silently losing a bracket is the single worst
  moment this application has* (`brackets.ts:3`) happening as a feature. The fence is
  **differential**: the same text typed into both selections must give the same document,
  which is the only assertion that catches both a missing and a doubled bracket.
- [x] #85 dim every line outside the tag the caret is in. (Presentation, from #84) —
  **focus mode one level up**: `focus.ts:28` already dims outside the *paragraph* and
  `dimDecorations` already builds over the viewport for the stated reason. The range is a
  `Frame` instead. It answers *"which `#הערה[` am I inside?"* — which was on my list as a
  **hover** and does not need to be one. Two things are genuinely open and are in the issue:
  whether dimming is right for dense Hebrew (maybe de-emphasise less and emphasise more), and
  **how this composes with focus mode**, since they are the same idea at two granularities.

- [ ] #84 indent nested tags in the source **view** — a toggle; the file is never
  changed. (Proposal) — **Shaul's spec, five lines, which supersedes everything I
  inferred:** every `][` in its own line, indented; the amount is a user-set value; the
  point at which indenting stops is defined **either** by amount from side (**in RTL,
  from the left** — the opposite of what `padding-inline-start` gives, and noted so
  nobody "fixes" it) **or** by percent used; a minimum-words setting; and **paragraph
  breaks within an indented paragraph share that indent level**.
  **A view, not an edit — so there is nothing to save, undo, keep idempotent, or worry
  about in `git`.** All four of my earlier concerns were about a rewrite that does not
  happen; the last line of the spec answers the one question I was going to ask (does
  typed text carry the indentation? — no, there is no file change at all).
  **Line 5 is the part that is easy to get wrong and it is a rule, not a detail:** a
  blank line inside a note has no content to hang an indent off, so indenting each line
  by its own depth makes the block visibly fall apart at the first gap in the prose.
  Carrying the level across the blank line is what makes a `#הערה[…]` read as one block.
  Nesting is already computed — `scan()` gives `frames` outermost-first with
  `{open, close, ctx, name}` (`spans.ts:247`), and `mode.ts:enclosing` /
  `structure.ts:structureAt` both read it — so this is a view over existing state.
  Defaults are mine: **2 spaces** (`table.ts:258`, the one place here that already
  pretty-prints), **50 percent** (as named), and a minimum-words number to be chosen.
  **Approved**, and the siblings split into their own issues per the one-per-session rule:
  **#85** dim outside the innermost tag, **#86** click a bracket to select the tag, **#87**
  length in the fold placeholder, **#88** show whitespace, **#89** a minimap. Each gets its
  own toggle, like this one.
  **The thing worth knowing, found while writing #88:** whitespace here is not decoration —
  `main.ts:5910`, *"Typst turns a newline into a **space** and a blank line into a
  **paragraph break**"*. So a line break inside a tag's body **prints as a space**, which
  means (a) it is why #84's "paragraph breaks share an indent level" is a rule about
  typography and not about layout — a blank line is a typographic event — and (b) it is the
  one place where "it is only a view" is doing real work rather than expressing a
  preference. The escape for it exists and **appears in no menu, no palette and no
  document**, which `main.ts:5914` calls *"a feature nobody can find"*.
  **The family, and what makes it one:** *presentation* — re-present the source without
  changing it. "No change to the real file" is not a caveat on #84, it is the *test*, and
  hover/diagnostics/navigation are a different tool (**analysis** — they tell you about
  the text) which is what I kept answering with. The siblings, all over the same
  `scan()`, and **none needs a new scan — that is the honest test for belonging**:
  (1) **dim outside the innermost tag** — `focus.ts` already dims outside the *paragraph*,
  and this answers "which `#הערה[` am I inside?" with no hover at all; (2) **click a bracket,
  select the whole tag** — the reverse of #84, legible vs *grabbable*, and `bracketMatching`
  is already wired so the range is known; (3) **tag length in the fold placeholder**
  (`#הערה[… 480 אותיות]`, `close − open`) so you can tell whether folding is worth it;
  (4) **whitespace rendering** — after #84 indentation *is* whitespace, and
  `highlightSpecialChars` is already imported and used for bidi marks; (5) **a minimap**,
  which I wrongly skipped first time — the ruler answers *where*, a minimap answers *how
  much*, and it is the only thing showing a chapter went 3 pages to 40. **Line numbers
  stay absent on purpose**: in a sefer the address is the *siman*, which `numbering.ts`
  maintains, and the gutters are already hidden in page mode.

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
