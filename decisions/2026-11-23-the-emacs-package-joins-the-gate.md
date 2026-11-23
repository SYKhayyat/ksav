# The Emacs package joins the gate, twice

**2026-11-23**

The gate is the one command this repository documents and the one `ci.yml` splits
by group name. The Emacs package's sixty-six tests were not in it. They were
spelled out twice in `ci.yml` — a byte-compile, an `rm` of its leftovers, an ERT
run with `KSAV_EMACS_LIVE` in the step's environment — and nowhere else.

The cost is not that the setup was untidy. #234 moved `/commands` and
`/templates` to the envelope and left two readers behind, so
`M-x ksav-insert-command` offered `ok · commands` to anyone who installed the
package, and the commit that did it passed a gate that had opened none of its
files. A command spelled outside the runner is invisible to the sweep that keeps
every check in one place: the same hole #115 closed for build recipes and `.mjs`
tooling, one directory over.

## Three checks, and the suite runs twice on purpose

`node tools/gate.mjs emacs` is `emacs-compile`, `emacs-tests`, `emacs-tests-live`.

The suite is run twice because there are two claims and they are about different
things. One is about the package's own decisions — the service table, the mode,
the syntax, the insertion convention, how a refusal is read — and those must hold
with nothing installed and nothing running. The other is about the wire: fifteen
of the sixty-six drive a real engine — a real Typst compile, a real PDF, the real
Hebrew speller — and they skip without one.

A skip is honest and it is still a green tick over tests that did not run, which
is #91. So the live check sets `KSAV_EMACS_LIVE`, where the absence of a binary is
an error rather than a skip, and the offline check sets `KSAV_EMACS_TEST_OFFLINE`,
which asks for the offline half **by name**.

That second variable exists because the first design got it wrong in a way worth
recording. The offline half was decided by `(executable-find ksav-executable)` —
"is there an engine to talk to" — and the desk this was written on has one in
`~/.local/bin`. So the check whose whole claim was *quick and needs nothing* ran
the live half against whatever binary happened to be installed: eight minutes,
then a failure. A half that is named is the half that runs; a half that is
inferred is a half that drifts towards whatever the machine has.

## What a check may need

`needs` held only `pkg`, a `pkg-config` library, and every sentence written about
it said so: *"gdk-3.0 is not in this shell"*, and the way to measure it was
`nix develop .#desktop`. Three needs now, and they are three different facts:

| field | what it is | what a reader is told | how to fix it |
|---|---|---|---|
| `pkg` | a library this shell lacks | *not in this shell* | the dev shell that has it |
| `bin` | a program (here: `emacs`) | *not on this machine's search path* | install it |
| `built` | a binary this tree produces | *not built here* | build it |

A missing need is a `–` and not a `✗` — #181 — unless the run says `--require`.
The engine is deliberately a **build product**: `engine/target` is ignored, so a
fresh clone has no binary and has done nothing wrong, and the gate puts its
directory in front of the search path rather than every job and every reader
exporting a `PATH` of their own.

## Why the byte-compile does not write beside the sources

The shell step this replaces ended with `rm -f ./*.elc`, which is a compile check
apologising for dirtying the tree it is checking. It is not only untidiness: the
next thing the gate does is load `ksav.el`, and a `.elc` of the same vintage
beside it is not guaranteed to be the source that was just linted.

So the two settings live in `editors/emacs/gate-options.el` and not in a
200-character `--eval` — a shell-quoted one-liner inside an argv array is a
command that breaks in whichever shell parses it — and `byte-compile-dest-file-function`
sends the `.elc` files to `temporary-file-directory`. Warnings are errors in that
same file, for the reason the check's comment gives: `string-replace` against a
declaration of 27.1 failed with a `void-function` backtrace from three `let`s
deep, while the byte compiler would have named the line.

## The two jobs, and the one flag they do not pass

The floor job builds the engine and calls `node tools/gate.mjs emacs --require`.
The newer-Emacs job has no engine **on purpose** — the fault it was written for is
one where no engine gets started, so the assertion that catches it needs none —
so the live check is reported as *not measured here*, the offline check and the
byte-compile run, and the line it runs says which check it cannot measure:

```yaml
run: node tools/gate.mjs emacs   # not measured here: emacs-tests-live — no engine, deliberately
```

That is the only invocation in `ci.yml` that omits `--require`, and the sweep now
requires such a line to name a check that exists. A silent omission stays a
failure.
