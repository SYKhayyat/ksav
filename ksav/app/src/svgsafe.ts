import { SVG_ATTRIBUTES, SVG_ELEMENTS } from "./svg-vocabulary.gen";

// The engine's SVG, filtered through an allow-list, as a pure function.
//
// # The finding
//
// Every page of every preview reached the document through `host.innerHTML = svg`
// — three sites, no sanitizer, no allow-list — and the issue's report was that any
// attribute a hostile payload could get into the engine's output would ride into
// the serve origin. `flattenGlyphs` made it sharper: it rewrites `<use>` into
// `<path>` by **string surgery**, keeping every attribute the `<use>` carried
// (`keep = rest.replace(…)`), so the one place the client's own code manufactures
// markup did it by copying whatever arrived.
//
// # What is *not* true, and is worth the space
//
// The obvious payload routes are already closed, and both were measured rather
// than assumed:
//
//   - **An SVG asset.** A `.ksav` can carry `image("logo.svg")` and an SVG can
//     carry `<script>`. Typst does not inline it — it emits
//     `<image xlink:href="data:image/svg+xml;base64,…">`. A base64 payload in an
//     `href` on an `<image>` is not script, and `innerHTML` parsing does not make
//     it one. The measurement: the engine *warns* about the foreign object, and
//     `grep -c script` over the emitted page is **0**.
//   - **Document text.** Typst escapes text content in SVG, so a document whose
//     body is `<script>alert(1)</script>` produces escaped text, not an element.
//
// So this is **hardening, not the close of a live hole** — and it is still worth
// doing, for the same reason `engine/tests/registry_wire.rs` exists for the
// command registry: a path that is safe today because of an upstream encoding
// decision is one Typst version from not being, and there is nothing here to
// notice when that happens. What is left is a closed thing you can read, rather
// than a reliance on somebody else's encoder.
//
// # Why a string filter and not `DOMParser`
//
// The first shape was "parse with `DOMParser`, build with `createElementNS`",
// which is structurally the best one: a name not on the list is never created.
//
// It is also **untestable here**, and that decided it. `test/harness.mjs` says so
// in so many words — a `document` on `globalThis` is enough to convince
// `@codemirror/view` it is in a browser, so the harness installs none, and the
// suite fakes the handful of nodes each module touches. A `DOMParser` here would
// need `linkedom` or `jsdom` as a new dependency, and the fence for a security
// property that only runs when a real DOM is present is a fence that is skipped
// wherever it is inconvenient.
//
// So: a pure function over a string, with no DOM, called at the three sites
// before anything reaches `innerHTML`. The property it offers is the one the
// finding asked for — **a name that is not on the list is never emitted** — and
// the property it gives up (no serialiser between the list and the parser) is
// covered by the rule that the *emitter* is this file, not `XMLSerializer`.

/**
 * Elements the engine emits — **measured**, not written down.
 *
 * From `svg-vocabulary.gen.ts`, which is generated from every template compiled
 * and every page scanned, because the list is a fact about Typst's exporter and
 * nobody can read it out of one SVG file. The measured set plus the handful of
 * text primitives below, which Typst emits only when a document selects text and
 * which the corpus's own pages do not happen to contain.
 *
 * `a` is the name that justifies the whole arrangement: Typst emits an `<a>` with
 * a transparent `<rect>` and no `href` for a link's hit area, so a list written by
 * hand would have dropped **every link in every document**, and nothing in the
 * repository was in a position to notice.
 */
export const SAFE_SVG_ELEMENTS: ReadonlySet<string> = new Set([
  ...SVG_ELEMENTS,
  // The text primitives. Typst emits these for a document that selects text, and
  // the corpus does not select any — so they are forward compatibility rather
  // than a measurement, and `engine/tests/svg_output.rs` is what would tell us if
  // they had turned into something else.
  "text",
  "tspan",
  "line",
  "polyline",
  "polygon",
  "circle",
  "ellipse",
]);

/** Attributes the engine emits — **measured**; see `SVG_ELEMENTS` for why. */
export const SAFE_SVG_ATTRIBUTES: ReadonlySet<string> = new Set([
  ...SVG_ATTRIBUTES,
  // The text attributes Typst writes alongside `text`/`tspan`, and the
  // unprefixed `href` it uses in some builds rather than `xlink:href`. Same
  // standing as the text primitives in `SAFE_SVG_ELEMENTS`: forward
  // compatibility, not a measurement, because nothing in the corpus selects text.
  "dx",
  "dy",
  "fill-opacity",
  "stroke-opacity",
  "clip-rule",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "opacity",
  "pathLength",
  "offset",
  "class",
  "href",
]);

/**
 * Names refused however they arrive, whatever else the lists say.
 *
 * The half that is a security property rather than a shape. `on…` covers every
 * event handler by prefix, which is the only way to cover them: there are more
 * than a hundred and browsers add them faster than a list is maintained.
 */
export const DENIED_SVG_ELEMENTS: ReadonlySet<string> = new Set([
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "link",
  "style",
  "animate",
  "animateTransform",
  "animateMotion",
  "set",
  "handler",
  "audio",
  "video",
  "base",
  "meta",
]);

/** A URL that runs code when a browser follows it. */
const DANGEROUS_URL = /^\s*(?:javascript|vbscript|data:text\/html)/iu;

/** What was dropped, so a caller can say so rather than pretend nothing happened. */
export interface SanitizeReport {
  /** `name`, `element@attribute` — in the order they were refused. */
  readonly dropped: readonly string[];
}

/** One attribute, parsed. */
interface Attr {
  name: string;
  value: string;
}

/**
 * An attribute value, escaped for the double-quoted XML context.
 *
 * Only the three characters that can end an attribute value or open a tag are
 * escaped. `&` first, because escaping the others would then double-escape the
 * ampersands it introduces.
 */
function attrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Whether an attribute's *value* is safe, for the attributes that carry a URL. */
function safeValue(name: string, value: string): boolean {
  if (name === "href" || name === "xlink:href") return !DANGEROUS_URL.test(value);
  return true;
}

/** The attributes of one tag, as they were written. */
function readAttrs(source: string, from: number, to: number): Attr[] {
  const out: Attr[] = [];
  const text = source.slice(from, to);
  // name="value" | name='value' | name=value | name
  const re = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    out.push({ name: m[1], value });
  }
  return out;
}

/**
 * The safe part of an SVG string, and what was refused on the way.
 *
 * Never throws and never returns `undefined`: a string that does not parse into
 * anything recognisable yields the empty string, because a blank preview pane is a
 * far better outcome than an exception on the render path.
 *
 * Text between tags is passed through **verbatim**, which is safe and is worth
 * being explicit about: the text came out of Typst's SVG exporter, which escapes
 * it, and a `<` in it would be read as a tag start here and then dropped as a name
 * that is not on the list. The failure direction is towards a missing letter, not
 * towards markup.
 */
export function sanitizeSvg(svg: string): { safe: string; report: SanitizeReport } {
  const dropped: string[] = [];
  const out: string[] = [];
  let i = 0;

  while (i < svg.length) {
    const lt = svg.indexOf("<", i);
    if (lt < 0) {
      out.push(svg.slice(i));
      break;
    }
    if (lt > i) out.push(svg.slice(i, lt));
    i = lt;

    // `<!-- … -->`, `<![CDATA[ … ]]>`, `<!DOCTYPE …>` — copied or dropped whole.
    if (svg.startsWith("<!--", i)) {
      const end = svg.indexOf("-->", i + 4);
      i = end < 0 ? svg.length : end + 3;
      continue;
    }
    if (svg.startsWith("<![CDATA[", i)) {
      const end = svg.indexOf("]]>", i + 9);
      // Dropped rather than copied: the engine emits none, and a CDATA section is
      // a way of writing markup that no reader of this string is looking for.
      if (end >= 0) dropped.push("cdata");
      i = end < 0 ? svg.length : end + 3;
      continue;
    }
    if (svg.startsWith("<!", i) || svg.startsWith("<?", i)) {
      const end = svg.indexOf(">", i);
      i = end < 0 ? svg.length : end + 1;
      continue;
    }

    // A closing tag.
    if (svg.startsWith("</", i)) {
      const end = svg.indexOf(">", i);
      if (end < 0) {
        i = svg.length;
        continue;
      }
      const name = svg.slice(i + 2, end).trim();
      if (DENIED_SVG_ELEMENTS.has(name)) {
        dropped.push(`/${name}`);
      } else if (SAFE_SVG_ELEMENTS.has(name)) {
        out.push(`</${name}>`);
      } else {
        dropped.push(`/${name}`);
      }
      i = end + 1;
      continue;
    }

    // An opening tag: read to the `>` that ends it, respecting quotes so that a
    // `>` inside an attribute value does not end it early.
    const gt = findTagEnd(svg, i + 1);
    if (gt < 0) {
      // Unterminated. Everything from here on is dropped rather than guessed at.
      dropped.push("unterminated-tag");
      break;
    }
    const body = svg.slice(i + 1, gt);
    const selfClosing = body.endsWith("/");
    const inner = selfClosing ? body.slice(0, -1) : body;
    const name = /^\s*([A-Za-z_:][\w:.-]*)/.exec(inner)?.[1] ?? "";
    const nameStart = /^\s*/.exec(inner)?.[0].length ?? 0;
    const attrs = readAttrs(inner, nameStart + name.length, inner.length);

    if (!name || DENIED_SVG_ELEMENTS.has(name)) {
      dropped.push(name || "malformed");
      // **The content goes too.** This is the bug the test found on its first
      // run: dropping the `<style>` tags and passing the body through emitted
      // `*{background:url(javascript:…)}` as text inside the `<svg>`, which the
      // test caught because the string still said `javascript:`. A filter that
      // removes a tag and keeps what was between the tags has not removed
      // anything — it has reclassified it, and "inert text" is a claim about a
      // consumer nobody has checked.
      // **`i` is advanced here, not at the end of the loop.** It was not, and a
      // denied *self-closing* element — `<animate attributeName="href" …/>` — spun
      // the scanner forever on its own `<`. Found by the hostile-input list, which
      // is the only reason the shape is in the test at all: the two shapes that
      // hang are the two no engine output has ever contained.
      i = gt + 1;
      if (!selfClosing && name) i = skipElement(svg, i, name);
      continue;
    }
    if (!SAFE_SVG_ELEMENTS.has(name)) {
      dropped.push(name);
      i = gt + 1;
      if (!selfClosing) i = skipElement(svg, i, name);
      continue;
    }
    {
      const kept: string[] = [];
      for (const a of attrs) {
        if (a.name.toLowerCase().startsWith("on")) {
          dropped.push(`${name}@${a.name}`);
          continue;
        }
        if (!SAFE_SVG_ATTRIBUTES.has(a.name)) {
          dropped.push(`${name}@${a.name}`);
          continue;
        }
        if (!safeValue(a.name, a.value)) {
          dropped.push(`${name}@${a.name}`);
          continue;
        }
        kept.push(`${a.name}="${attrValue(a.value)}"`);
      }
      out.push(`<${name}${kept.length ? ` ${kept.join(" ")}` : ""}${selfClosing ? "/" : ""}>`);
    }
    i = gt + 1;
  }

  return { safe: out.join(""), report: { dropped } };
}

/**
 * Just past the close tag of an element whose **content** starts at `from` —
 * that is, *after* its open tag, which the caller has already read. Starting at
 * the open tag instead counts it as a nesting level, never reaches zero, and
 * loops over the rest of the string; that was a real crash, found by the
 * measured-page assertion rather than by reading this.
 *
 * Nesting of the *same* name is counted, because `<foreignObject>` may contain
 * markup and `<style>` certainly may, and stopping at the first `</style>` would
 * leave the rest of the block in the output as text. An unclosed element runs to
 * the end of the string, which is the safe direction: everything after it is
 * dropped rather than guessed at.
 */
function skipElement(source: string, from: number, name: string): number {
  let depth = 1;
  let i = from;
  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt < 0) return source.length;
    const closing = source.startsWith("</", lt);
    const end = findTagEnd(source, lt + (closing ? 2 : 1));
    if (end < 0) return source.length;
    const tagName = /^\s*([A-Za-z_:][\w:.-]*)/.exec(
      closing ? source.slice(lt + 2, end) : source.slice(lt + 1, end),
    )?.[1];
    if (tagName === name) {
      if (closing) {
        depth -= 1;
        if (depth === 0) return end + 1;
      } else if (!source.slice(lt + 1, end).trimEnd().endsWith("/")) {
        depth += 1;
      }
    }
    i = end + 1;
  }
  return source.length;
}

/** The `>` that ends the tag opening at `from`, skipping any inside a value. */
function findTagEnd(source: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return i;
    }
  }
  return -1;
}

/**
 * Replace a node's contents with the safe part of `svg`.
 *
 * The three call sites keep their `innerHTML` and this is the only thing that
 * writes to it with engine output, which is the arrangement worth having: the
 * assignment is no longer the decision, the allow-list is.
 */
export function setSafeSvg(host: Element, svg: string): SanitizeReport {
  const { safe, report } = sanitizeSvg(svg);
  host.innerHTML = safe;
  return report;
}
