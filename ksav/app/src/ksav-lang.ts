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
import { foldService, codeFolding } from "@codemirror/language";

// ---- shared scanning -------------------------------------------------------

const NAME = "[A-Za-z\\u0590-\\u05FF_][A-Za-z0-9\\u0590-\\u05FF_]*";
const CMD_RE = new RegExp("#(" + NAME + ")", "g");

export interface CmdSpan {
  cmdStart: number; // position of '#'
  nameEnd: number; // position just after the command name
  name: string;
  /** Position of '(' when the command takes arguments, else null. */
  argOpen: number | null;
  /** Position of the matching ')', else null. */
  argClose: number | null;
  open: number | null; // position of '['
  close: number | null; // position of matching ']'
}

/**
 * Scan forward from `at` over a balanced group, returning the closer's index.
 *
 * Deliberately does NOT treat `"` as a string delimiter. Hebrew writes
 * abbreviations with gershayim — רש"י, שו"ע, רמב"ם, ע"ב — and a document is full
 * of them, so skipping from one `"` to the next swallows everything up to the
 * next abbreviation and the group never closes. (That bug ate whole tables:
 * `#טבלה(… תא[רש"י] …)` scanned to end-of-document and the table fell out of
 * prose mode and out of the Markdown export as raw markup.)
 *
 * The cost is a genuine but far rarer case: an unbalanced bracket inside a Typst
 * string literal, e.g. `#הערה_זרם("a)b")`. Hebrew quotes beat exotic strings.
 */
function matchGroup(text: string, at: number, open: string, close: string): number | null {
  let depth = 1;
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return null;
}

/**
 * Find every `#command`, its optional `(...)` arguments, and its `[...]` body.
 *
 * The argument group matters more than it looks: this used to recognise only
 * `#name[`, so every command that takes arguments — `#צבע(rgb("#b91c1c"))[…]`,
 * `#גודל_גופן(14pt)[…]`, `#הערה_זרם("מקורות")[…]`, `#כותרת(רמה: 4)[…]` — was
 * invisible to prose mode and showed up as literal markup in the middle of the
 * "looks like Word" view.
 */
export function scanCommands(text: string): CmdSpan[] {
  const spans: CmdSpan[] = [];
  CMD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CMD_RE.exec(text))) {
    const cmdStart = m.index;
    const name = m[1];
    const nameEnd = cmdStart + 1 + name.length;
    let argOpen: number | null = null;
    let argClose: number | null = null;
    let bodyAt = nameEnd;
    if (text[nameEnd] === "(") {
      const end = matchGroup(text, nameEnd, "(", ")");
      if (end != null) {
        argOpen = nameEnd;
        argClose = end;
        bodyAt = end + 1;
      }
    }
    let open: number | null = null;
    let close: number | null = null;
    if (text[bodyAt] === "[") {
      open = bodyAt;
      close = matchGroup(text, bodyAt, "[", "]");
    }
    spans.push({ cmdStart, nameEnd, name, argOpen, argClose, open, close });
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
  // These all take a `(...)` argument, which prose mode could not even see until
  // scanCommands learned to skip an argument group — so they used to appear as
  // literal `#צבע(rgb("#b91c1c"))[…]` in the middle of the "looks like Word" view.
  צבע: "pm-color",
  color: "pm-color",
  רקע: "pm-mark",
  bg: "pm-mark",
  גודל_גופן: "pm-big",
  fsize: "pm-big",
  מרווח_אותיות: "pm-tracked",
  track: "pm-tracked",
  גופן_שונה: "pm-otherfont",
  usefont: "pm-otherfont",
  רברבתי: "pm-scaps",
  scaps: "pm-scaps",
  עילי: "pm-sup",
  sup: "pm-sup",
  תחתי: "pm-sub",
  sub_: "pm-sub",
  הזחה: "pm-indent",
  indent_: "pm-indent",
  מימין_לשמאל: "pm-rtl",
  rtl_: "pm-rtl",
  משמאל_לימין: "pm-ltr",
  ltr_: "pm-ltr",
  // Torah layer.
  סימן: "pm-h1",
  siman: "pm-h1",
  סעיף: "pm-seif",
  seif: "pm-seif",
  אות: "pm-bold",
  osource: "pm-bold",
  פסוק: "pm-verse",
  verse: "pm-verse",
  ציון: "pm-source",
  refmark: "pm-source",
  גמרא: "pm-gemara",
  gemara: "pm-gemara",
};

const hide = Decoration.replace({});

/**
 * Commands that take no body and so have nothing to "style" — in prose mode they
 * should look like the thing they produce, not like their own name.
 */
const SELF_CLOSING: Record<string, { cls: string; text: string }> = {
  קו_מפריד: { cls: "pm-hr", text: "" },
  hrule: { cls: "pm-hr", text: "" },
  חסר: { cls: "pm-blank", text: "\u00a0\u00a0\u00a0\u00a0\u00a0" },
  blank: { cls: "pm-blank", text: "\u00a0\u00a0\u00a0\u00a0\u00a0" },
  מעבר_עמוד: { cls: "pm-pagebreak", text: "— — —" },
  pbreak: { cls: "pm-pagebreak", text: "— — —" },
  מעבר_טור: { cls: "pm-pagebreak", text: "⋮" },
  cbreak: { cls: "pm-pagebreak", text: "⋮" },
  תמונה: { cls: "pm-image", text: "🖼" },
  img: { cls: "pm-image", text: "🖼" },
  תוכן: { cls: "pm-toc", text: "⧉" },
  toc: { cls: "pm-toc", text: "⧉" },
  סמן: { cls: "pm-anchor", text: "⚑" },
  anchor: { cls: "pm-anchor", text: "⚑" },
  הפניה: { cls: "pm-xref", text: "↗" },
  xref: { cls: "pm-xref", text: "↗" },
  הערות_בסוף: { cls: "pm-apparatus", text: "▤ הערות" },
  endnotes: { cls: "pm-apparatus", text: "▤ notes" },
  הערות_מדורגות: { cls: "pm-apparatus", text: "▤ מדורים" },
  banded_notes: { cls: "pm-apparatus", text: "▤ bands" },
  הערות_בסוף_צד: { cls: "pm-apparatus", text: "▤ הערות" },
  endnotes_side: { cls: "pm-apparatus", text: "▤ notes" },
};

/** A small inline stand-in for a body-less command. */
class MarkWidget extends WidgetType {
  constructor(readonly cls: string, readonly text: string) {
    super();
  }
  eq(o: MarkWidget) {
    return o.cls === this.cls && o.text === this.text;
  }
  toDOM() {
    const n = document.createElement("span");
    n.className = this.cls;
    n.textContent = this.text;
    return n;
  }
  ignoreEvent() {
    return false;
  }
}

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
  constructor(readonly label: string, readonly title: string) {
    super();
  }
  eq(o: FootnoteWidget) {
    return o.label === this.label && o.title === this.title;
  }
  toDOM() {
    const s = document.createElement("sup");
    s.className = "pm-fn";
    s.textContent = this.label;
    // The note's own text, so a writer can read it without revealing markup.
    s.title = this.title;
    return s;
  }
}
/**
 * Every note command, mapped to the apparatus it belongs to and how that
 * apparatus numbers.
 *
 * The chip number used to be a single running counter over *all* note kinds, so
 * the preview's superscripts simply did not match the printed page: real output
 * numbers each stream independently and letters the upper bands (א,ב). Grouping
 * by family and using each family's own default scheme gets the preview to agree
 * with the PDF for any document that has not overridden the numbering itself.
 */
type NoteScheme = "1" | "א" | "a";
interface NoteKind {
  family: string;
  scheme: NoteScheme;
}
const NOTE_KINDS: Record<string, NoteKind> = {};
const addNotes = (family: string, scheme: NoteScheme, names: string[]) => {
  for (const n of names) NOTE_KINDS[n] = { family, scheme };
};

// The one native page-foot series: plain footnotes, sub-notes, mekoros notes and
// every tier of the layered notes all land in it, in one running sequence.
addNotes("native", "1", [
  "הערה", "fnote", "הערה_על_הערה", "subnote", "מראה_מקום", "sourcenote",
  "הערה_א", "הערה_ב", "הערה_ג", "הערה_ד", "הערה_ה", "הערה_ו", "הערה_ז",
  "tier1", "tier2", "tier3", "tier4", "tier5", "tier6", "tier7",
  "הערה_בדרגה", "tier",
]);
// Section bands and per-page bands: one independent sequence per tier, and the
// engine letters tiers 2 and 3 by default.
const BAND_TIERS: [string, NoteScheme][] = [["א", "1"], ["ב", "א"], ["ג", "a"], ["ד", "1"], ["ה", "א"], ["ו", "a"], ["ז", "1"]];
BAND_TIERS.forEach(([letter, scheme], i) => {
  addNotes(`band${i + 1}`, scheme, [`מדור_${letter}`, `band${i + 1}`]);
  addNotes(`pageband${i + 1}`, scheme, [`מדף_${letter}`, `pageband${i + 1}`]);
});
addNotes("band1", "1", ["מדור_בדרגה", "band"]);
addNotes("pageband1", "1", ["מדף_בדרגה", "pageband"]);
// Independent per-page streams — the sources stream is lettered by convention.
addNotes("stream-content", "1", ["הערת_תוכן", "contentnote"]);
addNotes("stream-source", "א", ["הערת_מקור", "sourcenote_stream"]);
addNotes("stream-other", "1", ["הערה_זרם", "stream_note"]);
// Endnotes, and the margin apparatuses.
addNotes("endnote", "1", ["הערתסיום", "endnote"]);
addNotes("sidenote", "1", ["הערת_גיליון", "sidenote"]);
addNotes("side-right", "1", ["הערת_ימין", "noteright"]);
addNotes("side-left", "1", ["הערת_שמאל", "noteleft"]);

const FOOTNOTE_NAMES = new Set(Object.keys(NOTE_KINDS));

const HEB_LETTERS = "אבגדהוזחטיכלמנסעפצקרשת".split("");
/** Render `n` (1-based) in an apparatus's own numbering scheme. */
function noteLabel(scheme: NoteScheme, n: number): string {
  if (scheme === "א") return HEB_LETTERS[(n - 1) % HEB_LETTERS.length];
  if (scheme === "a") return String.fromCharCode(97 + ((n - 1) % 26));
  return String(n);
}

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

// ---- tables: rendered as a real grid in prose mode ----

const TABLE_OPEN_RE = /#(טבלה|mktable)\s*\(/gu;
const CELL_RE = /(כותרת_תא|headcell|תא|cell|מיזוג|colspan_)\s*(?:\(\s*(\d+)\s*\))?\s*\[/gu;

// A table cell rendered only bold/italic/underline/strike/code, so a cell using
// anything else — a colour, a highlight, small caps — showed its raw markup
// inside an otherwise WYSIWYG table. These are the same styles the body honours.
const INLINE_TAG: Record<string, [string, string]> = {
  הדגשה: ["<strong>", "</strong>"],
  bold: ["<strong>", "</strong>"],
  נטוי: ["<em>", "</em>"],
  italic: ["<em>", "</em>"],
  קו_תחתון: ["<u>", "</u>"],
  uline: ["<u>", "</u>"],
  קו_חוצה: ["<s>", "</s>"],
  sthrough: ["<s>", "</s>"],
  קוד: ["<code>", "</code>"],
  mono: ["<code>", "</code>"],
  סימון: ['<span class="pm-mark">', "</span>"],
  mark: ['<span class="pm-mark">', "</span>"],
  רקע: ['<span class="pm-mark">', "</span>"],
  bg: ['<span class="pm-mark">', "</span>"],
  צבע: ['<span class="pm-color">', "</span>"],
  color: ['<span class="pm-color">', "</span>"],
  רברבתי: ['<span class="pm-scaps">', "</span>"],
  scaps: ['<span class="pm-scaps">', "</span>"],
  עילי: ["<sup>", "</sup>"],
  sup: ["<sup>", "</sup>"],
  תחתי: ["<sub>", "</sub>"],
  sub_: ["<sub>", "</sub>"],
  גדול: ['<span class="pm-big">', "</span>"],
  big: ['<span class="pm-big">', "</span>"],
  קטן: ['<span class="pm-small">', "</span>"],
  tiny: ['<span class="pm-small">', "</span>"],
  דיבור_המתחיל: ["<strong>", "</strong>"],
  dh: ["<strong>", "</strong>"],
  ציון: ['<span class="pm-source">', "</span>"],
  refmark: ['<span class="pm-source">', "</span>"],
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Render a cell's Ksav markup to safe HTML: known inline commands become tags,
// unknown wrappers keep only their content, everything is HTML-escaped.
function renderInline(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    // `(?:\([^()]*\))?` skips a command's argument group, so `#צבע(rgb("…"))[…]`
    // in a cell renders its content instead of printing its own arguments.
    const m = text.slice(i).match(/#([A-Za-z֐-׿_][A-Za-z0-9֐-׿_]*)\s*(?:\([^()]*\))?\s*\[/u);
    if (!m) {
      out += escapeHtml(text.slice(i));
      break;
    }
    const cmdIdx = i + m.index!;
    out += escapeHtml(text.slice(i, cmdIdx));
    const openBr = cmdIdx + m[0].length - 1;
    const closeBr = matchInText(text, openBr);
    if (closeBr == null) {
      out += escapeHtml(text.slice(cmdIdx));
      break;
    }
    const inner = renderInline(text.slice(openBr + 1, closeBr));
    const tag = INLINE_TAG[m[1]];
    out += tag ? tag[0] + inner + tag[1] : inner;
    i = closeBr + 1;
  }
  return out;
}

interface TableModel {
  cols: number;
  cells: { html: string; header: boolean; span: number }[];
}

// Parse `#טבלה(עמודות: N, תא[…], כותרת_תא[…], מיזוג(k)[…], …)` into a grid model.
function parseTable(text: string, openParen: number, closeParen: number): TableModel {
  const inner = text.slice(openParen + 1, closeParen);
  const colsMatch = inner.match(/(?:עמודות|columns)\s*:\s*(\d+)/);
  const cols = Math.max(1, colsMatch ? parseInt(colsMatch[1], 10) : 2);
  const cells: TableModel["cells"] = [];
  CELL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CELL_RE.exec(inner))) {
    const openBr = m.index + m[0].length - 1;
    const closeBr = matchInText(inner, openBr);
    if (closeBr == null) break;
    const header = m[1] === "כותרת_תא" || m[1] === "headcell";
    const merge = m[1] === "מיזוג" || m[1] === "colspan_";
    const span = merge && m[2] ? Math.max(1, parseInt(m[2], 10)) : 1;
    cells.push({ html: renderInline(inner.slice(openBr + 1, closeBr)), header, span });
    CELL_RE.lastIndex = closeBr + 1; // skip nested cells (e.g. a table inside a cell)
  }
  return { cols, cells };
}

function tableHtml(model: TableModel): string {
  let html = '<table class="pm-tbl"><tbody>';
  let col = 0;
  let open = false;
  for (const c of model.cells) {
    if (col === 0) {
      html += "<tr>";
      open = true;
    }
    const tag = c.header ? "th" : "td";
    const span = c.span > 1 ? ` colspan="${c.span}"` : "";
    html += `<${tag}${span}>${c.html || "&nbsp;"}</${tag}>`;
    col += c.span;
    if (col >= model.cols) {
      html += "</tr>";
      open = false;
      col = 0;
    }
  }
  if (open) html += "</tr>";
  return html + "</tbody></table>";
}

// A block widget that renders a Ksav table as an HTML grid in prose mode.
class TableWidget extends WidgetType {
  constructor(readonly html: string) {
    super();
  }
  eq(o: TableWidget) {
    return o.html === this.html;
  }
  toDOM() {
    const d = document.createElement("div");
    d.className = "pm-table-wrap";
    d.title = "לחצו כדי לערוך · click to edit";
    d.innerHTML = this.html;
    return d;
  }
  // Let clicks through to the editor so the cursor lands on the table and the
  // raw markup reveals for editing (same touch-to-reveal as the rest of prose).
  ignoreEvent() {
    return false;
  }
}

function proseDecorations(state: EditorState): DecorationSet {
  const reveal = state.field(revealAll, false);
  const sel = state.selection;
  const ranges: { from: number; to: number; deco: Decoration; side: number }[] = [];
  const text = state.doc.toString();
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

  // ---- list coverage (outermost lists), used to keep a nested table raw ----
  const listSpans: { from: number; to: number }[] = [];
  LIST_OPEN_RE.lastIndex = 0;
  let ls: RegExpExecArray | null;
  while ((ls = LIST_OPEN_RE.exec(text))) {
    if (inComment(ls.index) || insideFootnote(ls.index)) continue;
    const op = ls.index + ls[0].length - 1;
    const cp = matchInText(text, op);
    if (cp == null) continue;
    if (ls.index < (listSpans[listSpans.length - 1]?.to ?? -1)) continue; // nested
    listSpans.push({ from: ls.index, to: cp });
  }
  const insideList = (pos: number) => listSpans.some((s) => pos > s.from && pos <= s.to);

  // ---- tables: render `#טבלה(…)` as a real grid (a block widget) ----
  // Block widgets and line-break-spanning replaces are only legal from a
  // StateField (not a plugin) — which is why prose mode is a StateField. A table
  // is rendered only when it stands on its own line(s) and isn't inside a
  // footnote/list/comment or under the cursor; otherwise it stays editable raw.
  const tableSpans: { from: number; to: number }[] = [];
  TABLE_OPEN_RE.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = TABLE_OPEN_RE.exec(text))) {
    const cmdStart = tm.index;
    if (inComment(cmdStart) || insideFootnote(cmdStart) || insideList(cmdStart)) continue;
    const openParen = cmdStart + tm[0].length - 1;
    const closeParen = matchInText(text, openParen);
    if (closeParen == null) continue;
    const startLine = state.doc.lineAt(cmdStart);
    const endLine = state.doc.lineAt(closeParen);
    // Block-eligible only if the markup owns whole lines (nothing else on them).
    const clean =
      text.slice(startLine.from, cmdStart).trim() === "" &&
      text.slice(closeParen + 1, endLine.to).trim() === "";
    if (!clean) continue;
    if (touchedAt(startLine.from, endLine.to)) continue; // editing: show raw
    const html = tableHtml(parseTable(text, openParen, closeParen));
    ranges.push({
      from: startLine.from,
      to: endLine.to,
      deco: Decoration.replace({ widget: new TableWidget(html), block: true }),
      side: 0,
    });
    tableSpans.push({ from: startLine.from, to: endLine.to });
  }
  const insideTable = (pos: number) => tableSpans.some((s) => pos >= s.from && pos <= s.to);

  for (const c of comments) {
    if (touchedAt(c.from, c.to)) continue;
    if (insideFootnote(c.from) || insideTable(c.from)) continue; // covered by another widget
    // A plugin-provided `replace` decoration may NOT span a line break —
    // CodeMirror throws "Decorations that replace line breaks may not be
    // specified via plugins". So we only hide single-line comments (inline `//`,
    // a solo `//{`/`//}` region marker, or a one-line `/* */`); a multi-line
    // block comment is left visible (greyed) rather than risking a crash. A solo
    // marker line collapses to an empty line, which reads as a normal break.
    if (c.to > state.doc.lineAt(c.from).to) continue; // multi-line: skip
    if (c.from < c.to) ranges.push({ from: c.from, to: c.to, deco: hide, side: -1 });
  }

  // ---- lists: hide scaffolding, show bullets/numbers (WYSIWYG) ----
  LIST_OPEN_RE.lastIndex = 0;
  let lm: RegExpExecArray | null;
  while ((lm = LIST_OPEN_RE.exec(text))) {
    const cmdStart = lm.index;
    if (inComment(cmdStart)) continue; // commented-out list: leave to the comment hider
    if (insideFootnote(cmdStart) || insideTable(cmdStart)) continue; // covered by another widget
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

  // One counter per apparatus, not one for the whole document.
  const fnCounts: Record<string, number> = {};
  for (const s of allCmds) {
    if (inComment(s.cmdStart)) continue; // commented-out command: hidden by the comment hider
    if (insideFootnote(s.cmdStart) || insideTable(s.cmdStart)) continue; // covered by another widget

    // ---- commands with no body: shown as the thing they produce ----
    const block = SELF_CLOSING[s.name];
    if (block && s.open == null) {
      const to = s.argClose != null ? s.argClose + 1 : s.nameEnd;
      if (!touchedAt(s.cmdStart, to)) {
        ranges.push({
          from: s.cmdStart,
          to,
          deco: Decoration.replace({ widget: new MarkWidget(block.cls, block.text) }),
          side: 0,
        });
      }
      continue;
    }

    // footnotes -> a numbered superscript chip (body hidden)
    const kind = NOTE_KINDS[s.name];
    if (kind && s.open != null && s.close != null) {
      const n = (fnCounts[kind.family] = (fnCounts[kind.family] ?? 0) + 1);
      if (!touchedAt(s.cmdStart, s.close + 1)) {
        ranges.push({
          from: s.cmdStart,
          to: s.close + 1,
          deco: Decoration.replace({
            widget: new FootnoteWidget(
              noteLabel(kind.scheme, n),
              text.slice(s.open + 1, s.close).replace(/#[^\[]*\[|[[\]]/g, " ").trim(),
            ),
          }),
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

    // hide "#name(args)[" and the matching "]" — the argument group included, or
    // a coloured run would still read as `#צבע(rgb("#b91c1c"))` on the page.
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

// A collapsed fold shows a meaningful label instead of a bare "…": the region's
// name, the heading title, or the command being folded. This is what makes a
// collapsed block still readable — you see what you named it.
function foldLabelText(state: EditorState, range: { from: number; to: number }): string {
  const text = state.doc.lineAt(range.from).text;
  const region = text.match(/\/\/\{\s*(.*)$/); // //{ label
  if (region) return region[1].trim() || "…";
  if (headingLevel(text) != null) {
    const title = [...text.matchAll(/\[([^[\]]*)\]/g)].map((m) => m[1]).join(" ").trim();
    return title || "…";
  }
  const star = text.match(/\/\*\s*(.*)$/); // /* comment
  if (star) return (star[1].replace(/\*\/.*$/, "").trim() || "הערה") + " …";
  const cmd = text.match(/#([A-Za-z֐-׿_][\w֐-׿]*)/u);
  if (cmd) return cmd[1] + " …";
  return "…";
}

/** codeFolding wired to show the region/heading/list label on the collapsed chip. */
export const ksavFolding = codeFolding({
  preparePlaceholder: (state, range) => foldLabelText(state, range),
  placeholderDOM: (_view, onclick, prepared) => {
    const s = document.createElement("span");
    s.className = "cm-foldPlaceholder ksav-fold-label";
    s.textContent = "⋯ " + (typeof prepared === "string" ? prepared : "") + " ⋯";
    s.title = "לחצו כדי לפרוש · click to unfold";
    s.setAttribute("aria-label", "folded");
    s.onclick = onclick;
    return s;
  },
});

// Prose mode is a StateField (not a ViewPlugin) because it emits block widgets
// (rendered tables) and line-break-spanning replaces, which CodeMirror only
// permits from a field. It recomputes on edits, selection moves, and the
// reveal-all (Alt) toggle — it doesn't depend on the viewport.
export const proseMode = StateField.define<DecorationSet>({
  create: (state) => proseDecorations(state),
  update(deco, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setRevealAll)))
      return proseDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});
