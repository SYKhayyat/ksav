// The desktop shell's WebKitGTK must be one whose page scale is not broken.
//
// #103: WebKitGTK between 2.44.3 and 2.52.5 reports `devicePixelRatio` of
// `-1/96` on Wayland. That makes `innerWidth` negative — literally
// `-(window_width_px * 96)` — and every rect the browser computes comes out
// negative, so the ribbon collapses. Nothing in this repository can fix it: the
// same CSS renders correctly in a browser, and the same binary is fine on
// XWayland.
//
// It is fixed by the dependency, not by us, and the dependency is ours:
// `flake.lock` pins nixpkgs, so bumping it silently swaps the engine underneath
// the application. That is the failure this check exists to stop — a green CI
// run, a fresh `nix flake update`, and a desktop build that cannot lay out a
// single row.
//
// **This list is not a floor to be widened.** A version belongs here because it
// was *measured* on this machine, not because it is newer. To evaluate a new
// version, measure it:
//
//     cd ksav && node tools/webview-scale.mjs
//
// and read the `devicePixelRatio` it prints. A value of exactly `1` means the
// engine is sound; a negative value means the application will be unusable on
// Wayland whatever the code says.

import { execFileSync } from "node:child_process";

/** Versions whose WebKit scale has been measured sane on this session's Wayland. */
const KNOWN_GOOD = new Set([
  // nixos-24.05. Measured 2026-10-16: inner [1280, 780], dpr 1.
  "2.44.3",
]);

/** Known bad, recorded so the failure names the reason rather than a range. */
const KNOWN_BAD = new Map([
  ["2.52.5", "tauri-apps/tauri#12004 — negative viewport on Wayland"],
  ["2.52.6", "tauri-apps/tauri#12004 — negative viewport on Wayland"],
]);

function webkitVersion() {
  try {
    const out = execFileSync("pkg-config", ["--modversion", "webkit2gtk-4.1"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim();
  } catch {
    return null;
  }
}

const version = webkitVersion();

if (!version) {
  // Not a failure. This check runs in environments without the desktop shell's
  // libraries, and a gate that cannot run there must say so rather than invent a
  // verdict — the repository has been bitten by a check that reported nothing
  // and was read as a pass.
  console.log("webkit2gtk-4.1 not on pkg-config path; scale check did not run.");
  process.exit(0);
}

const majorMinor = version.split(".").slice(0, 2).join(".");

if (KNOWN_GOOD.has(version)) {
  console.log(`webkitgtk ${version} — measured sane, OK.`);
  process.exit(0);
}

const why =
  KNOWN_BAD.get(version) ??
  KNOWN_BAD.get(majorMinor) ??
  "not measured; WebKitGTK 2.44.3 < v <= 2.52.5 is known broken on Wayland (#103)";

console.error(
  [
    `webkitgtk ${version} FAILS the desktop scale gate.`,
    "",
    `  reason: ${why}`,
    "",
    "  On Wayland this version reports devicePixelRatio -1/96, giving a",
    "  negative CSS viewport. The application's chrome cannot lay out and the",
    "  desktop build is unusable. The browser edition is unaffected.",
    "",
    "  Do not add this version to the known-good list. Measure it first:",
    "",
    "      cd ksav && node tools/webview-scale.mjs",
    "",
    "  and only if it prints devicePixelRatio 1.",
    "",
    "  Workaround while this is unresolved: GDK_BACKEND=x11 (see #103).",
  ].join("\n"),
);
process.exit(1);