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
  loadBody(want);
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
import { makeWiring } from "./wiring";
import { docTextOf } from "./spans";
import * as runtime from "./runtime";
import { docConfig, type Field, type ValueOf } from "./settings";
import { loadBody, newDoc } from "./docswitch";
import { el } from "./dom";
import { voidAction } from "./asyncaction";
import { templatesForMenu, loadTemplate } from "./templates";
import { overlayPanel, panelHead, panelLede, mountPanel, closePanel } from "./panels";

/**
 * What the starter borrows from the shell: the setting write that follows an
 * interface-language change onto a document that has not been touched yet.
 * The body swap is a direct import — docswitch owns it, and nothing cycles.
 */
export interface StarterWiring {
  setSetting<K extends Field>(key: K, value: ValueOf<K>): void;
}

const W = makeWiring<StarterWiring>("wireStarter");
export const wireStarter = W.wire;
export const starterWiring = W.get;

// First-run welcome: shown once, offers a template or a blank start.
//
// Two things were wrong here and both were on the reader's very first screen.
//
// The template list was `.slice(0, 6)`. `templatesForMenu` sorts the interface's
// own language first, so in a Hebrew interface those six were all Hebrew and the
// four cut were `letter-en`, `article-en`, `kesubah` and `get` — an English
// writer's first screen, in a program whose README opens *"it works equally for
// left-to-right English documents"*, offered six Hebrew templates and no way to
// see there were others. All ten now show, in two labelled groups with the
// interface's language first, so the other language is visibly present rather
// than cut off the end of a list nobody knew was a list.
//
// And the button labelled *"start blank"* only closed the overlay. It set the
// onboarded flag and removed the dialog and never touched the document, so the
// reader's first act in the program was a button that lied: 323 characters of
// welcome document before the click and 323 after. The template buttons two lines
// up had always done `loadTemplate(tpl); dismissOnboard()`; this one was missing
// its half of that pair.
export function maybeOnboard() {
  if (localStorage.getItem("ksav.onboarded")) return;
  const lang = getLang();
  const all = templatesForMenu();
  const groups = [lang, lang === "he" ? "en" : "he"]
    .map((l) => ({ lang: l, items: all.filter((tpl) => tpl.lang === l) }))
    .filter((g) => g.items.length);
  // A template whose `lang` is neither is still a template; it goes in a last
  // group rather than off the screen.
  const rest = all.filter((tpl) => tpl.lang !== "he" && tpl.lang !== "en");
  if (rest.length) groups.push({ lang: "", items: rest });

  // Built through the same two constructors as every other modal, which is what
  // gives it the × and the dismissing backdrop it shipped without. It is
  // `mounted` rather than class-toggled — there is no welcome element in the
  // document until there is a reader to welcome — and `mountPanel` is what puts
  // the `open` class on it.
  const overlay = overlayPanel("welcome", "palette-box welcome-box", [
      panelHead("welcome", "welcomeTitle"),
      panelLede("welcomeBody"),
      ...groups.flatMap((g) => [
        el("div", { class: "welcome-group" }, [g.lang ? t("lang." + g.lang) : t("templates")]),
        el(
          "div",
          { class: "welcome-templates" },
          g.items.map((tpl) =>
            el(
              "button",
              {
                class: "welcome-tpl",
                lang: tpl.lang,
                // The label is the template's name in whichever language the
                // interface is in; the id is what it *is*. The acceptance run
                // starts from `sefer` and has to find it in either.
                "data-template": tpl.id,
                onClick: () => {
                  dismissOnboard();
                  voidAction("save_file", () => loadTemplate(tpl));
                },
              },
              [lang === "he" ? tpl.he : tpl.en],
            ),
          ),
        ),
      ]),
      el(
        "button",
        {
          class: "welcome-start",
          onClick: () => {
            dismissOnboard();
            newDoc();
          },
        },
        [t("welcomeStart")],
      ),
  ]);
  mountPanel("welcome", overlay, document.getElementById("app")!);
}

/**
 * Close the welcome overlay, however the writer chose to leave it.
 *
 * The "was it actually on screen" check that used to guard this by hand is now
 * `closePanel`'s, for every surface: Escape reaches all of them and Escape is
 * pressed constantly, so marking someone onboarded because they dismissed a
 * completion popup would be a lie told by a keystroke.
 */
function dismissOnboard() {
  closePanel("welcome");
}
