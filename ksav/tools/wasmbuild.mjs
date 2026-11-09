// The one spelling of the browser-engine build.
//
//   node tools/wasmbuild.mjs
//
// # The finding (#115)
//
// `wasm-pack build --target web --release --out-dir pkg` appeared **four**
// times: `ci.yml`, `deploy.yml`, `.github/scripts/wasm-smoke.mjs`'s error
// message, and the README's build table. `deploy.yml`'s copy even carried a
// comment saying *"If this step ever diverges from that one, the site is not the
// thing that was tested"* — a promise with nothing checking it, which is the
// shape of every duplication this repository has already paid for.
//
// Two of those four were outside the sweep that is supposed to forbid second
// copies of a command, and the verb list held only *check* commands, so a build
// recipe was structurally free to be re-spelled anywhere. This file is the one
// spelling: `wasm-pack build` is now in `GATE_VERBS`, so a fifth copy fails the
// suite, and every consumer names this script instead.
//
// It is a script and not a check: the gate proves things, and building is what
// CI does *before* proving them. `tools/gate.mjs` stays a check runner.
//
// The flags are not decoration. `--target web` is what the worker loads,
// `--release` is what the 28 MB module is measured at, and `--out-dir pkg` is
// where `ksav/wasm/pkg` — the path the app and the smoke check both import —
// comes from.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The directory the crate is built in. */
export const WASM = path.dirname(path.dirname(fileURLToPath(import.meta.url))) + "/wasm";

/** The recipe, as argv. One spelling, imported by anyone who needs to name it. */
export const RECIPE = ["wasm-pack", "build", "--target", "web", "--release", "--out-dir", "pkg"];

/** The recipe as a line somebody can paste, which is what an error message needs. */
export const COMMAND = RECIPE.join(" ");

const main = () => {
  const started = Date.now();
  console.log(`→ ${COMMAND}   (in ksav/wasm)`);
  const r = spawnSync(RECIPE[0], RECIPE.slice(1), { cwd: WASM, stdio: "inherit" });
  if (r.error) {
    console.error(
      `wasm-pack is not on PATH (${r.error.message}).\n` +
        "Install it with: curl -sSfL https://rustwasm.github.io/wasm-pack/installer/init.sh | sh",
    );
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`${COMMAND} failed with ${r.status}`);
    process.exit(r.status ?? 1);
  }
  console.log(`✓ the browser engine built in ${((Date.now() - started) / 1000).toFixed(1)}s`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
