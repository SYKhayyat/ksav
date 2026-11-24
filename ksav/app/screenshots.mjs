// Step 10's screenshots, and the geometry the eye would be checking (#233).
//
// Six shots over three widths in two languages, plus the backstage and a
// contextual tab. Each one comes with the numbers behind it, because a screenshot this
// repository's CI never looks at is a picture, and the claims a picture is asked
// to support — one row, fixed height, nothing overflowing — are measurements.
import { mkdirSync, writeFileSync } from "node:fs";
import { openApp } from "./test/pageserve.mjs";

const OUT = "/tmp/ksav-step10";
mkdirSync(OUT, { recursive: true });

const app = await openApp({ wait: 4000 });
if (app.skip) {
  console.log(`SKIPPED screenshots: ${app.skip}`);
  process.exit(0);
}
const { page, close } = app;

/** What the shell measures like right now, at whatever width it is. */
const geometry = () =>
  page.evaluate(() => {
    const box = (sel) => {
      const n = document.querySelector(sel);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) };
    };
    // The tabs that are on the strip. A contextual one (Table) is built once and
    // then `hidden` until the caret is in its context, so it sits at the top of
    // the document with no box — counting it here reported every shot as two
    // rows until the numbers were read instead of the rule.
    const onStrip = [...document.querySelectorAll(".ribbon-tabs .ribbon-tab")].filter((t) => !t.hidden);
    const tabs = onStrip.map((t) => {
      const r = t.getBoundingClientRect();
      return { tab: t.getAttribute("data-tab"), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const ribbon = document.querySelector(".ribbon");
    return {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      strip: box(".ribbon-tabs"),
      head: box(".ribbon-head"),
      panel: box("#ribbon-panel"),
      status: box("#status"),
      tabs,
      offstage: [...document.querySelectorAll(".ribbon-tabs .ribbon-tab")].filter((t) => t.hidden).map((t) => t.getAttribute("data-tab")),
      tabRows: new Set(tabs.map((t) => t.top)).size,
      overflow: Math.max(0, Math.round((ribbon?.scrollWidth ?? 0) - (ribbon?.clientWidth ?? 0))),
      docScrollsSideways: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    };
  });

const seen = [];
async function shot(name, lang, width) {
  const g = await geometry();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  seen.push({ name, ...g });
  console.log(`${name}: ${JSON.stringify({ lang: g.lang, viewport: g.viewport, panel: g.panel?.h, head: g.head?.h, tabRows: g.tabRows, tabs: g.tabs.length, overflow: g.overflow, docScrollsSideways: g.docScrollsSideways })}`);
}

// Hebrew, the product's own language, at every width the ribbon has a shape at:
// wide, narrow-but-full, and below `SIMPLIFIED_BELOW` (640) where the groups are
// replaced by one row of icons (§7).
for (const [width, tag] of [
  [1366, "he-1366"],
  [680, "he-680"],
  [620, "he-620"],
]) {
  await page.setViewportSize({ width, height: 768 });
  await page.waitForTimeout(900);
  await shot(tag, "he", width);
}

// The backstage and a contextual tab, at the wide window, because they are the
// two surfaces that only exist while something is open.
await page.setViewportSize({ width: 1366, height: 768 });
await page.waitForTimeout(600);
await page.click(".ribbon-file");
await page.waitForSelector("#backstage", { timeout: 10_000 });
await page.waitForTimeout(500);
await shot("he-backstage", "he", 1366);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

await page.click('.ribbon-tab[data-tab="insert"]');
const face = ".ribbon-panel [data-action=\"table\"]";
if (await page.locator(face).count()) {
  await page.click(face);
  await page.waitForTimeout(1200);
  await shot("he-contextual-table", "he", 1366);
}

// English: the same window, read left to right, in the other catalogue.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("ksav.settings") ?? "{}");
  localStorage.setItem("ksav.settings", JSON.stringify({ ...s, lang: "en" }));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(4000);
for (const [width, tag] of [
  [1366, "en-1366"],
  [680, "en-680"],
  [620, "en-620"],
]) {
  await page.setViewportSize({ width, height: 768 });
  await page.waitForTimeout(900);
  await shot(tag, "en", width);
}

writeFileSync(`${OUT}/geometry.json`, JSON.stringify(seen, null, 2));
console.log(`\n${seen.length} shots in ${OUT}`);

// The two claims the plan makes about the ribbon, at every width, in both
// languages: one row of tabs, a fixed height, and nothing sticking out.
for (const g of seen) {
  const ok = g.tabRows === 1 && (g.overflow ?? 0) <= 1 && (g.docScrollsSideways ?? 0) <= 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${g.name}: ${g.tabs.length} tabs on ${g.tabRows} row(s), ribbon ${g.panel?.h}px, overflow ${g.overflow}, page overflow ${g.docScrollsSideways}`);
}
await close();
