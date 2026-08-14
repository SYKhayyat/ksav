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
  currentPages,
  drawPages,
  hasPageLines,
  narrowPreview,
  pagesOfLines,
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

  // ------------------------------------------- what is on screen, and Print
  //
  // Two records of *the pages on screen*: `runtime.lastResult`, which is the
  // last thing the engine returned, and this one, which is the last thing that
  // was drawn. They agree until a compile fails — the engine returns
  // `pages_svg: []`, `compile.ts` stores it unconditionally and **skips the
  // redraw**, deliberately, so a writer mid-keystroke keeps looking at the last
  // good page rather than at a blank rectangle.
  //
  // Every consumer that wanted *the pages* and reached for `lastResult` then
  // got the empty one. Print is where that is worst: a blank sheet, silently,
  // on the one output that is paper.
  {
    // `FakeElement`, not `document.createElement` — a `document` on `globalThis`
    // convinces `@codemirror/view` it is in a browser and it reads half a DOM
    // off it at import time, which is why the harness installs one only for the
    // tests that need it. `drawPages` builds through its host element, so a
    // host is all this needs.
    const host = new globalThis.FakeElement("div");
    drawPages(host, ["<svg>one</svg>", "<svg>two</svg>"], ["h1", "h2"]);
    check("what was drawn is what is on screen", currentPages().length, 2);

    // The failed compile. Nothing is drawn, so nothing changes — which is the
    // whole of the fix: the record of the screen is only written by drawing.
    check("a failed compile does not empty the screen", currentPages().length, 2);
    ok("…and the pages are still the ones a reader can see",
      currentPages()[0].includes("one"));

    // An engine too old to send page names still records what it drew. This was
    // `null` without hashes, which is right for the second pane (it reuses the
    // windowing, and the windowing needs names) and wrong for Print.
    drawPages(host, ["<svg>only</svg>"]);
    check("pages without names are still on the screen", currentPages().length, 1);

    drawPages(host, [], []);
    check("and drawing nothing does empty it", currentPages().length, 0);
  }

  narrowedPreview();
}

/**
 * A preview holding the pages of one siman while the pane beside it holds the
 * sefer.
 *
 * Two halves, and the first is the whole decision: `pagesOfLines` takes what the
 * engine saw — which of the writer's lines printed on which page — and answers
 * which pages a stretch of the document reached. Everything else is drawing.
 */
function narrowedPreview() {
  const run = (from, to, file = null) => ({ file, from, to });
  // A four-page document. Page 3 carries a running head repeating line 2, which
  // is the case the whole "runs, not a range" design exists for.
  const LINES = [
    [run(1, 12)],
    [run(13, 30)],
    [run(2, 2), run(31, 44)],
    [run(45, 60)],
  ];

  check("a siman inside one page is one page", pagesOfLines(LINES, run(4, 9)), [0]);
  check("a siman that spans two pages is two", pagesOfLines(LINES, run(10, 20)), [0, 1]);
  check("the last page is reachable", pagesOfLines(LINES, run(50, 60)), [3]);

  // The heading that the running head repeats. Line 2 printed on page 1 and,
  // as a running head, on page 3 — and it says so. Collapsed to a minimum and a
  // maximum, page 3 would have claimed lines 2 through 44, and a siman anywhere
  // in that range would have dragged page 3 in behind it.
  check("a line repeated in a running head is on both its pages", pagesOfLines(LINES, run(2, 2)), [0, 2]);
  check(
    "…and the pages between them are not claimed by it",
    pagesOfLines(LINES, run(20, 22)),
    [1],
  );

  // A sefer that includes chapters is one compile of one concatenation, so the
  // same line numbers belong to different text. Without the file comparison
  // this is the pages of a chapter the pane is not narrowed to.
  const SEFER = [[run(1, 20, "פרק א.ksav")], [run(1, 20, "פרק ב.ksav")], [run(1, 20)]];
  check("lines are matched within their own file", pagesOfLines(SEFER, run(5, 8, "פרק ב.ksav")), [1]);
  check("…and the sefer's own lines are a third file again", pagesOfLines(SEFER, run(5, 8)), [2]);

  // Nothing printed. A real answer, and the one the pane has to say out loud:
  // an empty list drawn as "every page" would be a pane claiming to hold a
  // siman while showing the sefer.
  check("a siman that printed nowhere is no pages", pagesOfLines(LINES, run(300, 400)), []);

  // ------------------------------------------------------------- the drawing
  {
    const host = new globalThis.FakeElement("div");
    const pages = ["<svg>1</svg>", "<svg>2</svg>", "<svg>3</svg>", "<svg>4</svg>"];
    const hidden = () => host.children.map((c) => !!c.hidden);

    drawPages(host, pages, ["a", "b", "c", "d"], LINES);
    check("an un-narrowed preview hides nothing", hidden(), [false, false, false, false]);
    // The question `main.ts` asks before deciding whether narrowing has to make
    // the engine answer one. Asked of what was drawn, never of the last compile
    // — see `prohibitions.test.mjs`, where that is the rule rather than a note.
    ok("the runs belong to the pages that were drawn", hasPageLines());

    narrowPreview(host, run(13, 30), "סימן ב");
    check("a narrowed preview hides the pages its siman did not reach", hidden(), [
      true,
      false,
      true,
      true,
    ]);
    check("…and every page is still there to be numbered", host.children.length, 4);

    // The siman that printed nowhere. An empty answer must draw as *nothing*,
    // and the temptation is to treat it as "no information, show everything" —
    // which produces a pane holding the whole sefer under a strip naming one
    // siman, and no way for a reader to tell that from a working narrowing.
    narrowPreview(host, run(300, 400), "סימן שלא נדפס");
    check("a siman that printed nowhere draws no pages at all", hidden(), [true, true, true, true]);

    // The runs describe *those* pages. Switching documents draws a page set the
    // engine was never asked about, and hiding by the last document's simanim
    // would show a reader pages chosen by where the sections were in the sefer
    // they just left.
    narrowPreview(host, run(13, 30), "סימן ב");
    drawPages(host, ["<svg>other</svg>", "<svg>other</svg>"], ["x", "y"]);
    check(
      "a page set that arrives with no runs is not narrowed by the last one's",
      hidden(),
      [false, false],
    );
    notOk("…and the runs go with the pages they described", hasPageLines());

    drawPages(host, pages, ["a", "b", "c", "d"], LINES);
    narrowPreview(host, null);
    check("widening gives them back", hidden(), [false, false, false, false]);
  }

  // The same, without the observer. A webview too old to report what is on
  // screen draws every page at once through a different branch of `render`, and
  // that branch has to narrow too — a reader on an old build would otherwise get
  // the whole sefer in a pane that says it is holding one siman.
  {
    const had = globalThis.IntersectionObserver;
    delete globalThis.IntersectionObserver;
    try {
      const host = new globalThis.FakeElement("div");
      narrowPreview(host, run(31, 44), "סימן ג");
      drawPages(host, ["<svg>1</svg>", "<svg>2</svg>", "<svg>3</svg>", "<svg>4</svg>"], undefined, LINES);
      check(
        "an engine with no page names narrows as well",
        host.children.map((c) => !!c.hidden),
        [true, true, false, true],
      );
      narrowPreview(host, null);
      check("…and widens", host.children.map((c) => !!c.hidden), [false, false, false, false]);
    } finally {
      globalThis.IntersectionObserver = had;
    }
  }
}
