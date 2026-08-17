// The two halves of not redrawing a document that did not change.
//
// Measured in a browser on a 48-page sefer, before any of this existed: every
// pause in typing sent 9.7 MB, of which 40 KB was new, and spent 1227 ms writing
// all of it into the DOM — longer than the compile that produced it. Forty-seven
// of the forty-eight pages were byte-identical to what was already on screen.
//
// Two mechanisms close that, and both can be wrong in the same expensive way: by
// showing the reader a page that is no longer what their document says. So the
// assertions here are mostly about *staleness*, not about speed. A cache that is
// merely slow is a disappointment; a cache that is wrong is a bug the writer
// discovers when they print.

import { check, ok, notOk } from "./harness.mjs";
import { drawPages, drawCurrentInto, pageAspect, previewStyle, previewGeometry, KEEP_PAGES } from "../.tmp-test/preview.mjs";
import { CompileCache } from "../.tmp-test/api.mjs";

/** A `#preview`-shaped host from the harness's minimal DOM. */
function host() {
  const h = new globalThis.FakeElement("div");
  h.id = "preview";
  return h;
}

/** What each page node currently shows, in order. Empty string = an empty box. */
const shown = (h) => h.children.map((c) => c.innerHTML);

/** The observer created for the most recent host. */
const watcher = () => globalThis.IntersectionObserver.live[globalThis.IntersectionObserver.live.length - 1];

/** Report every page as on screen — the small-document case. */
const allVisible = (h) => watcher().report(() => true);

/** Report only pages `from..to` as on screen. */
const onlyVisible = (h, from, to) =>
  watcher().report((n) => {
    const i = Number(n.dataset.page);
    return i >= from && i <= to;
  });

export async function run() {
  // ------------------------------------------------------------ drawing pages

  {
    const h = host();
    drawPages(h, ["A", "B", "C"], ["a", "b", "c"]);
    check("a page box exists for every page", h.children.length, 3);
    check("they are pages", h.children.map((c) => c.className), ["page", "page", "page"]);
    // Nothing is drawn until something says it is on screen. This is the whole
    // saving: 48 pages of SVG in one scroller cost 1.3-2.7 s of layout and paint
    // per compile, and the reader can see two of them.
    check("nothing is drawn before the reader can see it", shown(h), ["", "", ""]);
    allVisible(h);
    check("what is on screen is drawn", shown(h), ["A", "B", "C"]);
  }

  {
    // The whole point: the same document again must cost nothing.
    const h = host();
    drawPages(h, ["A", "B", "C"], ["a", "b", "c"]);
    allVisible(h);
    const before = h.children.map((c) => c.writes);
    drawPages(h, ["A", "B", "C"], ["a", "b", "c"]);
    check("an unchanged document rewrites no page", h.children.map((c) => c.writes), before);
    check("and still shows the document", shown(h), ["A", "B", "C"]);
  }

  {
    // One page changed — the case that happens on every keystroke.
    const h = host();
    drawPages(h, ["A", "B", "C"], ["a", "b", "c"]);
    allVisible(h);
    const before = h.children.map((c) => c.writes);
    drawPages(h, ["A", "B!", "C"], ["a", "b2", "c"]);
    check("the changed page is redrawn", shown(h), ["A", "B!", "C"]);
    check("only the changed page is redrawn", h.children[1].writes, before[1] + 1);
    check("the page before it is untouched", h.children[0].writes, before[0]);
    check("the page after it is untouched", h.children[2].writes, before[2]);
  }

  {
    // Scrolling away used to empty a page, and scrolling back filled it again.
    // It does not any more, and that is the fix for the worst defect this
    // application had: writing one page into the DOM is 335 ms of layout, so
    // emptying eagerly meant paying it again in each direction every time the
    // reader crossed a page boundary. Keeping a page is now free — `.page` is
    // `content-visibility: auto`, so the browser skips a held page that is off
    // screen — and pages are given up only when there are too many of them.
    //
    // What must still be true is the thing the cache is *for*: a page nobody is
    // near is not redrawn because a compile happened, and a reader who comes
    // back gets what the document says now rather than what it said when they
    // left.
    const h = host();
    drawPages(h, ["A", "B", "C"], ["a", "b", "c"]);
    allVisible(h);
    onlyVisible(h, 0, 0);
    check("a page the reader left keeps its drawing", shown(h), ["A", "B", "C"]);
    // The document changes while pages 2 and 3 are out of sight.
    const before = h.children.map((c) => c.writes);
    drawPages(h, ["A", "B!", "C"], ["a", "b2", "c"]);
    check("an off-screen page is not redrawn just because it changed", h.children[1].writes, before[1]);
    check("so it is still holding what it held", shown(h)[1], "B");
    onlyVisible(h, 0, 2);
    check("and it comes back current, not stale", shown(h), ["A", "B!", "C"]);
    ok("coming back cost exactly one write", h.children[1].writes === before[1] + 1);
  }

  {
    // The cap. Pages are kept because keeping is free, but "free" is not
    // "unbounded": a 300-page sefer scrolled end to end would otherwise hold
    // every page it ever drew. Past `KEEP_PAGES` the furthest from the reader
    // are let go, which is the only reason a page is ever emptied now.
    const n = KEEP_PAGES + 6;
    const pages = Array.from({ length: n }, (_, i) => `p${i}`);
    const hashes = Array.from({ length: n }, (_, i) => `h${i}`);
    const h = host();
    drawPages(h, pages, hashes);
    allVisible(h);
    const held = shown(h).filter((s) => s !== "").length;
    check("a pane never holds more pages than the cap", held, KEEP_PAGES);
    // And what it let go of is the far end, not the near one. With no layout to
    // measure — these nodes have never been on a screen — distance is page
    // order, so the pages it keeps are the first ones.
    check("the pages it kept are the ones nearest the reader", shown(h)[0], "p0");
    check("and the ones it let go are the furthest", shown(h)[n - 1], "");
  }

  {
    // Every box is sized from its own page, so filling one in moves nothing.
    const h = host();
    const a4 = '<svg class="typst-doc" viewBox="0 0 595.28 841.89" width="595.28pt">x</svg>';
    const wide = '<svg class="typst-doc" viewBox="0 0 841.89 595.28" width="841.89pt">y</svg>';
    drawPages(h, [a4, wide], ["a", "b"]);
    ok("a portrait page reserves a portrait box", Number(h.children[0].style.aspectRatio) < 1);
    ok("a landscape page reserves a landscape box", Number(h.children[1].style.aspectRatio) > 1);
    check("A4 is read from the page itself", +pageAspect(a4).toFixed(3), +(595.28 / 841.89).toFixed(3));
    check("an unreadable page falls back to A4", +pageAspect("<svg>?</svg>").toFixed(3), +(210 / 297).toFixed(3));
  }

  {
    // A document that grew. The new page must appear and the old ones must not
    // be rewritten on its account.
    const h = host();
    drawPages(h, ["A", "B"], ["a", "b"]);
    allVisible(h);
    const before = h.children.map((c) => c.writes);
    drawPages(h, ["A", "B", "C"], ["a", "b", "c"]);
    allVisible(h);
    check("a new page is appended", shown(h), ["A", "B", "C"]);
    check("the pages that were there are untouched", h.children.slice(0, 2).map((c) => c.writes), before);
  }

  {
    // A document that shrank. The extra node has to go, or the reader is left
    // looking at a page their document no longer has.
    const h = host();
    drawPages(h, ["A", "B", "C"], ["a", "b", "c"]);
    allVisible(h);
    drawPages(h, ["A", "B"], ["a", "b"]);
    check("a page the document lost is removed", shown(h), ["A", "B"]);
    check("and nothing is left behind it", h.children.length, 2);
    check("and it is no longer watched", watcher().watching.size, 2);
  }

  {
    // Pages that moved: same names, different order. Matching by *position* is
    // what has to happen, because that is where they are on screen.
    const h = host();
    drawPages(h, ["A", "B"], ["a", "b"]);
    allVisible(h);
    drawPages(h, ["B", "A"], ["b", "a"]);
    check("reordered pages are redrawn in their new order", shown(h), ["B", "A"]);
  }

  {
    // Somebody else emptied the pane. The names have not changed, so every page
    // would be skipped as "already drawn" — and the reader would be looking at a
    // row of empty boxes with the status line saying it rendered.
    const h = host();
    drawPages(h, ["A", "B"], ["a", "b"]);
    allVisible(h);
    h.innerHTML = "";
    check("emptying the pane really empties it", h.children.length, 0);
    drawPages(h, ["A", "B"], ["a", "b"]);
    allVisible(h);
    check("an emptied pane is drawn again in full", shown(h), ["A", "B"]);
  }

  {
    // The full-screen preview draws the same pages rather than copying the other
    // pane's nodes — which would copy its windowing too, and show the reader a
    // row of empty boxes for everything they had not scrolled past.
    const pane = host();
    drawPages(pane, ["A", "B"], ["a", "b"]);
    onlyVisible(pane, 0, 0); // the reader has only seen the first page
    check("the pane is windowed", shown(pane), ["A", ""]);
    const modal = new globalThis.FakeElement("div");
    drawCurrentInto(modal);
    allVisible(modal);
    check("the full-screen view draws every page it is shown", shown(modal), ["A", "B"]);
  }

  {
    // No names to compare: fall back to what this always did.
    const h = host();
    drawPages(h, ["A", "B"], ["a", "b"]);
    drawPages(h, ["X", "Y"], undefined);
    check("with no page names, everything is drawn at once", shown(h), ["X", "Y"]);
    // …and the next named draw must not trust names from before the fallback.
    drawPages(h, ["P", "Q"], ["a", "b"]);
    allVisible(h);
    check("a named draw after a blind one still draws", shown(h), ["P", "Q"]);
  }

  // -------------------------------------------- what the pane is actually given
  //
  // `applyPreview` read `pane.clientWidth` to build a full geometry and then used
  // only the two parts that do not depend on it. Reading a layout property right
  // after writing the pages forces the browser to lay the whole preview out
  // before it will answer: **7690 ms** on a 48-page document, measured, on every
  // pause in typing. The property that keeps that fixed is this one — what the
  // pane is given must not change with how wide the pane happens to be.

  for (const dir of ["rtl", "ltr"]) {
    for (const fitWidth of [true, false]) {
      for (const zoom of [0.5, 1, 2.5]) {
        const style = previewStyle({ dir, fitWidth, zoom });
        // The same answer at a phone's width and at a wall display's.
        for (const paneWidth of [320, 680, 957, 3840]) {
          const g = previewGeometry({ paneWidth, dir, fitWidth, zoom });
          check(
            `${dir}/${fitWidth ? "fit" : "zoom"}/${zoom} at ${paneWidth}px: same width css`,
            g.pageWidthCss,
            style.pageWidthCss,
          );
          check(
            `${dir}/${fitWidth ? "fit" : "zoom"}/${zoom} at ${paneWidth}px: same direction`,
            g.direction,
            style.direction,
          );
        }
      }
    }
  }

  // ------------------------------------------------------- the request cache

  const NO_ASSETS = { assets: [], fonts: [] };
  /** A fake engine that answers with `pages`, omitting any the caller claims. */
  const engine = (pages, hashes) => {
    const sent = [];
    const send = async (payload) => {
      sent.push(payload);
      const have = new Set(payload.have_pages ?? []);
      return {
        ok: true,
        pages_svg: pages.map((p, i) => (have.has(hashes[i]) ? null : p)),
        pages_hash: hashes,
        pdf_base64: null,
        diagnostics: [],
        typst_source: "",
      };
    };
    return { send, sent };
  };

  {
    const cache = new CompileCache();
    const first = engine(["A", "B"], ["a", "b"]);
    const one = await cache.compile(first.send, NO_ASSETS);
    check("the first compile claims nothing", first.sent[0].have_pages, []);
    check("and gets the whole document", one.pages_svg, ["A", "B"]);

    // Second time round the client says what it has, and puts back what the
    // engine leaves out.
    const second = engine(["A", "B"], ["a", "b"]);
    const two = await cache.compile(second.send, NO_ASSETS);
    check("the next compile claims both pages", second.sent[0].have_pages.sort(), ["a", "b"]);
    check("and the result is still the whole document", two.pages_svg, ["A", "B"]);
    check("with one round trip", second.sent.length, 1);
  }

  {
    // The failure this must survive: the client claims a page it cannot produce.
    // It has to notice and ask again for everything, never hand back a gap.
    const cache = new CompileCache();
    await cache.compile(engine(["A"], ["a"]).send, NO_ASSETS);
    // An engine that omits a page the client never had — a stale claim, a
    // restarted client, a bug on either side. Either way: not the reader's
    // problem.
    const liar = {
      sent: [],
      send: async (payload) => {
        liar.sent.push(payload);
        const blind = (payload.have_pages ?? []).length === 0;
        return {
          ok: true,
          pages_svg: blind ? ["Z"] : [null],
          pages_hash: ["zzz"],
          pdf_base64: null,
          diagnostics: [],
          typst_source: "",
        };
      },
    };
    const out = await cache.compile(liar.send, NO_ASSETS);
    check("a page it cannot produce costs a second round trip", liar.sent.length, 2);
    check("and the retry claims nothing at all", liar.sent[1].have_pages, []);
    check("the reader gets a real page, not a hole", out.pages_svg, ["Z"]);
    notOk("and never a null", out.pages_svg.some((p) => p == null));
  }

  {
    // Assets still work the way they did, and the two caches do not interfere:
    // a dropped asset must not also throw away the pages.
    const cache = new CompileCache();
    const withImage = {
      assets: [{ name: "logo.png", hash: "h1", data: "AAA" }],
      fonts: [],
    };
    let round = 0;
    const sent = [];
    const send = async (payload) => {
      sent.push(payload);
      round++;
      return {
        ok: true,
        pages_svg: ["A"],
        pages_hash: ["a"],
        pdf_base64: null,
        diagnostics: [],
        typst_source: "",
        // The engine forgot the bytes the first time it was told about them.
        missing_assets: round === 1 ? ["h1"] : [],
      };
    };
    const out = await cache.compile(send, withImage);
    check("a forgotten asset is re-sent", sent.length, 2);
    ok("with its bytes", sent[1].assets[0].data === "AAA");
    check("and the pages survive the retry", out.pages_svg, ["A"]);
  }

  {
    // An html export carries no pages at all. Nothing here may choke on that.
    const cache = new CompileCache();
    const send = async () => ({
      ok: true,
      pages_svg: [],
      pdf_base64: null,
      diagnostics: [],
      typst_source: "",
      html: "<h1>שלום</h1>",
    });
    const out = await cache.compile(send, NO_ASSETS);
    check("an html result passes straight through", out.html, "<h1>שלום</h1>");
    check("with no pages", out.pages_svg, []);
  }
}
