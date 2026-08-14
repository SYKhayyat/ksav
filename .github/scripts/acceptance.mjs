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
import { CORE, HOW, measurable, planFor, reallyOpen } from "../../ksav/app/tools/surfaces.mjs";

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
function check(name, condition, detail = "") {
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
    console.log(`booting ${path.relative(ROOT, bin)} on ${url}`);
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
  browser = await chromium.launch({
    channel: "chrome",
    headless: !HEADED,
    slowMo: SLOW,
  }).catch((e) => {
    console.error(
      `could not launch Chrome: ${e.message}\n` +
        "  this drives the Chrome that is already installed rather than downloading one.",
    );
    process.exit(1);
  });

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

  /** Type into the editor, wherever the caret already is. */
  const type = (text) => page.locator(".cm-content").pressSequentially(text, { delay: 4 });

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
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
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
    press: (key) => page.keyboard.press(key),
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
    escape: () => page.keyboard.press("Escape"),
  };

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
    const press = async (what, sel, opts) => {
      tried.push(what);
      await page.click(sel, { timeout: 5_000, ...opts }).catch((e) => {
        tried[tried.length - 1] = `${what} (${String(e.message).split("\n")[0]})`;
      });
    };

    if (p.escape) {
      tried.push("Escape");
      await page.keyboard.press("Escape");
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
      await press("the ×", `${root} .styles-close`);
    }
    if (p.exits.some((x) => x.via === "scrim") && (await still())) {
      // At the very corner, which is scrim and never the box inside it —
      // `overlayPanel` dismisses on `target.id === id` exactly.
      await press("the backdrop", root, { position: { x: 2, y: 2 } });
    }
    if (entry.how === HOW.chip && (await still())) {
      await press("the chip again", `[data-chip="${entry.chip}"]`, { force: true });
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
    await page.keyboard.press("Escape");
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
  await page.keyboard.press("Control+k"); // `palette: "Mod-k"`, from bindings.ts
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

console.log(`\n${checks} checks`);
if (failures.length || code) {
  console.error(`${failures.length} failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("the assembled application works");
