# 2026-09-25 · A document that runs code says so — and says only what is true

Fixes #51. A `.ksav` may carry a `#let` preamble; `DocFile::source()` puts it in
front of the body, so **opening the file runs it**. The issue's report was that it
runs "with no prompt or diagnostic".

## The measurement first, because it changed the fix

The report's "arbitrary `#let`/loop/package code that runs" is the finding to push
back on before acting, and two facts in this crate bound it:

- **No network, and no disk outside `packages/`.** `typst-as-lib` offers a package
  resolver that *downloads*; this one declines it and builds a resolver whose root
  **is** the bundled package directory. `lib.rs` says on `packages_root`: *"a
  document cannot reach anything else on the disk through it."*
- **A bounded run.** `server.rs` compiles on its own thread and the pool thread
  only *waits* for it with a timeout, so a preamble that loops forever costs a
  timeout, not the process.

So the honest statement is the small one: **the document runs the commands it
carries, they can change what the page says, and here they are.** A warning saying
"arbitrary code" would be wrong in both directions — it would send a reader
hunting for an attack the sandbox forecloses, and it would make the real, smaller
fact easy to dismiss. `the_advisory_does_not_claim_the_wrong_thing` pins the
wording against five overclaims, because "improving" the message into a scary one
is the likely next edit.

## Which clients were actually silent

The report did not distinguish, and the answer is three different states:

| Client | Before | Now |
|---|---|---|
| browser app | **not silent** — the palette lists the document's commands, chipped `fromDocument` | unchanged, and `commands.test.mjs` already fences it |
| CLI | silent | one `warning:` line naming the commands |
| Emacs | silent | one `message` line, once per open |

The browser was the informative measurement: `available()` already carries
`from: "document"` and `i18n.ts` has `fromDocument: "this document's command"`, so
a writer who opens a shared sefer *can* see that the document brought commands.
What the browser does **not** do is show the preamble's *text* — the names, not the
code. That is the remaining gap, it is a UI decision rather than a defect, and it
is written up on the issue rather than decided here.

## `DocFile::advisories()`

One list, one wording, and it now holds **both** advisory kinds: the
missing-asset warning that predated it (and which `main.rs` used to format
itself — a second formatter is a second wording) and the new one. Putting them
side by side is the only way a reader can tell whether they are saying the same
kind of thing, and the test asserts both come out of the same call.

The names come from `defined_let_names`, a hand-rolled scan, because **this crate
has no regex dependency** and the same twelve lines are wanted by the app's
`commands.ts::definedIn`. The two must agree — the palette lists the document's
commands and an advisory naming a different set would contradict the panel the
writer is looking at — and the agreement that can be run is a test; the agreement
that cannot is somebody reading both.

Three things about the scan, all of which the tests pin:

- both spellings bind, because a preamble is prepended to a document and a writer
  reasonably writes `#let` or a bare `let`;
- Hebrew letters are identifiers, which is the whole point of the language;
- `let` must be a **whole word**, at both ends. `#letter = 3` is not a `let` of
  `ter`, and a pattern that only checked the character *before* would say so.

## The Emacs half, and a regex that found nothing in a real preamble

`ksav--preamble-names` uses `\\(?:#\\)?let[ \t]+\\([^ \t\n()\[\]{};,]+\\)`. It
matched **nothing** — the elisp test suite was green and the announcement was
silent, which is the shape of a fence that cannot fail for the reason it was
written under. Bisected in a file rather than through shell-escaped `--eval`, and
the culprit is Emacs's regex reader taking `}` in a bracket expression as the
start of an interval: adding `{` to a negated class made the whole pattern match
nothing.

`[[:alnum:]_]` is the fix, and it is the *better* class anyway — an identifier is
a run of word characters, and a negated class has to escape brackets and braces
and commas to describe the same thing.

Two more things in that test file, both recorded because they are traps:

- **`with-message-to-string` does not exist.** The name sounds right. The
  capture is `cl-letf` over `message`.
- **`message-function` is read by the interactive `message` *command*, not by the
  function.** Binding it captures nothing, so the test passes for the wrong
  reason — which is exactly the failure this repository's `ONLY_AT_TOP` naming is
  about. The docstring on `ksav--say` says so.

## Fences, and what each was shown to do

| Where | Mutation | Result |
|---|---|---|
| `docfile.rs` | the advisory suppressed (`if false && …`) | three tests red |
| CLI | the `.ksav` above | `warning: … defines its own commands and they are compiled with it: 2 commands (2 lines) — דגש, mine` |
| CLI | a plain `.ksav` | nothing, and the compile line is otherwise identical |
| `ksav.el` | the announcement suppressed | `ksav-the-announcement-names-the-commands-and-their-size` red |

The negative half is asserted as firmly as the positive one in both languages: an
announcement on every open is an announcement nobody reads, and most `.ksav` files
are plain text.

## Engine tests 1001 → 1006. Editor assertions 7,638 → 7,639. Emacs 60 → 63.
