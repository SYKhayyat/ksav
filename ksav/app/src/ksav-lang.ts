// Ksav editor language features for CodeMirror 6:
//   1. ksavHighlighter — colors `#command` tokens and brackets (raw/code mode).
//   2. proseMode       — hides the command syntax and renders the content with
//                        the real style (bold shows bold, headings look like
//                        headings). The command under the cursor, or all
//                        commands while Alt is held, reveal their raw markup so
//                        you can always edit.

import { EditorView, ViewPlugin, Decoration, ViewUpdate, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { foldService } from "@codemirror/language";

// ---- shared scanning -------------------------------------------------------

const NAME = "[A-Za-z\\u0590-\\u05FF_][A-Za-z0-9\\u0590-\\u05FF_]*";
const CMD_RE = new RegExp("#(" + NAME + ")", "g");

export interface CmdSpan {
  cmdStart: number; // position of '#'
  nameEnd: number; // position just after the command name
  name: string;
  open: number | null; // position of '['
  close: number | null; // position of matching ']'
}

/** Find every `#command` and, when present, its balanced `[...]`. */
export function scanCommands(text: string): CmdSpan[] {
  const spans: CmdSpan[] = [];
  CMD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CMD_RE.exec(text))) {
    const cmdStart = m.index;
    const name = m[1];
    const nameEnd = cmdStart + 1 + name.length;
    let open: number | null = null;
    let close: number | null = null;
    if (text[nameEnd] === "[") {
      open = nameEnd;
      let depth = 1;
      let j = nameEnd + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "[") depth++;
        else if (text[j] === "]") depth--;
        j++;
      }
      if (depth === 0) close = j - 1;
    }
    spans.push({ cmdStart, nameEnd, name, open, close });
  }
  return spans;
}

// ---- raw-mode syntax highlighting -----------------------------------------

const cmdMark = Decoration.mark({ class: "ksav-cmd" });
const bracketMark = Decoration.mark({ class: "ksav-bracket" });
const commentMark = Decoration.mark({ class: "ksav-comment" });

// Comment spans in a chunk of text: /* block */ and // line (not part of ://).
function scanComments(text: string): { from: number; to: number }[] {
  const spans: { from: number; to: number }[] = [];
  for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g)) {
    spans.push({ from: m.index!, to: m.index! + m[0].length });
  }
  for (const m of text.matchAll(/(^|[^:])(\/\/[^\n]*)/g)) {
    const start = m.index! + m[1].length;
    spans.push({ from: start, to: start + m[2].length });
  }
  return spans;
}

function highlightDecorations(view: EditorView): DecorationSet {
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    const comments = scanComments(text);
    const inComment = (i: number) => comments.some((c) => i >= c.from && i < c.to);
    for (const c of comments) {
      ranges.push({ from: from + c.from, to: from + c.to, deco: commentMark });
    }
    for (const s of scanCommands(text)) {
      if (inComment(s.cmdStart)) continue; // don't colorize commands inside comments
      ranges.push({ from: from + s.cmdStart, to: from + s.nameEnd, deco: cmdMark });
      if (s.open != null)
        ranges.push({ from: from + s.open, to: from + s.open + 1, deco: bracketMark });
      if (s.close != null)
        ranges.push({ from: from + s.close, to: from + s.close + 1, deco: bracketMark });
    }
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(
    ranges.map((r) => r.deco.range(r.from, r.to)),
    true,
  );
}

export const ksavHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = highlightDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged)
        this.decorations = highlightDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ---- prose mode ------------------------------------------------------------

// command name -> CSS class applied to its content when syntax is hidden
const PROSE_STYLE: Record<string, string> = {
  הדגשה: "pm-bold",
  bold: "pm-bold",
  נטוי: "pm-italic",
  italic: "pm-italic",
  קו_תחתון: "pm-underline",
  uline: "pm-underline",
  קו_חוצה: "pm-strike",
  sthrough: "pm-strike",
  סימון: "pm-mark",
  mark: "pm-mark",
  גדול: "pm-big",
  big: "pm-big",
  קטן: "pm-small",
  tiny: "pm-small",
  שער: "pm-title",
  title: "pm-title",
  תת_שער: "pm-subtitle",
  subtitle: "pm-subtitle",
  כותרת1: "pm-h1",
  h1: "pm-h1",
  כותרת2: "pm-h2",
  h2: "pm-h2",
  כותרת3: "pm-h3",
  h3: "pm-h3",
  מרכז: "pm-center",
  center_: "pm-center",
  ימין: "pm-right",
  right_: "pm-right",
  שמאל: "pm-left",
  left_: "pm-left",
  כותרת4: "pm-h3",
  כותרת5: "pm-h3",
  כותרת6: "pm-h3",
  ציטוט: "pm-quote",
  blockquote: "pm-quote",
  מקור: "pm-source",
  cite_: "pm-source",
  קוד: "pm-code",
  mono: "pm-code",
  הערת_צד: "pm-callout",
  callout: "pm-callout",
  אזהרה: "pm-warn",
  warnbox: "pm-warn",
  הצלחה: "pm-ok",
  okbox: "pm-ok",
  תיבה: "pm-box",
  framebox: "pm-box",
  דיבור_המתחיל: "pm-bold",
  dh: "pm-bold",
};

const hide = Decoration.replace({});

/** Toggle for "reveal all raw markup" (bound to the Alt key). */
export const setRevealAll = StateEffect.define<boolean>();
export const revealAll = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setRevealAll)) value = e.value;
    return value;
  },
});

// A small inline widget rendering a bullet or number in prose mode.
class LabelWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(o: LabelWidget) {
    return o.text === this.text;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "pm-bullet";
    s.textContent = this.text;
    return s;
  }
}

// A numbered footnote marker chip (the body is hidden in prose mode).
class FootnoteWidget extends WidgetType {
  constructor(readonly n: number) {
    super();
  }
  eq(o: FootnoteWidget) {
    return o.n === this.n;
  }
  toDOM() {
    const s = document.createElement("sup");
    s.className = "pm-fn";
    s.textContent = String(this.n);
    return s;
  }
}
const FOOTNOTE_NAMES = new Set(["הערה", "fnote", "מראה_מקום", "sourcenote"]);

// Match the delimiter (`[` or `(`) at `openPos` within a text string.
function matchInText(text: string, openPos: number): number | null {
  const open = text[openPos];
  const close = open === "[" ? "]" : ")";
  let depth = 1;
  for (let i = openPos + 1; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

const LIST_OPEN_RE = /#(רשימה|ממוספרת|bullets|numbered)\s*\(/gu;
// Group 1 captures the character before the item name (or start-of-string) as a
// word boundary: without it, a longer word ending in פריט (e.g. תפריט[…]) or
// `subitem[…]` would be mistaken for a list item. A lookbehind would be cleaner
// but isn't supported on Safari < 16.4, so we capture-and-offset instead.
const ITEM_OPEN_RE = /(^|[^A-Za-z0-9֐-׿_])(פריט|item)\s*\[/gu;

function proseDecorations(view: EditorView): DecorationSet {
  const reveal = view.state.field(revealAll, false);
  const sel = view.state.selection;
  const ranges: { from: number; to: number; deco: Decoration; side: number }[] = [];
  const text = view.state.doc.toString();
  const touchedAt = (from: number, to: number) =>
    reveal || sel.ranges.some((r) => r.from <= to && r.to >= from);

  // ---- comments & fold-region markers: hidden in prose (Word-like) mode ----
  // These never render in the compiled output (Typst strips `//` and `/* */`),
  // so in prose mode we hide them too — the region's body then reads as plain
  // text with no visible collapse markers, matching the printed page. A marker
  // is revealed when the cursor touches it or Alt is held, so it stays editable.
  const comments = scanComments(text);
  const inComment = (i: number) => comments.some((c) => i >= c.from && i < c.to);

  // ---- footnote coverage ----
  // A footnote collapses to ONE numbered chip: a full-span `replace` over the
  // whole `#הערה[…]`. Anything nested inside it (bold, a list, another footnote,
  // even a comment) must NOT emit its own decoration, or two `replace` ranges
  // overlap and CodeMirror throws ("Ran out of text content"). We compute the
  // outermost footnote spans up front and skip anything that falls inside one.
  const allCmds = scanCommands(text);
  const topFn: CmdSpan[] = [];
  let fnCover = -1;
  for (const s of allCmds) {
    if (!FOOTNOTE_NAMES.has(s.name) || s.open == null || s.close == null) continue;
    if (inComment(s.cmdStart) || s.cmdStart < fnCover) continue; // nested/commented
    topFn.push(s);
    fnCover = s.close + 1;
  }
  const insideFootnote = (pos: number) =>
    topFn.some((s) => pos > s.cmdStart && pos <= s.close!);

  for (const c of comments) {
    if (touchedAt(c.from, c.to)) continue;
    if (insideFootnote(c.from)) continue; // covered by the footnote chip's replace
    // A plugin-provided `replace` decoration may NOT span a line break —
    // CodeMirror throws "Decorations that replace line breaks may not be
    // specified via plugins". So we only hide single-line comments (inline `//`,
    // a solo `//{`/`//}` region marker, or a one-line `/* */`); a multi-line
    // block comment is left visible (greyed) rather than risking a crash. A solo
    // marker line collapses to an empty line, which reads as a normal break.
    if (c.to > view.state.doc.lineAt(c.from).to) continue; // multi-line: skip
    if (c.from < c.to) ranges.push({ from: c.from, to: c.to, deco: hide, side: -1 });
  }

  // ---- lists: hide scaffolding, show bullets/numbers (WYSIWYG) ----
  LIST_OPEN_RE.lastIndex = 0;
  let lm: RegExpExecArray | null;
  while ((lm = LIST_OPEN_RE.exec(text))) {
    const cmdStart = lm.index;
    if (inComment(cmdStart)) continue; // commented-out list: leave to the comment hider
    if (insideFootnote(cmdStart)) continue; // inside a footnote chip — covered already
    const openParen = lm.index + lm[0].length - 1;
    const closeParen = matchInText(text, openParen);
    if (closeParen == null) continue;
    if (touchedAt(cmdStart, closeParen + 1)) continue;
    const ordered = lm[1] === "ממוספרת" || lm[1] === "numbered";
    ranges.push({ from: cmdStart, to: openParen + 1, deco: hide, side: -1 });
    ranges.push({ from: closeParen, to: closeParen + 1, deco: hide, side: 1 });
    // items directly inside this list. Start at the `(` so it can act as the
    // boundary char (group 1) for an item that immediately follows it.
    ITEM_OPEN_RE.lastIndex = openParen;
    let idx = 0;
    let im: RegExpExecArray | null;
    while ((im = ITEM_OPEN_RE.exec(text)) && im.index < closeParen) {
      const itemNameStart = im.index + im[1].length; // skip the captured boundary char
      const itemOpen = im.index + im[0].length - 1; // the `[`
      const itemClose = matchInText(text, itemOpen);
      if (itemClose == null || itemClose > closeParen) break;
      idx++;
      const bullet = ordered ? `${idx}. ` : "• ";
      ranges.push({
        from: itemNameStart,
        to: itemOpen + 1,
        deco: Decoration.replace({ widget: new LabelWidget(bullet) }),
        side: -1,
      });
      ranges.push({ from: itemClose, to: itemClose + 1, deco: hide, side: 1 });
      if (text[itemClose + 1] === ",")
        ranges.push({ from: itemClose + 1, to: itemClose + 2, deco: hide, side: 1 });
      ITEM_OPEN_RE.lastIndex = itemClose + 1; // skip nested items (handled by their own list)
    }
  }

  let fnCount = 0;
  for (const s of allCmds) {
    if (inComment(s.cmdStart)) continue; // commented-out command: hidden by the comment hider
    if (insideFootnote(s.cmdStart)) continue; // nested inside a footnote chip — don't double-decorate
    // footnotes -> a numbered superscript chip (body hidden)
    if (FOOTNOTE_NAMES.has(s.name) && s.open != null && s.close != null) {
      fnCount++;
      if (!touchedAt(s.cmdStart, s.close + 1)) {
        ranges.push({
          from: s.cmdStart,
          to: s.close + 1,
          deco: Decoration.replace({ widget: new FootnoteWidget(fnCount) }),
          side: 0,
        });
      }
      continue;
    }
    const cls = PROSE_STYLE[s.name];
    if (cls == null || s.open == null || s.close == null) continue;

    const spanFrom = s.cmdStart;
    const spanTo = s.close + 1;
    // Reveal raw markup if Alt is held, or the cursor/selection touches it.
    const touched = touchedAt(spanFrom, spanTo);
    if (touched) continue;

    // hide "#name[" and the matching "]"
    ranges.push({ from: s.cmdStart, to: s.open + 1, deco: hide, side: -1 });
    ranges.push({ from: s.close, to: s.close + 1, deco: hide, side: 1 });
    // style the inner content
    if (s.close > s.open + 1)
      ranges.push({
        from: s.open + 1,
        to: s.close,
        deco: Decoration.mark({ class: cls }),
        side: 0,
      });
  }
  ranges.sort((a, b) => a.from - b.from || a.side - b.side);
  return Decoration.set(
    ranges.map((r) => r.deco.range(r.from, r.to)),
    true,
  );
}

// ---- folding (org-mode style: headings + lists + any multi-line command) ----

// Recognizes a heading line and returns its outline level, else null.
// The trailing `(?![…])` is a word boundary: without it, `#כותרת_תא` (a table
// header cell) and other `כותרת`-prefixed commands would be mistaken for a
// heading, corrupting the outline and fold behavior.
const HEAD_RE =
  /^\s*#(שער|title|תת_שער|subtitle|סימן|siman|כותרת([1-6])?|h([1-6]))(?![A-Za-z0-9֐-׿_])(?:\s*\(\s*(?:רמה|level)\s*:\s*(\d+))?/u;

/** Extract the document outline (headings with level, title, and position). */
export function outline(text: string): { level: number; title: string; from: number }[] {
  const res: { level: number; title: string; from: number }[] = [];
  let pos = 0;
  for (const line of text.split("\n")) {
    const lvl = headingLevel(line);
    if (lvl != null) {
      const titles = [...line.matchAll(/\[([^[\]]*)\]/g)].map((m) => m[1]).join(" ").trim();
      res.push({ level: lvl, title: titles || line.trim(), from: pos });
    }
    pos += line.length + 1; // + newline
  }
  return res;
}

function headingLevel(text: string): number | null {
  const m = HEAD_RE.exec(text);
  if (!m) return null;
  const name = m[1];
  if (name === "תת_שער" || name === "subtitle") return null; // subtitle isn't a section
  if (m[4]) return parseInt(m[4], 10); // explicit רמה: n / level: n
  if (m[2]) return parseInt(m[2], 10); // כותרתN
  if (m[3]) return parseInt(m[3], 10); // hN
  return 1; // שער / title / סימן / bare כותרת
}

// Find the position of the delimiter matching the one at `openPos`.
function matchDelim(state: EditorState, openPos: number): number | null {
  const doc = state.doc;
  const open = doc.sliceString(openPos, openPos + 1);
  const close = open === "[" ? "]" : ")";
  const text = doc.sliceString(openPos, doc.length);
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return openPos + i;
    }
  }
  return null;
}

const CMD_OPEN_RE = /#[A-Za-z֐-׿_][A-Za-z0-9֐-׿_]*[[(]/gu;

/**
 * Fold service:
 *   - a heading folds its whole section (down to the next same-or-higher
 *     heading) — Word / org-mode outline folding;
 *   - a line that opens a multi-line `#command[...]` or `#command(...)`
 *     (a list, table, footnote, or a nested sub-list) folds that block.
 */
export const ksavFold = foldService.of((state, lineStart) => {
  const doc = state.doc;
  const line = doc.lineAt(lineStart);
  const text = line.text;

  // 0) custom fold region: //{ ... //} (Notepad++-style; these are comments,
  //    so they never render — they just mark a collapsible, labelled region).
  const trimmed = text.trimStart();
  if (trimmed.startsWith("//{")) {
    let depth = 1;
    for (let n = line.number + 1; n <= doc.lines; n++) {
      const lt = doc.line(n).text.trimStart();
      if (lt.startsWith("//{")) depth++;
      else if (lt.startsWith("//}")) {
        depth--;
        if (depth === 0) return { from: line.to, to: doc.line(n).to };
      }
    }
    return null;
  }
  // 0b) block comment /* ... */ spanning lines
  const starIdx = text.indexOf("/*");
  if (starIdx >= 0 && text.indexOf("*/", starIdx) < 0) {
    const rest = doc.sliceString(line.from + starIdx, doc.length);
    const close = rest.indexOf("*/");
    if (close >= 0) {
      const closePos = line.from + starIdx + close + 2;
      if (closePos > line.to) return { from: line.from + starIdx + 2, to: closePos - 2 };
    }
  }

  // 1) heading section fold
  const lvl = headingLevel(text);
  if (lvl != null) {
    let end = doc.length;
    for (let n = line.number + 1; n <= doc.lines; n++) {
      const l = doc.line(n);
      const l2 = headingLevel(l.text);
      if (l2 != null && l2 <= lvl) {
        end = l.from - 1;
        break;
      }
    }
    return end > line.to ? { from: line.to, to: end } : null;
  }

  // 2) multi-line bracketed command fold (first such command on the line)
  CMD_OPEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CMD_OPEN_RE.exec(text))) {
    const openPos = line.from + m.index + m[0].length - 1; // the [ or (
    const close = matchDelim(state, openPos);
    if (close != null && close > line.to) {
      return { from: openPos + 1, to: close };
    }
  }
  return null;
});

export const proseMode = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = proseDecorations(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.selectionSet ||
        u.viewportChanged ||
        u.transactions.some((t) => t.effects.some((e) => e.is(setRevealAll)))
      )
        this.decorations = proseDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
