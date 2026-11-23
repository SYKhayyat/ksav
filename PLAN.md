# PLAN — ksav

Work top to bottom. A milestone is done when every box in it is checked **and**
its exit test is true. Decision gates (◆) are not code work: when the queue
reaches one, stop and ask the owner. Don't decide a gate from inside a worker
session.

Worker loop (see `AI_ISSUE_ROUTING.md`): take the top unchecked item that is
not behind an open gate. **Clearing technical debt always comes first:** the
Debt section sits above every milestone, and new debt is filed there, not
deferred behind a pay condition.
Fix only that issue and its resolving test, commit,
check the box here, and stop. New issues go into the milestone where they
block something, not at the end. The milestones are ordered from foundations
to features, so "insert into the right phase" still applies. Each milestone is
a phase.

History: the plan before this rewrite, including the full record of the
`main.ts` split waves, the audit sweeps and the old per-session notes, is
archived verbatim in `decisions/2026-11-15-the-plan-before-the-milestones.md`.

Targets: NixOS and Windows for the owner, then generic Linux and Windows for
everyone else. Linux packaging stays distro-neutral, with no Nix-only paths.

---

## Debt — always first

Clear these before any milestone work. The older ledger, with the reasons each
item was accepted at the time, is `decisions/2026-10-22-accepted-debts.md`.

### Three jobs read #228 and #229 backwards, so CI was red without saying why

M0's exit line is *"CI on `main` is fully green"*, and it was not: every push
from `022391f` onward came back red in the same three jobs — `the Emacs package`,
`browser engine` and `editor`. Two of the three were the same defect as #228, one
layer out: a reader that still took the pre-#228 **bare array**. The third was
#229's lesson in a file that had not learned it — a test asserting what an engine
answered, in the one job that builds no engine.

- [x] **#234** two readers still take the pre-#228 bare array, and one of them is
      the **shipped Emacs package**: `.github/scripts/wasm-smoke.mjs` read
      `call("commands").length` and iterated `call("templates")` (measured at
      `a2566ff`: `TypeError: templates is not iterable`), and
      `ksav/editors/emacs/ksav-write.el::ksav-commands`/`ksav-templates` returned
      the envelope itself, so `M-x ksav-insert-command` offered `ok · commands`
      and `ksav-command-named` found nothing — no error, because a two-element
      alist is a good alist. The live half of the Emacs suite skips without an
      engine, and this machine's engine binary was three days old, which is how a
      wire change reached an installed package with every local run green.
      **Closed**: both read the name the list travels under, and the comment in
      `ksav-engine.el:353` that had justified the old read (*"`/commands` answers
      with a bare array"*) is corrected rather than deleted. Measured: Emacs
      **63/63** with a freshly built engine and byte-compile clean; the smoke
      check `all checks passed — the browser engine works`.
- [x] **#235** `importui.test.mjs` failed 5 of 24 in the `editor` job from the day
      it was written, and no job ran it where it could pass. `npx vite build`
      leaves `__WASM__` false, so an import's compile answers `✗ שגיאת רשת` and —
      by design, `runtime.ts::holdStatus` — takes the status slot every assertion
      in the file reads. **Closed**: the file asks
      `pageserve.mjs::engineInBundle()` (the reader `browserlang` already had, now
      one spelling for both) and skips exactly the two assertions a compile has to
      answer, naming the build command; the other 22 run in both bundles. The two
      that skip are fenced where an engine exists: the `browser engine` job now
      ends with `npm test -- importui browserlang`. Measured — wire bundle `22
      passed`, offline bundle `24 passed`, the pair together `48 passed, 0
      failed`.

### A fence asked about a phrase where the question was a pattern

`ac499fc`. The lint check went red on this machine for the first time, and all
twenty-two findings were in `src/wasmpkg/ksav_wasm.js` — the glue `wasm-bindgen`
writes, complaining that `console` and `WebAssembly` are undefined. The ignore was
`"wasmpkg/**"`, anchored at the config's directory, while the glue lives at
`src/wasmpkg/`: the pattern matched no file. `lintconfig.test.mjs` asserted
`/wasmpkg\//.test(config)` — that the *word* was in the file, which it was.

It is the same class as `indexOf(a) < indexOf(b)` reading `true` when `a` is
absent: **a fence that asks whether a string appears where the question was
whether a pattern matches.** The fence now evaluates the patterns (glue ignored,
fixtures ignored, `src/compile.ts` not ignored), and the reason it could not
surface earlier is that this box had never completed a 35-minute wasm build until
today — a lint pass over a file that does not exist has nothing to say.

### Two fences were reading a stopwatch, and only saw it under load

Found because a full-suite run failed twice in one afternoon and passed when the
files were run alone. Neither was a product bug; both were the gate lying about
what it knew.

A fence that measures after a fixed wait is measuring the machine, not the
program. `browserlang.test.mjs` waited 2500 ms for the boot and then counted the
ribbon's groups; under the load of the rest of the suite the ribbon was still
being built, and the failure reported **#228's defect — no toolbar — on a build
that had one**. `paneRefresh.test.mjs` compared two costs in one process, which
is the right shape, and still wobbled: a scheduling pause inside a timed loop
moves an *average*, and it lands in whichever loop decides the ratio. Both now
wait for a condition (the ribbon exists; the slot has stopped changing) and the
timing fence takes the cheapest of five rounds on both sides.

The rule to carry forward: **if a fence can be green on an idle machine and red
on a busy one, it is measuring the wrong thing** — and the gate is where that is
least affordable, because a false red teaches the next reader to re-run it.

### The desktop render check, after two years of not being able to run here

Both found in one sitting because #227 made it possible for check 12 to say
anything true on this machine at all. Neither is a NixOS problem: the first was in
our check, the second in our wire.

- [x] **#227** the render check pinned X11 by *deleting* `WAYLAND_DISPLAY`, which
      pins nothing (GTK landed on the broken Wayland path anyway, `dPR -1/96`) and
      which disarmed the app's own guard, since `main.rs` needs that variable
      **present** to choose X11. **Closed**: the check asks for `GDK_BACKEND=x11`,
      the same way the app does (`d886d45`).
- [x] **#228** the `commands` and `templates` registries answered a JSON **array**
      into an envelope whose one shape is an object, so `Reply::relayed` refused
      them from every transport since `d16de52` (#215) — no toolbar, no Insert
      menu, no palette, no completions, in the browser build as much as the
      desktop one. `inbox` was the third, found by the test rather than by
      reading. **Closed**: each list travels under its own name
      (`relayed_list`), the client unwraps the name, and `engine/tests/registries.rs`
      spans the seam that three fences all looked past.

### The 2026-11-19 audit — filed straight to the top

Seven findings, each measured rather than read, and each with a mechanism
(the audit's own rule: a fence or a type, not a sweep). They sit above the two
standing debts because they are *this* tree's shape today, not a pay-condition
waiting on a feature.

- [x] **#225** the wire comparator covers 11 of 18 services. **Closed**: 19 → 45
      seam rows with a registry-driven fence over `engine/src/services.rs`; two drift
      findings fixed (five mutants red).
- [x] **#215** four services answered a failure in three different wire shapes and
      nothing on the wire said which. **Closed**: `Service.call` returns a `Reply`
      whose only constructors are `ok(payload)`, `fail(message)` and
      `relayed(json-text)` — checked, not trusted, because it is the one place
      somebody else's JSON reaches this wire. `Reply::json` is the only writer of
      the envelope, so a fourth shape does not typecheck. Measured: 96 answers from
      five garbage requests to all 18 services, every one carrying a boolean `ok`
      and either an `error` sentence or the diagnostics that say why. Fenced by
      `engine/tests/reply.rs` (driven from `SERVICES`, so a nineteenth service is
      covered the moment it is registered) and row by row in
      `app/test/wire.test.mjs`.
- [x] **#218** one compile at sefer size costs **3.4 s** (634 KB, 258 pages, warm,
      over the loopback) and nothing measures the curve. **Closed**: the curve is not
      in the layout — layout is ~0.1 ms a page and flat; the seconds were page
      writing, which now runs on every core (`src/pagesvg.rs`). Fenced by
      `tests/compile_curve.rs` (layout per page stays flat, writing stays the
      dominant half) and `tests/pagesvg.rs` (parallel output byte-identical to
      serial), measured by `examples/bench-compile-curve.rs`.
- [x] **#219** the pane refresh costs **86 ms** of main thread per 200 ms of typing.
      **Closed**: the side panes ask for the shared scan instead of taking one
      (`refreshSidePanes` is a promise; `outlineOf`/`notesOf`/`marksOf`/`scanMarks`
      build over it). Fenced by `app/test/paneRefresh.test.mjs`; fixture shared as
      `tools/seferfixture.mjs`.
- [x] **#220** 52 `catch` blocks discard the error. **Closed**: 48 catches each carry
      a `// silent: <why>` marker; the other four answer through a call. Fenced by
      `app/test/silent.test.mjs` with the count asserted.
- [x] **#221** the compile answer re-declared in a cast. **Closed**: `WireCompileResult`
      + `dictionaryOf`, the cast named and narrowed. Fenced by
      `app/test/typecasts.test.mjs`.
- [x] **#222** `engine/src/lib.rs` was 6,231 lines and 160 items across three
      concerns — the file the app's own split (#22/#188) would have been made from.
      **Closed**: five cuts, moves only — `config.rs` (1,107), `geometry.rs` (651),
      `lang/` (946), `layout.rs` (975), `wire.rs` (482), and the 1,995 lines of unit
      tests to `unit_tests.rs`. `lib.rs` is **343 lines**: declarations, re-exports,
      font list, two Typst-argument helpers. No caller's path moved. Fenced by
      `engine/tests/structure.rs` (ceiling, "no types in the crate root", the five
      cuts present with their jobs, and a compile still answering at the old path).
- [x] **#223** eight exported values have no caller at all. **Closed**: 8 deleted,
      57 un-exported, `wasmpkg/` excluded by design. Fenced by
      `app/test/modulesurface.test.mjs`.
- [x] **#224** the TypeScript tree has no linter. **Closed**: eslint + typescript-eslint,
      98 findings → 0, the gate runs it. Fenced by `app/test/lintconfig.test.mjs`.

### Standing, waiting on their pay condition

- [ ] #163 multi-preview sync.
- [ ] #164 the `e.code` / `e.key` split.
- [x] **#208** the speller does not know 117 Hebrew words the interface itself
- [x] #209 the Linux apt dependency list is written three times and kept equal by a
      comment in each copy. Found by the `lamdan` triage. The fence is a set comparison
      across `packaging/linux.Dockerfile`, `ci.yml` and `release.yml`, with the
      Dockerfile's build-only packages named as the allowed difference. **Closed**
      (`app/test/aptdeps.test.mjs`): seven core packages asserted in all three,
      every extra named with its reason, and the reasons asserted not to outlive the
      packages. Mutation-tested by adding `libfoo-dev` to CI (named, `["ci"]` is
      not the failure — `["libfoo-dev"]` is) and by dropping `patchelf` from the
      release job (`got ["release"]`).
- [x] #210 verify the lamdan findings the triage could not open. **Closed** — all
      seventeen rows opened, and the whole external report turns out to have been swept
      between August and November: 37 of 40 closed since, three out of scope
      (`girsa-personal`'s log, two `sefer-crates` claims). Verifying produced three
      things reading alone would not: `convertNote` had **no caller** (deleted, its
      test's claims moved onto `retargetNote`), the CLI printed `✓ compiled` *before*
      counting the page images it could not write (`engine/tests/cli.rs` runs the binary
      as a process), and a failed settings write had no test at all
      (`settings.test.mjs` now breaks `localStorage.setItem`). One row — `forEach`'s
      throwing visitor — could not be given a behavioural fence, because the test runtime
      cannot reproduce the hang; it has the contract *and* a source rule, and says so.
      uses — `תצוגה`, `תפריטים`, `עדכון`, `מאגרים`, `חלוניות`, `אחסון`, `גיבוי`,
      `עימוד`, `העדפות` among them. Found by the starter's save line, which said `וייצוא` and was
      underlined. **Closed 2026-11-18** by the owner's answer, which was two layers
      rather than a longer list: the dictionary is now two halves —
      `lexicon-he-torah.txt` (Sefaria plus the curated supplement) and
      `lexicon-he-modern.txt` (Project Ben-Yehuda) — each complete on its own, each
      with its own switch, both on by default. The ordinary modern words arrived with
      the modern half; the product's own vocabulary is a third list
      (`lexicon-he-product.txt`, generated by
      `cargo run --example emit-product-words`) that no setting can turn off.
      `engine/tests/product_words.rs` holds all of it, including *every token of every
      sentence the product writes is accepted under all four combinations* and *the
      two halves add up to the union*.
- [x] #32 trim the test and documentation tower. Closed as overtaken: measured on 2026-11-17, `run.mjs`'s sweep is the only fence on the *value* of the two runtime counts (deleting it leaves a wrong README count green; `documentation.test.mjs` says at both sites that it cannot know them), and the `assert_same_page` oracles it wanted to redirect into already exist — `engine/tests/deferred_notes.rs`, eleven note layouts compared run for run.
- [x] #188 `main.ts` size (left over from #22): 3,536 lines against a target of about 1,500. **Done** — 1,457, in nine waves: `editorstate.ts` (`3f192a9`, the extension stack), `appheader.ts` (`3b75967`, the header), `settings.ts` (`9c68270`, the settings value write), `layout.ts` (`32d401d`, the window composition), `boot.ts` (`e70bfaa`, the boot sequence), `editorcommands.ts` (`fecd114`, thirteen structure commands), `settings.ts`+`layout.ts` (`0594358`, the setting reader and the chrome rebuild), `actionsurface.ts` (`50f1d3a`, the action table and dispatcher). Wave 3 bought separation rather than subtraction — the settings change set stayed in main because moving it closed 28 import cycles. `test/runner.test.mjs` now asserts `main.ts` stays at or under 1,500 (`53a296d`). `installHooks` (187 lines) is still in main but no longer holds its size up. Every new module is imported by a test rather than grepped.

## M0 — Green and honest

Exit: CI on `main` is fully green, and every check that CI reports actually ran.

- [x] #189 desktop shell job is red: the webview never reaches `setup` on the runner. #171's layers 1–2 and its reporting are done (`37cd10f`), which is how this was narrowed to the webview rather than the page. The failing run now collects WebKit's own log by itself — a forced timeout measures `app.err.log` at 0 bytes against 2,525 with the webview's logging on. **It was the session bus.** WebKit's log was 629 bytes and none of them from WebKit, so the milestones (`6332c3b`) were added and said `run` twice and `built` never: the shell was inside `tauri::Builder::build()`, whose first plugin is `single_instance` and whose first act on Linux is to reach a session bus a bare runner does not have. `dbus-run-session` around `xvfb-run` (`b6cd646`) turned the job green in run 44159670457, 70s, whole run green.
- [x] #171 the umbrella #189 was carved out of. Its remaining scope was #189, which the session-bus fix closed (run 44159670457 green); this closes when the owner closes #189.
- [x] #193 the measurement layer assumes Linux three ways: the gate skips `shell-clippy`/`shell-tests` on Windows although both pass there (measured), the render check refuses to start where a display always exists, and it looks for `app` rather than `app.exe`. Together: no shell check at all on the owner's main platform.
- [x] #190 the render check deletes its evidence and the CI job uploads none. Fix this before #189 is chased any further, or every attempt costs a push and returns one warning line.
- [x] #191 `render_probe` writes the boot record only when the measurement path is set, so "did a window ever open" is the one question it cannot answer alone.
- [x] #192 `renderEnv`'s `platform` defaults to the caller's machine, so a test that omits it asserts about the runner and stays green there.
- [x] #187 gate sweeps read workflows as lines, not as a graph. The parser landed in 7ed8d69; it now reads both matrix spellings and reports what it could not understand (`ad52d40`).
- [x] #186 the "Run it" step in `release.yml` is broken on Windows under pwsh. Anchored on `$GITHUB_WORKSPACE`, the Windows leg runs it under `pwsh`, and the gate refuses a bare relative path (`818d4e5`).
- [x] #198 the assembled app's two export checks still wait for a Playwright download, which #127 removed. Fixed in `.github/scripts/acceptance.mjs`: the export steps install a `ksav_save_export` stand-in (so the *desktop* route runs, which is the one that ships), decode the base64 body and assert a PDF, the filename and the dialog's filter — then remove the stand-in so later steps are a browser again.
- [x] #140 (the audit index) — **closed**: all seventeen children (#141–#157) verified closed one by one; the two residues that remain are #163 and #164, in the Debt section above by design.
- [x] #188 `main.ts` is 3,536 lines against a target of ~1,500. **Closed** at **1,473**:
      the waves were done by the other session (3,536 → 1,457, ledger in the issue), and this
      pass verified the resolving test *is* a fence rather than a number in a file — padded
      `main.ts` to 1,535, watched `runner.test.mjs:137` print `got false`, restored. The
      issue's own second note outlived its resolving test and is **#212**: seventeen test
      files read `main.ts` as text and nine of those fences go silently vacuous when the code
      moves. `installHooks` (188 lines) stays, deliberately.
- [x] #212 seventeen test files read `main.ts` as text, and the **absence** fences among
      them go silently vacuous when the code moves. **Closed** (`80c3fd4`): the rule is now
      *no test asserts a pattern is absent from `main.ts`* — absence is a claim about all of
      `src/` (`test/source.mjs::nowhere`) — six fences converted, and `test/fences.test.mjs`
      enforces it with an exemption list that can only shrink. Mutation-tested both ways.
- [x] #214 the hostile-input corpus was hand-written. **Closed** (`e51b140`):
      `engine/tests/fuzz.rs` generates 800 documents in ~2.6 s (two families, seeded LCG, the
      opening vocabulary taken from `commands::COMMANDS` rather than copied), asserts a
      verdict for each *and* that a diagnostic's line and column are inside the document, and
      a one-off release sweep of 10,000 found no panic and nothing slower than 39 ms.
- [x] #216 the editor's scanner had no test on documents nobody wrote. **Closed**
      (`app/test/scanfuzz.test.mjs`): 300 generated documents, every node/group/comment/frame
      range inside the document and between its own delimiters, `parent`/`children` agreeing,
      determinism, no throws, plus the anti-vacuity counts (2,447 calls) and a bounded-cost
      check. Mutation-tested: `nodes[0].to = text.length + 1` reddens with the seed named.
- [x] #215 four services answer a failure in three different wire shapes (`jump` `{}`,
      `reveal` `{"points": []}`, `places` `{"places": []}`, `spell`/`suggest` `{error}` with no
      `ok`, the rest `services::error_json`). Measured by `engine/tests/fuzz.rs`, which sends the
      same garbage to every service in the registry and asserts only what is true of all of
      them. The uniformity decision was the owner's, because the wire is a contract with the
      installed app — taken and landed as `Reply`; see the audit entry above.
- [x] **#213** a 166 KB document of brackets costs two minutes of CPU: Typst's markup parse
      is quadratic (release, re-measured: 10,000 stray `]` 1.81 s, 20,000 9.89 s, 40,000
      55.3 s; 20,000 balanced pairs 1.68 s; a real 563 KB sefer 0.22 s) and nothing here had
      a compile budget. **Closed**: `engine/src/shape.rs` refuses two measured shapes before
      any work is done — more than 200 stray closers (each is also an error, and the curve is
      worst there), or more than 48,000 bracket characters (7× the largest real document
      measured). Both sentences name the count in both languages. The *wait* is now the
      writer's too: `settings.compileBudgetS` (empty = the build's own number, so an
      operator's `KSAV_COMPILE_TIMEOUT_MS` still reaches everyone who never asked). Fenced by
      `engine/tests/budget.rs`: 160,000 stray closers answer in milliseconds with **one**
      sentence; 20,000 balanced pairs still lay out; both ceilings asserted from both sides.
- [x] #22 (the `main.ts` split) — **closed**: 1,490 lines against a 1,500 fence in `runner.test.mjs`, nine waves, all under #188.

## ◆ D0 — Do we decide the UI and backend direction now?

Recommendation: **no.** You can't judge a frontend rewrite (#117, #42) or a
second typesetting backend (#184) until you have used the current app
daily for a few weeks. What D0 settles now:

- Freeze large changes to the current UI chrome. M2 fixes only. **One exception, on the
  owner's call (2026-11-23):** the shell wave (#233, `docs/ui-architecture.md`). It
  is allowed because its substance is data (one action list, one menu home per action,
  placements, the writer's ribbon), and spec §12 makes that data the spec for whichever
  frontend D1 picks.
- The window model (#138) and the document model (#128) are settled in M2,
  because any future frontend needs the same answers.
- The real decision is D1, after M2.

If the answer is "decide now", jump to D1 and come back.

## M1 — Release v0.2

Exit: a tagged v0.2 with installers that a clean Windows machine and a
non-Nix Linux machine can install and launch, and the UAT fixes confirmed in
the real app.

- [x] #133 Windows: clean build from scratch, plus a smoke test of the packaged app (launch, open, save, export).
  Done for a clean clone on 2026-11-17: `tauri build` → NSIS → silent install → Start-menu shortcut → a window with a bound desk. Two findings filed on the way: #194 (the installer cannot be driven from Git Bash) and #195 (a stale shortcut is silent, which is UAT 28's symptom). The owner's own machine still needs the last acceptance line.
- [x] #134 verify UAT items 2, 3, 4, 5, 10, 12, 16, 17 in the real app, not only in tests.
      **3 done** (`7a46dd9`): the prose chip's state was colour-only, so `aria-pressed` was added where the
      chip is declared and `acceptance.mjs` now presses it twice in the assembled app and asserts the class,
      the attribute and the glyph agree (882 checks, green).
      **2 measured, not verified**: a click that moves the caret now lands correctly — the pages follow, a page
      is left on screen, the ends do not overshoot, the first heading returns to 0 — and, after #211, a second
      click on the heading the caret is already on moves nothing.
      **UAT 5 measured** (English-layout shortcuts): drove the built app with keydowns whose `key` and `code`
      disagree in both directions — the right keycap with the wrong character fires, the right character on the
      wrong keycap does not, a bare keycap is nobody's binding, and one press is one action — plus four unit
      fences in `bindings.test.mjs`.
      **UAT 12 measured**: typed single characters into the built editor — `[` auto-inserts its closer, typing
      the closer skips instead of making `[]]`, same for `()`, `$…$` doubles never, and `"` ships unpaired
      (geresh is a letter); five unit fences hold the wiring (`closeBrackets()` and its keymap, the pair list
      fed from the two switches, both defaults). **4 verified.** **UAT 10 closed** — reproduced in a built app and still broken, fixed and fenced (#134 comment, `1612d32`); that fix also caught a second case, Enter inside a *string* in a bullet. **5 verified.** **Items 4 and 16 closed** (`b1af321`) — `importui.test.mjs` presses *File ▸ Import from Word* and *▸ Import from Org* in the built app with only the OS dialog stubbed: a real `.docx` imports and names the document, bytes that are not a zip report and leave the open document alone, an empty file reports, an Org with no text either imports empty or refuses, a cancel says nothing; no crash panel in any case. **Item 17 closed** (`94c30d2`) — `girsaabsence.test.mjs` calls the three routes with no Girsa (sentence, prose untouched, selection untouched), and requires a Girsa that *has* a loopback and cannot reach it to say something else; a structural sweep over `src/girsa.ts` requires every entry point that awaits the service to ask `sourcesOf` first and report, while the fire-and-forget courtesy stays silent and is asserted silent. **8 verified**, issue closed. The drive also found and #231 was filed and fixed for it: an import's report — *"did not come across: …"* — was overwritten by the compile's `✓ N pages` a moment later, so the one sentence `importAs` exists to produce never reached the writer; `runtime.holdStatus` holds it until the next edit.
- [x] #194 the NSIS installer cannot be driven from Git Bash: `/S` is mangled, the run hangs with no output and installs nothing. Fixed (`67b165e`): `gate.test.mjs` refuses a bare invocation and `docs/troubleshooting.md` says what to run instead.
- [x] #196 the render check calls a single-instance handover "the webview did not start": a clean exit 0 is read as a webview fault, and that is the same sentence #189 is open about.
- [x] #195 a stale shortcut or `ksav://` registration pointing at a deleted binary is silent — the measured shape of UAT 28's "the shortcut did not open Ksav".
- [ ] Generic Linux artifact from `ksav/packaging/build-linux.sh` (AppImage or tarball), tested on a non-Nix distro.
- [ ] Windows NSIS installer built by `release.yml` and attached to the release.
- [ ] Tag v0.2.0. **Notes written** — `docs/release-notes-v0.2.0.md`, linked from the
      README's "Where to go". What remains is the tag itself, which waits on the two
      artifacts above. Every claim in the notes was checked against a closed issue or a
      measurement; the "Known limits" section names the four holes rather than closing
      the release over them.

## M2 — Reliable for your own notes

Exit: the owner has used ksav as the only tool for real notes, on both NixOS
and Windows, for **two weeks** without losing text, and the second UAT pass
(#14) passes.

- [x] #138 Emacs-like open/window model: `openIn` now defaults to `current` (`C-x b`), the three answers are stated as Emacs commands at the setting, the funnel and `docs/start-here.md`, and `tabs.showing`'s focused-pane rule is written down and asserted. Hands-on confirmation of the felt behaviour rides with #134.
- [x] #211 re-clicking the heading the caret is already on moved the pages 157px. Not a reveal that moves twice:
      the jump never asked the preview for an answer. `outlineJump` decides the caret and the source pane; the
      preview was only revealed in two of the three modes, so the default mode fell back to linked scrolling — a
      *proportion* of the source's scroll, 1075 where the heading printed at 1232 — and a second click finished the
      journey because a caret follow (which was itself being dropped by the scroll floor the mirror had claimed)
      got there. `goToOffset` now always asks, and a floor defers the follow instead of discarding it. 920
      acceptance checks assert the idempotence in the assembled app.
- [ ] #128 document identity: one Documents menu instead of two (Documents and File), and labelled rows instead of icon-only rows. Keep the shape compatible with #117. **Code done** (`84b11be`, `eea216b`): one `docTitle()` for the name line, `docFileState` for its honest suffixes, the Documents taxonomy as data with a persistent `⧉ / ⌄ / ×` legend, and *File ▸ New document* removed rather than marked, on the owner's call. Open for the owner's reading pass — the last acceptance line is a judgement about reading on screen, which no tool here can make.
- [x] #127 native PDF destination picker on export — every export asks `saveExportAs` (#127), desktop dialog + browser fallback, cancel silent.
- [ ] #126 semantic navigation: word and paragraph motion skips Typst markup. **Code done** (`4283990`, `6cb2029`): `motion.ts` (the boundary function, fenced row by row from the spec) and `sourcemotion.ts` (the `sourceMotions` setting, `Ctrl`+arrows, `Alt`+arrows as the raw escape, `Shift` on the same stops). Shipped as `"raw"` on purpose — flipping the default is a felt judgement, and it is one line once the owner has arrowed around a document with it on.
- [x] #183 `assembleScan` allocates on every keystroke. Measured 2026-11-17: 3.3 ms per keystroke at a 235-page sefer and 18 ms at 993 pages, and removing the report's top line (`byStart.set`, 15,390 insertions) moves the scan by less than the noise in either direction — so the cost is allocation across the whole scan and `lexCore`, not the assembly's structures. No lag at any realistic size; not rewritten.
- [ ] Data safety, verified on both platforms: save, autosave, crash recovery, a full disk, a read-only file, and a file changed outside ksav. File an issue for each failure here.
  **Windows pass, first half done** (`ced99ae`, #201): a save the disk refused reported
  itself as "the dialog was closed" on both tiers — `saveTo` swallowed the shell's
  `path-not-allowed` refusal and the disk's `os error 28`/`5`/`30` alike, and `saveAs`
  put its write inside the `catch` that means "dismissed". Both now name the cause,
  with sentences for a full disk and a read-only volume that did not exist. Fenced at
  the seam with the real `invoke` and a real read-only file.
  **Linux half, done as far as this machine reaches**: `the_disk_s_own_words_reach_the_writer_verbatim`
  (`src-tauri/src/lib.rs`) asks the operating system first and then requires our writer
  to produce **the same string** — so it asserts *verbatim pass-through* rather than
  merely "some error", on any box at any privilege, and it is the Windows test too. It
  exercises a read-only file (EACCES, not EROFS: the volume is fine and the mode is not),
  a read-only directory, and a file whose folder was renamed (ENOENT). The old version
  of this test tolerated `Ok(())` with the note *"root ignores the mode"*, which is why
  "the Linux half is untouched" was true: on a non-root box it asserted something, on
  root nothing, and nothing said which. And `diagnostics.test.mjs` was missing the two
  sentences Linux actually produces — `Permission denied (os error 13)` and
  `No such file or directory (os error 2)` — so a Save-As into a renamed folder read
  "failed · details on hover" in English.
  Still needs the owner's machine: a crash under `taskkill` and the outside-change
  prompt seen by a person.
  **The full disk is done** (`5a109ef`, #230 closed). It took a privilege the box did
  not have: `sudo mount -t tmpfs -o size=512k tmpfs /tmp/ksav-full` (EFBIG via
  `ulimit -f` is a different errno and a different sentence, so it proves nothing). The
  test's fourth case now fills that tmpfs and asserts both halves — the operating
  system's sentence arrives verbatim, and the file that was already there still holds
  it. It runs where a tmpfs has been mounted and says so loudly, with the command,
  where it has not.
  **And the case paid for itself on its first run (#232, `5a109ef`)**: `write_allowed`
  used `std::fs::write`, which truncates before it writes, so a save that ran out of
  room left the sefer holding the first few kilobytes of the version that failed to
  land and nothing of the version that was there. Measured on the full tmpfs, then
  fixed at the root — every document write now goes beside and is renamed over
  (`write_beside`), with the target opened for writing first so a read-only file is
  still refused by the operating system rather than silently replaced by a rename. The
  other five cases could never have shown it: they all fail *before* the file is
  truncated.
- [ ] #14 second human UAT pass by the owner, on the real installed build.
- [ ] Tag v0.2.x as the "daily driver" release.

## ◆ D1 — Frontend × backend architecture

When: after M2's two weeks of daily use, before anyone else is invited.
Inputs: the M2 usage notes, plus one small spike for each serious option.
Decide together, because the frontend and backend choices constrain each other:

- Frontend: keep the current CodeMirror/Tauri app, or a native shell around the Typst
  engine (#42). Wordcraft egui (#117) is **closed as not viable as written**: its UI
  edits Wordcraft's own document model, so it stays reference material only.
  The shell itself is decided and being built (#233): its spec is
  [`docs/ui-architecture.md`](docs/ui-architecture.md) and its decision is
  `decisions/2026-11-23-the-shell-is-built-from-placements.md`. Whichever frontend wins
  inherits it.
- Workflow and views: Leo-style outline workflow (#11), prose-only view (#118).
- Backend: Typst only, or add LuaLaTeX + reledmac / ConTeXt, and a structured editor (#184).

Output: a dated record in `decisions/`. If the result is a rewrite, insert
the rewrite as its own milestone here, before M3, and re-scope M3 to audit the new
code instead.

## M3 — Audit

Exit: a fresh audit with every finding either fixed or filed in the Debt
section at the top of this plan.

- [x] Engine (Rust/Typst) audit: correctness, panics on bad input, and export fidelity.
  Panics: `engine/tests/hostile.rs` — 33 malformed documents, each required to come back
  as a verdict (a compiled page or a non-empty diagnostic), with the input printed if one
  panics. It found two real defects. **#205** — `#טבלה(עמודות: 999999999)` asked for 34 GB
  and aborted the process, one click away from a share fragment; the prelude refuses 0 and
  anything over 256 now, with a diagnostic that names the limit (`5cfaef7`). **#204** — a
  *panicking* compile was reported to the writer as a slow compile still running in the
  background, and it left its slot charged forever, so a few bad documents turned every
  later keystroke into "the server is busy" (`e70ca9f`). Correctness and export fidelity:
  `ksav/app/test/integrity.test.mjs` (#199), the measured SVG vocabulary in `svg_output.rs`, the
  deferred-note resolver tests. Nesting depth on pathological input is stated in
  `hostile.rs` as an open question rather than run — a stack overflow is an abort no test
  can catch.
- [x] Tauri shell audit (it was not covered by the #140 sweep): IPC surface, file-system scope, updater. `AUDIT-shell-2026-11-17.md` — capability grant is `core:default` only, every file op keyed on a dialog-picked path (normalized, traversal tested), `ksav_call` reaches the seven Native services but bounded by fixed git args and `protocol.ext.allow=never`, preview SVG sanitized by allow-list, prose tables escape per character, one CSP file fenced by build.rs with `https://api.github.com` as the only egress. Remaining work in it is #131 (signed builds).
- [x] Security: what an opened document can make the app do (links, includes, paths).
  `AUDIT-documents-2026-11-17.md`. No filesystem: the compiler is built with static
  resolvers only and the four escape routes (`#import` by path, a sibling import,
  `#read()`, `../../../` out of the package root) are already refused by test. Assets
  arrive as bytes behind `diagnose_name`, and the preview's SVG goes through an
  allow-list generated from a measured vocabulary. Two findings: **#202** — a
  document's `#link` was a navigation with the scheme of its choice, restricted to the
  web by the sanitizer in `81c8d5e` and then **closed** (`659ebd8`): the surviving
  link was still a navigation, so the click is now intercepted (`app/src/openlink.ts`)
  and handed to the shell (`app/src-tauri/src/open.rs`), which opens it in the
  system's browser after re-checking the same four schemes. Three ends, one policy,
  and each end refuses rather than trusting the one before; **#203** — two decompression routes (`unzip` for a `.docx`, inflate for a
  share link) let the input decide how much memory to allocate, now bounded as chunks
  arrive (`e4e5b88`). Unverified and recorded there: where a link goes in the installed
  build, and the runtime CSP header.
- [x] Data integrity: round-trip every saved format; check that nothing is silently dropped.
  The seven formats, and which code owns each. **Org, Markdown, plain text** are
  `ksav/app/src/interchange.ts`'s: `ksav/app/test/integrity.test.mjs` compares every word
  of the engine's own 14 documents against a *masked* oracle, and found two silent losses
  (#199: `inner()` read `bodies[0]` only; a quoted note name never matched its body).
  **HTML and Word** are Typst's HTML backend under two extensions: the structural claims
  are in `engine/tests/assets.rs` (`<h1>`, `<strong>`, `lang`, `dir`, no `<svg` fallback)
  and `every_body_of_a_multi_body_command_reaches_the_word_export` asks each multi-body
  command for its *last* body — a verse, a definition, a second header cell, a note — in
  one document, which is the shape that would lose a body if the prelude's rendering
  drifted. **PDF** is Typst's own and needs no fidelity test. **`.ksav` itself** round-trips
  through `engine/tests/docfile_oracle.rs`, and the `.docx` import route is fenced in
  `ksav/app/test/docx.test.mjs`.
  Started from the export side (`3662bb4`, #199): a comparison of every prose word a
  document prints against the words an export contains, over the engine's own 14
  documents, found two silent-loss defects — `#פסוק[ref][verse]` and
  `#הגדרה[term][definition]` exported only their first body, and a quoted
  `#note_named["…"]` kept its quotes where its `#note_body["…"]` did not, so the note
  was deleted on export and called broken by the lint. Both fixed, fenced in
  `ksav/app/test/integrity.test.mjs`. The **import** half is fenced command by
  command — `docx.test.mjs` and `org.test.mjs` over constructed XML and Org, not a
  file saved by Word. The document-level check on that side now exists as an
  **out-and-back**: every engine document exported to Org and re-imported, word for
  word. It found **#206** — an uncited Org note was deleted with its paragraph, and
  `dropped` said nothing (`acbf61b`). `odt` is not an import this application
  offers; the plan's earlier "docx/odt" named a format that does not exist. #200 holds the
  formatting follow-up the export fix surfaced.
- [x] Run `lamdan` across the whole repo once and triage its findings into this plan. **Done 2026-11-18** (`lamdan/TRIAGE-2026-11-18.md`): a verdict per finding taken by opening the file each one names — 40 external + 12 duplication + 13 ranked. Most were closed by later sessions and nobody had gone back to the reports to say so. **One live finding** became **#209** (the Linux apt list is written three times and kept equal by a comment, not a fence); the rows I did not open are recorded as *unverified* rather than assumed fixed and became **#210**, with 6.1 (*an English document falls out of the note-layout path*, CONFIRMED High) named first. The reports' own thesis — *fixes the instance in front of it and does not sweep for the siblings* — is answered: the siblings were swept, one class at a time, and the missing act was closing the loop.

## ◆ D2 — Before others use it

Decide: product identity and name (#39), Girsa interop (#37, #38), who the first
users are, and how they get the app (download page, auto-update, support channel).

## M4a — Closed beta (technical friends), v0.3

Exit: three or more friends have each written a real document, and their reports
are triaged into this plan.

- [ ] Signed or at least checksum-verified builds, with an auto-update path.
- [x] A way to send feedback from inside the app (or a clear link to it).
  A clear link: the About section of the settings drawer opens with what helps in a
  report, the issue tracker as its own visible text (copyable when a click does nothing —
  the shell's handling of an external address is #202's open half), and the version
  directly under it. Both languages. Fenced in `ksav/app/test/settings.test.mjs`, including
  that the note's "no telemetry" is true of the code. See the commit `5c364ff`.
- [x] A one-page "start here" guide for the first document.
  `docs/first-document.md`: open, type, save, export, and what to look at when the page
  does not change. Linked from the README's "Where to go" table and from the top of
  `docs/start-here.md`, which is the whole product rather than the first five minutes.
  Every claim in it is checked against the code: the starter document, `Ctrl+S`, the
  thirty-second autosave that stands down on a file changed elsewhere, the title-bar dot,
  the File menu's export and print routes, `F1`.
- [ ] Tag v0.3.0 and invite the friends.

## M4b — Public release (non-technical Hebrew writers), v1.0

Exit: someone who is not the owner completes #14 alone, from install to export.

- [ ] Code-signed Windows installer (no SmartScreen wall).
- [x] Onboarding inside the app: an example document and the first steps, in Hebrew.
      **Done, and it was half-missing.** `app/src/starter.ts` has held a Hebrew welcome
      document and an English one (chosen by interface language, swapped while still
      untouched) since the first screen was written, and the welcome overlay lists all ten
      templates in two labelled groups. What it did *not* say was how to **keep** what you
      type: three bullets about exploring, none about saving. Both starters now open with
      *save with `Ctrl+S`, export under the File menu*, which is the first thing a new writer
      needs and the one thing whose absence teaches them the program loses work.
      And the starters had **no compile behind them** — not in `docs.test.mjs`, not in
      acceptance, which starts from `sefer`. New `engine/tests/starter.rs` reads both
      template literals out of the TypeScript (no copy that could compile while the shipped
      one does not) and asserts each one compiles, puts its own first line on the page, and
      names the save chord and the export menu. Three assertions; each mutation-tested
      (`#nosuchcommand`, `Ctrl+S` removed, the title words changed) reddens the one it
      belongs to.
- [ ] A help system and an error-message pass written for non-technical readers.
- [ ] #14 run by an outside tester.
- [ ] Tag v1.0.0 and publish.

## ◆ D3 / Features — after beta feedback

Order these by what beta users actually asked for. Below is the current guess.
Decide #184 here if D1 deferred it.

- [ ] #43 top/bottom streams
- [ ] #65 Vilna-style wrap layout
- [ ] #64 commentary ordering
- [ ] #68 headings into commentary
- [ ] #69 templated headings
- [ ] #66 smart navigation
- [ ] #44 nikud/shemos handling on export
