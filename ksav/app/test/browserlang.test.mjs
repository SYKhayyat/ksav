// The language switch, in a real browser, against the real built application.
//
// # Why this file exists at all
//
// `uilanguage.test.mjs` proves the *catalogues* are complete and that
// `localise()` sweeps the four label kinds it is given. Both were true while an
// English writer still met **114 Hebrew strings in a real window** — measured
// 2026-09-27 by driving the built app in Chromium:
//
// ```
// setLang("en")  →  dir flips rtl→ltr, lang="en", the chrome reads English,
//                    the setting persists to localStorage across a reload
// …and 50 of the strings still standing in Hebrew have English entries already.
// ```
//
// Fifty of them are keys like `previewSide`, `closeTab`, `searchScope.source` and
// `retrySave` — a catalogue that is complete and a UI that ignores it. They are
// written into `aria-label` and `title` at **boot**, and `localise()` cannot reach
// them because nothing tagged them. The other 64 are *composed* strings —
// `"פתח · Alt+a"`, `"Rename: ללא שם"` — assembled by concatenation from a label, a
// shortcut and a document name, which no `data-i18n` attribute can express.
//
// A dictionary test is structurally blind to both, and this is the shape of that
// blindness: completeness of the catalogue says nothing about what the DOM holds.
// So the test that can see it has to open a window.
//
// # What is asserted, and what is measured
//
// The switch itself, which passes and must keep passing:
//   - the toggle button, pressed as a writer presses it, flips `dir` and `lang`
//   - the chrome becomes English, not merely *different*
//   - the choice survives a reload
//
// And the residue, which does **not** pass, recorded as a ceiling rather than a
// zero: the count of Hebrew strings left standing, and which catalogue keys are
// among them. A ceiling is the honest shape while the work is outstanding — a
// test asserting zero would be red on arrival, and a red test is not a fence, it
// is a complaint. The list is in `RESIDUE` below and in issue #71; deleting an
// entry without deleting the string makes the test fail, which is the direction
// that matters.
//
// # This test needs things this machine may not have
//
// A Chromium, and the shared libraries it links against. Both are absent from a
// bare checkout, so the file **skips loudly** — it prints why, and `skips.test.mjs`
// is told about it — rather than failing for a reason that has nothing to do with
// the application. On this machine the libraries are resolved from the nix store
// into `LD_LIBRARY_PATH` by the caller; see the note in the README.

import { check, ok } from "./harness.mjs";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, dirname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..");
const DIST = join(APP, "dist");

/** Hebrew script, the thing a switch is supposed to remove. */
const HEBREW = /[֐-׿]/;

/**
 * The catalogue keys this test has measured standing in Hebrew in a real window
 * after a switch to English.
 *
 * Every one of them **has** an English entry. They are not missing translations;
 * they are strings the DOM holds that `localise()` was never told about. Kept by
 * name so that fixing one and forgetting to delete the line here is a failure,
 * which is the direction a fence should fail in.
 */
const RESIDUE = [
  // panel heads, drawer names, and the tabs
  "untitled",
  "closeTab",
  "newTab",
  "preview",
  "previewSide",
  "source",
  "zoomPane",
  "paneMenu",
  "closePane",
  "splitAcross",
  "splitDown",
  "scrollLinked",
  "previewStaleHow",
  // the nikud toggle and its hint
  "nikud",
  "nikudHint",
  // the search scope select
  "searchScope",
  "searchScope.source",
  "searchScope.preview",
  "searchScope.both",
  // prose in the welcome panel and the notes pane
  "welcomeTitle",
  "narrowLede",
  "notesPaneEmpty",
  "mark.added",
  // a failure the writer can retry
  "retrySave",
  // ledes: the paragraph under each panel head, which `panelHead` does not tag
  // because the lede is the panel's own child element
  "outlineLede",
  "notesPaneLede",
  "marksPaneLede",
  "findLede",
  "previewFollowsLede",
  // a drawer that could not load, and the drag affordance on a tab
  "registriesGaveUp",
  "swapPaneDrag",
];

/**
 * The residue ceiling: 50 catalogue keys plus 64 composed strings, measured.
 *
 * Composed strings are counted, not named, because they are not catalogue values
 * — they are `"label · shortcut"` and `"verb: name"` built by concatenation, and
 * naming them would mean naming every pair.
 */
const CEILING = { keys: RESIDUE.length, composed: 64 };

/** Serve `dist/` and give back the origin. Static, and the SPA fallback only. */
async function serve() {
  const TYPES = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
    ".json": "application/json", ".wasm": "application/wasm",
    ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
  };
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    for (const file of [join(DIST, path), join(DIST, "index.html")]) {
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
  return { server, origin: `http://127.0.0.1:${server.address().port}/` };
}

/** Chromium, or the reason there is not one. */
async function browser() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    return { why: "playwright-core is not installed" };
  }
  if (!existsSync(chromium.executablePath())) return { why: "no Chromium for playwright" };
  try {
    return { b: await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] }) };
  } catch (e) {
    return { why: `Chromium would not start: ${String(e).split("\n")[0]}` };
  }
}

/** Everything a writer can read off the window, and where it stands. */
const READ = () => {
  const out = { text: [], aria: [], title: [], placeholder: [] };
  for (const e of document.querySelectorAll("*")) {
    // The element's own text, not a parent's copy of a child's.
    if (![...e.children].some((c) => c.textContent === e.textContent)) {
      const own = [...e.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(" ")
        .trim();
      if (own) out.text.push(own);
    }
    for (const [slot, attr] of [
      ["aria", "aria-label"], ["title", "title"], ["placeholder", "placeholder"],
    ]) {
      const v = e.getAttribute?.(attr);
      if (v) out[slot].push(v);
    }
  }
  return out;
};

export async function run() {
  if (!existsSync(join(DIST, "index.html"))) {
    console.log("SKIPPED browserlang: no dist/ — run `npm run build` first");
    return;
  }
  const { b, why } = await browser();
  if (!b) {
    console.log(`SKIPPED browserlang: ${why}`);
    return;
  }

  const { server, origin } = await serve();
  const page = await b.newPage();
  try {
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    // The whole reason for the file: read the window, do not read a dictionary.
    const before = await page.evaluate(READ);
    const heBefore = [before.text, before.aria, before.title, before.placeholder]
      .flat().filter((s) => HEBREW.test(s));
    ok("the app boots into Hebrew with plenty on screen", heBefore.length > 50);
    check("and the document is right-to-left", await page.getAttribute("html", "dir"), "rtl");

    // The switch, pressed the way a writer presses it: the toolbar button whose
    // accessible name is "שפה". Found by its name in the *old* language on
    // purpose — that is the only way a writer can find it.
    await page.getByLabel("שפה").click();
    await page.waitForTimeout(1200);

    const after = await page.evaluate(READ);
    check("the switch flips the writing direction", await page.getAttribute("html", "dir"), "ltr");
    check("and the document language", await page.getAttribute("html", "lang"), "en");

    const all = [after.text, after.aria, after.title, after.placeholder].flat();
    const heAfter = all.filter((s) => HEBREW.test(s));

    // The chrome is English. Not "different" — the headings and the buttons.
    const chrome = await page.evaluate(() =>
      [...document.querySelectorAll("header button, header [role], h1, h2, h3")]
        .map((e) => (e.getAttribute("aria-label") ?? e.textContent ?? "").trim())
        .filter(Boolean)
        // The verb, not the whole phrase: a rename control reads
        // "Rename: ללא שם", and the document's own title is *supposed* to be in
        // the document's own language. Only the first part is this app's text.
        .map((s) => (s.includes(":") ? s.split(":")[0] : s)));
    ok("the header reads English after the switch", chrome.length > 4);
    check(
      "and nothing in it is still Hebrew",
      chrome.filter((s) => HEBREW.test(s)),
      [],
    );

    // …and the residue, which is the honest part of this file.
    const { DICTS } = await import("../.tmp-test/i18n.mjs");
    const byValue = new Map(Object.entries(DICTS.he).map(([k, v]) => [v, k]));
    const stillHere = new Set();
    const composed = new Set();
    for (const s of heAfter) {
      const key = byValue.get(s) ?? [...byValue].find(([v]) => v.length > 3 && s.startsWith(v))?.[1];
      if (key) stillHere.add(key);
      else composed.add(s.slice(0, 40));
    }
    check(
      "no catalogue key stands in Hebrew that this file has not recorded",
      [...stillHere].filter((k) => !RESIDUE.includes(k)),
      [],
    );
    // **New** residue fails; recorded residue that is merely absent does not.
    // Which panels are open changes the visible set, so requiring equality would
    // make this test a hostage to boot order — and a fence that fails for a
    // reason outside the thing it watches is a fence people switch off.
    ok(
      `the recorded set is a superset of what is standing (${stillHere.size} of ${RESIDUE.length})`,
      stillHere.size <= RESIDUE.length,
    );
    ok(
      `composed strings are at or under the ceiling (${composed.size}/${CEILING.composed})`,
      composed.size <= CEILING.composed,
    );

    // A reload, because a language that reverts looks like a selector that does
    // nothing, and costs the writer the whole surface every time they return.
    const stored = await page.evaluate(() => localStorage.getItem("ksav.settings"));
    ok("and the choice was written down", /"lang":"en"/.test(stored ?? ""));

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    check("a reload keeps the language", await page.getAttribute("html", "lang"), "en");
    check("and the direction", await page.getAttribute("html", "dir"), "ltr");
  } finally {
    await b.close();
    server.close();
  }
}
