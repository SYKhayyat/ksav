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
  at `ksav/engine/target/release/ksav.exe`, so `KSAV_EMACS_LIVE=1` works locally
  and the Emacs package's live tests really run.
- **Local is more permissive than CI.** Node 26 here against 20 there; Emacs
  30.2 here against 27.1 there. Green locally is not evidence.
- Never pipe a `cargo` test run through another command — redirect it to a file.
  A full engine test run needs tens of gigabytes; run it near a full disk and
  the compiler leaves truncated artefacts whose errors look like code faults.
- No Python heredocs for editing source. Watch for LF becoming CRLF on
  `ksav.typ`; it breaks a prelude fence.
- Reading the Girsa repository at `C:\Users\Administrator\Videos\Girsa` is
  allowed and often useful. Never commit there, and never search its `target/`.

---

## 4 · What is left

### The live tracker

- [x] **Emacs as a first-class citizen.** All sixteen services have a door, the
      exemption lists in `emacs.test.mjs` are empty, and `ksav.el` is seven
      files. See
      [`decisions/2026-08-16-three-of-sixteen.md`](decisions/2026-08-16-three-of-sixteen.md).

- [x] **A pane should remember its own place in each document.** `paneplaces.ts`
      keys a place by pane *and* document — source panes and previews alike. See
      [`decisions/2026-08-16-three-panes-one-caret.md`](decisions/2026-08-16-three-panes-one-caret.md).

- [ ] **`deploy.yml` has never run.** The workflow that publishes the browser
      build triggers on tags, and the one tag this repository has predates the
      file — so the wasm build, the service worker, the manifest and every share
      link point at a site that has never been built once. The workflow is
      written and its action pins are current; what is missing is a tag, or a
      `workflow_dispatch` run, and then reading what comes out.

### Reconcile the 2026-08-11 list

- [x] All seventy-seven read against the code: seventy-six done, one open and
      fixed in the same pass, and nothing inherited into this file. See
      [`decisions/2026-08-16-reading-the-seventy-seven.md`](decisions/2026-08-16-reading-the-seventy-seven.md),
      which also answers four of that record's six open questions. The two that
      stand are which arrangements should be default tabs — a question for a
      writer — and inventory items 59 to 156, which are below.

### Write a real sefer in it

- [x] A second sitting, 16 August: a kuntres on lechem mishneh written in the
      assembled application — simanim, a footnote, a source note, gershayim
      inside parentheses, a table, two apparatus bands, an `.org` import and a
      PDF. The three bugs of 7 August are gone; it found a fourth, and the fix
      is the class rather than the instance. See
      [`decisions/2026-08-16-writing-a-kuntres-in-it.md`](decisions/2026-08-16-writing-a-kuntres-in-it.md).

- [ ] **Keep writing in it.** `ksav/README.md`'s box stays open and should: two
      kuntres-length sittings are not a sefer, and the only thing that has ever
      found this class of bug is somebody writing rather than testing. The next
      one should be *long* — enough pages for the apparatus to break across
      them, enough simanim for the numbering to be re-read, a real export sent
      to somebody. Every bug goes to the top of the queue and gets the class
      treatment.

### Documentation and onboarding

- [x] All five read as the person arriving with no context. What that found:
      `docs/start-here.md` — the page the front door sends a *reader* to — never
      said how to get Ksav in front of you, and opened on *"it opens with one"*;
      it has the three doors now, one line each. And the count fence was
      enforcing the wrong number onto three sentences: the registry declares
      more commands than the editor offers, because a deprecated one still
      compiles and is no longer put in front of anybody — so every sentence
      about what `#` offers was carrying the registry's total. See
      [`decisions/2026-08-16-two-numbers-under-one-noun.md`](decisions/2026-08-16-two-numbers-under-one-noun.md).

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

## 5 · Lessons

Each of these was paid for. They are in rough order of how much.

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
