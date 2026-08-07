// Does the assembled application work?
//
// Every other check in this repository reads. 3,755 editor assertions, 416
// engine tests, a 1,231-document parse oracle, an insertion grid that compiles
// every legal UI insertion — all of them excellent, all of them *about* parts.
// Nothing had ever booted the product and used it.
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
//   - `#status` — the compile verdict. `ok`, `warn`, `err`, one per compile,
//     with the page count and the milliseconds in it.
//   - `#diagnostics` — the compiler's own words when something is wrong.
//   - `#preview .page` — that pages exist, and how many. Not what is on them.
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
// with `engine/web/index.html` — a separate, much smaller editor that has its
// own toolbar and none of this. It returns 200 and looks like an editor, so a
// run against it would fail eleven checks with eleven confusing messages instead
// of one clear one. The SPA's `index.html` links a web manifest and the fallback
// does not, which is the cheapest thing that tells them apart.
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
        pages: document.querySelectorAll("#preview .page").length,
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

  // ------------------------------------------------------------- 0. it boots

  step(0, "the application boots");
  current = "boot";
  await page.waitForSelector("#app .toolbar", { timeout: 30_000 });
  const boot = await settled(0);
  check("the first document compiles", boot.cls !== "err", `${boot.text} — ${boot.diagnostics}`);
  check("a page is rendered", boot.pages > 0, `${boot.pages} pages`);
  check(
    "it is talking to the server engine",
    (await page.locator("#engine-badge").textContent())?.includes("server"),
    await page.locator("#engine-badge").textContent(),
  );
  check("nothing failed on the way up", problems.length === 0, problems.map((p) => p.what).join(" | "));

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
    page.click('#welcome [data-template="sefer"]'),
  );
  check("the welcome overlay is gone", (await page.locator("#welcome").count()) === 0);
  check("the sefer template is more than one page", (tpl?.pages ?? 0) >= 1, `${tpl?.pages}`);

  // ----------------------------------------------------------- 2. a heading

  step(2, "a heading");
  current = "heading";
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await type("פרק ראשון");
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
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await act("clicking • in the ribbon", () => page.click('.toolbar [data-command="רשימה"]'));
  await act("typing in the first bullet", () => type("סעיף אלף"));

  // ----------------------------------------------------------- 4. a table row

  step(4, "a table, and then a row in it");
  current = "table";
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await act("clicking ▦ in the ribbon", () => page.click('.toolbar [data-command="טבלה"]'));
  await act("typing in a cell", () => type("עמודה"));
  // Through the palette, which is where a structural operation lives: it is
  // offered only when the caret is actually inside a table, so finding it here
  // is itself the check that the caret landed in the table the ribbon inserted.
  await page.keyboard.press("Control+k"); // `palette: "Mod-k"`, from bindings.ts
  await page.fill("#palette-input", "table.rowBelow");
  await page.waitForSelector('#palette-list [data-action="table.rowBelow"]', { timeout: 5_000 });
  await act("adding a row below", () => page.click('#palette-list [data-action="table.rowBelow"]'));

  // ------------------------------------------------------------ 5. a footnote

  step(5, "a footnote");
  current = "footnote";
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await type("ועיין ברש\"י");
  await act("clicking † in the ribbon", () => page.click('.toolbar [data-action="footnote"]'));
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
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await act("clicking ⁋ in the ribbon", () => page.click('.toolbar [data-action="endnote"]'));
  await act("typing the endnote", () => type("מקור הדברים"));

  // ---------------------------------------------------------- 7. export a PDF

  step(7, "export a PDF");
  current = "export";
  const mark = since();
  await page.click('[data-menu="export"] .menu-btn');
  await page.waitForSelector('[data-export="exportPdf"]', { timeout: 5_000 });
  const wait = page.waitForEvent("download", { timeout: 60_000 });
  await page.click('[data-export="exportPdf"]');
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
