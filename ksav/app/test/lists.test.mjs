import { check, ok, notOk } from "./harness.mjs";
import {
  listAt,
  itemAt,
  addItem,
  splitItem,
  breakInItem,
  indentItem,
  outdentItem,
  deleteItem,
  setKind,
  moveItem,
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
  const r = breakInItem(L, at);
  legal("break", r.text);
  check("break: still three items", listAt(r.text, r.caret).items.length, 3);
  ok("break: a Typst line break was written", r.text.includes("שני \\\n"));
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

}
