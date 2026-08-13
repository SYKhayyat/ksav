// What can be done to the thing the caret is inside — as data.
//
// This is deliberately a registry rather than a set of buttons. The product has
// to be configurable the way Emacs is: a person rebinds a key, reorders a
// ribbon, puts an operation in a hydra, records a macro out of three of them.
// None of that is possible if "insert row below" exists only as a `<button>`
// with an `onClick` in the middle of a five-thousand-line file — which is what
// the table bar was, four operations wide, parked at the bottom of the window
// where nobody found it.
//
// So every structural operation is one entry with a stable id, and every
// surface — the contextual ribbon, the menus, the keymap, the palette, the
// hydras, the macro recorder — is a *view* over this list. A new operation
// appears everywhere at once, and nothing can be built and then hidden, which is
// the failure this codebase keeps producing.
//
// Everything here is pure: (document, caret) in, (document, caret) out. The
// tests are real tests, and `engine/tests/structure.rs` compiles the output.
//
// **Two questions, not one.** Every surface asks each operation two things:
// *can you act here* (to grey the control) and *act* (when it is pressed). The
// first used to be answered with the second — `run(doc, pos) !== null` — so
// standing in a table laid it out eighteen times, re-rendered it eighteen times
// and built eighteen copies of the whole document on **every caret move**, to
// decide the colour of some arrows. On a six-hundred-row table that was 93 ms
// per arrow key: the caret visibly lagging behind the keyboard, in a table, which
// is precisely where a writer is holding an arrow key down.
//
// So an action carries `enabled(ctx)` beside `run`, answered from a context that
// resolves the caret's list, table geometry and heading **once** and hands the
// same answer to all of them. The two are not allowed to drift: every predicate
// lives next to the operation it guards, in `lists.ts`, `table.ts` and
// `headings.ts`, and each operation asks its own before doing anything — so
// "the control is enabled" and "the operation acts" are one sentence. What keeps
// them honest is `test/structure.test.mjs`, which sweeps every action over every
// caret position of a corpus and fails if `enabled` and `run` ever disagree.

import * as heads from "./headings";
import * as lists from "./lists";
import * as tables from "./table";

export interface Edit {
  text: string;
  caret: number;
}

/** Which structure the caret is inside. */
export type Structure = "list" | "table" | "heading";

export interface StructureAction {
  /** Stable identifier: the key binding, the macro step, the config entry. */
  id: string;
  structure: Structure;
  /** Ribbon grouping, so related operations sit together. */
  group: string;
  /** Compact label for a dense ribbon. */
  glyph: string;
  /** i18n key for the full name. */
  label: string;
  /**
   * Show the name beside the glyph, not only in the tooltip.
   *
   * The ribbon's tooltips are good and a Word user does not discover a feature
   * by hovering eleven arrows — Word labels its ribbon. Labelling all eighteen
   * table operations would be a wall of text, so the two or three each writer
   * actually reaches for carry their name and the rest stay compact.
   */
  primary?: boolean;
  /**
   * Can it act where this context points?
   *
   * What every surface uses to disable a control rather than offering one that
   * silently does nothing — and the *only* thing they should use, because it
   * costs a comparison or two against an already-resolved caret. `isEnabled`
   * below is the one-shot form for a surface that has a document and a position
   * rather than a context.
   */
  enabled(ctx: StructureContext): boolean;
  /**
   * Why it cannot, when the caret **is** in the structure it acts on — an i18n
   * key, read off this operation's own `can*` predicate.
   *
   * A greyed control is information: *this exists, and not here*. It stops being
   * information the moment the writer cannot tell which half of that sentence
   * they are looking at. Eighteen table operations grey out at once when the
   * caret leaves a table, and one greys out on its own when it is the top row,
   * and until now those looked identical: 38% opacity and nothing else.
   *
   * Static rather than computed, because each predicate has one failure mode.
   * Where a predicate has two — moving a column refuses at the edge *and*
   * across a merge — the string says both. A reason that is true half the time
   * is worse than the grey it replaces.
   *
   * When the caret is outside the structure entirely, `whyNot` answers with
   * that instead: the operation is not the thing that has gone wrong.
   */
  why: string;
  /**
   * Do it. Returns null exactly when `enabled` says no — the last item cannot
   * move down, the first cannot indent — so a surface that ignores `enabled` and
   * just calls this still cannot be lied to.
   */
  run(doc: string, pos: number): Edit | null;
}

// ---------------------------------------------------------------- the context
//
// One caret position, resolved once and shared by everything that asks about it.

/**
 * Everything the operations need to know about one (document, caret), computed
 * on demand and at most once each.
 *
 * Lazy rather than eager, because the ribbon in a list must not pay to lay out a
 * table it is not in, and the fields differ wildly in price: `item()` is a scan
 * of one list's items, `geometry()` lays out every cell in the table, `headings()`
 * walks every node in the document. Lazy also means this stays cheap to
 * construct, which is what lets `run` build one for a single click without
 * anybody having to thread a context through the call.
 */
export interface StructureContext {
  readonly doc: string;
  readonly pos: number;
  /** The innermost list containing the caret. */
  list(): lists.ListInfo | null;
  /** The item of that list the caret is in, and its index. */
  item(): lists.Here;
  /** The innermost table containing the caret. */
  table(): tables.TableInfo | null;
  /** That table laid out — cells padded to a rectangle, rows indexed. */
  geometry(): tables.TableGeometry | null;
  /**
   * The grid cell the table operations act on.
   *
   * With the caret between cells rather than in one, that is the last row and
   * column instead of nothing: "add a row" should always mean something while
   * the caret is inside a table.
   */
  cursor(): { row: number; col: number };
  /** Every heading in the document, in source order. */
  headings(): heads.HeadingInfo[];
  /** The heading whose section contains the caret — the one at or above it. */
  section(): heads.HeadingInfo | null;
  /** The heading the caret is *on*, which is a different question. */
  headingHere(): heads.HeadingInfo | null;
  /** The line the caret is on, trimmed. */
  line(): string;
}

/** Compute once, on first ask. */
function once<T>(compute: () => T): () => T {
  let done = false;
  let value: T;
  return () => {
    if (!done) {
      value = compute();
      done = true;
    }
    return value;
  };
}

function makeContext(doc: string, pos: number): StructureContext {
  const list = once(() => lists.listAt(doc, pos));
  const item = once(() => {
    const l = list();
    return l ? lists.itemAt(l, pos) : null;
  });
  const table = once(() => tables.tableAt(doc, pos));
  const geometry = once(() => {
    const t = table();
    return t ? tables.geometry(t) : null;
  });
  const cursor = once(() => {
    const t = table();
    const g = geometry();
    if (!t || !g) return { row: 0, col: 0 };
    const idx = tables.cellIndexAt(t, pos);
    const p = idx == null ? undefined : g.grid[idx];
    return p
      ? { row: p.row, col: p.col }
      : { row: Math.max(0, g.rows - 1), col: Math.max(0, g.cols - 1) };
  });
  const all = once(() => heads.headings(doc));
  return {
    doc,
    pos,
    list,
    item,
    table,
    geometry,
    cursor,
    headings: all,
    section: once(() => heads.sectionAt(doc, pos, all())),
    headingHere: once(() => heads.headingAt(doc, pos, all())),
    line: once(() => heads.lineAt(doc, pos).line),
  };
}

// One entry, because the callers all ask about the same caret in a burst: the
// ribbon asks `availableAt` and then `whereAmI`, the menu asks eighteen
// operations in a loop, and the click that follows asks one of them to act. A
// context is a pure function of (doc, pos), so handing the same one back is
// never wrong — only cheaper.
let last: StructureContext | null = null;

/** The resolved caret, shared by every question asked about this position. */
export function contextAt(doc: string, pos: number): StructureContext {
  if (last && last.pos === pos && last.doc === doc) return last;
  last = makeContext(doc, pos);
  return last;
}

/** Can this operation act here? For a surface holding a document, not a context. */
export function isEnabled(action: StructureAction, doc: string, pos: number): boolean {
  return action.enabled(contextAt(doc, pos));
}

/**
 * Why this operation cannot act here — an i18n key — or null when it can.
 *
 * Two different sentences, and telling them apart is the whole value: *you are
 * not in a table* is about where the caret is, and *this is the top row* is
 * about this operation at this caret. A surface that shows only the second when
 * the first is true sends the writer looking for a top row they are nowhere
 * near.
 */
export function whyNot(action: StructureAction, doc: string, pos: number): string | null {
  const ctx = contextAt(doc, pos);
  if (action.enabled(ctx)) return null;
  const inside =
    action.structure === "list"
      ? ctx.list() !== null
      : action.structure === "table"
        ? ctx.table() !== null
        : ctx.section() !== null;
  return inside ? action.why : `why.notIn.${action.structure}`;
}

/**
 * One decision, two callers.
 *
 * `can` is the authority: `run` performs the edit only when `can` agrees, so an
 * operation cannot act where its control is greyed out, and a control cannot be
 * live where the operation would do nothing.
 */
function op(
  can: (ctx: StructureContext) => boolean,
  edit: (ctx: StructureContext) => Edit | null,
): Pick<StructureAction, "enabled" | "run"> {
  return {
    enabled: can,
    run(doc, pos) {
      const ctx = contextAt(doc, pos);
      return can(ctx) ? edit(ctx) : null;
    },
  };
}

// ---------------------------------------------------------------- lists

/** Wrap a list operation so it finds its own list and reports inapplicability. */
function onList(
  can: (list: lists.ListInfo, here: lists.Here) => boolean,
  fn: (doc: string, list: lists.ListInfo, pos: number) => Edit | null,
): Pick<StructureAction, "enabled" | "run"> {
  return op(
    (ctx) => {
      const list = ctx.list();
      return list !== null && can(list, ctx.item());
    },
    (ctx) => fn(ctx.doc, ctx.list()!, ctx.pos),
  );
}

const LIST_ACTIONS: StructureAction[] = [
  {
    id: "list.addItem",
    why: "why.notIn.list",
    primary: true,
    structure: "list",
    group: "items",
    glyph: "＋",
    label: "listAddItem",
    ...onList(
      () => lists.canAddItem(),
      (doc, list, pos) => lists.addItem(doc, list, pos),
    ),
  },
  {
    id: "list.splitItem",
    why: "why.notIn.list",
    primary: true,
    structure: "list",
    group: "items",
    glyph: "⤶",
    label: "listSplitItem",
    // Splitting outside an item is adding one at the end, which always applies.
    ...onList(
      () => lists.canAddItem(),
      (doc, list, pos) => lists.splitItem(doc, list, pos),
    ),
  },
  {
    id: "list.breakInItem",
    why: "why.notOnItem",
    structure: "list",
    group: "items",
    glyph: "↵",
    label: "listBreakInItem",
    // The one the writer asked for by name: a newline *inside* a bullet — and
    // only inside one. `\` is content markup, so in the list's argument list it
    // is a syntax error rather than a line break; this used to be `() => true`
    // and wrote it there. See `lists.canBreakInItem`.
    ...onList(
      (_list, here) => lists.canBreakInItem(here),
      (doc, list, pos) => lists.breakInItem(doc, list, pos),
    ),
  },
  {
    id: "list.paraInItem",
    why: "why.notOnItem",
    structure: "list",
    group: "items",
    glyph: "¶",
    label: "listParaInItem",
    // The third thing Enter can mean in a list, and the one that had no key:
    // a second *paragraph* under one number, which is what a se'if with two
    // paragraphs needs. Enter makes the next item and Shift+Enter makes a line
    // in this one; neither of those is this.
    ...onList(
      (_list, here) => lists.canBreakInItem(here),
      (doc, list, pos) => lists.paraInItem(doc, list, pos),
    ),
  },
  {
    id: "list.deleteItem",
    why: "why.notOnItem",
    structure: "list",
    group: "items",
    glyph: "✕",
    label: "listDeleteItem",
    ...onList(
      (_list, here) => lists.canDeleteItem(here),
      (doc, list, pos) => lists.deleteItem(doc, list, pos),
    ),
  },
  {
    id: "list.indent",
    why: "why.firstItemNoNest",
    primary: true,
    structure: "list",
    group: "level",
    glyph: "⇥",
    label: "listIndentItem",
    ...onList(
      (_list, here) => lists.canIndentItem(here),
      (doc, list, pos) => lists.indentItem(doc, list, pos),
    ),
  },
  {
    id: "list.outdent",
    why: "why.notNestedList",
    structure: "list",
    group: "level",
    glyph: "⇤",
    label: "listOutdentItem",
    ...op(
      (ctx) => {
        const list = ctx.list();
        return list !== null && lists.canOutdentItem(ctx.doc, list, ctx.item());
      },
      (ctx) => lists.outdentItem(ctx.doc, ctx.list()!, ctx.pos),
    ),
  },
  {
    id: "list.moveUp",
    why: "why.noItemAbove",
    structure: "list",
    group: "order",
    glyph: "▲",
    label: "listMoveUp",
    ...onList(
      (list, here) => lists.canMoveItem(list, here, -1),
      (doc, list, pos) => lists.moveItem(doc, list, pos, -1),
    ),
  },
  {
    id: "list.moveDown",
    why: "why.noItemBelow",
    structure: "list",
    group: "order",
    glyph: "▼",
    label: "listMoveDown",
    ...onList(
      (list, here) => lists.canMoveItem(list, here, 1),
      (doc, list, pos) => lists.moveItem(doc, list, pos, 1),
    ),
  },
  {
    id: "list.bullets",
    why: "why.alreadyThisKind",
    structure: "list",
    group: "kind",
    glyph: "•",
    label: "listAsBullets",
    ...onList(
      (list) => lists.canSetKind(list, "bullets"),
      (doc, list) => lists.setKind(doc, list, "bullets"),
    ),
  },
  {
    id: "list.numbered",
    why: "why.alreadyThisKind",
    structure: "list",
    group: "kind",
    glyph: "1.",
    label: "listAsNumbered",
    ...onList(
      (list) => lists.canSetKind(list, "numbered"),
      (doc, list) => lists.setKind(doc, list, "numbered"),
    ),
  },
  {
    id: "list.hebrew",
    why: "why.alreadyThisKind",
    structure: "list",
    group: "kind",
    glyph: "א.",
    label: "listAsHebrew",
    ...onList(
      (list) => lists.canSetKind(list, "hebrew"),
      (doc, list) => lists.setKind(doc, list, "hebrew"),
    ),
  },
];

// ---------------------------------------------------------------- tables

/**
 * Wrap a table operation.
 *
 * Both halves work from the geometry the context laid out once — the question
 * eighteen times per caret move, the edit once per click — and the operations in
 * `table.ts` ask the same `can*` before they touch anything, so neither half can
 * be right while the other is wrong.
 */
function onTable(
  can: (
    t: tables.TableInfo,
    g: tables.TableGeometry,
    row: number,
    col: number,
  ) => boolean,
  fn: (doc: string, t: tables.TableInfo, row: number, col: number) => string,
): Pick<StructureAction, "enabled" | "run"> {
  return op(
    (ctx) => {
      const g = ctx.geometry();
      if (!g) return false;
      const { row, col } = ctx.cursor();
      return can(ctx.table()!, g, row, col);
    },
    (ctx) => {
      const { row, col } = ctx.cursor();
      const text = fn(ctx.doc, ctx.table()!, row, col);
      return { text, caret: Math.min(ctx.pos, text.length) };
    },
  );
}

/**
 * One notch wider or narrower, in `fr` units.
 *
 * `fr` rather than centimetres because a table should still fit the page after
 * the margins change: a column pinned at 6cm on A4 is a column that overflows
 * the moment the document is printed on Letter. A column with no declared track
 * starts from 1fr, which is what `auto` looks like once its neighbours are
 * sized.
 */
function stepWidth(t: tables.TableInfo, col: number, by: 1 | -1): string {
  const current = t.widths?.[col] ?? "auto";
  const m = /^([\d.]+)fr$/.exec(current);
  const n = m ? parseFloat(m[1]) : 1;
  // Never below a quarter: a zero-width column cannot be clicked back open.
  return `${Math.max(0.25, Math.round((n + by * 0.5) * 100) / 100)}fr`;
}

const TABLE_ACTIONS: StructureAction[] = [
  {
    id: "table.rowAbove",
    why: "why.notIn.table",
    structure: "table",
    group: "rows",
    glyph: "↑＋",
    label: "insertRowAbove",
    ...onTable(
      () => tables.canInsertRow(),
      (doc, t, row) => tables.insertRow(doc, t, row - 1),
    ),
  },
  {
    id: "table.rowBelow",
    why: "why.notIn.table",
    primary: true,
    structure: "table",
    group: "rows",
    glyph: "↓＋",
    label: "insertRowBelow",
    ...onTable(
      () => tables.canInsertRow(),
      (doc, t, row) => tables.insertRow(doc, t, row),
    ),
  },
  {
    id: "table.rowUp",
    why: "why.topRow",
    structure: "table",
    group: "rows",
    glyph: "▲",
    label: "moveRowUp",
    ...onTable(
      (_t, g, row) => tables.canMoveRow(g, row, -1),
      (doc, t, row) => tables.moveRow(doc, t, row, -1),
    ),
  },
  {
    id: "table.rowDown",
    why: "why.bottomRow",
    structure: "table",
    group: "rows",
    glyph: "▼",
    label: "moveRowDown",
    ...onTable(
      (_t, g, row) => tables.canMoveRow(g, row, 1),
      (doc, t, row) => tables.moveRow(doc, t, row, 1),
    ),
  },
  {
    id: "table.rowDelete",
    why: "why.lastRowLeft",
    structure: "table",
    group: "rows",
    glyph: "⊖",
    label: "deleteRow",
    ...onTable(
      (_t, g) => tables.canDeleteRow(g),
      (doc, t, row) => tables.deleteRow(doc, t, row),
    ),
  },
  {
    id: "table.colBefore",
    why: "why.notIn.table",
    structure: "table",
    group: "cols",
    glyph: "＋←",
    label: "insertColBefore",
    ...onTable(
      () => tables.canInsertColumn(),
      (doc, t, _row, col) => tables.insertColumn(doc, t, col - 1),
    ),
  },
  {
    id: "table.colAfter",
    why: "why.notIn.table",
    primary: true,
    structure: "table",
    group: "cols",
    glyph: "→＋",
    label: "insertColAfter",
    ...onTable(
      () => tables.canInsertColumn(),
      (doc, t, _row, col) => tables.insertColumn(doc, t, col),
    ),
  },
  {
    id: "table.colStart",
    why: "why.columnCannotMove",
    structure: "table",
    group: "cols",
    glyph: "◀",
    label: "moveColStart",
    ...onTable(
      (_t, g, _row, col) => tables.canMoveColumn(g, col, -1),
      (doc, t, _row, col) => tables.moveColumn(doc, t, col, -1),
    ),
  },
  {
    id: "table.colEnd",
    why: "why.columnCannotMove",
    structure: "table",
    group: "cols",
    glyph: "▶",
    label: "moveColEnd",
    ...onTable(
      (_t, g, _row, col) => tables.canMoveColumn(g, col, 1),
      (doc, t, _row, col) => tables.moveColumn(doc, t, col, 1),
    ),
  },
  {
    id: "table.colDelete",
    why: "why.lastColumnLeft",
    structure: "table",
    group: "cols",
    glyph: "⊗",
    label: "deleteCol",
    ...onTable(
      (_t, g) => tables.canDeleteColumn(g),
      (doc, t, _row, col) => tables.deleteColumn(doc, t, col),
    ),
  },
  {
    id: "table.mergeRight",
    why: "why.noCellRight",
    structure: "table",
    group: "cells",
    glyph: "⇥⇤",
    label: "mergeRight",
    ...onTable(
      (_t, g, row, col) => tables.canMergeRight(g, row, col),
      (doc, t, row, col) => tables.mergeRight(doc, t, row, col),
    ),
  },
  {
    id: "table.splitCell",
    why: "why.notMerged",
    structure: "table",
    group: "cells",
    glyph: "⇤⇥",
    label: "splitCell",
    ...onTable(
      (_t, g, row, col) => tables.canSplitCell(g, row, col),
      (doc, t, row, col) => tables.splitCell(doc, t, row, col),
    ),
  },
  {
    id: "table.widerColumn",
    why: "why.widthUnchanged",
    structure: "table",
    group: "width",
    glyph: "↔＋",
    label: "widerColumn",
    ...onTable(
      (t, g, _row, col) => tables.canSetColumnWidth(t, g, col, stepWidth(t, col, 1)),
      (doc, t, _row, col) => tables.setColumnWidth(doc, t, col, stepWidth(t, col, 1)),
    ),
  },
  {
    id: "table.narrowerColumn",
    why: "why.widthUnchanged",
    structure: "table",
    group: "width",
    glyph: "↔－",
    label: "narrowerColumn",
    // Greyed at the floor rather than clamping silently: a quarter-width column
    // pressed narrower again would look like the button had stopped working.
    ...onTable(
      (t, g, _row, col) => tables.canSetColumnWidth(t, g, col, stepWidth(t, col, -1)),
      (doc, t, _row, col) => tables.setColumnWidth(doc, t, col, stepWidth(t, col, -1)),
    ),
  },
  {
    id: "table.equalColumns",
    why: "why.alreadyEqual",
    structure: "table",
    group: "width",
    glyph: "≡",
    label: "equalColumns",
    ...onTable(
      (t, g) => tables.canEqualColumns(t, g),
      (doc, t) => tables.equalColumns(doc, t),
    ),
  },
  {
    id: "table.autoColumns",
    why: "why.alreadyAuto",
    structure: "table",
    group: "width",
    glyph: "⤢",
    label: "autoColumns",
    ...onTable(
      (t, g) => tables.canAutoColumns(t, g),
      (doc, t) => tables.autoColumns(doc, t),
    ),
  },
  {
    id: "table.headerRow",
    why: "why.headerRowNoChange",
    primary: true,
    structure: "table",
    group: "whole",
    glyph: "H",
    label: "toggleHeaderRow",
    ...onTable(
      (_t, g, row) => tables.canToggleHeaderRow(g, row),
      (doc, t, row) => tables.toggleHeaderRow(doc, t, row),
    ),
  },
  {
    id: "table.delete",
    why: "why.notIn.table",
    structure: "table",
    group: "whole",
    glyph: "🗑",
    label: "deleteTable",
    ...onTable(
      () => tables.canDeleteTable(),
      (doc, t) => tables.deleteTable(doc, t),
    ),
  },
];

// ---------------------------------------------------------------- headings

/**
 * Wrap a heading operation.
 *
 * The caret does not have to be *on* the heading: standing in the body text and
 * saying "move this section up" is the ordinary case, and refusing there would
 * make the operation useless exactly when it is wanted.
 */
function onHeading(
  can: (h: heads.HeadingInfo, ctx: StructureContext) => boolean,
  fn: (doc: string, h: heads.HeadingInfo) => Edit | null,
): Pick<StructureAction, "enabled" | "run"> {
  return op(
    (ctx) => {
      const h = ctx.section();
      return h !== null && can(h, ctx);
    },
    (ctx) => fn(ctx.doc, ctx.section()!),
  );
}

const HEADING_ACTIONS: StructureAction[] = [
  {
    id: "heading.promote",
    why: "why.headingTopLevel",
    primary: true,
    structure: "heading",
    group: "level",
    glyph: "⇤",
    label: "headingPromote",
    ...onHeading(
      (h) => heads.canPromote(h),
      (doc, h) => heads.promote(doc, h),
    ),
  },
  {
    id: "heading.demote",
    why: "why.headingDeepest",
    primary: true,
    structure: "heading",
    group: "level",
    glyph: "⇥",
    label: "headingDemote",
    ...onHeading(
      (h) => heads.canDemote(h),
      (doc, h) => heads.demote(doc, h),
    ),
  },
  ...Array.from({ length: heads.MAX_LEVEL }, (_, i) => ({
    // All nine, because the engine has always had all nine and the toolbar
    // showed three. Generated rather than listed: a level that exists in the
    // model should not also need a hand-written entry here to be reachable.
    id: `heading.level${i + 1}`,
    why: "why.lineNotHeadable",
    structure: "heading" as const,
    group: "levels",
    glyph: `${i + 1}`,
    label: `headingLevel${i + 1}`,
    // Not `onHeading`: this one applies to the line in hand, exactly as a style
    // button does in a word processor. Wrapped in `sectionAt` it would restyle
    // the heading *above* the caret while the writer looked at their paragraph.
    ...op(
      (ctx) => heads.canMakeHeading(ctx.headingHere(), ctx.line(), i + 1),
      (ctx) => heads.makeHeading(ctx.doc, ctx.pos, i + 1),
    ),
  })),
  {
    id: "heading.moveUp",
    why: "why.noSectionToSwap",
    structure: "heading",
    group: "order",
    glyph: "▲",
    label: "headingMoveUp",
    ...onHeading(
      (h, ctx) => heads.canMoveSection(ctx.doc, h, -1, ctx.headings()),
      (doc, h) => heads.moveSection(doc, h, -1),
    ),
  },
  {
    id: "heading.moveDown",
    why: "why.noSectionToSwap",
    structure: "heading",
    group: "order",
    glyph: "▼",
    label: "headingMoveDown",
    ...onHeading(
      (h, ctx) => heads.canMoveSection(ctx.doc, h, 1, ctx.headings()),
      (doc, h) => heads.moveSection(doc, h, 1),
    ),
  },
  {
    id: "heading.delete",
    why: "why.notIn.heading",
    structure: "heading",
    group: "whole",
    glyph: "🗑",
    label: "headingDelete",
    ...onHeading(
      () => heads.canDeleteSection(),
      (doc, h) => heads.deleteSection(doc, h),
    ),
  },
  {
    id: "heading.contents",
    why: "why.contentsAlready",
    structure: "heading",
    group: "whole",
    glyph: "☰",
    label: "headingContents",
    ...onHeading(
      (_h, ctx) => heads.canAddContents(ctx.doc),
      (doc) => heads.addContents(doc),
    ),
  },
];

export const STRUCTURE_ACTIONS: StructureAction[] = [
  ...LIST_ACTIONS,
  ...TABLE_ACTIONS,
  ...HEADING_ACTIONS,
];

/** Look one up by id — what a key binding, a macro step or a hydra holds. */
export function actionById(id: string): StructureAction | undefined {
  return STRUCTURE_ACTIONS.find((a) => a.id === id);
}

/**
 * Which structure the caret is in.
 *
 * Innermost wins: a list inside a table cell is a list, because that is what
 * the writer is typing into.
 */
export function structureAt(doc: string, pos: number): Structure | null {
  return structureOf(contextAt(doc, pos));
}

function structureOf(ctx: StructureContext): Structure | null {
  const list = ctx.list();
  const table = ctx.table();
  if (list && table) return list.from > table.from ? "list" : "table";
  if (list) return "list";
  if (table) return "table";
  // A heading last, and deliberately so: every position after the first heading
  // is inside *some* section, so it would otherwise claim the caret everywhere
  // and no list or table would ever get the ribbon.
  if (ctx.section()) return "heading";
  return null;
}

/**
 * The nearest position that is inside a structure — the caret's own, or one
 * just inside the thing it has just stepped out of.
 *
 * Finish typing a list and the caret rests after the closing `)`, where
 * `structureAt` correctly answers "nowhere" and the ribbon empties. Correct by
 * the model, and wrong for the writer: Word keeps the table and list tools up
 * while you are anywhere near the thing, and a ribbon that vanishes on the
 * character *after* the one you were just editing reads as a bug.
 *
 * So a caret sitting on trailing whitespace after a closer looks one character
 * further in. The **position** is returned rather than only the structure,
 * because a sticky ribbon whose buttons then do nothing would be worse than no
 * ribbon: every surface acts at this position too.
 */
export function structureNear(doc: string, pos: number): { structure: Structure; pos: number } | null {
  const here = structureAt(doc, pos);
  if (here) return { structure: here, pos };
  let i = Math.min(pos, doc.length);
  while (i > 0 && /\s/.test(doc[i - 1])) i--;
  if (i > 0 && (doc[i - 1] === ")" || doc[i - 1] === "]")) {
    const inside = i - 1;
    const s = structureAt(doc, inside);
    if (s) return { structure: s, pos: inside };
  }
  return null;
}

/**
 * The operations offered here, each marked with whether it can act.
 *
 * One context for all of them — see the note at the top of this file about what
 * this used to cost.
 */
export function availableAt(
  doc: string,
  pos: number,
): { action: StructureAction; enabled: boolean }[] {
  const ctx = contextAt(doc, pos);
  const structure = structureOf(ctx);
  if (!structure) return [];
  return STRUCTURE_ACTIONS.filter((a) => a.structure === structure).map((action) => ({
    action,
    enabled: action.enabled(ctx),
  }));
}

/** A short description of where the caret is, for the ribbon's label. */
export function whereAmI(
  doc: string,
  pos: number,
): { structure: Structure; row: number; rows: number; col: number; cols: number } | null {
  const ctx = contextAt(doc, pos);
  const structure = structureOf(ctx);
  if (structure === "list") {
    const list = ctx.list()!;
    const here = ctx.item();
    return {
      structure,
      row: (here?.index ?? list.items.length - 1) + 1,
      rows: list.items.length,
      col: list.depth + 1,
      cols: list.depth + 1,
    };
  }
  if (structure === "heading") {
    const h = ctx.section()!;
    const all = ctx.headings();
    return {
      structure,
      row: all.findIndex((o) => o.from === h.from) + 1,
      rows: all.length,
      col: h.level,
      cols: heads.MAX_LEVEL,
    };
  }
  if (structure === "table") {
    const g = ctx.geometry()!;
    const { row, col } = ctx.cursor();
    return {
      structure,
      row: row + 1,
      rows: Math.max(1, g.rows),
      col: col + 1,
      cols: g.cols,
    };
  }
  return null;
}
