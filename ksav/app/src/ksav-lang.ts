// Ksav editor language features for CodeMirror 6:
//   1. ksavHighlighter — colors `#command` tokens and brackets (raw/code mode).
//   2. proseMode       — hides the command syntax and renders the content with
//                        the real style (bold shows bold, headings look like
//                        headings). The command under the cursor, or all
//                        commands while Alt is held, reveal their raw markup so
//                        you can always edit.

import { EditorView, ViewPlugin, Decoration, ViewUpdate } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";

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

function highlightDecorations(view: EditorView): DecorationSet {
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const s of scanCommands(text)) {
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

function proseDecorations(view: EditorView): DecorationSet {
  const reveal = view.state.field(revealAll, false);
  const sel = view.state.selection;
  const ranges: { from: number; to: number; deco: Decoration; side: number }[] = [];
  const text = view.state.doc.toString();

  for (const s of scanCommands(text)) {
    const cls = PROSE_STYLE[s.name];
    if (cls == null || s.open == null || s.close == null) continue;

    const spanFrom = s.cmdStart;
    const spanTo = s.close + 1;
    // Reveal raw markup if Alt is held, or the cursor/selection touches it.
    const touched =
      reveal ||
      sel.ranges.some((r) => r.from <= spanTo && r.to >= spanFrom);
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
