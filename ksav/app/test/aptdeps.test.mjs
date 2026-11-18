// The packages a Linux build needs, in the three files that need them.
//
// `lamdan/duplication-2026-08-09.md` §2.8 found the list written three times —
// the Docker image that produces the AppImage, the CI job that tests the shell,
// and the release job that builds the installers — and each copy carries a
// comment explaining the one thing that has actually bitten somebody: the
// ayatana appindicator package `Replaces:` the old `libappindicator3-dev`, so
// asking apt for both exits 100 before a compiler runs. `ci.yml`'s comment even
// records that it learned that from the Dockerfile *after* the two had drifted.
//
// A comment is not a fence. Add a package to one list and the other two keep
// building — or stop building, months later, on a runner nobody is watching.
//
// So the rule here is not "the three lists are equal". They are not, and they
// should not be: the image needs `xdg-utils` to make an AppImage, and CI needs
// `xvfb` to run a webview with no display. The rule is **the three lists differ
// only where this file says why** — every package is either core (in all three)
// or an extra named here with a reason. That is what makes adding one a two-line
// change instead of a silent divergence.
//
// Mutation test: add `libfoo-dev` to `ci.yml` alone and the assertion names it
// and the file it appeared in.

import { check, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
const REPO = path.resolve(HERE, "..", "..", "..");

/** The three lists, and the name their extras are keyed by. */
const FILES = [
  ["ksav/packaging/linux.Dockerfile", "docker"],
  [".github/workflows/ci.yml", "ci"],
  [".github/workflows/release.yml", "release"],
];

/**
 * Every package all three need. A word here is a build dependency of the shell
 * itself, so it belongs everywhere one is built.
 */
const CORE = [
  "build-essential",
  "libayatana-appindicator3-dev",
  "libgtk-3-dev",
  "librsvg2-dev",
  "libssl-dev",
  "libwebkit2gtk-4.1-dev",
  "patchelf",
];

/**
 * The packages only one list needs — and the sentence saying why. An extra with
 * no reason is an extra nobody can review, which is how the lists drifted the
 * first time.
 */
const EXTRAS = {
  docker: {
    "ca-certificates": "curl and the NodeSource/rustup scripts fetch over TLS inside the image",
    curl: "the image downloads rustup and NodeSource itself",
    "desktop-file-utils": "the AppImage bundler needs update-desktop-database",
    file: "the bundler asks `file` what it produced",
    wget: "a fetch fallback the Docker build uses where curl is rate-limited",
    "xdg-utils": "`tauri build --bundles appimage` fails without xdg-mime (#104)",
  },
  ci: {
    xauth: "`xvfb-run` refuses to start without an auth file",
    xvfb: "the shell's tests open a webview, and a runner has no display",
  },
  release: {
    curl: "the job fetches release artifacts",
    file: "Tauri's bundler inspects what it wrote",
    wget: "the same fallback the image keeps",
  },
};

/**
 * The packages in each `apt-get install` block that installs the webview.
 *
 * Blocks are found by what they contain rather than by line number: the webview
 * package is the thing all three lists have in common, so a file whose list has
 * lost it is a file this test cannot see — which is why the block count is
 * asserted too.
 */
function aptBlocks(text) {
  const lines = text.split(/\r?\n/u);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const at = line.indexOf("apt-get");
    if (at < 0 || !/apt-get\b[^\n]*\binstall\b/u.test(line)) continue;
    // The command runs while the line continues — a trailing backslash in the
    // Dockerfile, and the same in YAML, which is a shell script in there.
    const parts = [line.slice(at)];
    let j = i;
    while (/\\\s*$/u.test(lines[j]) && j + 1 < lines.length) {
      j += 1;
      parts.push(lines[j]);
    }
    i = j;
    // Tokens from `install` to the end of the command, not to the end of the
    // text: `&& rm -rf /var/lib/apt/lists/*` follows the list in two of the
    // three files and is not a package. A shell operator ends the list.
    const joined = parts.join("\n").replace(/\\\s*$/gmu, " ");
    const after = joined.slice(joined.search(/\binstall\b/u));
    const stop = after.search(/&&|;|(?:^|\n)\s*rm\b/u);
    const body = stop >= 0 ? after.slice(0, stop) : after;
    const packages = body
      .split(/\s+/u)
      .filter((w) => w && !w.startsWith("-") && w !== "install");
    blocks.push({ packages });
  }
  return blocks;
}

export async function run() {
  const seen = new Map();
  for (const [rel, key] of FILES) {
    const text = readFileSync(path.join(REPO, rel), "utf8");
    const blocks = aptBlocks(text).filter((b) => b.packages.includes("libwebkit2gtk-4.1-dev"));
    check(`the shell's build list is found in ${rel}`, blocks.length, 1);
    const only = blocks[0];
    ok(
      `${rel}: the block that installs the webview installs ${only.packages.length} packages`,
      only.packages.length >= 7,
    );
    seen.set(key, only.packages);
  }

  // Every core package is in all three. This is the assertion that fails when a
  // package is added to one list, and it is about *adding* on purpose: a removal
  // from two of three is the same failure seen from the other side.
  for (const pkg of CORE) {
    const missing = [...seen].filter(([, list]) => !list.includes(pkg)).map(([k]) => k);
    check(`${pkg} is a build dependency of all three, not just some`, missing, []);
  }

  // And nothing else is in a list unless this file explains it. Named extras are
  // per-file: `xvfb` in the release job would be a copy-paste with no reason,
  // which is precisely the drift this fence exists to stop.
  const core = new Set(CORE);
  for (const [key, list] of seen) {
    const extras = EXTRAS[key] ?? {};
    const unexplained = list.filter((p) => !core.has(p) && !(p in extras));
    check(`${key}'s list has no package that is neither core nor explained`, unexplained.sort(), []);
    // And the reasons do not outlive the packages: an extra left behind after a
    // removal is a comment about a dependency that is gone.
    const stale = Object.keys(extras).filter((p) => !list.includes(p));
    check(`${key} still installs every package its reasons name`, stale.sort(), []);
  }

  // The union is what a reader would copy into a new job, so it is worth stating
  // once.
  const union = new Set(CORE);
  for (const list of seen.values()) for (const p of list) union.add(p);
  ok(
    `the three lists come to ${union.size} packages with the webview among them`,
    union.has("libwebkit2gtk-4.1-dev") && union.size >= 12,
  );
}
