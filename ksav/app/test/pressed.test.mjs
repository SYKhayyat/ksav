// Pressed state from the caret (#233, step 9; `docs/ui-architecture.md` §8).
//
// Until the engine reports the styles in force (#118), B/I/U and the other
// toggles read the markup around the caret: the `#name[…]` bodies it is in.

import { EditorState } from "@codemirror/state";
import { check } from "./harness.mjs";
import { openApp } from "./pageserve.mjs";
import { pointsArg, quotedArg, wrappersIn } from "../.tmp-test/pressed.mjs";
import { scanDoc } from "../.tmp-test/spans.mjs";

/**
 * The wrappers around the caret, given a document with `|` for the caret.
 *
 * Through a real `Text`, because that is what the surfaces hand `scanDoc` and
 * because a scan is memoised against the object it was taken from.
 */
function wrappersAt(marked) {
  const text = marked.replace("|", "");
  return wrappersIn(scanDoc(EditorState.create({ doc: text }).doc), marked.indexOf("|"));
}

export async function run() {
  const at = (s) => wrappersAt(s).map((w) => w.name);
  check("plain text: nothing pressed", at("שלום |עולם"), []);
  check("inside bold", at("#הדגשה[של|ום]"), ["הדגשה"]);
  check("after a closed bold: not pressed", at("#הדגשה[שלום] |עולם"), []);
  check("nested: innermost first", at("#הדגשה[א #נטוי[ב|]]"), ["נטוי", "הדגשה"]);
  check("past a closed sibling inside", at("#הדגשה[#נטוי[א] ב|]"), ["הדגשה"]);
  check("with arguments", at('#סימון(צבע: rgb("#ff0"))[א|]'), ["סימון"]);
  check("English names too", at("#bold[a|b]"), ["bold"]);
  check("a bare bracket is no command", at("[א|]"), []);
  // The case the private bracket walk got wrong: a caret in an argument list is
  // inside no body, so nothing is wrapped and nothing is pressed.
  check("inside an argument list: not pressed", at('#סימון(צבע: |rgb("#ff0"))[א]'), []);
  check("…nor is a caret before any body", at("#הדגשה|[]"), []);

  // **A body that has not been closed yet is still a body.** #247.
  //
  // The writer is inside bold the moment they type the `[`, and every keystroke
  // before the `]` is inside it: the frame scan says so (an unclosed `[` closes
  // at the end of the text), and this read used to disagree with it and report
  // nothing at all — so B showed unpressed on the line where the writer is
  // plainly bold. Held here because the disagreement was invisible: both halves
  // were "right" about their own subject.
  check("inside an unclosed body", at("#הדגשה[של|ום"), ["הדגשה"]);
  check("…to the end of the text", at("#הדגשה[שלום|"), ["הדגשה"]);
  check("…nested too", at("#הדגשה[א #נטוי[ב|"), ["נטוי", "הדגשה"]);
  check("…and from the first character", at("#הדגשה[|שלום"), ["הדגשה"]);

  // ------------------------------------------------ the boxes' values
  check("arguments are read", wrappersAt('#גופן_שונה("David Libre")[א|]'), [
    { name: "גופן_שונה", args: '"David Libre"' },
  ]);
  check("no arguments, empty", wrappersAt("#הדגשה[א|]"), [{ name: "הדגשה", args: "" }]);
  check("the innermost font wins", wrappersAt('#גופן_שונה("א")[#גופן_שונה("ב")[|]]')[0].args, '"ב"');
  check("a font name", quotedArg('"Frank Ruhl Libre"'), "Frank Ruhl Libre");
  check("an escaped quote", quotedArg(String.raw`"a\"b"`), 'a"b');
  check("no quoted name", quotedArg("14pt"), null);
  check("a size in points", [pointsArg("14pt"), pointsArg("10.5 pt"), pointsArg("1.2em")], [14, 10.5, null]);

  // ------------------------------------------------ in the built application
  const app = await openApp({ ribbon: true });
  if (app.skip) {
    console.log(`SKIPPED pressed (browser): ${app.skip}`);
    return;
  }
  const { page, close } = app;
  try {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForSelector('.ribbon-tab[data-tab="insert"]', { timeout: 30_000 });
    const bold = '.tb-toggle-btn[data-command="הדגשה"]';
    check(
      "the Font group opens with the font and size boxes",
      await page.evaluate(
        () =>
          !!document.querySelector('[data-group="font"] #font-face-box') &&
          !!document.querySelector('[data-group="font"] #font-size-box'),
      ),
      true,
    );
    check(
      "text colour is a split button",
      await page.evaluate(() => !!document.querySelector('.tb-split .tb-btn[data-command="צבע"] + .tb-swatch')),
      true,
    );
    check(
      "a colour button that is a toggle starts unpressed",
      await page.getAttribute('.tb-toggle-btn[data-command="סימון"]', "aria-pressed"),
      "false",
    );

    // ------------------------------------------- press a face, read it back
    //
    // Driven through the ribbon's own faces rather than by typing markup, for
    // two reasons: the snippet a face inserts is closed (`#הדגשה[|]`, the caret
    // between the brackets) which is the shape the writer actually gets, and an
    // *unclosed* body is not a body — `spans` says so, and `Typst` says so — so
    // text typed by hand mid-bracket is a state with no answer to give.
    const plain = "שלום עולם";
    await page.click(".cm-content");
    await page.keyboard.press("Control+a");
    await page.keyboard.insertText(plain);
    check("plain text: nothing is pressed", await page.getAttribute(bold, "aria-pressed"), "false");

    await page.click(bold);
    check("pressing Bold wraps the word and stays on", await page.getAttribute(bold, "aria-pressed"), "true");
    check(
      "…and the source is the closed snippet",
      await page.evaluate(() => document.querySelector(".cm-content")?.textContent),
      `${plain}#הדגשה[]`,
    );
    // End leaves the body. If the state does not follow the caret, the button
    // stays lit and the writer is told they are bold where they are not.
    await page.keyboard.press("End");
    check("past the body: B is not pressed", await page.getAttribute(bold, "aria-pressed"), "false");

    // The font box: a choice wraps the selection in the command that sets it,
    // and the box then shows the caret's font rather than what was picked.
    const bundled = await page.evaluate(() =>
      [...document.querySelectorAll("#font-face-box option")].some((o) => o.value === "David Libre"),
    );
    await page.selectOption("#font-face-box", bundled ? "David Libre" : "");
    check("the font box shows the caret's font", await page.inputValue("#font-face-box"), bundled ? "David Libre" : "");
    if (bundled) {
      check(
        "…because the caret is inside the command it inserted",
        await page.evaluate(() => document.querySelector(".cm-content")?.textContent?.includes('#גופן_שונה("David Libre")[')),
        true,
      );
    }
    await page.keyboard.press("End");
    check("past it: the box goes back to the document's font", await page.inputValue("#font-face-box"), "");

    // The size box, the same way: typed and confirmed rather than picked.
    await page.fill("#font-size-box", "14");
    await page.press("#font-size-box", "Enter");
    check("a size sets the caret's size, and the box shows it", await page.inputValue("#font-size-box"), "14");
    await page.keyboard.press("End");
    check("past it: the size box is empty", await page.inputValue("#font-size-box"), "");

    // The highlighter is a toggle and the text colour is not: pressing the pen
    // lights it, and the letter beside it never lights.
    await page.click('.tb-toggle-btn[data-command="סימון"]');
    check("the highlighter lights where it is pressed", await page.getAttribute('.tb-toggle-btn[data-command="סימון"]', "aria-pressed"), "true");
    check("…and a text-colour button has no pressed state to show", await page.getAttribute('.tb-btn[data-command="צבע"]', "aria-pressed"), null);

    // §8's one visual rule about an unavailable face, read off the stylesheet the
    // page is actually wearing: with the wasm engine the registry loads, so no
    // .tb-btn-missing is on screen to look at, and "no such element is struck
    // through" would pass on a page where the rule still said it.
    const missingRule = await page.evaluate(() => {
      const found = [];
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // a cross-origin sheet is not ours to read
        }
        for (const rule of rules) {
          if (rule.selectorText === ".tb-btn-missing") found.push(rule.style.textDecorationLine || rule.style.textDecoration || "");
        }
      }
      return found;
    });
    check("the unavailable style is in the stylesheet", missingRule.length, 1);
    check("…and it greys rather than strikes through", missingRule[0].includes("line-through"), false);
    check(
      "no face on screen is struck through either",
      await page.evaluate(() =>
        [...document.querySelectorAll(".tb-btn")].some((b) => getComputedStyle(b).textDecorationLine.includes("line-through")),
      ),
      false,
    );
  } finally {
    await close();
  }
}
