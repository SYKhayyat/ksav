# Handoff

The working brief for whoever picks Ksav up next. Read it start to finish before
touching anything; it is short on purpose and every paragraph is here because
something went wrong without it.

## Current handoff — 2026-11-23 (the audit is closed and #202 with it)

The 2026-11-19 debt audit (`PLAN.md` §Dept) is **fully answered**: #218–#225
filed, fixed, fenced, pushed and closed, one at a time. The work of the last
sittings, in the order it was done:

- **#224** eslint + typescript-eslint, 98 findings → 0, never silenced; the gate
  runs it as check 13.
- **#220** every silent `catch` carries a `// silent: <why>` marker; the count is
  the fence.
- **#221** the compile answer's cast named and narrowed (`WireCompileResult`).
- **#223** eight dead exports deleted, 57 un-exported, the seam fenced.
- **#219** the side panes *ask for* the shared scan instead of taking one — the
  pane refresh went from ~86 ms per 200 ms of typing to one scan shared four ways.
- **#218** the issue said pagination was superlinear; the measurement said the
  layout is flat and the seconds are page **writing**, which now runs on every
  core (`pagesvg.rs`). The diagnosis in the issue was half wrong; the commit says
  so. `engine/tests/fuzz.rs` had not compiled since #215's commit because nothing
  ran the whole suite by name — fixed.
- **#222** `engine/src/lib.rs` 6,231 lines → **343**: five cuts (`config.rs`,
  `geometry.rs`, `lang/`, `layout.rs`, `wire.rs`) plus the 2,011 lines of unit
  tests to `unit_tests.rs`, all moves, no caller's path moved (`pub use`
  re-exports). Fenced by `engine/tests/structure.rs`. The app's reader that
  sliced `pub struct DocConfig` out of `lib.rs` by text moved to `config.rs`.
- **#215** a `Reply` type at the service seam: `ok(payload)` / `fail(message)` /
  `relayed(text)` — the last one *parsed and required to be an object*, because
  it is the one place somebody else's JSON reaches this wire. `Reply::json` is
  the only envelope writer, in all four bindings, so a service cannot ship a
  shape of its own choosing; `app/test/wire.test.mjs` and `tests/reply.rs` (96
  answers driven from the registry) hold the wire.
- **#217** a separator-splitting fence that caught a real wire bug on the way.
- **#227 and #228** the render check can run on this machine, and it immediately
  paid for itself twice. #227: the check pinned X11 by deleting `WAYLAND_DISPLAY`,
  which pins nothing and disarmed the app's own guard — it now asks for
  `GDK_BACKEND=x11` the way `main.rs` does. #228: with that fixed, check 12's only
  remaining complaint was `the ribbon has no command groups`, and it was right —
  `commands` and `templates` relayed a JSON **array** into an envelope whose one
  shape is an object, so `Reply::relayed` had refused them from every transport
  since #215. `inbox` was the third list, found by the new test rather than by
  reading. The check now passes here: `dPR 1, viewport 1280×708, header 137px,
  ribbon 8 groups with no overlap`.
- **#213** the bracket ceiling and the writer's own budget. A 166 KB body of
  stray `]` cost two minutes of CPU (re-measured on this tree: 10,000 stray
  1.81 s, 20,000 9.89 s, 40,000 55.3 s; a real 563 KB sefer 0.22 s) and nothing
  bounded it. `engine/src/shape.rs` now refuses two **measured** shapes before
  any work happens — >200 stray closers, or >48,000 bracket characters — and the
  wait is the writer's: `settings.compileBudgetS` (empty = the build's own
  `KSAV_COMPILE_TIMEOUT_MS`, so an operator's raised budget still reaches
  everyone who never asked). Fenced by `engine/tests/budget.rs` and
  `app/test/compiletime.test.mjs`. **Honest limit**: deleting the refusal call
  from `layout_document` cannot be shown as a red in the test profile — the
  fence just hangs for longer than a 15-minute timeout, which is the defect.
- **#202** a link in a document is no longer a navigation. The sanitizer had
  already limited the schemes; a *surviving* `https:` link still replaced the
  editor (and, in the desktop build, asked the webview to load a new document
  inside the window that carries the IPC bridge). Now `app/src/openlink.ts`
  intercepts the click — walking up from the hit-area `<rect>`, bounded by the
  page's own `<svg>` — and hands the URL to `app/src-tauri/src/open.rs`, which
  re-checks the same four schemes and opens the system browser. One policy,
  three ends. **Limit**: the click path was not exercised in a real webview; this
  box's WebKitGTK session reports a negative `devicePixelRatio` (the #103
  defect), so the gate's `desktop render scale` check fails here before and
  after, verified by stashing.

**Nothing is waiting on a decision any more.** #213 (a compile *budget* — how long
may the engine spend before it refuses?) was the last of them, and the owner's
answer was *let the writer set it*: the shape is refused by a measured ceiling and
the wait is a settings box.

Of the older ledger: #171 is an index page whose findings were all actioned
(#189 is layer 3); #140 is similar, with #163 (2-preview desync) and #164
(`e.code`/`e.key`) left as pay-conditioned residues. The decision on closing
those two index pages as superseded is still the user's.

Two traps still cost real time if forgotten:

- `node test/run.mjs` **refuses to run while generated fixtures are stale** and
  prints no `FAIL` — check exit codes, not output.
- `spans.ts` memoises four scans keyed on the text; timing the walk over the
  same four strings measures the memo (0.08 ms for a 634 KB document). Use eight
  texts to evict.
- `ksav/app/src-tauri` cannot `cargo check` in a bare shell: it needs GTK and
  `glib-2.0.pc`. Use
  `nix develop .#desktop --command bash -c "cd ksav && node tools/gate.mjs shell"`

**And one more, found the hard way:** the Chromium path this file used to name for
`KSAV_CHROMIUM` was garbage-collected out of the store, and `browserlang.test.mjs`
does not fail when that happens — it **skips**, which the runner reports as `1
file(s) asserted nothing`. On this box the working paths are
`/nix/store/b3zmxxdfbv1q13fy1vkgxaszmnkwkf0z-chromium-151.0.7922.137/bin/chromium`
and `google-chrome` in the user profile. Check `ls -d /nix/store/*chromium*/bin/chromium`
before believing a green editor run that says 0 browser assertions.,
  which also runs the shell's own tests.

Counts live in `ksav/README.md` and are fenced by the suite: 14,277 editor
assertions across 165 files; 1214 engine tests across 91 binaries.

## Handoff — 2026-11-18 (the audit closed, and three fuzzers)

The lamdan report that `PLAN.md` had been carrying is **fully answered** (#210):
all seventeen rows the first triage could not open were opened, and the answer
was uniform — the external report had been swept between August and November,
one class at a time, and nobody had gone back to say so. Verifying them, rather
than reading them, turned up three things: `convertNote` had **no caller** and a
test fencing it (deleted), the CLI printed `✓ compiled` before counting the page
images it could not write (fixed, and `engine/tests/cli.rs` runs the binary as a
process), and a failed settings write had no test at all (now it does).

Also closed this sitting: **#188** (`main.ts` is 1,473 against its 1,500 target,
and its fence was checked to still bite by padding the file), **#212** (absence
claims about `main.ts` now have to be whole-source claims, enforced by
`test/fences.test.mjs`), **#214** and **#216** (two generated corpora —
`engine/tests/fuzz.rs` and `app/test/scanfuzz.test.mjs`).

**Two issues were waiting on a decision, not on work, and both were answered.**
#213 (a 166 KB document of `]` cost two minutes of CPU) was closed by a measured
bracket ceiling plus a writer-settable budget; #215 (four services answered a
failure in three wire shapes) by the `Reply` type at the service seam.

**One trap, recorded because it cost an hour.** `node test/run.mjs` *refuses to
run* while generated fixtures are stale, and the refusal prints no `FAIL` — so a
`grep` for failures shows only the previous green run, and a mutation test looks
proven when nothing ran. Check exit codes, not output.

Counts live in `ksav/README.md` and are fenced by the suite itself; the dated
record is in `SESSION_LOG.md`.

## Handoff — 2026-10-28 (UAT sweep, #119–#120 closed)

The UAT.org sweep is under way: the user reported issues #119–#139 from
`ksav/UAT.org`, worked one at a time (root cause → plan with the designer
asked in full context → acceptance criteria → tests → fix → full gate →
commit → push → close with a real comment). Closed so far, this sitting:

- **#123** (note.paraInNote crash) commit `5fc4079` — the refactor had
  already healed it; the work was the eviction fence: note fixtures in
  `structure.test.mjs`'s CORPUS plus a focused paraInNote section, and a
  settled decision on the `list.paraInItem`/`list.paraInNote` claim.
- **#119** (caret-follow char-scale interpolation) commit `f6bc55a` —
  `withinBlock` + `interpolateAcrossLine` in `scrollmap.ts`, used by both
  `syncLinkedScroll` and `followCaretInPreview`; local `lerp` removed.
- **#120** (touchpad scroll, no app-level policy) commit `a29c5be` — the
  designed cap was **built and torn out** by decision: the shipped answer is
  the industry's, two halves. (1) `scrollpolicy.ts`: native deltas with one
  honest conversion (line deltas × the *surface's* own line-height, page
  deltas × the surface's own height), times the writer's typed
  `scrollSpeed` setting — default `1` (native), range `0.25–4`, step
  `0.05`, `numberRow` in the drawer + note, i18n keys both languages, read
  per event, guarded (`NaN`/`0`/negative → native, never scroll-up).
  (2) `overscroll-behavior-y: contain` on the six floating surfaces —
  `styles.css`. The editor/preview panes are named by NO surface (their
  wheel is CodeMirror's and `panescroll`'s) and also NOT contained, asserted
  both ways in `scrollpolicy.test.mjs` (31 assertions incl. both wiring
  fences). Two mutants killed (multiplier dropped: 3 red; guard dropped:
  4 red). Counts moved: **13,012 assertions across 130 files**, **145
  modules**, README rekeyed.

- **#170 filed** — the typewriter clause of UAT item 6 ("looks like
  typewriter mode is on even when unchecked") that no issue tracked. Static
  inspection found no bug; it needs the running app (toggle on → write →
  uncheck → does the look linger; and does a reload read the flag right).
  The user has offered to run ksav for this.

### The remaining order (from UAT.org mapping)

#121, #122, #124, #125, #127–#132 (exports/menus), #126, #133,
#135–#139, then **#134 last** (the 8-item verification pass).

### Two sessions are working this repo at once (2026-11-17)

Both agents push as `SYKhayyat`, so a comment's author says nothing. The
protocol that kept them apart on 2026-11-17:

- **Claim on the issue, in a comment, before starting** — the issue itself is the
  lock. Say what you are changing and which files; a claim nobody made is a
  merge conflict later.
- **Sign comments.** One session signs `— B`; unsigned means the other. It is a
  crude channel and it beats inferring an author from a voice.
- **`git fetch` and sweep issue comments at least hourly**, and always before a
  push. Committing on top of a stale `origin/main` that another session just
  moved is the one mistake that costs a revert.
- **An issue you are not taking is still an issue you read.** The 11-17 sessions
  found the same defect from two directions twice (#189's evidence sentence,
  #164's mechanism) because each was reading the other's comments.
- Leave research on an issue you are *not* holding, and say so explicitly in the
  first line ("not taking this — it is yours"). That is what stopped two
  sessions from both rewriting `render-check.mjs`.

### Working rules (unchanged, see the 10-22 handoff below)

- Environment: `nix develop /home/shaul/ksav [--command ...]`; full gate
  needs `#desktop` + `KSAV_CHROMIUM` — current path:
  `/nix/store/7y0iz98mpfkb18ww37gzy2sjvlha3cdg-chromium-151.0.7922.137/bin/chromium`
  (the 152 path in older notes is gone; re-fetch with
  `nix-shell -p chromium --run 'which chromium'` when GC eats it).
- Gate: tsc → build → full suite → README rekey → `node tools/imports.mjs`.
- Commit style: `module: summary — #NNN`. Design questions go to the user
  with full context before building; the user answers them.
- Mutant checks are expected in the closing comment for behavioural fixes.
- `.tmp-test/` regenerates from src at every run start — patch the *source*
  for mutant checks, never the generated chunk (silent no-op otherwise).

### Open questions

- The touchpad acceptance in #120's comment (item 3) wants a human on the
  machine that reported it; re-open if it disagrees.
- Two untracked UAT items may need new issues when reached: cursor side in
  RTL source, endnote spacing.

## Handoff — 2026-10-22 (audit closure)

The main.ts split (11 waves) and the post-split audit are both done: all
17 findings (#140–#157) are closed, each with its own commit, full gate
verification and a closing comment — #147 last, the wave-12 moves verified
in a browser against the live engine (see below).

### The state in one paragraph

main.ts is 3,751 lines and its header (main.ts:94) is the map of the whole
app — read it first. 139 modules, acyclic (`node tools/imports.mjs`). The
suite's counts live in `ksav/README.md`, where the fence holds them; do not
restate them here. The accepted debts are in
`decisions/2026-10-22-accepted-debts.md`, the single ledger the wave
records point at — eleven items, entries 4 (the Girsa poll and
onboarding) and 5 (the styles-panel per-tier merge) since paid; the rest
are filed as #158–#166. New fences added this sitting: `i18nkeys.test.mjs`
(every `t()` literal must be a dictionary key — it caught two live bugs)
and `lintkit.test.mjs` (the stale-document guard is written once).

### The last one closed: #147 (wave 12, part 2)

The two moves the ledger held open are done, and this time verified in a
running app, which is what the ledger said the debt was waiting for:

- **The Girsa handoff poll** lives beside the Girsa panel feature it serves
  (`src/girsa.ts`): `installGirsaPoll`, `takeArrivals`, the two cadence
  consts, with the hidden-check inlined (`hidden()`), exactly as #147's
  record prescribed — main's `tabHidden` stayed with the autosave it still
  gates. Verified in Chromium against the live engine: clean boot with no
  Girsa half, then a 60-event visibility/focus flurry (the exact trigger of
  the old duplicate-chain bug) with zero page errors and an editor still
  live afterwards.
- **Onboarding** lives in `src/starter.ts` beside the first screen it
  belongs to: `maybeOnboard`/`dismissOnboard`, cut by function-anchored
  spans, `wireKeys` and `runShortcutOutsideEditor` intact in main this time.
  Verified in Chromium: overlay shows on first visit with all templates
  offered (none cut to six), template click loads and dismisses, start-blank
  dismisses and empties the starter, Escape dismisses through
  `closePanel`, the flag is set by every exit, and the second boot is clean.
- **The header bar stays in main**, as #147 recorded — its three
  main-locals are the settings machinery wave 6 held, and wiring them would
  re-fatten ChromeWiring.

### The working rules (every commit, no exceptions)

1. Environment: `nix develop /home/shaul/ksav [--command ...]` for node/tsc;
   the full gate needs `nix develop /home/shaul/ksav#desktop` **plus** the
   transient `KSAV_CHROMIUM=/nix/store/liw3r9d2yk68c081lkpbkj2817ccpp0i-chromium-152.0.7977.82/bin/chromium`.
   If the path is gone (store GC), re-fetch: `nix-shell -p chromium --run
   'which chromium'`. Without it browserlang refuses to measure.
2. Per commit: `npx tsc --noEmit` clean → `npm run build` → full suite with
   KSAV_CHROMIUM → **rekey README's assertion count and file count** (the
   documentation fence compares them to the runner's tally; any assertion
   added or removed changes them) → `node tools/imports.mjs` acyclic →
   commit → push → close the issue with a real comment.
3. Fence discipline: when a fence reads a file for a claim and the claim
   moves, the fence moves in the *same commit* — and prefer whole-tree
   comment-stripped sweeps (the asyncaction pattern) over single-file reads,
   because #142 showed single-file prohibitions go blind without being
   touched.
4. Extraction discipline (this sitting's lesson): cut code by function-
   anchored brace-matching, never by walking doc comments; verify the cut
   with grep immediately; if a tangle compounds, `git checkout` the file and
   redo the one move — reverting is cheap, shipping a tangle is not.
5. Python heredoc scripts with regex/backtick escaping corrupted two files
   this sitting. Prefer small scripts with immediate `node --check`/tsc
   verification after every write.

### What is deliberately not on the list

- #152's two behavioural style items (tier-builder merge, default-rows
  migration) — need the styles panel open in a browser.
- #157's measured-at-scale perf items — need a 1,000-page profiling fixture
  first.
- The two garbled commit messages (`0bbabc0`, `2a6a767`) — left in history
  deliberately, recorded in the accepted-debts ledger.

### Earlier handoffs

## Handoff — 2026-10-14

The latest pushed `main` is `e65cc3f`. PRs #95, #97, #98, and #99 are merged;
#96 was already merged. The issue comments were added and GitHub reported #31,
#33, and #35 already closed when close commands were issued. The shared
checkout is clean.

### Completed this sitting

- #20 / PR #95 merged at `a6572c0`; #35 / PR #97 merged at `a2c86b9`.
- #33 / PR #98 merged at `c46d209`; #31 / PR #99 merged at `e65cc3f`.
- Required remote CI passed for the merged PRs, including editor, engine,
  formatting, macOS engine, browser engine, assembled app, Emacs, and desktop.
- Focused evidence: notes corpus 22 passed, chrome 154 passed, and docs/readme
  241 passed.
- Issue #19 intentionally remains open: no real asynchronous Rust/WASM scan
  service consumed by the editor was implemented.

### Next action

There is no unfinished implementation from this sitting. If resuming the issue
queue, read `PLAN.md`, inspect open issues, and preserve the #19 boundary above.

### Known checks and environment limits

- CI editor counts were refreshed after each merge from measured runs.
- Local runs may omit `browserlang.test.mjs` because Chromium is unavailable;
  the corresponding CI browser-engine and assembled-app jobs passed.

### Completed and on `main`

- **#56 asset cache digest** — SHA-256 content keys are computed consistently in
  Rust and TypeScript; Base64 input rules are shared; claimed keys are verified
  before caching; old engines fall back to byte-bearing requests; legacy
  document/storage keys migrate safely. Decision record:
  [`decisions/2026-10-11-shared-assets-earn-a-sha-256-digest.md`](decisions/2026-10-11-shared-assets-earn-a-sha-256-digest.md).
- **#7 keyed DOM updates** — panel, preview, history, palette, and Git surfaces
  use keyed reconciliation with retained identity and state. Middle-page
  insertion, shape-changing rows, duplicate palette keys, first-row selection,
  and unmanaged history controls are fenced. Decision record:
  [`decisions/2026-10-11-keyed-dom-reconciliation.md`](decisions/2026-10-11-keyed-dom-reconciliation.md).

Both changes were focused-tested locally and passed the complete remote CI. The
### Preserved unfinished work

- **#19**: `origin/issue-19-rust-scan` at `87c1fe0`, with local worktree
  `/home/shaul/ksav-issue-19`. It shares only a synchronous TypeScript lexical
  pass; no Rust/WASM scan transport is consumed by the editor. Keep it open and
  review the required wire schema and asynchronous consumer before claiming it.

This is a **living page**. Tick the boxes in *What is left* as they are done,
add what you find, and delete what stops being true. It is not a log — the
record of a day lives in [`decisions/`](decisions/README.md) and is never edited
afterwards.

---

## 1 · The standing brief

Break work into chunks. Scope each one, fix it thoroughly and **at the root**,
one checkbox per chunk, and keep going until every finding is gone.

> A deferred or documented gap is not done. Fix, and fully fix.

Keep an eye on GitHub CI. A red remote is the top of the queue, ahead of
whatever else is open.

## 2 · House rules

- **Fix the class, not the instance.** When you find a bug, find its siblings,
  fix all of them, and then turn the class into an executable prohibition.
  `prohibitions.test.mjs`, `runner.test.mjs`, `skips.test.mjs`,
  `gate.test.mjs`, `chrome.test.mjs` and `visibility.test.mjs` are the shape to
  copy.
- **Mutation-test every fence.** Break the thing it guards and confirm it goes
  red *and names the instance*. A fence nobody has seen fail is not a fence.
  This has caught several tests that could not fail for the reason they were
  written under — the repository calls that shape `ONLY_AT_TOP`, after the
  first one.
- **Broken beats unannounced.** When a feature is broken *and* silent about it,
  the broken feature is the finding and the missing message is a subordinate
  clause. Do not report the smaller half.
- **Build, don't delete.** A dead feature is unfinished, not unwanted. Wire it
  up. Never remove one without asking.
- **Commit and push every chunk.** Standing authorisation — do not ask. Never
  hand work over as an uncommitted diff.
- **Plain professional English** in commit messages, code, comments, docs,
  workflow files, and anything another person or agent reads.
- **A decision record per chunk**: `decisions/YYYY-MM-DD-slug.md`, plus a row in
  `decisions/README.md`. A living page may not state a historical count; the
  documentation sweep will tell you so.
- **Batch shell calls and parallelise.** Background anything over about thirty
  seconds and start the next independent piece of work in the same message.
  Never sleep-poll.

## 3 · Running it

```sh
cd ksav && node tools/gate.mjs            # the whole gate, thirteen checks
cd ksav && node tools/gate.mjs engine     # one tree — includes its formatting
cd ksav/app && npm test -- panels spans   # the inner loop, by substring
```

A partial run ends by naming the checks it did not run. Read that list before
you push; it exists because a two-of-nine run used to print *the gate is green*.

The assembled application, in order — the second step reads the first step's
output at compile time, so it is a hard dependency:

```sh
cd ksav/app && npm run build
cd ksav/engine && cargo build --release --features embed-ui
cd ksav/app && npm run accept
```

### Things about this machine

- Emacs is at `/c/msys64/mingw64/bin/emacs`, and a release engine usually sits
  at `ksav/engine/target/release/ksav.exe`. The live tests look for `ksav` on
  `exec-path` rather than at a path you can pass, so the whole line is:

  ```sh
  cd ksav/editors/emacs && PATH="$PWD/../../engine/target/release:$PATH"     KSAV_EMACS_LIVE=1 /c/msys64/mingw64/bin/emacs -Q --batch -L .     -l ksav-tests.el -f ert-run-tests-batch-and-exit
  ```

  Without the `PATH`, the sixteen live tests fail rather than skip — which is
  the guard working, and looks exactly like sixteen broken tests.
- **Local and CI differ, and neither direction is safe.** Node 26 here against
  24 there, so green locally is not evidence — `nix develop` gives you CI's
  exact Node, which is what that shell is for. Emacs runs the other way: 30.2
  here, and CI pins 27.1 because that is what the package declares. A fault that
  only exists above the floor is invisible to a job that only tests the floor,
  which is how a package that started no engine on any current Emacs stayed
  green through fifty tests. `ci.yml` runs both now.
- Never pipe a `cargo` test run through another command — redirect it to a file.
  A full engine test run needs tens of gigabytes; run it near a full disk and
  the compiler leaves truncated artefacts whose errors look like code faults.
- No Python heredocs for editing source, and no round-tripping a UTF-8 file
  through `cmd /c type` into a PowerShell variable and back — the capture
  decodes through the console code page and every Hebrew byte arrives as
  mojibake, which then gets written back over the original. This destroyed
  `ksav.typ` outright once (recovered from git); edit files with the editing
  tools, and if a script must rewrite one, read and write bytes with the .NET
  `[System.IO.File]` methods at an explicit UTF-8 encoding.
- No Python heredocs for editing source. Watch for LF becoming CRLF on
  `ksav.typ`; it breaks a prelude fence.
- Reading the Girsa repository at `C:\Users\Administrator\Videos\Girsa` is
  allowed and often useful. Never commit there, and never search its `target/`.
- **Three WSL distributions are installed**, and they are how anything gets
  claimed about another operating system: `Ubuntu` (cargo, no Node), `NixOS`
  (a full clone at `~/ksav`, all four toolchains verified through
  `nix develop`), and `FedoraLinux-44` (has Nix). Run
  `wsl.exe -d NixOS -e bash -lc '…'`, and set
  `NIX_CONFIG="experimental-features = nix-command flakes"` — flakes are not
  enabled by default there. A Nix shell on Fedora is not evidence about
  NixOS; the missing `lld` proved that.

---

## 4 · Where things stand

The state on 17 August 2026, so nothing has to be re-derived:

| | |
|---|---|
| **Published** | [sykhayyat.github.io/ksav](https://sykhayyat.github.io/ksav/) — the wasm build, service worker registering, offline cache warm. Two switches, not one: Pages is on with source *GitHub Actions*, **and** the `github-pages` environment carries a deployment policy for `tag`/`v*`. Without the second, a workflow that only fires on tags is refused before it runs a step. |
| **Released** | `v0.1.1`, tagged, built and **published** — fourteen assets: the installers, the engine binaries per platform, and the Emacs tarball. `v0.1.0` predated the jobs that build the last two. |
| **CI** | green, on Node 24, nine jobs. The Emacs package runs twice: at its declared floor (27.1, with a live engine) and on a current Emacs. |
| **`release.yml`** | a `workflow_dispatch` builds everything and publishes nothing; rehearsed, eleven jobs green, no second release created. |
| **Toolchains** | verified on Windows, WSL Ubuntu and NixOS; macOS through CI's own job. The Emacs suite has now run on Linux, which it never had. |

---

## 5 · What is left

Finished items are **deleted from here**, not ticked. A section called *what is
left* full of `- [x]` is the log this page says it is not; what was done on a
day belongs in [`decisions/`](decisions/README.md), which is indexed and which
this page links to instead. What stood here on 17 August 2026 — the release
rehearsal, the documentation pass, the Emacs suite on Linux, v0.1.1, the MELPA
draft and the `#פריט` badge — is
[`decisions/2026-08-17-the-version-nobody-runs.md`](decisions/2026-08-17-the-version-nobody-runs.md),
and the sitting that followed the release is
[`decisions/2026-08-17-a-clamp-is-not-a-mapping.md`](decisions/2026-08-17-a-clamp-is-not-a-mapping.md).
The notes' printed markers, which stood here until the mechanism this page
specified for them turned out not to exist, are
[`decisions/2026-08-17-the-marker-is-not-resolved-it-is-paired.md`](decisions/2026-08-17-the-marker-is-not-resolved-it-is-paired.md).

### Checked, and not bugs — do not re-report

- **`/commands` 404 in the hosted console, once per load.** That is
  `createBackend` knocking to see whether a server is there. On a static host
  it correctly falls through to the wasm engine. Noisy, working as designed.
- **A stale bundle hash in the service worker cache.** Navigations are
  network-first precisely so nobody is pinned to the version they first
  opened; the orphaned entry is never requested again.

### The audits of 23 August 2026

Two passes ran on this date and their findings live in
[`AUDIT-code-audit-2026-08-23.md`](AUDIT-code-audit-2026-08-23.md): a render
stress pass over footnotes and sidenotes (thirteen new documents through a
fresh build, read back through `probe`), and a full code audit graded by
lens — bugs, inefficiencies, confusing behavior, missing features. The three
render-pass findings — independently placed side apparatuses interleaving in
one margin, a region printing off the paper when no reserve exists, and
`#הערת_גיליון` refusing `שם:` — are absorbed into that document's findings
with their code-level causes, and are not tracked here. The artifacts
(documents, probe dumps, screenshots, logs) sit outside the repository at
`C:\Users\Administrator\Videos\Ksav-audit\`.

**Every finding has been worked.** Eight chunks landed on 23 August, one
decision record each, all indexed in
[`decisions/README.md`](decisions/README.md) from *The entry that was filed
but never drawn* through *The seam, the wrappers, and four helpers*. Owner
rulings that came with the work: grow-the-reserve is the default for a body
region that declares a height with no reserve declared (refusal stays
available via an explicit `אזור_הערות` plus `חריגה: "סירוב"`), and `שם:` is
accepted on every sidenote spelling.

None of that had ever been executed: the trunk did not compile from
`cbd078f` onward, so cargo had been stopping at the first broken target
ever since. On 24 August the whole tree was made to run — gate nine of
nine, release build, acceptance — and the fences that then met working
code for the first time each got their say; the sitting is recorded in
[`decisions/2026-08-24-the-trunk-the-wave-left.md`](decisions/2026-08-24-the-trunk-the-wave-left.md).
The follow-up stress sitting of 25 August — whole documents through the
whole machine, the footer walk measured and cut, and two more silent-loss
defects found — is
[`decisions/2026-08-25-the-stress-sitting.md`](decisions/2026-08-25-the-stress-sitting.md).



### The 20 August wave, and what is left of it

Eighteen items came in as
`C:\Users\Administrator\Documents\Ksav-handoff-2026-08-20.md`, which is outside
the repository and is the authority for their wording. Ten are done and are in
[`decisions/`](decisions/README.md); the rest are here with what is actually
known about each, so nothing has to be re-derived.

**Done since this section was written:** #35, #36 and #13 (one vocabulary for
restarting a count, and one block per apparatus at the foot of the file, in
[`decisions/2026-08-20-starting-the-count-again.md`](decisions/2026-08-20-starting-the-count-again.md)),
#5 (the scroll sync — direction-aware
anchor, dead zone, estimate-then-settle, all in
[`decisions/2026-08-20-the-thing-in-hand.md`](decisions/2026-08-20-the-thing-in-hand.md))
and #26 (the search scopes, in
[`decisions/2026-08-20-two-seforim-one-search.md`](decisions/2026-08-20-two-seforim-one-search.md)
— the engine gained `pagetext.rs`, which answers what each page *says*, because
nothing in the application could).

- [ ] **#30 · Fixed-region resize, and note picking.** The **resize half is
      built** (24 August): the reserve row and overflow selector in the
      settings drawer, per-region heights under the chooser, writing back into
      the declarations themselves —
      [`decisions/2026-08-25-the-too-small-switch.md`](decisions/2026-08-25-the-too-small-switch.md)
      and
      [`decisions/2026-08-25-the-reserve-in-the-writers-hands.md`](decisions/2026-08-25-the-reserve-in-the-writers-hands.md)
      hold the reasoning, including how the percent-of-sheet claim stays one
      claim across Rust and Typst. What remains of #30 is **note picking**, and
      that is still reserved for a conversation with the user: it has not been
      said what picking should do.

### The note system — closed

`NOTES-PLAN.md` is built. All five things, the chooser and the document-level
settings; the plan's own status table at the top of it says which record holds
which chunk, and it no longer has an open list.

The two records that closed it are worth reading in this order, because between
them they are most of what the next person needs to know about the apparatus:

- [The three that were left](decisions/2026-08-21-the-three-that-were-left.md) —
  the fourth source position, the line address and the Vilna wrap, and the four
  defects found underneath them. Three of those four lose the writer's text.
- [The three that were owed](decisions/2026-08-22-the-three-that-were-owed.md) —
  a box that clipped in silence, a gloss that could not be referred to, and a
  line address that was quadratic.

[What the night did not build](decisions/2026-08-21-what-the-night-did-not-build.md)
is now **history rather than a work list**: every one of its seven items has
since been built, including the two it flagged as traps. Read it for the
reasoning, not for what to do next.

**Two things about the apparatus that are true and are not bugs**, so nobody
re-reports them:

- `גלישה: ()` — a box the writer asked to stay fixed — is the one arrangement
  in Ksav that may lose text. It now marks the clipped edge, so the loss is
  visible; `סימן_חיתוך` changes the mark and `none` removes it.
- `probe` cannot tell a clipped note from a printed one, because a clip is a
  paint operation and it walks laid-out frames. `engine/tests/nothing_is_truncated.rs`
  therefore proves the words reached a **frame**, not that a reader can see them.
  `examples/svgdump.rs` sees the rectangle, and the limit is named in that file.

**Every name in `NOTES-PLAN` Part 2 was decided**, which decision 14 says is
Shaul's call and which the night could not ask about. They are all in
[The words for the note system](decisions/2026-08-20-the-words-for-the-note-system.md)
with what else was considered, so overruling any of them is a search-and-replace
rather than an archaeology dig. `קובץ` is the one to look at first.

### The live tracker

- [ ] **Keep writing in it.** `ksav/README.md`'s last box, and it calls this the
      most important line on the page. Three kuntres-length sittings — 7, 16 and
      17 August — found ten faults the whole suite was green over, and the 17th
      found six of them on its own: a table of contents above the document's own
      title, a caret that every table operation left in the text it used to be
      in, a dialog that computed the right refusal and then erased it, a section
      move that carried the blank line with it, a notes drawer numbering notes in
      a series that is on no page, and a find panel in English. Two of those six
      became a sweep that found nine more in the lists and the headings.

      The next one should be **long**: enough pages for the apparatus to break
      across them, enough simanim for the numbering to be re-read, a real export
      sent to somebody who will open it. Nothing else has ever found this class
      of bug. Every bug goes to the top of the queue and gets the class
      treatment.

- [ ] **Open the MELPA pull request.** Everything it needs is written down in
      [`ksav/editors/emacs/melpa-submission.md`](ksav/editors/emacs/melpa-submission.md)
      — the recipe, the body, and every checklist line answered with what was
      actually run. Two reasons it is still open here and not there. It is a pull
      request to somebody else's repository under the user's name, so a person
      opens it. And **MELPA asks for a public repository of one month or more**,
      which this one is from **23 August 2026** and not before. Until it lands
      there is no `M-x package-install ksav`.

      Read `melpa/melpa`'s `CONTRIBUTING.org` when opening it. The
      `Assisted-by:` requirement for AI-written code is recent enough that the
      exact form is worth re-reading rather than copying from the draft.

### Not yours to close

Leave these open, and do not report them as done or work around them.

- **Code signing.** The installers are unsigned, so every operating system
  blocks the first launch. The fix is a certificate — money, not code —  and
  `release.yml` already names the secrets it would need.
- **Inventory items 59 to 156.** The file is
  `C:\Users\Administrator\Documents\ksav-ui-inventory.ksav`, outside the
  repository: 156 numbered offers, marked up by the user with `//` comments.
  The markup runs to item 58. Ninety-eight offers have **no verdict**, and
  silence on them is not consent. Do not act on them, and do not treat the
  markup on items 1 to 58 as covering them. If more markup appears, that becomes
  the top of the queue.

---

## 6 · Lessons

Each of these was paid for. They are in rough order of how much.

**A round trip cannot see a transformation that is its own inverse.** `moving
back restores the document exactly` is the right property for a section move and
it passed for as long as the bug existed: the operation carried each block's
trailing whitespace with it, and *consistently* swapping two gaps round-trips
perfectly. It also ran on one document whose sections all ended the same way, so
there was nothing to swap. Two lessons in one fence — vary the corpus along the
axis the operation touches, and where a property is symmetric, name the shape as
well as the round trip.

**A design written down in this file is a hypothesis, not a finding.** The
markers item specified its own mechanism — walk the frames, read each marker
glyph's span — on a sentence that is true (*every glyph carries the span of the
source it came from*) and is not the claim being made (*every glyph carries a
span into the writer's document*). A marker is generated inside the prelude, so
its span names `ksav.typ`: a real file with a real name that the writer has never
seen. Fifteen minutes of dumping the actual frames said so before a line was
written; the plan had been carried in this page for a day, and reading it twice
would never have found it. Measure the premise, then build.

**A clamp is not a mapping, and a legal answer is not a right one.** Eighteen
table operations returned `Math.min(ctx.pos, text.length)` for the caret — the
old offset, clamped into the new text. Every value it produced was a position
that existed, so nothing ever threw and nothing ever noticed; every value was
also wrong, because a table operation rewrites the call from `עמודות:` onward
and moves every cell. Add a column, type one character, and it lands inside the
command name. Look hard at any expression whose job is to *make a value valid*:
`Math.min`, `?? 0`, `slice` with clamped ends. Validity is the property that
hides wrongness, which is why `ONLY_AT_TOP` and this are the same lesson twice.

**A version pinned as the floor is the only version tested.** `ci.yml` ran the
Emacs package on 27.1, which is what `Package-Requires` declares — the right way
to prove a floor is real, and it meant the version nearly every reader actually
has was the one nothing here executed. `url-retrieve-synchronously` against a
dead port returns a live empty buffer on GNU/Linux under 30.2 and nil under
27.1, so `ksav-running-p` said an engine was answering, `ksav-start` started
none, and the package did not work at all on a current Emacs while fifty tests
were green. Test the floor *and* the ceiling; the gap between them is where the
readers are.

**A thing nobody has run is not a thing that works.** Publishing the browser
build for the first time found the service worker registering `/ksavsw.js` — a
base with no trailing slash welded to a filename — 404 on every load, silent,
because the registration swallows failures by design. Building the dev shell on
real NixOS found it shipping wasm-pack with no `lld` under it. Checking the
Emacs install path found three of its four routes returning 404. None of these
could fail locally, and none of them had a test that was even asking. When
something has never been executed anywhere, executing it is the test.

**Check whether the fence already exists before writing one.** A rule was
diagnosed as unenforced and a second sweep written for it. It failed on its
first run — on its own comment, which quoted the pattern it was looking for —
and the same output printed the name of the fence that had existed twenty lines
higher the whole time. Two spellings of one rule is the defect family this
repository is named for, and it nearly arrived in the commit that documented it.

**A number in a living page is a claim somebody has to keep true.** Every count
in `ksav/README.md` moved four times in one session, and each time the
documentation fence was the thing that noticed. Fix the counts last, after the
suites have settled, or you will fix them twice.

**The probe reads what it was last asked about.** Three kinds of thing on the
page were invisible to every test in this repository until somebody needed one:
a fill, a stroke, and an image. A strike that stopped being drawn passed every
assertion, because the words it goes through are still there; a picture that
ignored its alignment passed a test asserting the document compiled and the
caption printed, both true the whole time. A feature whose output is a new kind
of frame item arrives **untested by construction**. Before writing a test about
something drawn, check that `probe` can see it at all.

**A green subset is not a green gate.** `node tools/gate.mjs engine` used to run
the engine's lints and tests and skip a one-second formatting check *in the same
crate*, then print *the gate is green*. A push went out on that sentence and
formatting was the only red job on the remote — which is exactly the failure the
gate was built to end, recurring one level in. Both halves are fixed: a name now
selects on either axis, and a partial run names what it skipped. The lesson
survives the fix: **read what a tool says it did, not what you asked it to do.**

**Test the artefact somebody receives, not the one in your tree.** The Emacs
package passed twenty-two tests, half against a real engine, and could not be
installed by anybody. Every test ran it out of the checkout with `-L .`, which
is a way nobody gets it. Underneath that, no `ksav` binary existed on any machine
anywhere — releases attached desktop installers, and the shell links the engine
as a library. Two facts, each true for weeks, never held next to each other.

**A partial result must not wear a complete one's words.** The gate's *green*,
an acceptance run that stopped halfway and reported nothing had failed, a
formatting check that could not run and exited 0. Same shape three times. When
something reports success, ask what it would have reported had it not run.

**Ask what a helper does when the server says no.** `url-copy-file` writes
whatever comes back, so a 404 becomes an HTML file on disk, marked executable,
surfacing much later as an engine that starts and dies — a message about a
typesetter, describing a download.

**Fix the assertion count last.** The documentation fence checks the tallies in
`ksav/README.md` against the run. It moves every time you add a test, so
correcting it mid-chunk means correcting it again. Do it once, at the end, from
the final run.

**Verify a mutation landed before believing its result.** A `perl` one-liner
against a JavaScript source file half-matched, corrupted it, and the restore then
ran from the wrong working directory. Prefer an editor for mutations, and check
the file still parses before reading anything into red or green.

**A hand-kept list is the thing that goes stale.** The byte-compile step named
three `.el` files and a fourth arrived generated. The generator registry, the
gate's groups, the workflow's platform matrix — all the same shape. Sweep a
directory, derive from one table, or fence the list against what it is supposed
to cover.

**The engine is the product.** Everything else — the desktop shell, the browser
build, the Emacs package — is a door into it. When a client needs to know
something the engine already knows, generate it from the engine's own registry
rather than writing it down a second time. This repository has paid for that
lesson five times, in five languages, and every one of the failures was silent.
