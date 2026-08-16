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

Finished items are **deleted from here**, not ticked. A section called *what is
left* full of `- [x]` is the log this page says it is not; what was done on a
day belongs in [`decisions/`](decisions/README.md), which is indexed and which
this page links to instead. The five items that stood here on 16 August 2026 —
the Emacs client, per-pane places, the 11 August reconciliation, writing a
kuntres, and the documentation pass — are the five records dated that day.

### The live tracker

- [ ] **A look of its own, for the thirteen that still have none.** The rule
      is that anything which is a separate command has a style the writer can
      set. Eleven of the twenty-four are done — `#מראה_מקום`, `#סימן`, `#סעיף`,
      `#אות`, the eight blocks and the three review marks —
      and `enginefacts.test.mjs` names what is left under *no look of its own
      yet*: the side notes, whose configurable width the margins asked for by
      name; the banded apparatus tiers; the note heading; the endnote; the
      rules, the images and the formulas.

      Each is four lines: a row in `_mk_defaults` shipping exactly what it
      prints today, and rendering through `_mk_conf`. The fence goes red until
      its name is taken off the list, so the list can only shrink. See
      [`decisions/2026-08-16-a-look-of-its-own.md`](decisions/2026-08-16-a-look-of-its-own.md).

      Two of them are not four lines, and are worth doing anyway: a `#קו_מפריד`
      wants thickness and width rather than a text look, and `#תמונה` wants its
      caption's. Neither fits the class register as it stands — though
      `probe::strokes` now exists, so at least a test can see the line.

- [ ] **The Styles drawer writes the wrong spelling, and cannot reach the
      parts.** Every styled command has a door of its own — `#הגדרות_סימן` — and
      the panel still writes `#הגדרות_סימונים(גודל: ("סימן": …))`, which sets
      the same store and reads worse in the document than what a writer would
      type by hand. Backwards, and it is `styles.ts`'s `COMMAND_NAMES` plus the
      marks section in `main.ts`.

      The parts are the other half: `#הגדרות_פסוק(מקור: (גודל: 1.2em))` is
      reachable only by typing. `marks.CLASS_PARTS` is the list, fenced against
      the prelude, so the panel has what it needs — what is missing is a part
      chooser beside the class chooser, and the same knob rows under it.

- [ ] **The rest of the parts.** Four commands have them. The others draw one
      thing each *as far as anybody has looked* — which is exactly the sentence
      that was true of `#פסוק`'s reference for a year. Worth walking the
      prelude for `text(` calls inside a styled command's own rendering: each
      one is a look with no setting behind it.

- [ ] **Keep writing in it.** `ksav/README.md`'s last box, and it calls this the
      most important line on the page. Two kuntres-length sittings — 7 and 16
      August — found four bugs the whole suite was green over, and neither of
      them is a sefer. The next one should be **long**: enough pages for the
      apparatus to break across them, enough simanim for the numbering to be
      re-read, a real export sent to somebody who will open it. Nothing else has
      ever found this class of bug. Every bug goes to the top of the queue and
      gets the class treatment.

- [ ] **`deploy.yml` has never run.** The workflow that publishes the browser
      build triggers on tags, and the one tag this repository has predates the
      file — so the wasm build, the service worker, the manifest and every share
      link point at a site that has never been built once. The workflow is
      written and its action pins are current; what is missing is a tag, or a
      `workflow_dispatch` run, and then reading what comes out. **Ask before
      running it**: it publishes a public site, which is not a thing to do on
      somebody's behalf.


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
