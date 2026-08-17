import { check, ok, notOk } from "./harness.mjs";
import * as tables from "../.tmp-test/table.mjs";
import * as lists from "../.tmp-test/lists.mjs";
import { dirOf } from "../tools/paths.mjs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  STRUCTURE_ACTIONS,
  actionById,
  contextAt,
  isEnabled,
  structureAt,
  availableAt,
  whereAmI,
} from "../.tmp-test/structure.mjs";

// The registry every surface is generated from. If an operation is missing an
// id, or claims to apply when it cannot, then a ribbon button does nothing when
// pressed and a key binding silently swallows the keystroke.

const L = `#רשימה(\n  פריט[ראשון],\n  פריט[שני],\n  פריט[שלישי],\n)\n`;
const T = `#טבלה(עמודות: 2, פסים: true,\n  כותרת_תא[א], כותרת_תא[ב],\n  תא[ג], תא[ד],\n)\n`;

// The corpus both sweeps below walk: what the table and list operations
// disagree about — nesting, merges, header rows, declared track widths, a
// pinned heading level, a document that already has its contents.
const CORPUS = [
  ["prose", "סתם טקסט בלי שום מבנה בכלל.\n"],
  ["list", L],
  ["inline list", `#רשימה(פריט[א], פריט[ב],)\n`],
  ["one-item list", `#רשימה(\n  פריט[יחיד],\n)\n`],
  ["nested list", `#רשימה(\n  פריט[חיצוני\n    #רשימה(פריט[פנימי],)],\n  פריט[אחרון],\n)\n`],
  ["numbered list", `#ממוספרת(\n  פריט[אחד],\n  פריט[שתיים],\n)\n`],
  ["gershayim list", `#רשימה(\n  פריט[דברי רש"י],\n  פריט[שני],\n)\n`],
  ["english list", `#bullets(\n  item[one],\n  item[two],\n)\n`],
  ["table", T],
  ["1×1 table", `#טבלה(עמודות: 1,\n  תא[א],\n)\n`],
  ["merged table", `#טבלה(עמודות: 2,\n  מיזוג(2)[רחב],\n  תא[א], תא[ב],\n)\n`],
  ["full-width merge", `#טבלה(עמודות: 2,\n  מיזוג(2)[א],\n  מיזוג(2)[ב],\n)\n`],
  ["sized table", `#טבלה(עמודות: (2fr, 1fr),\n  תא[א], תא[ב],\n)\n`],
  ["equal table", `#טבלה(עמודות: (1fr, 1fr),\n  תא[א], תא[ב],\n)\n`],
  ["narrow table", `#טבלה(עמודות: (0.25fr, 1fr),\n  תא[א], תא[ב],\n)\n`],
  ["ragged table", `#טבלה(עמודות: 3,\n  תא[א], תא[ב],\n)\n`],
  ["english table", `#mktable(columns: 2,\n  headcell[Posek], cell[Ruling],\n)\n`],
  ["headings", `#כותרת1[ראשי]\n\nגוף.\n\n#כותרת2[משנה]\n\nעוד גוף.\n\n#כותרת2[אחרון]\n\nסוף.\n`],
  ["deepest heading", `#כותרת(רמה: 9)[עמוק]\n\nגוף.\n`],
  ["pinned level", `#סימן("א", [דיני תפילה])\n\nגוף הסימן.\n`],
  ["with contents", `#תוכן()\n\n#כותרת1[ראשי]\n\nגוף.\n`],
  ["list in a cell", `#טבלה(עמודות: 1,\n  תא[#רשימה(פריט[פנימי],)],\n)\n`],
  ["table in a section", `#כותרת1[פרק]\n\n#טבלה(עמודות: 2,\n  תא[א], תא[ב],\n)\n`],
];

const HERE = dirOf(import.meta.url);
const SRC = path.resolve(HERE, "..", "src");

/** A table of `rows` rows and three columns, for the questions about cost. */
function bigTable(rows) {
  const body = Array.from(
    { length: rows },
    (_, r) => `  תא[א${r}], תא[ב${r}], תא[ג${r}],`,
  ).join("\n");
  return `#טבלה(עמודות: 3, פסים: true,\n${body}\n)\n`;
}

/** Milliseconds per call, averaged, with the caret moving between two places. */
function perCall(n, f) {
  f(0);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) f(i % 2);
  return (performance.now() - t0) / n;
}

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
        ok(
          `${name}/${action.id}: and it does something`,
          action.moves ? r.caret !== pos : r.text !== doc,
        );
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

// ---------------------------------------------------------------- asking is not doing
//
// `enabled` used to be answered by *running* the operation and looking at what
// came back: eighteen table layouts, eighteen re-renders and eighteen copies of
// the document, on every caret move, to decide the colour of some arrows. That
// is the shape this section fences off — first structurally, so the idiom cannot
// come back by hand, then by the property that made splitting the two dangerous:
// an operation and its own predicate must never disagree.

{
  // A regex enforces "any line of this shape is a bug" perfectly, which is the
  // guarantee wanted: the cost was never one slow function, it was that asking
  // by doing was the shortest thing to type.
  const names = (await readdir(SRC)).filter((f) => f.endsWith(".ts"));
  check("there is source to check", names.length > 15, true);

  /** An operation performed in order to find out whether it applies. */
  const RUN_TO_ASK = /\.run\([^;]*\)\s*(?:!==|===)\s*null/;
  /** The same thing spelled out over two names. */
  const ASK_BY_DOING = /\b(?:enabled|disabled|available|applies)\b[^;]*=[^;]*\.run\(/;
  const offenders = [];
  for (const f of names) {
    const body = await readFile(path.join(SRC, f), "utf8");
    body.split("\n").forEach((line, i) => {
      const s = line.trim();
      if (s.startsWith("//") || s.startsWith("*") || s.startsWith("/*")) return;
      if (RUN_TO_ASK.test(line) || ASK_BY_DOING.test(line)) offenders.push(`${f}:${i + 1}`);
    });
  }
  check("no surface decides `enabled` by running the operation", offenders, []);
}

{
  // The property that lets the two exist separately at all. Every action, at
  // every caret position of a corpus that covers what the operations disagree
  // about: nesting, merges, header rows, declared track widths, a pinned
  // heading level, a document that already has its contents.

  const disagree = [];
  const idle = [];
  const wandering = [];
  const stuck = [];
  let asked = 0;
  for (const [name, doc] of CORPUS) {
    for (let pos = 0; pos <= doc.length; pos++) {
      const ctx = contextAt(doc, pos);
      for (const action of STRUCTURE_ACTIONS) {
        const said = action.enabled(ctx);
        const did = action.run(doc, pos);
        asked++;
        if (said !== (did !== null)) {
          disagree.push(`${name}@${pos} ${action.id}: enabled=${said} run=${did !== null}`);
        }
        // An enabled control that cannot change the document is the lie this
        // whole registry exists to stop telling. The one honest exception is a
        // move between two rows that are already identical, which the corpus
        // above deliberately does not contain.
        //
        // …and the *declared* exception: an action marked `moves` navigates and
        // is not an edit. Marked rather than excused — `wandering` below asserts
        // the inverse, so the flag cannot become a way to smuggle a dead control
        // past this check.
        if (said && did && did.text === doc && !action.moves) idle.push(`${name}@${pos} ${action.id}`);
        if (did && action.moves && did.text !== doc) wandering.push(`${name}@${pos} ${action.id}`);
        if (did && action.moves && said && did.caret === pos) {
          stuck.push(`${name}@${pos} ${action.id}`);
        }
      }
    }
  }
  ok(`the sweep actually asked something (${asked})`, asked > 20000);
  check("`enabled` and `run` never disagree", disagree.slice(0, 8), []);
  check("nothing is offered that cannot change the document", idle.slice(0, 8), []);
  // The inverse of the `moves` flag, so it is a declaration and not an excuse.
  check("an action that only moves never edits", wandering.slice(0, 8), []);
  check("…and never leaves the caret where it was", stuck.slice(0, 8), []);
}

// ---------------------------------------------------------------- where it leaves you
//
// The third question, and the one the two above cannot see. An operation returns
// a document *and* a caret, and until 17 August the caret was an afterthought in
// both families.
//
// Tables: `onTable` returned the old offset clamped into the new text — always a
// legal position and almost never the right one, because inserting a column
// rewrites the call from `עמודות:` onward and moves every cell. From a chair
// that was: insert a table, press "add a column after", type one character, and
// it lands inside the command name — `כותרץת_תא[]` — and the table quietly
// stops being a table.
//
// Lists: not a clamp but six wrong answers. Moving an item put the caret one
// character past the item's start, which is between the `פ` and the `ר` of
// `פריט`. Converting a list to numbers parked it after the new command name,
// outside every item. Deleting an item left it in the gap the item had been in.
//
// In every case `enabled` was right, `run` produced correct markup, the suite
// was green, and the next keystroke destroyed the document.
//
// So: type a character where the operation put the caret, and the structure must
// still be the structure it just built. Over both families and every position,
// because the table half was one line shared by eighteen operations and fixing
// the one that was noticed is how the other seventeen stay broken.

{
  const SENTINEL = "ץ";

  /**
   * Is `at` somewhere a writer can type — inside the body of a cell or an item,
   * rather than in the command name that carries it, the `(2)` of a merge or the
   * gap between two arguments?
   *
   * Null when the document holds no structure of that kind at all, so a prose
   * corpus entry drops out rather than counting as a pass.
   */
  function inABody(kind, text, at) {
    if (kind === "heading") {
      // A heading's body is the last bracket pair of its call, which is what the
      // scanner already knows; matching it here rather than importing the whole
      // heading model keeps this predicate one thing a reader can check.
      const bodies = [...text.matchAll(/#(?:כותרת\d|כותרת|סימן|h\d|hlevel|siman)\s*(?:\([^)]*\))?\[/gu)].map((m) => {
        let depth = 1;
        let i = m.index + m[0].length;
        const from = i;
        while (i < text.length && depth > 0) {
          if (text[i] === "[") depth++;
          else if (text[i] === "]") depth--;
          i++;
        }
        return [from, i - 1];
      });
      if (bodies.length === 0) return null;
      return bodies.some(([from, to]) => at >= from && at <= to);
    }
    if (kind === "table") {
      const start = text.indexOf("#טבלה") < 0 ? text.indexOf("#mktable") : text.indexOf("#טבלה");
      if (start < 0) return null;
      const t = tables.tableAt(text, start);
      if (!t) return null;
      return t.cells.some((c) => at >= c.to - 1 - c.body.length && at <= c.to - 1);
    }
    // No  after the name: JavaScript defines a word boundary on [A-Za-z0-9_], so
    // there is none between ה and (, and `#רשימה` matches nothing at all. That
    // is the trap `headings.canAddContents` is written against, rebuilt here in
    // the fence itself — this sweep silently checked no list until it was found.
    const start = text.search(/#(רשימה|ממוספרת|ממוספרת_עברית|רשימת_הגדרות|bullets|numbered)/u);
    if (start < 0) return null;
    // The innermost list at each position, so a nested list's own items count.
    const seen = [];
    for (let i = 0; i <= text.length; i++) {
      const l = lists.listAt(text, i);
      if (l && !seen.some((x) => x.from === l.from)) seen.push(l);
    }
    if (seen.length === 0) return null;
    // A list with no items left has no body to be inside, so there is nothing to
    // say about the caret. That is not a loophole with a queue behind it: the only
    // operation that can empty a list is deleting its one and only item, and
    // lists — unlike tables — have no "delete the whole thing", so refusing that
    // would leave a one-item list with no way out.
    if (!seen.some((l) => l.items.length > 0)) return null;
    return seen.some((l) => l.items.some((it) => at >= it.bodyFrom && at <= it.bodyTo));
  }

  const wrong = [];
  let typed = 0;
  for (const [name, doc] of CORPUS) {
    for (let pos = 0; pos <= doc.length; pos++) {
      for (const action of STRUCTURE_ACTIONS) {
        // Not every position inside a structure is one a character can be typed
        // into — the gap *before* a cell call is inside the table and outside
        // every cell, and typing there breaks the cell whether an operation ran
        // or not. So the property is not "the caret is always safe", it is **an
        // operation never makes it less safe than where the writer already
        // was**. That is exactly the distinction both bugs fell into: the caret
        // started inside a body, which is safe, and was left inside a command
        // name, which is not.
        if (inABody(action.structure, doc, pos) !== true) continue;
        // Deleting the whole structure is the one operation with no body left.
        if (action.id === "table.delete" || action.id === "heading.delete") continue;
        const did = action.run(doc, pos);
        if (!did) continue;
        const after = inABody(action.structure, did.text, did.caret);
        if (after === null) continue;
        typed++;
        if (!after) {
          wrong.push(
            `${name}@${pos} ${action.id} → ` +
              JSON.stringify(
                (did.text.slice(0, did.caret) + SENTINEL + did.text.slice(did.caret)).slice(
                  Math.max(0, did.caret - 12),
                  did.caret + 12,
                ),
              ),
          );
        }
      }
    }
  }
  ok(`the sweep typed something (${typed})`, typed > 1800);
  check("no operation leaves the caret outside the body it was in", wrong.slice(0, 8), []);
}

{
  // And the one a person would report, spelled out: the shape of the failure was
  // that the caret did not move *at all* while the text under it did.
  const fresh = `#טבלה(עמודות: (1fr, 1fr),\n  כותרת_תא[], כותרת_תא[],\n  תא[], תא[],\n)\n`;
  const at = fresh.indexOf("כותרת_תא[") + "כותרת_תא[".length;
  const wider = actionById("table.colAfter").run(fresh, at);
  notOk("the caret does not stay where it was", wider.caret === at);
  check(
    "it stays in the cell the writer was in",
    wider.text.slice(0, wider.caret) + "ץ" + wider.text.slice(wider.caret),
    fresh.replace("(1fr, 1fr)", "(1fr, 1fr, 1fr)").replace(
      "  כותרת_תא[], כותרת_תא[],",
      "  כותרת_תא[ץ], כותרת_תא[], כותרת_תא[],",
    ).replace("  תא[], תא[],", "  תא[], תא[], תא[],"),
  );

  // A column added *before* pushes the writer's cell along, and the caret goes
  // with it rather than staying in the new empty one.
  const other = actionById("table.colBefore").run(fresh, at);
  check(
    "a column before leaves the writer in their own cell",
    other.text.slice(0, other.caret) + "ץ" + other.text.slice(other.caret),
    fresh.replace("(1fr, 1fr)", "(1fr, 1fr, 1fr)").replace(
      "  כותרת_תא[], כותרת_תא[],",
      "  כותרת_תא[], כותרת_תא[ץ], כותרת_תא[],",
    ).replace("  תא[], תא[],", "  תא[], תא[], תא[],"),
  );

  // Moving a row takes the caret with it: the writer pressed "up" on the row
  // they are editing, and leaving them behind in the row that took its place is
  // the other half of the same mistake.
  const two = `#טבלה(עמודות: 1,\n  תא[עליון],\n  תא[תחתון],\n)\n`;
  const low = two.indexOf("תחתון") + "תחתון".length;
  const moved = actionById("table.rowUp").run(two, low);
  check(
    "the caret follows the row it moved",
    moved.text.slice(0, moved.caret) + "ץ" + moved.text.slice(moved.caret),
    `#טבלה(עמודות: 1,\n  תא[תחתוןץ],\n  תא[עליון],\n)\n`,
  );
}

{
  // The exception, stated out loud rather than left to be discovered: moving a
  // row past one identical to it applies — there is a row above — and produces
  // the same source. The control stays live, and `runStructureAction` declines
  // to push an empty step onto the undo stack.
  const twins = `#טבלה(עמודות: 2,\n  תא[א], תא[ב],\n  תא[א], תא[ב],\n)`;
  const at = twins.lastIndexOf("א");
  const up = actionById("table.rowUp");
  ok("a row above an identical one can still move", isEnabled(up, twins, at));
  check("…and moving it is a no-op the caret can see through", up.run(twins, at).text, twins);
}

{
  // Every surface asks the same question of the same registry, so the menu and
  // the hydra (which hold a document and a position, not a context) must get
  // exactly what the ribbon gets.
  const mismatched = availableAt(T, T.indexOf("ג")).filter(
    (x) => x.enabled !== isEnabled(x.action, T, T.indexOf("ג")),
  );
  check("`isEnabled` answers what the ribbon was told", mismatched, []);
}

{
  // The resolved caret is memoised, which is only safe while it is keyed on the
  // document as well as the position. A cache that forgot the text would answer
  // for the previous document at the same offset — the caret would be told it is
  // in a table that the writer had just deleted.
  const before = `#טבלה(עמודות: 2,\n  תא[א], תא[ב],\n)\n`;
  const pos = before.indexOf("א");
  check("in the table", structureAt(before, pos), "table");
  const after = "סתם טקסט בלי מבנה, באותו האורך בדיוק כאן.\n";
  check("and out of it once the document changes", structureAt(after, pos), null);
  check("and back again", structureAt(before, pos), "table");
}

// ---------------------------------------------------------------- what it costs
//
// A ratio rather than a stopwatch: the machine's speed cancels, and what is left
// is the shape. If `enabled` ever goes back to running the operations the two
// sides converge on 1, whatever the hardware.

{
  const doc = bigTable(600);
  const at = doc.indexOf("ב300");
  const table = STRUCTURE_ACTIONS.filter((a) => a.structure === "table");
  check("every table operation is under test", table.length, 20);

  const asking = perCall(60, (i) => availableAt(doc, at + i));
  const doing = perCall(10, (i) => table.forEach((a) => a.run(doc, at + i)));
  // The floor is 1.0 — that is what the ratio was when `enabled` *was* `run`,
  // on any hardware, and no threshold above it can be met by accident.
  ok(
    `asking is far cheaper than doing (×${(doing / asking).toFixed(0)})`,
    doing / asking > 8,
  );
  // And in absolute terms, on the size that made this visible: a six-hundred-row
  // table used to cost ~93 ms per arrow key, which is the caret falling behind
  // the keyboard in the one place a writer holds an arrow key down.
  ok(`a six-hundred-row table stays interactive (${asking.toFixed(2)} ms)`, asking < 20);
}

}
