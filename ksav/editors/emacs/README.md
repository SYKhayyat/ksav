# Ksav in Emacs

Write a sefer in Emacs; Ksav's own engine typesets it.

## Install

Two steps, and neither needs a checkout of this repository or a Rust toolchain.

**1 · The package.** Download `ksav-<version>.tar` from the
[latest release](https://github.com/SYKhayyat/ksav/releases/latest) and:

```
M-x package-install-file RET ksav-0.1.0.tar RET
```

On Emacs 29 or newer you can install it from git instead, without downloading
anything:

```elisp
(package-vc-install '(ksav :url "https://github.com/SYKhayyat/ksav"
                           :lisp-dir "ksav/editors/emacs"))
```

<details>
<summary>straight.el, elpaca, or a plain <code>load-path</code></summary>

```elisp
;; straight.el
(straight-use-package
 '(ksav :host github :repo "SYKhayyat/ksav"
        :files ("ksav/editors/emacs/ksav*.el")))

;; elpaca
(elpaca (ksav :host github :repo "SYKhayyat/ksav"
              :files ("ksav/editors/emacs/ksav*.el")))

;; from a checkout
(add-to-list 'load-path "/path/to/ksav/ksav/editors/emacs")
(require 'ksav)
```

`melpa-recipe` in this directory is the same thing in MELPA's format.
</details>

**2 · The engine.**

```
M-x ksav-install-engine
```

That downloads the engine for your machine from the same release and puts it
under your Emacs directory. Nothing is written to a system path and nothing is
put on `exec-path`; if you already have a `ksav` binary of your own, it wins.

That is the whole install. `.ksav` files now open in `ksav-mode`:

| | |
|---|---|
| `C-c C-c` | typeset, and show the page |
| `C-c C-i` | insert a command, by name, in Hebrew or English |
| `C-c C-e` | export a PDF |
| `C-c C-s` | spell-check against Ksav's Hebrew and English lexicons |
| `C-c C-k` | stop the engine |

The engine starts the first time you need it and stops when Emacs exits. Point
it at one you are already running — a desktop Ksav, or another Emacs — with
`ksav-server-url`.

### Why there are two steps

This package is a client and the engine is the product; see *What this is*
below. So an Emacs with only this package installed has a door and no room.

That used to be a much worse sentence than it is now. A Ksav release attached
four desktop installers and nothing else, and the desktop shell links the engine
as a **library** — so installing Ksav put no `ksav` program anywhere on your
machine, and this README told you to run `cargo build --release`, which is a
compile of the whole Typst compiler, offered to somebody whose stated toolchain
is Emacs. A release now attaches the engine itself, per platform, and
`M-x ksav-install-engine` is the two words that fetch it.

The downloaded binary is the whole of Ksav, not a cut-down piece of it: `ksav
serve` also opens the full editor in a browser, and `ksav document.ksav` writes
a PDF from a shell.

Set `ksav-executable` if you have an engine somewhere unusual, and
`ksav-install-directory` to put the downloaded one somewhere else.

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
