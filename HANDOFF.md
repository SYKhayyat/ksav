# Handoff

The working brief for whoever picks Ksav up next. Read it start to finish before
touching anything; it is short on purpose and every paragraph is here because
something went wrong without it.

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
cd ksav && node tools/gate.mjs            # the whole gate, nine checks
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
| **Published** | [sykhayyat.github.io/ksav](https://sykhayyat.github.io/ksav/) — the wasm build, service worker registering, offline cache warm. GitHub Pages is on, source *GitHub Actions*. |
| **Released** | `v0.1.1`, carrying the installers **and** the engine binaries **and** the Emacs tarball — `v0.1.0` predated the jobs that build the last two. |
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

### Checked, and not bugs — do not re-report

- **`/commands` 404 in the hosted console, once per load.** That is
  `createBackend` knocking to see whether a server is there. On a static host
  it correctly falls through to the wasm engine. Noisy, working as designed.
- **A stale bundle hash in the service worker cache.** Navigations are
  network-first precisely so nobody is pinned to the version they first
  opened; the orphaned entry is never requested again.

### The live tracker

- [ ] **Keep writing in it.** `ksav/README.md`'s last box, and it calls this the
      most important line on the page. Three kuntres-length sittings — 7, 16 and
      17 August — found six bugs the whole suite was green over, and none of
      them is a sefer yet. The next one should be **long**: enough pages for the
      apparatus to break across them, enough simanim for the numbering to be
      re-read, a real export sent to somebody who will open it. Nothing else has
      ever found this class of bug. Every bug goes to the top of the queue and
      gets the class treatment.

- [ ] **The notes drawer numbers notes in a series that is on no page.** Ten
      notes, numbered 1 to 10, in a document whose page numbers them 1, 2 in the
      ביאור band and א, ב in the mareh-mekomos band — because parallel streams
      number independently and in their own schemes, which the engine does
      correctly and now has tests for. `panelrows.noteList` puts `String(i + 1)`
      — the row's position in a flat list — into the slot a reader takes for the
      note's number, so a writer looking for footnote `ב` will not find a `ב`.

      Two fixes, and the choice is the work. Reimplementing the numbering in the
      editor is complete and is a second spelling of a rule the engine owns.
      Carrying the markers back on the compile response makes the drawer's number
      *the* number by construction and writes no rule twice; it is also not a
      one-line change. The second looks right. See
      [`decisions/2026-08-17-a-clamp-is-not-a-mapping.md`](decisions/2026-08-17-a-clamp-is-not-a-mapping.md).

- [ ] **A table cannot be filled in from the keyboard, and fixing it changes an
      invariant.** Lists own `Enter`, `Tab`, `Shift+Tab` and `Alt`+arrows. Tables
      have eighteen ribbon operations and no navigation at all, so `Tab` in a
      cell falls through and puts indentation in the markup — and `Tab` is how
      every table in every word processor is filled.

      The blocker is not the feature, it is `bindings.test.mjs`'s *no two actions
      ship on one combination*, and `list.indent` already holds `Tab`. The
      argument for loosening it: a **structure** action is already scoped —
      `list.indent` cannot fire outside a list — so two structure actions of
      different structures may share a key exactly when the caret can only be in
      one of them, which `structureAt`'s innermost-wins rule guarantees. That is
      a change to the invariant, its fence and the dispatcher, plus the generated
      shortcut card. Left here rather than slipped in, because a key that means
      two things is precisely what that rule exists to prevent and the exception
      should be argued out loud. See
      [`decisions/2026-08-17-a-clamp-is-not-a-mapping.md`](decisions/2026-08-17-a-clamp-is-not-a-mapping.md).

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
