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
//
// # …and it must not measure a build that is not the code
//
// `dist/` is git-ignored, it is **not** built by `gate.mjs` (the CI app job runs
// `node tools/gate.mjs editor` and *then* `npx vite build`, so in CI this file
// always skips), and nothing anywhere checked that the copy on disk matched the
// sources beside it. So the one test in this repository that opens a real window
// could be served a build from any point in the past, and would report on it in
// the present tense.
//
// **It did, and it cost a finding.** #81 landed the fix — `showChromeNotice`
// passes the *key*, the banner carries `data-i18n`, `localise()` re-renders it —
// and the fence here stayed red, over `registriesGaveUp` and `retrySave`, on
// identical code. The recorded conclusion was *"the sweep does not reach the
// notice host"*, which is a false claim about the product, written into
// `PLAN.md` and `SESSION_LOG.md` as an open half. It was not a boot-order race
// either, which is what the same entries concluded next: it was a `dist/` built
// on 28 September being asked about a fix committed on the 29th.
//
// The sweep reaches the notice host. Measured: the banner carries
// `data-i18n="registriesGaveUp"` and `data-i18n="retrySave"`, the host is inside
// `document.body`, and after a switch the same two elements read
// *"The command list did not load — the toolbar and menus will stay empty.
// Reload the page."* and *"Try again"*. Removing the two attributes puts this
// fence red on `registriesGaveUp` and `retrySave`, four runs out of four.
//
// So the guard below is not a nicety about a build directory. It is the reason a
// correct fix was recorded as an incorrect one, and it is the same class the
// acceptance script already fences one layer over with `assertFresh` — see
// `visibility.test.mjs`, which holds both.

import { check, ok } from "./harness.mjs";
import { markPattern } from "../.tmp-test/engine.gen.mjs";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DIST, assertFreshBuild, baseOf, browser, engineInBundle, serve } from "./pageserve.mjs";

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
  // **A document's own name**, and the only catalogue key left. `untitled` is
  // what a document is *called*, and it reaches the tab, the title bar and
  // `<title>`. A document created while the interface was Hebrew is called
  // `ללא שם`, and in English it reads `Untitled` — a document named in the
  // language it was created in, which is right, and which no `data-i18n` should
  // touch. Tagging it would **rename a writer's file on a language switch**,
  // which is a considerably worse bug than a Hebrew string.
  "untitled",
  // **An error path, and it is here because the registries do not load in a
  // headless run.** Which is exactly the state it exists for: a writer with no
  // registry gets a sentence saying so, and in an English interface that
  // sentence was Hebrew. The issue lists status and error paths among the
  // surfaces a switch has to reach, and this is the first one that turned out
  // not to be tagged. Recorded rather than fixed here, because the honest fix
  // belongs with the registries rather than with a language fence.
  "registriesFailed",
];

/**
 * The residue ceiling: **2** catalogue keys and **7** composed strings, from 50
 * and 64 when this file was written.
 *
 * **All six are Hebrew that should be there**, and the ceiling is only here to
 * say so out loud and to fail if the number goes *up*:
 *
 *   - `#let דגש(x) = …` and `בסד = בס"ד` — a Hebrew document's own source, in the
 *     placeholders that offer a first document. A Hebrew starter is the point.
 *   - "Off by default: in Hebrew the geresh and gershayim", "Hebrew numbering
 *     (א,ב,ג)", "Keep a one-letter word off the end of a line (ו, ב" — English
 *     sentences *about* Hebrew, correct in English and wrong translated.
 *   - `Rename: ללא שם` — the verb is already English; the name is the document's
 *     own, and a document is named in its own language.
 *
 * The seventh — a status line carrying **both** languages on purpose, because
 * `troubleSaid` emits `"he · en"` so a writer sees theirs whichever it is — is
 * written down rather than fixed. In an English interface it reads Hebrew-first,
 * and that is a decision to argue about, not a translation to make.
 */const CEILING = { keys: RESIDUE.length, composed: 7 };

/**
 * Everything a writer can read off the window, and where it stands.
 *
 * Two classes of string are dropped **here**, in the page, because whether a
 * string is the document's own text is a question about where it sits and not
 * about what it says — and once the strings are in a flat array the element is
 * gone:
 *
 *   - **the document's own text.** A Hebrew sefer read in an English interface is
 *     still a Hebrew sefer, and the outline lists that document's headings. A
 *     writer types Hebrew into an English interface on purpose; the application is
 *     not going to translate them.
 *   - **a Hebrew specimen.** The niqqud bar shows `א` with each mark on it, because
 *     a learner needs to see the mark. A font specimen in its own script is not a
 *     string this application failed to translate.
 *
 * The specimen test is deliberately narrow: a single base letter plus marks,
 * nothing else. `אְ` is a specimen; `הערה` is a sentence somebody has to read.
 */
const READ = (markSource) => {
  const HEB = /[\u0590-\u05FF]/;
  // **A specimen is one to three Hebrew letters with nothing else, or with marks
  // on them.** The marks come from `markPattern()`, which builds the class from
  // the generated authority with a negated lookahead — and the reason is written
  // down in `prohibitions.test.mjs`, which forbids hand-writing the mark block
  // and which I tripped over by writing it: `U+0591–U+05C7` is not "the marks",
  // because four characters in it are punctuation that separates words. A
  // hand-written range in this product had that wrong three separate times.
  //
  // The letter range is fine to write, because the prohibition is about the marks
  // and the letters are a contiguous, obvious block.
  // Rebuilt **here** from the pattern's source, because this function is
  // serialised into the page and cannot see an import. The `u` flag matters: the
  // generated range is a codepoint range, and without it a surrogate pair would
  // be two units and the class would be wrong.
  const isSpecimen = (s) =>
    new RegExp(`^[\u05D0-\u05EA]{1,3}(?:${markSource})*$`, "u").test(
      s.replace(/\s+/g, ""),
    );
  const inDocument = (e) =>
    !!e.closest?.(".cm-content") || !!e.closest?.(".outline-list");
  const out = { text: [], aria: [], title: [], placeholder: [] };
  for (const e of document.querySelectorAll("*")) {
    if (inDocument(e)) continue;
    // The element's own text, not a parent's copy of a child's.
    if (![...e.children].some((c) => c.textContent === e.textContent)) {
      const own = [...e.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(" ")
        .trim();
      if (own && HEB.test(own) && !isSpecimen(own)) out.text.push(own);
    }
    for (const [slot, attr] of [
      ["aria", "aria-label"], ["title", "title"], ["placeholder", "placeholder"],
    ]) {
      const v = e.getAttribute?.(attr);
      if (v && HEB.test(v) && !isSpecimen(v)) out[slot].push(v);
    }
  }
  return out;
};

export async function run() {
  if (!existsSync(join(DIST, "index.html"))) {
    console.log("SKIPPED browserlang: no dist/ — run `npm run build` first");
    return;
  }
  // Before the browser, and before anything is measured. The skip above is this
  // machine's problem; a stale `dist/` is a false reading, and the two must not
  // be the same kind of silence.
  if (!assertFreshBuild()) return;
  const { b, why } = await browser();
  if (!b) {
    console.log(`SKIPPED browserlang: ${why}`);
    return;
  }

  // What the bundle asks for, asserted before it is measured. A base this file
  // cannot serve produces a page that boots into nothing, and the failures that
  // follow name the language rather than the path.
  const { base, offenders } = baseOf(await readFile(join(DIST, "index.html"), "utf8"));
  check("browserlang: every asset URL in the built HTML shares one prefix", offenders, []);
  const { server, origin } = await serve(base);
  const page = await b.newPage();
  // **A returning writer's window, not a first-run dialog.**
  //
  // On a first visit the app opens the welcome overlay, which is correct and is
  // what it is for — so it covers the toolbar, and `getByLabel("שפה")` underneath
  // it cannot be clicked: *"element is visible, enabled and stable … <h2
  // data-i18n="welcomeTitle"> intercepts pointer events"*, after the full 30s.
  //
  // This went unnoticed for the same reason the mount bug did: **every run of this
  // file that ever reached a click was against a bundle with no wasm engine in
  // it**, where the app never reaches the state that opens the overlay, so there
  // was nothing to intercept. `ci.yml` builds with `npx vite build`; only
  // `deploy.yml` builds the real one, and only the deploy ran the gate against
  // it. Two builds, one of which is the product.
  //
  // Seeded rather than dismissed after the fact, because the language switch is
  // the thing under test and it is pressed in a window a writer has been working
  // in — the dialog is a first thirty seconds, not the chrome. Seeding before the
  // first byte also keeps the measurement below honest about what it counted.
  await page.addInitScript(() => localStorage.setItem("ksav.onboarded", "1"));
  try {
    await page.goto(origin, { waitUntil: "networkidle" });
    // **A condition, not a stopwatch.** This was `waitForTimeout(2500)`, which
    // is enough on an idle machine and not enough in the full suite, where the
    // ribbon was still being built when the first assertion read `0 groups` —
    // a red that named #228's defect on a build that did not have it. Wait for
    // the thing that is about to be asserted, and let a real absence fail the
    // assertion below with its own message rather than a timeout in here.
    await page
      .waitForFunction(() => document.querySelectorAll("header .tb-group").length > 0, undefined, {
        timeout: 20000,
      })
      .catch(() => {});

    // The whole reason for the file: read the window, do not read a dictionary.
    const before = await page.evaluate(READ, markPattern().source);
    const heBefore = [before.text, before.aria, before.title, before.placeholder]
      .flat().filter((s) => HEBREW.test(s));
    ok("the app boots into Hebrew with plenty on screen", heBefore.length > 50);
    check("and the document is right-to-left", await page.getAttribute("html", "dir"), "rtl");

    // ------------------------------------------------ the ribbon is *built*
    //
    // #228: the engine refused its own registry (`commands` and `templates`
    // relayed a JSON array into an envelope whose shape is an object) from #215
    // until #228, so every build drew "registries failed" where the ribbon
    // belongs — for a week, with the app suite, the wire comparator and the
    // engine suite all green, because every one of them answered the *stub* or
    // the *source text* and none of them asked a booted application what it had.
    //
    // This file already boots the real bundle against the real engine (the wasm
    // one: `dist/` carries it), which makes two assertions here the cheapest
    // end-to-end fence in the repository — the whole path from the const table in
    // `commands.rs` to a group of buttons in a header.
    const chrome0 = await page.evaluate(() => ({
      groups: document.querySelectorAll("header .tb-group").length,
      failed: document.querySelectorAll("header .toolbar-failed").length,
      notice: (document.querySelector("[role=status], .chrome-notice")?.textContent ?? "").trim(),
    }));
    // **Which bundle this is matters, so it is asked rather than assumed.**
    //
    // Two builds exist and both are legitimate: `npm run build:wasm` puts the
    // engine *in* the bundle (the browser app, deployed), and `npm run build` /
    // `npx vite build` leaves it at the other end of a wire (this frontend built
    // for the desktop shell, and what `ci.yml`'s editor job builds). Only the
    // first can have a ribbon with no server running; the second would report
    // "registries failed" here however healthy it is, because nothing in this
    // file starts an engine. Asserting the ribbon for both would have made a
    // legitimate build look like #228 — the exact wrong diagnosis #229 is about.
    //
    // What that costs, stated rather than hidden: **no workflow installs a
    // browser**, so this file skips in CI, and the CI-side end-to-end fence is
    // `desktop render scale` (`tools/render-check.mjs`, the `desktop shell` job).
    // That is where #228 was found, as `ribbonGroups: 0`.
    if (engineInBundle()) {
      ok("the ribbon is built from the engine's registry", chrome0.groups > 0, `${chrome0.groups} groups`);
      check("and it is not the registry-failed notice", chrome0.failed, 0);
    } else {
      console.log(
        "SKIPPED the ribbon: this dist keeps the engine at the other end of a wire, and no server " +
          "runs in this test — build with `npm run build:wasm` to assert it (CI asserts it in `desktop render scale`)",
      );
    }
    // The switch, pressed the way a writer presses it: the toolbar button whose
    // accessible name is "שפה". Found by its name in the *old* language on
    // purpose — that is the only way a writer can find it.
    await page.getByLabel("שפה").click();
    await page.waitForTimeout(1200);

    const after = await page.evaluate(READ, markPattern().source);
    check("the switch flips the writing direction", await page.getAttribute("html", "dir"), "ltr");
    check("and the document language", await page.getAttribute("html", "lang"), "en");

    // Collected with their element, because whether a string is the document's
    // own text is a question about where it sits and not about what it says.
    const all = [
      ...after.text.map((v) => ({ v, e: null })),
      ...after.aria, ...after.title, ...after.placeholder,
    ];
    const heAfter = all.filter((x) => HEBREW.test(x.v));

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
    // The exclusions happened in `READ`, where the element still existed; here
    // all that is left is to sort what survived into a key the catalogue owns and
    // a sentence it does not.
    const { DICTS } = await import("../.tmp-test/i18n.mjs");
    const byValue = new Map(Object.entries(DICTS.he).map(([k, v]) => [v, k]));
    const stillHere = new Set();
    const composed = new Set();
    for (const v of [after.text, after.aria, after.title, after.placeholder].flat()) {
      const key = byValue.get(v) ?? [...byValue].find(([w]) => w.length > 3 && v.startsWith(w))?.[1];
      if (key) stillHere.add(key);
      else composed.add(v.slice(0, 40));
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

    // The mechanism itself, asserted directly. The residue ceiling cannot see
    // this: a `tf` that failed to substitute produces `":sc.open · Alt+a"`, which
    // is **not Hebrew**, so the count goes *down* and the ceiling is satisfied by
    // a window that is worse than before. A mutation confirmed exactly that.
    //
    // So: after a switch, nothing on the screen may still be a template or a key.
    const unsubstituted = await page.evaluate(() => {
      const bad = [];
      const check = (e, attr) => {
        const v = e.getAttribute?.(attr);
        if (v && (/\{\d+\}/.test(v) || /^:[a-zA-Z]/.test(v))) {
          bad.push(`${attr}=${v}`);
        }
      };
      for (const e of document.querySelectorAll("*")) {
        for (const a of ["aria-label", "title", "placeholder"]) check(e, a);
        if (![...e.children].some((c) => c.textContent === e.textContent)) {
          const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("");
          if (/\{\d+\}/.test(own)) bad.push(`text=${own.slice(0, 30)}`);
        }
      }
      return [...new Set(bad)];
    });
    check("no label is an unsubstituted template or a key", unsubstituted, []);

    // A reload, because a language that reverts looks like a selector that does
    // nothing, and costs the writer the whole surface every time they return.
    const stored = await page.evaluate(() => localStorage.getItem("ksav.settings"));
    ok("and the choice was written down", /"lang":"en"/.test(stored ?? ""));

    // ------------------------------------------------- one page, two directions
    //
    // #122. The root element's `dir` used to be the **document's**
    // (`document.documentElement.dir = docConfig().dir`), added to fix the caret
    // in a Hebrew document under an English interface. It fixed the caret and
    // mirrored the product: an English interface with a Hebrew sefer opened right
    // to left, drawers and menus included, and the pane tree — kept physical on
    // purpose so "preview on the right" is the right of the screen — laid itself
    // out backwards.
    //
    // Switched here through the settings drawer, the way a writer does it, and
    // then read off three elements: the page takes the interface's direction and
    // the text surfaces take the document's. This is the only place in the suite
    // where a real window can be asked, and it is the difference the fix makes.
    {
      await page.getByLabel("Settings").first().click();
      await page.waitForTimeout(700);
      const direction = page
        .locator("select")
        .filter({ has: page.locator("option[value='rtl']") })
        .first();
      await direction.selectOption("rtl");
      await page.waitForTimeout(900);
      const both = await page.evaluate(() => ({
        root: document.documentElement.dir,
        text: [...document.querySelectorAll(".cm-content")].map((e) => e.getAttribute("dir")),
        preview: [...document.querySelectorAll(".preview-host")].map((e) => e.style.direction),
      }));
      check("an English interface keeps reading left to right", both.root, "ltr");
      check("…while the Hebrew document's text reads right to left", both.text, ["rtl"]);
      check("…and every preview pane follows the document", both.preview, ["rtl"]);
      // …and the page is still left to right after the flip (the drawer is open
      // here, which is the surface the old coupling moved).
      check(
        "the drawer did not turn the page around",
        await page.getAttribute("html", "dir"),
        "ltr",
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    check("a reload keeps the language", await page.getAttribute("html", "lang"), "en");
    check("and the direction", await page.getAttribute("html", "dir"), "ltr");
    // …and the document keeps the direction it was *given*, which is #135's third
    // acceptance item: a page setup chosen in the drawer is remembered, not just
    // live for the session. Read off the text surface rather than the page, since
    // #122 is what moved the page's direction to the interface's.
    check(
      "the document keeps the direction it was set to",
      await page.evaluate(() => [...document.querySelectorAll(".cm-content")].map((e) => e.getAttribute("dir"))),
      ["rtl"],
    );

    // -------------------------------------------------- a first run, in English
    //
    // #135, first defect. The English first-run branch called
    // `setPageSetup({ dir: "ltr" })` *before* the store opened — and
    // `setPageSetup` returns when there is no current document, so it did
    // nothing at all. An English writer was handed the engine's shipped RTL page
    // (which is right for a Hebrew-first product and wrong for the writer who
    // just said "English"), with nothing on screen saying a default had been
    // chosen. Read here, in a fresh profile, because the fault is a boot order
    // and a boot order is not visible from a unit test.
    {
      const context = await b.newContext();
      await context.addInitScript(() => {
        localStorage.clear();
        // What the language chip writes when a writer picks English, and no
        // `ksav.onboarded`: this is the first thirty seconds.
        localStorage.setItem("ksav.settings", JSON.stringify({ lang: "en" }));
      });
      const first = await context.newPage();
      await first.goto(origin, { waitUntil: "networkidle" });
      await first.waitForTimeout(3000);
      const opening = await first.evaluate(() => ({
        lang: document.documentElement.lang,
        text: [...document.querySelectorAll(".cm-content")].map((e) => e.getAttribute("dir")),
        preview: [...document.querySelectorAll(".preview-host")].map((e) => e.style.direction),
      }));
      check("an English first run is an English interface", opening.lang, "en");
      check("and its starter document reads left to right", opening.text, ["ltr"]);
      check("…as does the preview beside it", opening.preview, ["ltr"]);
      await context.close();
    }
  } finally {
    await b.close();
    server.close();
  }
}
