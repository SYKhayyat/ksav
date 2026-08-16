# decisions/ — the record, and why it is kept apart

Every file in this directory was true on its date and is not edited afterwards.
That is the whole contract, and it is the reason the directory exists.

## The seam this fixes

Until now there were three files at the repository root — `spec.md`, `fixes.md`
and `plan-notes-and-ui.md` — and each of them was **two documents with opposite
lifecycles bolted together**: a spec, which is edited in place and is always
current, and a log, which is written once and is a record of a day. Nine dated
wave/audit/resolution units lived inside them.

Every stale number in the repository lived at that seam. `fixes.md` opened with
a status paragraph carrying **three stacked "Superseded" notices** — one per
later audit — because its own rule (findings kept verbatim, so a fix is legible
beside the thing it fixed) is right for a log and makes a file that can only
grow, which is wrong for a status. `spec.md` said `ksav.typ` was 1,701 lines
when it was 2,324, and stated an assertion count that was wrong by 426 one line
above the paragraph explaining that assertion counts are not evidence.

Neither file was wrong to have been written. They were wrong to have been one
file.

So: the record moved here, verbatim, one file per dated unit, named by its date.
`spec.md` kept the part that is a specification — the eleven note options, the
ground rule that produces exactly eleven, and where a note's prose lives — and
is now a living document, swept by `app/test/documentation.test.mjs` like
`README.md` and `docs/` are.

## The rules, both of which a test enforces

1. **A file here is named `YYYY-MM-DD-slug.md`.** The date is the lifecycle
   marker: it is what says *this was true then*, and it is what the partition
   check in `app/test/documentation.test.mjs` reads. A file here without one is
   a red suite.
2. **A file here is not edited to make it current.** Correct a typo; do not
   correct a number. If something in here is now false, the answer is a new
   entry, or an edit to the living document that supersedes it — never a
   rewrite of the record.

The counted-claim sweep does not run over this directory, and the exemption is
checked from both ends: the directory as a whole has to be excusing something
real (at least one file here would fail the sweep), and every tracked `.md` in
the repository has to be either a living page or a declared log. That is
deliberately the same shape as `registry.rs`'s `ONLY_AT_TOP`, inverted — an
exemption is only safe when leaving something out is as loud as putting
something in.

## What is here

| | |
|---|---|
| [2026-07-20 · Product audit](2026-07-20-product-audit.md) | The first full read-through: *"replace Word, for Hebrew."* Errors, half-implementations, redundancy, UX, and what a Word user looks for and does not find |
| [2026-07-21 · Adoption wave](2026-07-21-adoption-wave.md) | *"Why a bochur still wouldn't switch"* — bracket healing, the Word handoff, installers |
| [2026-07-23 · Production readiness](2026-07-23-production-readiness.md) | The first list, and the standard of work the whole project has been built to, which is stated at the top of it |
| [2026-07-23 · Second audit](2026-07-23-second-audit.md) | The one that judged at the size and shape of a real sefer, and said *not ready* |
| [2026-07-24 · Resolution](2026-07-24-resolution.md) | What the second audit's blockers turned out to be |
| [2026-07-24 · Third audit](2026-07-24-third-audit.md) | The first audit that judged by *running* it rather than by reading it |
| [2026-08-04 · Borrowed wave](2026-08-04-borrowed-wave.md) | What Katvan already knew — click-to-jump, mixed-direction source, invisible characters |
| [2026-08-04 · Borrowed wave II](2026-08-04-borrowed-wave-ii.md) | typstify, and the fourteen features around it |
| [2026-08-04 · Notes and the UI around them](2026-08-04-notes-and-ui.md) | The plan, the browser sweep, and the post-mortem on why 2,276 green assertions had not caught any of it |
| [2026-08-07 · Writing a kuntres in it](2026-08-07-writing-a-kuntres.md) | The first hour of actually using it, and the three bugs that were green in 3,556 assertions |
| [2026-08-09 · Values, files, and this directory](2026-08-09-values-files-and-decisions.md) | The engine's tables crossing the seam as values, the prelude as a file, and why the record moved here |
| [2026-08-09 · The three-repository report](2026-08-09-lamdan-three-repos.md) | *The diagnosis is written down correctly and the sweep never runs* — eighteen classes, worked one at a time |
| [2026-08-10 · Fixed regions and peer streams](2026-08-10-regions-and-streams.md) | Percent-of-sheet heights, any number of regions, and regions for peer streams — the engine could already do more than the product could say |
| [2026-08-11 · Marking up the UI inventory](2026-08-11-marking-up-the-ui-inventory.md) | 156 offers handed over for markup: the seven complaints that were one missing concept, and the documents/panes/tabs model that answers them |
| [2026-08-12 · No preference ever survived a reload](2026-08-12-no-preference-ever-survived-a-reload.md) | A temporal-dead-zone ReferenceError in `loadSettings`, swallowed by a catch written for corrupt JSON, discarded every stored preference on every boot — which is why emacs mode did nothing |
| [2026-08-12 · Nothing ever asked what language the interface was](2026-08-12-nothing-ever-asked-what-language-the-interface-was.md) | *"Everything is coming in in Hebrew. I don't know why."* Four faults under one symptom, including a `setLang` that no boot ever called and a prose rule that was a ratchet |
| [2026-08-14 · The Girsa wave and the tail of the inventory](2026-08-14-the-girsa-wave-and-the-inventory-tail.md) | Fifteen chunks: Org both ways, the keyboard modes made real, the command vocabulary, side notes, and eleven findings relayed from Girsa — including the four that changed what the suite can see |
| [2026-08-14 · The two that were held](2026-08-14-the-two-that-were-held.md) | Version control on the git the machine already has, and an Emacs package that drives the engine — plus the three faults that only showed up when the elisp was actually run |
| [2026-08-14 · Seventy-five minutes of linking](2026-08-14-seventy-five-minutes-of-linking.md) | The remote green again, a CI job that was forty LTO passes over the same compiler, sefer text objects, per-document preview pages — and four measurements that were assumed rather than taken |
| [2026-08-14 · The only surface that knew](2026-08-14-the-only-surface-that-knew.md) | The shortcut list moved to a drawer of its own, and moving it exposed that twenty other surfaces printed chords no keyboard mode had left installed |
| [2026-08-14 · A door for the library](2026-08-14-a-door-for-the-library.md) | The three Girsa errands get a menu — and with it: two chords decided outside the bindings table, one of them already `left`; Escape not closing a dropdown; an assertion count that could not be measured before the commit that had to contain it; and 2,187 leaked build directories |
| [2026-08-14 · One pane, one siman](2026-08-14-one-pane-one-siman.md) | Narrowing: why the compile stays whole, why the span is an anchor rather than a range, and why the refusal cannot live where it belongs by shape |
| [2026-08-14 · Every pane is the editor](2026-08-14-every-pane-is-the-editor.md) | Four settings that reached only the focused pane — the document itself among them — and the rule that separates what a pane owns from what the application owns |
| [2026-08-14 · One question at a time](2026-08-14-one-question-at-a-time.md) | The notes chooser showed fifty controls for a decision most writers had already made; what it asks now, what was kept behind a preference, and the two counts that were written in files that could not see them |
| [2026-08-15 · A package that could not be installed](2026-08-15-a-package-that-could-not-be-installed.md) | The Emacs package worked and nobody could install it, and underneath that there was no `ksav` binary on any machine at all: what a release attaches now, why the engine assets are bare binaries, and why the tarball is installed rather than inspected |
| [2026-08-14 · The pages of one siman](2026-08-14-the-pages-of-one-siman.md) | A preview that follows the narrowed pane beside it: why the answer rides on the compile instead of on `reveal`, why a page reports runs rather than a range, and why the pages it drops are hidden rather than removed |

Every file in this directory is in that table, and a test says so: an index
edited by whoever remembers is an index two entries behind, which is what this
one was.

One dated record is deliberately **not** here:
[`lamdan/whole-repo-2026-08-05.md`](../lamdan/whole-repo-2026-08-05.md), the
whole-repository audit, which lives where the tool that produced it writes. It
is a declared log for the same reason everything here is, and it is answered
section by section in place rather than appended to.

## What is not a decision

The design reasoning that is *not* dated and *is* still load-bearing stayed
where it was, because it is not a record of a day:
[`ksav/engine/README-notes.md`](../ksav/engine/README-notes.md) — the note
apparatus, including the two note-identity designs that were tried and
abandoned, and the four ways of separating a note number from its text that
were each measured and rejected. Negative results are the one artifact git
cannot reconstruct. Not a line of it was cut.
