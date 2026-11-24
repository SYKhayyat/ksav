// How the ribbon gets narrower, and how it folds away (#233, step 7; `docs/ui-architecture.md` §4, §7).
//
// Three halves. `shrinkSteps` is pure and holds the order: the groups with
// B/I/U, the footnote, siman and seif go last; the rest go row end first, every
// one through level 1 before any reaches level 2; a level that changes nothing
// in a group is no step for it. `drawGroup` draws a level: 1 has no large face,
// 2 draws every face with an icon as the icon alone, 3 is one button. And
// collapse: ⌃ or a tab's double-click flips `shell.collapsed`, the tab row is all
// that is drawn, and a press on a tab drops its groups.

import { check, ok, installChrome, fakeView } from "./harness.mjs";
import { commands } from "../tools/commands.mjs";
import { placed, tabTree } from "../.tmp-test/placement.mjs";
import { SHRINK_LAST, shrinkInfo, shrinkPlan, shrinkSteps, spillOrder } from "../.tmp-test/shrink.mjs";
import { buildRibbon, drawGroup } from "../.tmp-test/shelltabs.mjs";
import { setRegistries, setView } from "../.tmp-test/runtime.mjs";
import { settings, setSetting, wireSettingsWrite } from "../.tmp-test/settings.mjs";
import { readShell } from "../.tmp-test/shellsettings.mjs";
import { openApp } from "./pageserve.mjs";

/** The ribbon as the window lays it out. */
const MEASURE = () => {
  const r = document.querySelector('.ribbon[data-ribbon="tabs"]');
  const p = r.querySelector(".ribbon-panel");
  const shown = [...p.children].filter((g) => !g.hidden);
  const tops = shown.map((g) => g.getBoundingClientRect().top);
  return {
    height: Math.round(p.getBoundingClientRect().height),
    fits: p.scrollWidth <= p.clientWidth + 1,
    // Wrapped is a group that starts below where another ends.
    oneRow: Math.max(...tops) < Math.min(...shown.map((g) => g.getBoundingClientRect().bottom)),
    simplified: r.dataset.simplified === "true",
    levels: [...p.children].filter((g) => g.dataset.level).map((g) => g.dataset.level),
    pageWide: document.documentElement.scrollWidth > innerWidth + 1,
  };
};

export async function run() {
  // ------------------------------------------------ the order
  const G = (large, labelled, last) => ({ large, labelled, last });
  const row = [G(true, true, false), G(true, true, true), G(false, true, false), G(true, false, false)];
  const steps = shrinkSteps(row);
  const lastAt = steps.findIndex(([i]) => row[i].last);
  ok("the protected group shrinks only after every other has gone to 3", steps.slice(lastAt).every(([i]) => row[i].last));
  const firstTwo = steps.findIndex(([, l]) => l === 2);
  ok("every unprotected group passes level 1 before any reaches 2", steps.slice(0, firstTwo).every(([, l]) => l === 1));
  check("level 1, row end first, skipping a group with nothing large", steps.filter(([i, l]) => l === 1 && !row[i].last).map(([i]) => i), [3, 0]);
  check("level 2 skips a group with nothing labelled", steps.filter(([i, l]) => l === 2 && !row[i].last).map(([i]) => i), [2, 0]);
  check("every group ends folded", shrinkPlan(row, steps.length), [3, 3, 3, 3]);
  check("no step is no change", shrinkPlan(row, 0), [0, 0, 0, 0]);
  check("starting at 2 (the simplified ribbon) only folds", shrinkSteps(row, 2).map(([, l]) => l), [3, 3, 3, 3]);
  check("⋯ takes the rest before what shrinks last, the row's end first", spillOrder(row), [3, 2, 0, 1]);
  check("what shrinks last is the six a writer of sefarim presses every minute", [...SHRINK_LAST].sort(), ["הדגשה", "הערה", "נטוי", "סימן", "סעיף", "קו_תחתון"].sort());

  // ------------------------------------------------ the real tabs
  const { BUILT_IN } = await import("../.tmp-test/actionsurface.mjs");
  const reg = commands();
  const tree = tabTree(placed({ builtIns: BUILT_IN.map((a) => a.id), commands: reg, macros: [], styles: [{ id: "style:a", name: "a" }] }));
  const home = tree.find((n) => n.tab === "home");
  const font = home.groups.find((g) => g.group === "font");
  ok("Home ▸ Font (B/I/U) shrinks last", shrinkInfo(font).last);
  ok("Home ▸ Clipboard does not", !shrinkInfo(home.groups[0]).last);
  ok("Clipboard has a large face to give up", shrinkInfo(home.groups[0]).large);

  installChrome();
  setView(fakeView("שלום"));
  setRegistries(reg, []);
  const clip = home.groups[0];
  const faces = (n) => n.children[0].children.flatMap((l) => l.children).filter((b) => b["data-action"]);
  check("level 0 keeps paste large", faces(drawGroup(clip, 0)).find((b) => b["data-action"] === "paste")?.["data-size"], "large");
  check("level 1 has no large face", faces(drawGroup(clip, 1)).filter((b) => b["data-size"] === "large").length, 0);
  ok("level 2 draws every face with an icon as the icon", faces(drawGroup(clip, 2)).every((b) => b["data-size"] === "icon" || !clip.face.find((a) => a.id === b["data-action"])?.place.icon));
  const folded = drawGroup(clip, 3);
  check("level 3 is one button", [folded["data-level"], folded.children.length, folded.children[0]["data-menu"]], ["3", 1, "fold-" + clip.group]);
  ok("…named for its group", folded.children[0].children[0].children.some((c) => c.children?.includes?.(folded["aria-label"])));

  // ------------------------------------------------ collapse
  wireSettingsWrite({ applyChange() {}, setPageSetup() {}, rememberConfig() {} });
  const before = readShell(settings.shell).collapsed;
  const open = buildRibbon();
  check("the ribbon says whether it is collapsed", open["data-collapsed"], String(before));
  const collapseBtn = open.children[0].children.at(-1);
  collapseBtn.click();
  ok("⌃ flips the setting", readShell(settings.shell).collapsed === !before);
  const shut = buildRibbon();
  check("and the redraw is collapsed", shut["data-collapsed"], String(!before));
  check("⌃ says it will show the ribbon", shut.children[0].children.at(-1)["aria-expanded"], String(before));
  const tab = shut.children[0].children[0].children.find((b) => b["data-tab"] === "insert");
  for (const f of tab.listeners?.dblclick ?? []) f({ stopPropagation() {}, preventDefault() {} });
  ok("a tab's double-click flips it back", readShell(settings.shell).collapsed === before);
  setSetting("shell", { ...readShell(settings.shell), collapsed: before });

  // ------------------------------------------------ in the built application
  const app = await openApp({ ribbon: true });
  if (app.skip) {
    console.log(`SKIPPED shrink (browser): ${app.skip}`);
    return;
  }
  const { page, close } = app;
  try {
    // The panel, waited for rather than assumed.
    //
    // `openApp` waits a fixed two seconds for the window, and the panel is drawn
    // when the engine's registry arrives — so under the full suite, where five
    // browser files share one machine, that moment can be later than the wait.
    // Measured: `p.children` with no `p` at all, in a run where every other width
    // of the same file passed. A flake here is a deadline, not a defect in the
    // ribbon, and the fix is to ask for the thing instead of racing it.
    await page.waitForSelector('.ribbon[data-ribbon="tabs"] .ribbon-panel', { timeout: 30_000 });
    for (const width of [1366, 1100, 800, 680, 500]) {
      await page.setViewportSize({ width, height: 768 });
      await page.waitForTimeout(300);
      const m = await page.evaluate(MEASURE);
      ok(`${width}px: the groups fit the row`, m.fits);
      ok(`${width}px: the ribbon is one row`, m.oneRow);
      check(`${width}px: its height is fixed`, m.height, width < 640 ? 36 : 92);
      check(`${width}px: simplified below 640`, m.simplified, width < 640);
      ok(`${width}px: the page does not scroll sideways`, !m.pageWide);
      if (width === 1366) check("1366px: every group full", m.levels.filter((l) => l !== "0"), []);
      if (width < 640) check(`${width}px: the simplified row is icons, never a folded group`, m.levels.filter((l) => l !== "2"), []);
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.click(".cm-content");
    await page.keyboard.press("Control+F1");
    await page.waitForTimeout(200);
    check("Ctrl+F1 leaves the tab row alone", await page.evaluate(() => getComputedStyle(document.getElementById("ribbon-panel")).display), "none");
    await page.click('.ribbon-tab[data-tab="insert"]');
    await page.waitForTimeout(200);
    ok("a tab drops its groups over the document", await page.evaluate(() => document.getElementById("ribbon-panel").classList.contains("open")));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    ok("Escape takes them back", await page.evaluate(() => !document.getElementById("ribbon-panel").classList.contains("open")));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector(".ribbon-panel", { state: "attached", timeout: 30_000 });
    check("collapsed survives a reload", await page.evaluate(() => document.querySelector('.ribbon[data-ribbon="tabs"]').dataset.collapsed), "true");
    await page.click(".ribbon-collapse");
    await page.waitForTimeout(200);
    check("⌃ brings it back", await page.evaluate(() => document.querySelector('.ribbon[data-ribbon="tabs"]').dataset.collapsed), "false");
  } finally {
    await close();
  }
}
