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
// menu entries; the outline pane and the fold service read the same shape from
// `ksav-lang.ts`, which reads it from here.
//
// **Where the headings come from.** `spans.ts`, and only `spans.ts`. This file
// used to carry its own name alternation and its own bracket matcher, and
// `ksav-lang.ts`'s `HEAD_RE` carried a *different* alternation for the same
// question. What the two disagreed about, and what it cost:
//
//   - `hlevel` was a heading to this file and not to `HEAD_RE` — so pressing
//     "demote" on `#h6` wrote `#hlevel(level: 7)` and the section vanished from
//     the outline and stopped folding. One button, and the document's structure
//     disappeared from every surface that displays it.
//   - `#סימן` was a heading to `HEAD_RE` and not to this file — so a sefer of
//     simanim outlined and folded perfectly and could not promote, demote, move
//     or delete a single section.
//   - `#שער` was a heading to `HEAD_RE` and is not one to the *compiler*: it is
//     `align(center, text(size: 2em, weight: "bold", …))` with no `heading()` in
//     it, so it never entered the printed `#תוכן`. The outline pane and the
//     table of contents disagreed about what the document's sections were, and
//     the outline was the one that was wrong. See `spans.NOT_HEADINGS`.

import {
  MAX_LEVEL,
  MAX_NAMED_LEVEL,
  SPELLING,
  scan,
  type Node,
} from "./spans";

export { MAX_LEVEL, MAX_NAMED_LEVEL };

export interface HeadingInfo {
  /** Range of the whole call. */
  from: number;
  to: number;
  /** Range of the title, inside the brackets. */
  bodyFrom: number;
  bodyTo: number;
  level: number;
  /**
   * The prelude pins this level and no rewrite can change it.
   *
   * `#סימן` is `heading(level: 1, [סימן #מספר — #כותרת])`. It is a real heading —
   * it numbers, it folds, it enters the contents — and there is no spelling of
   * it at level 2. So promote and demote report "does not apply" here, which is
   * what greys the controls out; move and delete are pure text moves and work.
   */
  levelFixed: boolean;
  /** The command as written, so a rewrite keeps the document's language. */
  name: string;
  lang: "he" | "en";
}

function info(n: Node): HeadingInfo {
  const title = n.titleGroups?.[0] ?? n.bodies[0] ?? { from: n.to, to: n.to };
  return {
    from: n.from,
    to: n.to,
    bodyFrom: title.from,
    bodyTo: title.to,
    level: n.level ?? 1,
    levelFixed: n.levelFixed === true,
    name: n.name,
    lang: n.lang,
  };
}

/** Every heading in the document, in source order. */
export function headings(doc: string): HeadingInfo[] {
  return scan(doc).nodes.filter((n) => n.role === "heading").map(info);
}

/** The heading `pos` sits on, if any. */
export function headingAt(doc: string, pos: number, all: HeadingInfo[] = headings(doc)): HeadingInfo | null {
  return all.find((h) => pos >= h.from && pos <= h.to) ?? null;
}

/**
 * The heading whose *section* contains `pos` — the one at or above it.
 *
 * This is what "move this section" and "fold this section" mean when the caret
 * is in the body text rather than on the heading line itself.
 */
export function sectionAt(doc: string, pos: number, all: HeadingInfo[] = headings(doc)): HeadingInfo | null {
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
export function sectionEnd(doc: string, h: HeadingInfo, all: HeadingInfo[] = headings(doc)): number {
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
  const s = SPELLING;
  if (level <= MAX_NAMED_LEVEL) {
    return `#${en ? s.headingNamed.en : s.headingNamed.he}${level}`;
  }
  // Past six there is no named command, so the generic form carries the level.
  const name = en ? s.headingGeneric.en : s.headingGeneric.he;
  const arg = en ? s.headingLevel.en : s.headingLevel.he;
  return `#${name}(${arg}: ${level})`;
}

/**
 * Rewrite a heading at a new level, leaving its title alone.
 *
 * A heading whose level the prelude fixes cannot be rewritten: turning
 * `#סימן("א", [דיני תפילה])` into `#כותרת2[דיני תפילה]` would silently drop the
 * siman number, which is text the writer put there. Refusing is the honest
 * answer and the surfaces render it as a disabled control.
 */
export function setLevel(doc: string, h: HeadingInfo, level: number): Edit | null {
  if (!canSetLevel(h, level)) return null;
  const head = open(h, Math.min(Math.max(1, level), MAX_LEVEL));
  const text = doc.slice(0, h.from) + head + doc.slice(h.bodyFrom - 1);
  return { text, caret: h.from + head.length + 1 };
}

/** One level shallower — Shift+Tab on a heading, in every outliner. */
export function promote(doc: string, h: HeadingInfo): Edit | null {
  return canPromote(h) ? setLevel(doc, h, h.level - 1) : null;
}

/** One level deeper. */
export function demote(doc: string, h: HeadingInfo): Edit | null {
  return canDemote(h) ? setLevel(doc, h, h.level + 1) : null;
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
  const swap = sectionSwap(doc, h, by);
  if (!swap) return null;
  const { mine, theirs } = swap;
  if (by === 1) {
    const text =
      doc.slice(0, mine.from) +
      doc.slice(theirs.from, theirs.to) +
      doc.slice(mine.from, mine.to) +
      doc.slice(theirs.to);
    return { text, caret: mine.from + (theirs.to - theirs.from) };
  }
  const text =
    doc.slice(0, theirs.from) +
    doc.slice(mine.from, mine.to) +
    doc.slice(theirs.from, theirs.to) +
    doc.slice(mine.to);
  return { text, caret: theirs.from };
}

interface Span {
  from: number;
  to: number;
}

/**
 * The two spans a move would exchange, or null when there is nothing to
 * exchange with.
 *
 * The whole decision lives here so that asking "can this section move?" and
 * moving it are the same code. Asking used to mean *performing* the move and
 * looking at the result — three copies of the document to find out whether a
 * toolbar arrow should be grey.
 */
function sectionSwap(
  doc: string,
  h: HeadingInfo,
  by: -1 | 1,
  all: HeadingInfo[] = headings(doc),
): { mine: Span; theirs: Span } | null {
  const siblings = all.filter((o) => o.level === h.level);
  const i = siblings.findIndex((o) => o.from === h.from);
  if (i < 0) return null;

  const mine = { from: h.from, to: sectionEnd(doc, h, all) };
  if (by === 1) {
    const next = siblings[i + 1];
    // Only a sibling that is the very next section can be swapped with: one
    // further down would mean jumping over a section at a different level.
    if (!next || next.from !== mine.to) return null;
    return { mine, theirs: { from: next.from, to: sectionEnd(doc, next, all) } };
  }
  const prev = siblings[i - 1];
  if (!prev || sectionEnd(doc, prev, all) !== mine.from) return null;
  return { mine, theirs: { from: prev.from, to: mine.from } };
}

// ---------------------------------------------------------------- can it act?
//
// What the ribbon, the menus and the hydra ask about every heading operation on
// every caret move. Each takes what has already been resolved — the heading, the
// heading list, the line — so fourteen questions cost one scan between them, and
// each operation above asks its own before it writes anything.

/**
 * A heading whose level the prelude pins cannot be re-levelled at all, and one
 * already at the level asked for has nothing to do.
 */
export function canSetLevel(h: HeadingInfo, level: number): boolean {
  return !h.levelFixed && Math.min(Math.max(1, level), MAX_LEVEL) !== h.level;
}

export function canPromote(h: HeadingInfo): boolean {
  return h.level > 1 && canSetLevel(h, h.level - 1);
}

export function canDemote(h: HeadingInfo): boolean {
  return h.level < MAX_LEVEL && canSetLevel(h, h.level + 1);
}

export function canMoveSection(
  doc: string,
  h: HeadingInfo,
  by: -1 | 1,
  all?: HeadingInfo[],
): boolean {
  return sectionSwap(doc, h, by, all ?? headings(doc)) !== null;
}

/** Deleting a section always applies: there is always a section to delete. */
export function canDeleteSection(): boolean {
  return true;
}

export function canUnwrapHeading(h: HeadingInfo): boolean {
  return !h.levelFixed;
}

/** Delete the heading and everything under it. */
export function deleteSection(doc: string, h: HeadingInfo): Edit {
  const end = sectionEnd(doc, h);
  const text = (doc.slice(0, h.from) + doc.slice(end)).replace(/\n{3,}/g, "\n\n");
  return { text, caret: Math.min(h.from, text.length) };
}

/**
 * Turn a heading back into an ordinary line, keeping its words.
 *
 * Refused for a heading whose level the prelude fixes, for the same reason
 * `setLevel` refuses: `#סימן`'s number lives in an argument that unwrapping
 * would throw away, and losing a writer's text silently is worse than a control
 * that says no.
 */
export function unwrapHeading(doc: string, h: HeadingInfo): Edit | null {
  if (!canUnwrapHeading(h)) return null;
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

  const { from, to, line } = lineAt(doc, pos);
  if (!canMakeHeading(null, line, level)) return null;

  const en = /^[\x00-\x7F]*$/.test(line) && line.length > 0;
  const s = SPELLING;
  const head =
    level <= MAX_NAMED_LEVEL
      ? `#${en ? s.headingNamed.en : s.headingNamed.he}${level}`
      : `#${en ? s.headingGeneric.en : s.headingGeneric.he}(${en ? s.headingLevel.en : s.headingLevel.he}: ${level})`;
  const text = `${doc.slice(0, from)}${head}[${line}]${doc.slice(to)}`;
  return { text, caret: from + head.length + 1 + line.length };
}

/** Insert a table of contents at the top of the document, once. */
export function addContents(doc: string, lang: "he" | "en" = "he"): Edit | null {
  if (!canAddContents(doc)) return null;
  const call = lang === "en" ? "#toc()" : "#תוכן()";
  const text = `${call}\n\n${doc.replace(/^\s*/, "")}`;
  return { text, caret: call.length };
}

/**
 * Only once per document.
 *
 * Read through the scanner rather than a regex, which is also how the trap below
 * stopped being possible: `#תוכן\b(` never matches, because JavaScript's word
 * boundary is defined on `[A-Za-z0-9_]` and the position between `ן` and `(` is
 * not one — so this guard answered "no contents yet" for a document that already
 * had one, forever.
 */
export function canAddContents(doc: string): boolean {
  return !scan(doc).nodes.some((n) => n.name === "תוכן" || n.name === "toc");
}

/** The line `pos` is on: its range, and its text with the edges trimmed. */
export function lineAt(doc: string, pos: number): { from: number; to: number; line: string } {
  const from = doc.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
  const nl = doc.indexOf("\n", pos);
  const to = nl < 0 ? doc.length : nl;
  return { from, to, line: doc.slice(from, to).trim() };
}

/**
 * Can this line become a heading at `level`?
 *
 * `on` is the heading the caret is *on*, if any — this is a paragraph-style
 * button, so it re-levels the heading in hand and otherwise wraps the line. A
 * line that is already some other command is left alone: wrapping `#רשימה(…)` in
 * a heading is not what anybody meant by pressing this.
 */
export function canMakeHeading(on: HeadingInfo | null, line: string, level: number): boolean {
  return on ? canSetLevel(on, level) : !line.startsWith("#");
}
