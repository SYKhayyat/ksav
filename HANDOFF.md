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
- **Local is more permissive than CI.** Node 26 here against 24 there; Emacs
  30.2 here against 27.1 there. Green locally is not evidence. `nix develop`
  gives you CI's exact Node, which is what that shell is for.
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

The state on 16 August 2026, so nothing has to be re-derived:

| | |
|---|---|
| **Published** | [sykhayyat.github.io/ksav](https://sykhayyat.github.io/ksav/) — the wasm build, service worker registering, offline cache warm. GitHub Pages is on, source *GitHub Actions*. |
| **Released** | `v0.1.0` only, from 24 July, carrying the nine desktop installers and **no** engine binaries and **no** Emacs tarball. |
| **CI** | green, on Node 24 across all three workflows. |
| **`release.yml`** | a `workflow_dispatch` now builds everything and publishes nothing. It did not before — it cut a draft release named after the branch. |
| **Toolchains** | verified on Windows, WSL Ubuntu and NixOS; macOS through CI's own job. |

---

## 5 · What is left

Finished items are **deleted from here**, not ticked. A section called *what is
left* full of `- [x]` is the log this page says it is not; what was done on a
day belongs in [`decisions/`](decisions/README.md), which is indexed and which
this page links to instead. The five items that stood here on 16 August 2026 —
the Emacs client, per-pane places, the 11 August reconciliation, writing a
kuntres, and the documentation pass — are the five records dated that day.

### In flight when this was written

- [ ] **Read the release rehearsal.** `gh run list --workflow=release.yml`
      — a `workflow_dispatch` was started at the end of the session to prove
      that the new guards build everything and publish nothing. It runs on
      GitHub, so closing the session did not affect it. Two things to check:
      that every job is green, and that `gh release list` still shows
      **exactly one** release (`v0.1.0`). If a second one appeared, the guard
      is wrong and that is the top of the queue — delete it and re-read
      `tagName` in `release.yml`.

- [ ] **Finish the documentation pass.** It was asked for as "the readme and
      the onboarding docs — not a narrative, not overemphasising later
      developments", and four pages were done: the root `README.md`,
      `docs/start-here.md`, `CONTRIBUTING.md` and
      `ksav/editors/emacs/README.md`. **Not** done, and the largest of them:
      `ksav/README.md` at ~1,250 lines, plus `docs/from-word.md` and
      `docs/girsa.md`, neither of which was read. The rule applied to the
      others: a living page describes what is, and what changed on a day
      belongs in `decisions/`. Where an anecdote justifies a rule a reader
      must follow, it survives as a clause rather than a paragraph.

- [ ] **Run the Emacs live tests inside the Nix shell.** They are the one
      part of the suite never run on Linux. The shell carries Emacs 30.2 and
      CI uses `emacs-nox` 27.1, and those two already disagree about
      `image-size`, so it is a real question rather than a formality.

### Checked, and not bugs — do not re-report

- **`/commands` 404 in the hosted console, once per load.** That is
  `createBackend` knocking to see whether a server is there. On a static host
  it correctly falls through to the wasm engine. Noisy, working as designed.
- **A stale bundle hash in the service worker cache.** Navigations are
  network-first precisely so nobody is pinned to the version they first
  opened; the orphaned entry is never requested again.

### The live tracker

- [ ] **Keep writing in it.** `ksav/README.md`'s last box, and it calls this the
      most important line on the page. Two kuntres-length sittings — 7 and 16
      August — found four bugs the whole suite was green over, and neither of
      them is a sefer. The next one should be **long**: enough pages for the
      apparatus to break across them, enough simanim for the numbering to be
      re-read, a real export sent to somebody who will open it. Nothing else has
      ever found this class of bug. Every bug goes to the top of the queue and
      gets the class treatment.

- [ ] **Cut v0.1.1, and it is not routine.** Three of the four ways an Emacs
      user can install Ksav are 404s right now, all from one cause: `v0.1.0` was
      cut on 24 July, before the `engine` and `elisp` jobs existed, so the only
      release carries the nine desktop installers and nothing else.
      `M-x ksav-install-engine` resolves `releases/latest/download/…` and finds
      nothing; `package-install-file ksav-0.1.0.tar` names an asset that is not
      there. `package-vc-install` from git is the one path that works. Cutting a
      release fixes all three at once.

      Everything is at `0.1.0` — `ksav/app/package.json`, `ksav/engine/Cargo.toml`,
      `ksav/wasm/Cargo.toml` — so the bump comes first, then the tag. A tag fires
      `release.yml` **and** `deploy.yml` together.

      A dispatch of `release.yml` now builds everything and publishes nothing
      (see below), so rehearse before tagging rather than after.

- [ ] **Submit the MELPA recipe.** `ksav/editors/emacs/melpa-recipe` is correct
      and fenced now, and MELPA still returns 404 for `ksav` because nobody has
      opened the pull request against `melpa/melpa`. Until that lands there is no
      `M-x package-install ksav`, which is the actual bar for an Emacs user being
      a first-class one. It is a PR to somebody else's repository under the
      user's name: **draft it, do not open it.**

- [ ] **The `#פריט`-family question that stayed open.** Nothing outstanding in
      the engine — see the record — but the badge names the Hebrew command in an
      English document, because `#item` is an alias and the prelude cannot know
      which spelling was typed. The editor lint says it in the writer's language,
      so the gap is cosmetic. Worth a look if a second English writer meets it.


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
