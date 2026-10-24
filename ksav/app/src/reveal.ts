// ---------------------------------------------------------------- reveal
//
// The other direction: the source says *here*, and the writer wants to know
// where on the page that is. A command and a click, one panel for the many
// answers, and the machinery is a thin layer over `preview.ts`'s pages and the
// engine's `reveal`/`places` services — the cost of an answer is a layout, so
// nothing here runs on a keystroke.
//
// This file refuses to answer for: where the pages are drawn (`preview.ts`),
// what a place *is* on the wire (`api.ts`), and the compile schedule.

import * as runtime from "./runtime";
import { setStatus } from "./runtime";
import { t, tf } from "./i18n";
import { el } from "./dom";
import { openPanel, closePanel } from "./panels";
import { printingAnchor } from "./deferred";
import { bodyOnScreen } from "./compile";
import { settings } from "./settings";
import { currentPages, pageBox } from "./preview";
import { drawMark, pixelInPage } from "./jump";
import { clamp01, matchFraction, clampScroll, cancelCaretFollow } from "./panescroll";
import { viewportFraction } from "./scrollmap";
import { docConfig } from "./settings";
import * as docs from "./docs";
import { voidAction } from "./asyncaction";
import * as api from "./api";
/**
 * The other direction: show where the cursor's text printed.
 *
 * A command rather than something that follows the caret, and the reason is
 * cost: answering means laying the whole document out, the same work a compile
 * does. Running that on every cursor movement would turn arrow keys into
 * compiles. Asked for, once, it is worth the wait — and this is the direction
 * that has no substitute, because a reader can at least *find* a word in the
 * source by eye, and cannot find a coordinate on a page at all.
 */
export async function revealCursor(opts: { quiet?: boolean; from?: number; anchor?: number } = {}): Promise<boolean> {
  const quiet = opts.quiet ?? false;
  if (!runtime.backend) return true;
  const pages = currentPages();
  if (!pages.length) {
    if (!quiet) setStatus(t("revealNoPages"), "warn");
    return true;
  }
  const { body, offset } = bodyOnScreen();
  const raw = runtime.view.state.selection.main.head;
  // A caret on a deferred note is a caret on a command, and a command prints
  // nothing — so the most obvious thing in the document to click, the footnote
  // marker, was the one thing this could not answer about. `printingAnchor`
  // hands back the prose that marker puts on the page; everywhere else it says
  // nothing and the caret speaks for itself.
  const head = printingAnchor(runtime.view.state.doc.toString(), raw) ?? raw;
  const line = runtime.view.state.doc.lineAt(head);
  if (!quiet) setStatus(t("revealWorking"));
  const points = await runtime.backend.reveal(
    body,
    docConfig(),
    // Back the other way through the same offset: the engine wants a line in the
    // body it is being sent, and this is a line in the writer's document.
    { line: line.number + offset, column: [...line.text.slice(0, head - line.from)].length + 1 },
    docs.requestAssets(runtime.currentDoc?.assets ?? []),
  );
  const at = points[0];
  const box = at ? pageBox(pages[at.page]) : null;
  if (!at || !box) {
    // Genuinely nothing to show: the cursor is in a comment, in a command's
    // arguments, or on text the layout dropped. Saying so beats a silent no-op,
    // because the writer pressed a key and is owed an answer — unless this was a
    // quiet reveal fired by a click, where a warning on every stray click is the
    // noise, not the help.
    if (!quiet) setStatus(t("revealNowhere"), "warn");
    return true;
  }
  const node = document.querySelector<HTMLElement>(`#preview .page[data-page="${at.page}"]`);
  if (!node) return true;
  // Land **the spot**, not the page it is on.
  //
  // This was `node.scrollIntoView({ block })`, where `node` is the whole `.page`
  // element — so having asked the compiler which glyph the caret printed as, and
  // having got back a point in Typst points, it centred a sheet of A4 and threw
  // the point away. On a full page the answer is wrong by up to a page height,
  // and it is wrong in a way that looks like it works: the right page arrives,
  // the mark is drawn on the right word, and the word is off-screen or halfway
  // up the pane depending on where it happened to sit on the sheet.
  //
  // `pixelInPage` is the inverse of the arithmetic that produced `at` in the
  // first place (`jump.ts`), and it goes through the drawn element's own
  // bounding box — which carries the zoom, the fit-to-width setting and the
  // device pixel ratio, so dividing by it cancels all three. The same reason
  // `drawMark` positions in percentages.
  const host = node.closest<HTMLElement>(".preview-host");
  if (host) {
    const spot = pixelInPage(at, node.getBoundingClientRect(), box);
    // Where in the *viewport* the writer wants it.
    //
    // Two answers, and which one is right depends on what asked. `match` is the
    // same top/middle/bottom the panes line up on everywhere else, so a writer
    // who set the match point to the middle gets the middle here too rather
    // than a second opinion — and it is what a *command* wants, since somebody
    // who pressed a key to be shown a thing wants it framed.
    //
    // `keep` is for a click, and only a click: it lands the answer at the same
    // height in this pane that the question was asked at in the other one, so
    // the eye does not have to travel. `from` is that height, and it is absent
    // for everything that is not a click — which is why `clickTarget` cannot
    // silently change what the reveal *command* does.
    const mp = opts.anchor !== undefined
      ? opts.anchor
      : settings.clickTarget === "keep" && opts.from !== undefined
        ? clamp01(opts.from)
        : matchFraction();
    // The page's offset inside the scroller, plus the point's offset inside the
    // page, minus where in the viewport it should sit.
    const pageTop = node.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop;
    host.scrollTo({
      top: clampScroll(pageTop + spot.y - mp * host.clientHeight, host),
      behavior: "smooth",
    });
  } else {
    // No scroller found — an arrangement this code does not know about. The page
    // is still the right page, so the old behaviour is the right fallback rather
    // than doing nothing.
    const block = settings.syncMatch === "top" ? "start" : settings.syncMatch === "bottom" ? "end" : "center";
    node.scrollIntoView({ block, behavior: "smooth" });
  }
  drawMark(node, at, box);
  if (!quiet)
    setStatus(
      points.length > 1 ? tf("revealFoundMany", points.length) : tf("revealFound", at.page + 1),
      "ok",
    );
  return true;
}

/**
 * Every place a line printed, as a list the writer picks from (#82).
 *
 * **The list beside the answer, not instead of it.** [`revealCursor`] goes to the
 * first place, because a cursor has one place to be and reading order is the
 * honest default; this is the gesture for the question the first-place answer
 * cannot express — *where else does this appear?* A part pulled in at two places
 * is not an exotic document, and until now there was no way to ask.
 *
 * The engine returns both the list and its own `first` (which is `line_of`, the
 * same one `reveal` uses), and the list is what is shown. Clicking a row moves the
 * caret there and closes, which is the whole of the interaction: no second
 * dialog, no mode.
 */
export async function revealPlaces(): Promise<boolean> {
  if (!runtime.backend) return true;
  const pages = currentPages();
  if (!pages.length) {
    setStatus(t("revealNoPages"), "warn");
    return true;
  }
  const { body, offset } = bodyOnScreen();
  const doc = runtime.view.state.doc;
  const head = runtime.view.state.selection.main.head;
  const line = doc.lineAt(head);
  setStatus(t("revealWorking"));
  // No `file:` sent, and that is deliberate. `reveal` does not send one either —
  // the engine resolves which part a line is in from the document, and a client
  // that decided for itself would be a second implementation of that question.
  // The answer echoes back the file it resolved, which is also what the chooser's
  // heading shows.
  const found = await runtime.backend.places(
    body,
    docConfig(),
    { line: line.number + offset, column: [...line.text.slice(0, head - line.from)].length + 1 },
    docs.requestAssets(runtime.currentDoc?.assets ?? []),
  );
  placesAnswer = found;
  openPanel("places-chooser");
  renderPlaces();
  return true;
}

/** The last answer, kept so the panel can re-render on a rebuild or a resize. */
export let placesAnswer: api.Places | null = null;

export function closePlaces() {
  closePanel("places-chooser");
}

/** What the chooser is showing, as data — separated from the DOM so it can be
 *  asserted, and so "is there anything to choose" is one line rather than a walk
 *  over buttons. */
function placesRows(answer: api.Places | null): { lines: number[]; one: boolean } {
  const lines = answer?.places ?? [];
  return { lines, one: lines.length <= 1 };
}

export function renderPlaces() {
  const list = document.getElementById("places-list");
  if (!list) return;
  const answer = placesAnswer;
  const subject = document.getElementById("places-subject");
  if (subject) {
    const where = answer?.file ?? t("mainBody");
    subject.textContent = answer ? `${where} · ${answer.line}` : "";
  }
  const { lines, one } = placesRows(answer);
  if (lines.length === 0) {
    // Nothing to choose is a **sentence**, not an empty list. The writer pressed
    // a key and is owed an answer, and "this line is not in a part" is a real
    // one — it means the line is the main body, which prints exactly once.
    setStatus(t("placesOnlyHere"), "");
    list.replaceChildren();
    return;
  }
  if (one) {
    // One place is not a choice, so the panel says so and does not offer a
    // single row to click — `revealCursor` already went there.
    setStatus(t("placesOnlyHere"), "");
  }
  list.replaceChildren(
    ...lines.map((line) =>
      el("button", {
        class: "row",
        type: "button",
        onClick: () => {
          closePlaces();
          revealToExpandedLine(line);
        },
      }, [el("span", { class: "row-main" }, [tf("placesRow", line)])]),
    ),
  );
}

/** Put the caret on a line of the **expanded** body and reveal it there.
 *
 * The engine's `places` are lines of the body it is sent, so the caret goes there
 * and `revealCursor`'s own machinery takes it the rest of the way — which is why
 * this is a call and not a copy: the translation from an expanded line back to the
 * writer's document is arithmetic with an offset in it, and a second copy of that
 * arithmetic is a second thing to be wrong.
 */
export function revealToExpandedLine(expandedLine: number) {
  const { offset } = bodyOnScreen();
  const doc = runtime.view.state.doc;
  const target = Math.max(1, expandedLine - offset);
  const line = doc.line(Math.min(target, doc.lines));
  runtime.view.dispatch({
    selection: { anchor: line.from },
    scrollIntoView: true,
  });
  runtime.view.focus();
  voidAction("general", () => revealCursor({ quiet: true }));
}

/**
 * Follow a click in the source into the preview.
 *
 * The reader clicks a word — or a footnote marker — and the page scrolls to
 * where it printed, the mirror of clicking the page to move the caret. It reuses
 * `revealCursor` (the caret is already where the click put it) but quietly: no
 * status line, no warning on a click that lands on a comment, because a click is
 * cheap to make by accident and a reveal that narrates every one is noise.
 *
 * Gated on synced scrolling being on and a preview being present, and debounced
 * so a double-click does not fire the layout twice.
 */
/**
 * How far down its own pane a click was made.
 *
 * Measured against the editor's scroller rather than the window, because in a
 * split the pane is not the screen — a click at the top of the lower of two
 * stacked sources is most of the way down the window and at the top of its pane,
 * and it is the pane the answer is about.
 */
export function clickFraction(e: MouseEvent): number | undefined {
  const pane = (e.target as HTMLElement | null)?.closest<HTMLElement>(".cm-scroller");
  if (!pane) return undefined;
  const box = pane.getBoundingClientRect();
  return viewportFraction(box.top, box.height, e.clientY);
}

let revealClickTimer = 0;
export function revealFromSourceClick(e?: MouseEvent) {
  if (settings.clickToPreview === false) return;
  if (!currentPages().length) return;
  // How far down its own pane the click was made, for `clickTarget: keep`.
  // Measured now and passed as a number rather than kept as an event, because
  // by the time the reveal fires the pane may have scrolled and the event's
  // coordinates would be about a viewport that has moved.
  const from = e ? clickFraction(e) : undefined;
  // A click also moves the caret, which schedules the cheap line-level follow.
  // The click gets the exact, glyph-level reveal instead — it asked for it — so
  // cancel the approximate one rather than let the preview jump twice.
  cancelCaretFollow();
  clearTimeout(revealClickTimer);
  revealClickTimer = window.setTimeout(() => voidAction("general", () => revealCursor({ quiet: true, from })), 120);
}
