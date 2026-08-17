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
  NOT_HEADINGS,
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
  /** One past the command's name — where an argument list would start. */
  nameTo: number;
  /** Inside the `(…)`, when the call has one. `null` when it does not. */
  argsFrom: number | null;
  argsTo: number | null;
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
    nameTo: n.nameTo,
    argsFrom: n.args ? n.args.from : null,
    argsTo: n.args ? n.args.to : null,
  };
}

/**
 * Every heading in the document, in source order.
 *
 * Memoised on the *scan*, not on the text, because the scan is already the thing
 * that is memoised per document version and this is a pure function of it. The
 * filter-and-map is O(nodes) and allocates a fresh array of every heading in the
 * document: 8,800 nodes on a 235-page sefer.
 *
 * That mattered in two places, both hot and neither obvious.
 *
 * `updateContextBar` runs on every arrow key and called `headingAt(doc, pos)`
 * with two arguments, so the default parameter fired this — to set the value of
 * a `<select>` — and threw the array away. The `StructureContext` built three
 * lines later computes the same list and caches it properly.
 *
 * And the fold service calls `sectionLevelAt` in a loop to the end of the
 * document, once per fold query, each call restarting from node 0. Sharing one
 * array turns that from O(lines × nodes) into O(lines × headings).
 *
 * The array is shared, so nothing may sort or splice it. Nothing does; if
 * something needs to, it copies.
 */
const CACHED = new WeakMap<object, HeadingInfo[]>();

export function headings(doc: string): HeadingInfo[] {
  const s = scan(doc);
  const hit = CACHED.get(s);
  if (hit) return hit;
  const all = s.nodes.filter((n) => n.role === "heading").map(info);
  CACHED.set(s, all);
  return all;
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

/**
 * Which sections collapse when the outline is folded **to** a level.
 *
 * The direction is the whole of it, and it is the part everybody gets backwards:
 * *fold to level 1* leaves the level-1 headings on screen and takes everything
 * under them down — so the sections that collapse are the ones at that level
 * **and deeper**, not the ones above it. The editor could previously only fold
 * everything at once, which answers a question nobody writing a sefer asks.
 */
export function sectionsToFold(
  doc: string,
  level: number,
  all: HeadingInfo[] = headings(doc),
): HeadingInfo[] {
  return all.filter((h) => h.level >= level);
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
export function moveSection(doc: string, h: HeadingInfo, by: -1 | 1, pos = -1): Edit | null {
  const swap = sectionSwap(doc, h, by);
  if (!swap) return null;
  const { mine, theirs } = swap;
  // The two spans are adjacent, so a move is an exchange of two blocks — and
  // the blank line **between** them belongs to neither. Swapping the spans whole
  // carried each block's trailing whitespace with it, which is wrong in both
  // directions and visible on the first press:
  //
  //   - a document written with a blank line between sections came back with
  //     one newline between them and two at the end, so the spacing moved every
  //     time a section did; and
  //   - the last section of a document has no trailing newline at all, so
  //     swapping past it glued the next heading onto the end of the previous
  //     paragraph — `גוף ב.#כותרת1[א]`.
  //
  // So each block is split into its words and the whitespace that follows them,
  // the words are exchanged, and the whitespace stays where it was.
  const first = by === 1 ? mine : theirs;
  const second = by === 1 ? theirs : mine;
  const split = (s: Span) => {
    const whole = doc.slice(s.from, s.to);
    const words = whole.replace(/\s*$/u, "");
    return { words, gap: whole.slice(words.length) };
  };
  const a = split(first);
  const b = split(second);
  const text =
    doc.slice(0, first.from) + b.words + a.gap + a.words + b.gap + doc.slice(second.to);

  // Where the writer was inside their own section, so the caret arrives with it
  // rather than at its first character. Landing on the `#` meant the keystroke
  // after a move wrote `ץ#כותרת2[…]` and the heading became prose. `-1` is "no
  // opinion", for the callers that only have a heading.
  const own = by === 1 ? a : b;
  const at = pos < mine.from || pos > mine.to ? 0 : Math.min(pos - mine.from, own.words.length);
  const start = by === 1 ? first.from + b.words.length + a.gap.length : first.from;
  return { text, caret: start + at };
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

/**
 * Where the contents goes in: after the title block, and otherwise at the top.
 *
 * "The top of the document" is two different places, and reading it as one
 * printed a document's table of contents **above its own title** — build a title
 * page, press `Ctrl+Shift+O`, and the first thing on page one is the contents,
 * with `קונטרס הבדלה` under it. A running head belongs at character zero because
 * it configures and prints nothing there; a table of contents is printed matter
 * and belongs where it is read, which is after the title and before the first
 * section.
 *
 * The title block is `NOT_HEADINGS` — `#שער` and `#תת_שער`, in both spellings —
 * which is the same set `spans.ts` already keeps for the same reason: those two
 * make a title and are not sections. Nothing else is skipped. A document with no
 * title block still gets the contents at character zero, which is what every
 * document that has one today already looks like.
 */
function afterTitleBlock(doc: string): number {
  let at = 0;
  for (const node of scan(doc).nodes) {
    if (node.from < at) continue;
    // Only a leading *run*: the first thing that is not blank space and not part
    // of the title block ends it, so a `#שער` further down the document — a
    // second title page, say — does not drag the contents past a whole chapter.
    if (doc.slice(at, node.from).trim()) break;
    if (!NOT_HEADINGS.has(node.name)) break;
    at = node.to;
  }
  if (at === 0) return 0;
  // Land on the start of the next line, so the call goes in on a line of its own
  // rather than trailing the subtitle.
  const nl = doc.indexOf("\n", at);
  return nl < 0 ? doc.length : nl + 1;
}

/** Insert a table of contents after the title block, once. */
export function addContents(doc: string, lang: "he" | "en" = "he", depth: number | null = null): Edit | null {
  if (!canAddContents(doc)) return null;
  const name = lang === "en" ? "#toc" : "#תוכן";
  const call = depth === null ? `${name}()` : `${name}(${DEPTH_ARG[lang]}: ${depth})`;
  const at = afterTitleBlock(doc);
  const head = doc.slice(0, at);
  const rest = doc.slice(at).replace(/^\s*/, "");
  // `head` already ends in the newline that `afterTitleBlock` landed on, so the
  // call needs no separator in front of it — only the blank line behind it.
  return { text: `${head}${call}\n\n${rest}`, caret: at + call.length };
}

// ---------------------------------------------------------------- what enters it
//
// > *"Choose exactly what enters the table of contents, including excluding
// > individual headings."*
//
// Neither half was expressible. `#תוכן` took a title and a numbering scheme and
// nothing about **which headings**, so every heading in the document went in and
// that was the end of it — a sefer with a heading per se'if got a contents
// hundreds of lines long, and the title page's own heading was in it too.
//
// Two answers, because they are two questions. *How deep* is a property of the
// contents and is one number on the call. *Not this one* is a property of a
// heading, and the writer marks it where the heading is.

/** The argument that says how many levels enter, in each language. */
const DEPTH_ARG: Record<"he" | "en", string> = { he: "עומק", en: "depth" };
/** The argument on a heading that keeps it out, in each language. */
const IN_CONTENTS_ARG: Record<"he" | "en", string> = { he: "בתוכן", en: "outlined" };
/** Both spellings of both, for reading a call written in either language. */
const ANY_DEPTH = /(?:^|,)\s*(?:עומק|depth)\s*:\s*([^,]*)/;
const ANY_IN_CONTENTS = /(?:^|,)\s*(?:בתוכן|outlined)\s*:\s*(?:false|לא)\s*(?=,|$)/;

/** The `#תוכן` call this document has, if it has one. */
export function contentsCall(doc: string): { from: number; to: number; args: string; lang: "he" | "en" } | null {
  const n = scan(doc).nodes.find((x) => x.name === "תוכן" || x.name === "toc");
  if (!n) return null;
  return {
    from: n.from,
    to: n.to,
    args: n.args ? doc.slice(n.args.from, n.args.to) : "",
    lang: n.lang,
  };
}

/** How deep this document's contents goes, or `null` for "every level". */
export function contentsDepth(doc: string): number | null {
  const call = contentsCall(doc);
  if (!call) return null;
  const m = ANY_DEPTH.exec(call.args);
  if (!m) return null;
  const n = Number(m[1].trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Set — or clear — the depth of the contents this document already has.
 *
 * `null` is *every level*, which is written by removing the argument rather than
 * by passing a sentinel: `#תוכן()` is what a document that has never been asked
 * the question says, and a writer who goes back to "all" should end up with the
 * call they started with rather than `#תוכן(עומק: none)`.
 *
 * Returns null when there is no contents to change, which is what greys the
 * control rather than silently doing nothing.
 */
export function setContentsDepth(doc: string, depth: number | null): Edit | null {
  const call = contentsCall(doc);
  if (!call) return null;
  const rest = call.args.replace(ANY_DEPTH, "").replace(/^\s*,\s*/, "").trim();
  const arg = depth === null ? "" : `${DEPTH_ARG[call.lang]}: ${depth}`;
  const inner = [arg, rest].filter(Boolean).join(", ");
  const name = call.lang === "en" ? "#toc" : "#תוכן";
  const replacement = `${name}(${inner})`;
  const text = doc.slice(0, call.from) + replacement + doc.slice(call.to);
  return { text, caret: call.from + replacement.length };
}

/** Does this heading enter the table of contents? */
export function inContents(doc: string, h: HeadingInfo): boolean {
  if (h.argsFrom === null || h.argsTo === null) return true;
  return !ANY_IN_CONTENTS.test(doc.slice(h.argsFrom, h.argsTo));
}

/**
 * Keep this heading out of the contents, or put it back.
 *
 * The argument reaches Typst's own `heading(outlined:)` — the prelude passes a
 * heading's strays straight through — so this is a name for something the
 * engine could always do and nothing could say. In Hebrew it is `בתוכן`, which
 * is the word the rest of the vocabulary would use; `outlined` keeps working,
 * and a document written in English gets that one.
 *
 * Never renumbers and never moves anything: a heading that is out of the
 * contents is still a heading, still numbered, still foldable, still in the
 * outline pane. It is one line of the contents that is not printed.
 */
export function toggleInContents(doc: string, h: HeadingInfo, pos = -1): Edit | null {
  const arg = `${IN_CONTENTS_ARG[h.lang]}: false`;
  // The writer is in the heading's text, not in its argument list. Parking the
  // caret on the argument this writes left it between `)` and `[`, where the
  // next character typed splits the call in two — so a caret already past the
  // edit moves with it and everything else keeps the old behaviour.
  const carry = (from: number, delta: number, fallback: number) =>
    pos >= from ? pos + delta : fallback;
  if (!inContents(doc, h)) {
    // Put it back: strip the argument, and the empty `()` with it if that is
    // all there was. `#כותרת1()` is legal and ugly, and it is not what the
    // document looked like before the writer pressed this.
    const inner = doc.slice(h.argsFrom!, h.argsTo!).replace(ANY_IN_CONTENTS, "").replace(/^\s*,\s*/, "").trim();
    const from = inner ? h.argsFrom! : h.nameTo;
    const to = inner ? h.argsTo! : h.argsTo! + 1;
    const text = doc.slice(0, from) + inner + doc.slice(to);
    return { text, caret: carry(to, inner.length - (to - from), from + inner.length) };
  }
  if (h.argsFrom === null || h.argsTo === null) {
    // No argument list at all: give it one, immediately after the name.
    const text = `${doc.slice(0, h.nameTo)}(${arg})${doc.slice(h.nameTo)}`;
    return { text, caret: carry(h.nameTo, arg.length + 2, h.nameTo + arg.length + 2) };
  }
  const inner = doc.slice(h.argsFrom, h.argsTo).trim();
  const merged = inner ? `${inner}, ${arg}` : arg;
  const text = doc.slice(0, h.argsFrom) + merged + doc.slice(h.argsTo);
  return { text, caret: carry(h.argsTo, merged.length - (h.argsTo - h.argsFrom), h.argsFrom + merged.length) };
}

/**
 * A heading can always be taken out of the contents, and always put back.
 *
 * Its own predicate rather than a bare `true` because the structure action needs
 * one, and because a `#סימן` — whose level is pinned in the prelude — is *not* an
 * exception here: the level is fixed, the outline flag is an ordinary stray, and
 * the two have nothing to do with each other.
 */
export function canToggleInContents(): boolean {
  return true;
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

// ---------------------------------------------------------------- any level
//
// `#כותרת(רמה: 4)` is what the registry ships for *"heading at any level"*, and
// the 4 is a literal. So the command described as taking any level took one
// level, silently, and the margin note said exactly that: **"Heading, any
// level" quietly inserts level 4.**
//
// Four is not even a bad guess — levels 1 to 3 have commands of their own, so 4
// is where "any level" starts being useful. What is wrong is that it is a
// guess at all, made in a registry that has never seen the document, when the
// document knows the answer: the heading you are standing under.

/**
 * The level a heading inserted at `pos` should take.
 *
 * One below the section the caret is in, clamped to what the engine has, and 1
 * when there is no heading above it yet. The same shape as `continueSeries`:
 * read the document rather than ship a number.
 */
export function levelUnder(doc: string, pos: number, all: HeadingInfo[] = headings(doc)): number {
  const here = sectionAt(doc, pos, all);
  return here ? Math.min(here.level + 1, MAX_LEVEL) : 1;
}

/** The `רמה:` / `level:` argument in `#כותרת`, as one that fits where it lands. */
export function continueLevel(doc: string, pos: number, snippet: string): string {
  const m = /^#(כותרת|hlevel)\((רמה|level):\s*\d+/u.exec(snippet.trim());
  if (!m) return snippet;
  return snippet.replace(/(\((?:רמה|level):\s*)\d+/u, `$1${levelUnder(doc, pos)}`);
}
