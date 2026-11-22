// What the render check tells the webview before it starts, and why.
//
// `tools/render-check.mjs` asks a real window what display it was given. That
// only works if the window gets far enough to paint, and on a build machine it
// often does not: WebKitGTK 2.42 and later composite through DMA-BUF, which
// wants a DRM render node (`/dev/dri/renderD*`). A CI runner has none — it is a
// virtual machine with a virtual display and no GPU — so the webview starts,
// logs nothing useful beyond an accessibility-bus warning, and never answers.
// That is #171's third layer: the check existed, and the environment it ran in
// made it report a 25-second timeout instead of a measurement.
//
// The two knobs below are WebKitGTK's own documented escape hatches for exactly
// that environment, not Ksav folklore:
//
//   WEBKIT_DISABLE_DMABUF_RENDERER=1     composite through shared memory
//   WEBKIT_DISABLE_COMPOSITING_MODE=1    do not require accelerated compositing
//
// They are applied **only where no render node exists**. A developer machine
// with a GPU keeps the same rendering path its users have, so the check still
// measures the thing it was written to measure; a machine without one gets a
// stated software path rather than an unexplained timeout.
//
// One more adjustment belongs here for the same reason: the check needs to
// measure **one** GTK backend, and it used to get one by deleting
// `WAYLAND_DISPLAY` from the child's environment (#227). Measured, that pins
// nothing: on a Wayland session the X display is XWayland, so GTK may land on
// the Wayland path with or without the variable, and the page came up with
// `devicePixelRatio = -1/96` and a negative viewport anyway — while the app's own
// guard (`src-tauri/src/main.rs`) wants `WAYLAND_DISPLAY` **present** to choose
// X11, so the deletion also stopped the fix for #103 from running under the check
// that exists to catch #103.
//
// So the choice is made the way the application makes it: `GDK_BACKEND=x11`, out
// loud. One genuine difference in scope — the app asks for X11 only on NixOS,
// because that is where the defect was measured, while the check asks for it
// whenever an X display exists, because the question it answers is "is there a
// viewport to lay out in", and one backend is what makes two runs comparable.

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The platform a question is about, said out loud or not asked at all.
 *
 * Every function here used to default this to `process.platform`, which is the
 * machine the *caller* happens to be on — and a test that omitted the argument
 * therefore asserted about the runner rather than about the code. It passed on
 * the Linux machine it was written on and was red on every Windows checkout of
 * the same commit, which is how eight assertions about WebKitGTK spent a day
 * saying the module was broken (#192).
 *
 * A default here is a default that can be wrong without a sound: `undefined` is
 * not `"linux"`, so a forgotten argument silently produces the "not my platform"
 * answer and looks like a considered result. So the argument is required, and
 * missing it is an error rather than a quiet branch.
 */
function platformOf(facts) {
  const platform = facts?.platform;
  if (!platform) {
    throw new TypeError(
      "renderenv: name the platform. There is no default on purpose — a default " +
        "reads the machine this code is running on, which is how a fence about " +
        "WebKitGTK went green on Linux and red on Windows (#192). The check itself " +
        "passes `process.platform`; a test names the one it is asking about.",
    );
  }
  return platform;
}


/** The DRM render nodes this machine has, if any. `/dev/dri` need not exist. */
export function renderNodes(dri = "/dev/dri") {
  let entries;
  try {
    entries = readdirSync(dri);
  } catch {
    return [];
  }
  return entries
    .filter((name) => /^renderD\d+$/.test(name))
    .map((name) => path.join(dri, name))
    .filter((file) => {
      try {
        return statSync(file).isCharacterDevice();
      } catch {
        return false;
      }
    });
}

/**
 * The environment adjustments for one run.
 *
 * Pure, and returns *why* each one was made, so the check's failure message can
 * say what it did rather than leave a reader guessing at the runner's hardware.
 * The backend is one of those reasons: it is chosen in `env`, not by taking a
 * variable away from the session (#227).
 *
 * @param {object} facts
 * @param {string|undefined} facts.display        `DISPLAY`, if set
 * @param {string|undefined} facts.waylandDisplay `WAYLAND_DISPLAY`, if set
 * @param {string[]} facts.renderNodes            character devices under /dev/dri
 * @param {string} facts.platform                 the platform being asked about
 *                                                — required, see `platformOf`
 */
export function renderEnv({ display, waylandDisplay, renderNodes: nodes, ...facts }) {
  const platform = platformOf(facts);
  const env = {};
  const notes = [];

  if (platform !== "linux") {
    // The knobs are WebKitGTK's. Every other platform uses its own webview and
    // needs none of this.
    return { env, notes, software: false };
  }

  if (display) {
    env.GDK_BACKEND = "x11";
    notes.push(
      (waylandDisplay
        ? `both DISPLAY=${display} and WAYLAND_DISPLAY=${waylandDisplay} were set; `
        : "") +
        "the check asks GTK for X11 (`GDK_BACKEND=x11`), the backend the app " +
        "chooses for itself, so it measures one backend rather than two",
    );
  } else if (waylandDisplay) {
    // Nothing is chosen, and nothing may be: there is no X server to reach. The
    // run then measures the Wayland path, which is where #103 lives, and says so
    // rather than leaving the red unexplained.
    notes.push(
      `WAYLAND_DISPLAY=${waylandDisplay} and no DISPLAY, so there is no X server ` +
        "to reach: this run measures the Wayland path",
    );
  }

  if (nodes.length === 0) {
    env.WEBKIT_DISABLE_DMABUF_RENDERER = "1";
    env.WEBKIT_DISABLE_COMPOSITING_MODE = "1";
    notes.push(
      "no DRM render node under /dev/dri, so WebKitGTK's DMA-BUF compositor is " +
        "disabled and the webview renders in software",
    );
  }

  return { env, notes, software: nodes.length === 0 };
}

/** Whether the machine this check is running on has a GPU render node. */
export function hasRenderNode(dri = "/dev/dri") {
  return existsSync(dri) && renderNodes(dri).length > 0;
}

/**
 * Whether this platform has a display to open a window on at all.
 *
 * `DISPLAY` and `WAYLAND_DISPLAY` are X11's and Wayland's names for a display.
 * They are not the only ones: Windows and macOS always have one and call it
 * nothing, so asking for either name there answers "no" about a machine that
 * can always say yes (#193). The check refused to start on the platform most of
 * this product's readers open it on, for want of a variable their system does
 * not have.
 *
 * `env` carries only the two names, so this stays pure and testable without a
 * machine of each kind.
 *
 * @param {object} facts
 * @param {string} [facts.platform] `process.platform`
 * @param {object} [facts.env]      the two display variables, if set
 */
export function displayPresent({ env = {}, ...facts } = {}) {
  const platform = platformOf(facts);
  if (platform === "win32" || platform === "darwin") {
    // A desktop session is not optional here; there is no headless spelling of
    // a window on these platforms that `xvfb-run` would stand in for.
    return true;
  }
  return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}

/**
 * What the built shell is called on this platform.
 *
 * The check built the shell and then required `target/debug/app`, which is the
 * artefact everywhere except on Windows — where cargo appends the executable
 * suffix and the check reported `expected a binary at …\app and there is none`
 * about a binary it had just compiled (#193).
 */
export function shellBinary(facts = {}) {
  const platform = platformOf(facts);
  return platform === "win32" ? "app.exe" : "app";
}
