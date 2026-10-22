// ---------------------------------------------------------------- review
//
// The review drawer: the writer's marks (`#הוספה`/`#מחיקה`) and the editor's
// comments (`#הערת_עורך`) collected, read in a chosen view, and decided —
// `review.ts` owns what a mark *is*; this connects it to the document and the
// panel.
//
// This file refuses to answer for: the panel's rows and their reading
// (`panelviews.reviewPanel`, a pure view the tests build and press).

import * as review from "./review";
import * as panelviews from "./panelviews";
import * as runtime from "./runtime";
import { editDoc, closeMenus, jumpTo } from "./runtime";
import { t } from "./i18n";
import { docTextOf } from "./spans";
import { scheduleCompile } from "./compile";
import { isPanelOpen, openPanel } from "./panels";
import { insertSnippet } from "./insert";
import { typstString, typstContent } from "./typst-escape";
import * as styles from "./styles";
import { settings, saveSettings } from "./settings";
import { ask, askText } from "./formmodal";
// ---------------------------------------------------------------- review
//
// Tracked changes and editorial comments — the one thing anyone editing someone
// else's kisvei yad cannot do without. The marks are ordinary commands in the
// document (see review.ts); this is the panel that walks them and takes the
// decisions, plus the three buttons that make a mark in the first place.

/** Wrap the selection in a review mark. */
export function markReview(kind: "insert" | "delete") {
  const cmd = kind === "insert" ? "הוספה" : "מחיקה";
  const by = settings.reviewer?.trim();
  if (insertSnippet(by ? `#${cmd}(מאת: ${typstString(by)})[|]` : `#${cmd}[|]`)) scheduleCompile();
  if (isReviewOpen()) renderReviewPanel();
}

/**
 * Comment on the selection.
 *
 * The comment goes *after* the selected text rather than around it: a comment is
 * about the text, not a change to it, so wrapping would put the reader's words
 * inside the reviewer's mark.
 */
export async function addComment() {
  const text = await askText(t("commentPrompt"));
  if (!text) return;
  const by = settings.reviewer?.trim();
  const args = by ? `(מאת: ${typstString(by)})` : "";
  const at = runtime.view.state.selection.main.to;
  const call = `#הערת_עורך${args}[${typstContent(text)}]`;
  runtime.view.dispatch({ changes: { from: at, to: at, insert: call }, selection: { anchor: at + call.length } });
  runtime.view.focus();
  scheduleCompile();
  if (isReviewOpen()) renderReviewPanel();
}

export function isReviewOpen(): boolean {
  return isPanelOpen("review-panel");
}

export function openReview() {
  closeMenus();
  openPanel("review-panel");
}

/** Replace the whole document text (a decision rewrites the source). */
function replaceDoc(next: string) {
  const doc = docTextOf(runtime.view.state.doc);
  if (next === doc) return;
  editDoc(next);
  scheduleCompile();
  renderReviewPanel();
}

function decideMark(mark: review.ReviewMark, decision: review.Decision) {
  replaceDoc(review.decide(docTextOf(runtime.view.state.doc), mark, decision));
}

async function decideEverything(decision: review.Decision) {
  if (!(await ask(t(decision === "accept" ? "confirmAcceptAll" : "confirmRejectAll")))) return;
  replaceDoc(review.decideAll(docTextOf(runtime.view.state.doc), decision));
}

/** Which review runtime.view the document currently reads in. */
function reviewView(): review.ReviewView {
  const raw = styles.findStyleCall(docTextOf(runtime.view.state.doc), "review")?.args.get("תצוגה");
  return review.viewFromValue(styles.readString(raw));
}

function setReviewView(v: review.ReviewView) {
  const doc = docTextOf(runtime.view.state.doc);
  // The markup runtime.view is the default, so it is written as *no* command at all
  // rather than as a redundant one sitting at the top of every reviewed file.
  const next = styles.setStyleArgs(doc, "review", {
    "תצוגה": v === "markup" ? null : styles.typstString(review.VIEW_VALUE[v]),
  });
  replaceDoc(next);
}

export function renderReviewPanel() {
  const box = document.getElementById("review-body");
  if (!box || !runtime.view) return;
  box.replaceChildren(
    ...panelviews.reviewPanel(
      {
        marks: review.scanMarks(docTextOf(runtime.view.state.doc)),
        reading: reviewView(),
        reviewer: settings.reviewer ?? "",
      },
      {
        setReading: setReviewView,
        mark: markReview,
        comment: addComment,
        setReviewer: (name) => {
          settings.reviewer = name;
          saveSettings();
        },
        goTo: (m) => jumpTo(m.from),
        decide: decideMark,
        decideAll: decideEverything,
      },
    ),
  );
}