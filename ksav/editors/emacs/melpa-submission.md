# Submitting this package to MELPA

Everything the pull request needs, written down so opening it is a copy rather
than a fresh set of decisions. **This has not been opened.** It is a pull
request against somebody else's repository under a real person's name, so a
person opens it.

Until it is open there is no `M-x package-install RET ksav`, and that — not any
missing feature — is the bar for an Emacs user being a first-class one.
MELPA answers 404 for `ksav` today.

## 1 · The blocker, and when it lifts

MELPA's checklist has a line this package could not honestly tick before
**23 August 2026**:

> The package has been maintained in a public repository for 1 month or more

`github.com/SYKhayyat/ksav` became public on **23 July 2026**. Nothing else on
the checklist is outstanding — see §3, where each box is answered with what was
actually run rather than with an intention.

## 2 · The recipe

MELPA keeps one file per package, named after the package, with no extension, at
`recipes/ksav` in `github.com/melpa/melpa`. The content is
[`melpa-recipe`](melpa-recipe) in this directory, verbatim and without its
comment header — the comments are for readers here, not for MELPA:

```elisp
(ksav :fetcher github
      :repo "SYKhayyat/ksav"
      :files ("ksav/editors/emacs/ksav-services.el"
              "ksav/editors/emacs/ksav-release.el"
              "ksav/editors/emacs/ksav-engine.el"
              "ksav/editors/emacs/ksav-girsa.el"
              "ksav/editors/emacs/ksav-git.el"
              "ksav/editors/emacs/ksav-preview.el"
              "ksav/editors/emacs/ksav-write.el"
              "ksav/editors/emacs/ksav.el"
              "ksav/editors/emacs/README.md"))
```

`:files` is explicit because the package lives in a subdirectory of a monorepo,
where MELPA's default — top-level `*.el` — finds nothing at all. The list is
held against the release tarball's contents by `app/test/emacs.test.mjs`, so it
cannot fall behind the package the way a hand-kept list does.

`ksav-tests.el` is deliberately outside it: it is the real suite, CI runs it
against a live engine, and it wants `ert` and a checkout. Shipping it to every
installation is a file nobody loads.

## 3 · The pull request

Title, exactly as MELPA's template asks for it:

> Add recipe for ksav

### Brief summary of what the package does

`ksav-mode` opens `.ksav` files and drives the Ksav engine — a Hebrew-first
typesetting engine built on real Typst compilation. `C-c C-c` typesets the
buffer and shows the page, `C-c C-i` inserts a command by name in Hebrew or
English, `C-c C-e` writes a PDF, `C-c C-s` runs the Hebrew and English spellers.
It starts an engine for you and stops it when Emacs exits, and
`M-x ksav-install-engine` downloads one for this machine so no Rust toolchain is
needed.

It is a client and nothing more: no elisp here parses Ksav markup, decides what
a command means, or renders anything. Every service the engine answers has a
door in Emacs, and that table is generated from the engine's own registry.

### Direct link to the package repository

https://github.com/SYKhayyat/ksav — the package is in
[`ksav/editors/emacs`](https://github.com/SYKhayyat/ksav/tree/main/ksav/editors/emacs).

### Your association with the package

Maintainer.

### Relevant communications with the upstream package maintainer

None needed — this is my own package.

### Checklist

| MELPA asks | Answer |
|---|---|
| GPL-compatible licence | **Yes.** MIT OR Apache-2.0, at the user's option; every file carries `SPDX-License-Identifier: MIT OR Apache-2.0`. Both are GPL-compatible, and Apache-2.0 is compatible with GPLv3. |
| Read `CONTRIBUTING.org` | Do this before opening; it changes. |
| `Assisted-by:` for AI-generated code | **This one needs a decision — see §4.** |
| Public repository for 1 month or more | **Not yet.** Public 23 July 2026; the line is true from 23 August 2026. |
| `package-lint`, latest, feedback addressed | **Clean.** Run over all eight shipped files with `package-lint-main-file` set to `ksav.el`. The one warning it did raise — `Emacs` in the summary line being redundant — was fixed by rewording the summary rather than ignored. |
| Byte-compiles cleanly | **Yes**, and with `byte-compile-error-on-warn`, on every push, on two Emacs versions. |
| `M-x checkdoc` | **Clean**, over every shipped file. |
| Built and installed per `CONTRIBUTING.org` | **Yes.** CI builds the tarball and hands it to `package-install-file` in a clean batch Emacs on every push, then requires the package from the *installed* copy — not a listing of the archive's contents, which asks whether a file is present rather than whether the package loads. |

The last four are held by CI rather than by having been run once: `ci.yml`'s
`the Emacs package, current Emacs` job runs `package-lint` and `checkdoc`
exactly as MELPA does. A submission that was clean on the day it was written and
nowhere after is the failure this repository has a name for.

## 4 · The `Assisted-by:` question

MELPA's checklist carries a line about code generated with an LLM's help, and
`CONTRIBUTING.org` describes an `Assisted-by:` trailer for it. This package was
written that way. Read `CONTRIBUTING.org` at the time of submission for the
exact form it wants and add the trailer to the commits or to the file headers as
it specifies — the requirement is recent enough that the spelling is worth
re-reading rather than copying from here.

Do not tick that box either way without doing this. It is the one item on the
checklist that is about honesty rather than about tooling.

## 5 · After it lands

`M-x package-install RET ksav` becomes the first line of
[`README.md`](README.md)'s install section, ahead of the tarball and
`package-vc-install`. The tarball stays: it is what a release attaches, and it
is the route that works with no archive configured.
