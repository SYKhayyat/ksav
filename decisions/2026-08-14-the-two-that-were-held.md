# The two that were held — 14 August 2026

`#27` (git built into Ksav) and `#34` (Ksav as a mode for Emacs) were the last
two items in the marked-up UI inventory and the only two that were product
decisions rather than defects. They were put to the reader and both were
decided:

- **git**: the whole of it — branches, remotes, push — rather than the smaller
  history-panel reading of the ask, and rather than closing it on the grounds
  that the snapshots already keep a history.
- **Emacs**: an elisp package that drives Ksav's engine, rather than treating
  the in-application Emacs mode or the Org round trip as the answer.

Four chunks, `188ff7b` through `17a38b8`.

## Version control

It drives the `git` that is installed rather than linking libgit2, and the
reasons are specific: a sefer under version control is under version control for
other tools too, so when Ksav's history and `git log` disagree it is Ksav that is
wrong; authenticating a push is configuration the binary already reads and a
library does not; and this repository cannot be cloned without a git in the first
place. The cost is that git may be missing, which is the first thing the service
answers.

Four rules hold every invocation, each with a test: nothing reaches a shell, no
caller-supplied word can become an option, git can never stop and wait for a
human, and names come back as they were written.

The third one is the one worth restating. Without `GIT_TERMINAL_PROMPT`,
`GIT_ASKPASS`, ssh's batch mode and the credential manager all closed, a push to
a host the writer has no credentials for does not fail — it *waits*, on a prompt
being written to a pipe nobody reads. The symptom would have been a drawer that
hangs, and there is no message in that.

**The availability check is per document, not per build.** That is the design
decision in the client half, and it is why it does not sit beside `sourcesOf`.
A build either can or cannot reach Girsa. Version control is not like that: the
desktop application can do it and cannot do it for a document that has never been
saved, and a browser tab cannot do it at all for a second reason — the File
System Access API hands back a handle and never a path. Three states, three
different things a reader can do about them, and one "not available" would have
delivered none of them.

**Comparing with an old version sets the change gutter's baseline**, which is
what the snapshot history already does. One diff, one set of marks in the margin,
whether the version being compared against came from `Ctrl+Alt+S` or from a
commit. A second view over `git diff`'s unified text would have been a second
opinion about what changed in one document, in one application.

## The Emacs package

`ksav/editors/emacs` is a client and nothing else: no elisp there parses Ksav
markup, decides what a command means, or renders anything. That is not modesty
about the elisp — it is the only arrangement in which an Emacs user gets *Ksav*
rather than a mode that approximates it and drifts.

So the service table is generated from the engine's registry, which makes the
Emacs package the **fifth** target of one list. `services.rs` opens by counting
what the first four cost when they were written by hand, and every one of those
failures was silent. The *command* vocabulary is deliberately not generated: it
is asked for at run time, so the package offers whatever the engine in front of
it knows.

## What driving it found that reading it did not

Three faults in the elisp, all of them in what a reader is told, none of them
visible in the source:

- a document that did not compile was reported as *"the engine refused and said
  nothing about why"* — printed directly above the diagnostics that said
  precisely why. A failed compile answers `ok: false` with the reasons in
  `diagnostics` and no `error` field, and the refusal reader did not know that;
- the preview was blanked whenever a document did not compile, with *"0 pages
  were typeset"* beside it. A writer types through broken states continuously;
  blanking the page at every half-finished keystroke makes the preview useless
  exactly when it is being used;
- *"1 page were typeset"*, from pluralising the noun and not the verb, at one of
  two sites that each spelled the plural inline.

The 7 August report's sentence was **"built by reading, never by using"**. These
are three more instances of it, found the only way they can be — by running the
thing and looking at what it said.

The mutation runs found two more, in the fences themselves: an acceptance check
that was handed a value where it wanted a condition, so it asserted an attribute
was truthy and would have accepted any state at all; and an i18n-key check that
reported ok about an empty string. A sweep of every `check(` call in that file
found no second instance of the first.

## The pass, measured

Run at `17a38b8`, `node tools/gate.mjs`, green across all nine checks:

| check | |
|---|---|
| engine formatting, browser engine formatting, desktop shell formatting | green |
| editor typecheck | green |
| editor suite | **5,821 assertions across 92 files** |
| engine lints (`clippy -D warnings`, all targets) | green |
| engine tests | **661** |
| desktop shell lints, desktop shell tests | green |

And the three that need more than a plain checkout:

- the assembled application — **468 checks**, green, including a new step 10
  that holds the version-control drawer to saying *why* it cannot run;
- the Emacs package — **22 ERT tests**, green against a real engine;
- the parse oracle's corpus — 3,401 documents.

## What is left

Nothing from the marked-up inventory's part four, and nothing from the eleven
findings relayed from Girsa. The one thing still reported rather than finished is
the vim text objects recorded in
[the previous record](2026-08-14-the-girsa-wave-and-the-inventory-tail.md), whose
closing section said these two were held and unstarted. They are neither now.
