// The pieces a test needs in order to look at the built application: a static
// server that honours the prefix the build asked for, a refusal to measure a
// stale `dist/`, a browser, and the boot that binds them.
//
// Extracted from `browserlang.test.mjs` when a second file needed the same
// three, because the alternative was a second copy of `baseOf` — and `baseOf`
// exists because a copy of the serving rule was already wrong once: the built
// HTML asked for `/ksav/assets/…`, the server answered `/assets/…` with
// `index.html`, the browser refused to run that as a module, and the app booted
// into nothing while the failure read as a language bug.
//
// Nothing here asserts. The caller decides whether "no Chromium on this machine"
// is a skip or a failure; this file only says which one it is.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join, dirname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP = resolve(HERE, "..");
export const DIST = join(APP, "dist");
export const SRC = join(APP, "src");

/**
 * Does the bundle in `dist/` carry the engine, or does it expect a server?
 *
 * Two builds are legitimate and only one of them can answer a compile with
 * nothing else running: `npm run build:wasm` puts the wasm engine inside the
 * bundle (the browser app, deployed) and `npm run build` / `npx vite build`
 * leaves the engine at the other end of a wire (the frontend for the desktop
 * shell, and what `ci.yml`'s editor job builds). A test that asserts what the
 * engine answered has to ask this first, or it is measuring the absence of a
 * server and calling it a defect in the application.
 *
 * Asked as a file in `assets/` rather than as a flag, because that is what the
 * browser will have.
 */
export function engineInBundle() {
  try {
    return readdirSync(join(DIST, "assets")).some((f) => f.endsWith(".wasm"));
  } catch {
    // silent: no `dist/` at all, and `openApp` says so far more usefully
    return false;
  }
}

/** The newest file under `dir`, as an mtime in ms — 0 when it holds no files. */
export function newestFile(dir) {
  let newest = 0;
  let where = "";
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const at = join(entry.parentPath ?? entry.path, entry.name);
    const ms = statSync(at).mtimeMs;
    if (ms > newest) {
      newest = ms;
      where = at;
    }
  }
  return { newest, where };
}

/**
 * Refuse to measure a `dist/` older than the sources beside it.
 *
 * **A refusal and not a skip**, and the difference is the whole point. A missing
 * `dist/` or a missing Chromium means *this machine cannot run this test*, which
 * is a complaint about the machine and the file already says so. A **stale**
 * `dist/` means the test is about to produce a confident, well-formatted,
 * entirely fictional finding about code that is not in the tree — and that is
 * what happened to #81. A skip would have been the same silence with a worse
 * sign on it, so this goes red and names the two timestamps.
 *
 * Newest-of-each rather than a single file, on both sides: `vite` writes many
 * chunks and `src/` is many files, so either one alone is a sample of a
 * distribution. And it compares `src/` against `dist/` rather than against the
 * test files, so editing a test — which is what you do when a test is wrong —
 * does not make the build stale and does not turn this red for no reason.
 */
export function assertFreshBuild() {
  const built = newestFile(DIST);
  const edited = newestFile(SRC);
  // **`true`, not a bare `return`.** The first version of this returned nothing
  // on the fresh path, and the call site reads the answer as a boolean — so a
  // *fresh* `dist/` was indistinguishable from a refusal, and the file skipped
  // itself on every run without printing why. `run.mjs`'s "asserted nothing"
  // check is what caught it, which is that check earning its keep twice.
  if (built.newest === 0 || edited.newest <= built.newest) return true;
  console.error(
    `app/dist is older than app/src, so this would measure a build that is not this code.\n` +
      `  built  ${new Date(built.newest).toISOString()}  ${built.where}\n` +
      `  edited ${new Date(edited.newest).toISOString()}  ${edited.where}\n` +
      `  rebuild it:\n` +
      `    cd ksav/app && npm run build`,
  );
  // **Thrown, not `check`ed.** #91.
  //
  // `check` reports a *failed assertion*, which leaves this file with one failure
  // and zero passes — and `run.mjs`'s "a file that reports no assertions cannot
  // go red" then reports it as `browserlang.test.mjs — 0 passed`. That is what CI
  // showed, and it is the least useful sentence available: it reads like a test
  // file that lost its body, when the truth is that there is no build to measure.
  //
  // A stale build and a gutted test are different faults with different fixes, and
  // they were indistinguishable from outside. Throwing names this one.
  throw new Error(
    `refusing to measure a stale build: app/dist is older than app/src.\n` +
      `  built  ${new Date(built.newest).toISOString()}  ${built.where}\n` +
      `  edited ${new Date(edited.newest).toISOString()}  ${edited.where}\n` +
      `  rebuild it:  cd ksav/app && npm run build`,
  );
}

/**
 * The path the built `index.html` asks for its assets under.
 *
 * A project Pages site lives under `/ksav/`, so `deploy.yml` builds with
 * `VITE_PUBLIC_BASE` set and every asset URL in the built HTML carries that
 * prefix. This file served `dist/` at `/`, so it answered `/ksav/assets/index-….js`
 * with **`index.html`** — which the browser then refused to run as a module, and
 * the app never booted. It surfaced as *the app boots into Hebrew with plenty on
 * screen* failing, thirty seconds later, on a **language** assertion: which is
 * what an unreadable module looks like from in here.
 *
 * Read out of the HTML rather than out of `VITE_PUBLIC_BASE`, because the
 * question is not what the build was asked for but what it asked for — and a
 * plain `npx vite build`, which is what `ci.yml` runs, wants `/`.
 *
 * Returns the base and any absolute asset URL that disagrees with it. That
 * disagreement is what a hand-edited or half-prefixed bundle looks like, and it
 * is silent: every file resolves, and the app is blank.
 */
export function baseOf(html) {
  const absolute = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => u.startsWith("/") && u.includes("/assets/"));
  if (!absolute.length) return { base: "/", offenders: [] };
  const base = absolute[0].slice(0, absolute[0].indexOf("/assets/"));
  return { base: base || "/", offenders: absolute.filter((u) => !u.startsWith(base + "/")) };
}

/**
 * Serve `dist/` under the prefix it was built for, and give back the origin.
 *
 * Static, and the SPA fallback for **document requests only** — which is a
 * second fix for the same silence. The fallback used to answer *every* miss with
 * `index.html`, so a missing script arrived as a 200 of `text/html` and the
 * browser's complaint was about MIME types rather than about the file that was
 * not there. `Accept` is the difference between "somebody opened a path" and
 * "the page asked for an asset", and only the first wants the app.
 */
export async function serve(base = "/") {
  const TYPES = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".wasm": "application/wasm",
    ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
  };
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    const rel = base === "/" ? path : path.replace(new RegExp(`^${base}(?=/|$)`), "");
    const wantsDocument = (req.headers.accept ?? "").includes("text/html");
    const candidates = [join(DIST, rel), ...(wantsDocument ? [join(DIST, "index.html")] : [])];
    for (const file of candidates) {
      try {
        const body = await readFile(file);
        res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
        return res.end(body);
      } catch {
        /* try the next candidate */
      }
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, origin: `http://127.0.0.1:${server.address().port}${base === "/" ? "" : base}/` };
}

/** Chromium, or the reason there is not one. */
export async function browser() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    return { why: "playwright-core is not installed" };
  }
  // **Channels first, and the managed path last.**
  //
  // `executablePath()` names the browser *playwright* downloaded, and on a CI
  // runner nothing downloads one — the workflow's own comment says so: *"No browser is
  // downloaded. `playwright-core` drives the Chrome the runner already has."* So this
  // file asked for a path that does not exist and answered
  //
  //     SKIPPED browserlang: no Chromium for playwright
  //
  // which is the whole browser-language coverage, in a job whose name is `editor`,
  // on every run, since the test was written. `run.mjs` counted the empty file as
  // "asserted nothing" and turned it red, which is how it was finally noticed —
  // **three fixes after the reason it was red was found**, because #91's
  // staleness guard had been failing first and hid the real answer behind it.
  //
  // `acceptance.mjs` already solves this (`launchBrowser`, channels `chrome`,
  // `msedge`, `chromium`, first that starts). Same approach, same order: the
  // runner's own Chrome first, and the downloaded build only as a fallback for a
  // machine that has one.
  const args = ["--no-sandbox", "--disable-gpu"];
  const tried = [];
  // An explicitly named browser, tried **first**, and named in the failure text
  // like the others — so a wrong path reads as a wrong path rather than as
  // "no Chromium on this machine".
  //
  // It exists because all three channels below are places Playwright looks, and
  // a machine can have a perfectly good Chromium in none of them. This one does:
  // a Nix-store binary, absent from `/opt/google/chrome` and from
  // `executablePath()`. Without this the only options are a file that cannot run
  // here at all — which is the sentence the whole function is built to refuse —
  // or shipping the `dist/` fix below unverified, which is worse.
  const named = (process.env.KSAV_CHROMIUM ?? "").trim();
  if (named) {
    try {
      return { b: await chromium.launch({ executablePath: named, headless: true, args }) };
    } catch (e) {
      tried.push(`${named}: ${String(e.message).split("\n")[0]}`);
    }
  }
  for (const channel of ["chrome", "msedge", "chromium"]) {
    try {
      return { b: await chromium.launch({ channel, headless: true, args }) };
    } catch (e) {
      tried.push(`${channel}: ${String(e.message).split("\n")[0]}`);
    }
  }
  const managed = chromium.executablePath();
  if (existsSync(managed)) {
    try {
      return { b: await chromium.launch({ headless: true, args }) };
    } catch (e) {
      tried.push(`managed: ${String(e.message).split("\n")[0]}`);
    }
  }
  return { why: `no Chromium would start — tried ${tried.join("; ")}` };
}


/**
 * Everything it takes to stand in front of the running application.
 *
 * `{ skip }` means this machine cannot run it — no `dist/`, no browser — and the
 * caller prints the reason and returns. A **stale** build throws instead, because
 * a stale build and a gutted test are different faults with different fixes and
 * must not be the same silence.
 *
 * A returning writer's window rather than a first-run dialog: the welcome
 * overlay is right on a first visit and it covers the chrome, so it is seeded
 * away before the first byte.
 */
export async function openApp({ wait = 2500, ribbon = false } = {}) {
  if (!existsSync(join(DIST, "index.html"))) return { skip: "no dist/ — run `npm run build` first" };
  // **A caller that measures the ribbon asks for it by name.**
  //
  // `npm run build` and `npx vite build` leave the engine at the other end of a
  // wire — that is the bundle `ci.yml`'s `editor` job builds, with no server in
  // the job — so the command list never arrives and the ribbon is drawn as the
  // sentence that says so: no tabs, no panel, no faces. A test that waits for
  // `.ribbon-tab[data-tab="insert"]` here would spend thirty seconds and then
  // fail on "slow", which is a false reading of a legitimate build. It skips
  // instead, in the words `importui` already uses for the same fact, and
  // `ci.yml`'s `browser engine` job runs these files where the bundle carries
  // the engine.
  //
  // Asked *before* the browser: a skip that costs a Chromium launch is a skip
  // reported thirty seconds after the reason was already known.
  if (ribbon && !engineInBundle()) {
    return {
      skip:
        "this dist keeps the engine at the other end of a wire, so the ribbon is the notice that " +
        "says the command list did not load — build with `npm run build:wasm` to measure it " +
        "(CI does, in `browser engine`)",
    };
  }
  // Before the browser and before anything is measured, spelled the way the
  // fence in `visibility.test.mjs` reads it: a guard that runs after the window
  // has been read has already let the measurement happen.
  if (!assertFreshBuild()) return { skip: "the build is stale" };
  const { b, why } = await browser();
  if (!b) return { skip: why };
  const { base, offenders } = baseOf(await readFile(join(DIST, "index.html"), "utf8"));
  const { server, origin } = await serve(base);
  const page = await b.newPage();
  await page.addInitScript(() => localStorage.setItem("ksav.onboarded", "1"));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForTimeout(wait);
  const close = async () => {
    await page.close().catch(() => {});
    await b.close().catch(() => {});
    server.close();
  };
  return { page, browser: b, server, origin, base, offenders, close };
}
