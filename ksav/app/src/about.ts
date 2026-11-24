// About: the version, where to report a problem, and the notices Ksav owes.
//
// Drawn in the backstage's About section (#233, §6) — its one home. It used to
// close the settings drawer, which made the licence notice a thing found by
// scrolling past two hundred preferences.

import { el } from "./dom";
import { t } from "./i18n";
import * as update from "./update";
import { BUNDLED_NOTICES } from "./engine.gen";

/**
 * The licence notice, in the app.
 *
 * Not decoration and not a nicety. Six font files are compiled into the engine,
 * so every way Ksav is distributed — the installers, the server binary, and the
 * ~23 MB wasm module the browser build downloads — is a redistribution of them.
 * Both the SIL OFL and the GUST licence require their notice to accompany a
 * redistribution, and a web build has no installer to put a text file beside.
 * So the notice lives where the software is.
 *
 * The facts themselves come from `engine/src/notices.rs`, which sits beside the
 * `include_bytes!` lines that create the obligation and is tied to them by a
 * test in both directions. This was the fourth hand-kept copy of them — after
 * the Markdown, the licence texts and the font list — and the failure mode of a
 * fourth copy of a licence notice is a licence violation on every download,
 * arriving quietly, with a green test suite.
 */
const BUNDLED_FONT_NOTICES = BUNDLED_NOTICES.filter((n) => n.kind === "font");

/**
 * The lexicon notices, for the same reason as the fonts.
 *
 * `lexicon-en.txt` is a word list derived from the English Speller Database, and
 * ESDB's licence covers derived word lists explicitly: the copyright and
 * permission notice must appear in all copies. The list is compiled into the
 * engine with `include_str!`, so every binary and the wasm module are copies.
 * The Hebrew lexicon needs no notice — it is built from Public Domain text — and
 * it is named here anyway, because "which dictionaries is this thing using" is a
 * fair question and the answer should not be half an answer.
 */
const BUNDLED_LEXICON_NOTICES = BUNDLED_NOTICES.filter((n) => n.kind === "lexicon");

/**
 * Where a problem is reported, and why it is a *link with the address showing*.
 *
 * The plan's last product item asks for "a way to send feedback from inside the
 * app, or a clear link to it", and a link is what this application can honestly
 * offer: there is no crash reporter, no telemetry, and nothing that sends a
 * document anywhere. What a report needs — what happened, what was expected, the
 * version, and the document when the document is the trigger — is all in the
 * writer's hands and none of it is here.
 *
 * The address is the anchor's *text*, not the word "here". Two reasons, and the
 * second is the one that decided it: a URL that is visible can be typed or copied
 * when clicking does nothing, and a webview is exactly where a click may do
 * nothing (#202's open half is when the shell hands a URL to the system). A
 * sentence pointing at "the address below" is a promise the file keeps on paper
 * and on screen.
 */
const ISSUES_URL = "https://github.com/SYKhayyat/ksav/issues";

function buildFeedbackRows(): Node[] {
  return [
    el("h3", { style: "margin-top:18px" }, [t("feedbackTitle")]),
    el("div", { class: "set-note" }, [t("feedbackNote")]),
    el("div", { class: "font-notice" }, [
      // The same attributes as the licence notices below it, for the same
      // reason: a document that cannot navigate the app must not be able to, and
      // this one is ours.
      el("a", { href: ISSUES_URL, target: "_blank", rel: "noopener noreferrer" }, [
        ISSUES_URL.replace(/^https:\/\//, ""),
      ]),
    ]),
    el("div", { class: "set-note" }, [`${t("version")} ${update.CURRENT_VERSION}`]),
  ];
}

export function buildAbout(): Node[] {
  return [
    ...buildFeedbackRows(),
    el("h3", { style: "margin-top:18px" }, [t("aboutTitle")]),
    el("div", { class: "set-note" }, [t("aboutLicence")]),
    el("div", { class: "set-note" }, [t("aboutFonts")]),
    ...BUNDLED_FONT_NOTICES.map(noticeRow),
    el("div", { class: "set-note" }, [t("aboutLexicons")]),
    ...BUNDLED_LEXICON_NOTICES.map(noticeRow),
  ];
}

function noticeRow(n: { name: string; copyright: string; licence: string; url: string }): HTMLElement {
  return el("div", { class: "font-notice" }, [
    el("b", {}, [n.name]),
    el("span", {}, [n.copyright]),
    el("a", { href: n.url, target: "_blank", rel: "noopener noreferrer" }, [n.licence]),
  ]);
}
