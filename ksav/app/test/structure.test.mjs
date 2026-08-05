import { check, ok, notOk } from "./harness.mjs";
import {
  STRUCTURE_ACTIONS,
  actionById,
  structureAt,
  availableAt,
  whereAmI,
} from "../.tmp-test/structure.mjs";

// The registry every surface is generated from. If an operation is missing an
// id, or claims to apply when it cannot, then a ribbon button does nothing when
// pressed and a key binding silently swallows the keystroke.

const L = `#רשימה(\n  פריט[ראשון],\n  פריט[שני],\n  פריט[שלישי],\n)\n`;
const T = `#טבלה(עמודות: 2, פסים: true,\n  כותרת_תא[א], כותרת_תא[ב],\n  תא[ג], תא[ד],\n)\n`;

export async function run() {

// ---------------------------------------------------------------- the registry itself

{
  const ids = STRUCTURE_ACTIONS.map((a) => a.id);
  check("every id is unique", new Set(ids).size, ids.length);
  for (const a of STRUCTURE_ACTIONS) {
    ok(`${a.id}: has a label key`, !!a.label);
    ok(`${a.id}: has a glyph`, !!a.glyph);
    ok(`${a.id}: is findable by id`, actionById(a.id) === a);
    ok(`${a.id}: is namespaced by its structure`, a.id.startsWith(a.structure + "."));
  }
  ok("lists are covered", STRUCTURE_ACTIONS.some((a) => a.structure === "list"));
  ok("tables are covered", STRUCTURE_ACTIONS.some((a) => a.structure === "table"));
}

// ---------------------------------------------------------------- where am I

{
  check("inside a list", structureAt(L, L.indexOf("שני")), "list");
  check("inside a table", structureAt(T, T.indexOf("ג")), "table");
  check("in plain prose, nowhere", structureAt("סתם טקסט", 4), null);
}

{
  // The innermost structure wins: a list in a cell is a list.
  const both = `#טבלה(עמודות: 1,\n  תא[#רשימה(פריט[פנימי],)],\n)\n`;
  check("a list inside a cell is a list", structureAt(both, both.indexOf("פנימי")), "list");
  check("the cell around it is still a table", structureAt(both, both.indexOf("תא[")), "table");
}

{
  const w = whereAmI(L, L.indexOf("שני"));
  check("the list position is reported", w.row, 2);
  check("out of how many", w.rows, 3);
  const wt = whereAmI(T, T.indexOf("ג"));
  check("the table row", wt.row, 2);
  check("the table column", wt.col, 1);
  check("of how many columns", wt.cols, 2);
  check("in prose, nothing to report", whereAmI("טקסט", 2), null);
}

// ---------------------------------------------------------------- what is offered

{
  const here = availableAt(L, L.indexOf("שני"));
  ok("a list offers operations", here.length >= 8);
  ok("all of them are list operations", here.every((x) => x.action.structure === "list"));
  ok("no table operations leak in", !here.some((x) => x.action.id.startsWith("table.")));
}

{
  const here = availableAt(T, T.indexOf("ג"));
  ok("a table offers operations", here.length >= 8);
  ok("all of them are table operations", here.every((x) => x.action.structure === "table"));
}

check("prose offers none", availableAt("טקסט", 2).length, 0);

// ---------------------------------------------------------------- enabled means it works
//
// The property that matters: a control the ribbon shows as enabled must
// actually change the document, and one shown as disabled must not be pressable
// into doing nothing.

{
  for (const [name, doc, pos] of [
    ["list", L, L.indexOf("שני")],
    ["table", T, T.indexOf("ג")],
  ]) {
    for (const { action, enabled } of availableAt(doc, pos)) {
      const r = action.run(doc, pos);
      if (enabled) {
        ok(`${name}/${action.id}: enabled and returns an edit`, r !== null);
        ok(`${name}/${action.id}: and the edit changes something`, r.text !== doc);
        ok(
          `${name}/${action.id}: the caret stays in the document`,
          r.caret >= 0 && r.caret <= r.text.length,
        );
      } else {
        ok(`${name}/${action.id}: disabled and returns nothing`, r === null);
      }
    }
  }
}

// ---------------------------------------------------------------- the boundaries

{
  const first = L.indexOf("ראשון");
  const byId = Object.fromEntries(availableAt(L, first).map((x) => [x.action.id, x.enabled]));
  notOk("the first item cannot indent", byId["list.indent"]);
  notOk("the first item cannot move up", byId["list.moveUp"]);
  ok("but it can move down", byId["list.moveDown"]);
  notOk("a top-level item cannot outdent", byId["list.outdent"]);
}

{
  const byId = Object.fromEntries(
    availableAt(L, L.indexOf("שלישי")).map((x) => [x.action.id, x.enabled]),
  );
  notOk("the last item cannot move down", byId["list.moveDown"]);
  ok("the last item can move up", byId["list.moveUp"]);
}

{
  // A list is already bullets, so "make it bullets" is not an available action.
  const byId = Object.fromEntries(availableAt(L, L.indexOf("שני")).map((x) => [x.action.id, x.enabled]));
  notOk("converting to what it already is does nothing", byId["list.bullets"]);
  ok("converting to numbered does", byId["list.numbered"]);
  ok("converting to Hebrew letters does", byId["list.hebrew"]);
}

{
  // One row and one column: neither may be deleted away to nothing.
  const tiny = `#טבלה(עמודות: 1,\n  תא[א],\n)\n`;
  const byId = Object.fromEntries(
    availableAt(tiny, tiny.indexOf("א")).map((x) => [x.action.id, x.enabled]),
  );
  notOk("the last row cannot be deleted", byId["table.rowDelete"]);
  notOk("the last column cannot be deleted", byId["table.colDelete"]);
  notOk("a lone row cannot move up", byId["table.rowUp"]);
  ok("but a row can always be added", byId["table.rowBelow"]);
  ok("and the whole table can go", byId["table.delete"]);
}

}
