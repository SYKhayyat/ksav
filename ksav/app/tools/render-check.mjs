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
import { renderEnv, renderNodes } from "./renderenv.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHELL = path.join(APP, "src-tauri");

/** The last few lines of a captured stream, so a failure can quote the app. */
function tail(text, lines = 20) {
  const kept = String(text || "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(-lines);
  return kept.length ? kept.map((line) => `      ${line}`).join("\n") : "      (nothing)";
}

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
      "      xvfb-run -a node tools/gate.mjs shell-render   (in ksav/)\n\n" +
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

// A record that the shell reached `setup`, which runs only once a window and its
// webview exist. Without it, "the page never answered" cannot tell a webview
// that failed to start from a page that started and never ran the probe — and
// those are different bugs with different fixes (#171).
const dir = mkdtempSync(path.join(tmpdir(), "ksav-render-"));
const answer = path.join(dir, "measurement.json");
const boot = path.join(dir, "boot.json");

// What this machine can render with, decided before the window is asked.
const nodes = renderNodes();
const { env, cleared, notes } = renderEnv({
  display: process.env.DISPLAY,
  waylandDisplay: process.env.WAYLAND_DISPLAY,
  renderNodes: nodes,
});
for (const note of notes) console.log(`→ ${note}`);
const childEnv = { ...process.env, ...env, KSAV_DPR_OUT: answer, KSAV_DPR_BOOT: boot };
for (const key of cleared) delete childEnv[key];

/** What a timeout means here, in the runner's own terms. */
function whySilent(child) {
  const facts = [
    `  display:   DISPLAY=${process.env.DISPLAY ?? "(unset)"}, ` +
      `WAYLAND_DISPLAY=${cleared.includes("WAYLAND_DISPLAY") ? "(pinned to X11)" : (process.env.WAYLAND_DISPLAY ?? "(unset)")}`,
    `  rendering: ${nodes.length ? nodes.join(", ") : "no DRM render node — software path"}` +
      (Object.keys(env).length ? ` (${Object.entries(env).map(([k, v]) => `${k}=${v}`).join(" ")})` : ""),
    `  window:    ${existsSync(boot) ? "created (the shell reached its setup)" : "never created — the webview did not start"}`,
    `  exit:      ${child.status === null ? "still running when the deadline passed" : `status ${child.status}`}, ` +
      `signal ${child.signal ?? "none"}`,
    "",
    "  The shell's own output:",
    tail(child.stdout),
    tail(child.stderr),
  ].join("\n");
  return facts;
}

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
  // Output is captured rather than inherited so a failure can quote the app.
  // On a pass there is nothing here worth showing; on a timeout it is the only
  // evidence in the run about what the webview did.
  const child = spawnSync("bash", ["-c", `exec ${JSON.stringify(binary)}`], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: ANSWER_BY_MS,
    env: childEnv,
  });
  // A timeout is the expected end: the application is an editor, and nothing
  // asks it to quit. `SIGTERM` from `timeout` is a pass, not a crash.
  if (child.error && child.error.code !== "ETIMEDOUT") {
    fail(`could not start the application: ${child.error.message}`);
  }

  if (!existsSync(answer)) {
    fail(
      `the application ran and the page never answered (${ANSWER_BY_MS}ms).\n\n` +
        "  Nothing was written to the measurement file. What the run looked like:\n\n" +
        whySilent(child) +
        "\n\n  With a window that exists, the page loaded and did not run the probe;\n" +
        "  without one, the webview never got as far as a page.",
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
  // The chrome's own geometry, which is how #103 presented: a ribbon whose
  // group captions were drawn on top of one another. A negative scale is the
  // cause this check was built for; these are the shape of the damage, and a
  // check that reports only the cause would pass a layout that is broken for a
  // different reason.
  if (!(m.ribbonGroups > 0)) {
    problems.push(
      `the ribbon has no command groups at all, so the toolbar is empty.\n` +
        "    A registry that resolved empty renders as a shorter ribbon with no\n" +
        "    explanation (#105); this is the desktop build, where that is a live\n" +
        "    possibility rather than a theoretical one.",
    );
  }
  if (m.ribbonOverlaps?.length) {
    problems.push(
      `ribbon groups overlap: ${m.ribbonOverlaps.join(", ")}\n` +
        "    The group captions overprinting one another is what #103 looked like\n" +
        "    from inside the page.",
    );
  }
  if (m.ribbonOutsideHeader?.length) {
    problems.push(
      `ribbon groups are drawn outside the header: ${m.ribbonOutsideHeader.join(", ")}\n` +
        "    A row taller than the bar it belongs to is the same collapse seen\n" +
        "    from the other side.",
    );
  }
  if (m.preview && m.preview.scrollWidth > m.preview.clientWidth + 1) {
    problems.push(
      `the preview is ${m.preview.scrollWidth}px wide inside a ${m.preview.clientWidth}px pane.\n` +
        "    The page overflows its pane, which is the clipping #103 reported.",
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
      `header ${m.headerHeight}px, #app with ${m.appChildren} children, ` +
      `ribbon ${m.ribbonGroups} groups with no overlap`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}