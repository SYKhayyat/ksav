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
import type { EditorState, EditorSelection } from "@codemirror/state";
import { foldService, codeFolding } from "@codemirror/language";
import { FOLD_OPEN, FOLD_CLOSE } from "./hiding";
import { bothSpellings, withAliases } from "./engine.gen";
import {
  DEFER_BODY_COMMANDS,
  DEFER_REF_COMMANDS,
  TIERS,
  TIER_FAMILY,
} from "./note-commands";
import {
  plainText,
  plainTextIn,
  scan,
  splitArgs,
  topLevelColon,
  type Group,
  type ListKind,
  type Node,
  type Scan,
  docTextOf,
  scanDoc,
} from "./spans";

// ---- shared scanning -------------------------------------------------------
//
// There is one scanner and it is `spans.ts`. This file used to hold three of the
// ten private delimiter matchers — `matchGroup`, `matchInText`, `matchDelim` —
// plus eight command-name alternations that disagreed with the ones in
// `headings.ts`, `lists.ts` and `table.ts` about which commands exist. Four of
// the six reproduced one-click contradictions were that disagreement: pressing
// `list.hebrew` ejected a list from prose mode because `LIST_OPEN_RE` had never
// heard of `ממוספרת_עברית`; pressing `heading.demote` on `#h6` erased the
// section from the outline because `HEAD_RE` had never heard of `hlevel`.

/** A comment's range, for a consumer that only cares where they are. */
export type CommentSpan = Group;

// ---- raw-mode syntax highlighting -----------------------------------------

const cmdMark = Decoration.mark({ class: "ksav-cmd" });
const bracketMark = Decoration.mark({ class: "ksav-bracket" });
const commentMark = Decoration.mark({ class: "ksav-comment" });

function highlightDecorations(view: EditorView): DecorationSet {
  // Scan the **whole document**, then filter to what is on screen.
  //
  // This used to scan `doc.sliceString(from, to)` — the viewport — and
  // `spans.ts` is emphatic that a scanner cannot work that way: *"a `"` two
  // lines up decides whether the bracket in hand is structure or prose."* So the
  // same character was coloured differently depending on where the writer had
  // scrolled to, and a `#הערה_זרם("a)b")` whose string opened above the fold
  // took the rest of the screen with it.
  //
  // It also *reduces* work rather than adding it: `proseMode` has already
  // scanned this exact document in this frame, so this is a memo hit keyed on
  // the doc object, and the slice allocation per visible range is gone.
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  const s = scanDoc(view.state.doc);
  const visible = view.visibleRanges;
  const onScreen = (from: number, to: number) =>
    visible.some((v) => from <= v.to && to >= v.from);
  const add = (from: number, to: number, deco: Decoration) => {
    if (onScreen(from, to)) ranges.push({ from, to, deco });
  };
  for (const c of s.comments) add(c.from, c.to, commentMark);
  // Commands inside comments are not nodes at all, so there is nothing to skip.
  for (const n of s.nodes) {
    add(n.from, n.nameTo, cmdMark);
    for (const b of n.bodies) {
      add(b.from - 1, b.from, bracketMark);
      add(b.to, b.to + 1, bracketMark);
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
const PROSE_STYLE: Record<string, string> = withAliases({
  הדגשה: "pm-bold",
  נטוי: "pm-italic",
  קו_תחתון: "pm-underline",
  קו_חוצה: "pm-strike",
  סימון: "pm-mark",
  גדול: "pm-big",
  קטן: "pm-small",
  שער: "pm-title",
  תת_שער: "pm-subtitle",
  מרכז: "pm-center",
  ימין: "pm-right",
  שמאל: "pm-left",
  // A heading inside a note looks like a small heading and is not one — so in
  // prose mode it gets the small-heading look, and nothing in the outline.
  כותרת_בהערה: "pm-h3",
  ציטוט: "pm-quote",
  מקור: "pm-source",
  קוד: "pm-code",
  הערת_צד: "pm-callout",
  אזהרה: "pm-warn",
  הצלחה: "pm-ok",
  תיבה: "pm-box",
  דיבור_המתחיל: "pm-bold",
  // These all take a `(...)` argument, which prose mode could not even see until
  // scanCommands learned to skip an argument group — so they used to appear as
  // literal `#צבע(rgb("#b91c1c"))[…]` in the middle of the "looks like Word" view.
  צבע: "pm-color",
  רקע: "pm-mark",
  גודל_גופן: "pm-big",
  מרווח_אותיות: "pm-tracked",
  גופן_שונה: "pm-otherfont",
  רברבתי: "pm-scaps",
  עילי: "pm-sup",
  תחתי: "pm-sub",
  הזחה: "pm-indent",
  מימין_לשמאל: "pm-rtl",
  משמאל_לימין: "pm-ltr",
  // Torah layer.
  סימן: "pm-h1",
  סעיף: "pm-seif",
  אות: "pm-bold",
  פסוק: "pm-verse",
  ציון: "pm-source",
  גמרא: "pm-gemara",
  // Review marks look, in prose mode, like what they mean: an insertion
  // underlined, a deletion struck through — the same shapes the page shows.
  הוספה: "pm-ins",
  מחיקה: "pm-del",
});

/** Levels 1–3 look like themselves; deeper ones all look like a small heading. */
const HEADING_CLASS = ["pm-h1", "pm-h2", "pm-h3"];

/**
 * The prose-mode class for a call.
 *
 * A heading answers from its **level**, not from an entry in `PROSE_STYLE`.
 * That table listed `כותרת4/5/6` and stopped: it had no `h4`, no `h5`, no `h6`,
 * no bare `#כותרת` and no `#hlevel` — so the entire English half of the heading
 * commands, and the only spelling that reaches past level six, printed their own
 * markup in the middle of the view whose one promise is that it looks like the
 * page. Deriving the class from the role means a heading the scanner knows about
 * cannot fail to be styled, in either language, at any level.
 */
function proseClass(n: Node): string | null {
  if (n.role === "heading") {
    return HEADING_CLASS[Math.min(n.level ?? 1, HEADING_CLASS.length) - 1];
  }
  return PROSE_STYLE[n.name] ?? null;
}

const hide = Decoration.replace({});

/**
 * Commands that take no body and so have nothing to "style" — in prose mode they
 * should look like the thing they produce, not like their own name.
 */
const SELF_CLOSING: Record<string, { cls: string; text: string }> = {
  ...withAliases<{ cls: string; text: string }>({
    קו_מפריד: { cls: "pm-hr", text: "" },
    חסר: { cls: "pm-blank", text: "\u00a0\u00a0\u00a0\u00a0\u00a0" },
    מעבר_עמוד: { cls: "pm-pagebreak", text: "— — —" },
    // The other two breaks, which were missing from this table while the page
    // and column breaks were in it. In prose mode a `#מעבר_שורה` showed its own
    // markup in the middle of a sentence — the one place prose mode exists to
    // not do that — and the paragraph break, being new, would have joined it.
    // The glyphs are the ones a word processor shows for the same two things.
    מעבר_שורה: { cls: "pm-break", text: "↵" },
    מעבר_פסקה: { cls: "pm-break", text: "¶" },
    מעבר_טור: { cls: "pm-pagebreak", text: "⋮" },
    תמונה: { cls: "pm-image", text: "🖼" },
    תוכן: { cls: "pm-toc", text: "⧉" },
    סמן: { cls: "pm-anchor", text: "⚑" },
    הפניה: { cls: "pm-xref", text: "↗" },
  }),
  // The three apparatus chips carry a *word*, so here — and only here — the
  // two spellings deliberately differ: somebody who typed `#endnotes` is
  // writing in English and should not get a Hebrew label handed back.
  // Everything above is a glyph, which reads the same in both languages, so
  // it is paired from the prelude rather than typed twice.
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

/**
 * A literal string standing in for hidden markup.
 *
 * One use so far and it earns a class rather than a `Decoration.replace({})`:
 * the `][` between two bodies of one command has to become a **space**, because
 * the page puts one there. `#גמרא[ברכות][ב.]` prints *ברכות ב.* — a masechta and
 * its daf are two words — and closing the gap up would read as one.
 */
class TextWidget extends WidgetType {
  constructor(readonly text: string, readonly cls: string) {
    super();
  }
  eq(o: TextWidget) {
    return o.text === this.text && o.cls === this.cls;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = this.cls;
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
/**
 * File a family of notes under a scheme, by their **Hebrew** names.
 *
 * The English spelling of each comes from the prelude's own `#let`, so this
 * table cannot be the thing that forgets one. It used to carry both by hand,
 * which is how `notesIn` came to find no notes at all in an English document —
 * see the head of `note-commands.ts` for that bug written out in full.
 * `TIER_FAMILY` already arrives paired, so its names pass through unchanged.
 */
const addNotes = (family: string, scheme: NoteScheme, names: readonly string[]) => {
  for (const n of names) for (const s of bothSpellings(n)) NOTE_KINDS[s] = { family, scheme };
};

// The one native page-foot series: plain footnotes, sub-notes, mekoros notes and
// every tier of the layered notes all land in it, in one running sequence.
addNotes("native", "1", ["הערה", "הערה_על_הערה", "מראה_מקום", ...TIER_FAMILY]);
// Section bands and per-page bands: one independent sequence per tier, and the
// engine letters tiers 2 and 3 by default.
// The tier letters come from `note-commands.ts` — this table says how each tier
// *numbers*, and must not also be a second opinion about how many there are.
const BAND_SCHEMES: NoteScheme[] = ["1", "א", "a", "1", "א", "a", "1"];
TIERS.forEach((letter, i) => {
  const scheme = BAND_SCHEMES[i];
  addNotes(`band${i + 1}`, scheme, [`מדור_${letter}`]);
  addNotes(`pageband${i + 1}`, scheme, [`מדף_${letter}`]);
});
addNotes("band1", "1", ["מדור_בדרגה"]);
addNotes("pageband1", "1", ["מדף_בדרגה"]);
// Independent per-page streams — the sources stream is lettered by convention.
addNotes("stream-content", "1", ["הערת_תוכן"]);
addNotes("stream-source", "א", ["הערת_מקור"]);
addNotes("stream-other", "1", ["הערה_זרם"]);
// Endnotes, and the margin apparatuses.
addNotes("endnote", "1", ["הערתסיום"]);
addNotes("sidenote", "1", ["הערת_גיליון"]);
addNotes("side-right", "1", ["הערת_ימין"]);
addNotes("side-left", "1", ["הערת_שמאל"]);
// An editorial comment is a margin note in its own right, numbered by the same
// sidenote engine — so it collapses to a chip like one, with its text on hover.
addNotes("review", "1", ["הערת_עורך"]);

const FOOTNOTE_NAMES = new Set(Object.keys(NOTE_KINDS));

// ---- deferred note bodies ----
// `#הערה_בשם("א")` is a marker whose prose lives at the end of the file, in
// `#גוף_הערה("א")[…]`. Prose mode must not be able to tell: the marker collapses
// to the same numbered chip as an inline note (with the *deferred* body on hover),
// and the definitions region reads as a numbered list rather than as markup. Left
// untreated, the one view whose whole promise is "it looks like the page" would
// show a wall of `#גוף_הערה("1")[` at the bottom of every document that uses this.
// The names come from `note-commands.ts`, which is where every other "which
// command is this" answer lives. They were written out here as well, which is
// the third copy of a two-element list and the reason its head is worth reading.
const DEFER_REF_NAMES = new Set(DEFER_REF_COMMANDS);
const DEFER_BODY_NAMES = new Set(DEFER_BODY_COMMANDS);

/**
 * The name, and the layout, in a deferred marker's argument list.
 *
 * A local parse rather than a second document scan: the span is already in hand
 * and this runs on every keystroke. `deferred.ts` is the authority on the syntax;
 * this reads the two fields prose mode needs and ignores the rest.
 */
function deferArgs(args: string): { name: string; kind: string | null } {
  const kind = /(?:^|,)\s*(?:סוג|kind)\s*:\s*([A-Za-z0-9֐-׿_]+)/u.exec(args);
  const named = /(?:^|,)\s*(?:שם|name)\s*:\s*"([^"]*)"/u.exec(args);
  const positional = /^\s*"([^"]*)"/u.exec(args);
  return {
    name: named?.[1] ?? positional?.[1] ?? args.split(",")[0].trim(),
    kind: kind?.[1] ?? null,
  };
}

/** The name a deferred marker or body carries, whichever form it was written in. */
function deferNameOf(text: string, n: Node): string {
  if (n.args) return deferArgs(text.slice(n.args.from, n.args.to)).name;
  // The bracket form: `#הערה_בשם[א]`, `#גוף_הערה[א][…]`.
  return n.bodies[0] ? text.slice(n.bodies[0].from, n.bodies[0].to).trim() : "";
}

const HEB_LETTERS = "אבגדהוזחטיכלמנסעפצקרשת".split("");

/**
 * An ordered list's marker for item `n`, in the scheme the engine will print.
 *
 * `#ממוספרת_עברית` is `enum(numbering: "א.")`, so a Hebrew-lettered list must
 * show letters here. Prose mode could not have got this wrong before, because it
 * did not render that list at all.
 */
function listLabel(kind: ListKind, n: number): string {
  return kind === "hebrew" ? HEB_LETTERS[(n - 1) % HEB_LETTERS.length] : String(n);
}

/** Render `n` (1-based) in an apparatus's own numbering scheme. */
function noteLabel(scheme: NoteScheme, n: number): string {
  if (scheme === "א") return HEB_LETTERS[(n - 1) % HEB_LETTERS.length];
  if (scheme === "a") return String.fromCharCode(97 + ((n - 1) % 26));
  return String(n);
}

// ---- tables: rendered as a real grid in prose mode ----
//
// The list, item, table and cell alternations that used to live here are gone.
// `LIST_OPEN_RE` knew four list commands where `lists.ts` knew six, so a
// document written with `#ממוספרת_עברית` — or one that got there by pressing the
// ribbon's own `list.hebrew` button — stopped rendering as a list in the mode
// whose entire promise is that it looks like the page. There is one table now
// and it is `spans.ts`'s.

// A table cell rendered only bold/italic/underline/strike/code, so a cell using
// anything else — a colour, a highlight, small caps — showed its raw markup
// inside an otherwise WYSIWYG table. These are the same styles the body honours.
const INLINE_TAG: Record<string, [string, string]> = withAliases<[string, string]>({
  הדגשה: ["<strong>", "</strong>"],
  נטוי: ["<em>", "</em>"],
  קו_תחתון: ["<u>", "</u>"],
  קו_חוצה: ["<s>", "</s>"],
  קוד: ["<code>", "</code>"],
  סימון: ['<span class="pm-mark">', "</span>"],
  רקע: ['<span class="pm-mark">', "</span>"],
  צבע: ['<span class="pm-color">', "</span>"],
  רברבתי: ['<span class="pm-scaps">', "</span>"],
  עילי: ["<sup>", "</sup>"],
  תחתי: ["<sub>", "</sub>"],
  גדול: ['<span class="pm-big">', "</span>"],
  קטן: ['<span class="pm-small">', "</span>"],
  דיבור_המתחיל: ["<strong>", "</strong>"],
  ציון: ['<span class="pm-source">', "</span>"],
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Render a range of Ksav markup to safe HTML: known inline commands become
 * tags, unknown wrappers keep only their content, everything is HTML-escaped.
 *
 * Walks the scan rather than re-matching, so a cell holding `רש"י` renders as
 * `רש"י` instead of opening a string that swallows the rest of the table — and
 * `#צבע(rgb("#b91c1c"))[…]` renders its content instead of printing its own
 * arguments, which the old `(?:\([^()]*\))?` could only manage while the
 * argument list held no nested parentheses of its own.
 */
function renderInline(s: Scan, from: number, to: number): string {
  const text = s.text;
  let out = "";
  let i = from;
  while (i < to) {
    const n = s.byStart.get(i);
    if (!n || n.to > to || n.bodies.length === 0) {
      out += escapeHtml(text[i]);
      i++;
      continue;
    }
    const body = n.bodies[0];
    const inner = renderInline(s, body.from, body.to);
    const tag = INLINE_TAG[n.name];
    out += tag ? tag[0] + inner + tag[1] : inner;
    i = n.to;
  }
  return out;
}

interface TableModel {
  cols: number;
  cells: { html: string; header: boolean; span: number }[];
}

/**
 * A `#טבלה(…)` node as a grid model.
 *
 * The column count comes from the node, which understands both spellings Typst
 * accepts. This function used to match `\d+` only, so a table declaring
 * `עמודות: (2fr, 1fr, 1fr)` fell back to two columns and prose mode drew a
 * three-column table as a two-column grid — while `table.ts`, the module that
 * *writes* that track list, read it correctly. One document, two readers, one of
 * them wrong, and the ribbon button that produced the disagreement was
 * `table.widerColumn`.
 */
function parseTable(s: Scan, node: Node): TableModel {
  const cells: TableModel["cells"] = [];
  for (const c of node.children) {
    if (c.role !== "cell" || !c.bodies[0]) continue;
    cells.push({
      html: renderInline(s, c.bodies[0].from, c.bodies[0].to),
      header: c.header === true,
      span: c.span ?? 1,
    });
  }
  return { cols: node.cols ?? 2, cells };
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

/** What prose mode holds in its StateField: the decorations, plus the spans
 *  whose visibility depends on the cursor — the second lets a pure selection
 *  move skip the whole recompute when nothing it could reveal actually flips. */
interface ProseValue {
  deco: DecorationSet;
  touch: { from: number; to: number }[];
}

/**
 * A coverage mask over document positions.
 *
 * The prose predicates — is this position inside a comment, a footnote, a list,
 * a table — used to be linear scans over their span lists, called once per
 * command. Commands scale with the document and so do those spans, so the pass
 * was O(n²): 108 ms per keystroke on a hundred-page sefer. Painting each span
 * set into a byte mask once (native `fill`, O(document)) turns every predicate
 * into a single array read, and the whole pass back into O(n).
 */
function paint(mask: Uint8Array, from: number, to: number) {
  if (from < 0) from = 0;
  if (to > mask.length) to = mask.length;
  if (to > from) mask.fill(1, from, to);
}

function overlapsSel(sel: EditorSelection, from: number, to: number): boolean {
  return sel.ranges.some((r) => r.from <= to && r.to >= from);
}

function proseDecorations(state: EditorState): ProseValue {
  const reveal = state.field(revealAll, false);
  const sel = state.selection;
  const ranges: { from: number; to: number; deco: Decoration; side: number }[] = [];
  const touch: { from: number; to: number }[] = [];
  const text = docTextOf(state.doc);
  const touchedAt = (from: number, to: number) => {
    // Every span asked about here is one a cursor move could reveal or hide;
    // recording them lets the field decide, on the next selection change,
    // whether a recompute is even necessary.
    touch.push({ from, to });
    return reveal || sel.ranges.some((r) => r.from <= to && r.to >= from);
  };

  // ---- comments & fold-region markers: hidden in prose (Word-like) mode ----
  // These never render in the compiled output (Typst strips `//` and `/* */`),
  // so in prose mode we hide them too — the region's body then reads as plain
  // text with no visible collapse markers, matching the printed page. A marker
  // is revealed when the cursor touches it or Alt is held, so it stays editable.
  const doc = scan(text);
  const comments = doc.comments;
  // Nothing needs an `inComment` predicate any more: a command inside a comment
  // is not a node, so the four "skip this if it is commented out" guards that
  // used to sit in this function have no case left to catch.

  // ---- footnote coverage ----
  // A footnote collapses to ONE numbered chip: a full-span `replace` over the
  // whole `#הערה[…]`. Anything nested inside it (bold, a list, another footnote,
  // even a comment) must NOT emit its own decoration, or two `replace` ranges
  // overlap and CodeMirror throws ("Ran out of text content"). We compute the
  // outermost footnote spans up front and skip anything that falls inside one.
  const allCmds = doc.nodes;
  const topFn: Node[] = [];
  let fnCover = -1;
  for (const n of allCmds) {
    if (!FOOTNOTE_NAMES.has(n.name) || n.bodies.length === 0) continue;
    if (n.from < fnCover) continue; // nested
    topFn.push(n);
    fnCover = n.to;
  }
  const fnMask = new Uint8Array(text.length + 1);
  for (const n of topFn) paint(fnMask, n.from + 1, n.to); // (from, to)
  const insideFootnote = (pos: number) => fnMask[pos] === 1;

  // ---- list coverage (outermost lists), used to keep a nested table raw ----
  const listSpans: { from: number; to: number }[] = [];
  for (const n of doc.nodes) {
    if (n.role !== "list" || !n.args) continue;
    if (insideFootnote(n.from)) continue;
    if (n.from < (listSpans[listSpans.length - 1]?.to ?? -1)) continue; // nested
    listSpans.push({ from: n.from, to: n.args.to });
  }
  const listMask = new Uint8Array(text.length + 1);
  for (const s of listSpans) paint(listMask, s.from + 1, s.to + 1); // (from, to]
  const insideList = (pos: number) => listMask[pos] === 1;

  // ---- tables: render `#טבלה(…)` as a real grid (a block widget) ----
  // Block widgets and line-break-spanning replaces are only legal from a
  // StateField (not a plugin) — which is why prose mode is a StateField. A table
  // is rendered only when it stands on its own line(s) and isn't inside a
  // footnote/list/comment or under the cursor; otherwise it stays editable raw.
  const tableSpans: { from: number; to: number }[] = [];
  for (const n of doc.nodes) {
    if (n.role !== "table" || !n.args) continue;
    const cmdStart = n.from;
    if (insideFootnote(cmdStart) || insideList(cmdStart)) continue;
    const closeParen = n.args.to;
    const startLine = state.doc.lineAt(cmdStart);
    const endLine = state.doc.lineAt(closeParen);
    // Block-eligible only if the markup owns whole lines (nothing else on them).
    const clean =
      text.slice(startLine.from, cmdStart).trim() === "" &&
      text.slice(closeParen + 1, endLine.to).trim() === "";
    if (!clean) continue;
    if (touchedAt(startLine.from, endLine.to)) continue; // editing: show raw
    const html = tableHtml(parseTable(doc, n));
    ranges.push({
      from: startLine.from,
      to: endLine.to,
      deco: Decoration.replace({ widget: new TableWidget(html), block: true }),
      side: 0,
    });
    tableSpans.push({ from: startLine.from, to: endLine.to });
  }
  const tableMask = new Uint8Array(text.length + 1);
  for (const s of tableSpans) paint(tableMask, s.from, s.to + 1); // [from, to]
  const insideTable = (pos: number) => tableMask[pos] === 1;

  for (const c of comments) {
    if (touchedAt(c.from, c.to)) continue;
    if (insideFootnote(c.from) || insideTable(c.from)) continue; // covered by another widget
    // Every comment is hidden, multi-line ones included.
    //
    // This used to skip any comment that crossed a line break, because a
    // *plugin* may not replace one — CodeMirror checks `disallowBlockEffectsFor`,
    // which is set for a decoration source that is a function (a ViewPlugin, or
    // `decorations.compute`) and not for one that is a value. That guard is
    // 504a3ec (9 Jul), when the comment hider *was* a plugin; prose mode became a
    // StateField in ca61c21 (24 Jul) so that it could emit rendered tables, which
    // are block widgets under the very same rule — and nobody came back for this
    // line. It was hiding exactly the wrong case: a hidden line break is a
    // multi-line comment *by construction*, so the one comment a writer wants
    // invisible was the one left showing, greyed, in the mode whose whole promise
    // is that it looks like the page.
    if (c.from < c.to) ranges.push({ from: c.from, to: c.to, deco: hide, side: -1 });
  }

  // ---- lists: hide scaffolding, show bullets/numbers (WYSIWYG) ----
  // Every list kind, in both languages, because the names come from the same
  // table `lists.ts` writes with. `#ממוספרת_עברית` used to render as raw markup
  // here while the ribbon happily produced it.
  for (const n of doc.nodes) {
    if (n.role !== "list" || !n.args) continue;
    const cmdStart = n.from;
    if (insideFootnote(cmdStart) || insideTable(cmdStart)) continue; // covered by another widget
    const openParen = n.args.from - 1;
    const closeParen = n.args.to;
    if (touchedAt(cmdStart, closeParen + 1)) continue;
    const ordered = n.listKind === "numbered" || n.listKind === "hebrew";
    ranges.push({ from: cmdStart, to: openParen + 1, deco: hide, side: -1 });
    ranges.push({ from: closeParen, to: closeParen + 1, deco: hide, side: 1 });
    // A list may now carry its own styling — `#רשימה(סמן: [◆], פריט[א])` — and a
    // named argument is scaffolding, not an item. Left showing, it printed
    // "סמן: [◆]," as the first line of a list in the mode whose whole promise is
    // that it looks like the page. Hidden by argument rather than by "everything
    // before the first item", because a writer may put one after the items too.
    for (const g of splitArgs(text, n.args.from, n.args.to)) {
      if (topLevelColon(text, g.from, g.to) < 0) continue;
      // The comma and the space after it go too, or the list opens on a stray
      // indent where the argument used to be.
      let to = g.to + (text[g.to] === "," ? 1 : 0);
      while (text[to] === " " || text[to] === "\t") to++;
      ranges.push({ from: g.from, to, deco: hide, side: -1 });
    }
    let idx = 0;
    for (const item of n.children) {
      // Items directly inside *this* list; a nested list's items are decorated
      // by their own list, which is what the containment tree gives for free.
      if (item.role !== "item" || !item.bodies[0]) continue;
      const itemOpen = item.bodies[0].from - 1;
      const itemClose = item.bodies[0].to;
      idx++;
      // A Hebrew-lettered list is lettered on the page, so it is lettered here.
      const bullet = ordered ? `${listLabel(n.listKind!, idx)}. ` : "• ";
      ranges.push({
        from: item.from,
        to: itemOpen + 1,
        deco: Decoration.replace({ widget: new LabelWidget(bullet) }),
        side: -1,
      });
      ranges.push({ from: itemClose, to: itemClose + 1, deco: hide, side: 1 });
      if (text[itemClose + 1] === ",")
        ranges.push({ from: itemClose + 1, to: itemClose + 2, deco: hide, side: 1 });
    }
  }

  // ---- deferred note bodies ----
  // Two collections built up front: what each name's prose says (for the chip's
  // hover text, which is the whole reason the chip is readable) and where each
  // definition sits. The definitions are decorated *after* the main loop, because
  // a definition's number is its marker's number and a definition is allowed to
  // come first in the file.
  const deferBodies = new Map<string, string>();
  const deferDefs: { s: Node; name: string; body: Group }[] = [];
  for (const s of allCmds) {
    if (!DEFER_BODY_NAMES.has(s.name)) continue;
    // `#גוף_הערה("א")[…]` puts its prose in the only body; the bracket form
    // `#גוף_הערה[א][…]` puts the name in the first and the prose in the second.
    // The scanner collects every trailing group, so this is an index rather than
    // the two-branch reconstruction it used to be.
    const body = s.args ? s.bodies[0] : s.bodies[1];
    if (!body) continue;
    const name = deferNameOf(text, s);
    if (!deferBodies.has(name)) deferBodies.set(name, text.slice(body.from, body.to));
    deferDefs.push({ s, name, body });
  }
  /** The chip a name's marker got, filled in as the main loop meets the markers. */
  const deferLabels = new Map<string, string>();

  // One counter per apparatus, not one for the whole document.
  const fnCounts: Record<string, number> = {};
  for (const s of allCmds) {
    if (insideFootnote(s.from) || insideTable(s.from)) continue; // covered by another widget
    if (!s.hash) continue; // a bare call is decorated by its container (a list, a table)

    // ---- commands with no body: shown as the thing they produce ----
    const block = SELF_CLOSING[s.name];
    if (block && s.bodies.length === 0) {
      if (!touchedAt(s.from, s.to)) {
        ranges.push({
          from: s.from,
          to: s.to,
          deco: Decoration.replace({ widget: new MarkWidget(block.cls, block.text) }),
          side: 0,
        });
      }
      continue;
    }

    // a deferred marker -> the same chip an inline note gets, numbered in the
    // same sequence, with the prose from the end of the file on hover
    if (DEFER_REF_NAMES.has(s.name)) {
      if (s.args || s.bodies.length) {
        const name = deferNameOf(text, s);
        const layout = s.args ? deferArgs(text.slice(s.args.from, s.args.to)).kind : null;
        // `סוג` defaults to a plain footnote, so an unrecognised layout counts in
        // the native series rather than starting a sequence of its own.
        const k = (layout != null ? NOTE_KINDS[layout] : null) ?? NOTE_KINDS["הערה"];
        const n = (fnCounts[k.family] = (fnCounts[k.family] ?? 0) + 1);
        const label = noteLabel(k.scheme, n);
        deferLabels.set(name, label);
        if (!touchedAt(s.from, s.to)) {
          const body = deferBodies.get(name);
          ranges.push({
            from: s.from,
            to: s.to,
            deco: Decoration.replace({
              widget: new FootnoteWidget(
                label,
                body == null ? "?" : plainText(body),
              ),
            }),
            side: 0,
          });
        }
      }
      continue;
    }
    if (DEFER_BODY_NAMES.has(s.name)) continue; // decorated below, once numbering is known

    // footnotes -> a numbered superscript chip (body hidden)
    const kind = NOTE_KINDS[s.name];
    const body = s.bodies[0];
    if (kind && body) {
      const n = (fnCounts[kind.family] = (fnCounts[kind.family] ?? 0) + 1);
      if (!touchedAt(s.from, s.to)) {
        ranges.push({
          from: s.from,
          to: s.to,
          deco: Decoration.replace({
            widget: new FootnoteWidget(
              noteLabel(kind.scheme, n),
              plainTextIn(doc, body.from, body.to),
            ),
          }),
          side: 0,
        });
      }
      continue;
    }
    const cls = proseClass(s);
    if (cls == null || !body) continue;

    // Reveal raw markup if Alt is held, or the cursor/selection touches it.
    if (touchedAt(s.from, s.to)) continue;

    // hide "#name(args)[" and the matching "]" — the argument group included, or
    // a coloured run would still read as `#צבע(rgb("#b91c1c"))` on the page.
    //
    // **Every** body, not the first. `#גמרא[ברכות][ב.]`, `#פסוק[מקור][גוף]`,
    // `#סעיף[א][גוף]` and `#סימן[א׳][כותרת]` all carry two, and this hid the
    // opening through the end of the first one and the bracket after it — so the
    // view whose one promise is that it looks like the page read *ברכות[ב.]*, with
    // the second body's brackets sitting in the prose. Four commands, all four of
    // them the ones a sefer is actually written with.
    const last = s.bodies[s.bodies.length - 1];
    ranges.push({ from: s.from, to: body.from, deco: hide, side: -1 });
    ranges.push({ from: last.to, to: last.to + 1, deco: hide, side: 1 });
    for (let b = 0; b < s.bodies.length; b++) {
      const g = s.bodies[b];
      // The `][` between two bodies. A space is what the page puts there — a
      // masechta and its daf are two words — so it is hidden down to one rather
      // than closed up.
      if (b > 0) {
        ranges.push({
          from: s.bodies[b - 1].to,
          to: g.from,
          deco: Decoration.replace({ widget: new TextWidget(" ", "pm-gap") }),
          side: 0,
        });
      }
      if (g.to > g.from) {
        ranges.push({ from: g.from, to: g.to, deco: Decoration.mark({ class: cls }), side: 0 });
      }
    }
  }

  // ---- the definitions region, as a numbered list ----
  // `#גוף_הערה("1")[…]` becomes «¹ the prose», so the block at the end of the
  // file reads the way it will print rather than as markup. The number is the one
  // its marker got, which is why this runs after the loop: a definition may be
  // written before its marker. A body nothing points at keeps a `?` — invisible
  // would make it look filed when it is lost.
  for (const d of deferDefs) {
    if (insideFootnote(d.s.from) || insideTable(d.s.from)) continue;
    if (touchedAt(d.s.from, d.body.to + 1)) continue;
    ranges.push({
      from: d.s.from,
      to: d.body.from,
      deco: Decoration.replace({
        widget: new FootnoteWidget(deferLabels.get(d.name) ?? "?", d.name),
      }),
      side: -1,
    });
    ranges.push({ from: d.body.to, to: d.body.to + 1, deco: hide, side: 1 });
  }

  ranges.sort((a, b) => a.from - b.from || a.side - b.side);
  const deco = Decoration.set(
    ranges.map((r) => r.deco.range(r.from, r.to)),
    true,
  );
  return { deco, touch };
}

// ---- folding (org-mode style: headings + lists + any multi-line command) ----

/** A row of the outline pane. */
export interface OutlineRow {
  level: number;
  title: string;
  from: number;
  /**
   * Is this a *section* — something that numbers, folds and enters `#תוכן`?
   *
   * `#שער` is not. It is `align(center, text(size: 2em, weight: "bold", …))`
   * with no `heading()` in it, so the compiled table of contents has never had
   * an entry for it — and the outline pane listed it at level 1, so the two
   * surfaces that show a document's structure disagreed about what its structure
   * was. Every shipped template opens with one, which is why it stays in the
   * pane as a level-0 title row: it is worth navigating to, it is not a section,
   * and folding it would collapse a region the document does not have.
   */
  section: boolean;
}

/** The title a heading node shows in the outline. */
function titleOf(text: string, n: Node): string {
  const groups = n.titleGroups ?? n.bodies;
  const joined = groups.map((g) => text.slice(g.from, g.to)).join(" ").trim();
  return joined || text.slice(n.from, n.to).trim();
}

/**
 * Extract the document outline.
 *
 * A heading is outlined only when it starts its own line, which is what keeps
 * an inline `#כותרת3[…]` in the middle of a sentence out of the pane and out of
 * the fold service — the same rule the old line-anchored regex enforced, now
 * applied to a node the rest of the app agrees exists.
 */
export function outline(text: string): OutlineRow[] {
  const res: OutlineRow[] = [];
  for (const n of scan(text).nodes) {
    if (!startsItsLine(text, n)) continue;
    if (n.role === "heading") {
      res.push({ level: n.level ?? 1, title: titleOf(text, n), from: lineStartOf(text, n.from), section: true });
    } else if (n.name === "שער" || n.name === "title") {
      res.push({ level: 0, title: titleOf(text, n), from: lineStartOf(text, n.from), section: false });
    }
  }
  return res;
}

function lineStartOf(text: string, pos: number): number {
  return text.lastIndexOf("\n", pos - 1) + 1;
}

/** Nothing but whitespace before this call on its line. */
function startsItsLine(text: string, n: Node): boolean {
  return text.slice(lineStartOf(text, n.from), n.from).trim() === "";
}

/**
 * The section heading that starts the line at `lineFrom`, and its level.
 *
 * `#hlevel` used to be missing here while `headings.ts` wrote it: pressing
 * "demote" on an `#h6` produced `#hlevel(level: 7)`, and the section vanished
 * from the outline and stopped folding. One table now, so one answer.
 */
/**
 * Every heading that *opens* a line, in document order, with the offset of the
 * line it opens.
 *
 * Computed once per scan, and that is the whole of the fold service's cost
 * problem. `sectionLevelAt` used to walk `s.nodes` from index 0 on every call,
 * breaking only once it passed the line it was asked about — so a query near the
 * end of a document walked every node in it. The section fold then called it
 * *once per line to the end of the document* looking for where the section
 * stops. On 420 KB / 10,400 lines / 8,800 nodes that is O(lines × nodes):
 * **4.26 ms for a fold query on the last heading against 0.04 ms on the first**,
 * which is exactly backwards, because the end of the document is where somebody
 * writing a sefer actually is.
 *
 * A section ends at the next heading of the same level or shallower. That is a
 * question about *headings*, and there are a few hundred of those against tens
 * of thousands of lines — so the loop walks this list instead and the whole
 * query is O(headings).
 *
 * "Opens a line" is the same rule the old code enforced with
 * `s.text.slice(lineFrom, n.from).trim() !== ""`: a heading with prose in front
 * of it on the same line is not a section. The line start is found in `s.text`
 * rather than through CodeMirror's rope, so this stays a pure function of the
 * scan and can be shared by anything holding one.
 */
interface LineHead {
  /** Offset of the heading command. */
  from: number;
  /** Offset of the start of the line it opens. */
  lineFrom: number;
  level: number;
}

const LINE_HEADS = new WeakMap<object, LineHead[]>();

function lineHeads(s: Scan): LineHead[] {
  const hit = LINE_HEADS.get(s);
  if (hit) return hit;
  const out: LineHead[] = [];
  for (const n of s.nodes) {
    if (n.role !== "heading") continue;
    const lineFrom = s.text.lastIndexOf("\n", n.from - 1) + 1;
    if (s.text.slice(lineFrom, n.from).trim() !== "") continue;
    // One section per line: a second heading on the same line is not a section
    // opener, which is what the old scan-from-zero also concluded by returning
    // the first match.
    if (out.length && out[out.length - 1].lineFrom === lineFrom) continue;
    out.push({ from: n.from, lineFrom, level: n.level ?? 1 });
  }
  LINE_HEADS.set(s, out);
  return out;
}

/** Index of the heading opening the line `[lineFrom, lineTo]`, or -1. */
function headOpening(s: Scan, lineFrom: number, lineTo: number): number {
  const all = lineHeads(s);
  // Binary search on `lineFrom`, which is sorted: the list is built in document
  // order and every entry names the start of its own line.
  let lo = 0;
  let hi = all.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (all[mid].lineFrom < lineFrom) lo = mid + 1;
    else if (all[mid].lineFrom > lineFrom) hi = mid - 1;
    else return all[mid].from <= lineTo ? mid : -1;
  }
  return -1;
}

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

  // 0) a fold: `//{ … //}`. The marks are line comments, so the compiler never
  //    sees them and the page prints in full — which is the whole difference
  //    between this and the two constructs that hide. See `hiding.ts`, which
  //    owns the marks and the doors.
  const trimmed = text.trimStart();
  if (trimmed.startsWith(FOLD_OPEN)) {
    let depth = 1;
    for (let n = line.number + 1; n <= doc.lines; n++) {
      const lt = doc.line(n).text.trimStart();
      if (lt.startsWith(FOLD_OPEN)) depth++;
      else if (lt.startsWith(FOLD_CLOSE)) {
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

  const s = scanDoc(doc);

  // 1) heading section fold
  //
  // Walks the headings rather than the lines. The old loop asked every line from
  // here to the end of the document what level it was, and each answer restarted
  // a walk over every node — see `lineHeads`.
  const at = headOpening(s, line.from, line.to);
  if (at >= 0) {
    const all = lineHeads(s);
    const lvl = all[at].level;
    let end = doc.length;
    for (let k = at + 1; k < all.length; k++) {
      if (all[k].level <= lvl) {
        end = all[k].lineFrom - 1;
        break;
      }
    }
    return end > line.to ? { from: line.to, to: end } : null;
  }

  // 2) multi-line bracketed command fold (first such command on the line)
  for (const n of s.nodes) {
    if (n.from < line.from) continue;
    if (n.from > line.to) break;
    // The argument list first, then the body: `#רשימה(` folds its items and
    // `#הערה[` folds its prose, and a call with both folds whichever opens first.
    const opens = [n.args, ...n.bodies].filter(Boolean) as Group[];
    for (const g of opens) {
      if (g.from - 1 <= line.to && g.to > line.to) return { from: g.from, to: g.to };
    }
  }
  return null;
});

// A collapsed fold shows a meaningful label instead of a bare "…": the fold's
// name, the heading title, or the command being folded. This is what makes a
// collapsed block still readable — you see what you named it.
function foldLabelText(state: EditorState, range: { from: number; to: number }): string {
  const line = state.doc.lineAt(range.from);
  const text = line.text;
  const named = text.match(/\/\/\{\s*(.*)$/); // //{ label
  if (named) return named[1].trim() || "…";
  const s = scanDoc(state.doc);
  const head = s.nodes.find(
    (n) => n.role === "heading" && n.from >= line.from && n.from <= line.to,
  );
  if (head) return titleOf(s.text, head) || "…";
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
export const proseMode = StateField.define<ProseValue>({
  create: (state) => proseDecorations(state),
  update(prev, tr) {
    if (tr.docChanged || tr.effects.some((e) => e.is(setRevealAll)))
      return proseDecorations(tr.state);
    if (tr.selection) {
      // A cursor move only changes the view if it reveals or hides a span. If no
      // reveal-sensitive span's overlap with the selection actually flipped, the
      // current decorations still hold — which is what keeps arrow-keying (and
      // holding a key down) through a long document from paying for a full
      // recompute on every event. This was the second, cheaper half of the
      // quadratic-latency fix.
      const before = tr.startState.selection;
      const after = tr.state.selection;
      const flips = prev.touch.some(
        (s) => overlapsSel(before, s.from, s.to) !== overlapsSel(after, s.from, s.to),
      );
      return flips ? proseDecorations(tr.state) : prev;
    }
    return { deco: prev.deco.map(tr.changes), touch: prev.touch };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});
