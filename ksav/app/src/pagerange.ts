// Which pages an export is of.
//
// # The finding
//
// > *"A page range is offered for PDF only. No reason has been given for that."*
//
// There was no reason, and worse than that there was no *concept*. A page range
// existed as one menu item (`PDF — selected pages…`) that put up a
// `window.prompt`, handed the string to the engine as `pdf_pages`, and was
// forgotten. Print — the one route where "pages 4 to 9" is the whole reason the
// question gets asked — ignored it entirely and sent the whole sefer to the
// printer. Nothing anywhere said which routes had pages and which did not.
//
// # The two halves of the answer
//
// **Some routes genuinely have no pages.** Markdown and plain text are made from
// the source, which has never been paginated. Word and the reflowable HTML are
// *deliberately* unpaginated — reflow is the entire point of them, and a document
// that reflows to the reader's window has no page 4 to export. `.typ` is source
// too. Saying so is the reason that was missing; refusing to offer the control
// on those routes and explaining why is the fix.
//
// **The rest were simply never wired.** Print and the page-image HTML fallback
// are *pictures of pages* — they are the paginated routes — and both took the
// lot regardless. They read the range now, from the same one control the PDF
// does.
//
// # The grammar
//
// `1,3,5-9`, and `-4` / `7-` for the open ends, which is what
// `parse_page_ranges` in `engine/src/lib.rs` accepts. Stated a second time here
// on purpose and fenced against the engine's own tests, because this half has a
// job the engine's half does not: **the engine silently drops a part it cannot
// read**, so `1,x,5` exports pages 1 and 5 and never mentions the `x`. A writer
// who mistypes a range gets a file that is quietly not what they asked for. This
// parser keeps the offcuts so the caller can say so before the compile runs.

/** One piece of a spec. `null` on either side is an open end. */
export interface Span {
  from: number | null;
  to: number | null;
}

export interface PageSpec {
  /** The spans asked for, or `null` for "every page". */
  spans: Span[] | null;
  /** The pieces that named nothing, verbatim, for a message. */
  bad: string[];
}

/** Every page — what an empty box means, and the state nine routes out of nine start in. */
export const ALL: PageSpec = { spans: null, bad: [] };

/**
 * Read a spec the way the engine reads it, and keep what it would have thrown away.
 */
export function parsePages(spec: string): PageSpec {
  const text = spec.trim();
  if (!text) return ALL;
  const spans: Span[] = [];
  const bad: string[] = [];
  for (const raw of text.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const dash = part.indexOf("-");
    if (dash < 0) {
      const n = num(part);
      if (n === null) bad.push(part);
      else spans.push({ from: n, to: n });
      continue;
    }
    const from = num(part.slice(0, dash));
    const to = num(part.slice(dash + 1));
    // A bare `-` names nothing. Left alone it would read as "every page" and
    // quietly swallow the rest of the spec, which is the engine's own note on
    // the same line of its parser.
    if (from === null && to === null) bad.push(part);
    // A backwards range is empty rather than an error in the engine — it simply
    // matches no page — so it is worth naming here, where somebody can fix it.
    else if (from !== null && to !== null && to < from) bad.push(part);
    else spans.push({ from, to });
  }
  return { spans: spans.length ? spans : null, bad };
}

function num(s: string): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** Is this page (1-based) in the spec? */
export function includes(spec: PageSpec, page: number): boolean {
  if (!spec.spans) return true;
  return spec.spans.some(
    (s) => (s.from === null || page >= s.from) && (s.to === null || page <= s.to),
  );
}

/** The pages of a document of `total` pages that this spec selects, in order. */
export function select<T>(spec: PageSpec, pages: readonly T[]): T[] {
  if (!spec.spans) return [...pages];
  return pages.filter((_, i) => includes(spec, i + 1));
}

/**
 * Whether a spec asks for pages this document does not have.
 *
 * Not an error — Typst drops them and exports the rest — but it is the
 * difference between "I asked for 5-9 and got five pages" and "I asked for 5-9
 * of a four-page document and got nothing", and the second one is worth a word.
 */
export function beyond(spec: PageSpec, total: number): boolean {
  if (!spec.spans) return false;
  return spec.spans.some((s) => (s.from ?? 1) > total);
}

// ---------------------------------------------------------------- the routes
//
// Which of the nine export routes has pages at all. The ids are `header.EXPORTS`,
// which are the i18n keys, which are already each route's one identifier.

/**
 * The routes that are made of pages, and therefore take a range.
 *
 * `print` and the PDF are the paginated pair. `exportHtml` is deliberately not
 * here even though it *can* fall back to page images: what a writer asks for
 * when they choose "HTML (reflowable)" is the reflowing kind, and a control that
 * works only on the days the fallback fires is worse than one that does not
 * exist. The fallback still honours a range when one is set — see `exports.ts` —
 * it is just not advertised as a feature of that menu item.
 */
export const PAGINATED: readonly string[] = ["exportPdf", "print"];

/**
 * Why a route takes no range, as an i18n key. `null` when it does take one.
 *
 * Three answers, and they are genuinely different reasons rather than three
 * spellings of "not implemented":
 *
 * - `noPagesReflow` — Word and web HTML reflow to the reader's window. There is
 *   no page 4 in a file whose pagination is decided by whoever opens it.
 * - `noPagesSource` — Markdown, plain text and `.typ` are the source, which has
 *   never had pages and is not laid out on the way out.
 */
const WHY_NOT: Readonly<Record<string, string>> = {
  exportWord: "noPagesReflow",
  copyForWord: "noPagesReflow",
  exportHtml: "noPagesReflow",
  exportMarkdown: "noPagesSource",
  // Org, for the same reason and not a new one: it is a plain-text tree, and a
  // tree has no page 4.
  exportOrg: "noPagesSource",
  exportText: "noPagesSource",
  exportTypst: "noPagesSource",
};

/** Does this route take a page range? */
export function takesRange(id: string): boolean {
  return PAGINATED.includes(id);
}

/** Why this route takes no page range, as an i18n key, or `null` if it does. */
export function whyNoRange(id: string): string | null {
  return takesRange(id) ? null : (WHY_NOT[id] ?? null);
}
