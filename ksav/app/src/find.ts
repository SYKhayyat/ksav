/**
 * Searching the sefer, and the choice of *which* sefer is being searched.
 *
 * # The report
 *
 * > *"Search should be configurable to search the source, the preview, or
 * > both."*
 *
 * The trap the item names is worth quoting too: built off the source string
 * under a new label, "search the preview" becomes a fake — a control that
 * appears to do a second thing and does the first one twice.
 *
 * So the printed text is read off the laid-out page. The engine's
 * `pagetext` module answers what each page says, in reading order, riding on
 * the compile that has already happened; nothing here reconstructs a page from
 * the source, and when the printed text is not available the preview scope says
 * so rather than quietly falling back.
 *
 * # Why the two scopes find different things, which is the point
 *
 * The source has text that never prints — command names, argument names,
 * comments — and the page has text nobody typed: a note's marker, a running
 * head repeating a heading from forty pages back, an auto-numbered siman, the
 * whole of an included chapter. A writer looking for a phrase they *read* and a
 * writer looking for a phrase they *wrote* are asking different questions, and
 * before this they could only ask the second one.
 *
 * # No DOM, no engine, no settings
 *
 * Rules only: what counts as a hit and how the hits are ordered. The shell
 * fetches the pages, reads the setting and draws the rows.
 */

// The wire's own definition rather than a second one that agrees with it
// today. A type-only import, so nothing here depends on `api` at runtime.
import type { PrintedLine } from "./api";
export type { PrintedLine };

/** Which document a search reads. */
export type SearchScope = "source" | "preview" | "both";

export interface FindOptions {
  scope: SearchScope;
  /** Off by default: Hebrew has no case, and the writers who need it are
   *  working in the English half of a bilingual sefer. */
  caseSensitive?: boolean;
  /** How many hits to return before giving up and saying how many were left. */
  limit?: number;
}

/** Where a hit is, precisely enough to be gone to. */
export interface Hit {
  where: "source" | "preview";
  /** Byte-agnostic offset into the source body. Absent for a printed line that
   *  cannot be traced back to the writer's own text. */
  at?: number;
  /** 1-based line of the source, when there is one. */
  line?: number;
  /** The included file the line belongs to, when it is not this document. */
  file?: string | null;
  /** 1-based page, for a printed hit. */
  page?: number;
  /** Baseline on that page, in points — what the preview is scrolled to. */
  y?: number;
  /** The whole line the hit sits on, for reading it in place. */
  text: string;
  /** Where in `text` the query matched. */
  from: number;
  to: number;
}

export interface FindResult {
  hits: Hit[];
  /** How many hits the limit dropped. A list that stops without saying it
   *  stopped reads as complete — the same rule `panelrows` follows. */
  hidden: number;
  /**
   * Why the preview half is empty, when it is.
   *
   * `null` when nothing is wrong. A scope that includes the preview and finds
   * no printed text has either not compiled yet or failed to, and the
   * difference between *"no matches"* and *"nothing to match against"* is the
   * difference between an answer and a surface that lies about one.
   */
  previewUnavailable: null | "not-compiled";
}

const DEFAULT_LIMIT = 500;

/** Every start offset of `needle` in `hay`, non-overlapping, in order. */
function occurrences(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let at = hay.indexOf(needle);
  while (at >= 0) {
    out.push(at);
    at = hay.indexOf(needle, at + needle.length);
  }
  return out;
}

/**
 * Every hit for `query`, source first and then the pages in page order.
 *
 * Source before preview because the source is where a writer edits, and a hit
 * in the preview that traces to a line of the source is the *same* hit seen
 * from the other side. They are both listed rather than deduplicated: telling a
 * writer their phrase is on page 12 is the half of the answer the source list
 * cannot give, and dropping the printed hit because a source hit matched it
 * would silently empty the preview list for every phrase that was typed
 * literally, which is most of them.
 */
export function findIn(
  body: string,
  pages: readonly (readonly PrintedLine[])[] | null,
  query: string,
  opts: FindOptions,
): FindResult {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const empty: FindResult = { hits: [], hidden: 0, previewUnavailable: null };
  if (!query) return empty;

  const fold = (s: string) => (opts.caseSensitive ? s : s.toLowerCase());
  const needle = fold(query);
  const wantsSource = opts.scope === "source" || opts.scope === "both";
  const wantsPreview = opts.scope === "preview" || opts.scope === "both";

  const hits: Hit[] = [];
  let hidden = 0;
  const push = (h: Hit) => {
    if (hits.length < limit) hits.push(h);
    else hidden += 1;
  };

  if (wantsSource) {
    // Offsets are tracked rather than recomputed with `indexOf` per line: a
    // line that repeats earlier in the document would otherwise be found at the
    // first copy's offset and send the caret to the wrong paragraph.
    let offset = 0;
    let number = 1;
    for (const line of body.split("\n")) {
      for (const at of occurrences(fold(line), needle)) {
        push({
          where: "source",
          at: offset + at,
          line: number,
          text: line,
          from: at,
          to: at + query.length,
        });
      }
      offset += line.length + 1;
      number += 1;
    }
  }

  if (wantsPreview) {
    if (!pages || pages.length === 0) {
      return { hits, hidden, previewUnavailable: "not-compiled" };
    }
    // **Across the line break, not within one line.**
    //
    // The item names this trap by hand: *"in the laid-out text, words break
    // across lines"*. A phrase the reader sees plainly on the page is, on the
    // page's own terms, the tail of one line and the head of the next — and a
    // per-line search finds nothing at all for it, on the surface whose entire
    // job is finding things. So each page is matched as one string, with the
    // lines joined by a space, and a hit is reported against the line it
    // *starts* on, which is where the eye goes and where the caret belongs.
    for (const [i, page] of pages.entries()) {
      // Where each line begins inside the joined page. Built alongside the join
      // rather than recomputed, so a repeated line cannot be found at the first
      // copy's offset — the same bug the source half is written to avoid.
      const starts: number[] = [];
      let joined = "";
      for (const printed of page) {
        if (joined) joined += " ";
        starts.push(joined.length);
        joined += printed.text;
      }
      for (const at of occurrences(fold(joined), needle)) {
        // The last line that begins at or before the match.
        let which = 0;
        while (which + 1 < starts.length && starts[which + 1] <= at) which += 1;
        const printed = page[which];
        const from = at - starts[which];
        push({
          where: "preview",
          page: i + 1,
          y: printed.y,
          line: printed.line ?? undefined,
          file: printed.file ?? undefined,
          text: printed.text,
          from,
          // Clamped to the line it started on: a phrase that runs over the
          // break has no end *on this line*, and an index past the string
          // would light up nothing or, worse, be trusted by a caller slicing
          // with it.
          to: Math.min(from + query.length, printed.text.length),
        });
      }
    }
  }

  return { hits, hidden, previewUnavailable: null };
}

/**
 * Can this hit be gone to in the source?
 *
 * A printed hit that traces to a line of the writer's own text can; a running
 * head, an auto-numbered siman and a note's marker cannot, because the words
 * are not in the source at all. Saying so is the whole of it — a row that
 * jumps to "somewhere near" would put the caret in the wrong sentence and look
 * exactly like working software.
 */
export function isEditable(hit: Hit): boolean {
  if (hit.where === "source") return hit.at !== undefined;
  return hit.line !== undefined && !hit.file;
}
