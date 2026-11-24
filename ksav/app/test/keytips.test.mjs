// Key tips (#233, step 8; `docs/ui-architecture.md` §8 and the fence of §11).
//
// The fence: tips are unique per level, never a final letter, and matched by
// `event.code` — so two buttons never share a key and a tip works whichever
// layout is active. `keyTips` is pure and is held here against the real tabs'
// words in both languages; then the built application is driven: Alt alone,
// a tab's letter, a button's letter, Esc back, F10.

import { check, ok } from "./harness.mjs";
import { commands } from "../tools/commands.mjs";
import { placed, tabTree } from "../.tmp-test/placement.mjs";
import { HE_CODE, alphabet, codeOf, keyTips, letterOf } from "../.tmp-test/keytips.mjs";
import { openApp } from "./pageserve.mjs";

const FINALS = "ךםןףץ";

/** Unique, and no tip the first key of another. */
function prefixFree(tips) {
  return tips.every((a, i) => tips.every((b, j) => i === j || !b.startsWith(a)));
}

export async function run() {
  // ------------------------------------------------ the letters
  check("first letters first", keyTips(["Home", "Insert", "Layout"], "en"), ["h", "i", "l"]);
  check("then the next free letter in the label", keyTips(["Home", "Help", "Hide"], "en"), ["h", "e", "i"]);
  check("then any free letter", keyTips(["a", "a", "a"], "en"), ["a", "b", "c"]);
  check("a final letter stands for its letter", keyTips(["ם", "שלום"], "he"), ["מ", "ש"]);
  check("no letter at all still gets one", keyTips(["⋯", "⚙"], "en"), ["a", "b"]);
  check("Hebrew has 22 tip letters, none final", [alphabet("he").length, [...FINALS].some((f) => alphabet("he").includes(f))], [22, false]);

  // ------------------------------------------------ physical keys
  ok("every Hebrew tip letter has a key", [...alphabet("he")].every((c) => HE_CODE[c]));
  check("no two Hebrew letters share a key", new Set(Object.values(HE_CODE)).size, alphabet("he").length);
  check("SI-1452: ב is where C is, ש where A is, ת where comma is", [codeOf("ב", "he"), codeOf("ש", "he"), codeOf("ת", "he")], ["KeyC", "KeyA", "Comma"]);
  ok("every letter round-trips through its code", ["he", "en"].every((l) => [...alphabet(l)].every((c) => letterOf(codeOf(c, l), l) === c)));
  check("digits on the row and the pad", [letterOf("Digit3", "he"), letterOf("Numpad3", "en")], ["3", "3"]);
  check("a final letter's key is no tip", [letterOf("KeyO", "he"), letterOf("KeyI", "he")], ["", ""]);

  // ------------------------------------------------ more labels than letters
  const many = Array.from({ length: 40 }, (_, i) => ["Bold", "Bullets", "Border", "Paste", "Font", "Find"][i % 6] + i);
  const big = keyTips(many, "en");
  ok("forty labels: unique and prefix-free", new Set(big).size === 40 && prefixFree(big));
  ok("…every tip one or two keys", big.every((t) => t.length === 1 || t.length === 2));
  const he = keyTips(Array.from({ length: 30 }, (_, i) => "הדגשה" + i), "he");
  ok("thirty Hebrew labels: unique, prefix-free, no final", new Set(he).size === 30 && prefixFree(he) && he.every((t) => ![...t].some((c) => FINALS.includes(c))));

  // ------------------------------------------------ the real tabs
  const tree = tabTree(placed({ builtIns: (await import("../.tmp-test/actionsurface.mjs")).BUILT_IN.map((a) => a.id), commands: commands(), macros: [], styles: [] }));
  for (const lang of ["he", "en"]) {
    for (const n of tree) {
      // Every face, `⋯` and `⚙` a level can hold: the most a tab's panel can draw.
      const labels = n.groups.flatMap((g) => [...g.face.map((a) => a.id), ...(g.more.length ? ["more " + g.group] : []), ...(g.gear.length ? ["gear " + g.group] : [])]);
      const tips = keyTips(labels, lang);
      ok(`${lang} ${n.tab}: ${labels.length} tips, unique and prefix-free`, new Set(tips).size === labels.length && prefixFree(tips));
      ok(`${lang} ${n.tab}: every tip key has a physical key`, tips.every((t) => [...t].every((c) => codeOf(c, lang))));
    }
  }

  // ------------------------------------------------ in the built application
  const app = await openApp({ ribbon: true });
  if (app.skip) {
    console.log(`SKIPPED keytips (browser): ${app.skip}`);
    return;
  }
  const { page, close } = app;
  try {
    await page.setViewportSize({ width: 1366, height: 768 });
    const tips = () => page.evaluate(() => {
      const l = document.querySelector(".keytips");
      return l ? { level: l.dataset.level, tips: [...l.children].map((c) => c.textContent) } : null;
    });
    await page.waitForSelector('.ribbon-tab[data-tab="insert"]', { timeout: 30_000 });
    await page.click(".cm-content");
    const before = await page.evaluate(() => document.querySelector(".cm-content").textContent);
    await page.keyboard.press("Alt");
    const row = await tips();
    check("Alt alone shows the tab row's tips", row?.level, "tabs");
    ok("…unique", row && new Set(row.tips).size === row.tips.length);
    ok("…with digits on Quick Access", row?.tips.includes("1"));

    // The Insert tab's tip, pressed by its physical key, whatever the layout.
    const insert = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll(".keytip")];
      const at = document.querySelector('.ribbon-tab[data-tab="insert"]').getBoundingClientRect();
      const x = Math.round(at.left + at.width / 2);
      return tabs.find((s) => Math.abs(parseFloat(s.style.left) - x) < 2)?.textContent;
    });
    ok("Insert has a tip", !!insert);
    const lang = await page.evaluate(() => document.documentElement.lang || "he");
    const code = codeOf(insert.toLowerCase(), lang.startsWith("en") ? "en" : "he");
    await page.keyboard.press(code);
    check("its letter opens Insert", await page.evaluate(() => document.querySelector(".ribbon-tab[aria-selected='true']").dataset.tab), "insert");
    const panel = await tips();
    check("…and puts tips on its buttons", panel?.level, "panel");
    ok("…unique and prefix-free", panel && new Set(panel.tips).size === panel.tips.length && prefixFree(panel.tips));
    check("nothing was typed into the text", await page.evaluate(() => document.querySelector(".cm-content").textContent), before);

    await page.keyboard.press("Escape");
    check("Esc steps back to the tabs", (await tips())?.level, "tabs");
    await page.keyboard.press("Escape");
    check("Esc again puts them away", await tips(), null);
    ok("…and the caret back in the text", await page.evaluate(() => !!document.activeElement?.closest(".cm-editor")));

    await page.keyboard.press("F10");
    check("F10 shows them too", (await tips())?.level, "tabs");
    await page.mouse.click(683, 500);
    check("a click puts them away", await tips(), null);

    await page.click(".cm-content");
    await page.keyboard.press("Alt+KeyB");
    check("Alt with another key is a chord, not the tips", await tips(), null);
  } finally {
    await close();
  }
}
