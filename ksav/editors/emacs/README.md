# Ksav in Emacs

Write a sefer in Emacs; Ksav's own engine typesets it.

```elisp
(add-to-list 'load-path "/path/to/ksav/editors/emacs")
(require 'ksav)
```

`.ksav` files open in `ksav-mode`. Then:

| | |
|---|---|
| `C-c C-c` | typeset, and show the page |
| `C-c C-i` | insert a command, by name, in Hebrew or English |
| `C-c C-e` | export a PDF |
| `C-c C-s` | spell-check against Ksav's Hebrew and English lexicons |
| `C-c C-k` | stop the engine |

The engine starts the first time you need it and stops when Emacs exits. Point
it at one you are already running with `ksav-server-url`.

You need the `ksav` binary on `exec-path` — the same single self-contained
binary the desktop application ships, built with `cargo build --release` in
`ksav/engine`. Set `ksav-executable` if it lives somewhere unusual.

## What this is

A **client**. Nothing here parses Ksav markup, decides what a command means, or
renders anything: every one of those questions is answered by the engine over
HTTP, by the same services the desktop application and the browser build ask.

That is not modesty about the elisp. It is the one arrangement in which an
Emacs user gets *Ksav* — the real Typst compilation, the note apparatus, the
Hebrew speller, the whole command vocabulary — rather than a mode that
approximates it and drifts. The engine is the product; this is a door into it.

Which is why the service table in `ksav-services.el` is **generated** from
`engine/src/services.rs`, and why `ksav/app/test/emacs.test.mjs` fails when the
two disagree. `services.rs` opens with what a hand-written registry had already
cost this product: four copies of the list, drifted, and a service missing from
one of them so that citation autocomplete was simply dead in one build with
nothing anywhere reporting it. A fifth copy in elisp would drift the same way.

The **command vocabulary** is deliberately not generated. It is asked for at run
time from `/commands`, so `C-c C-i` offers whatever the engine you are actually
talking to knows about, including commands added after this package was written
— and it drops the deprecated ones, because the engine says which they are.

## Preview

`C-c C-c` draws the page as SVG in `*ksav page*`. That needs a graphical Emacs
built with librsvg; where it is not available the buffer says so and points at
`M-x ksav-export-pdf`, rather than being empty and looking like a compile that
produced nothing.

A document that does not compile keeps the last page that did. A writer types
through broken states continuously, and blanking the preview at every
half-finished keystroke makes it useless exactly when it is being used. The
diagnostics appear in `*ksav diagnostics*` and go away by themselves once the
document compiles again.

## Direction

`ksav-mode` sets `bidi-paragraph-direction` to `right-to-left`, because Ksav is
Hebrew-first and this is the honest default for it. Emacs' own default infers
direction from the first strong character of each paragraph, which is wrong
exactly when a Hebrew paragraph opens with a command. Set
`ksav-paragraph-direction` to `left-to-right` for an English document, or to
`nil` to get Emacs' inference back.

The syntax table also declares Hebrew letters to *be* letters, without which
`forward-word` and every `\w` regexp stop at the first one.

## Tests

```sh
emacs -Q --batch -L . -l ksav.el -l ksav-tests.el -f ert-run-tests-batch-and-exit
```

Two halves. Everything up to `ksav-live-` runs with nothing installed and
nothing running: the service table, the mode, the syntax, the insertion
convention, how a refusal is read. The `ksav-live-` tests need a `ksav` binary
and drive a real engine — a real compile, a real PDF, the real Hebrew speller.

They skip when there is no binary, and setting `KSAV_EMACS_LIVE=1` turns that
skip into an error. CI sets it, so the half of the suite that proves this
package talks to an engine cannot quietly stop running on the machine whose job
is to run it.
