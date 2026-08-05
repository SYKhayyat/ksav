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

/** A list command, in either language. */
const LIST_NAMES = ["רשימה", "ממוספרת", "ממוספרת_עברית", "bullets", "numbered", "henum"];
const ITEM_NAMES = ["פריט", "item"];

export type ListKind = "bullets" | "numbered" | "hebrew";

const KIND_OF: Record<string, ListKind> = {
  "רשימה": "bullets",
  bullets: "bullets",
  "ממוספרת": "numbered",
  numbered: "numbered",
  "ממוספרת_עברית": "hebrew",
  henum: "hebrew",
};

/** The command each kind is written as, in each language. */
const KIND_NAME: Record<ListKind, { he: string; en: string }> = {
  bullets: { he: "רשימה", en: "bullets" },
  numbered: { he: "ממוספרת", en: "numbered" },
  hebrew: { he: "ממוספרת_עברית", en: "henum" },
};

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

function matchBracket(src: string, open: number): number | null {
  const opener = src[open];
  const closer = opener === "(" ? ")" : "]";
  let depth = 1;
  let inString = false;
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === "\\") i++;
    else if (c === '"' && opener === "(") inString = true;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") {
      if (c === closer && --depth === 0) return i;
      if (c !== closer) depth--;
    }
  }
  return null;
}

/** Every list call in the document, outermost first, in source order. */
function allLists(doc: string): ListInfo[] {
  const out: ListInfo[] = [];
  const re = new RegExp(`(#?)(${LIST_NAMES.join("|")})\\s*\\(`, "gu");
  for (const m of doc.matchAll(re)) {
    const at = m.index;
    // A name that is part of a longer identifier is not this command.
    const before = doc[at - 1];
    if (m[1] === "" && before && /[A-Za-z0-9֐-׿_]/.test(before)) continue;
    const open = at + m[0].length - 1;
    const close = matchBracket(doc, open);
    if (close == null) continue;
    const name = m[2];
    out.push({
      from: at,
      to: close + 1,
      argsFrom: open + 1,
      argsTo: close,
      kind: KIND_OF[name],
      name,
      lang: KIND_NAME[KIND_OF[name]].he === name ? "he" : "en",
      items: itemsIn(doc, open + 1, close),
      depth: 0,
      indent: "  ",
    });
  }
  // Depth and indentation are properties of where a list sits, so they are
  // filled in once every list is known.
  for (const l of out) {
    l.depth = out.filter((o) => o !== l && o.from < l.from && o.to > l.to).length;
    l.indent = indentOf(doc, l);
  }
  return out;
}

/** The whitespace a new item in this list should be written with. */
function indentOf(doc: string, l: ListInfo): string {
  const first = l.items[0];
  if (!first) return "  ".repeat(l.depth + 1);
  const lineStart = doc.lastIndexOf("\n", first.from - 1) + 1;
  const lead = doc.slice(lineStart, first.from);
  return /^\s*$/.test(lead) ? lead : "  ".repeat(l.depth + 1);
}

/** The `פריט[…]` calls directly inside this argument range. */
function itemsIn(doc: string, from: number, to: number): ItemInfo[] {
  const out: ItemInfo[] = [];
  const re = new RegExp(`(?:#?)(${ITEM_NAMES.join("|")})\\s*\\[`, "gu");
  re.lastIndex = from;
  for (let m = re.exec(doc); m && m.index < to; m = re.exec(doc)) {
    const at = m.index;
    const before = doc[at - 1];
    if (before && /[A-Za-z0-9֐-׿_]/.test(before)) continue;
    const open = at + m[0].length - 1;
    const close = matchBracket(doc, open);
    if (close == null || close > to) continue;
    // Only items belonging to *this* list: one nested in an inner list has an
    // enclosing bracket between it and our argument range.
    if (!isDirectChild(doc, from, at)) {
      re.lastIndex = close + 1;
      continue;
    }
    out.push({ from: at, to: close + 1, bodyFrom: open + 1, bodyTo: close });
    re.lastIndex = close + 1;
  }
  return out;
}

/** Is `at` at bracket depth zero relative to `from`? */
function isDirectChild(doc: string, from: number, at: number): boolean {
  let depth = 0;
  for (let i = from; i < at; i++) {
    const c = doc[i];
    if (c === "\\") i++;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
  }
  return depth === 0;
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
 */
export function breakInItem(doc: string, pos: number): Edit {
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
  if (!here || here.index === 0) return null;
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
  if (!here) return null;
  const outer = listAt(doc, list.from - 1);
  if (!outer) return null;
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
  if (!here) return null;
  let cut = here.item.to;
  while (cut < list.argsTo && (doc[cut] === "," || doc[cut] === " ")) cut++;
  if (doc[cut] === "\n") cut++;
  let from = here.item.from;
  while (from > list.argsFrom && /[ \t]/.test(doc[from - 1])) from--;
  return { text: doc.slice(0, from) + doc.slice(cut), caret: from };
}

/** Turn this list into bullets / numbers / Hebrew letters, keeping every item. */
export function setKind(doc: string, list: ListInfo, kind: ListKind): Edit {
  if (kind === list.kind) return { text: doc, caret: list.from };
  const name = list.lang === "en" ? KIND_NAME[kind].en : KIND_NAME[kind].he;
  const hash = doc[list.from] === "#" ? "#" : "";
  const nameFrom = list.from + hash.length;
  const nameTo = nameFrom + list.name.length;
  const text = doc.slice(0, nameFrom) + name + doc.slice(nameTo);
  return { text, caret: nameFrom + name.length };
}

/** Move the item at `pos` one place up or down within its list. */
export function moveItem(doc: string, list: ListInfo, pos: number, by: -1 | 1): Edit | null {
  const here = itemAt(list, pos);
  if (!here) return null;
  const other = list.items[here.index + by];
  if (!other) return null;
  const a = here.index < here.index + by ? here.item : other;
  const b = here.index < here.index + by ? other : here.item;
  const text =
    doc.slice(0, a.from) +
    doc.slice(b.from, b.to) +
    doc.slice(a.to, b.from) +
    doc.slice(a.from, a.to) +
    doc.slice(b.to);
  // The caret follows the item the writer was in.
  const moved = by < 0 ? a.from : a.from + (b.to - b.from) + (b.from - a.to);
  return { text, caret: moved + 1 };
}
