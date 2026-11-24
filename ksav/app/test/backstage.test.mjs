// File is a backstage (#233, `docs/ui-architecture.md` §6), measured in the
// built application.
//
// `placement.test` holds what the backstage lists to the placements; this
// holds what a writer does with it. The button at the start of the tab row opens a
// page over the whole window, a column of sections on the start side. Up and
// Down walk the column. Escape and `←` leave it, and leaving it puts the caret
// back in the document. Settings is the settings drawer, not a page of its own.

import { check, ok, notOk, installChrome } from "./harness.mjs";
import { openApp } from "./pageserve.mjs";
import { openBackstage } from "../.tmp-test/backstage.mjs";
import { buildAbout } from "../.tmp-test/about.mjs";

/** What the open backstage says about itself, or null when it is shut. */
const READ = () => {
  const b = document.getElementById("backstage");
  if (!b) return null;
  const nav = b.querySelector(".backstage-nav").getBoundingClientRect();
  const pg = b.querySelector(".backstage-page").getBoundingClientRect();
  const r = b.getBoundingClientRect();
  return {
    role: b.getAttribute("role"),
    covers: r.width >= innerWidth - 1 && r.height >= innerHeight - 1,
    on: getComputedStyle(b).zIndex,
    tabs: [...b.querySelectorAll(".backstage-tab")].map((x) => x.dataset.section),
    selected: b.querySelector('.backstage-tab[aria-selected="true"]')?.dataset.section,
    page: b.querySelector(".backstage-page").dataset.section,
    focus: document.activeElement?.dataset?.section ?? document.activeElement?.className ?? "",
    navAtStart: getComputedStyle(document.documentElement).direction === "rtl" ? nav.left > pg.left : nav.left < pg.left,
    back: b.querySelector(".panel-back")?.getAttribute("aria-label") ?? "",
    rows: b.querySelectorAll(".backstage-page .menu-item").length,
    text: b.querySelector(".backstage-page").textContent,
  };
};
const inEditor = () => !!document.activeElement?.closest(".cm-editor");

export async function run() {
  // ---------------------------------------------- the module, without a browser
  {
    const env = installChrome();
    try {
      ok("openBackstage is what the header calls", typeof openBackstage === "function");
      const about = buildAbout();
      ok("About has something to say", about.length > 0);
    } finally {
      env.restore();
    }
  }

  const app = await openApp();
  if (app.skip) {
    console.log(`SKIPPED backstage: ${app.skip}`);
    return;
  }
  const { page, close } = app;
  try {
    const file = page.locator(".ribbon-head > .ribbon-file[data-backstage]");
    check("File is at the start of the tab row, once", await file.count(), 1);
    ok(
      "and it is not one of the tabs",
      await page.evaluate(() => !document.querySelector(".ribbon-tabs .ribbon-file")),
    );

    // ------------------------------------------------ opening it
    await page.click(".cm-content");
    await file.click();
    let s = await page.evaluate(READ);
    ok("pressing File opens the backstage", s);
    check("which is a dialog", s.role, "dialog");
    ok("over the whole window", s.covers);
    check("above the shell, under what it opens", s.on, "48");
    ok("the section column is on the start side", s.navAtStart);
    check("it lands on Open", s.page, "open");
    check("with Open's tab chosen", s.selected, "open");
    check("and focused", s.focus, "open");
    for (const want of ["new", "open", "save", "export", "print", "settings", "about"]) {
      ok(`the column lists ${want}`, s.tabs.includes(want));
    }
    check("Settings and About close the column", s.tabs.slice(-2), ["settings", "about"]);
    ok("the way back is named, not a bare arrow", s.back.length > 1);

    // ------------------------------------------------ walking the column
    await page.keyboard.press("ArrowDown");
    s = await page.evaluate(READ);
    check("Down goes to the next section", s.page, s.tabs[s.tabs.indexOf("open") + 1]);
    check("and keeps the focus on the column", s.focus, s.page);
    await page.keyboard.press("End");
    check("End goes to the last", (await page.evaluate(READ)).page, "about");
    ok("About names where to report a problem", (await page.evaluate(READ)).text.includes("github.com"));
    await page.keyboard.press("Home");
    check("Home goes to the first", (await page.evaluate(READ)).page, s.tabs[0]);
    await page.click('.backstage-tab[data-section="save"]');
    s = await page.evaluate(READ);
    check("a click shows a section", s.page, "save");
    ok("and Save has its rows", s.rows > 0);

    // ------------------------------------------------ leaving it
    await page.keyboard.press("Escape");
    notOk("Escape leaves the backstage", await page.evaluate(READ));
    ok("and the caret is back in the document", await page.evaluate(inEditor));

    await file.click();
    await page.click("#backstage .panel-back");
    notOk("← leaves it too", await page.evaluate(READ));
    ok("and also gives the document back", await page.evaluate(inEditor));

    await file.click();
    await page.click('.backstage-tab[data-section="settings"]');
    notOk("Settings leaves the backstage", await page.evaluate(READ));
    ok(
      "for the settings drawer",
      await page.evaluate(() => document.getElementById("settings-drawer")?.classList.contains("open")),
    );
    await page.keyboard.press("Escape");

    // A row that acts leaves the page before it acts, so what it opens is on top.
    await file.click();
    await page.click('.backstage-tab[data-section="open"]');
    const row = page.locator("#backstage .backstage-page button.menu-item:not([disabled])").first();
    if (await row.count()) {
      await page.evaluate(() => {
        // Disarm what a row might do to the page under test: a file picker.
        window.showOpenFilePicker = () => Promise.reject(new DOMException("test", "AbortError"));
      });
      await row.click();
      notOk("a row that acts closes the backstage", await page.evaluate(READ));
    }
  } finally {
    await close();
  }
}
