// Measure the device pixel ratio the WebKitGTK in *this* shell actually gives
// a page. This is the instrument `check-webkit-scale.mjs` tells you to trust,
// and it exists because the alternative has been guessing at screenshots.
//
// #103 found its cause this way: a window — no Tauri, no Ksav code, just
// WebKitGTK's own MiniBrowser — reported `devicePixelRatio` of -1/96 on
// Wayland, which is a negative CSS viewport and therefore a collapse of the
// entire layout. Nothing in the screenshots could have said that.
//
// Run it inside the desktop shell, which is where the libraries are:
//
//     nix develop .#desktop
//     cd ksav && node tools/webview-scale.mjs
//
// Exits non-zero if the reported ratio is not positive, so it can be used as a
// check on a machine that actually has a display — which CI does not.

import { spawn, execFileSync } from "node:child_process";

const PORT = Number(process.env.KSAV_SCALE_PORT ?? 14599);

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

/** MiniBrowser ships inside the same package as the engine under test. */
function miniBrowserPath() {
  for (const prefix of ["/nix/store/"]) {
    void prefix;
  }
  // `pkg-config --variable=exec_prefix` gives the install root of the very
  // webkitgtk this shell is using, which is the point: measuring the engine
  // that will actually be linked, not one that happens to be in the store.
  const prefix = sh("pkg-config", ["--variable=exec_prefix", "webkit2gtk-4.1"]).trim();
  const mini = `${prefix}/libexec/webkit2gtk-4.1/MiniBrowser`;
  try {
    sh("test", ["-x", mini]);
    return mini;
  } catch {
    return null;
  }
}

const mini = miniBrowserPath();
if (!mini) {
  console.error("MiniBrowser not found beside this WebKitGTK; run me in `nix develop .#desktop`.");
  process.exit(2);
}

const driver = (() => {
  try {
    return sh("which", ["WebKitWebDriver"]).trim();
  } catch {
    return null;
  }
})();
if (!driver) {
  console.error("WebKitWebDriver not on PATH; it ships in the same package as MiniBrowser.");
  process.exit(2);
}

const child = spawn(driver, ["-p", String(PORT)], { stdio: ["ignore", "ignore", "inherit"] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (json.value?.error) throw new Error(JSON.stringify(json.value));
  return json.value;
}

let failed = false;
try {
  // Wait for the driver rather than assuming a fixed delay.
  for (let i = 0; i < 40; i++) {
    try {
      await post("/status");
      break;
    } catch {
      await sleep(250);
    }
  }

  const session = await post("/session", {
    capabilities: {
      alwaysMatch: {
        browserName: "MiniBrowser",
        "webkitgtk:browserOptions": { binary: mini, args: ["--automation"] },
      },
    },
  });
  const sid = session.sessionId;
  const S = (p, b) => post(`/session/${sid}${p}`, b);

  await S("/window/rect", { x: 0, y: 0, width: 1280, height: 820 });
  await S("/url", { url: "data:text/html,<h1>scale probe</h1>" });
  await sleep(2000);

  const raw = await S("/execute/sync", {
    script:
      "return JSON.stringify({dpr:devicePixelRatio,inner:[innerWidth,innerHeight]," +
      "outer:[outerWidth,outerHeight],screen:[screen.width,screen.height]});",
    args: [],
  });
  const m = JSON.parse(raw);

  console.log(`webkitgtk : ${sh("pkg-config", ["--modversion", "webkit2gtk-4.1"]).trim()}`);
  console.log(`display   : ${JSON.stringify(m.screen)}  window ${JSON.stringify(m.outer)}`);
  console.log(`dpr       : ${m.dpr}`);
  console.log(`viewport  : ${JSON.stringify(m.inner)}`);

  if (!(m.dpr > 0) || !(m.inner[0] > 0) || !(m.inner[1] > 0)) {
    failed = true;
    console.error("");
    console.error("  NEGATIVE VIEWPORT — this engine is broken on this display backend.");
    console.error("  The desktop application cannot lay out anything. See #103.");
    console.error("  Workaround: GDK_BACKEND=x11. Do not add this version to the");
    console.error("  known-good list in check-webkit-scale.mjs.");
  } else {
    console.log("");
    console.log("  positive viewport — this engine is sound on the backend in use.");
  }

  try {
    await fetch(`http://127.0.0.1:${PORT}/session/${sid}`, { method: "DELETE" });
  } catch {
    /* the child is killed below either way */
  }
} catch (e) {
  console.error(`could not measure: ${e.message}`);
  failed = true;
} finally {
  child.kill("SIGKILL");
}

process.exit(failed ? 1 : 0);