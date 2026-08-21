// Does the assembled application work?
//
// Every other check in this repository reads: the editor suite, the engine
// tests, a parse oracle over every document the app can generate, an insertion
// grid that compiles every legal UI insertion — all of them excellent, all of
// them *about* parts. Nothing had ever booted the product and used it.
//
// (The two tallies that used to be in that sentence said 3,894 and 429 while
// the README said 5,466 and 631. Nothing sweeps this file, so a number written
// here is a number that rots quietly — `docs.test.mjs` holds the living pages to
// their counts and this is not one of them. The counts live there.)
//
// That is not a hypothetical gap. The whole-repo report puts it first, and names
// the evidence: a single hour of clicking on 6 August found three bugs, and the
// three findings it produced were invisible to a suite that was, on the same
// day, green. The bugs a reader cannot find are the ones that live in the seams
// — a button wired to nothing, a menu item that throws, a template that loads
// into an editor that cannot compile it — and a seam is only observable when
// both sides are actually present.
//
// So this boots `ksav serve` with the real SPA embedded in it, drives a real
// Chrome through the seven things a person does in their first ten minutes, and
// fails on a console error, a compile diagnostic or a missing element.
//
// # What it asserts on, and what it refuses to
//
// **Never pixels.** A browser test that compares rendering is a test that cries
// wolf on a font update, and this repository's tolerance for that is correctly
// zero. What it reads instead is what the application says about itself:
//
// That sentence was written about *rendering comparison* and it was read, for as
// long as it stood alone, as being about the screen. Those are two claims and
// only the first one is right — see "Looking at the screen" below, which is the
// other half of it and had to be argued for against this paragraph.
//
//   - `#status` — the compile verdict. `ok`, `warn`, `err`, one per compile,
//     with the page count and the milliseconds in it.
//   - `#diagnostics` — the compiler's own words when something is wrong.
//   - `.preview-host .page` — that pages exist, and how many. Not what is on
//     them.
//
//     It read `#preview .page` until the window became a tree of panes. There is
//     no `#preview` any more, and there was never going to be one again: a
//     document can have four previews open at once, so "the preview" is a class
//     and however many of them are on screen. The selector went on matching
//     nothing and the check went on reporting `0 pages` — thirteen of them, on a
//     build where every compile succeeded and the pages were on the screen. A
//     check that cannot fail for the reason it names is worse than no check.
//   - `console.error` and uncaught exceptions — the whole page, the whole run.
//   - the PDF's first bytes, because a download that is not a PDF is a bug no
//     amount of green status text would have caught.
//
// **And the status *transitions*, not the status.** Asserting "`#status` is ok"
// after an action is nearly worthless: it was ok before the action too, so a
// button that does nothing at all passes. `runCompile` blanks the class and
// writes "rendering" the moment it starts, so a recorder installed on boot
// (`__ksavStatus`, below) can insist on seeing a *new* compile finish. A button
// that fires no compile fails here, which is precisely the failure mode a
// reading test cannot have.
//
// # Looking at the screen
//
// Relayed from Girsa, and it lands hardest here. Every guard in this repository
// reads source. Girsa's two worst bugs were a commentary block sitting at
// `opacity: 0` and a pane title measured at 0px — neither is a fact about
// source, both files said exactly what they should say, and a sweep of this
// repository would have missed the same pair for the same reason.
//
// The uncomfortable part is that the browser was **already here**. This file
// drove a real Chrome through eight steps of using the product and every
// assertion in it was a count or a string. Having the browser open on the real
// stylesheet and never asking it what was on the screen is a worse position than
// not having it, because it looks like the question was answered.
//
// It is not answered by clicking, either. Playwright's own actionability check
// calls an element visible when it has a non-empty box and no `visibility:
// hidden` — and **`opacity: 0` passes it**. Eight steps of clicking through this
// application prove nothing whatsoever about Girsa's first bug.
//
// So `visible()` below measures four things, and none of them is a pixel:
//
//   - a non-zero border box;
//   - an effective opacity above zero — the product of every `opacity` from the
//     element up to `<html>`, because `opacity: 0` on a *parent* hides a child
//     whose own opacity is 1, which is Girsa's commentary block exactly;
//   - no `display: none` and no `visibility: hidden` anywhere in that chain;
//   - a box that intersects the viewport, which is what tells an open drawer
//     from a closed one: `.drawer` is `position: fixed` at `translateX(100%)`
//     when shut, so it has a perfectly good 300×1080 box the whole time it is
//     off the side of the screen.
//
// The failing message names the *ancestor* that did it rather than the element
// that was asked about, because the element is never where the answer is.
//
// This is not rendering comparison and it does not cry wolf on a font update:
// nothing here reads a colour, a position or a size against an expected one.
// "Is this on the screen at all" and "does this look the way it did last week"
// are two questions, and the paragraph above declines only the second.
//
// **Which surfaces** comes from `app/src/panels.ts` — the registry that already
// owns the `open` class, the `×`, the backdrop and the Escape sweep — read as
// data through `tools/load.mjs` rather than matched out of the source. A list of
// panel ids copied into this file would be a hand-written list of twenty-two,
// which is the exact shape of the bug `panels.ts` was written to end. See
// `app/tools/surfaces.mjs` for the classification and for the two surfaces that
// carry a written reason for not being reachable from here.
//
// # The dependency
//
// `playwright-core`, and deliberately not `playwright`: the full package
// downloads a ~150 MB browser in every `npm install`, on a project whose entire
// devDependency list is seven entries. `playwright-core` is 14 MB and ships no
// browser, so this drives whatever Chrome is already installed — which is what
// the GitHub runner has, and what a desk has.
//
// `wasm-smoke.mjs` next door opens with "Node rather than a browser on purpose …
// a headless browser would add a large dependency to test the part that is least
// likely to be wrong." That is still true of *that* file and false of this one.
// The wasm module is the same code in both places; the assembled chrome exists
// in exactly one place, and this is the only thing that goes there.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Both live in the app, which is where their dependencies are: `load.mjs`
// reaches for esbuild and this directory has no `node_modules` of its own.
import { load } from "../../ksav/app/tools/load.mjs";
import {
  CORE,
  EMPTY_ROW,
  HOW,
  LISTS,
  measurable,
  planFor,
  reallyOpen,
} from "../../ksav/app/tools/surfaces.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const APP = path.join(ROOT, "ksav/app");

// ------------------------------------------------------------------ arguments

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const HEADED = flag("--headed");
const KEEP = flag("--keep"); // leave the browser open on failure, to look at it
const PORT = Number(value("--port", "7877")); // not 7878: the dev proxy owns that
const EXTERNAL = value("--url", "");
const SLOW = Number(value("--slow", "0"));

// --------------------------------------------------------------------- checks

const failures = [];
let checks = 0;
/**
 * One assertion. `condition` is a **boolean**, and the refusal below is why.
 *
 * There are two functions called `check` in this repository's test tooling and
 * they mean different things by their second and third arguments:
 *
 *   acceptance.mjs   check(name, condition, detail)   — a boolean
 *   test/harness.mjs check(name, got, want)           — deep equality
 *
 * The confusion is one-directional and therefore quiet. Writing
 * `check(name, cond, "detail")` in the harness fails loudly every time, because
 * `true` is not `"detail"`. Writing `check(name, value, expected)` here
 * **passes whenever `value` is truthy** — it asserts that something exists and
 * says nothing about what it is. That happened: the version-control step read a
 * `data-git` attribute and compared it to `"unavailable"` in this position, so
 * it would have been satisfied by `no-git`, by `no-repo`, by any state at all.
 *
 * A sweep found no second instance, and a sweep is the wrong instrument for
 * this: the next one is written by whoever last used the other `check`. So the
 * mistake is refused at the call rather than looked for afterwards.
 */
function check(name, condition, detail = "") {
  if (typeof condition !== "boolean") {
    throw new TypeError(
      `check(${JSON.stringify(name)}) was handed a ${typeof condition} where it wants a ` +
        `boolean. This is not test/harness.mjs: here the second argument is the ` +
        `condition and the third is only shown when it fails. Write ` +
        `check(name, a === b, String(a)).`,
    );
  }
  checks++;
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}
const step = (n, name) => console.log(`\n[${n}] ${name}`);

// --------------------------------------------------------------- the binaries

function ksavBinary() {
  const exe = process.platform === "win32" ? "ksav.exe" : "ksav";
  const p = path.join(ROOT, "ksav/engine/target/release", exe);
  if (fs.existsSync(p)) return p;
  console.error(
    `no server binary at ${p}\n` +
      `  build it first, and with the app inside it:\n` +
      `    cd ksav/app && npm run build\n` +
      `    cd ksav/engine && cargo build --release --features embed-ui`,
  );
  process.exit(1);
}

/**
 * Refuse to run against yesterday's application.
 *
 * G7, relayed from Girsa: rule out your own setup before filing a finding. This
 * is the setup error that costs the most, and it has been paid for twice.
 *
 * `include_dir!` copies `app/dist` into the binary at *compile* time, so editing
 * `src/`, running `npm run build` and then running this drives the app the binary
 * was built with — not the one on disk. Every check passes or fails about code
 * that is not the code in front of you. The Emacs-mode report went a long way on
 * exactly this shape: the failing application was "a locally built release
 * binary" and establishing that the mode was even inside it took a rebuild, a
 * hash comparison and a search for chunk names in the executable.
 *
 * A warning would not do. A run that prints a note and then reports twelve
 * failures about a build nobody is looking at is worse than no run, because the
 * failures look like findings. So it exits, and says which two commands fix it.
 */
function assertFresh(bin) {
  const dist = path.join(APP, "dist");
  if (!fs.existsSync(dist)) return; // `--url` runs and dev servers have no dist
  const built = fs.statSync(bin).mtimeMs;
  const newest = fs
    .readdirSync(dist, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => fs.statSync(path.join(e.parentPath ?? e.path, e.name)).mtimeMs)
    .reduce((a, b) => Math.max(a, b), 0);
  if (newest <= built) return;
  console.error(
    `the server binary is older than app/dist, so this would drive the previous build.\n` +
      `  binary   ${new Date(built).toISOString()}  ${path.relative(ROOT, bin)}\n` +
      `  app/dist ${new Date(newest).toISOString()}\n` +
      `  the app is compiled *into* the server by include_dir!, so rebuild both:\n` +
      `    cd ksav/app && npm run build\n` +
      `    cd ksav/engine && cargo build --release --features embed-ui`,
  );
  process.exit(1);
}

/**
 * Whatever Chromium this machine already has.
 *
 * `playwright-core` ships no browser (see the header), so this needs one that is
 * installed — and *which* one is the only part of this file that differs by
 * platform. It used to name `chrome` and nothing else, which is right on a
 * GitHub runner and on this desk, and wrong on the two machines a contributor is
 * most likely to have: a Mac without Chrome, and WSL, where the Chrome that is
 * installed belongs to Windows and is not reachable from inside the distro.
 *
 * So: try the channels in order and take the first that starts. They are all
 * Chromium and this run asserts on the DOM rather than on pixels, so which one
 * answers changes nothing about what is measured.
 *
 * `--no-sandbox` only when running as root, which is Chrome's own condition for
 * refusing to start at all — the default WSL and container account. Narrow on
 * purpose: it is a real weakening of the browser, and every other case gets the
 * sandbox it should have.
 */
async function launchBrowser(chromium) {
  const channels = ["chrome", "msedge", "chromium"];
  const root = process.platform !== "win32" && process.getuid?.() === 0;
  const args = root ? ["--no-sandbox"] : [];
  const why = [];
  for (const channel of channels) {
    const browser = await chromium
      .launch({ channel, headless: !HEADED, slowMo: SLOW, args })
      .catch((e) => {
        why.push(`  ${channel}: ${String(e.message).split("\n")[0]}`);
        return null;
      });
    if (browser) return browser;
  }
  const install = {
    darwin: "brew install --cask google-chrome",
    linux: "sudo apt-get install -y google-chrome-stable   # or: chromium",
    win32: "install Chrome or Edge",
  };
  console.error(
    `no Chromium would start — this drives a browser that is already installed rather than downloading one.\n` +
      `${why.join("\n")}\n` +
      `  on this platform (${process.platform}): ${install[process.platform] ?? install.linux}\n` +
      `  under WSL that means installing it *inside* the distro; the Windows Chrome is not reachable from here.`,
  );
  process.exit(1);
}

// The fallback editor is not the product.
//
// `embed-ui` is an optional feature, and a binary built without it answers `/`
// with a page saying so — `engine/web/` used to hold a whole second editor
// there, which returned 200 and looked like an editor, so a run against it
// failed eleven checks with eleven confusing messages instead of one clear one.
// The SPA's `index.html` links a web manifest and that page does not, which is
// the cheapest thing that tells them apart.
function assertRealApp(html) {
  if (html.includes('rel="manifest"')) return;
  console.error(
    "the server answered / with the fallback editor, not the app.\n" +
      "  that binary was built without `--features embed-ui`, so `app/dist` is not inside it:\n" +
      "    cd ksav/app && npm run build\n" +
      "    cd ksav/engine && cargo build --release --features embed-ui",
  );
  process.exit(1);
}

async function waitForServer(url, ms = 40_000) {
  const until = Date.now() + ms;
  let last = "";
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = String(e.cause?.code ?? e.message);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.error(`server never answered ${url} — ${last}`);
  process.exit(1);
}

// ------------------------------------------------------------------ the run

let server = null;
let browser = null;

async function main() {
  const url = EXTERNAL || `http://127.0.0.1:${PORT}`;

  if (!EXTERNAL) {
    const bin = ksavBinary();
    assertFresh(bin);
    console.log(
      `booting ${path.relative(ROOT, bin)} on ${url}` +
        ` (built ${new Date(fs.statSync(bin).mtimeMs).toISOString()})`,
    );
    server = spawn(bin, ["serve", `127.0.0.1:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
    // Kept, not printed. The server is chatty about Girsa on a desk with no
    // Girsa running, and that noise is not this test's subject — but if a check
    // fails it is often the first place the reason is written down.
    const serverLog = [];
    server.stdout.on("data", (d) => serverLog.push(String(d)));
    server.stderr.on("data", (d) => serverLog.push(String(d)));
    server.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`server exited with ${code}\n${serverLog.join("")}`);
        process.exit(1);
      }
    });
  }

  const html = await waitForServer(url);
  assertRealApp(html);

  // The surfaces to look at, read off the application's own registry.
  //
  // Before the browser starts, so that a registry this script cannot classify —
  // a new mounted panel with no recipe — fails in two seconds with a sentence
  // about the panel, rather than four minutes later with a timeout. `planFor`
  // throws rather than dropping what it does not understand.
  const { PANELS } = await load("panels");
  const plan = planFor(PANELS);
  console.log(`${plan.length} declared surfaces, ${measurable(plan).length} of them reachable here`);
  for (const e of plan) {
    if (e.how === HOW.unreachable) console.log(`  not from here: ${e.panel.id} — ${e.why}`);
  }

  // By path, and as a `file://` URL: this script lives in `.github/scripts`,
  // which has no `node_modules` of its own, and a bare Windows path is not a
  // scheme the ESM loader accepts.
  const from = path.join(APP, "node_modules/playwright-core/index.mjs");
  if (!fs.existsSync(from)) {
    console.error(`no playwright-core at ${from} — run \`npm ci\` in ksav/app first`);
    process.exit(1);
  }
  const { chromium } = await import(pathToFileURL(from).href);
  browser = await launchBrowser(chromium);

  const context = await browser.newContext({ acceptDownloads: true, locale: "he-IL" });
  const page = await context.newPage();

  // Everything the page said went wrong, in one list, for the whole run.
  //
  // `console.error` and an uncaught exception are the two ways a broken button
  // announces itself in a single-page application: nothing throws all the way
  // out, the click handler dies, and the interface simply does not change. Both
  // are collected with the step that was running at the time, so a failure names
  // the path rather than the run.
  const problems = [];
  let current = "boot";
  page.on("console", (m) => {
    if (m.type() === "error") problems.push({ at: current, what: m.text() });
  });
  page.on("pageerror", (e) => problems.push({ at: current, what: `uncaught: ${e.message}` }));
  // A 4xx/5xx is a *successful* response as far as the browser is concerned, so
  // `requestfailed` never sees one and the console prints only "Failed to load
  // resource: 404" with no URL in it. Naming the URL is the difference between a
  // finding and a shrug — the first run of this file produced eleven of these
  // and the message did not say what was missing.
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push({ at: current, what: `HTTP ${r.status()} ${r.url()}` });
  });
  page.on("requestfailed", (r) => {
    // `net::ERR_ABORTED` is what a cancelled navigation and a superseded compile
    // both look like, and neither is a defect.
    const why = r.failure()?.errorText ?? "";
    if (!why.includes("ERR_ABORTED")) problems.push({ at: current, what: `${why} ${r.url()}` });
  });

  const since = () => problems.length;
  const newProblems = (mark) => problems.slice(mark);

  await page.goto(url, { waitUntil: "domcontentloaded" });

  // The status recorder.
  //
  // Installed from out here rather than shipped in the app, because a product
  // that carries a test hook is a product with a test hook in it. `#status` is
  // replaced wholesale by `render()` when the chrome rebuilds, so this observes
  // the subtree of `#app` and reads the element by id each time rather than
  // holding a reference to one that may already have been discarded.
  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__ksavStatus = [];
    const note = () => {
      const s = document.getElementById("status");
      if (!s) return;
      const entry = { text: s.textContent ?? "", cls: s.className };
      const last = w.__ksavStatus[w.__ksavStatus.length - 1];
      if (last && last.text === entry.text && last.cls === entry.cls) return;
      w.__ksavStatus.push(entry);
    };
    new MutationObserver(note).observe(document.getElementById("app") ?? document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    note();

    // How many compiles asked which lines printed on which page.
    //
    // Recorded out here for the same reason as the status: it is a property of
    // the *request*, and a narrowed preview that quietly stopped asking would
    // still look right for as long as the last answer happened to fit — which is
    // exactly what step 17 caught. Read off the wire rather than out of the app,
    // so it stays a test hook rather than a hook the product carries.
    const fetched = w.fetch.bind(w);
    w.__ksavAskedForLines = 0;
    w.fetch = async (input, init) => {
      if (String(input).includes("/compile") && String(init?.body ?? "").includes('"want_lines":true')) {
        w.__ksavAskedForLines++;
      }
      return await fetched(input, init);
    };
  });

  /** How many compiles have finished so far. */
  const compiles = () =>
    page.evaluate(() =>
      /** @type {any} */ (window).__ksavStatus.filter((e) =>
        e.cls === "ok" || e.cls === "warn" || e.cls === "err"
      ).length,
    );

  /**
   * Wait for a compile that started *after* now to finish, and say how it went.
   *
   * The 250 ms debounce means the compile has not begun when the click returns,
   * so waiting for "a terminal class" alone would read the previous compile's
   * verdict and pass for a button that does nothing.
   */
  async function settled(before) {
    await page.waitForFunction(
      (n) =>
        /** @type {any} */ (window).__ksavStatus.filter((e) =>
          e.cls === "ok" || e.cls === "warn" || e.cls === "err"
        ).length > n,
      before,
      { timeout: 30_000, polling: 50 },
    );
    return await page.evaluate(() => {
      const w = /** @type {any} */ (window);
      const done = w.__ksavStatus.filter((e) => e.cls === "ok" || e.cls === "warn" || e.cls === "err");
      const last = done[done.length - 1];
      return {
        cls: last.cls,
        text: last.text,
        diagnostics: document.getElementById("diagnostics")?.textContent ?? "",
        pages: document.querySelectorAll(".preview-host .page").length,
      };
    });
  }

  /** Do something, wait for the compile it causes, and hold it to all of it. */
  async function act(name, fn) {
    const mark = since();
    const before = await compiles();
    await fn();
    let out;
    try {
      out = await settled(before);
    } catch {
      check(`${name} recompiles the document`, false, "no compile finished within 30s");
      return null;
    }
    check(`${name} compiles cleanly`, out.cls !== "err", `${out.text} — ${out.diagnostics}`);
    check(`${name} leaves pages on screen`, out.pages > 0, `${out.pages} pages`);
    const bad = newProblems(mark);
    check(`${name} says nothing to the console`, bad.length === 0, bad.map((p) => p.what).join(" | "));
    return out;
  }

  /**
   * Type into the editor, wherever the caret already is.
   *
   * `.cm-content` was one element for the first thirteen steps and has been two
   * since step 14 split the window — so this resolved to a strict-mode
   * violation and stopped the whole run rather than typing anywhere. The
   * docstring was already right about what it meant; it just had no way of
   * saying it. CodeMirror marks the focused editor `cm-focused`, which *is*
   * "wherever the caret already is", and the first pane is the fallback for the
   * moment before anything has been focused.
   *
   * The second bug was the same sentence written as a locator. `cm-focused` is
   * a class the browser adds and removes, and a Playwright locator is a *query*
   * rather than an element: naming that class meant `count()` asked the page one
   * question and `pressSequentially` asked it again a moment later, and step 11
   * is where the two answers differ. Switching documents rebuilds the editor, so
   * the outgoing view still carried `cm-focused` when the count was taken and
   * had dropped it before the keystrokes went out — leaving the run waiting
   * thirty seconds for a class that was never coming back. Green on this desk,
   * red on CI, which is what a race looks like from the outside.
   *
   * So the class is read *once*, per pane, off a selector that does not mention
   * it; and having chosen a pane this takes the focus rather than hoping for it.
   * `.focus()` on the contenteditable leaves CodeMirror's selection where it
   * was, which is what makes this still mean "wherever the caret already is".
   */
  const type = async (text) => {
    const panes = page.locator(".cm-content");
    const count = await panes.count();
    let where = panes.first();
    for (let i = 0; i < count; i += 1) {
      const pane = panes.nth(i);
      const focused = await pane.evaluate(
        (el) => el.closest(".cm-editor")?.classList.contains("cm-focused") ?? false,
      );
      if (focused) {
        where = pane;
        break;
      }
    }
    // How that race is reproduced on a desk, since it only ever happened on CI:
    // `KSAV_ACCEPT_BLUR=1 npm run accept` drops the focus between choosing a
    // pane and typing into it, which is the CI timing made deliberate and
    // relentless. Against the locator this replaced it stops at check 500 with
    // the runner's own error, word for word; against this it runs to the end.
    if (process.env.KSAV_ACCEPT_BLUR) await page.evaluate(() => document.activeElement?.blur());
    const node = await where.elementHandle();
    await node.evaluate((el) => el.focus());
    // Waited for rather than asserted: `.focus()` moves the browser's focus at
    // once, and `cm-focused` is CodeMirror noticing — a separate handler, a
    // separate turn of the loop. Asserting it in the same expression was this
    // bug's own mistake made a second time, one call further down.
    await page
      .waitForFunction(
        (el) => el.closest(".cm-editor")?.classList.contains("cm-focused") ?? false,
        node,
        { timeout: 5000 },
      )
      .catch(() => {
        throw new Error(`type(${JSON.stringify(text.slice(0, 20))}…): no editor took the focus`);
      });
    await where.pressSequentially(text, { delay: 4 });
  };

  // ------------------------------------------------------ looking at the screen

  /**
   * Everything about one node that decides whether a person can see it.
   *
   * Runs in the page because every one of these is a question only a layout
   * engine can answer, and it walks *up* from the element because none of the
   * four properties belongs to the element alone. `opacity: 0` on a parent, a
   * `display: none` three levels up and a container translated off the side of
   * the window all hide a child whose own computed style is perfect.
   */
  async function measure(selector) {
    // Through a locator, so that this and the click that follows it resolve the
    // same element by the same rules.
    //
    // It used to hand the selector to `document.querySelectorAll` inside the
    // page, and that was two engines pretending to be one. Playwright's selector
    // language is a superset of CSS — `:has-text("∑")` is how you name a menu
    // item whose only stable feature is a glyph, since the words beside it are
    // translated — and the browser answered the same string with
    // `SyntaxError: not a valid selector`. Measuring what the locator found also
    // ends the older sleight of hand, where "the first match" was decided twice
    // and could in principle be decided differently.
    const all = page.locator(selector);
    if ((await all.count()) === 0) return { found: false, count: 0 };
    const count = await all.count();
    return await all.first().evaluate((el, n) => {
      /** `div#help-panel.drawer`, enough to find it in a stylesheet. */
      const name = (n) =>
        n.tagName.toLowerCase() +
        (n.id ? `#${n.id}` : "") +
        (n.classList.length ? `.${[...n.classList].slice(0, 3).join(".")}` : "");

      let opacity = 1;
      let blankedBy = null;
      let hiddenBy = null;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        const own = Number(cs.opacity);
        if (Number.isFinite(own)) {
          opacity *= own;
          // The first ancestor to take it to nothing, which is the one somebody
          // has to go and look at. Reporting the element instead — the mistake
          // that makes this kind of check useless — would name a node whose own
          // style is beyond reproach.
          if (own <= 0.01 && !blankedBy) blankedBy = `${name(n)} at opacity ${cs.opacity}`;
        }
        if (cs.display === "none" && !hiddenBy) hiddenBy = `${name(n)} is display:none`;
        if ((cs.visibility === "hidden" || cs.visibility === "collapse") && !hiddenBy) {
          hiddenBy = `${name(n)} is visibility:${cs.visibility}`;
        }
        if (cs.contentVisibility === "hidden" && !hiddenBy) {
          hiddenBy = `${name(n)} is content-visibility:hidden`;
        }
      }

      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return {
        found: true,
        count: n,
        what: name(el),
        w: Math.round(r.width),
        h: Math.round(r.height),
        opacity: Number(opacity.toFixed(3)),
        blankedBy,
        hiddenBy,
        // Intersects, not "is wholly inside": a drawer taller than the window is
        // on the screen, and a modal scrolled slightly past the fold is too. What
        // this excludes is the thing `.drawer` does when it is shut — sit at
        // `translateX(100%)`, entirely past the edge, with its box intact.
        inViewport: r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh,
        box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`,
        viewport: `${vw}×${vh}`,
      };
    }, count);
  }

  /** How many nodes this run has actually looked at. */
  let looked = 0;

  /**
   * Hold one surface to being on the screen. Four claims, named separately,
   * because "it is not visible" is a bug report nobody can act on.
   */
  async function visible(name, selector) {
    const m = await measure(selector);
    if (!m.found) {
      check(`${name} is in the document`, false, `nothing matches ${selector}`);
      return false;
    }
    looked++;
    const at = `${selector} — ${m.what} at ${m.box} in ${m.viewport}`;
    check(`${name} has a box`, m.w > 0 && m.h > 0, at);
    check(`${name} is not transparent`, m.opacity > 0.01, m.blankedBy ?? `effective opacity ${m.opacity}`);
    check(`${name} is not hidden`, !m.hiddenBy, m.hiddenBy ?? "");
    check(`${name} is on the screen`, m.inViewport, at);
    return m.w > 0 && m.h > 0 && m.opacity > 0.01 && !m.hiddenBy && m.inViewport;
  }

  /**
   * Click something, having first established that a person could have.
   *
   * Every click in this file goes through here, and that is the whole fix rather
   * than a convenience: Playwright waits for its own notion of visible before it
   * clicks, and that notion admits `opacity: 0`. So the eight steps below were
   * already touching every flagship control in the product and were already
   * incapable of noticing the bug this item is about. `visibility.test.mjs`
   * fails on a bare `page.click` reappearing here.
   */
  async function clickVisible(name, selector) {
    await visible(name, selector);
    // Shorter than the 30-second default on purpose: by the time this is
    // reached the element has already been measured and found to be on the
    // screen, so a click that cannot land is something covering it, and waiting
    // half a minute to say so only makes the run slower at being right.
    await page.click(selector, { timeout: 15_000 });
  }

  /**
   * Measure with the transitions turned off, and put them back.
   *
   * `.drawer` carries `transition: transform .2s`, so a probe that adds `open`
   * and measures immediately catches the drawer a third of the way onto the
   * screen and reports a number that is true for 200ms and meaningless. This is
   * not a stylesheet under test being edited: a transition is the journey and
   * every claim above is about the destination.
   */
  async function withoutMotion(fn) {
    await page.addStyleTag({
      content: "*, *::before, *::after { transition: none !important; animation: none !important }",
    });
    try {
      return await fn();
    } finally {
      await page.evaluate(() => {
        for (const s of document.querySelectorAll("style")) {
          if (s.textContent?.includes("transition: none !important")) s.remove();
        }
      });
    }
  }

  /**
   * Put the caret on a fresh last line, which is where every step below starts.
   *
   * Six copies of click-End-Enter, and the click was the one gesture in this
   * file that reached the editor without ever asking whether it was on the
   * screen. One helper, and it goes through `clickVisible` like everything else.
   */
  async function newLine() {
    await clickVisible("the editor", ".cm-content");
    await press("Control+End");
    await press("Enter");
  }

  /** The page gestures a `drive` recipe in `surfaces.mjs` may use. */
  const driver = {
    type,
    newLine,
    // Measured, like every other click in the run.
    //
    // The recipes were the last place still clicking blind, and a run caught it:
    // three of them failed with `Timeout 30000ms exceeded` on ribbon buttons that
    // work on every other run, and thirty seconds of waiting produced no fact
    // about the button at all. A measured click answers with the box, the
    // opacity and where in the viewport it was — which is the difference between
    // a flake and a finding, and is the whole subject of this file.
    click: (sel) => clickVisible(sel, sel),
    press: (key) => press(key),
    /** Put the keyboard back in the editor, where `bindings.ts` is listening. */
    focus: () => page.click(".cm-content"),
    /** Do something, and wait for the compile it causes to finish. */
    settled: async (fn) => {
      const before = await compiles();
      await fn();
      await settled(before);
    },
    waitFor: (sel, ms) => page.waitForSelector(sel, { timeout: ms }),
    rightClick: (sel) => page.click(sel, { button: "right", timeout: 15_000 }),
    escape: () => press("Escape"),
  };

  /**
   * Press a key, in a shape a browser would actually produce.
   *
   * G7, and this one was paid for in this file. `keyboard.press("Control+Shift+k")`
   * — a lowercase letter with Shift — makes Playwright send `key: "k"` with
   * `shiftKey: true`. **No browser does that**; a real one sends `"K"`. CodeMirror
   * builds its binding name from `event.key`, so it looked up `Ctrl-k`, found the
   * command palette, and opened it. The conclusion drawn from that was that
   * `Mod-Shift-k` was dead and running the wrong command, and it was filed as a
   * defect against thirteen shortcuts. It was a defect in the driver: pressed as
   * `Control+Shift+K`, the commands drawer opens exactly as it should.
   *
   * So the shape is refused rather than documented. A comment saying "remember to
   * capitalise" is a comment somebody reads after losing the afternoon.
   */
  function press(key) {
    const m = /(?:^|\+)Shift\+([a-z])$/.exec(key);
    if (m) {
      throw new Error(
        `press("${key}"): a browser sends "${m[1].toUpperCase()}" for Shift and a letter, not ` +
          `"${m[1]}", and CodeMirror reads the binding off event.key — so this would test ` +
          `Ctrl-${m[1]} and quietly run whatever answers to that. Write ` +
          `"${key.slice(0, -1)}${m[1].toUpperCase()}".`,
      );
    }
    return page.keyboard.press(key);
  }

  /** Is it showing, by the same test `isPanelOpen` uses? */
  const showing = (sel, mounted) =>
    page.evaluate(
      ([s, m]) => {
        const n = document.querySelector(s);
        return m ? !!n : !!n?.classList.contains("open");
      },
      [sel, mounted],
    );

  /**
   * Put a surface away again, through the ways out the registry says it has.
   *
   * Not housekeeping. A surface that will not close is the bug `panels.ts` was
   * written for, and every `exits` entry in that registry is a promise this is
   * the only thing in the repository that can collect on — `panels.test.mjs`
   * clicks its way out of each surface against a *built* DOM, which is the same
   * claim one layer below the stylesheet.
   *
   * The chip is tried last and it is not a way out. Pressing it again is what a
   * reader would try, and the run proved why the registry never counted it: with
   * `outline-drawer` open, the drawer is `top: 0; height: 100vh` on the start
   * side and **covers the chip that opened it** — Playwright sat there for thirty
   * seconds watching an `.outline-item` intercept every click. That is the
   * settings-drawer bug in `panels.ts`'s own opening paragraph, and the registry
   * already answers it with the `×`, which is why the `×` is tried first.
   */
  async function putAway(name, entry, root, mounted) {
    const p = entry.panel;
    const still = () => showing(root, mounted);
    const tried = [];
    // A way out that cannot even be clicked is a way out that does not exist, so
    // the reach is short and the failure is the same one either way.
    //
    // Named `tryExit` and not `press`, which is what it was called until `press`
    // became the keyboard guard at the top of this file. The two then differed
    // only in their arguments, this one shadowed that one inside this function,
    // and `press("Escape")` became `page.click(undefined)` — every surface with
    // no other way out failing to close, with a message about a selector. Caught
    // by the run rather than by a fence, because both spellings are `press(` and
    // no sweep over the text could have told them apart.
    const tryExit = async (what, sel, opts) => {
      tried.push(what);
      await page.click(sel, { timeout: 5_000, ...opts }).catch((e) => {
        tried[tried.length - 1] = `${what} (${String(e.message).split("\n")[0]})`;
      });
    };

    if (p.escape) {
      tried.push("Escape");
      await press("Escape");
    }
    // A surface that follows the caret is put back by writing somewhere else,
    // and that is a reset rather than a dismissal — see the note below on why
    // nothing is asserted about it afterwards.
    if (p.exits.some((x) => x.via === "caret") && (await still())) {
      tried.push("writing somewhere with no structure in it");
      await newLine();
      await type("סוף");
    }
    if (p.exits.some((x) => x.via === "head") && (await still())) {
      await tryExit("the ×", `${root} .styles-close`);
    }
    if (p.exits.some((x) => x.via === "scrim") && (await still())) {
      // At the very corner, which is scrim and never the box inside it —
      // `overlayPanel` dismisses on `target.id === id` exactly.
      await tryExit("the backdrop", root, { position: { x: 2, y: 2 } });
    }
    if (entry.how === HOW.chip && (await still())) {
      await tryExit("the chip again", `[data-chip="${entry.chip}"]`, { force: true });
    }

    // And the assertion, for the surfaces that can actually be dismissed.
    //
    // `caret` and `toggle` are not dismissals and this took a run to establish
    // rather than to assume. The contextual ribbon was asked to close and would
    // not, through Escape, through Control+Home and through a fresh line of
    // prose — because `updateContextBar` **deliberately keeps it up in prose**:
    // "what a writer standing in prose can actually do to a list is make one, so
    // that is what the strip offers". It is the answer to a margin note about a
    // strip that vanished and read as broken. A strip that covers nothing and
    // always has something to say has no way out because it needs none, and
    // demanding one would be this file inventing a requirement the product
    // considered and rejected.
    //
    // So the claim is made where there is something to claim, and the surfaces
    // it is not made about are the ones whose registry entry says so.
    const dismissible =
      p.escape ||
      entry.how === HOW.chip ||
      p.exits.some((x) => x.via === "head" || x.via === "scrim");
    if (dismissible) {
      check(`${name} closes again`, !(await still()), `tried ${tried.join(", ")}; ${root} is still open`);
    } else {
      console.log(`  --    ${name} has no way to be dismissed, by declaration: ` +
        `${p.exits.map((x) => x.via).join(", ")}`);
    }
  }

  /**
   * Get the document back to itself after a recipe failed part-way through.
   *
   * Without this, one failure is twenty. A drive that opens the palette and then
   * cannot finish leaves a full-viewport scrim over everything, and every later
   * surface fails on a click the scrim intercepted — the run that found this
   * reported eight failures of which exactly one was real, and the other seven
   * named surfaces that were never reached. A cascade is not extra information;
   * it is the one finding buried under seven copies of its own consequence.
   *
   * The class is stripped rather than closed properly, and that is the right
   * trade *here only*: the panel's own way out has already been asked for and
   * this is the path where it did not work. What is left over is returned rather
   * than swallowed, so the failure that caused it says what it left behind.
   */
  async function recover() {
    await press("Escape");
    return await page.evaluate(() => {
      // Every `open` there is, which is blunter than anything else in this file
      // and is meant to be: `panels.ts` is the only code that spells this class,
      // so "everything wearing it" is the whole set of surfaces, and this path
      // runs only where the polite way has already failed.
      const stuck = [...document.querySelectorAll(".open")];
      for (const n of stuck) n.classList.remove("open");
      // The mounted ones are not shown by a class and would survive it.
      for (const n of document.querySelectorAll(".spell-menu")) n.remove();
      return stuck.map((n) => n.id || n.className).slice(0, 6);
    });
  }

  // Everything above this line is a helper, everything below it is a step, and
  // `visibility.test.mjs` holds that boundary: no `page.click` may appear after
  // `step(0`. A click that has not been measured is the whole of what this file
  // used to be, and the one thing it must not quietly become again.

  // ------------------------------------------------------------- 0. it boots

  step(0, "the application boots");
  current = "boot";
  await page.waitForSelector("#app .toolbar", { timeout: 30_000 });
  const boot = await settled(0);
  check("the first document compiles", boot.cls !== "err", `${boot.text} — ${boot.diagnostics}`);
  // Waited for, not sampled.
  //
  // This read the page count at the instant the first compile finished and was
  // **flaky**: boot has more than one compile in it — the welcome document, then
  // whatever the writer had open — and `settled(0)` returns on the first of them,
  // which can finish before a page node is in the document. It passed on one run
  // and failed on the next with `0 pages`.
  //
  // A check that is right most of the time is worse than no check: this suite's
  // whole claim is that a red run means something. So the boot step waits for the
  // page the way a person does, and only the 30-second timeout can fail it.
  await page
    .waitForSelector(".preview-host .page", { timeout: 30_000 })
    .catch(() => {});
  const pages = await page.locator(".preview-host .page").count();
  check("a page is rendered", pages > 0, `${pages} pages`);
  check(
    "it is talking to the server engine",
    (await page.locator("#engine-badge").textContent())?.includes("server"),
    await page.locator("#engine-badge").textContent(),
  );
  check("nothing failed on the way up", problems.length === 0, problems.map((p) => p.what).join(" | "));

  // The chrome, measured rather than counted.
  //
  // Every one of these is a node an existing check above or below already reads
  // a number or a string off. That is the point: the run has been leaning on all
  // five of them since it was written, and could not have told you whether any
  // of them was on the screen.
  await withoutMotion(async () => {
    for (const c of CORE) await visible(c.name, c.selector);
  });

  // And the one surface whose only moment is now.
  //
  // `welcome` is mounted during boot and step 1 dismisses it by picking a
  // template out of it, so this is the last instruction at which it exists. It
  // is also the first thing a reader has ever seen of this product, which makes
  // "is it actually on the screen" a question worth asking about it in
  // particular.
  const bootSurfaces = plan.filter((e) => e.how === HOW.boot);
  let swept = 0;
  await withoutMotion(async () => {
    for (const e of bootSurfaces) {
      swept++;
      await visible(`the ${e.panel.id} overlay`, e.panel.selector ?? `#${e.panel.id}`);
    }
  });

  // ------------------------------------------- 1. a new sefer from a template

  // The first screen a person ever sees, and the first thing they click. The
  // template list is generated from the engine's registry, so this is also the
  // only check anywhere that a shipped template survives the trip through the
  // browser into a compile — `wasm-smoke.mjs` compiles them through the module,
  // which is a different door.
  step(1, "a new sefer, from the ספר template");
  current = "template";
  await page.waitForSelector('#welcome [data-template="sefer"]', { timeout: 10_000 });
  const tpl = await act("loading the ספר template", () =>
    clickVisible("the ספר template card", '#welcome [data-template="sefer"]'),
  );
  check("the welcome overlay is gone", (await page.locator("#welcome").count()) === 0);
  check("the sefer template is more than one page", (tpl?.pages ?? 0) >= 1, `${tpl?.pages}`);

  // ----------------------------------------------------------- 2. a heading

  step(2, "a heading");
  current = "heading";
  await newLine();
  await type("פרק ראשון");
  await visible("the paragraph style control", "#heading-level");
  await act("choosing heading level 1", async () => {
    await page.selectOption("#heading-level", "1");
  });
  check(
    "the paragraph style control now reads level 1",
    (await page.locator("#heading-level").inputValue()) === "1",
    await page.locator("#heading-level").inputValue(),
  );

  // ------------------------------------------------------- 3. a bulleted list

  step(3, "a bulleted list");
  current = "bullets";
  await newLine();
  await act("clicking • in the ribbon", () =>
    clickVisible("the • button", '.toolbar [data-command="רשימה"]'),
  );
  await act("typing in the first bullet", () => type("סעיף אלף"));

  // ----------------------------------------------------------- 4. a table row

  step(4, "a table, and then a row in it");
  current = "table";
  await newLine();
  await act("clicking ▦ in the ribbon", () =>
    clickVisible("the ▦ button", '.toolbar [data-command="טבלה"]'),
  );
  await act("typing in a cell", () => type("עמודה"));
  // Through the palette, which is where a structural operation lives: it is
  // offered only when the caret is actually inside a table, so finding it here
  // is itself the check that the caret landed in the table the ribbon inserted.
  await press("Control+k"); // `palette: "Mod-k"`, from bindings.ts
  await page.fill("#palette-input", "table.rowBelow");
  await page.waitForSelector('#palette-list [data-action="table.rowBelow"]', { timeout: 5_000 });
  await act("adding a row below", () =>
    clickVisible("the table.rowBelow row", '#palette-list [data-action="table.rowBelow"]'),
  );

  // ------------------------------------------------------------ 5. a footnote

  step(5, "a footnote");
  current = "footnote";
  await newLine();
  await type("ועיין ברש\"י");
  await act("clicking † in the ribbon", () =>
    clickVisible("the † button", '.toolbar [data-action="footnote"]'),
  );
  // A parenthesis and a gershayim in one Hebrew note is the §6 bug exactly: the
  // scanner used to read `(רש"י)` as an open string and mis-colour, mis-fold and
  // mis-complete everything after it. It is fixed and fenced offline; this is
  // the same sentence, typed into the real editor, compiled by the real engine.
  await act("typing a note with a gershayim in parentheses", () => type("שם (רש\"י) ד\"ה כך"));

  // ------------------------------------------------------------- 6. an endnote

  // The one that had no button at all until recently, and that silently lost
  // every note when picked from the palette because nothing wrote the
  // `#הערות_בסוף()` dump. Both halves are only observable in the assembled app.
  step(6, "an endnote");
  current = "endnote";
  await newLine();
  await act("clicking ⁋ in the ribbon", () =>
    clickVisible("the ⁋ button", '.toolbar [data-action="endnote"]'),
  );
  await act("typing the endnote", () => type("מקור הדברים"));

  // ---------------------------------------------------------- 7. export a PDF

  step(7, "export a PDF");
  current = "export";
  const mark = since();
  await clickVisible("the Export menu", '[data-menu="export"] .menu-btn');
  await page.waitForSelector('[data-export="exportPdf"]', { timeout: 5_000 });
  const wait = page.waitForEvent("download", { timeout: 60_000 });
  await clickVisible("the Export → PDF item", '[data-export="exportPdf"]');
  let bytes = null;
  try {
    const download = await wait;
    const to = path.join(os.tmpdir(), `ksav-acceptance-${process.pid}.pdf`);
    await download.saveAs(to);
    bytes = fs.readFileSync(to);
    fs.rmSync(to, { force: true });
    check("the PDF is named after the document", download.suggestedFilename().endsWith(".pdf"),
      download.suggestedFilename());
  } catch (e) {
    check("Export → PDF downloads a file", false, String(e.message).split("\n")[0]);
  }
  if (bytes) {
    // The one assertion here that is about bytes rather than about the app's
    // opinion of itself. A compile that fails on the export path answers with a
    // status line and no file, and every check above this one would still pass.
    check("it is a PDF", bytes.subarray(0, 5).toString("latin1") === "%PDF-",
      bytes.subarray(0, 16).toString("latin1"));
    check("it has a document in it", bytes.length > 2000, `${bytes.length} bytes`);
  }
  check(
    "exporting says nothing to the console",
    newProblems(mark).length === 0,
    newProblems(mark).map((p) => p.what).join(" | "),
  );

  // ----------------------------------------------------- 7b. and out as Org
  //
  // The other end of the same menu, and the one route in it whose output a
  // person is going to read as *text*. The PDF check above proves the engine
  // ran; this proves the converter did, over a document that by now has a
  // heading, a bulleted list, a table, a footnote and an endnote in it — every
  // construct `interchange.ts` classifies, produced by the real editor rather
  // than typed into a fixture.
  //
  // The assertion that matters is the last one. `org.test.mjs` makes the same
  // claim offline over a document somebody wrote by hand; this makes it over one
  // the application built, which is where a command nobody remembered to
  // classify would actually come from.
  current = "org";
  await clickVisible("the Export menu", '[data-menu="export"] .menu-btn');
  await page.waitForSelector('[data-export="exportOrg"]', { timeout: 5_000 });
  const orgWait = page.waitForEvent("download", { timeout: 60_000 });
  await clickVisible("the Export → Org item", '[data-export="exportOrg"]');
  try {
    const download = await orgWait;
    const to = path.join(os.tmpdir(), `ksav-acceptance-${process.pid}.org`);
    await download.saveAs(to);
    const org = fs.readFileSync(to, "utf8");
    fs.rmSync(to, { force: true });
    check("the Org file is named after the document", download.suggestedFilename().endsWith(".org"),
      download.suggestedFilename());
    check("it has the heading in it", /^\*+ /m.test(org), org.slice(0, 120));
    check("it has the footnote in it", org.includes("[fn:1]"), org.slice(0, 200));
    check(
      "and no Ksav command survived the conversion",
      !/#[֐-׿\w_]+\[/.test(org),
      (/#[֐-׿\w_]+\[/.exec(org) ?? [""])[0],
    );
  } catch (e) {
    check("Export → Org downloads a file", false, String(e.message).split("\n")[0]);
  }

  // ------------------------------------------- 7c. Emacs mode takes the keyboard
  //
  // The one check in this file written from a bug report's own reproduction.
  //
  // Emacs mode did nothing at all in the production build: `C-k` killed nothing
  // and `Ctrl+K` opened Ksav's command palette. The same page in Vim mode worked.
  // Both keymaps sat at `Prec.highest` with the mode's placed first, and the
  // whole promise rested on CodeMirror breaking that tie by array order — which
  // it did, the other way, in the build that ships. Why it went the other way on
  // the dev server was never established, and does not need to be: Ksav's own
  // keymap now installs *nothing* while a mode is really on.
  //
  // Nothing offline can hold that. `buildShortcutKeymap` is in `main.ts`, the one
  // module no test can import, and the symptom is a keystroke reaching one of two
  // keymaps. It is exactly the kind of claim this file exists for.
  step("7c", "Emacs mode takes the keyboard from Ksav");
  current = "emacs";
  await clickVisible("the settings chip", '[data-chip="settings"]');
  await page.waitForSelector('[data-setting="editingMode"]', { timeout: 10_000 });
  await page.selectOption('[data-setting="editingMode"]', "emacs");
  // The mode is fetched over the network, so the proof that it arrived is a key
  // display changing: with a mode on, every surface that prints a chord prints
  // `M-x name` instead, because `buildShortcutKeymap` has just stopped
  // installing that chord and a column of dead keys is worse than no column.
  //
  // The door into the keys drawer is what is watched, and it is watched because
  // it is in Settings — where the sixty-row list used to be, and where this
  // check used to read it. When the list moved out to its own drawer this step
  // went red, which is the right answer to a surface that was the only one in
  // the application that knew about modes: the fix was to make it not the only
  // one. See `bindings.keyHint`.
  try {
    // `attached`, not visible: changing the mode rebuilds the chrome and the
    // drawer does not survive it. The claim is about what the button *says*,
    // and it is built whether or not the drawer is on screen at this instant.
    await page.waitForSelector("#keys-open.sc-key-mode", { state: "attached", timeout: 20_000 });
    const shown = await page.locator("#keys-open").first().textContent();
    check("the way into the keys stops printing a key the mode has taken", /^M-x /.test(shown ?? ""), shown ?? "");
  } catch (e) {
    check("emacs mode arrives", false, String(e.message).split("\n")[0]);
  }
  // And a menu, which is the half of the sweep that no unit test can reach:
  // `structureMenuItems`, `insertMenuItems` and the toolbar tooltips are all
  // built in `main.ts`. Nineteen surfaces printed a chord here and one of them
  // is enough to show the rule is in force, because they now share the call.
  await press("Escape");
  await clickVisible("the Insert menu", '[data-menu="insert"] .menu-btn');
  const inMenu = await page.locator('[data-menu="insert"] code.sc-key-mode').first().textContent()
    .catch(() => null);
  check(
    "a menu prints the mode's command where its chord used to be",
    (inMenu ?? "").startsWith("M-x "),
    inMenu === null ? "no key was printed in the Insert menu at all" : inMenu,
  );
  // Escape closes it — asserted, not assumed, and it is asserted because
  // assuming it is what broke this run on the remote. The dropdowns are not in
  // `PANELS`, so `closeOnEscape` never touched them: a menu opened from the
  // keyboard stayed open, the next step's click on the editor landed on the
  // menu instead, and Playwright retried it thirty times and gave up. The
  // product answer is that Escape closes menus too; this is the check that says
  // so, and it stands between two steps that would otherwise pass or fail on
  // whether the dropdown happens to overlap the editor at this window size.
  await press("Escape");
  await page.waitForSelector(".menu-list.open", { state: "detached", timeout: 5_000 }).catch(() => {});
  check(
    "and Escape closes a menu, the way it closes everything else",
    (await page.locator(".menu-list.open").count()) === 0,
    "the Insert menu was still open after Escape",
  );
  /**
   * Press a key with the caret in the document.
   *
   * Through `clickVisible` like every other click below `step(0` — which is not
   * a formality: this was `page.locator(".cm-content").click()` and
   * `visibility.test.mjs` refused it by name and line, two chunks after that
   * fence was written and by an author who had written it.
   */
  const pressInEditor = async (key) => {
    await press("Escape");
    await clickVisible("the editor", ".cm-content");
    await press(key);
  };

  const said = () => page.evaluate(() => document.getElementById("status")?.textContent ?? "");

  // Two keys, and the second is the one that measures the fix.
  //
  // `Ctrl+K` is the reported symptom and Emacs *wants* that key — it is
  // kill-line — so a mode that merely wins a precedence contest passes it. This
  // step was written with only that check and it stayed green with the takeover
  // **deleted**, which is a fence proving the wrong thing: the tie happens to
  // fall the mode's way in this build, and the whole reason for the change is
  // that nobody knows why it fell the other way in the build that shipped.
  //
  // `Ctrl+Alt+O` is Ksav's document switcher and Emacs does not claim it. Under
  // a tie it fires and writes onlyOneOpen to the status line, because a run that
  // makes one sefer has one document. Under a takeover nothing is listening and
  // the status line does not move. That is the difference between the two
  // designs, and it is the only assertion here that can see it.
  //
  // The status is compared against itself rather than against a string, because
  // the run is in Hebrew and a fence that hard-codes one language is a fence
  // that goes quiet the day somebody drives it in the other.
  const beforeKill = await compiles();
  await pressInEditor("Control+k");
  check(
    "Ctrl+K no longer opens Ksav's palette",
    !(await showing("#palette", false)),
    "the palette opened, so the mode is not getting keys it claims",
  );
  // Take the reading only once nothing is in flight.
  //
  // `Ctrl+K` is kill-line: it *edits*, so a compile is on its way, and the
  // status line will move from `rendering` to `✓ N pages · 812ms` entirely on
  // its own. Read mid-flight, the comparison below is a coin toss, and when it
  // lands wrong it reports "Ksav's keymap is still installed" about a keymap
  // that is not installed. Caught on a local run where every other check in 477
  // was green — the mirror image of the defect this file keeps finding in
  // itself, and worse: a check that cannot fail for the reason it names is
  // merely useless, and one that *can* fail for a reason it does not name sends
  // the reader after the wrong thing.
  //
  // Bounded rather than awaited outright, because a kill-line with nothing to
  // its right removes nothing and schedules nothing, and this step must not
  // hang on the day the caret lands at the end of a line.
  await page
    .waitForFunction(
      (n) =>
        /** @type {any} */ (window).__ksavStatus.filter(
          (e) => e.cls === "ok" || e.cls === "warn" || e.cls === "err",
        ).length > n,
      beforeKill,
      { timeout: 6_000, polling: 50 },
    )
    .catch(() => {});
  const before = await said();
  await pressInEditor("Control+Alt+o");
  check(
    "and a key Emacs does not claim reaches nothing either",
    (await said()) === before,
    `the status line moved to "${await said()}", so Ksav's keymap is still installed ` +
      "and the mode is only winning a tie",
  );

  // The other direction, so neither check above can pass by the surface simply
  // being broken.
  await press("Escape");
  await clickVisible("the settings chip", '[data-chip="settings"]');
  await page.waitForSelector('[data-setting="editingMode"]', { timeout: 10_000 });
  await page.selectOption('[data-setting="editingMode"]', "default");
  await page
    .waitForSelector("#keys-open.sc-key-mode", { state: "detached", timeout: 20_000 })
    .catch(() => {});
  await pressInEditor("Control+k");
  check(
    "…and the palette opens again with the mode off",
    await showing("#palette", false),
    "the palette did not open with no mode on, so the check above proves nothing",
  );
  const off = await said();
  await pressInEditor("Control+Alt+o");
  // **Either answer proves it, and only one of them used to exist.**
  //
  // What this check is for is that Ksav's keymap is installed with the mode
  // off — the control for the two above it, which assert that the same key
  // reaches nothing while Emacs holds the keyboard. It used to look for a
  // status message, because `openSwitcher` refuses below two open documents and
  // that refusal *is* the message; with one sefer open there was no other
  // outcome to have.
  //
  // Opening a document no longer takes the arrangement you were in, so by this
  // point in the run two are open and the key does the thing it is named after:
  // the switcher opens, and nothing is written to the status line. The proxy
  // went stale, not the mechanism — measured, on a red run, as
  // `{"open":true,"rows":2}`. So ask for the key's *effect*, whichever of its
  // two effects this run has earned.
  const opened = await showing("#switcher", false);
  check(
    "…as does the switcher's key",
    opened || (await said()) !== off,
    "neither the switcher opened nor the status line moved with no mode on, " +
      "so Ksav's keymap is not installed and the two checks above prove nothing",
  );
  await press("Escape");

  // ------------------------------------------------- 8. every surface, on screen

  // The sweep the whole item is about, and the one that is derived rather than
  // written: `PANELS` in, one measured surface out, so a twenty-third panel is
  // either looked at or named in `surfaces.mjs` with a reason. There is no third
  // option, which is what makes this different from the guard it replaces.
  step(8, "every declared surface is actually on the screen");
  current = "surfaces";

  for (const e of plan) {
    if (e.how === HOW.unreachable || e.how === HOW.boot) continue;
    const p = e.panel;
    const root = p.selector ?? `#${p.id}`;
    const mounted = p.presence === "mounted";
    swept++;

    // Opened the way a reader opens it, wherever there is a way. The chip is a
    // real click on a real control, so the panel's `open` hook runs and the body
    // — and the `×` inside its head — is actually built. See the note in
    // `surfaces.mjs` about the five panels that proved this necessary.
    if (e.how !== HOW.class) {
      try {
        if (e.how === HOW.chip) {
          await clickVisible(`the ${e.chip} chip`, `[data-chip="${e.chip}"]`);
          await page.waitForSelector(mounted ? root : `${root}.open`, { timeout: 10_000 });
        } else {
          await e.drive(driver);
        }
      } catch (err) {
        // A failure, never a skip: a surface nobody can summon is the finding,
        // and the timeout is how it says so.
        //
        // With the status line beside it, because the application usually knows
        // perfectly well why it declined and says so there — `onlyOneOpen`,
        // `hydraNothingHere`, `spellOff` are all one sentence that turns a
        // ten-second timeout into a diagnosis. Reading the timeout alone is how
        // an hour goes into a question the product had already answered.
        const said = await page
          .evaluate(() => document.getElementById("status")?.textContent ?? "")
          .catch(() => "");
        const left = await recover().catch(() => []);
        check(
          `${p.id} can be opened`,
          false,
          `${String(err.message).split("\n")[0]}` +
            `${said ? ` — the status line says "${said}"` : ""}` +
            `${left.length ? ` — and it left ${left.join(", ")} over the document` : ""}`,
        );
        continue;
      }
    } else {
      // No opener of its own. `open` is the whole mechanism the registry
      // provides, and adding it from here is exactly what `openPanel` does —
      // minus the hook, which is why the `×` is not asked about below.
      const there = await page.evaluate((sel) => {
        const n = document.querySelector(sel);
        if (!n) return false;
        n.classList.add("open");
        return true;
      }, root);
      if (!there) {
        check(`${p.id} is in the document`, false, `nothing matches ${root} — declared, never built`);
        continue;
      }
    }

    await withoutMotion(async () => {
      const seen = await visible(p.id, root);
      // And the way out, which is the half of this that has already shipped
      // broken: the settings drawer had an opener and no closer, and below 720px
      // the chip that opened it was underneath it. A `×` in the document and off
      // the screen is the same bug wearing a registry entry.
      if (seen && reallyOpen(e) && p.exits.some((x) => x.via === "head")) {
        await visible(`${p.id}'s way out`, `${root} .styles-close`);
      }
    });

    if (e.how === HOW.class) {
      await page.evaluate((sel) => document.querySelector(sel)?.classList.remove("open"), root);
    } else {
      await putAway(p.id, e, root, mounted);
    }
  }

  // The floor.
  //
  // Per G3: a check that cannot run must fail rather than report success. Every
  // loop above can `continue`, and a sweep whose registry came back empty — a
  // bundling change, a renamed export, a `PANELS` that arrived as `undefined` —
  // would run zero iterations, raise zero failures and print "the assembled
  // application works". So the count is asserted against the plan rather than
  // trusted, and against a number rather than against itself.
  const reachable = measurable(plan).length;
  check(
    "the sweep visited every reachable surface",
    swept === reachable,
    `visited ${swept} of ${reachable}`,
  );
  check("there were surfaces to visit", reachable > 0, `${plan.length} declared`);
  check(
    "the run looked at the screen at all",
    looked >= CORE.length + reachable,
    `${looked} nodes measured, ${CORE.length + reachable} is the floor`,
  );

  // ------------------------------------------- 9. the first hour, with nothing
  //
  // G5, relayed from Girsa: what a reader meets on a fresh install, before there
  // is anything. Every list-shaped surface in this application has a designed
  // empty state — `panelrows.ts` returns an `empty` key from all five builders
  // and `drawList` renders it — and **nothing had ever looked at one**. The eight
  // steps above fill the document with a heading, a list, a table, a footnote and
  // an endnote before the panes are ever opened, so the sweep in step 8 measures
  // them full. The state a reader actually starts in was the one state never
  // driven.
  //
  // A brand-new document reproduces it exactly for these four: no headings, no
  // notes, no marks, no snapshots. What it does not reproduce — an empty library,
  // an empty dictionary — is what step 0 already boots into, because the run gets
  // a fresh browser context every time and has no stored anything.
  step(9, "a document with nothing in it still says something");
  current = "empty";
  await pressInEditor("Control+Alt+n");
  await settled(await compiles()).catch(() => {});

  let saidSomething = 0;
  for (const id of LISTS) {
    // The chip comes from the same recipe step 8 opens it with, so there is one
    // statement of how each surface is reached rather than two that must agree.
    const entry = plan.find((e) => e.panel.id === id);
    if (!entry || entry.how !== HOW.chip) {
      check(`${id} can be opened for the empty check`, false, `no chip recipe for ${id}`);
      continue;
    }
    const chip = entry.chip;
    const root = `#${id}`;
    await clickVisible(`the ${chip} chip`, `[data-chip="${chip}"]`);
    try {
      await page.waitForSelector(`${root}.open ${EMPTY_ROW}`, { timeout: 10_000 });
    } catch {
      check(`${id} says what empty means`, false, `no ${EMPTY_ROW} in ${root} — a blank panel`);
      await press("Escape");
      continue;
    }
    saidSomething++;
    const text = (await page.locator(`${root}.open ${EMPTY_ROW}`).first().textContent()) ?? "";
    check(`${id} says what empty means`, text.trim().length > 0, JSON.stringify(text));
    // And says it in words. `t()` falls back to returning the key it was given,
    // so a dictionary that lost an entry puts `notesPaneEmpty` in front of the
    // reader — which looks like a string somebody forgot to write, because it is.
    check(
      `…and not by printing its own i18n key`,
      !/^[a-z][A-Za-z]+$/.test(text.trim()),
      text.trim(),
    );
    // It has to be *on the screen*, not merely in the document: an empty state
    // rendered inside a pane nobody can see is the same silence as no empty
    // state at all.
    await withoutMotion(() => visible(`${id}'s empty state`, `${root}.open ${EMPTY_ROW}`));
    // Through the declared exits, not by pressing the chip again. Two of these
    // four decline Escape on purpose — a persisted layout choice must not be
    // thrown away by a keystroke — and `outline-drawer` sits over the chip that
    // opened it, so a second press lands on the drawer. `putAway` already knows
    // all of that; a second closing routine here is how one of them comes to be
    // wrong.
    await putAway(id, entry, root, false);
  }
  check(
    "every list with nothing in it was asked",
    saidSomething === LISTS.length,
    `${saidSomething} of ${LISTS.length}`,
  );

  // ------------------------------------------------------------------------
  step(10, "version control says why it cannot run");

  // The state every reader is in on the day they install this: a document that
  // has never been saved to a file, in a browser that hands back handles rather
  // than paths. Version control cannot run, and there are **three** different
  // reasons it might not be able to — the drawer has to say which one, because
  // each has a different answer and only one of them is "install git".
  //
  // This is the one surface in the application whose ordinary state, for most
  // of the people who open it, is *unavailable*. Step 8 proves the drawer
  // appears; step 9 proves lists say what empty means. Neither would notice a
  // drawer that appears, holds nothing, and explains nothing — which is exactly
  // what it would look like if `standing()` collapsed its three answers into
  // one and the caller rendered an empty div for it.
  await clickVisible("the version-control chip", '[data-chip="git"]');
  await page.waitForSelector("#git-panel.open", { timeout: 10_000 });
  try {
    await page.waitForSelector("#git-panel.open .git-why", { timeout: 10_000 });
  } catch {
    check("version control says why it cannot run", false, "no .git-why in the drawer");
  }
  {
    const why = page.locator("#git-panel.open .git-why").first();
    const text = (await why.textContent().catch(() => "")) ?? "";
    check("version control says why it cannot run", text.trim().length > 0, JSON.stringify(text));
    // In words, like every other empty state: `t()` returns the key it was
    // given when the dictionary has no entry, so a missing string puts
    // `git.noFile` in front of a reader.
    // The emptiness is part of the condition, not a separate check above it.
    // Written as `!/^git\./.test(text)` alone, this **passed on an empty
    // string** — a check that cannot fail for the reason it is written under,
    // which is the shape this suite keeps finding in itself. The mutation run
    // that blanked the drawer is what showed it: four checks went red and this
    // one reported ok about nothing at all.
    check(
      "…and not by printing its own i18n key",
      text.trim().length > 0 && !/^git\.[A-Za-z]+$/.test(text.trim()),
      text.trim(),
    );
    // And the reason is *named*, not merely present. `data-git` carries which
    // of the states this is, so a drawer that always rendered the same sentence
    // — the failure this step exists for — is distinguishable from one that
    // read the situation.
    const named = await why.getAttribute("data-git").catch(() => null);
    check(
      "…and names which state it is in",
      typeof named === "string" && named.length > 0,
      String(named),
    );
    // On the server build with an unsaved document there is exactly one honest
    // answer, and it is not the one about git being missing.
    // `check` takes a **condition**, not an actual and an expected. Passing
    // `named` here — which the first draft did — asserts that the attribute is
    // truthy and nothing more, so it would have been satisfied by `no-git`,
    // `no-repo`, or any other state the drawer happened to be in. On the server
    // build with a document that has never been saved there is exactly one
    // honest answer, and this is it.
    check(
      "…which is that the document has nowhere to live yet",
      named === "unavailable",
      String(named),
    );
    await withoutMotion(() => visible("the reason is on the screen", "#git-panel.open .git-why"));
  }
  {
    const entry = plan.find((e) => e.panel.id === "git-panel");
    await putAway("git-panel", entry, "#git-panel", false);
  }

  // ------------------------------------------- 11. switching between documents

  step(11, "switching documents does not leave the last one's pages on screen");

  // The seam this step exists for cannot be reached from a unit test, because
  // the decision is `openDoc`'s and `main.ts` boots the application when it is
  // evaluated. `test/tabpages.test.mjs` holds the mechanism — what is kept, what
  // is evicted, what `idle` compiles — and nothing held the **wiring**.
  //
  // What it is: `openDoc` used to end at `scheduleCompile()`, and a compile is
  // 0.4–3 seconds away. For that whole time every preview pane went on showing
  // the document you had just left, under the incoming document's title and
  // beside its outline. A pane naming one sefer and drawing another.
  //
  // The 250 ms debounce is what makes this measurable rather than racy: no
  // compile of the incoming document can possibly have landed within a few
  // milliseconds of the click, so what the pane holds in that window is exactly
  // what the switch decided to put there and nothing else.
  {
    /**
     * The Documents menu, open — and idempotent, which is the whole of it.
     *
     * The button is a *toggle*, so calling this on an already-open menu closes
     * it and then waits ten seconds for rows that are in the document and
     * invisible. That is what the first run of this step did, and the log said
     * so precisely: "resolved to 8 elements", none of them visible.
     */
    async function openDocsMenu() {
      const row = page.locator('[data-menu="documents"] [data-doc]').first();
      if (await row.isVisible().catch(() => false)) return;
      await clickVisible("the Documents menu", '[data-menu="documents"] .menu-btn');
      await page.waitForSelector('[data-menu="documents"] [data-doc]', { timeout: 10_000 });
    }
    /** Whichever document row is marked as the one we are in. */
    async function currentDocId() {
      await openDocsMenu();
      return await page.evaluate(
        () =>
          document
            .querySelector('[data-menu="documents"] [data-doc].active')
            ?.getAttribute("data-doc") ?? null,
      );
    }
    /**
     * Switch, and read the pane in the window between the switch landing and
     * the fresh layout arriving.
     *
     * Timed off the status line, and it has to be. Reading straight after the
     * click reads *too early*: `openDoc` awaits storage, the file binding and
     * the baseline before it touches the preview, so the pane is still the one
     * we came from and every assertion below reports the previous document's
     * page count. The first run of this step failed twice for exactly that, and
     * both numbers were one switch stale.
     *
     * `scheduleCompile()` is the last line of `openDoc` and its debounce is
     * 250 ms, so `rendering` appearing on the status line brackets the window
     * from both sides: the switch has finished, and the layout that will
     * replace these pages has not landed. A compile is 0.4–3 s; a round trip to
     * read the count is a handful of milliseconds.
     */
    async function switchTo(id) {
      await openDocsMenu();
      const mark = await page.evaluate(() => /** @type {any} */ (window).__ksavStatus.length);
      // Taken before the click, and handed back, so a caller wanting to see the
      // switch's compile *finish* has a mark from before it started. Reading the
      // count after the wait below is too late — by then the layout may already
      // have landed, and `settled` would sit for thirty seconds waiting for a
      // second compile that nothing is going to ask for. It did exactly that.
      const before = await compiles();
      await clickVisible(`the row for ${id}`, `[data-menu="documents"] [data-doc="${id}"]`);
      await page.waitForFunction(
        (n) =>
          /** @type {any} */ (window).__ksavStatus.slice(n).some((e) => e.cls === ""),
        mark,
        { timeout: 15_000, polling: 20 },
      );
      const pages = await page.evaluate(
        () => document.querySelectorAll(".preview-host .page").length,
      );
      return { pages, before };
    }

    const idA = await currentDocId();
    check("the document we have been working in has an id", typeof idA === "string", String(idA));
    // Measured, not assumed. The first draft gave the second document a fixed
    // four pages, and the document built by steps 1–10 happened to lay out to
    // four as well — so the one comparison this step exists for was `4 !== 4`
    // and reported a failure about a mechanism that was working. A test whose
    // discriminator is a coincidence is not a test.
    const wasA = await page.evaluate(
      () => document.querySelectorAll(".preview-host .page").length,
    );

    // A second sefer, deliberately a different length from the first, so "whose
    // pages are these" is a question the page *count* can answer. `#מעבר_עמוד`
    // is the prelude's page break; `weak: true` means it needs text on both
    // sides, which is why there is a letter between each one.
    page.once("dialog", (d) => void d.accept("השני"));
    await act("a second document", async () => {
      await openDocsMenu();
      await clickVisible("New document", '[data-menu="documents"] [data-doc-action="new"]');
    });
    const idB = await currentDocId();
    check("the second document is a different one", typeof idB === "string" && idB !== idA, `${idA} / ${idB}`);

    const want = wasA + 3;
    const body = Array.from({ length: want }, (_, i) => String.fromCharCode(0x05d0 + i)).join(
      "\n#מעבר_עמוד\n",
    );
    const filled = await act(`filling the second document to ${want} pages`, () => type(body));
    check(
      "the second document is a different length from the first",
      (filled?.pages ?? 0) > wasA,
      `${filled?.pages} against ${wasA}`,
    );
    const pagesB = filled?.pages ?? 0;

    // The bug, stated: the second document is longer than the first by
    // construction, so the first document's pane showing the second's page count
    // is the outgoing layout standing under the incoming document's name.
    //
    // **This is the check that carries the step.** Verified by neutering
    // `showPagesFor` and running the whole thing: this one goes red and names
    // the numbers, and the "returning shows its own pages" check below stayed
    // green. So that one is worth having and is not evidence — said here rather
    // than left for somebody to assume the pair of them holds the mechanism up.
    const arrival = await switchTo(idA);
    check(
      "switching back does not leave the other document's pages on screen",
      arrival.pages !== pagesB,
      `${arrival.pages} pages, and the document we left had ${pagesB}`,
    );
    const backA = await settled(arrival.before);
    check("…and the document we switched to then draws its own", (backA?.pages ?? 0) >= 1, `${backA?.pages}`);
    const pagesA = backA?.pages ?? 0;

    // The other half, and the reason the pane is not simply blanked: a document
    // that has been seen before comes back **immediately**, with its own pages,
    // rather than with a blank rectangle for the length of a layout.
    const returning = await switchTo(idB);
    check(
      "returning to a document shows its own pages at once, with no wait",
      returning.pages === pagesB,
      `${returning.pages} pages, and it had ${pagesB} when we left it`,
    );
    check(
      "…which is not simply the pages of the document we came from",
      pagesA !== pagesB,
      `both documents laid out to ${pagesA} pages, so this step proves nothing`,
    );
    // Let the last switch's own compile finish, so the run does not end with one
    // in flight. `returning.before` is the mark from before that switch.
    await settled(returning.before);
  }

  step(12, "the errands that go to the library have a door");

  // Inventory item 73: the service that justifies a whole process boundary with
  // Girsa had no caller at all for a long stretch. It has three now, and until
  // this step none of them was reachable by anything a reader could see —
  // `refreshSources` was in the command palette, which answers *"get me there"*
  // and not *"what is there?"*, and the other two were a literal `e.key` test
  // on the window: no name, no entry, no way to find out they exist.
  //
  // What is checked is not that three buttons exist. It is that each one **does
  // something when pressed** — with no selection, the answer is *select a
  // phrase first*, which is a sentence only the wired-up action can produce.
  // A menu of three items that are decoration would pass "the item is on the
  // screen" and fail this.
  {
    await clickVisible("the Sources menu", '[data-menu="sources"] .menu-btn');
    const items = page.locator('[data-menu="sources"] .menu-item');
    const count = await items.count();
    check("all three errands are in it", count === 3, `${count} items in the menu`);
    const words = (await items.allTextContents()).join(" ");
    for (const each of ["citePhrase", "linkifyCitations", "refreshSources"]) {
      // `t()` hands back the key it was given when the dictionary has no entry,
      // so an unnamed row puts `sc.citePhrase` in front of a reader. This is
      // the same check `bindings.test.mjs` makes over the table, made again
      // where the words actually land.
      check(`${each} is named rather than keyed`, !words.includes("sc." + each), words);
    }
    const before = await said();
    await clickVisible("the first errand", '[data-menu="sources"] .menu-item');
    await page.waitForFunction(
      (was) => (document.getElementById("status")?.textContent ?? "") !== was,
      before,
      { timeout: 10_000, polling: 20 },
    ).catch(() => {});
    const answer = await said();
    check(
      "pressing one gets an answer rather than nothing",
      answer !== before && answer.trim().length > 0,
      `the status line stayed at "${before}"`,
    );
  }

  step(13, "a pane can be locked to one siman");

  // The half of narrowing a unit test cannot reach. `narrowing.test.mjs` holds
  // the span, the anchor's mapping and the refusal as arithmetic; what it cannot
  // see is whether the lines actually leave the screen and whether an edit that
  // reaches outside is actually stopped — and "hidden but still writable" is not
  // narrowing, it is a curtain over the part of the sefer you are not watching.
  //
  // The dangerous case is driven deliberately: select the whole document and
  // type. That is one keystroke away at any moment, it is the one gesture that
  // can put a 300-page sefer inside a pane restricted to four paragraphs, and a
  // fence that only tried typing *inside* the section would pass with the guard
  // deleted.
  {
    await pressInEditor("Control+End");
    await act("typing two simanim", () =>
      type("\n#כותרת[סימן ראשון]\nגוף הראשון.\n\n#כותרת[סימן שני]\nגוף השני.\n"),
    );
    const second = page.locator('.cm-line:has-text("גוף השני")');
    check("both simanim are on screen to begin with", (await second.count()) > 0, "the second one never arrived");

    await clickVisible("the first siman's body", '.cm-line:has-text("גוף הראשון")');
    await clickVisible("the narrow control", '[data-narrow="off"]');

    const chip = page.locator('[data-narrow="on"]');
    check("the pane says it is narrowed", (await chip.count()) === 1, "no pane reported a narrowing");
    check(
      "…and says which siman, in the siman's own words",
      (await chip.first().textContent())?.includes("סימן ראשון") ?? false,
      (await chip.first().textContent()) ?? "",
    );
    check("the other siman has left the screen", (await second.count()) === 0, "it was still rendered");

    // Select everything and type over it. Refused, and *said* to be refused:
    // an edit that silently does nothing is the same screen as an editor that
    // has crashed.
    const before = await said();
    await press("Control+a");
    await type("ק");
    await page
      .waitForFunction((was) => (document.getElementById("status")?.textContent ?? "") !== was, before, {
        timeout: 5_000,
        polling: 20,
      })
      .catch(() => {});
    check("typing over the whole document is refused out loud", (await said()) !== before, `still "${before}"`);

    await clickVisible("the widen control", '[data-narrow="on"]');
    check(
      "widening gives the rest of the sefer back",
      (await page.locator('.cm-line:has-text("גוף השני")').count()) > 0,
      "the second siman did not come back, so something ate it",
    );

    // And the sentence the whole feature is: *one pane restricted to a single
    // siman while another shows the whole sefer*. One pane is not a test of
    // that, and the bug it hides is not hypothetical — every pane hands its
    // edits to the primary, so a narrowed primary refused the **other** pane's
    // typing, which restricted every pane in the window to one section while
    // showing only one of them as narrowed.
    // Both directions are controls of their own, and both are named here on
    // purpose: the strip carried a single split button that only ever made one
    // of the two splits, and the complaint that ended it was *"I can't see how
    // to split it vertically, only horizontally"*. A run that clicks whichever
    // one it finds would have been green through that whole period, so it
    // checks that the other direction is on the strip before using this one.
    check(
      "both split directions are offered",
      (await page.locator('.source-pane [data-pane-act="split-across"]').count()) > 0,
      "only one direction is on the strip, which is the bug that split the button in two",
    );
    await clickVisible("the split control", '.source-pane [data-pane-act="split-down"]');
    const panes = await page.locator(".source-pane").count();
    check("there are two source panes now", panes === 2, `${panes} source panes`);
    // `type` above drives `.cm-content`, and from here there are two of them —
    // a locator that matches two elements is a Playwright error, not a coin
    // toss, which is the right behaviour and the reason this is a second helper
    // rather than a change to the first.
    const typeIn = (n, text) =>
      page.locator(".source-pane").nth(n).locator(".cm-content").pressSequentially(text, { delay: 4 });

    await clickVisible("the first pane's siman", '.source-pane >> nth=0 >> .cm-line:has-text("גוף הראשון")');
    await clickVisible("the first pane's narrow control", '.source-pane >> nth=0 >> [data-narrow="off"]');
    check(
      "one pane is narrowed",
      (await page.locator('[data-narrow="on"]').count()) === 1,
      `${await page.locator('[data-narrow="on"]').count()} panes reported a narrowing`,
    );
    check(
      "…and the other still holds the whole sefer",
      (await page.locator('.source-pane >> nth=1 >> .cm-line:has-text("גוף השני")').count()) > 0,
      "the second pane lost the section the first one is not showing",
    );

    // A split opens where you were standing, which is the only reason to split
    // a sefer you cannot see the whole of. A new pane starting at page 1 has
    // thrown away the place you split in order to keep.
    const tail = page.locator('.source-pane >> nth=1 >> .cm-line:has-text("גוף השני")');
    const box = await tail.first().boundingBox();
    const win = page.viewportSize();
    check(
      "the pane the split made opens where you were reading",
      !!box && !!win && box.y >= 0 && box.y + box.height <= win.height,
      box ? `the line is at y=${Math.round(box.y)} in a window ${win?.height} tall` : "the line never rendered",
    );

    await clickVisible("the second pane's last siman", '.source-pane >> nth=1 >> .cm-line:has-text("גוף השני")');
    await press("End");
    await typeIn(1, "ולד");
    // Two claims, and they were one assertion until the one assertion went red
    // for the *other* reason. "The edit landed" and "the edit landed the right
    // way round" are separate, and the second is the one that had been false
    // since panes were introduced: a mirrored pane's caret is mapped through
    // the insertion rather than placed after it, so every character a writer
    // typed in a second pane landed in front of the one before it.
    const line = (await page.locator('.source-pane >> nth=1 >> .cm-line:has-text("גוף השני")').first().textContent()) ?? "";
    check(
      "the un-narrowed pane can still type where the narrowed one cannot",
      line.length > "גוף השני.".length,
      `the line is still "${line}", so one pane's narrowing restricted another pane`,
    );
    check(
      "…and its letters arrive in the order they were typed",
      line.includes("השני.ולד"),
      `"${line}" — a mirrored pane's caret does not follow the text it inserts`,
    );
  }

  step(14, "switching documents takes every pane with it");

  // Step 11 already switches documents, and it passes, because it switches them
  // with one pane open. The whole finding lives in the arrangement: `openDoc`
  // re-stated the focused pane and `retargetPanes` relabelled *every* pane, so
  // the window showed two documents under one name.
  //
  // The reading half of that is bad. The writing half is worse: edits are
  // forwarded to the primary and mirrored back as changesets carrying the
  // primary's positions, so once the two documents were different lengths every
  // keystroke in the left-behind pane threw `Applying change set to a document
  // with the wrong length` — uncaught, once per character, nothing changing on
  // screen and nothing said. That is why the last check here is about the
  // console: a pane that has silently stopped being an editor looks exactly
  // like a pane whose writer has stopped typing.
  {
    await clickVisible("the widen control", '[data-narrow="on"]');

    const textIn = (n) => page.locator(`.source-pane >> nth=${n} >> .cm-content`).textContent();
    const typeIn = (n, text) =>
      page.locator(".source-pane").nth(n).locator(".cm-content").pressSequentially(text, { delay: 4 });

    // Non-vacuous first: both panes are on the sefer before anything switches,
    // so "neither pane holds it afterwards" is a claim about the switch rather
    // than about a marker that was never there.
    check("both panes are on the sefer to begin with",
      ((await textIn(0)) ?? "").includes("סימן") && ((await textIn(1)) ?? "").includes("סימן"),
      `pane 0: ${((await textIn(0)) ?? "").slice(0, 40)} | pane 1: ${((await textIn(1)) ?? "").slice(0, 40)}`,
    );

    const mark = since();
    await clickVisible("the Documents menu", '[data-menu="documents"] .menu-btn');
    await clickVisible("New document", '[data-menu="documents"] [data-doc-action="new"]');
    await page.waitForFunction(
      () => (document.querySelector(".source-pane .cm-content")?.textContent ?? "x").length < 5,
      undefined,
      { timeout: 10_000, polling: 50 },
    ).catch(() => {});

    const still = await page.locator(".source-pane").count();
    check("the arrangement survives the switch", still === 2, `${still} source panes`);
    const left = ((await textIn(0)) ?? "").includes("סימן");
    const right = ((await textIn(1)) ?? "").includes("סימן");
    check(
      "no pane is left holding the document you switched away from",
      !left && !right,
      `${left ? "pane 0" : "pane 1"} is still showing the sefer, under the new document's name`,
    );

    // And it is still an editor. A pane that shows the right document and
    // refuses to be typed into has moved the bug rather than fixed it.
    await clickVisible("the second pane", '.source-pane >> nth=1 >> .cm-content');
    await typeIn(1, "בדיקה");
    const typed = (await textIn(1)) ?? "";
    check("the pane beside the focused one can still be typed into", typed.includes("בדיקה"), `it holds "${typed}"`);
    check(
      "…and typing into it raises nothing on the console",
      newProblems(mark).length === 0,
      newProblems(mark).map((p) => p.what).join(" | "),
    );
  }

  step(15, "an editing mode holds every pane, not the one that had focus");

  // The same class as the step above, and the reason it is worth its own step is
  // that the failure is not a missing feature. A pane with no vim in it does not
  // decline to move the cursor — it **writes the commands into the sefer**. `i`
  // arrives as the letter `i` and `dd` as the letters `dd`, in a document the
  // writer believes they are navigating.
  //
  // Measured before it was fixed, by the discriminator used here: in vim, `i`
  // opens insert and is not written; without vim it is.
  {
    const typeIn = (n, text) =>
      page.locator(".source-pane").nth(n).locator(".cm-content").pressSequentially(text, { delay: 4 });
    const firstLine = (n) => page.locator(".source-pane").nth(n).locator(".cm-line").first().textContent();

    await clickVisible("the settings chip", '[data-chip="settings"]');
    await page.waitForSelector('[data-setting="editingMode"]', { timeout: 10_000 });
    await page.selectOption('[data-setting="editingMode"]', "vim");
    // Waited for, not slept through. The mode is fetched over the network, so
    // the only honest signal that it arrived is the one step 7c uses: with a
    // mode installed, every surface that prints a chord prints `M-x name`
    // instead, and the door into the keys drawer carries `sc-key-mode`. A fixed
    // delay here would pass on this machine and go red on a cold runner that
    // took a beat longer to fetch the package — a red job about vim that is
    // really about the network, which is how three pushes in a row got read as
    // infrastructure.
    await page
      .waitForSelector("#keys-open.sc-key-mode", { state: "attached", timeout: 20_000 })
      .catch(() => {});
    check(
      "vim mode arrives at all",
      (await page.locator("#keys-open.sc-key-mode").count()) > 0,
      "the keys door never started printing an M-x command, so no mode was installed",
    );
    await press("Escape");

    for (const pane of [0, 1]) {
      await clickVisible(`pane ${pane}`, `.source-pane >> nth=${pane} >> .cm-content`);
      await press("Control+Home");
      await press("Escape");
      await typeIn(pane, `iP${pane}`);
      await press("Escape");
      const line = (await firstLine(pane)) ?? "";
      check(
        `pane ${pane} is in vim: the i opened insert rather than being written`,
        line.startsWith(`P${pane}`),
        `the line begins "${line.slice(0, 12)}" — an i on the line means this pane has no mode in it`,
      );
    }

    // And out again, on the same condition rather than on a guess, so anything
    // added after this step starts from plain editing.
    await clickVisible("the settings chip", '[data-chip="settings"]');
    await page.selectOption('[data-setting="editingMode"]', "default");
    await page
      .waitForSelector("#keys-open.sc-key-mode", { state: "detached", timeout: 20_000 })
      .catch(() => {});
    await press("Escape");
  }

  // ------------------------------------- 16. the notes chooser asks one question

  // The panel opened onto somewhere past fifty controls, and every one of them
  // was about a decision the person opening it had usually already made. It then
  // asked two questions — *where* and *how* — and the second was a menu of
  // arrangements, which is the shape the note model was rebuilt to get rid of.
  //
  // There is one question now: **where the note goes.** The arrangement is not a
  // second axis a writer picks from, it is what the document does with the
  // destination, so there is nothing to ask. What is driven here is that one
  // question, the presets that are values of it rather than a list beside it,
  // the one destination that expands into a second question because it has to
  // (a region, which is the document's own and not a menu), and that pressing a
  // destination writes.
  //
  // Offline this is built out of a DOM stub. Here it is the real panel, in the
  // assembled application, with the real engine behind the card's preview.
  step(16, "the notes chooser asks one question at a time");
  {
    current = "notes-chooser";
    const mark = since();
    const count = (sel) => page.locator(sel).count();

    // A marker on its own line, so the assertion at the end of this step is
    // about the note *this* step wrote. Step 5 put a `#הערה[` in the document
    // twelve steps ago, and a check for one anywhere in the source would have
    // passed on a chooser that inserted nothing at all.
    await newLine();
    await type("בחירה");
    // Through the chip, which is the door a writer uses. It is not in the
    // command palette — `notesChooser` is a chip id, not an action id, which a
    // first draft of this step found out by searching the palette for it and
    // timing out.
    await act("opening the notes chooser", () =>
      clickVisible("the notes chip", '[data-chip="notesChooser"]'),
    );
    await page.waitForSelector("#notes-chooser.open", { timeout: 10_000 });

    // The one question, whole. The count is asserted rather than "more than
    // zero" because the failure this catches is a question that renders one
    // button — and six is `DESTINATIONS`, which is the axis itself.
    check(
      "the one question offers every place a note can go",
      (await count('[data-nq="destinations"] [data-dest]')) === 6,
      `${await count('[data-nq="destinations"] [data-dest]')} destinations`,
    );
    // The presets are *values* of that axis rather than a list beside it, so
    // pressing one has to leave the destination row showing where it landed.
    // A preset that could not be taken apart would be a cell wearing a
    // friendlier name, which is the thing this panel was rebuilt to stop being.
    check(
      "the presets are on the screen with it",
      (await count('[data-nq="presets"] [data-note-preset]')) > 0,
      "no presets offered",
    );

    // A region is the one destination that asks a second question, and it asks
    // it because the answer is the **document's** — regions are made and named
    // in the page-layout surface. A document with none has to say so: a panel
    // that offers an empty list is a panel that looks broken.
    await clickVisible("the region destination", '[data-dest="region"]');
    const regions = await count('[data-nq="regions"] [data-region]');
    const noRegions = await count('[data-nq="no-regions"]');
    check(
      "a region asks which region, or says there are none",
      regions > 0 || noRegions === 1,
      "the region destination showed neither a list nor a reason",
    );

    // And back to the everyday one, which is what gets written below.
    await clickVisible("the page-foot destination", '[data-dest="foot"]');
    check(
      "the destination chosen is the one shown",
      (await count('[data-note-card="foot"]')) === 1,
      "the card shown is not the page-foot one",
    );

    // And it writes. A chooser that asks beautifully and inserts nothing is the
    // failure this panel had in its first version.
    await act("using the destination", () =>
      clickVisible("its use button", '[data-note-use="foot"]'),
    );
    await page
      .waitForSelector("#notes-chooser.open", { state: "detached", timeout: 5_000 })
      .catch(() => {});
    // Read off `.cm-line` elements rather than `.cm-content.textContent`, and
    // only the line the marker is on: CodeMirror renders the viewport, not the
    // document, so "is it in the source" is a question this cannot ask and the
    // marker is what makes it unnecessary.
    const marked = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".cm-line"))
        .map((l) => l.textContent)
        .find((l) => l.includes("בחירה")) ?? "",
    );
    check(
      "choosing a destination writes it into the document",
      marked.includes("#הערה["),
      marked ? `the line reads "${marked}"` : "the marked line is not on screen at all",
    );
    check(
      "…and none of it raised anything on the console",
      newProblems(mark).length === 0,
      newProblems(mark).join(" | "),
    );
    await press("Escape");
  }

  step(17, "a preview shows the pages of the siman beside it");

  // The other half of narrowing, and the half that cannot be checked anywhere
  // but here. `preview.test.mjs` holds the decision — which pages a stretch of
  // lines printed on — as arithmetic over a table somebody wrote down. What it
  // cannot see is whether the engine's answer about a real layout agrees with
  // it: whether `want_lines` was actually asked for, whether the runs came back
  // in the writer's own line numbers rather than the compiled body's, and
  // whether the pages a reader can see are the ones the siman is on.
  //
  // The preamble offset is the specific thing a unit test cannot catch. The
  // pane counts in the writer's lines and the engine answers in the body it was
  // sent, and the difference is the custom-command preamble — nothing on either
  // side of that subtraction is visible to a test that supplies both halves.
  {
    const mark = since();
    // The preview follows the first source pane: `panes.sibling` takes the first
    // leaf of the other subtree, and step 13 left two source panes in one split
    // beside the preview.
    const onScreen = () => page.locator(".preview-host .page:not([hidden])").count();
    const allPages = () => page.locator(".preview-host .page").count();
    const strip = page.locator("[data-preview-window]").first();
    const askedForLines = () =>
      page.evaluate(() => /** @type {any} */ (window).__ksavAskedForLines);
    const askedBefore = await askedForLines();

    await pressInEditor("Control+End");
    // Two simanim with a page break between them, so "the pages of this siman"
    // is a question the page *count* can answer. A document whose simanim share
    // a page would pass a narrowed preview that did nothing at all.
    await act("a siman of its own on a page", () =>
      type("\n\n#כותרת[סימן התצוגה]\nגוף אחד.\n\n#מעבר_עמוד\n\n#כותרת[סימן אחרון]\nגוף שני.\n"),
    );

    const total = await allPages();
    check("the sefer runs to more than one page", total > 1, `${total} pages`);
    check(
      "every page is on screen before anything is narrowed",
      (await onScreen()) === total,
      `${await onScreen()} of ${total} pages visible with nothing narrowed`,
    );
    check(
      "…and the preview's strip says nothing about a siman",
      ((await strip.textContent()) ?? "") === "",
      `the strip already reads "${await strip.textContent()}"`,
    );

    await clickVisible("the siman's body", '.source-pane >> nth=0 >> .cm-line:has-text("גוף אחד")');
    await clickVisible("the narrow control", '.source-pane >> nth=0 >> [data-narrow="off"]');

    // Waited on the promise the feature makes, not on "a compile finished".
    //
    // `act` was the first spelling and it is the wrong instrument here.
    // Narrowing a preview asks the engine a question the compile on screen was
    // never asked, so the answer arrives one *round trip* later — and `act`
    // returns at the first compile to finish after the click, which can be one
    // that was already in flight and knew nothing about any of this. It passed
    // and it measured the wrong moment: the run reported the preview blank while
    // the compile that would have filled it had not been sent.
    const narrowedOk = await page
      .waitForFunction(
        (n) => {
          const boxes = Array.from(document.querySelectorAll(".preview-host .page"));
          const on = boxes.filter((b) => !(/** @type {HTMLElement} */ (b).hidden)).length;
          return boxes.length === n && on > 0 && on < n;
        },
        total,
        { timeout: 30_000, polling: 50 },
      )
      .then(() => true)
      .catch(() => false);

    const shown = await onScreen();
    check(
      "the preview drops the pages the siman is not on",
      narrowedOk,
      `${shown} of ${total} pages visible after 30s, so the preview ${
        shown === total ? "never narrowed" : "went blank"
      }`,
    );
    // The request, not just the picture. A preview that stopped asking would go
    // on looking right for as long as the last answer happened to fit the pages
    // in front of it — which is a narrowing drawn from a document you have since
    // left, and it is what the first version of this actually did.
    check(
      "…and it asked the engine which lines printed where",
      (await askedForLines()) > askedBefore,
      "no compile carried want_lines, so the pages on screen were chosen from a stale answer",
    );
    check(
      "…and every page is still there to be numbered",
      (await allPages()) === total,
      `${await allPages()} page boxes, of ${total} — a dropped page renumbers every click after it`,
    );
    const saidWindow = (await strip.textContent()) ?? "";
    check(
      "the preview says which siman it is holding",
      saidWindow.includes("סימן התצוגה"),
      saidWindow ? `the strip reads "${saidWindow}"` : "the strip is empty, so nothing says why the pages went",
    );
    check(
      "…and how many pages that came to",
      (await strip.getAttribute("data-pages")) === String(shown),
      `the strip counts ${await strip.getAttribute("data-pages")} and ${shown} pages are drawn`,
    );

    // Which pages, not how many — and the only honest way to ask it from out
    // here is to narrow to a *different* siman and watch the answer move. A
    // rendered page carries no readable text: Typst draws glyphs as `<use>`
    // references to outlines, so `textContent` is empty for every page of every
    // document, and the first version of this check asked it anyway and failed
    // while the feature worked.
    const onPages = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll(".preview-host .page"))
          .map((p, i) => (/** @type {HTMLElement} */ (p).hidden ? -1 : Number(p.dataset.page ?? i)))
          .filter((i) => i >= 0),
      );
    const first = await onPages();

    await clickVisible("the widen control", '.source-pane >> nth=0 >> [data-narrow="on"]');
    await clickVisible("the last siman's body", '.source-pane >> nth=0 >> .cm-line:has-text("גוף שני")');
    await clickVisible("the narrow control again", '.source-pane >> nth=0 >> [data-narrow="off"]');
    const moved = await page
      .waitForFunction(
        (was) => {
          const boxes = Array.from(document.querySelectorAll(".preview-host .page"));
          const on = boxes
            .map((p, i) => (/** @type {HTMLElement} */ (p).hidden ? -1 : i))
            .filter((i) => i >= 0);
          return on.length > 0 && on.join() !== was;
        },
        first.join(),
        { timeout: 30_000, polling: 50 },
      )
      .then(() => true)
      .catch(() => false);
    const second = await onPages();
    check(
      "a different siman is a different page",
      moved && second.length > 0 && !second.every((p) => first.includes(p)),
      `both simanim resolved to pages [${first}] and [${second}] — the choice does not follow the siman`,
    );
    check(
      "…and the second one is further into the sefer",
      Math.max(...second) > Math.max(...first),
      `[${first}] then [${second}], with the page break between the two simanim`,
    );

    await clickVisible("the widen control", '.source-pane >> nth=0 >> [data-narrow="on"]');
    check(
      "widening gives the whole sefer back to the preview",
      (await onScreen()) === total,
      `${await onScreen()} of ${total} pages came back`,
    );
    check(
      "…and the strip stops naming a siman",
      ((await strip.textContent()) ?? "") === "",
      `the strip still reads "${await strip.textContent()}"`,
    );
    check(
      "…and none of it raised anything on the console",
      newProblems(mark).length === 0,
      newProblems(mark).join(" | "),
    );
  }

  // ----------------------------------------------------------------- the tally

  if (failures.length && (HEADED || KEEP)) {
    console.log("\n--keep: the browser is still open. Ctrl+C when you are done looking.");
    await new Promise(() => {});
  }
}

async function shutdown() {
  await browser?.close().catch(() => {});
  if (server && !server.killed) server.kill();
}

let code = 0;
try {
  await main();
} catch (e) {
  console.error(`\nthe run itself broke: ${e?.stack ?? e}`);
  code = 1;
} finally {
  await shutdown();
}

// Two exits that are not the same thing, and the tally has to say which.
//
// A run that breaks halfway — a menu left open over the editor, a selector that
// stopped resolving — used to end with `0 failed:` and an empty list under a
// count of however far it got. The tail of a red job therefore read as a clean
// run that exited non-zero for no reason, which is exactly how three
// consecutive pushes went out red: the redness looked like infrastructure. The
// stack trace was there, four hundred lines up, in a log nobody reads upward.
//
// `checks` is a count of how far the run got and never a count of the suite, so
// it is only reported as a total when the run reached the end.
if (code) console.error(`\nthe run stopped after ${checks} checks; the rest never ran`);
else console.log(`\n${checks} checks`);
if (failures.length) console.error(`${failures.length} failed:\n  ${failures.join("\n  ")}`);
if (failures.length || code) process.exit(1);
console.log("the assembled application works");
