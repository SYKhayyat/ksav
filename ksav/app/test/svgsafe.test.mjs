// The SVG allow-list, and the three ways it can be wrong.
//
// # The finding
//
// Issue #53: every page of every preview reached the document through
// `host.innerHTML = svg` — three sites, no sanitizer, no allow-list — and
// `flattenGlyphs` made it sharper by rewriting `<use>` into `<path>` with
// **string surgery**, keeping every attribute the `<use>` carried. A string
// assigned to `innerHTML` is parsed as markup in the serve origin, so every
// attribute on it was a decision the application had to get right and had not.
//
// `svgsafe.ts` is the answer: a pure filter over the string, called at the three
// sites before anything reaches `innerHTML`.
//
// # What is pinned here, and why each of the three is a different failure
//
//   1. **A payload does not survive.** The obvious assertion, and the one that
//      does nothing on its own: a sanitizer that dropped *everything* passes it.
//   2. **A page survives intact.** The assertion that gives (1) its meaning, and
//      the one that is not hypothetical — the measured vocabulary contains `a`,
//      because Typst emits an `<a>` with a transparent `<rect>` and no `href` for
//      a link's hit area. An allow-list written by reading an SVG file drops
//      `<a>`, and then every link in every document disappears with nothing in
//      the suite able to see it. So the fixture below is built from the measured
//      vocabulary and the assertion is **identity**: the filter changes nothing
//      at all.
//   3. **The two lists cannot disagree silently.** `engine/tests/svg_output.rs`
//      owns the measurement and asserts the engine never emits a refused name; the
//      half that can be checked here is that this side's copies of the measured
//      lists are the generated ones, so a widened vocabulary cannot be reached
//      round the generator.
//
// Mutation lives in the input strings, which are the whole attack surface here
// and need no DOM — `test/harness.mjs` installs none on purpose, and a sanitizer
// whose fence needs a browser is a fence that gets skipped.

import { check, ok, notOk } from "./harness.mjs";
import {
  DENIED_SVG_ELEMENTS,
  SAFE_SVG_ATTRIBUTES,
  SAFE_SVG_ELEMENTS,
  sanitizeSvg,
} from "../.tmp-test/svgsafe.mjs";
import { SVG_ATTRIBUTES, SVG_ELEMENTS } from "../.tmp-test/svg-vocabulary.gen.mjs";

/** A page built from the measured vocabulary, so (2) is an identity claim. */
function measuredPage() {
  const attrs = SVG_ATTRIBUTES.map((a) => ` ${a}="1"`).join("");
  const body = SVG_ELEMENTS.filter((e) => e !== "svg")
    .map((e) => (e === "a" || e === "use" || e === "image" ? `<${e}><rect width="1" height="1"/></${e}>` : `<${e} width="1" height="1"/>`))
    .join("");
  return `<svg viewBox="0 0 10 10" width="10pt" height="10pt"${attrs}>${body}</svg>`;
}

export function run() {
  // ------------------------------------------------------- 2. a page survives
  //
  // Run first, because it is the assertion that makes the others mean anything,
  // and because it is the one that fails the day somebody edits the list by hand.
  {
    const page = measuredPage();
    const { safe, report } = sanitizeSvg(page);
    check("a page built from the measured vocabulary comes through unchanged", safe, page);
    check("…and nothing is reported dropped", report.dropped, []);
  }

  // A real page's own shapes, spelled out. The measured one above covers the
  // *names*; this covers the two constructs a hand-rolled scanner gets wrong, and
  // both are things the engine emits on every page.
  {
    const page =
      '<svg xmlns="http://www.w3.org/2000/svg" width="595pt" height="842pt" viewBox="0 0 595 842" overflow="hidden">' +
      '<defs><clipPath id="c0"><rect x="0" y="0" width="10" height="10"/></clipPath>' +
      '<symbol id="gABC" overflow="visible"><path d="M0 0 L1 1 Z" fill="#000" fill-rule="nonzero"/></symbol></defs>' +
      '<g transform="translate(147.98 70.34)"><use xlink:href="#gABC" x="0" y="0" fill="#000000" fill-rule="nonzero"/></g>' +
      '<a transform="translate(511 741)"><rect width="2.89" height="11.5" fill="transparent" stroke="none"/></a>' +
      '<image xlink:href="data:image/png;base64,AAA=" width="30" height="30" preserveAspectRatio="none"/>' +
      "</svg>";
    const { safe, report } = sanitizeSvg(page);
    check("a real page's own shapes come through unchanged", safe, page);
    check("…including the link hit-area", /<a transform=/.test(safe), true);
    check("…and the image", /<image xlink:href="data:image\/png;base64,AAA="/.test(safe), true);
    check("…and the symbol's path data, commas and all", /M0 0 L1 1 Z/.test(safe), true);
    check("…nothing reported", report.dropped, []);
  }

  // ------------------------------------------------------- 1. a payload dies
  {
    // The classic, and the one `innerHTML` made real.
    const hostile = [
      '<script>window.pwned = 1</script>',
      '<rect onload="window.pwned=1" width="1" height="1"/>',
      '<rect ONLOAD="window.pwned=1" width="1" height="1"/>',
      '<foreignObject width="10" height="10"><body>x</body></foreignObject>',
      '<image xlink:href="javascript:window.pwned=1" width="1" height="1"/>',
      '<image href="JaVaScRiPt:window.pwned=1" width="1" height="1"/>',
      '<image xlink:href="data:text/html;base64,PHNjcmlwdD4=" width="1" height="1"/>',
      '<a href="javascript:window.pwned=1"><rect width="1" height="1"/></a>',
      '<animate attributeName="href" values="javascript:window.pwned=1"/>',
      '<use xlink:href="#g" onerror="window.pwned=1"/>',
      '<style>*{background:url(javascript:window.pwned=1)}</style>',
      '<iframe src="javascript:window.pwned=1"></iframe>',
    ];
    for (const payload of hostile) {
      const page = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${payload}</svg>`;
      const { safe, report } = sanitizeSvg(page);
      const lowered = safe.toLowerCase();
      notOk(
        `no script survives: ${payload.slice(0, 44)}`,
        lowered.includes("<script") || lowered.includes("javascript:") || lowered.includes("<iframe") || lowered.includes("<style"),
      );
      notOk(
        `no event handler survives: ${payload.slice(0, 44)}`,
        /\son[a-z]+\s*=/.test(lowered),
      );
      notOk(
        `no foreign object survives: ${payload.slice(0, 44)}`,
        lowered.includes("foreignobject"),
      );
      // And it must be *reported*, not silently dropped: a sanitizer that
      // refuses things without saying so is indistinguishable from one that is
      // broken.
      ok(
        `and it says what it refused: ${payload.slice(0, 30)}`,
        report.dropped.length > 0,
      );
      // The root element always survives, so a preview pane is never emptied by
      // a payload in the middle of a page.
      ok(`the page still has a root: ${payload.slice(0, 30)}`, safe.startsWith("<svg"));
    }
  }

  // The `data:image/svg+xml;base64,` case is the one that must **not** be
  // refused, and the reason is a measurement rather than a preference: it is how
  // Typst emits every SVG image a sefer contains. Refusing it would blank every
  // image in every document, which is a louder failure than the one being guarded.
  {
    const { safe } = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
        '<image xlink:href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" width="8" height="8"/>' +
        "</svg>",
    );
    ok("an SVG image is base64 data and stays", safe.includes("data:image/svg+xml;base64,"));
  }

  // The scanner's own edge cases, because a filter that mis-reads its input is a
  // filter whose failure is unpredictable.
  {
    // A `>` inside an attribute value must not end the tag early: read naively,
    // this drops everything after it and leaves a half-open element.
    const { safe } = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L1 1" fill="a>b" onload="x"/></svg>',
    );
    ok("a > inside a value does not end the tag", safe.includes('fill="a&gt;b"'));
    notOk("…and the handler after it is still refused", safe.includes("onload"));

    // A comment cannot smuggle a tag, and a CDATA section is dropped rather than
    // copied: the engine emits neither, and a CDATA section is a way of writing
    // markup that no reader of this string is looking for.
    const { safe: c } = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><!-- <script>x</script> --><rect width="1" height="1"/></svg>',
    );
    notOk("a comment does not become markup", c.includes("script"));
    ok("…and the rest of the page survives", c.includes("<rect"));
    const { safe: d } = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><![CDATA[<script>x</script>]]><rect width="1" height="1"/></svg>',
    );
    notOk("a CDATA section is dropped, not copied", d.includes("script"));

    // An unterminated tag drops the rest rather than guessing.
    const { safe: u, report } = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" onload="x"',
    );
    notOk("an unterminated tag does not emit half of itself", u.includes("onload"));
    ok("…and is reported", report.dropped.includes("unterminated-tag"));

    // Text passes through verbatim, and a bare `&` is not mangled: Typst escaped
    // the text on the way out and re-escaping it here would show the reader
    // `&amp;` where the document says `&`.
    const { safe: t } = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><text x="1" y="2">שלום &amp; עולם</text></svg>',
    );
    ok("text passes through as it was written", t.includes("שלום &amp; עולם"));
  }

  // ------------------------------------------ 3. the lists agree with themselves
  {
    // The generated lists are the measured ones, so the copies here cannot have
    // been widened by hand round the generator.
    for (const name of SVG_ELEMENTS) {
      ok(`${name} is allowed`, SAFE_SVG_ELEMENTS.has(name));
    }
    for (const name of SVG_ATTRIBUTES) {
      ok(`${name} is allowed`, SAFE_SVG_ATTRIBUTES.has(name));
    }
    // And nothing is on both lists, which is the only way a name could be
    // refused and permitted at once depending on which set is asked first.
    for (const name of DENIED_SVG_ELEMENTS) {
      notOk(`${name} is not also allowed`, SAFE_SVG_ELEMENTS.has(name));
    }
    // The floors. An allow-list that emptied passes every payload assertion
    // above, because refusing everything refuses every payload.
    ok(`elements: ${SAFE_SVG_ELEMENTS.size}`, SAFE_SVG_ELEMENTS.size >= 8);
    ok(`attributes: ${SAFE_SVG_ATTRIBUTES.size}`, SAFE_SVG_ATTRIBUTES.size >= 15);
    ok(
      "the link hit-area is allowed, or every link in every document disappears",
      SAFE_SVG_ELEMENTS.has("a"),
    );
  }
}
