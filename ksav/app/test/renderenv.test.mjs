// The environment the render check hands the webview, decided in one place.
//
// # The finding (#171)
//
// `desktop shell` was red on `main` for days, and its last layer was this: on a
// CI runner the page never answered. WebKitGTK composites through DMA-BUF,
// which needs a DRM render node (`/dev/dri/renderD*`); a runner has none, so the
// webview started and never painted. The check reported a 25-second timeout for
// what was really "this machine has no GPU", and nothing in the run said so.
//
// The environment adjustment is small. The reason it is a module with a test is
// that it is a decision with two wrong answers that both look like working code:
// applying the software knobs on a developer's machine (so the check stops
// measuring the rendering path users get), and missing a machine that has no
// render node (so the timeout comes back with no explanation).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { notOk, ok } from "./harness.mjs";
import { renderEnv, renderNodes } from "../tools/renderenv.mjs";

export async function run() {
  const NODE = ["/dev/dri/renderD128"];

  // --- a machine with a GPU -------------------------------------------------

  {
    const r = renderEnv({ display: ":0", waylandDisplay: undefined, renderNodes: NODE });
    ok("a machine with a render node keeps WebKit's default renderer", Object.keys(r.env).length === 0);
    ok("and it is not described as software", r.software === false);
  }

  // --- a machine without one (the CI runner) --------------------------------

  {
    const r = renderEnv({ display: ":99", waylandDisplay: undefined, renderNodes: [] });
    ok("no render node turns the DMA-BUF renderer off", r.env.WEBKIT_DISABLE_DMABUF_RENDERER === "1");
    ok("and stops asking for accelerated compositing", r.env.WEBKIT_DISABLE_COMPOSITING_MODE === "1");
    ok("the run is recorded as software", r.software === true);
    ok("the note names the missing device rather than a timeout", r.notes.some((n) => n.includes("/dev/dri")));
  }

  // --- two displays, one measurement ----------------------------------------

  {
    const r = renderEnv({ display: ":0", waylandDisplay: "wayland-0", renderNodes: NODE });
    ok("with both displays present, Wayland is cleared so X11 is measured", r.cleared.includes("WAYLAND_DISPLAY"));
    ok("and the note says why the backend was pinned", r.notes.some((n) => n.includes("pins X11")));
  }

  {
    const r = renderEnv({ display: ":0", waylandDisplay: undefined, renderNodes: NODE });
    ok("X11 alone clears nothing", r.cleared.length === 0);
  }

  // A Wayland-only session must not have its display removed: it is the only
  // display there is, and dropping it would turn #103's own case into "no display".
  {
    const r = renderEnv({ display: undefined, waylandDisplay: "wayland-0", renderNodes: NODE });
    ok("Wayland alone is left alone", r.cleared.length === 0);
  }

  // --- other platforms use their own webview --------------------------------

  {
    const r = renderEnv({ display: ":0", waylandDisplay: undefined, renderNodes: [], platform: "darwin" });
    ok("the WebKitGTK knobs stay on Linux", Object.keys(r.env).length === 0);
    ok("a Mac is never described as software-rendering", r.software === false);
  }

  // --- reading /dev/dri -----------------------------------------------------

  ok("a missing /dev/dri is no render nodes, not a crash", renderNodes("/nonexistent/ksav/dri").length === 0);

  {
    // A directory whose entries merely *look* like render nodes. `stat` must say
    // character device, or a stray file named `renderD128` would tell this check
    // the machine has a GPU it does not have.
    const dir = mkdtempSync(path.join(tmpdir(), "ksav-dri-"));
    try {
      writeFileSync(path.join(dir, "renderD128"), "");
      writeFileSync(path.join(dir, "card0"), "");
      mkdirSync(path.join(dir, "renderD129"));
      ok("regular files called renderD* are not render nodes", renderNodes(dir).length === 0);

      const env = renderEnv({ display: ":99", waylandDisplay: undefined, renderNodes: renderNodes(dir) });
      ok(
        "a fake render node still lands on the software path",
        env.env.WEBKIT_DISABLE_DMABUF_RENDERER === "1",
      );
      notOk("and the check does not claim a GPU", env.software === false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

}
