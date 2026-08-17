// Editing a list, as operations on the source rather than as typing practice.
//
// Lists had exactly one piece of UI: a button that inserted an empty one. After
// that the writer was on their own with `#רשימה(פריט[…], פריט[…],)` — and the
// commas, the trailing comma, and the fact that a nested list must be written
// *without* its hash are all things nobody should have to know to write a
// second bullet. Add an item, split one in two, indent, outdent, put a line
// break inside an item: those are the five things people actually do to a list,
// and none of them existed.
//
// Everything here is a pure function from (document, position) to a new
// document plus where the caret goes. That is what lets the keys, the ribbon
// and the menu all be the same code, and what lets the tests be real tests.

import { SPELLING, childrenOfRole, scan, type ListKind, type Node } from "./spans";

export type { ListKind };

/** The command each kind is written as, in each language. */
const KIND_NAME = SPELLING.list;

export interface ItemInfo {
  /** Range of the whole `פריט[…]` call. */
  from: number;
  to: number;
  /** Range of the body, inside the brackets. */
  bodyFrom: number;
  bodyTo: number;
}

export interface ListInfo {
  /** Range of the whole `#רשימה(…)` call, hash included when it has one. */
  from: number;
  to: number;
  /** Range of the argument list, inside the parentheses. */
  argsFrom: number;
  argsTo: number;
  kind: ListKind;
  /** The name it was actually written with, so a rewrite keeps its language. */
  name: string;
  lang: "he" | "en";
  items: ItemInfo[];
  /** Nesting depth, 0 for a list that is not inside another list. */
  depth: number;
  /** The indentation of this list's items, copied when adding one. */
  indent: string;
}

/**
 * Every list call in the document, outermost first, in source order.
 *
 * **The gershayim bug lived here.** This file's own bracket matcher treated `"`
 * as a string delimiter, so `#רשימה(פריט[דברי רש"י],)` scanned from the first
 * gershayim to end of document, never closed, and `listAt` returned null — which
 * is `structure.availableAt` returning *zero* operations. Every list button in
 * the ribbon switched itself off the moment a writer typed רש״י, which is the
 * most common word in a sefer. The identical text in a table cell worked, and
 * the identical list without the gershayim offered all eleven.
 *
 * The matcher is gone and `spans.ts` answers instead, where `"` is a string only
 * in code context — which is what Typst does, checked against the compiler
 * rather than chosen: `#רשימה(פריט[דברי רש"י],)` lays out two bullets.
 */
function allLists(doc: string): ListInfo[] {
  const out: ListInfo[] = [];
  for (const n of scan(doc).nodes) {
    if (n.role !== "list" || !n.args) continue;
    out.push(fromNode(doc, n));
  }
  return out;
}

function fromNode(doc: string, n: Node): ListInfo {
  const args = n.args!;
  // Depth among *lists*, not among calls: an item is a call too, and counting
  // it would make every list inside a list two levels deep instead of one.
  let depth = 0;
  for (let p = n.parent; p; p = p.parent) if (p.role === "list") depth++;
  const info: ListInfo = {
    from: n.from,
    to: n.to,
    argsFrom: args.from,
    argsTo: args.to,
    kind: n.listKind!,
    name: n.name,
    lang: n.lang,
    items: childrenOfRole(n, "item").map((c) => ({
      from: c.from,
      to: c.to,
      bodyFrom: c.bodies[0]?.from ?? c.to,
      bodyTo: c.bodies[0]?.to ?? c.to,
    })),
    depth,
    indent: "  ",
  };
  info.indent = indentOf(doc, info);
  return info;
}

/** The whitespace a new item in this list should be written with. */
function indentOf(doc: string, l: ListInfo): string {
  const first = l.items[0];
  if (!first) return "  ".repeat(l.depth + 1);
  const lineStart = doc.lastIndexOf("\n", first.from - 1) + 1;
  const lead = doc.slice(lineStart, first.from);
  return /^\s*$/.test(lead) ? lead : "  ".repeat(l.depth + 1);
}

/** The innermost list containing `pos`, if any. */
export function listAt(doc: string, pos: number): ListInfo | null {
  const holding = allLists(doc).filter((l) => pos >= l.argsFrom && pos <= l.argsTo);
  if (holding.length === 0) return null;
  return holding.reduce((a, b) => (b.depth > a.depth ? b : a));
}

/** The item of `list` containing `pos`, and its index. */
export function itemAt(list: ListInfo, pos: number): { item: ItemInfo; index: number } | null {
  const i = list.items.findIndex((it) => pos >= it.bodyFrom && pos <= it.bodyTo);
  return i < 0 ? null : { item: list.items[i], index: i };
}

/** Where the caret is, as every operation below needs it. */
export type Here = { item: ItemInfo; index: number } | null;
type OnItem = NonNullable<Here>;

// ---------------------------------------------------------------- can it act?
//
// The questions the ribbon, the menus and the hydra ask about every operation on
// every caret move. They take the resolved item rather than a position, so that
// asking eleven of them costs one `itemAt` and not eleven — and each operation
// asks its own before doing anything, so an enabled control and an operation that
// acts are the same sentence rather than two that can drift apart.

/** Always: an item can be added to a list wherever the caret is inside it. */
export function canAddItem(): boolean {
  return true;
}

/**
 * Only inside an item's body — a `\` anywhere else in a list is a syntax error.
 *
 * This said `return true` and the comment beside it said *"a line break can go
 * anywhere inside a list"*, which is the false premise the whole bug rests on.
 * A trailing backslash is Typst **content** markup. Inside `פריט[…]` it breaks
 * the line, which is what the writer asked for. In the list's *argument list* —
 * between two items, on the `#רשימה(` line, on the closing `)` — it is not
 * markup at all, and `breakInItem` spliced it in there without asking, because
 * a predicate that is constantly `true` is not a predicate.
 *
 * Found by driving the list hydra in a browser: the panel offered this
 * operation, ungreyed, at a caret where delete, indent, outdent and both moves
 * were all correctly greyed — because those ask `here !== null` and this asked
 * nothing. The result was ` \` sitting on its own between two items, and the
 * compiler answering *"Invalid syntax here — check brackets, commas, and the
 * command structure"*, which is not a sentence anybody can act on when the
 * thing they did was press Shift+Enter.
 *
 * `itemAt` is non-null exactly when the caret is within some item's
 * `[bodyFrom, bodyTo]`, so this is the same question `canDeleteItem` asks, and
 * it is the right one.
 */
export function canBreakInItem(here: Here): here is OnItem {
  return here !== null;
}

export function canDeleteItem(here: Here): here is OnItem {
  return here !== null;
}

/** Nested inside the item *above*, so the first item has nowhere to go. */
export function canIndentItem(here: Here): here is OnItem {
  return here !== null && here.index > 0;
}

/** Only out of a list that is itself inside one. */
export function canOutdentItem(doc: string, list: ListInfo, here: Here): here is OnItem {
  return here !== null && listAt(doc, list.from - 1) !== null;
}

export function canMoveItem(list: ListInfo, here: Here, by: -1 | 1): here is OnItem {
  return here !== null && !!list.items[here.index + by];
}

export function canSetKind(list: ListInfo, kind: ListKind): boolean {
  return list.kind !== kind;
}

export interface Edit {
  text: string;
  caret: number;
}

/** The `פריט` name matching a list's language. */
function itemName(l: ListInfo): string {
  return l.lang === "en" ? "item" : "פריט";
}

/**
 * Add an empty item after the one holding `pos` (or at the end).
 *
 * This is what Enter does, and what the ribbon's "+" does. The comma and the
 * indentation come from the list itself, so an item added to a compact list
 * stays compact and one added to an indented list lines up.
 */
export function addItem(doc: string, list: ListInfo, pos: number): Edit {
  const here = itemAt(list, pos);
  const after = here ? here.item.to : lastItemEnd(list);
  // Written on its own line when the list is written on lines, inline when it
  // is written inline — matching what is already there is the whole trick to an
  // edit that does not look like a machine made it.
  const multiline = list.items.length === 0 || doc.slice(list.argsFrom, list.argsTo).includes("\n");
  const lead = multiline ? `,\n${list.indent}` : ", ";
  const snippet = `${lead}${itemName(list)}[]`;
  // Written *before* any comma that already follows, not after it: the snippet
  // carries its own leading comma, so inserting past an existing one produces
  // `פריט[שני],,` — legal-looking, and a syntax error.
  const text = doc.slice(0, after) + snippet + doc.slice(after);
  return { text, caret: after + snippet.length - 1 };
}

function lastItemEnd(list: ListInfo): number {
  return list.items.length ? list.items[list.items.length - 1].to : list.argsFrom;
}

/**
 * Split the item at `pos` in two, keeping what follows the caret in the new one.
 *
 * Enter in the middle of an item. In Word this is so ordinary that not having
 * it reads as the list being broken.
 */
export function splitItem(doc: string, list: ListInfo, pos: number): Edit {
  const here = itemAt(list, pos);
  if (!here) return addItem(doc, list, pos);
  const tail = doc.slice(pos, here.item.bodyTo);
  const multiline = doc.slice(list.argsFrom, list.argsTo).includes("\n");
  const lead = multiline ? `,\n${list.indent}` : ", ";
  const rebuilt = `]${lead}${itemName(list)}[${tail}`;
  // From `bodyTo`, not `bodyTo + 1`: the original `]` is the one that closes the
  // *new* item. Consuming it leaves the tail's bracket unclosed, which Typst
  // reports at the end of the file, nowhere near the list.
  const text = doc.slice(0, pos) + rebuilt + doc.slice(here.item.bodyTo);
  return { text, caret: pos + rebuilt.length - tail.length };
}

/**
 * A line break *inside* an item, rather than a new item — Shift+Enter.
 *
 * Typst breaks a line on a trailing backslash and a paragraph on a blank line.
 * The backslash is the one that keeps the text in the same bullet, which is
 * what "a newline in this item" means to the person asking for it.
 *
 * Takes the list and asks `canBreakInItem` first, like every other operation in
 * this file. It used to take only a position and splice unconditionally, which
 * is how it came to write a bare ` \` into a list's argument list — see
 * `canBreakInItem` for what that produced and how it was found.
 */
export function breakInItem(doc: string, list: ListInfo, pos: number): Edit | null {
  const here = itemAt(list, pos);
  if (!canBreakInItem(here)) return null;
  const snippet = " \\\n";
  return { text: doc.slice(0, pos) + snippet + doc.slice(pos), caret: pos + snippet.length };
}

/**
 * Push the item at `pos` down a level: it becomes a one-item list nested in the
 * item above it. Tab, in every outliner ever written.
 *
 * Nested inside the *previous* item, because that is what indenting means — a
 * sub-point of the point above. An item with nothing above it cannot indent,
 * and says so by not moving.
 */
export function indentItem(doc: string, list: ListInfo, pos: number): Edit | null {
  const here = itemAt(list, pos);
  if (!canIndentItem(here)) return null;
  const prev = list.items[here.index - 1];
  const body = doc.slice(here.item.bodyFrom, here.item.bodyTo);

  // Does the previous item already end with a nested list? Then join it rather
  // than making a second one beside it.
  const prevBody = doc.slice(prev.bodyFrom, prev.bodyTo);
  const inner = listAt(doc, prev.bodyTo - 1);
  const nested = inner && inner.from > prev.bodyFrom && inner.to <= prev.bodyTo ? inner : null;

  // Remove the item (and the comma that followed it) from where it was.
  let cut = here.item.to;
  while (cut < list.argsTo && (doc[cut] === "," || doc[cut] === " ")) cut++;
  if (doc[cut] === "\n") cut++;
  const withoutIt = doc.slice(0, here.item.from) + doc.slice(cut);
  const shift = (n: number) => (n > here.item.from ? n - (cut - here.item.from) : n);

  if (nested) {
    const at = shift(nested.argsTo);
    const snippet = ` ${itemName(list)}[${body}],`;
    const text = withoutIt.slice(0, at) + snippet + withoutIt.slice(at);
    return { text, caret: at + snippet.length - 2 };
  }

  const at = shift(prev.bodyTo);
  const inLang = list.lang === "en" ? KIND_NAME[list.kind].en : KIND_NAME[list.kind].he;
  // No hash: the nested list sits inside `פריט[…]`, which is content mode, so
  // it *does* take one. (`mode.ts` owns this rule; here we are writing into a
  // body, which is content.)
  const spacer = prevBody.trim() ? "\n" + list.indent + "  " : "";
  const snippet = `${spacer}#${inLang}(${itemName(list)}[${body}],)`;
  const text = withoutIt.slice(0, at) + snippet + withoutIt.slice(at);
  // Inside the item, not after it. The snippet ends `],)`, so three back from
  // the end is the closing bracket — i.e. the end of the body the writer was
  // typing. It used to be two, which left the caret between the comma and the
  // closing paren: still inside the list, in no item at all. Tab therefore
  // worked and Shift+Tab immediately after it returned null and did nothing,
  // which is exactly what the writer reported. The nested branch above has
  // always been right, which is how one operation had two different answers.
  return { text, caret: at + snippet.length - 3 };
}

/**
 * Pull the item at `pos` up a level, into the list its own list sits in.
 * Shift+Tab. An item already at the top level has nowhere to go.
 */
export function outdentItem(doc: string, list: ListInfo, pos: number): Edit | null {
  const here = itemAt(list, pos);
  if (!canOutdentItem(doc, list, here)) return null;
  const outer = listAt(doc, list.from - 1)!;
  const body = doc.slice(here.item.bodyFrom, here.item.bodyTo);

  // Take it out of the inner list, and drop the inner list too if that empties it.
  let cut = here.item.to;
  while (cut < list.argsTo && (doc[cut] === "," || doc[cut] === " ")) cut++;
  if (doc[cut] === "\n") cut++;
  const emptied = list.items.length === 1;
  const from = emptied ? list.from : here.item.from;
  const to = emptied ? list.to : cut;
  const withoutIt = doc.slice(0, from) + doc.slice(to);
  const shift = (n: number) => (n > from ? n - (to - from) : n);

  // Place it after the outer item that contained the inner list.
  const holder = outer.items.find((it) => it.bodyFrom <= list.from && it.bodyTo >= list.to);
  // Before the comma that already follows the holder, never after it. Inserting
  // after produced `],,` *and* left the item that followed with no separator at
  // all — one off-by-one comma, two syntax errors, and a document that would not
  // compile. The unit tests passed it: balanced brackets are not legal Typst.
  const at = shift(holder ? holder.to : outer.argsTo);
  const multiline = doc.slice(outer.argsFrom, outer.argsTo).includes("\n");
  const lead = multiline ? `,\n${outer.indent}` : ", ";
  const snippet = `${lead}${itemName(outer)}[${body}]`;
  const text = withoutIt.slice(0, at) + snippet + withoutIt.slice(at);
  return { text, caret: at + snippet.length - 1 };
}

/** Delete the item at `pos`, comma and all. */
export function deleteItem(doc: string, list: ListInfo, pos: number): Edit | null {
  const here = itemAt(list, pos);
  if (!canDeleteItem(here)) return null;
  let cut = here.item.to;
  while (cut < list.argsTo && (doc[cut] === "," || doc[cut] === " ")) cut++;
  if (doc[cut] === "\n") cut++;
  let from = here.item.from;
  while (from > list.argsFrom && /[ \t]/.test(doc[from - 1])) from--;
  const text = doc.slice(0, from) + doc.slice(cut);
  // Into the item that took its place — or the one before, when the last item
  // was the one deleted. `caret: from` was the gap where the item had been:
  // inside the argument list and inside no item, so the next character typed
  // landed between two `פריט` calls and produced prose.
  const shift = cut - from;
  const survivor =
    list.items[here.index + 1] !== undefined
      ? { bodyFrom: list.items[here.index + 1].bodyFrom - shift }
      : list.items[here.index - 1];
  return { text, caret: survivor ? survivor.bodyFrom : from };
}

/**
 * A paragraph break *inside* an item — not a new item, and not a line break.
 *
 * The third thing Enter can mean in a list, and the one that had no key. Enter
 * makes the next bullet, `Shift+Enter` makes a new line in this one, and
 * neither of them gives an item a second *paragraph* — which is what a se'if
 * with two paragraphs under one number needs, and what somebody writing a real
 * sefer asks for about as often as they ask for the other two.
 *
 * A blank line, which is Typst's own paragraph break and is what the writer
 * would have typed in prose. It is legal inside a content block, so the item
 * keeps its number and gains a paragraph — see `engine/tests/lists.rs`.
 */
export function paraInItem(doc: string, list: ListInfo, pos: number): Edit | null {
  const here = itemAt(list, pos);
  if (!canBreakInItem(here)) return null;
  const snippet = "\n\n";
  return { text: doc.slice(0, pos) + snippet + doc.slice(pos), caret: pos + snippet.length };
}

// ---------------------------------------------------------------- make one
//
// *"It looks like it is not a list"* — written in the margin of a document whose
// 156 numbered items are `#הדגשה[45.]` paragraphs with typed numbers. The same
// margin, a few lines later, records that the structure controls were greyed out
// and said nothing: correct, because the caret was in prose and there was
// nothing to act on, and useless, because the thing to do about that is exactly
// what the product had no verb for.
//
// So this is the verb. It reads what is there the way a person reads it, throws
// away the numbering the writer typed by hand — that is what the real list is
// for — and writes the list they meant.

/** The hand-typed numbering this strips: `1.`, `(2)`, `א)`, `iv.`, `A.`. */
const TYPED_NUMBER = /^\s*\(?\s*(\d{1,3}|[א-ת]{1,2}|[ivxlcIVXLC]{1,6}|[A-Za-z])\s*[.)\]:]\s*/;
/** …and the bullets: `-`, `–`, `*`, `•`. */
const TYPED_BULLET = /^\s*[-–—*•·]\s+/;
/** A number a writer emphasised, which is how the inventory's own spine is written. */
const BOLD_WRAPPED = /^\s*#(?:הדגשה|bold)\[([^\]]*)\]\s*/;

/** What the writer had been typing in front of each item, if anything. */
export type TypedMark = "number" | "letter" | "bullet" | "none";

function markOf(line: string): TypedMark {
  const bare = line.replace(BOLD_WRAPPED, (_m, inner: string) =>
    TYPED_NUMBER.test(inner) || /^\s*[\d]/.test(inner) ? "" : _m,
  );
  if (TYPED_BULLET.test(bare)) return "bullet";
  const n = TYPED_NUMBER.exec(bare);
  if (!n) return bare === line ? "none" : "number";
  return /^\d/.test(n[1]) ? "number" : /^[א-ת]/.test(n[1]) ? "letter" : "number";
}

/** The line without whatever it was wearing. */
function stripMark(line: string): string {
  const bare = line.replace(BOLD_WRAPPED, (_m, inner: string) =>
    TYPED_NUMBER.test(inner) || /^\s*[\d]/.test(inner) ? "" : _m,
  );
  return bare.replace(TYPED_BULLET, "").replace(TYPED_NUMBER, "").trim();
}

/**
 * The lines the selection covers, as the items they are asking to become.
 *
 * Two readings, because a writer means two different things and the page shows
 * them both. **With a blank line anywhere in the block** they have written
 * paragraphs, and a paragraph is an item — its own lines are one item's prose,
 * wrapped, exactly as they already print. **With no blank line at all** they
 * have a stack of lines, which prints as one paragraph and is meant as a list,
 * so each line is an item. Guessing one rule for both cases gets the other one
 * badly wrong in either direction.
 */
export function itemsFor(block: string): string[] {
  const chunks = /\n[ \t]*\n/.test(block) ? block.split(/\n[ \t]*\n+/) : block.split("\n");
  return chunks.map((c) => c.trim()).filter((c) => c !== "");
}

/** Nothing to make a list out of, or the caret is already in one. */
export function canMakeList(doc: string, from: number, to: number): boolean {
  if (listAt(doc, from) || listAt(doc, to)) return false;
  return itemsFor(blockAround(doc, from, to).text).length > 0;
}

function blockAround(doc: string, from: number, to: number): { text: string; from: number; to: number } {
  let start = doc.lastIndexOf("\n", from - 1) + 1;
  let end = doc.indexOf("\n", to);
  if (end < 0) end = doc.length;
  // An empty selection means "this paragraph", which is what every word
  // processor means by it: run out to the blank line in both directions.
  if (from === to) {
    while (start > 0) {
      const prev = doc.lastIndexOf("\n", start - 2) + 1;
      if (doc.slice(prev, start - 1).trim() === "") break;
      start = prev;
    }
    while (end < doc.length) {
      const next = doc.indexOf("\n", end + 1);
      const line = doc.slice(end + 1, next < 0 ? doc.length : next);
      if (line.trim() === "") break;
      end = next < 0 ? doc.length : next;
    }
  }
  return { text: doc.slice(start, end), from: start, to: end };
}

/**
 * Make this a real list.
 *
 * `kind` may be `"auto"`, which reads the numbering the writer typed: digits
 * make a numbered list, Hebrew letters make a Hebrew-lettered one, and bullets
 * or nothing make bullets. Whatever it picks, the typed marks come off — a list
 * that renumbers itself and still carries the old numbers is worse than the
 * paragraphs it replaced.
 */
export function makeList(
  doc: string,
  from: number,
  to: number,
  kind: ListKind | "auto",
  lang: "he" | "en",
): Edit | null {
  if (!canMakeList(doc, from, to)) return null;
  const block = blockAround(doc, from, to);
  const lines = itemsFor(block.text);
  const marks = lines.map(markOf);
  const chosen: ListKind =
    kind !== "auto"
      ? kind
      : marks.includes("letter") && !marks.includes("number")
        ? "hebrew"
        : marks.includes("number")
          ? "numbered"
          : "bullets";
  const name = lang === "en" ? KIND_NAME[chosen].en : KIND_NAME[chosen].he;
  const item = lang === "en" ? "item" : "פריט";
  const indent = /^[ \t]*/.exec(block.text)?.[0] ?? "";
  const body = lines.map((l) => `${indent}  ${item}[${stripMark(l)}],`).join("\n");
  const text = `${indent}#${name}(\n${body}\n${indent})`;
  return {
    text: doc.slice(0, block.from) + text + doc.slice(block.to),
    // Inside the first item, which is where a writer looks after pressing it.
    caret: block.from + text.indexOf("[") + 1,
  };
}

/**
 * Turn this list into bullets / numbers / Hebrew letters, keeping every item.
 *
 * Only the command name changes, so the writer does not move: `pos` is carried
 * across by the length the name grew or shrank. It used to be dropped and the
 * caret parked after the new name — outside every item, in the argument list,
 * where the next character typed is markup. A writer converting a list is in the
 * middle of writing it.
 */
export function setKind(doc: string, list: ListInfo, kind: ListKind, pos = 0): Edit {
  if (!canSetKind(list, kind)) return { text: doc, caret: list.from };
  const name = list.lang === "en" ? KIND_NAME[kind].en : KIND_NAME[kind].he;
  const hash = doc[list.from] === "#" ? "#" : "";
  const nameFrom = list.from + hash.length;
  const nameTo = nameFrom + list.name.length;
  const text = doc.slice(0, nameFrom) + name + doc.slice(nameTo);
  const caret = pos >= nameTo ? pos + (name.length - list.name.length) : nameFrom + name.length;
  return { text, caret };
}

/** Move the item at `pos` one place up or down within its list. */
export function moveItem(doc: string, list: ListInfo, pos: number, by: -1 | 1): Edit | null {
  const here = itemAt(list, pos);
  if (!canMoveItem(list, here, by)) return null;
  const other = list.items[here.index + by];
  const a = here.index < here.index + by ? here.item : other;
  const b = here.index < here.index + by ? other : here.item;
  const text =
    doc.slice(0, a.from) +
    doc.slice(b.from, b.to) +
    doc.slice(a.to, b.from) +
    doc.slice(a.from, a.to) +
    doc.slice(b.to);
  // The caret follows the item the writer was in — at the same offset inside
  // it, not one character past its start. `moved + 1` put it between the `פ` and
  // the `ר` of `פריט`, so the next keystroke after moving an item wrote into the
  // command name and the item stopped being an item.
  const moved = by < 0 ? a.from : a.from + (b.to - b.from) + (b.from - a.to);
  return { text, caret: moved + (pos - here.item.from) };
}

// ---------------------------------------------------------------- bracket form
//
// A list can be written two ways, and only one of them is a list as far as this
// module is concerned:
//
//   #רשימה(פריט[א], פריט[ב])      the argument form — items are arguments
//   #רשימה[#פריט[א] #פריט[ב]]      the bracket form — items are in the body
//   #רשימה[א][ב]                   the same, without the item command at all
//
// The engine takes all three and lays them out identically. `allLists` above
// takes the first only (`if (n.role !== "list" || !n.args) continue`), because
// every operation in this file writes into the argument list: `addItem` splices
// `,\n  פריט[…]` between two arguments, `moveItem` swaps two argument ranges,
// `indentItem` re-nests one. Pointed at a list that has no argument list, each
// of them would write its comma into a body and produce prose.
//
// So the bracket form is not quietly adopted here — it is offered a conversion.
// Recognising it far enough to enable the ribbon, without teaching six
// operations a second syntax, would turn a list that renders correctly into a
// list the ribbon corrupts on the first click, which is worse than the ribbon
// staying grey.

/** A list written in body brackets, and the same list as an argument list. */
export interface Normalisable {
  /** The whole call, `#` included. */
  from: number;
  to: number;
  /** The command name, for the message. */
  name: string;
  /** The argument form, ready to replace the range. */
  text: string;
}

/**
 * Every list in `doc` whose items are in its body rather than its argument list.
 *
 * Named arguments are carried across, so `#רשימה(סמן: [–])[א][ב]` — which has an
 * argument list *and* keeps its items outside it, and which `allLists` therefore
 * reports as a list with zero items — comes out as
 * `#רשימה(סמן: [–], פריט[א], פריט[ב])`.
 */
export function bracketLists(doc: string): Normalisable[] {
  const out: Normalisable[] = [];
  for (const n of scan(doc).nodes) {
    if (n.role !== "list" || n.bodies.length === 0) continue;
    const kids = childrenOfRole(n, "item");
    const args = n.args;
    // Items already where the ribbon expects them: nothing to offer.
    if (args && kids.some((c) => c.from >= args.from && c.to <= args.to)) continue;
    const item = n.lang === "en" ? "item" : "פריט";
    const parts: string[] = [];
    for (const b of n.bodies) {
      const inside = kids.filter((c) => c.from >= b.from && c.to <= b.to);
      if (inside.length > 0) {
        for (const k of inside) {
          const kb = k.bodies[0];
          parts.push(`${item}[${kb ? doc.slice(kb.from, kb.to) : ""}]`);
        }
      } else {
        // A body with no item command in it is itself one item — `#רשימה[א][ב]`.
        const body = doc.slice(b.from, b.to).trim();
        if (body !== "") parts.push(`${item}[${body}]`);
      }
    }
    if (parts.length === 0) continue;
    const named = args ? doc.slice(args.from, args.to).trim() : "";
    const inner = named === "" ? parts.join(", ") : `${named}, ${parts.join(", ")}`;
    const hash = doc[n.from] === "#" ? "#" : "";
    out.push({ from: n.from, to: n.to, name: n.name, text: `${hash}${n.name}(${inner})` });
  }
  return out;
}
