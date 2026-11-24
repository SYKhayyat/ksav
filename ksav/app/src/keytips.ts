// Key tips (#233, step 8; `docs/ui-architecture.md` §8).
//
// Alt pressed and released alone, or F10, puts a letter on every tab and on
// File, `☰`, `⌃` and the title row's tools, and a digit on each Quick Access
// button. A letter opens that tab and puts letters on its buttons; Esc steps
// back a level, and from the tabs puts the caret back in the text.
//
// Two halves. `keyTips` is pure: it gives each label a tip, unique and
// prefix-free on its level, from the label's own letters. `wireKeyTips` reads
// the drawn shell — whose words are the placements' (`faceLabel`, `tabName`) —
// draws the tips over it, and takes the keyboard while they show.
//
// **Matched by physical key.** A tip is a letter in the interface language,
// and the key that types it is found by `event.code`, never `event.key`: the
// Hebrew tips are at their SI-1452 positions, so `ב` is the key that says C on
// it whichever layout is active, and an English tip works with Hebrew on.
// Final letters are never assigned — a writer looking for `ם` on the keyboard
// finds it, but a tip that has to be told from `מ` is a tip misread.

import { el } from "./dom";
import { getLang } from "./i18n";
import * as runtime from "./runtime";

/** The letters a tip can be in each interface language, in the order a free one is taken. */
const HE = "אבגדהוזחטיכלמנסעפצקרשת";
const EN = "abcdefghijklmnopqrstuvwxyz";

/** SI-1452: where each Hebrew letter is on the keyboard. Finals are left out, being never a tip. */
export const HE_CODE: Readonly<Record<string, string>> = {
  ק: "KeyE", ר: "KeyR", א: "KeyT", ט: "KeyY", ו: "KeyU", פ: "KeyP",
  ש: "KeyA", ד: "KeyS", ג: "KeyD", כ: "KeyF", ע: "KeyG", י: "KeyH", ח: "KeyJ", ל: "KeyK",
  ז: "KeyZ", ס: "KeyX", ב: "KeyC", ה: "KeyV", נ: "KeyB", מ: "KeyN", צ: "KeyM", ת: "Comma",
};

/** A final letter in a label stands for its letter: `שלום` offers `מ`. */
const FINAL: Readonly<Record<string, string>> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };

/** The tip alphabet of a language. */
export function alphabet(lang: string): string {
  return lang === "he" ? HE : EN;
}

/** The physical key that types `letter` (a letter, or a digit) in `lang`'s tips. */
export function codeOf(letter: string, lang: string): string {
  if (/^[0-9]$/.test(letter)) return "Digit" + letter;
  return lang === "he" ? HE_CODE[letter] : "Key" + letter.toUpperCase();
}

/** The tip letters a label offers, in its order, once each. */
function lettersOf(label: string, abc: string): string[] {
  const out: string[] = [];
  for (const ch of label.toLowerCase()) {
    const c = FINAL[ch] ?? ch;
    if (abc.includes(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

/** Greedy: each label its first letter, then its next free one, then any free one. */
function single(letters: readonly string[][], abc: string): string[] {
  const used = new Set<string>();
  const out = letters.map((ls) => {
    const c = ls.find((x) => !used.has(x));
    if (c) used.add(c);
    return c ?? "";
  });
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue;
    const c = [...abc].find((x) => !used.has(x))!;
    used.add(c);
    out[i] = c;
  }
  return out;
}

/**
 * A tip for each label: unique, and no tip the start of another, so a key
 * pressed is always either a whole tip or the first key of some.
 *
 * As many labels as the alphabet has letters get one letter each: the label's
 * first, then the next free one in it, then any free one. More than that (a
 * full Home tab, with every `⋯` and `⚙`) and the labels are bucketed by their
 * first letter, as Word does: a letter only one label starts with is that
 * label's tip, and a letter several start with is the first key of a two-key
 * tip for each of them. A label with no letter at all goes to a letter no label
 * starts with.
 */
export function keyTips(labels: readonly string[], lang: string = getLang()): string[] {
  const abc = alphabet(lang);
  const letters = labels.map((l) => lettersOf(l, abc));
  if (labels.length <= abc.length) return single(letters, abc);

  const buckets = new Map<string, number[]>();
  const loose: number[] = [];
  letters.forEach((ls, i) => (ls.length ? buckets.set(ls[0], [...(buckets.get(ls[0]) ?? []), i]) : loose.push(i)));
  const spare = [...abc].filter((c) => !buckets.has(c));
  // A bucket holds at most one tip per second key; what is over goes elsewhere.
  for (const members of buckets.values()) loose.push(...members.splice(abc.length));
  for (const i of loose) {
    // A letter nobody starts with, while one is left; then the smallest bucket.
    const c = spare.shift() ?? [...buckets.entries()].sort((a, b) => a[1].length - b[1].length)[0][0];
    buckets.set(c, [...(buckets.get(c) ?? []), i]);
  }
  const out: string[] = labels.map(() => "");
  for (const [first, members] of buckets) {
    if (members.length === 1) {
      out[members[0]] = first;
      continue;
    }
    // The second key: from the rest of each label's letters, then any free one.
    const seconds = single(
      members.map((i) => letters[i].filter((c) => c !== first)),
      abc,
    );
    members.forEach((i, k) => (out[i] = first + seconds[k]));
  }
  return out;
}

// ---------------------------------------------------------------- the drawn tips

/** Where the tips are: off, on the tab row, or on the open tab's buttons. */
type Level = "off" | "tabs" | "panel";

/** One target a tip opens: the element, and what pressing its tip does. */
interface Target {
  node: HTMLElement;
  tip: string;
}

let level: Level = "off";
let targets: Target[] = [];
/** The keys pressed so far toward a two-key tip. */
let typed = "";
let layer: HTMLElement | null = null;

/** Drawn and not hidden by itself or by anything around it. */
function visible(node: HTMLElement): boolean {
  if (node.closest("[hidden]")) return false;
  const r = node.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** The words a target is known by: what a screen reader hears, else what is written on it. */
function labelOf(node: HTMLElement): string {
  return (node.getAttribute("aria-label") || node.textContent || "").trim();
}

/** The tab row's targets: File, the tabs, `☰`, `⌃` and the title row's tools; Quick Access is numbered. */
function rowTargets(): Target[] {
  const lettered = [
    ...document.querySelectorAll<HTMLElement>(
      ".ribbon-head .ribbon-file, .ribbon-head .ribbon-tab, .ribbon-head .shell-menu-btn, .ribbon-head .ribbon-collapse, .title-row .title-tools button",
    ),
  ].filter(visible);
  const quick = [...document.querySelectorAll<HTMLElement>(".title-row .quick-access button")].filter(visible);
  const tips = keyTips(lettered.map(labelOf));
  return [
    ...quick.slice(0, 9).map((node, i) => ({ node, tip: String(i + 1) })),
    ...lettered.map((node, i) => ({ node, tip: tips[i] })),
  ];
}

/** The open tab's targets: every button and box drawn in its panel. */
function panelTargets(): Target[] {
  const panel = document.getElementById("ribbon-panel");
  if (!panel) return [];
  const nodes = [...panel.querySelectorAll<HTMLElement>("button, select")].filter(
    (n) => visible(n) && !n.closest(".menu-list"),
  );
  const tips = keyTips(nodes.map(labelOf));
  return nodes.map((node, i) => ({ node, tip: tips[i] }));
}

/** Draw `targets`' tips, each centred under its element, the ones not matching `typed` dimmed. */
function draw(): void {
  layer?.remove();
  layer = el(
    "div",
    { class: "keytips", "aria-hidden": "true", "data-level": level },
    targets.map(({ node, tip }) => {
      const r = node.getBoundingClientRect();
      return el(
        "span",
        {
          class: "keytip",
          "data-dim": String(!tip.startsWith(typed)),
          style: `left:${Math.round(r.left + r.width / 2)}px;top:${Math.round(r.bottom - 6)}px`,
        },
        [tip.toUpperCase()],
      );
    }),
  );
  document.body.append(layer);
}

function show(at: Level): void {
  level = at;
  typed = "";
  targets = at === "tabs" ? rowTargets() : at === "panel" ? panelTargets() : [];
  if (at === "off" || !targets.length) {
    level = "off";
    layer?.remove();
    layer = null;
    return;
  }
  draw();
}

/** The tips are showing. */
function keyTipsShown(): boolean {
  return level !== "off";
}

/** Put the tips away. `back` puts the caret back in the text, which is where Esc from the tab row goes. */
function hideKeyTips(back?: () => void): void {
  show("off");
  back?.();
}

/** What pressing `node`'s tip does: a tab opens and its buttons get tips; anything else is pressed. */
function press(node: HTMLElement, focusText: () => void): void {
  if (node.classList.contains("ribbon-tab")) {
    node.click();
    node.focus();
    show("panel");
    return;
  }
  show("off");
  if (node instanceof HTMLSelectElement) {
    node.focus();
    return;
  }
  node.click();
  // A menu it opened takes the keyboard; anything else hands it back to the text.
  const list = node.parentElement?.querySelector<HTMLElement>(".menu-list.open");
  const first = list?.querySelector<HTMLElement>("button, [role='menuitem']");
  if (first) first.focus();
  // A dialog or the backstage it opened has taken focus already; only a plain button leaves it on itself.
  else if (document.activeElement === node || document.activeElement === document.body) focusText();
}

/** The tip letter a physical key types in the interface language, or "" for none. */
export function letterOf(code: string, lang: string = getLang()): string {
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return digit[1];
  if (lang === "he") return Object.keys(HE_CODE).find((c) => HE_CODE[c] === code) ?? "";
  const m = /^Key([A-Z])$/.exec(code);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Take the keyboard while the tips show, and watch for Alt alone or F10.
 *
 * In the capture phase on the window, so ahead of the editor: a letter pressed
 * while the tips show is a tip, never a letter typed into the text. Wired when
 * the module is first imported (`main.ts` imports it for that), once.
 */
function wireKeyTips(focusText: () => void): void {
  /** Alt is down and nothing else has been pressed with it. */
  let altAlone = false;
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Alt") {
        altAlone = !e.repeat && !e.ctrlKey && !e.shiftKey && !e.metaKey;
        return;
      }
      altAlone = false;
      if (e.key === "F10" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (keyTipsShown()) hideKeyTips(focusText);
        else show("tabs");
        return;
      }
      if (!keyTipsShown()) return;
      // From here every key is the tips'.
      if (e.ctrlKey || e.metaKey || e.altKey) return hideKeyTips();
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        if (typed) {
          typed = "";
          draw();
        } else if (level === "panel") show("tabs");
        else hideKeyTips(focusText);
        return;
      }
      const c = letterOf(e.code);
      if (!c) return;
      const want = typed + c;
      const hit = targets.find((x) => x.tip === want);
      if (hit) return press(hit.node, focusText);
      if (targets.some((x) => x.tip.startsWith(want))) {
        typed = want;
        draw();
      }
      // A key that is no tip does nothing, as in Word: the tips stay.
    },
    true,
  );
  window.addEventListener(
    "keyup",
    (e) => {
      if (e.key !== "Alt" || !altAlone) return;
      altAlone = false;
      e.preventDefault();
      if (keyTipsShown()) hideKeyTips(focusText);
      else show("tabs");
    },
    true,
  );
  // A press anywhere, the window losing focus or changing size: the tips are put away.
  const away = () => {
    altAlone = false;
    if (keyTipsShown()) hideKeyTips();
  };
  // `pointerdown`, not `mousedown`: a handle that cancels the pointer (the splitter) suppresses the mouse events.
  window.addEventListener("pointerdown", away, true);
  window.addEventListener("blur", away);
  window.addEventListener("resize", away);
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") wireKeyTips(() => runtime.view?.focus());
