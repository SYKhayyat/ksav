// Pointing text — the vowel bar and the keys that drive it.
//
// The bar used to be click-only: fourteen buttons you mouse at, one at a time.
// That is tolerable for the occasional mark and miserable for a whole verse —
// and the siddur and bentcher templates are pointed throughout, so "a whole
// verse" is the normal case, not the exception.
//
// A vowel is a *combining* mark: typing the letter and then the mark composes
// them, which is exactly type-letter-then-key. So each mark gets a key, held
// with Alt, chosen to sit under the fingers in rough order of how often the mark
// is used rather than by any mnemonic — there is no letter-to-vowel mnemonic in
// Hebrew, and pretending otherwise would be harder to learn, not easier.

import type { KeyBinding } from "@codemirror/view";
import { el } from "./dom";
import { t } from "./i18n";
import * as runtime from "./runtime";
import { settings } from "./settings";

/** Each mark, its name, and the key that types it. */
/**
 * The fourteen marks, as `[mark, nameKey, chord]`.
 *
 * The second column was a **translated string** until 2026-09-27 — `"פתח"`, not a
 * key — which is the same defect `nameMarks` had: the sentence was built once and
 * the key was gone, so a language switch had nothing to re-render. Fourteen
 * buttons, all standing in Hebrew, because the bar could not say anything else.
 *
 * The name is **transliterated** in English rather than translated, so a Hebrew
 * learner in an English interface meets the word their grammar book uses. The
 * mark itself is the glyph beside the label and is Hebrew in both.
 */
export const NIKUD: [string, string, string][] = [
  ["\u05b7", "nikud.patach", "Alt-a"],
  ["\u05b8", "nikud.kamatz", "Alt-s"],
  ["\u05b6", "nikud.segol", "Alt-d"],
  ["\u05b5", "nikud.tsere", "Alt-f"],
  ["\u05b4", "nikud.hiriq", "Alt-g"],
  ["\u05b9", "nikud.holam", "Alt-h"],
  ["\u05bb", "nikud.kubbutz", "Alt-j"],
  ["\u05b0", "nikud.sheva", "Alt-k"],
  ["\u05bc", "nikud.dagesh", "Alt-l"],
  ["\u05c1", "nikud.shinRight", "Alt-w"],
  ["\u05c2", "nikud.shinLeft", "Alt-e"],
  ["\u05b1", "nikud.shindotSegol", "Alt-z"],
  ["\u05b2", "nikud.shindotPatach", "Alt-x"],
  ["\u05b3", "nikud.shindotKamatz", "Alt-c"],
];
/**
 * Add a vowel mark at the cursor.
 *
 * Deliberately does not replace the selection, the way inserting ordinary text
 * would. A nikud is a *diacritic* — it points the letter before it — so with a
 * word selected the writer means "point this", not "delete this and leave a
 * floating vowel". The mark goes at the end of the selection, which is the
 * letter it belongs to.
 */
export function insertNikud(mark: string, afterInsert: () => void) {
  const at = runtime.view.state.selection.main.to;
  runtime.view.dispatch({
    changes: { from: at, to: at, insert: mark },
    selection: { anchor: at + mark.length },
  });
  runtime.view.focus();
  afterInsert();
}

/**
 * Keys that type a nikud mark.
 *
 * Bound at the highest precedence so they beat CodeMirror's own Alt bindings,
 * and only while the nikud bar is open — Alt-letter combinations are useful for
 * other things, and a writer who is not pointing text should keep them.
 */
export function nikudKeymap(afterInsert: () => void): KeyBinding[] {
  return NIKUD.map(([mark, , key]) => ({
    key,
    preventDefault: true,
    run: () => {
      if (!settings.nikud) return false;
      insertNikud(mark, afterInsert);
      return true;
    },
  }));
}

export function buildNikudBar(afterInsert: () => void): HTMLElement {
  return el("div", { id: "nikud-bar", class: "nikud-bar", role: "group", "aria-label": t("nikud"), "data-i18n-label": "nikud" }, [
    ...NIKUD.map(([mark, nameKey, key]) =>
      el(
        "button",
        {
          class: "nikud-btn",
          type: "button",
          // The shortcut is on the button, because a shortcut nobody can find
          // is the same as no shortcut.
          title: `${t(nameKey)} · ${key.replace("Alt-", "Alt+")}`,
          "aria-label": `${t(nameKey)} · ${key.replace("Alt-", "Alt+")}`,
          // A composed sentence, so it needs a template and its parts. The chord
          // is a literal — `Alt+a` is `Alt+a` in either language — and the leading
          // `:` says the other half is a key. See `localise`.
          "data-i18n-both": "msg.shortcut",
          "data-i18n-both-args": JSON.stringify([`:${nameKey}`, key.replace("Alt-", "Alt+")]),
          onClick: () => insertNikud(mark, afterInsert),
        },
        [
          el("span", { class: "nikud-glyph", "aria-hidden": "true" }, ["א" + mark]),
          el("span", { class: "nikud-key", "aria-hidden": "true" }, [key.replace("Alt-", "")]),
        ],
      ),
    ),
    el("span", { class: "nikud-hint", "data-i18n": "nikudHint" }, [t("nikudHint")]),
  ]);
}
