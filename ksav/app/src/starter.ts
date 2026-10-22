// ---------------------------------------------------------------- the starter
//
// The first screen. There are two of them, because there was only ever one and
// it was Hebrew: an English writer opened Ksav to a page of Hebrew they had to
// delete before they could type a word. That is the right default for a
// Hebrew-first tool and the wrong first impression for the other half of what it
// claims. The English one is its own document, not a translation — the two say
// the same three things about the product in the idiom of their own language.
const STARTER_HE = `#שער[ברוכים הבאים לכְּתָב]
#תת_שער[מערכת הכתיבה העברית · על גבי Typst אמיתי]

#קו_מפריד

#כותרת1[מבוא]

זהו עורך #הדגשה[כְּתָב]. כל פקודה כאן היא פונקציית Typst אמיתית, ולכן #נטוי[הקינון בלתי מוגבל] עובד מאליו — טבלה בתוך הערה בתוך כותרת בתוך רשימה, הכול מוצג נכון.

#רשימה(
  פריט[בחרו תבנית מתפריט #הדגשה[תבניות].],
  פריט[פתחו את #הדגשה[פקודות] עם Ctrl+K.],
  פריט[החליפו בין עברית לאנגלית, ומצב פרוזה, מלמעלה.],
)
`;

const STARTER_EN = `#title[Welcome to Ksav]
#subtitle[A Hebrew writing system, on real Typst]

#hrule

#h1[Getting started]

This is the #bold[Ksav] editor. Every command here is a real Typst function, so
#italic[nesting has no limit] — a table inside a footnote inside a heading inside
a list all typesets correctly, without anything special being done about it.

#bullets(
  item[Pick a starting point from the #bold[Templates] menu.],
  item[Open #bold[Commands] with Ctrl+K to see everything there is.],
  item[Switch between English and Hebrew, and prose mode, from the top bar.],
)

Hebrew and English can share a page: #rtl_[כתב עברי] sets right to left in the
middle of this sentence, and the spelling of both is checked.
`;

/** The first document, in the language of the interface it was opened in. */
export function starterDoc(): string {
  return getLang() === "en" ? STARTER_EN : STARTER_HE;
}

/**
 * Follow the interface language with the starter, while it is still the starter.
 *
 * The interface opens in Hebrew, because Ksav is Hebrew-first and that is the
 * right default. So an English writer's actual first move is to switch the
 * language — at which point choosing the starter "by interface language" at boot
 * has already happened and chosen Hebrew, and they are back to deleting a page
 * of Hebrew. Switching the language a second later has to bring the welcome text
 * with it or the English starter is a document almost nobody would ever see.
 *
 * The guard is exact equality with one of the two starters. The moment a writer
 * has typed a single character it is their document, and nothing here may touch
 * it — a "helpful" replacement of real text would be unforgivable, and there is
 * no undo across a document swap.
 */
export function swapUntouchedStarter() {
  const body = docTextOf(runtime.view.state.doc);
  const want = starterDoc();
  if (body === want || (body !== STARTER_HE && body !== STARTER_EN)) return;
  const dir = getLang() === "en" ? "ltr" : "rtl";
  if (docConfig().dir !== dir) starterWiring().setSetting("dir", dir);
  starterWiring().loadBody(want);
}
/**
 * CodeMirror's own words, in the language the rest of the window is in.
 *
 * The find/replace panel is the library's, and it shipped as the library wrote
 * it: `Find`, `Replace`, `next`, `previous`, `all`, `match case`, `regexp`,
 * `by word`, `replace all` — nine English labels in a right-to-left Hebrew
 * product, in the one panel a writer opens to look for a word in their sefer.
 * Every other surface here is translated; this one was never asked.
 *
 * `EditorState.phrases` is keyed on the library's own literals, which is why
 * `i18n.ts` carries them under a `find.` prefix rather than under names of our
 * own: a phrase table is a translation of somebody else's strings.
 */
export function searchPhrases(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const word of SEARCH_WORDS) out[word] = t(`find.${word}`);
  return out;
}

/** Every label CodeMirror's search panel puts on the screen. */
const SEARCH_WORDS = [
  "Find",
  "Replace",
  "next",
  "previous",
  "all",
  "match case",
  "regexp",
  "by word",
  "replace",
  "replace all",
  "close",
  "Go to line",
  "go",
] as const;

// This file refuses to answer for: the editor state the starter is poured into
// (`makeState`, main's notebook assembly) and the setting-write and body-swap
// it borrows when the language switch brings the welcome text with it.

import { getLang, t } from "./i18n";
import { docTextOf } from "./spans";
import * as runtime from "./runtime";
import { docConfig, type Field, type ValueOf } from "./settings";

/**
 * What the starter borrows from the shell: the editor's body swap (`loadBody`)
 * and the setting write that follows an interface-language change onto a
 * document that has not been touched yet.
 */
export interface StarterWiring {
  loadBody(body: string): void;
  setSetting<K extends Field>(key: K, value: ValueOf<K>): void;
}

let starterWiringInstance: StarterWiring | null = null;

/** Boot wires the starter's borrowings once. */
export function wireStarter(wiring: StarterWiring): void {
  starterWiringInstance = wiring;
}

export function starterWiring(): StarterWiring {
  if (!starterWiringInstance) {
    throw new Error("wireStarter was never called before the starter followed a language switch");
  }
  return starterWiringInstance;
}
