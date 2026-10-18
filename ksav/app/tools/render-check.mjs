// The one check that opens a window.
//
//   node tools/render-check.mjs
//
// # What it checks
//
// That the shipped webview, in the shell this repository builds, hands the page
// a display it can lay itself out on: `devicePixelRatio` positive, a viewport
// with a positive size, and a document that has actually drawn something.
//
// # Why it exists
//
// On NixOS 26.05 under native Wayland, WebKitGTK 2.52.5 gives the page
// `devicePixelRatio = -1/96` and `innerWidth = -96 × outerWidth`. The chrome
// collapses and the editor is unusable. `GDK_BACKDEN`/`GDK_BACKEND=x11` avoids
// it, which `src-tauri/src/main.rs` now arranges on startup, and the cause is
// still unknown (#103).
//
// Nothing measured that. A `cargo test` never opens a window, so the entire
// shipped UI had no coverage at all — which is why this file is #101, filed when
// the defect was found rather than guessed at.
//
// # Why it asks the page
//
// Because for one day the investigation drew conclusion after conclusion from
// **screenshots**, and the windows stack behind one another: a screenshot read as
// proof that an application rendered was, several times, an unrelated Firefox or
// Konsole window. Every such reading was wrong, and each one cost an hour. A
// number the page reports about itself cannot be fooled that way, so that is the
// only evidence this check accepts.
//
// The measurement is taken by `render_probe` in the shell, compiled in only for
// this check via `--features dpr-probe`. A downloaded binary carries neither the
// command nor the thread that asks for it.
//
// # What it cannot tell you
//
// This asserts a symptom, not a cause, and it runs on whatever display the
// machine has. Under `xvfb-run` — which is what CI uses — that is X11, the path
// that already worked, so **this does not catch a regression in the native
// Wayland path.** It catches a regression in the path most people get after the
// startup fallback, and it catches the app failing to render at all. A developer
// on native Wayland running the gate by hand gets the stronger check for free.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL = path.join(APP, "src-tauri");

/** How long the page gets to answer, in milliseconds. */
const ANSWER_BY_MS = 25_000;

/** Fail with this rather than a stack trace: it is the whole point of the file. */
function fail(message) {
  console.error(`\n✗ desktop render check\n\n${message}\n`);
  process.exit(1);
}

function run(argv, cwd) {
  const done = spawnSync(argv[0], argv.slice(1), { cwd, stdio: "inherit" });
  if (done.error) fail(`could not start \`${argv.join(" ")}\`: ${done.error.message}`);
  if (done.status !== 0) fail(`\`${argv.join(" ")}\` exited ${done.status}`);
}

// A display is the whole premise. Failing loudly is deliberate: a check that
// quietly reports success without one is worse than no check, and this file
// exists because nothing measured any of this.
const hasDisplay = Boolean(process.env.WAYLAND_DISPLAY || process.env.DISPLAY);
if (!hasDisplay) {
  fail(
    "no display. `DISPLAY` and `WAYLAND_DISPLAY` are both unset, so there is no\n" +
      "  window to render and nothing to measure.\n\n" +
      "  On a desktop session this check runs as-is. Headless, run it under a\n" +
      "  virtual display:\n\n" +
      "      xvfb-run -a node tools/render-check.mjs\n\n" +
      "  Note that Xvfb is X11, which is the backend that already worked — it\n" +
      "  will not exercise the native Wayland path where the defect appears.",
  );
}

// The webview is served from `dist/`, so a shell built without it has no page to
// measure and would report a failure that is really a missing build step.
if (!existsSync(path.join(APP, "dist", "index.html"))) {
  console.log("→ dist/ is missing, building the frontend first");
  run(["npm", "run", "build"], APP);
}

const dir = mkdtempSync(path.join(tmpdir(), "ksav-render-"));
const answer = path.join(dir, "measurement.json");

try {
  // The crate's own target directory, not a throwaway one. A private
  // `--target-dir` makes every run a cold build of Typst and WebKitGTK — over
  // fifteen minutes, measured — which is not a cost a pre-push check can ask for
  // twice. Sharing it costs nothing: cargo keys its cache on the feature set, so
  // the probe build and the production build sit beside each other and neither
  // disturbs the other.
  console.log("→ building the shell with the render probe");
  run(["cargo", "build", "--features", "dpr-probe,tauri/custom-protocol"], SHELL);

  const binary = path.join(SHELL, "target", "debug", "app");
  if (!existsSync(binary)) fail(`expected a binary at ${binary} and there is none`);

  console.log("→ asking the page what it thinks the display is");
  const child = spawnSync(
    "bash",
    [
      "-c",
      `KSAV_DPR_OUT=${JSON.stringify(answer)} exec ${JSON.stringify(binary)}`,
    ],
    { stdio: "inherit", timeout: ANSWER_BY_MS },
  );
  // A timeout is the expected end: the application is an editor, and nothing
  // asks it to quit. `SIGTERM` from `timeout` is a pass, not a crash.
  if (child.error && child.error.code !== "ETIMEDOUT") {
    fail(`could not start the application: ${child.error.message}`);
  }

  if (!existsSync(answer)) {
    fail(
      `the application ran and the page never answered (${ANSWER_BY_MS}ms).\n\n` +
        "  Nothing was written to the measurement file, so either the webview\n" +
        "  never loaded a page at all, or it loaded one that could not run this\n" +
        "  script. The first is a blank window; the second means the app is\n" +
        "  serving something other than the editor.",
    );
  }

  const m = JSON.parse(readFileSync(answer, "utf8"));
  const problems = [];
  if (!(m.devicePixelRatio > 0)) {
    problems.push(
      `devicePixelRatio is ${m.devicePixelRatio}, which is not positive.\n` +
        "    A negative scale is what the WebKitGTK/Wayland defect looks like\n" +
        "    from inside the page (#103); a plausible-but-wrong one would be a\n" +
        "    different bug.",
    );
  }
  if (!(m.innerWidth > 0) || !(m.innerHeight > 0)) {
    problems.push(
      `the viewport is ${m.innerWidth}×${m.innerHeight}, which has no area to draw in.\n` +
        `    The window itself is ${m.outerWidth}×${m.outerHeight}.`,
    );
  }
  if (!m.appChildren) {
    problems.push(
      `#app has no children, so the editor never mounted.\n` +
        `    The document has ${m.bodyChildren} elements and is at ${m.href}`,
    );
  }

  if (problems.length) {
    fail(
      `the application rendered into a viewport it cannot use:\n\n` +
        problems.map((p) => `  - ${p}`).join("\n\n"),
    );
  }

  console.log(
    `\n✓ the page reports dPR ${m.devicePixelRatio}, ` +
      `viewport ${m.innerWidth}×${m.innerHeight}, ` +
      `header ${m.headerHeight}px, #app with ${m.appChildren} children`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}