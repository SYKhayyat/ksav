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
//
// # The backend, and the second wrong answer (#227)
//
// Choosing X11 used to be done by **deleting `WAYLAND_DISPLAY`** from the child's
// environment, on the theory that it pinned the run to one backend. Measured, it
// pinned nothing — on a Wayland session the X display is XWayland, so GTK landed
// on the broken path anyway (`devicePixelRatio -1/96`, the viewport
// `-122880×-70656`) — and it disarmed the app's own guard, which needs
// `WAYLAND_DISPLAY` present to choose X11. The assertions below therefore say
// what was *chosen* (`GDK_BACKEND`), not what was taken away, because the second
// is a fact about a variable while the first is the fact about the backend.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, notOk, ok } from "./harness.mjs";
import { displayPresent, renderEnv, renderNodes, shellBinary } from "../tools/renderenv.mjs";

export async function run() {
  const NODE = ["/dev/dri/renderD128"];

  // Every case that is about WebKitGTK says `linux`, and must.
  //
  // These calls used to leave `platform` out and take the default,
  // `process.platform`. The module is right and this file was green on the
  // machine it was written on — which is a Linux machine — so eight assertions
  // about WebKitGTK's renderer passed there and went red on every Windows
  // checkout, on the same commit. A test that asks about one platform and reads
  // another is the same fault as a claim nothing measures: it says something
  // about a machine rather than about the code (#171).
  const LINUX = "linux";

  // --- a machine with a GPU -------------------------------------------------

  {
    const r = renderEnv({ display: ":0", waylandDisplay: undefined, renderNodes: NODE, platform: LINUX });
    ok("a machine with a render node keeps WebKit's default renderer", !r.env.WEBKIT_DISABLE_DMABUF_RENDERER);
    ok("and it is not described as software", r.software === false);
    ok("X11 is still asked for, so two runs measure the same backend", r.env.GDK_BACKEND === "x11");
  }

  // --- a machine without one (the CI runner) --------------------------------

  {
    const r = renderEnv({ display: ":99", waylandDisplay: undefined, renderNodes: [], platform: LINUX });
    ok("no render node turns the DMA-BUF renderer off", r.env.WEBKIT_DISABLE_DMABUF_RENDERER === "1");
    ok("and stops asking for accelerated compositing", r.env.WEBKIT_DISABLE_COMPOSITING_MODE === "1");
    ok("the run is recorded as software", r.software === true);
    ok("the note names the missing device rather than a timeout", r.notes.some((n) => n.includes("/dev/dri")));
  }

  // --- two displays, one measurement ----------------------------------------

  {
    const r = renderEnv({ display: ":0", waylandDisplay: "wayland-0", renderNodes: NODE, platform: LINUX });
    ok("with both displays present, GTK is asked for X11", r.env.GDK_BACKEND === "x11");
    ok("and the note says why the backend was chosen", r.notes.some((n) => n.includes("GDK_BACKEND=x11")));
    // The deletion that used to be the mechanism is gone, and this is the
    // assertion that keeps it gone: the session reaches the app as a real
    // session's would, so the app's own guard is exercised rather than bypassed.
    ok("and nothing is taken away from the session any more", !("cleared" in r));
  }

  {
    const r = renderEnv({ display: ":0", waylandDisplay: undefined, renderNodes: NODE, platform: LINUX });
    ok("X11 alone is chosen the same way", r.env.GDK_BACKEND === "x11");
  }

  // A Wayland-only session cannot be asked for X11: there is no X server to
  // reach, so the request would start a window that never opens. The run then
  // measures the Wayland path — which is where #103 lives — and says so, rather
  // than failing with a backend nobody chose.
  {
    const r = renderEnv({ display: undefined, waylandDisplay: "wayland-0", renderNodes: NODE, platform: LINUX });
    ok("a Wayland-only session is not asked for X11", r.env.GDK_BACKEND === undefined);
    ok("and the note says the run measures Wayland", r.notes.some((n) => n.includes("measures the Wayland path")));
  }

  // --- other platforms use their own webview --------------------------------

  {
    const r = renderEnv({ display: ":0", waylandDisplay: undefined, renderNodes: [], platform: "darwin" });
    ok("the WebKitGTK knobs stay on Linux", Object.keys(r.env).length === 0);
    ok("a Mac is never described as software-rendering", r.software === false);
  }

  // --- is there a display to open a window on (#193) -------------------------
  //
  // The check asked for `DISPLAY` or `WAYLAND_DISPLAY` and refused to start when
  // neither was set. That is a question only Linux can be asked: Windows and
  // macOS have a display and no variable naming it, and the check as written
  // would not run on either — so the shipped window had no measurement on two of
  // the three platforms it ships to. These four cases are the whole decision.
  {
    ok("Windows has a display and no DISPLAY variable", displayPresent({ platform: "win32", env: {} }));
    ok("macOS has one too", displayPresent({ platform: "darwin", env: {} }));
    notOk("Linux with neither variable has none", displayPresent({ platform: "linux", env: {} }));
    ok("…and with DISPLAY it has one", displayPresent({ platform: "linux", env: { DISPLAY: ":99" } }));
    ok(
      "…or with WAYLAND_DISPLAY alone",
      displayPresent({ platform: "linux", env: { WAYLAND_DISPLAY: "wayland-0" } }),
    );
  }

  // --- what the built shell is called (#193) --------------------------------
  //
  // The check required `target/debug/app` after building the shell. On Windows
  // cargo writes `app.exe`, and the check reported "expected a binary at …\app
  // and there is none" about a binary it had just compiled.
  ok("Linux and macOS build `app`", [shellBinary({ platform: "linux" }), shellBinary({ platform: "darwin" })], [
    "app",
    "app",
  ]);
  ok("Windows builds `app.exe`", shellBinary({ platform: "win32" }), "app.exe");

  // --- the platform is named or the question is not asked (#192) -------------
  //
  // Every function in `renderenv.mjs` defaulted `platform` to
  // `process.platform`. That is the machine the *caller* is on, so a test that
  // left the argument out asserted about the runner: eight assertions about
  // WebKitGTK were green on Linux and red on every Windows checkout of the same
  // commit. A default that silently means "wherever this is running" is worse
  // than a required argument, because `undefined !== "linux"` is a considered
  // answer that happens to be about the wrong machine.
  {
    const threw = (fn) => {
      try {
        fn();
        return false;
      } catch (e) {
        return e instanceof TypeError && e.message.includes("name the platform");
      }
    };
    // `check`, not `ok`: this compares three answers to three expectations, and
    // `ok` is truthiness-only — so the first version of this assertion passed on
    // `[true, true, true]` *and* on `[false, false, false]`, which is a fence
    // that cannot go red. Found by running the mutation rather than by reading it.
    check(
      "omitting the platform is an error, not a quiet default",
      [
        threw(() => renderEnv({ display: ":99", waylandDisplay: undefined, renderNodes: [] })),
        threw(() => displayPresent({ env: {} })),
        threw(() => shellBinary()),
      ],
      [true, true, true],
    );
    ok(
      "…and the message says why, and what to pass instead",
      (() => {
        try {
          shellBinary();
          return "did not throw";
        } catch (e) {
          return e.message.includes("process.platform") && e.message.includes("#192");
        }
      })(),
    );
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

      const env = renderEnv({ display: ":99", waylandDisplay: undefined, renderNodes: renderNodes(dir), platform: LINUX });
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
