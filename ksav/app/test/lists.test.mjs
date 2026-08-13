import { check, ok, notOk } from "./harness.mjs";
import {
  listAt,
  itemAt,
  addItem,
  splitItem,
  breakInItem,
  canBreakInItem,
  indentItem,
  outdentItem,
  deleteItem,
  setKind,
  moveItem,
  paraInItem,
  itemsFor,
  makeList,
  canMakeList,
} from "../.tmp-test/lists.mjs";
import { modeAt } from "../.tmp-test/mode.mjs";

// The five things people do to a list, none of which the product could do:
// add an item, split one, indent, outdent, put a line break inside one.
//
// Every case here checks the *source stays legal* as well as the shape, because
// an edit that produces markup Typst rejects blanks the preview — which is how
// a writer experiences it, whatever the intent was.

const L = `#רשימה(
  פריט[ראשון],
  פריט[שני],
  פריט[שלישי],
)`;

/** Brackets balanced and no hash inside an argument list: the two ways these
 *  rewrites go wrong in a way the writer sees as "the page went blank". */
function legal(name, text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (depth < 0) break;
  }
  check(`${name}: brackets balance`, depth, 0);
  // Every `#` must sit in content mode.
  for (let i = text.indexOf("#"); i >= 0; i = text.indexOf("#", i + 1)) {
    check(`${name}: the # at ${i} is in content mode`, modeAt(text, i), "content");
  }
}

export async function run() {

// ---------------------------------------------------------------- finding

{
  const l = listAt(L, L.indexOf("שני"));
  ok("a list is found from inside an item", !!l);
  check("its kind", l.kind, "bullets");
  check("its items", l.items.length, 3);
  check("the item under the caret", itemAt(l, L.indexOf("שני")).index, 1);
  notOk("outside the list, nothing", listAt(L + "\nאחרי", L.length + 3));
}

{
  // The innermost list wins, which is what every operation means by "this list".
  const N = `#רשימה(
  פריט[חיצוני
    #רשימה(פריט[פנימי],)
  ],
)`;
  const inner = listAt(N, N.indexOf("פנימי"));
  check("the innermost list is the one found", inner.items.length, 1);
  check("and it knows its depth", inner.depth, 1);
}

// ---------------------------------------------------------------- add

{
  const l = listAt(L, L.indexOf("שני"));
  const r = addItem(L, l, L.indexOf("שני"));
  legal("add", r.text);
  check("add: a fourth item exists", listAt(r.text, r.caret).items.length, 4);
  check("add: it lands after the one we were in", r.text.indexOf("פריט[]") > r.text.indexOf("שני"), true);
  check("add: the caret is inside the new item", r.text[r.caret], "]");
  ok("add: the list stayed multi-line", r.text.includes("],\n  פריט[]"));
}

{
  // An inline list stays inline: matching what is there is the difference
  // between an edit and a reformat.
  const I = `#רשימה(פריט[א], פריט[ב],)`;
  const l = listAt(I, I.indexOf("א"));
  const r = addItem(I, l, I.indexOf("א"));
  legal("add inline", r.text);
  notOk("add: no newline forced into an inline list", r.text.includes("\n"));
}

{
  // An empty list is the state right after the toolbar button, and the most
  // likely place for someone to press Enter first.
  const E = `#רשימה(\n  פריט[],\n)`;
  const l = listAt(E, E.indexOf("[") + 1);
  const r = addItem(E, l, E.indexOf("[") + 1);
  legal("add to empty", r.text);
  check("add: two items now", listAt(r.text, r.caret).items.length, 2);
}

// ---------------------------------------------------------------- split

{
  const at = L.indexOf("שני") + 1; // between ש and ני
  const l = listAt(L, at);
  const r = splitItem(L, l, at);
  legal("split", r.text);
  const items = listAt(r.text, r.caret).items;
  check("split: one more item", items.length, 4);
  ok("split: the head kept its start", r.text.includes("פריט[ש]"));
  ok("split: the tail moved to the new item", r.text.includes("פריט[ני]"));
  check("split: the caret is at the start of the tail", r.text.slice(r.caret, r.caret + 2), "ני");
}

// ---------------------------------------------------------------- line break

{
  const at = L.indexOf("שני") + 3;
  const r = breakInItem(L, listAt(L, at), at);
  legal("break", r.text);
  check("break: still three items", listAt(r.text, r.caret).items.length, 3);
  ok("break: a Typst line break was written", r.text.includes("שני \\\n"));
}

// A `\` is content markup: inside `פריט[…]` it breaks the line, and in the
// list's *argument list* it is a syntax error. This took only a position and
// spliced unconditionally, with a predicate that returned `true` for every
// caret — so pressing Shift+Enter between two items, or on the `#רשימה(` line,
// or on the closing `)`, wrote ` \` where Typst answers "the character `\` is
// not valid in code". Found by driving the list hydra in a browser, where the
// panel offered it ungreyed at a caret where delete, indent, outdent and both
// moves were all correctly greyed.
{
  const list = listAt(L, L.indexOf("שני"));
  const between = L.indexOf("],") + 2;
  const onOpen = L.indexOf("(") + 1;
  const onClose = L.lastIndexOf(")");
  for (const [name, pos] of [
    ["between two items", between],
    ["on the opening line", onOpen],
    ["on the closing paren", onClose],
  ]) {
    notOk(`break: refuses ${name}`, canBreakInItem(itemAt(list, pos)));
    check(`break: and does nothing there — ${name}`, breakInItem(L, list, pos), null);
  }
  ok("break: still applies inside an item", canBreakInItem(itemAt(list, L.indexOf("שני") + 1)));
}

// ---------------------------------------------------------------- indent

{
  const at = L.indexOf("שני");
  const l = listAt(L, at);
  const r = indentItem(L, l, at);
  legal("indent", r.text);
  const outer = listAt(r.text, r.text.indexOf("ראשון"));
  check("indent: the outer list lost an item", outer.items.length, 2);
  const inner = listAt(r.text, r.text.indexOf("שני"));
  check("indent: a nested list holds it", inner.depth, 1);
  check("indent: with the item in it", inner.items.length, 1);
  ok("indent: the nested list is written inside the item body", r.text.includes("ראשון\n"));
}

{
  // The first item has nothing to be a sub-point of.
  const at = L.indexOf("ראשון");
  const l = listAt(L, at);
  notOk("indent: the first item cannot indent", indentItem(L, l, at));
}

{
  // A second indent joins the nested list rather than making a sibling one.
  const at = L.indexOf("שני");
  const once = indentItem(L, listAt(L, at), at);
  const at2 = once.text.indexOf("שלישי");
  const twice = indentItem(once.text, listAt(once.text, at2), at2);
  legal("indent twice", twice.text);
  const inner = listAt(twice.text, twice.text.indexOf("שלישי"));
  check("indent: both items joined the one nested list", inner.items.length, 2);
}

// ---------------------------------------------------------------- outdent

{
  // Indent then outdent is the identity, which is the property that says both
  // are doing real structural work rather than shuffling text.
  const at = L.indexOf("שני");
  const inward = indentItem(L, listAt(L, at), at);
  const back = inward.text.indexOf("שני");
  const out = outdentItem(inward.text, listAt(inward.text, back), back);
  legal("outdent", out.text);
  const l = listAt(out.text, out.text.indexOf("שני"));
  check("outdent: back to one flat list of three", l.items.length, 3);
  check("outdent: and it is the top-level one", l.depth, 0);
  ok("outdent: the emptied nested list was removed", !out.text.includes("()"));
}

{
  const at = L.indexOf("שני");
  const l = listAt(L, at);
  notOk("outdent: a top-level item has nowhere to go", outdentItem(L, l, at));
}

// ---------------------------------------------------------------- delete, move, kind

{
  const at = L.indexOf("שני");
  const l = listAt(L, at);
  const r = deleteItem(L, l, at);
  legal("delete", r.text);
  check("delete: two left", listAt(r.text, r.text.indexOf("ראשון")).items.length, 2);
  notOk("delete: the text is gone", r.text.includes("שני"));
}

{
  const at = L.indexOf("שני");
  const l = listAt(L, at);
  const up = moveItem(L, l, at, -1);
  legal("move up", up.text);
  ok("move: it swapped with the one above", up.text.indexOf("שני") < up.text.indexOf("ראשון"));
  check("move: still three", listAt(up.text, up.text.indexOf("שני")).items.length, 3);
  const down = moveItem(L, l, at, 1);
  ok("move: and down swaps with the one below", down.text.indexOf("שלישי") < down.text.indexOf("שני"));
  notOk("move: the last item cannot go down", moveItem(L, l, L.indexOf("שלישי"), 1));
}

{
  const l = listAt(L, L.indexOf("שני"));
  const r = setKind(L, l, "numbered");
  legal("kind", r.text);
  check("kind: the command changed", listAt(r.text, r.text.indexOf("שני")).kind, "numbered");
  check("kind: every item survived", listAt(r.text, r.text.indexOf("שני")).items.length, 3);
  const h = setKind(L, l, "hebrew");
  check("kind: Hebrew letters too", listAt(h.text, h.text.indexOf("שני")).kind, "hebrew");
}

{
  // An English document keeps English names.
  const E = `#bullets(\n  item[one],\n  item[two],\n)`;
  const l = listAt(E, E.indexOf("two"));
  check("the language is read off the source", l.lang, "en");
  const r = addItem(E, l, E.indexOf("two"));
  ok("add: an English list gets an English item", r.text.includes("item[]"));
  const k = setKind(E, l, "numbered");
  ok("kind: and an English command name", k.text.includes("#numbered("));
}

// ---------------------------------------------------- a paragraph in an item
//
// The third reading of Enter, and the one that had no key at all: a second
// paragraph under one number. Enter makes the next item, Shift+Enter makes a
// line inside this one, and a se'if with two paragraphs needs neither.
{
  const L = `#רשימה(\n  פריט[ראשון],\n  פריט[שני],\n)`;
  const l = listAt(L, L.indexOf("שני"));
  const at = L.indexOf("שני") + 3;
  const r = paraInItem(L, l, at);
  legal("para", r.text);
  check("para: a blank line, which is what a paragraph break is", r.text.slice(at, at + 2), "\n\n");
  check("para: the item still holds it", listAt(r.text, r.text.indexOf("שני")).items.length, 2);
  ok("para: and it is not a line break", !r.text.includes("\\\n"));
  check("para: the caret is past it", r.caret, at + 2);
  ok("para: refused where there is no item", paraInItem(L, l, l.argsFrom) === null);
}

// ------------------------------------------------- make this a real list
//
// *"It looks like it is not a list"*, written in the margin of a document whose
// 156 numbered items are `#הדגשה[45.]` paragraphs. There was no verb for it:
// the bullet button inserted an *empty* list, and pressed with a selection it
// wrapped the whole selection inside one bullet.
{
  check("items: one per line when there are no blank lines", itemsFor("אחת\nשתים\nשלש").length, 3);
  // With blank lines the writer has written paragraphs, and a paragraph is an
  // item — its own lines are one item's prose, wrapped, exactly as they print.
  check("items: one per paragraph when there are", itemsFor("אחת\nעוד\n\nשתים").length, 2);
  check("items: and the wrapped lines stay together", itemsFor("אחת\nעוד\n\nשתים")[0], "אחת\nעוד");
  check("items: blank lines are not items", itemsFor("\n\nאחת\n\n\n").length, 1);
}
{
  const P = "אחת\nשתים\nשלש";
  const r = makeList(P, 0, P.length, "auto", "he");
  legal("make", r.text);
  check("make: one item per line", listAt(r.text, r.text.indexOf("שתים")).items.length, 3);
  ok("make: bullets when nothing was numbered", r.text.startsWith("#רשימה("));
  check("make: the caret lands in the first item", r.text.slice(r.caret, r.caret + 3), "אחת");
}
{
  // The numbers the writer typed come off. A list that renumbers itself and
  // still carries the old numbers is worse than the paragraphs it replaced.
  const P = "1. אחת\n2. שתים\n3. שלש";
  const r = makeList(P, 0, P.length, "auto", "he");
  ok("make: typed digits choose a numbered list", r.text.startsWith("#ממוספרת("));
  ok("make: and the digits are gone", !/1\./.test(r.text), r.text);
  check("make: three items", listAt(r.text, r.text.indexOf("שתים")).items.length, 3);
}
{
  const P = "א. אחת\nב. שתים";
  const r = makeList(P, 0, P.length, "auto", "he");
  ok("make: typed Hebrew letters choose a Hebrew-lettered list", r.text.startsWith("#ממוספרת_עברית("));
  ok("make: and the letters are gone", !r.text.includes("א. אחת"), r.text);
}
{
  const P = "- אחת\n– שתים\n• שלש";
  const r = makeList(P, 0, P.length, "auto", "he");
  ok("make: typed bullets choose bullets", r.text.startsWith("#רשימה("));
  ok("make: and the bullets are gone", !/[-–•]/.test(r.text), r.text);
}
{
  // The inventory's own spine: a number the writer emphasised.
  const P = "#הדגשה[45.] אחת\n#הדגשה[46.] שתים";
  const r = makeList(P, 0, P.length, "auto", "he");
  ok("make: an emphasised number is still a typed number", r.text.startsWith("#ממוספרת("));
  ok("make: and it comes off with the rest", !r.text.includes("הדגשה"), r.text);
}
{
  // Emphasis that is not a number is the writer's markup and stays.
  const P = "#הדגשה[פתיחה] אחת\n#הדגשה[המשך] שתים";
  const r = makeList(P, 0, P.length, "auto", "he");
  ok("make: emphasis that is not a number survives", r.text.includes("#הדגשה[פתיחה]"), r.text);
}
{
  const P = "one\ntwo";
  const r = makeList(P, 0, P.length, "bullets", "en");
  ok("make: an English document gets English names", r.text.startsWith("#bullets("), r.text);
  ok("make: and English items", r.text.includes("item[one]"), r.text);
}
{
  // An empty selection means "this paragraph", which is what it means in every
  // word processor.
  const P = "לפני\n\nאחת\nשתים\n\nאחרי";
  const r = makeList(P, P.indexOf("אחת") + 1, P.indexOf("אחת") + 1, "auto", "he");
  ok("make: the caret alone takes its own paragraph", r.text.startsWith("לפני\n\n#רשימה("), r.text);
  ok("make: and leaves the neighbours alone", r.text.endsWith("\n\nאחרי"), r.text);
}
{
  const L = `#רשימה(\n  פריט[ראשון],\n)`;
  notOk("make: refused inside a list", canMakeList(L, L.indexOf("ראשון"), L.indexOf("ראשון")));
  ok("make: and it does not act", makeList(L, L.indexOf("ראשון"), L.indexOf("ראשון"), "auto", "he") === null);
  notOk("make: refused with nothing to make", canMakeList("   \n  \n", 0, 6));
}

}
