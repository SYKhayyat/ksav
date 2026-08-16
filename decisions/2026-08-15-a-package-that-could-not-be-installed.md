# A package that could not be installed, and an engine nobody could get

**2026-08-15**

The Emacs package worked. Twenty-two ERT tests passed, half of them against a
real engine — a real Typst compile, a real PDF, the real Hebrew speller — and
nobody could install it.

Every route in began *clone the monorepo*. Its README said
`(add-to-list 'load-path "/path/to/ksav/editors/emacs")`. There was no archive
entry, no recipe, no tarball, and no `-pkg.el`, so `package-install-file` — the
one command an Emacs user reaches for — had nothing it could be given.

Underneath that was the worse half. The package needs a `ksav` binary, and
**there was no `ksav` binary on any machine anywhere**. A release attached four
desktop installers, and the desktop shell links the engine as a *library*, so
installing Ksav put no `ksav` program on the system. The README's answer was
`cargo build --release`, a compile of the whole Typst compiler, offered to
somebody whose stated toolchain is Emacs.

Two facts that had each been true for weeks and were never held next to each
other. The suite could not see it: every test ran the package out of the
checkout with `-L .`, which is a way nobody gets it.

## What a release attaches now

**The engine, per platform.** Built with `--features embed-ui`, so the file is
the whole product rather than a piece of it: `ksav serve` opens the editor in a
browser, `ksav sefer.ksav` writes a PDF. That is also the answer for a script,
a server, and anyone on a machine the Tauri shell does not build for.

**The Emacs package, as a tarball** that `package-install-file` accepts, with
`ksav-pkg.el` generated from `ksav.el`'s own `;; Version:` header rather than
declared a second time.

**And `M-x ksav-install-engine`**, which fetches the engine for this machine
from that release. Two commands is the whole install, with no Rust and no
checkout.

## Bare binaries, not archives

Each engine asset is the executable itself. It costs download size — the Typst
compiler is statically linked — and it buys an install path with no archive tool
shelled out to and no extraction to get wrong on one of three platforms, and it
gives somebody who is not using Emacs at all a single file they can run.

## The two names that have to agree

A workflow uploads `ksav-engine-macos-aarch64`; elisp downloads it. Nothing
about a disagreement between those two strings is visible until an install 404s
on somebody else's machine. That is the fifth instance of the shape
`engine/src/services.rs` opens by counting — the previous four were a service
missing from one of four dispatch tables, a dev proxy carrying five routes of
twelve, thirteen Tauri command names for eleven functions, and this package's
own service list — and every one was silent.

So `ksav/app/tools/emit-release-assets.mjs` holds the platform table,
`release.yml` reads it through `fromJSON` as its build matrix, and
`editors/emacs/ksav-release.el` is generated from it.

## A 404 must not become a file

`url-copy-file` is the obvious spelling and the wrong one: it writes whatever
comes back. A release with no such asset answers 404 with an HTML page, which
would be written to disk, marked executable, and surface much later as an engine
that starts and dies — a message about a typesetter, describing a download. The
status is read. The live test asks the *local* engine for a path it does not
route, so the check needs no network.

## What is fenced

Installed, not inspected. CI builds the tarball and hands it to
`package-install-file` in a clean batch Emacs, then requires the package from
the installed copy — on every push, not only on a tag, because packaging
exercised once per release is packaging that is broken on release day. A listing
of the archive's contents asks whether a file is present; this asks whether the
package loads.

And from a plain checkout with no Emacs: every feature the shipped files require
of each other is in the tarball, every platform with a desktop installer also
gets an engine, and the four files that declare Ksav's version agree — one tag
ships the engine, the application and this package, so `ksav 0.1.0` in Emacs
beside an engine from `v0.4.0` is one release telling a reader two things.

Each mutation-tested: dropping `ksav-release.el` from the tarball names the
missing feature, drifting the elisp version prints all four numbers, and
removing a platform names the triple.

## Still open

The package reaches **three of sixteen** engine services — `compile`, `commands`
and `spell`. `assemble`, `jump`, `reveal`, `suggest`, `templates`, `sefarim`,
`git`, `inbox`, `mekoros`, `linkify`, `refresh`, `clipboard-source` and
`saved-here` have no door in Emacs. Emacs is to be a first-class citizen —
everything the desktop application reaches, Emacs reaches — and the fence for
that should end with an empty exemption list rather than a documented one.
