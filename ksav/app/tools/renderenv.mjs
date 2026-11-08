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
// One more adjustment belongs here for the same reason: if both a Wayland and
// an X11 display are present, the check drops `WAYLAND_DISPLAY`. A check that
// silently picked a different backend from run to run would be measuring a
// different thing each time, and the one thing it exists to catch (#103) is a
// Wayland-specific defect that only a developer running the gate by hand is in a
// position to see anyway.

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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
 *
 * @param {object} facts
 * @param {string|undefined} facts.display        `DISPLAY`, if set
 * @param {string|undefined} facts.waylandDisplay `WAYLAND_DISPLAY`, if set
 * @param {string[]} facts.renderNodes            character devices under /dev/dri
 * @param {string} [facts.platform]               `process.platform`
 */
export function renderEnv({ display, waylandDisplay, renderNodes: nodes, platform = process.platform }) {
  const env = {};
  const cleared = [];
  const notes = [];

  if (platform !== "linux") {
    // The knobs are WebKitGTK's. Every other platform uses its own webview and
    // needs none of this.
    return { env, cleared, notes, software: false };
  }

  if (display && waylandDisplay) {
    cleared.push("WAYLAND_DISPLAY");
    notes.push(
      `both DISPLAY=${display} and WAYLAND_DISPLAY=${waylandDisplay} were set; ` +
        "the check pins X11 so it measures one backend rather than two",
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

  return { env, cleared, notes, software: nodes.length === 0 };
}

/** Whether the machine this check is running on has a GPU render node. */
export function hasRenderNode(dri = "/dev/dri") {
  return existsSync(dri) && renderNodes(dri).length > 0;
}
