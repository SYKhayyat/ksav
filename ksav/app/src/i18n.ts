// Bilingual UI strings. The whole app chrome flips between Hebrew (RTL) and
// English (LTR); the *document* direction is a separate setting.
//
// The dictionaries live in their own data-only modules so changing copy does
// not make this runtime module difficult to read or review.

import { EN } from "./i18n-en";
import { HE } from "./i18n-he";

export type Lang = "he" | "en";

type Dict = Record<string, string>;

/**
 * Both dictionaries, exported so a test can ask what is *in* one.
 *
 * `t` cannot answer that question: a key missing from Hebrew falls through to
 * English (below), which is the right behaviour for a running app — a writer sees
 * a word rather than `sc.hiddenBreak` — and useless for spotting the hole. In a
 * Hebrew-first application an English string quietly standing in for a Hebrew one
 * is a defect, not a fallback, so the thing that checks for it reads the shelves
 * and not the counter.
 */
export const DICTS: Record<Lang, Dict> = { he: HE, en: EN };

let current: Lang = "he";

export function setLang(l: Lang) {
  current = l;
}
export function getLang(): Lang {
  return current;
}
/**
 * Whether a string is a key in either dictionary.
 *
 * `t` falls back to returning the key, which is the right thing at a call site
 * and a trap at a *registration* site: `panelHead(id, t("notesPane"))` passed
 * the answer where the question belonged, and the panel then carried
 * `data-i18n="Notes"` — a title that looked right until somebody changed
 * language, and then stayed in the language it was born in. Asking here is what
 * turns that into an error at boot rather than a report from a writer.
 */
export function hasKey(key: string): boolean {
  return key in DICTS.he || key in DICTS.en;
}

export function t(key: string): string {
  return DICTS[current][key] ?? DICTS.en[key] ?? key;
}
/** `t` with `{0}`, `{1}`… substituted — for messages that name a file or size. */
export function tf(key: string, ...args: (string | number)[]): string {
  return t(key).replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m));
}
export function isRtlUi(): boolean {
  return current === "he";
}
