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
import { pointInPage, pixelInPage, isPlainClick } from "../.tmp-test/jump.mjs";
import { pageBox, pageAspect } from "../.tmp-test/preview.mjs";

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
}
