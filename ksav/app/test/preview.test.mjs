// The preview pane's geometry, at the pane width where it was broken.
//
// Every number here is the one measured in a browser at 1366×768: the split gave
// `#preview` a `clientWidth` of 680 and the page drew at 860, so the pane was a
// horizontal scroller over an RTL document with its origin on the left. The
// assertion that matters is the last one in `run`: the beginning of a line has to
// be on screen before the reader touches anything, at every pane width, in either
// script, at every zoom.

import { check, ok, notOk } from "./harness.mjs";
import {
  PAGE_PX,
  PREVIEW_PAD,
  MAX_FIT,
  previewGeometry,
  visibleWindow,
  lineStartVisible,
} from "../.tmp-test/preview.mjs";

/** The 1366×768 laptop, in split view. Measured, not assumed. */
const LAPTOP_PANE = 680;
/** The developer's monitor, where this bug does not exist. */
const DESK_PANE = 957;

export async function run() {
  // ---------------------------------------------------------------- the bug

  // What the pane did before there was a fit control: a 860 px page in 680 px.
  const unfitted = previewGeometry({ paneWidth: LAPTOP_PANE, dir: "rtl", fitWidth: false, zoom: 1 });
  check("laptop, zoom 1: the page is 820 px", unfitted.pageWidth, PAGE_PX);
  check("laptop, zoom 1: content is 860 px", unfitted.contentWidth, PAGE_PX + PREVIEW_PAD * 2);
  ok("laptop, zoom 1: it overflows", unfitted.overflows);

  // And the fix for it: the pane reads the way the document reads, so the
  // scroller's origin is the edge a Hebrew line begins at.
  check("an RTL document gives an RTL pane", unfitted.direction, "rtl");
  check("the visible window ends at the content's right edge", visibleWindow(unfitted, LAPTOP_PANE), {
    from: 860 - 680,
    to: 860,
  });
  ok("so the start of the line is on screen", lineStartVisible(unfitted, LAPTOP_PANE, "rtl"));

  // The same page in an LTR document parks at the left, which is where an
  // English line starts. Same property, other script.
  const en = previewGeometry({ paneWidth: LAPTOP_PANE, dir: "ltr", fitWidth: false, zoom: 1 });
  check("an LTR document gives an LTR pane", en.direction, "ltr");
  check("its window starts at the content's left edge", visibleWindow(en, LAPTOP_PANE), { from: 0, to: 680 });
  ok("so the start of the line is on screen", lineStartVisible(en, LAPTOP_PANE, "ltr"));

  // ---------------------------------------------------------------- fit to width

  // The default. Word fits the page by default and that default is the reason
  // nobody ever meets this bug there.
  const fitted = previewGeometry({ paneWidth: LAPTOP_PANE, dir: "rtl", fitWidth: true, zoom: 1 });
  notOk("fitted: the laptop pane does not overflow", fitted.overflows);
  check("fitted: the page takes the pane", fitted.pageWidth, LAPTOP_PANE - PREVIEW_PAD * 2);
  check("fitted: the CSS reflows on its own", fitted.pageWidthCss, `min(100%, ${PAGE_PX * MAX_FIT}px)`);
  check("fitted: the whole page is visible", visibleWindow(fitted, LAPTOP_PANE), { from: 0, to: 680 });
  ok("fitted: the start of the line is on screen", lineStartVisible(fitted, LAPTOP_PANE, "rtl"));

  // A fit is not a licence to draw A4 at 400% on a wide monitor.
  const wide = previewGeometry({ paneWidth: 4000, dir: "rtl", fitWidth: true, zoom: 1 });
  check("fitted: capped at the zoom control's own ceiling", wide.pageWidth, PAGE_PX * MAX_FIT);
  notOk("fitted: and still does not overflow", wide.overflows);

  // A pane narrower than its own padding is a splitter dragged to the stop, not
  // an error.
  const squeezed = previewGeometry({ paneWidth: 12, dir: "rtl", fitWidth: true, zoom: 1 });
  check("fitted: a pane narrower than its padding clamps at zero", squeezed.pageWidth, 0);

  // ---------------------------------------------------------------- zoom still works

  const zoomed = previewGeometry({ paneWidth: DESK_PANE, dir: "rtl", fitWidth: false, zoom: 1.5 });
  check("zoom 1.5 draws 1230 px", zoomed.pageWidth, PAGE_PX * 1.5);
  check("and says so in CSS", zoomed.pageWidthCss, `calc(${PAGE_PX}px * 1.5)`);
  ok("and overflows the desk monitor too", zoomed.overflows);
  ok("and the line still starts on screen", lineStartVisible(zoomed, DESK_PANE, "rtl"));

  // The desk monitor at 100%, which is the configuration this bug hid behind.
  const desk = previewGeometry({ paneWidth: DESK_PANE, dir: "rtl", fitWidth: false, zoom: 1 });
  notOk("the desk monitor at 100% never overflowed", desk.overflows);

  // ---------------------------------------------------------------- the property
  //
  // Sweep every pane width a real window can give the preview, both scripts,
  // both fit modes, and the whole zoom range. Nothing may open over the end of a
  // line.
  let checked = 0;
  let bad = null;
  for (const paneWidth of [320, 480, 600, 680, 700, 840, 957, 1200, 1600, 1900]) {
    for (const dir of ["rtl", "ltr"]) {
      for (const fitWidth of [true, false]) {
        for (let zoom = 0.5; zoom <= 2.0001; zoom += 0.1) {
          const g = previewGeometry({ paneWidth, dir, fitWidth, zoom: Math.round(zoom * 10) / 10 });
          checked++;
          if (!lineStartVisible(g, paneWidth, dir)) bad = { paneWidth, dir, fitWidth, zoom };
        }
      }
    }
  }
  check(`the start of a line is on screen in all ${checked} configurations`, bad, null);
}
