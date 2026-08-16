# Every machine but this one

*16 August 2026.*

Asked for after the structural-children work: *"i need this to work on every
os — i have wsl"*, then *"i want this also to work on nixos"*.

Ksav builds out of four toolchains — a Rust engine, a Node editor, a wasm bundle
and a Tauri desktop shell — and the only statement of which versions those are
was `.github/workflows/ci.yml`. That is a description of GitHub's runners, not
something a person can enter. It is enough on a distribution that follows the
FHS, where you install the four by hand and are roughly right. It is not enough
on NixOS, where there is no `/usr/bin` and a prebuilt dynamically-linked binary
does not run at all, because the ELF interpreter it names is not there.

## What was actually checked, rather than reasoned about

Everything below was run, not inferred. Two WSL distributions were already on
this machine and one of them had Nix, which is the only reason any of this is
evidence rather than a plausible file.

| claim | how it was settled |
|---|---|
| line endings survive a Linux checkout | `git clone` into WSL; **0 CR bytes** in the prelude, `mode.ts`, `children.rs` |
| the engine passes on Linux | `cargo test` in WSL Ubuntu: **761 tests, 44 binaries, 0 failures** — identical to Windows |
| the dev shell evaluates everywhere | `nix flake check --all-systems` |
| the dev shell *builds* | `nix develop` → Node 24.19.0, cargo 1.97.0, wasm-pack 0.15.0, Emacs 30.2 |
| the editor passes inside it | `npm ci && npm test` in the shell, in a clean clone |

## The flake

`nix develop` for engine + editor + wasm, `nix develop .#desktop` for the Tauri
GTK/WebKit deps on top. Three systems: `x86_64-linux`, `aarch64-linux`,
`aarch64-darwin`.

`x86_64-darwin` — an Intel Mac — is deliberately absent. Not an oversight:
nixpkgs 26.11 has dropped support for it, so listing it produces a shell that
cannot evaluate, and `nix flake check --all-systems` says so in one line. An
absent claim beats a broken one.

wasm-pack comes from nixpkgs rather than from the `curl | sh` installer the
workflows use. That installer is right for a GitHub runner and cannot work on
NixOS, for the ELF-interpreter reason above. The workflows keep it; the shell
does not need it.

## What the flake found on its way in

**Node 20 has been End-of-Life since 2026-04-30.** Current nixpkgs has no
`nodejs_20` — the attribute name is still there and evaluating it throws, which
is how a `nix flake check` surfaced a fact about this repository's CI that
nothing in this repository was in a position to notice. All three workflows
pinned 20, on eleven lines.

[The pins nobody was watching](2026-08-16-the-pins-nobody-was-watching.md),
written this morning, had explicitly left that pin alone: *"CI pins 20 because
that is the floor the editor claims."* Both halves of that turn out to be wrong.
`package.json` declares no `engines`, so nothing claims 20; and the rule the pin
was thought to protect — a test must import from `.tmp-test/`, never `../src/`,
because Node 20 cannot strip TypeScript types and so a direct `.ts` import kills
the job — has had its own sweep in `runner.test.mjs` since the day it was
written. The rule never depended on the runtime.

So `node-version` is 24 across all three workflows, and the flake pins the same.

## The mistake worth recording

I diagnosed that sweep as *missing*, and wrote a second one. It failed on its
first run, on its own comment — the line documenting the pattern contained the
pattern — and the run that told me so also printed
`no test imports out of src/ directly`, which is the fence that already existed,
twenty lines further up the same file, comment-stripping included.

A duplicate fence is not a harmless extra. Two spellings of one rule is the
defect family this repository is named for, and it would have been added by the
person writing a record about not doing that. What survives from the attempt is
one line: the existing sweep matched `from "../src/…"` and not
`import("../src/…")`, so it read the spelling that had gone wrong once rather
than the rule it was written for. Both now.

## Not settled

- **NixOS itself.** The shells were built with Nix on Fedora, which validates
  the derivations and the package set. It is not the same as booting NixOS,
  where the absence of FHS bites things the shell does not provide.
- **`nix develop .#desktop` was evaluated, not built.** webkitgtk is a large
  download and nothing here needed it yet; a Tauri build on Linux is the thing
  that would prove it.
- **The Emacs client** is in the shell but its live tests were not run there.
  CI runs `emacs-nox` 27.1; the shell gets 30.2, and `HANDOFF.md` already notes
  those two disagree about `image-size`.
