// Pressed state from the caret (#233, step 9; `docs/ui-architecture.md` §8).
//
// Until the engine reports the styles in force (#118), B/I/U and the other
// toggles read the markup around the caret: the `#name[…]` bodies it is in.
// The scan is `spans.ts`'s, so these checks are also a statement that this
// surface asks the one scanner rather than keeping a bracket walk of its own.

import { check } from "./harness.mjs";
import { openApp } from "./pageserve.mjs";
import { scan } from "../.tmp-test/spans.mjs";
import { pointsArg, quotedArg, wrappersIn } from "../.tmp-test/pressed.mjs";

/** A scan of `s` with the `|` removed, and the wrappers holding the caret there. */
const calls = (s) => wrappersIn(scan(s.replace("|", "")), s.indexOf("|"));
const at = (s) => calls(s).map((w) => w.name);

export async function run() {
  check("plain text: nothing pressed", at("שלום |עולם"), []);
  check("inside bold", at("#הדגשה[של|ום]"), ["הדגשה"]);
  check("after a closed bold: not pressed", at("#הדגשה[שלום] |עולם"), []);
  check("nested: innermost first", at("#הדגשה[א #נטוי[ב|]]"), ["נטוי", "הדגשה"]);
  check("past a closed sibling inside", at("#הדגשה[#נטוי[א] ב|]"), ["הדגשה"]);
  check("with arguments", at('#סימון(צבע: rgb("#ff0"))[א|]'), ["סימון"]);
  check("in the argument list: not in the body", at('#סימון(צ|בע: rgb("#ff0"))[א]'), []);
  check("a half-typed body still counts", at("#הדגשה[של|"), ["הדגשה"]);
  check("a command in a comment is not a body", at("// #הדגשה[א\nב|"), []);
  check("English names too", at("#bold[a|b]"), ["bold"]);
  check("a bare bracket is no command", at("[א|]"), []);

  // ------------------------------------------------ the boxes' values
  check("arguments are read", calls('#גופן_שונה("David Libre")[א|]'), [{ name: "גופן_שונה", args: '"David Libre"' }]);
  check("no arguments, empty", calls("#הדגשה[א|]"), [{ name: "הדגשה", args: "" }]);
  check("a font name", quotedArg('"Frank Ruhl Libre"'), "Frank Ruhl Libre");
  check("no quoted name", quotedArg("14pt"), null);
  check("a size in points", [pointsArg("14pt"), pointsArg("10.5 pt"), pointsArg("1.2em")], [14, 10.5, null]);

  // ------------------------------------------------ in the built application
  const app = await openApp();
  if (app.skip) {
    console.log(`SKIPPED pressed (browser): ${app.skip}`);
    return;
  }
  const { page, close } = app;
  try {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForSelector('.ribbon-tab[data-tab="insert"]', { timeout: 30_000 });
    const bold = '.tb-toggle-btn[data-command="הדגשה"]';
    check("the Font group opens with the font and size boxes", await page.evaluate(() => !!document.querySelector('[data-group="font"] #font-face-box') && !!document.querySelector('[data-group="font"] #font-size-box')), true);
    check("text colour is a split button", await page.evaluate(() => !!document.querySelector('.tb-split .tb-btn[data-command="צבע"] + .tb-swatch')), true);
    // Put the caret inside a bold body, then outside it.
    await page.click(".cm-content");
    await page.keyboard.press("Control+End");
    await page.keyboard.type('\n\n#גופן_שונה("David Libre")[#הדגשה[אבג');
    check("inside bold: B is pressed", await page.getAttribute(bold, "aria-pressed"), "true");
    check("…and the font box shows the caret's font", await page.inputValue("#font-face-box"), (await page.evaluate(() => [...document.querySelectorAll("#font-face-box option")].some((o) => o.value === "David Libre"))) ? "David Libre" : "");
    await page.keyboard.type("]] ד");
    check("past it: B is not", await page.getAttribute(bold, "aria-pressed"), "false");
    check("…and the font box is the document's", await page.inputValue("#font-face-box"), "");
    check("no face is struck through", await page.evaluate(() => [...document.querySelectorAll(".tb-btn")].some((b) => getComputedStyle(b).textDecorationLine.includes("line-through"))), false);
  } finally {
    await close();
  }
}
