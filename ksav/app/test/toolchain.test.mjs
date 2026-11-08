// The toolchain a contributor is told to use, everywhere, and that the values
// agree.
//
// # The finding (#107)
//
// node/rust versions were stated in **five** places, in three incompatible
// schemes:
//
//   - `.nvmrc` said `26.4.0` — the only file that controls what `nvm use`
//     installs — while every workflow pinned `node-version: 24`, `flake.nix`
//     built `nodejs_24`, the AppImage Dockerfile installed
//     `setup_20.x`, and the package had no `engines` field at all. A
//     contributor following `.nvmrc` got Node 26; CI ran Node 24; AppImage
//     builds baked in Node 20. Three answers, none of them wrong by intent,
//     all of them right by accident for whoever read one file.
//
//   - Rust: `rust-toolchain.toml` pinned `1.97.1`, the workflows installed
//     `dtolnay/rust-toolchain@stable`, and the Dockerfile ran rustup with
//     `--default-toolchain stable`. "Stable" is not a version, so the pin was
//     the *only* statement of what the suite is written and checked against,
//     and two of the three installers ignored it.
//
// Now there is one answer for each toolchain, and a test that all the people
// who state it agree:
//
//   - `.nvmrc` is the Node source; every workflow installs from it in the same
//     spelling (`node-version-file: .nvmrc`), so there is nothing in CI to
//     drift against it. The Dockerfile and the flake must match its major;
//     `package.json`'s `engines` must accept it.
//   - `rust-toolchain.toml` is the Rust source; every workflow says the same
//     version (`dtolnay/rust-toolchain@1.97.1`, which also saves CI the wasted
//     stable-then-pin download), and the Dockerfile's rustup line must name it.
//
// `flake.nix`'s Rust is left alone deliberately: nixpkgs ships whatever
// compiler it has, so the flake cannot pin 1.97.1 without forking rustc; the
// flake's *Node* must match because Node 24 is both a stated value and an
// installed package.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { APP, ROOT } from "../tools/paths.mjs";
import { check, ok } from "./harness.mjs";

const read = (p) => readFileSync(p, "utf8");

const nvmrc = read(path.join(ROOT, ".nvmrc")).trim();
const toml = read(path.join(ROOT, "rust-toolchain.toml"));
const docker = read(path.join(ROOT, "ksav/packaging/linux.Dockerfile"));
const flake = read(path.join(ROOT, "flake.nix"));
const pkg = read(path.join(APP, "package.json"));

const workflows = readdirSync(path.join(ROOT, ".github/workflows"))
  .filter((f) => f.endsWith(".yml"))
  .map((f) => read(path.join(ROOT, ".github/workflows", f)));

export async function run() {
  // --------------------------------------------------------------- Node

  const major = (v) => v.replace(/[^\d.].*$/, "").split(".")[0];
  check("node/nvmrc is one value, not a range", /^\d+$/.test(nvmrc), true);

  // No workflow may state a version; every one must install from the file, so
  // the file is the only place CI ever learns the number from.
  check(
    "no workflow pins a node version by hand",
    workflows.filter((w) => /node-version:\s*\d/.test(w)),
    [],
  );
  const filePins = workflows.flatMap((w) => [...w.matchAll(/node-version-file:\s*(\S+)/g)].map((m) => m[1]));
  check(
    "every workflow installs node from the same file",
    new Set(filePins),
    new Set([".nvmrc"]),
  );

  // The other three speakers must be saying the same major.
  const dockerNode = docker.match(/setup_(\d+)\.x/)?.[1];
  const flakeNode = flake.match(/^\s*nodejs_(\d+)\s*$/m)?.[1];
  check("node/Dockerfile installs the same major as .nvmrc", dockerNode, major(nvmrc));
  check("node/flake.nix provides the same major as .nvmrc", flakeNode, major(nvmrc));
  check(
    "node/engines will accept the file's major",
    pkg.includes(`"engines"`) && pkg.includes(`"node": ">=${major(nvmrc)}"`),
    true,
  );

  // --------------------------------------------------------------- Rust

  const tomlChannel = toml.match(/channel\s*=\s*"([^"]+)"/)?.[1];
  check("rust/rust-toolchain.toml names a real version", /^\d+\.\d+\.\d+$/.test(tomlChannel ?? ""), true);

  const actionVersions = [
    ...new Set(workflows.flatMap((w) => [...w.matchAll(/dtolnay\/rust-toolchain@([^\s"]+)/g)].map((m) => m[1]))),
  ];
  check("rust/every workflow pins the same toolchain", actionVersions, [tomlChannel]);
  check("rust/no workflow says 'stable' instead of a version", actionVersions.includes("stable"), false);

  const rustupPin = docker.match(/--default-toolchain\s+([^\s]+)/)?.[1];
  check("rust/the Dockerfile rustup line names the pin", rustupPin, tomlChannel);

  // The flake's rustc is deliberately not asserted — nixpkgs ships what it
  // ships, and the flake cannot promise 1.97.1; see the header comment.
  ok("rust/flake.nix gives a rustc (whatever nixpkgs has)", /^\s*rustc\s*$/m.test(flake));
  ok("rust/flake.nix is the one place left unpinned", actionVersions.length === 1);
}