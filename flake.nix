# A development environment for Ksav, on any machine Nix runs on.
#
# Ksav builds out of four toolchains — a Rust engine, a Node editor, a wasm
# bundle and a Tauri desktop shell — and until this file existed the only
# statement of which versions those are was `.github/workflows/ci.yml`, which is
# a description of GitHub's runners rather than something a person can enter. On
# a distribution that follows the FHS you can paper over that by installing the
# four by hand and being roughly right. On NixOS you cannot: a prebuilt
# dynamically-linked binary does not run out of the box. Measured rather than
# assumed — a stock `node` tarball there answers
#
#     Could not start dynamically linked executable: …/bin/node
#     NixOS cannot run dynamically linked executables intended for generic
#     linux environments out of the box.
#
# The interpreter path `/lib64/ld-linux-x86-64.so.2` does exist, which is the
# detail the first draft of this comment got wrong: it is a stub that refuses
# and says so, rather than a file that is missing. The consequence is the same.
#
# That is not hypothetical for this repository. `ci.yml` and `deploy.yml` both
# install wasm-pack with
#
#     curl -sSfL https://rustwasm.github.io/wasm-pack/installer/init.sh | sh
#
# which downloads exactly such a binary. It is right for a GitHub runner and it
# cannot work on NixOS. The shells below take wasm-pack from nixpkgs instead, so
# the same build is reachable on both.
#
#   nix develop                 # engine + editor + wasm
#   nix develop .#desktop       # the above, plus the Tauri (GTK/WebKit) deps
#   nix flake check             # evaluate every shell on every system
#
# Node matches the workflows exactly, because on this repository "green on my
# machine" has genuinely not been evidence — a newer local Node has accepted
# TypeScript syntax the CI Node rejected. Writing that pin here is what makes the
# two the same fact rather than two that agree until they do not.
{
  description = "Ksav — a Hebrew-first writing system on real Typst";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      # Written out rather than pulled from flake-utils: one input fewer to pin,
      # and the list is three lines.
      #
      # `x86_64-darwin` — an Intel Mac — is deliberately absent, and not because
      # nobody uses one: nixpkgs 26.11 has dropped support for it outright, so
      # listing it would produce a shell that cannot evaluate, which is a worse
      # answer than not claiming it. `nix flake check --all-systems` says so in
      # one line. An Intel Mac needs `nixpkgs` pinned back to a release that
      # still had it; CI's own `engine on macOS` job is the other half of that
      # story and runs on GitHub's runners, not on this.
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAll (pkgs:
        let
          # What every part of the build needs, whatever you are working on.
          #
          # Node 24 because the workflows pin 24. Bump this and them together,
          # never one: a shell whose Node differs from CI's is the "green on my
          # machine" this file exists to close.
          #
          # The pin was 20 until Node 20 reached End-of-Life on 2026-04-30 —
          # which is also why current nixpkgs has no `nodejs_20` to give, and how
          # the staleness surfaced at all. The rule that a test must import from
          # `.tmp-test/` rather than `../src/` does *not* depend on that version:
          # `runner.test.mjs` sweeps for it directly.
          common = with pkgs; [
            nodejs_24
            rustc
            cargo
            rustfmt
            clippy
            wasm-pack
            wasm-bindgen-cli
            # The linker the `wasm32-unknown-unknown` target reaches for.
            #
            # Not obvious, and not caught by having wasm-pack: rustc normally
            # ships `rust-lld` inside its own sysroot, and the nixpkgs build does
            # not, so `wasm-pack build` got all the way through compiling every
            # dependency and then stopped on
            #
            #     error: linker `lld` not found
            #
            # Which is the joke of this file finding itself out — its stated
            # reason for existing is that the workflows install wasm-pack with a
            # `curl | sh` binary that cannot run on NixOS, and the first shell
            # that fixed that shipped the tool without the linker under it. The
            # engine's own 761 tests passed on NixOS in the same run, because a
            # native build uses the stdenv cc and never wants lld at all.
            lld
            pkg-config
            git
          ];

          # The Emacs client has its own test suite (`ksav/editors/emacs`), and
          # it looks for the engine on `exec-path` rather than in an environment
          # variable — so `cargo build` first, then put `target/debug` on PATH.
          emacs = pkgs.emacs-nox;

          # Tauri on Linux links against the system WebKit and GTK. Kept in its
          # own shell because webkitgtk is a large download and nothing else in
          # the repository needs it. On Darwin the platform WebView is used and
          # none of this applies.
          desktop = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux (with pkgs; [
            webkitgtk_4_1
            gtk3
            glib
            cairo
            pango
            gdk-pixbuf
            atk
            libsoup_3
            librsvg
            openssl
          ]);

          hello = name: ''
            echo "Ksav dev shell (${name})"
            echo "  node    $(node --version)"
            echo "  cargo   $(cargo --version | cut -d' ' -f2)"
            echo "  emacs   $(emacs --version | head -1 | cut -d' ' -f3)"
            echo
            echo "  cd ksav && node tools/gate.mjs      # the whole gate, 9 checks"
          '';
        in
        {
          default = pkgs.mkShell {
            packages = common ++ [ emacs ];
            shellHook = hello "default";
          };

          desktop = pkgs.mkShell {
            packages = common ++ [ emacs ] ++ desktop;
            shellHook = hello "desktop";
          };
        });

      formatter = forAll (pkgs: pkgs.nixpkgs-fmt);
    };
}
