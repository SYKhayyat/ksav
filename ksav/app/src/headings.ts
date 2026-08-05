// Headings as structure, not as three buttons.
//
// The toolbar offered H1, H2, H3. The engine has always accepted any level —
// `#כותרת(רמה: 9)` compiles, numbers, and enters the table of contents — and
// `#כותרת4` through `#כותרת6` exist as named commands nothing ever showed. So a
// writer building a sefer with four levels of siman had to know the markup, or
// believe the product could not do it.
//
// This is the editing model: what a heading is, where its section ends, and the
// five operations that matter — promote, demote, move the whole section up or
// down, and delete it. `structure.ts` turns them into ribbon controls, keys and
// menu entries; the outline pane and the fold service already read the same
// shape from `ksav-lang.ts`.

/** Every command that opens a heading, and the level it implies. */
const NAMED: Record<string, number> = {
  "כותרת1": 1, h1: 1,
  "כותרת2": 2, h2: 2,
  "כותרת3": 3, h3: 3,
  "כותרת4": 4, h4: 4,
  "כותרת5": 5, h5: 5,
  "כותרת6": 6, h6: 6,
};
/** The generic form, which is the only way past level 6. */
const GENERIC = ["כותרת", "hlevel"];

/** Ksav writes levels 1–6 as `#כותרתN`, and anything deeper generically. */
export const MAX_NAMED_LEVEL = 6;
/**
 * Nine, matching what the page can now show.
 *
 * Typst itself has no ceiling, and neither does the outline — but past nine the
 * indent ramp runs into the text and one more level of nesting stops being a
 * thing a reader can see. A limit the page can honour beats a promise it cannot.
 */
export const MAX_LEVEL = 9;

export interface HeadingInfo {
  /** Range of the whole call. */
  from: number;
  to: number;
  /** Range of the title, inside the brackets. */
  bodyFrom: number;
  bodyTo: number;
  level: number;
  /** The command as written, so a rewrite keeps the document's language. */
  name: string;
  lang: "he" | "en";
}

const NAME_CH = /[A-Za-z0-9֐-׿_]/;

function matchBracket(doc: string, open: number): number | null {
  const opener = doc[open];
  const closer = opener === "(" ? ")" : "]";
  let depth = 1;
  for (let i = open + 1; i < doc.length; i++) {
    if (doc[i] === "\\") i++;
    else if (doc[i] === opener) depth++;
    else if (doc[i] === closer && --depth === 0) return i;
  }
  return null;
}

/** Every heading in the document, in source order. */
export function headings(doc: string): HeadingInfo[] {
  const out: HeadingInfo[] = [];
  // Named forms first, so `כותרת1` wins over `כותרת` in the alternation.
  const names = [...Object.keys(NAMED), ...GENERIC];
  // Not `\b`: JavaScript's word boundary is defined on `[A-Za-z0-9_]`, so the
  // position between `ת` and `(` is not a boundary and `#כותרת(רמה: 8)` matched
  // nothing at all — every generic heading invisible, in a file about headings.
  // A negative lookahead over the real identifier class instead; a lookBEHIND
  // would break Safari before 16.4, which this codebase has been bitten by.
  const re = new RegExp(`#(${names.join("|")})(?![A-Za-z0-9֐-׿_])`, "gu");
  for (const m of doc.matchAll(re)) {
    const at = m.index;
    const name = m[1];
    let i = at + 1 + name.length;
    let level = NAMED[name] ?? 1;

    // The generic form carries its level in an argument list.
    if (doc[i] === "(") {
      const close = matchBracket(doc, i);
      if (close == null) continue;
      const lm = /(?:רמה|level)\s*:\s*(\d+)/u.exec(doc.slice(i + 1, close));
      if (lm) level = Math.max(1, parseInt(lm[1], 10));
      i = close + 1;
    }
    if (doc[i] !== "[") continue;
    const end = matchBracket(doc, i);
    if (end == null) continue;

    out.push({
      from: at,
      to: end + 1,
      bodyFrom: i + 1,
      bodyTo: end,
      level,
      name,
      lang: NAME_CH.test(name[0]) && /[A-Za-z]/.test(name[0]) ? "en" : "he",
    });
  }
  return out;
}

/** The heading `pos` sits on, if any. */
export function headingAt(doc: string, pos: number): HeadingInfo | null {
  return headings(doc).find((h) => pos >= h.from && pos <= h.to) ?? null;
}

/**
 * The heading whose *section* contains `pos` — the one at or above it.
 *
 * This is what "move this section" and "fold this section" mean when the caret
 * is in the body text rather than on the heading line itself.
 */
export function sectionAt(doc: string, pos: number): HeadingInfo | null {
  const all = headings(doc);
  let found: HeadingInfo | null = null;
  for (const h of all) {
    if (h.from > pos) break;
    found = h;
  }
  return found;
}

/**
 * Where a heading's section ends: just before the next heading at the same or a
 * higher level, or the end of the document.
 *
 * A *deeper* heading is part of this section, which is what makes "move the
 * section" carry its subsections with it rather than tearing them off.
 */
export function sectionEnd(doc: string, h: HeadingInfo): number {
  const all = headings(doc);
  const next = all.find((o) => o.from > h.from && o.level <= h.level);
  return next ? next.from : doc.length;
}

export interface Edit {
  text: string;
  caret: number;
}

/** The source for a heading at `level`, keeping the document's language. */
function open(h: HeadingInfo, level: number): string {
  const en = h.lang === "en";
  if (level <= MAX_NAMED_LEVEL) return `#${en ? "h" : "כותרת"}${level}`;
  // Past six there is no named command, so the generic form carries the level.
  return `#${en ? "hlevel" : "כותרת"}(${en ? "level" : "רמה"}: ${level})`;
}

/** Rewrite a heading at a new level, leaving its title alone. */
export function setLevel(doc: string, h: HeadingInfo, level: number): Edit | null {
  const want = Math.min(Math.max(1, level), MAX_LEVEL);
  if (want === h.level) return null;
  const head = open(h, want);
  const text = doc.slice(0, h.from) + head + doc.slice(h.bodyFrom - 1);
  return { text, caret: h.from + head.length + 1 };
}

/** One level shallower — Shift+Tab on a heading, in every outliner. */
export function promote(doc: string, h: HeadingInfo): Edit | null {
  return h.level <= 1 ? null : setLevel(doc, h, h.level - 1);
}

/** One level deeper. */
export function demote(doc: string, h: HeadingInfo): Edit | null {
  return h.level >= MAX_LEVEL ? null : setLevel(doc, h, h.level + 1);
}

/**
 * Move a whole section — heading, body, and every subsection under it — past
 * its neighbour at the same level.
 *
 * The operation nobody can do by hand without losing something: it is a cut and
 * a paste across an arbitrary span of text, and the span is exactly what a
 * writer misjudges.
 */
export function moveSection(doc: string, h: HeadingInfo, by: -1 | 1): Edit | null {
  const all = headings(doc);
  const siblings = all.filter((o) => o.level === h.level);
  const i = siblings.findIndex((o) => o.from === h.from);
  if (i < 0) return null;

  const mine = { from: h.from, to: sectionEnd(doc, h) };
  if (by === 1) {
    const next = siblings[i + 1];
    // Only a sibling that is the very next section can be swapped with: one
    // further down would mean jumping over a section at a different level.
    if (!next || next.from !== mine.to) return null;
    const theirs = { from: next.from, to: sectionEnd(doc, next) };
    const text =
      doc.slice(0, mine.from) +
      doc.slice(theirs.from, theirs.to) +
      doc.slice(mine.from, mine.to) +
      doc.slice(theirs.to);
    return { text, caret: mine.from + (theirs.to - theirs.from) };
  }

  const prev = siblings[i - 1];
  if (!prev || sectionEnd(doc, prev) !== mine.from) return null;
  const theirs = { from: prev.from, to: mine.from };
  const text =
    doc.slice(0, theirs.from) +
    doc.slice(mine.from, mine.to) +
    doc.slice(theirs.from, theirs.to) +
    doc.slice(mine.to);
  return { text, caret: theirs.from };
}

/** Delete the heading and everything under it. */
export function deleteSection(doc: string, h: HeadingInfo): Edit {
  const end = sectionEnd(doc, h);
  const text = (doc.slice(0, h.from) + doc.slice(end)).replace(/\n{3,}/g, "\n\n");
  return { text, caret: Math.min(h.from, text.length) };
}

/** Turn a heading back into an ordinary line, keeping its words. */
export function unwrapHeading(doc: string, h: HeadingInfo): Edit {
  const title = doc.slice(h.bodyFrom, h.bodyTo);
  return { text: doc.slice(0, h.from) + title + doc.slice(h.to), caret: h.from + title.length };
}

/**
 * Turn the line the caret is on into a heading — or change the level of the
 * heading it is already on.
 *
 * This is what "Heading 3" means in a word processor: it applies to the
 * paragraph in hand. Routing it through `sectionAt` instead would have made
 * pressing "3" in body text silently restyle the heading *above* — a change the
 * writer did not ask for, several lines from where they were looking, which is
 * about the worst possible reading of the button.
 */
export function makeHeading(doc: string, pos: number, level: number): Edit | null {
  const on = headingAt(doc, pos);
  if (on) return setLevel(doc, on, level);

  const from = doc.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
  const nl = doc.indexOf("\n", pos);
  const to = nl < 0 ? doc.length : nl;
  const line = doc.slice(from, to).trim();
  // A line that is already some other command is left alone: wrapping
  // `#רשימה(…)` in a heading is not what anybody meant by pressing this.
  if (line.startsWith("#")) return null;

  const en = /^[\x00-\x7F]*$/.test(line) && line.length > 0;
  const head =
    level <= MAX_NAMED_LEVEL
      ? `#${en ? "h" : "כותרת"}${level}`
      : `#${en ? "hlevel" : "כותרת"}(${en ? "level" : "רמה"}: ${level})`;
  const text = `${doc.slice(0, from)}${head}[${line}]${doc.slice(to)}`;
  return { text, caret: from + head.length + 1 + line.length };
}

/** Insert a table of contents at the top of the document, once. */
export function addContents(doc: string, lang: "he" | "en" = "he"): Edit | null {
  // The same non-ASCII `\b` trap as in `headings()`, which is how it also got
  // written here: `#תוכן\b(` never matches, so this guard was answering "no
  // contents yet" for a document that already had one, forever.
  if (/#(תוכן|toc)(?![A-Za-z0-9֐-׿_])/u.test(doc)) return null;
  const call = lang === "en" ? "#toc()" : "#תוכן()";
  const text = `${call}\n\n${doc.replace(/^\s*/, "")}`;
  return { text, caret: call.length };
}
