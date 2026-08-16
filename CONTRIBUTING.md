# Contributing to Ksav

Welcome. This page gets you from a fresh clone to a change that lands.

If you have never opened Ksav as a writer, spend five minutes on
[`docs/start-here.md`](docs/start-here.md) first. It is hard to have an opinion
about the shape of the code without having seen the thing it is shaped for.

| | |
|---|---|
| **Want to know how it fits together?** | [`ksav/README.md`](ksav/README.md) — the engine, the editor, the three builds, the services |
| **Working on the seam with Girsa?** | [`docs/girsa.md`](docs/girsa.md) |
| **Want to know *why* something is like that?** | [`decisions/README.md`](decisions/README.md) |
| **Writing in Emacs rather than in the app?** | [`ksav/editors/emacs/README.md`](ksav/editors/emacs/README.md) |
| **Looking for what to work on?** | [`HANDOFF.md`](HANDOFF.md) — what is open, what is deliberately not yours to close, and the lessons that were paid for |

---

## 1 · The one thing to understand first

Ksav has one bug, over and over, and every convention below exists because of
it:

> **The engine is right and the surface lies about it.**

Not a metaphor. A chip that rendered itself greyed-out and clicked anyway. A
menu item wired to nothing, which threw on the first press and said nothing
before it. A registry of what the engine can do, hand-copied into four places,
which drifted — so citation autocomplete was simply dead in one build with
nothing anywhere reporting it. A version-control drawer that opened, held
nothing, and explained nothing. In each case the engine underneath was fine.

So the standard here is not "does it work". It is **can something other than a
person notice when it stops working** — and, when it is broken, does the reader
find out from the application rather than from silence.

That has a practical consequence for you: **a change that edits nothing but
prose can fail the gate**, and that is working as intended. A page that says how
many keyboard bindings there are, on the day somebody adds one, is a bug with a
test against it.

---

## 2 · Setting up

### What you need

| | |
|---|---|
| **Rust** | stable, with `clippy` and `rustfmt` |
| **Node** | 24, which is what CI pins — see the note under *Nix* below |
| **git** | not only to clone: four dependencies are fetched from git, and version control inside Ksav drives the `git` on your machine |
| **Linux only, for the desktop shell** | `libwebkit2gtk-4.1-dev librsvg2-dev patchelf build-essential libssl-dev libgtk-3-dev libayatana-appindicator3-dev` |

Not `libappindicator3-dev`. It and the ayatana package conflict, apt exits 100,
and you never reach a compiler.

### Nix, and NixOS

`flake.nix` is the same four toolchains as a shell you can enter, which is the
only way to get them on NixOS: a prebuilt dynamically-linked binary does not run
there out of the box, and the `curl | sh` installer the workflows use for
wasm-pack downloads exactly one of those. The shell takes wasm-pack from nixpkgs
instead.

```sh
nix develop           # engine + editor + wasm + Emacs
nix develop .#desktop # the above, plus the Tauri GTK/WebKit deps
```

`x86_64-linux`, `aarch64-linux` and `aarch64-darwin`. An Intel Mac is not
offered because nixpkgs has dropped it, and a shell that cannot evaluate is a
worse answer than an absent one.

Node is pinned to the same version as the workflows, in both places, and they
move together. This repository has been bitten by a local Node accepting
TypeScript syntax that the CI Node rejected, so a shell on a different version
would make "green on my machine" mean less than it says.

### Clone and build

```sh
git clone https://github.com/SYKhayyat/ksav
cd ksav/ksav/app
npm install
npm run build
cd ../engine
cargo run --release --features embed-ui -- serve
```

Those steps are in that order for a reason the build will not explain to you.
`embed-ui` bakes `app/dist` into the binary with `include_dir!`, at compile
time; `dist/` is git-ignored, so building the server first fails inside a
procedural macro with a message about a missing directory rather than about the
step that was skipped. `build.rs` says so in words now.

Open the URL it prints. That is the whole application.

### The other two ways it builds

The same Rust engine ships three ways from one codebase, and a change can be
correct in one and broken in another:

| | |
|---|---|
| **server** | `cargo run --features embed-ui -- serve` — HTTP, the editor served from the binary |
| **browser (wasm)** | `ksav/wasm`, built with `wasm-pack`; no server, Typst in the tab |
| **desktop** | `ksav/app/src-tauri`, a native window with the engine in-process |

The one that catches people is wasm. It has no filesystem, no threads, no
clock, and no loopback — so a service that reaches for any of those is
`#[cfg(not(target_arch = "wasm32"))]` and answers with a *stated refusal* on
that build rather than not existing. `Reach` in `ksav/engine/src/services.rs` is
where that is declared.

---

## 3 · The gate

One command, and it is the whole of what has to pass before you push:

```sh
cd ksav && node tools/gate.mjs
```

It runs nine checks, and you can select a part of it while you work
(`node tools/gate.mjs editor`). A name is a kind of check — `fmt` — or a body of
code — `editor`, `engine`, `shell`, `wasm` — and naming a tree runs *every* check
about that tree, formatting included. A partial run ends by listing the checks it
did not run, so a green subset is never mistakable for a green gate.

**Do not spell the check commands out yourself.** They live in
`ksav/tools/gate.mjs` and nowhere else, and `app/test/gate.test.mjs` fails if a
check command reappears as a literal in a workflow or in any living page. That
is not tidiness: this repository once listed six commands in a README beside
nine steps in a workflow, and for four consecutive pushes the *only* red job was
formatting — eleven seconds, first step — with fifty-four unformatted hunks
piling up under it. A gate nobody can run in one command gets read as a
suggestion.

Three things CI does that the gate deliberately does not, because they need a
toolchain, a browser or an Emacs that a plain checkout should not have to have:
it builds the wasm engine and runs it, it embeds the editor in the server and
drives a real browser through the assembled application, and it runs the Emacs
package's own suite against a live engine.

---

## 4 · The rules that bind every change

These are not style preferences. Each one is a fault this repository actually
shipped.

### Fix the class, not the instance

An audit of this codebase and its two siblings found one habit, eighteen times:

> the diagnosis is written down correctly and the sweep never runs.

A class named in prose, one member fixed, the siblings left standing. So when
you find a fault, the commit that fixes it also **sweeps for its siblings** and
turns the class into an executable prohibition.
`ksav/app/test/prohibitions.test.mjs` is where those live — repo-wide, every
language, each one carrying the finding that produced it.

### Mutation-test every fence you write

A green test proves nothing until you have watched it go red. Break the thing it
guards — `git stash`, check out the pre-fix file, write a deliberately bad one —
and confirm two things: that it fails, and that its message **names the
instance**. Say so in the commit.

This is not ceremony. A guard here once matched its own function definitions and
stayed green while the entire global Escape handler was deleted. Another looked
for `process.exit(1)` within 1,800 characters of a function name and found the
*next* function's exit. Both were written by someone confident they were right.

### Broken beats unannounced

When a feature does not work, the feature is the finding and the missing error
message is a subordinate clause. Fix the feature. But a state a reader can be
stuck in must say so, in words, in both languages, and say what to do about it —
"not available" covering three different situations with three different answers
is the fault, not the fix.

### Build, don't delete

A dead feature is unfinished, not unwanted. If you find something wired to
nothing, wire it up. Removing one is a decision for a person, not a cleanup.

### Values cross a language boundary as values

Four tables in this repository were once read by *parsing Rust source* from
JavaScript, and one of them was silently wrong. Now `engine/src/facts.rs`
serialises them into `engine/facts.gen.json`, and the generators read that.
Nothing outside `app/tools/facts.mjs` may open a `.rs` file to read a value out
of it, and a test enforces it.

When you change a table in Rust, the artefacts downstream of it have to be
regenerated:

```sh
cd ksav/engine && KSAV_BLESS=1 cargo test --test facts   # facts.gen.json
cd ../app && node tools/emit-services.mjs                # and the rest
```

`npm test` fails when a generated file is stale, so a forgotten step is a red
suite rather than a feature that quietly does nothing in one of the builds.

### Every language the reader might be in

The whole interface flips between Hebrew and English, right-to-left and
left-to-right. A string added to one dictionary and not the other is caught; a
sentence that reads as neither language because a bilingual name was spliced
into it is not, so do not write one. Two sentences, one per language.

---

## 5 · Where code is allowed to live

`ksav/app/src/main.ts` is the shell, and it is large. That is a fact about its
history, not a licence: **decisions do not belong in it**, because nothing can
import it and therefore nothing can test it.

| A decision about… | goes in |
|---|---|
| what the header shows | `header.ts` |
| which surfaces exist, and how you get out of one | `panels.ts` |
| the rows a list panel shows | `panelrows.ts` |
| what a whole panel contains | `panelviews.ts` |
| what version control amounts to | `git.ts` |
| what the engine can be asked for | `engine/src/services.rs` |

The test for whether something is a decision: *could it be wrong without
crashing?* A chip's glyph, an empty state's sentence, which remote a button
pushes to, whether a section appears at all — all of those can be wrong while
everything runs, and all of them belong somewhere a test can reach.

`main.ts` may fetch elements, hold application state, and wire callbacks. It may
not decide what a reader is told.

---

## 6 · Tests

`ksav/app/test/run.mjs` builds **every module in `src/`** and runs every
`test/*.test.mjs`, so adding a test is adding a file. The module list is read
off the directory rather than written down — it used to be a hand-written array
that had stopped growing, and nineteen modules had no test between them.

A few conventions worth knowing before you write one:

- **Import from `.tmp-test/`, never from `../src/`.** The runner bundles the
  modules; a module reached directly arrives without the bundling that makes the
  shared singletons in `src/` behave as one copy, and a `.ts` import depends on
  your Node version stripping types, which is the least reproducible thing about
  a checkout. `runner.test.mjs` sweeps for both spellings, static and dynamic.
- **Assert the class, not the shape.** `SERVICES.len() == 15` is a tripwire on
  the wrong wire: it goes red for a sixteenth service, which is not a defect,
  and says nothing about whether any of them work. Assert what has to survive
  growth — names are distinct, every name is answerable, every empty list says
  what empty means.
- **A skip that nothing can turn off is a test nobody runs.**
  `skips.test.mjs` polices this, including the shape where a loop's `continue`
  can skip every case and still pass.
- **Rule out your own setup before filing a finding.** Thirteen shortcuts were
  once reported dead on the strength of a test driver sending a keypress no
  browser sends. Two CI failures in one day came from a machine that was *more*
  permissive than the runner. Reproduce it the way a reader would meet it.

---

## 7 · Commits and pull requests

### Commit messages

Write what changed and **why it was wrong before**. A message that says "fix
panel" is worth nothing in a year; the ones in this history say what the fault
was, what class it belonged to, and what now makes it impossible. Plain
professional English, a real subject line, and the body doing the work.

If you wrote a fence, say what mutation you used to prove it fails.

### Before you push

```sh
cd ksav && node tools/gate.mjs
```

And if you touched the editor's chrome, drive the assembled application:

```sh
cd ksav/app && npm run build
cd ../engine && cargo build --release --features embed-ui
cd ../.. && node .github/scripts/acceptance.mjs
```

It boots the real binary in a real browser and looks at the screen — that step
exists because Playwright's own actionability check passes an element at
`opacity: 0`, so eight steps of clicking had proved nothing about whether
anything was visible.

The browser is one you already have. `playwright-core` ships none (14 MB against
150), so this drives Chrome, then Edge, then Chromium, whichever answers first —
and if none does it says which to install for the platform you are on. Under WSL
that means installing one **inside the distro**: the Chrome on the Windows side
of the same machine is not reachable from a Linux Playwright, and the failure it
produces if you try says only that no browser started.

---

## 8 · Documentation, and the two kinds of page

This repository keeps a hard partition, and the tests know about it:

- **Living pages** are edited in place and must be true *now*. Every README,
  every page under `docs/`, `spec.md`.
- **The record** — [`decisions/`](decisions/README.md) and `lamdan/` — is
  written once, dated, and never edited afterwards. A record says what was true
  on its day, including the parts that stopped being true.

The consequence is a rule that surprises people: **a living page may not state a
count that nothing measures.** The sweep runs both directions — every fenced
claim must appear, and every number standing beside a fenced noun must be a
claim. If you add a page that says how many of something there are, either the
number is measured in `app/test/docfacts.mjs` or the sentence has to go.

Also checked: every relative link resolves to a tracked file, every source path
named in prose exists, and every keyboard chord mentioned is a real binding with
the surrounding sentence saying what it does.

When you finish a substantial piece of work, write it up in `decisions/` as
`YYYY-MM-DD-slug.md` and add the row to `decisions/README.md`. A test fails if
you forget the row.

---

## 9 · Where to ask

Open an issue. If it is about the seam with Girsa, say which side you are
standing on — the two applications are one product with a process boundary
through the middle, and half of the confusing bugs are somebody assuming the
other half's behaviour. [`docs/girsa.md`](docs/girsa.md) is the map.
