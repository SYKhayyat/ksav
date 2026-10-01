// The arithmetic on either side of the compiler's answer.
//
// The engine half of jump (`engine/src/jump.rs`) has its own tests and asks
// Typst the real question. This file covers the part that used to be wrong for
// a different reason: not a bad guess, but a coordinate transform with three
// separate chances to be off by something invisible.
//
//  1. **The scroll offset, counted twice.** The code this replaces added
//     `preview.scrollTop` to a `getBoundingClientRect` result, which already
//     reports where the element is *now*. On an unscrolled page that is right,
//     which is why it survived.
//  2. **RTL.** The preview pane reads right-to-left for a Hebrew document, so
//     any logical property — `inset-inline-start`, or a fraction measured from
//     "the start" — measures from the other edge. A page's own coordinates are
//     physical, always.
//  3. **Zoom and fit-to-width.** Neither appears anywhere in this module, and
//     that is the claim under test: the drawn rectangle carries both, so
//     dividing by it cancels both.

import { check, ok, notOk } from "./harness.mjs";
import { pointInPage, pixelInPage, isPlainClick, clickedChapter } from "../.tmp-test/jump.mjs";
import { pageBox, pageAspect } from "../.tmp-test/preview.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const APP = path.resolve(dirOf(import.meta.url), "..");

// A4 as Typst writes it into every page's `viewBox`.
const A4 = { width: 595.28, height: 841.89 };

export function run() {

  const near = (name, got, want, eps = 1e-6) =>
    ok(`${name} (got ${got}, want ${want})`, Math.abs(got - want) <= eps);

  // ------------------------------------------------------------------ the box

  check(
    "the page box is read out of the viewBox",
    JSON.stringify(pageBox('<svg viewBox="0 0 595.28 841.89" xmlns="...">')),
    JSON.stringify(A4),
  );
  check("a page with no header has no box", pageBox("<svg>"), null);
  check("and neither does one that is not there", pageBox(undefined), null);
  // `pageAspect` is the older reader and is now built on `pageBox`; the fallback
  // it has always promised has to survive that.
  near("a headerless page still falls back to A4's ratio", pageAspect("<svg>"), 210 / 297);

  // ------------------------------------------------------- a click, into points

  {
    // A page drawn 400 px wide at its A4 ratio, sitting 100 px right and 50 px
    // down from the viewport's corner.
    const rect = { left: 100, top: 50, width: 400, height: 400 * (A4.height / A4.width) };
    const mid = pointInPage(0, rect, A4, rect.left + rect.width / 2, rect.top + rect.height / 2);
    check("a click carries the page it was on", mid.page, 0);
    near("the middle of the page is the middle of the page", mid.x_pt, A4.width / 2, 1e-9);
    near("...in both directions", mid.y_pt, A4.height / 2, 1e-9);

    const corner = pointInPage(3, rect, A4, rect.left, rect.top);
    near("the top-left corner is the origin", corner.x_pt, 0);
    near("...in both directions", corner.y_pt, 0);
    check("and the page index is whatever it was given", corner.page, 3);

    notOk("a click above the page is not on it", pointInPage(0, rect, A4, 200, 10));
    notOk("nor is one to its left", pointInPage(0, rect, A4, 10, 200));
    notOk("nor one past its right edge", pointInPage(0, rect, A4, 600, 200));
    notOk("a page of no size has nothing under it", pointInPage(0, { left: 0, top: 0, width: 0, height: 0 }, A4, 0, 0));

    // The scroll position is *not* an input. Scrolling moves the rectangle, which
    // is the only thing that should change — the bug this replaces added the
    // scroll offset on top of a rectangle that had already moved.
    const scrolled = { ...rect, top: rect.top - 300 };
    const same = pointInPage(0, scrolled, A4, rect.left + 40, rect.top - 300 + 60);
    const before = pointInPage(0, rect, A4, rect.left + 40, rect.top + 60);
    near("scrolling the page does not move the point on it", same.y_pt, before.y_pt, 1e-9);
  }

  // --------------------------------------------------- neither zoom nor fitting

  {
    // The same click, at three sizes the fit and the zoom controls can produce.
    const at = (width) => {
      const rect = { left: 0, top: 0, width, height: width * (A4.height / A4.width) };
      // 30% across and 70% down, whatever the page is drawn at.
      return pointInPage(0, rect, A4, rect.width * 0.3, rect.height * 0.7);
    };
    const [small, medium, large] = [300, 820, 1640].map(at);
    near("a click 30% across means the same point at 820px as at 300px", medium.x_pt, small.x_pt, 1e-9);
    near("and at 200% zoom", large.x_pt, small.x_pt, 1e-9);
    near("...and down the page too", large.y_pt, small.y_pt, 1e-9);
    near("which is 30% of the paper", small.x_pt, A4.width * 0.3, 1e-9);
  }

  // ----------------------------------------------------- and back out to pixels

  {
    const rect = { width: 400, height: 400 * (A4.height / A4.width) };
    const back = pixelInPage({ page: 0, x_pt: A4.width / 4, y_pt: A4.height / 2 }, rect, A4);
    near("a quarter across the paper is a quarter across the drawing", back.x, rect.width / 4, 1e-9);
    near("and half way down is half way down", back.y, rect.height / 2, 1e-9);

    // Round trip: every point in, the same point out.
    for (const [fx, fy] of [[0, 0], [0.1, 0.9], [0.5, 0.5], [1, 1]]) {
      const p = pointInPage(0, { left: 12, top: 34, ...rect }, A4, 12 + fx * rect.width, 34 + fy * rect.height);
      const px = pixelInPage(p, rect, A4);
      near(`round trip x at ${fx}`, px.x, fx * rect.width, 1e-6);
      near(`round trip y at ${fy}`, px.y, fy * rect.height, 1e-6);
    }

    // Unclamped on purpose: a point past the margin is a real answer about a real
    // layout, and pinning it to the edge would claim the text is somewhere it is
    // not.
    const over = pixelInPage({ page: 0, x_pt: A4.width * 1.2, y_pt: -10 }, rect, A4);
    ok("a point past the right margin stays past it", over.x > rect.width);
    ok("and one above the page stays above it", over.y < 0);
  }

  // ------------------------------------------------------- click versus dragged

  ok("no selection at all is a plain click", isPlainClick(null));
  ok("a collapsed selection is a plain click", isPlainClick({ isCollapsed: true }));
  notOk("a dragged selection is not", isPlainClick({ isCollapsed: false }));

  // ------------------------------------------------------- which document
  //
  // A word printed on the page came out of *some* document, and in a sefer with
  // chapters that is not always the open one. This is the whole of #83's client
  // half, and it is here rather than inline in `main.ts` for the reason the rest
  // of this file is: `jumpFromClick` is not importable and a click cannot be
  // pressed from Node, so a decision made there is a decision nothing holds.
  //
  // `diagview.show` asks the same question for diagnostics and has answered it
  // correctly all along. One function, because the two answering it differently
  // is what let this sit unnoticed while the diagnostic path was right.

  check("the sefer's own text is not a chapter", clickedChapter(null, "ספר בראשית"), null);
  check("a named chapter is", clickedChapter("פרק ב", "ספר בראשית"), "פרק ב");

  // **`undefined` as well as `null`.** The engine sends `null`, but `readSpot`
  // normalises a missing key to `null` and a caller may hold a spot it built
  // itself. Three ways of saying "no chapter" would be three branches.
  check("an absent file is not a chapter", clickedChapter(undefined, "ספר בראשית"), null);
  check("and neither is an empty one", clickedChapter("", "ספר בראשית"), null);

  // The case that would otherwise open the *same* document by name: a chapter
  // whose title is the open document's. Opening the sefer instead is the smaller
  // surprise, and it means the ordinary case needs no branch of its own.
  check("a chapter named like the open document stays here", clickedChapter("פסחים", "פסחים"), null);
  check("an unnamed open document still yields a chapter", clickedChapter("פרק ב", null), "פרק ב");

  // And the answer is never the open document, whatever else it may be: this
  // function exists so that a caret is placed in the document the line is from.
  notOk(
    "the answer is never the open document's own name",
    ["פסחים", "בראשית"].some((t) => clickedChapter(t, t) === t),
  );

  // # And the caller actually asks
  //
  // A correct function nothing calls answers no question, which is **exactly what
  // `Located` was**: declared, documented with a comment saying the file "is not
  // decoration", and unreachable — `rg "Located" app/src` returned its own
  // declaration and nothing else. It stood for the whole time this bug was live,
  // reading like a contract.
  //
  // So the assertions above are necessary and not sufficient: they hold just as
  // happily while `jumpFromClick` goes on not asking. That is why this is here,
  // and it is the second time today a fence of mine passed while guarding nothing
  // — the first was an `indexOf` that found a function's *declaration* instead
  // of its call.
  {
    const src = readFileSync(path.join(APP, "src", "main.ts"), "utf8");
    // Comments stripped first, and on the same rule `prohibitions.test.mjs`
    // uses: a block comment must begin its own line, because `i18n.ts` holds a
    // `/*` inside a Hebrew string and a greedy strip deletes three hundred lines.
    // A sweep that silently eats the region it sweeps reports green — which is
    // the failure with the worst shape.
    const code = src
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gmu, "")
      .replace(/^\s*(\/\/|#).*$/gmu, "")
      .replace(/\s(\/\/|#)\s.*$/gmu, "");
    // A **floor**, not an exact count: the import is one occurrence and the call
    // is another, and a third is nobody's business.
    ok(
      "main.ts names it twice — imported and called",
      [...code.matchAll(/\bclickedChapter\b/g)].length >= 2,
      `${[...code.matchAll(/\bclickedChapter\b/g)].length} in stripped code`,
    );
    // And it is the click path that uses it, by handing the answer to the one
    // function that opens a chapter. Without this the two assertions above are
    // satisfied by a dead export.
    ok("…and the click path opens the chapter it named", /gotoPart\(\s*chapter\s*,/.test(code));
  }
}
