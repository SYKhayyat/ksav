// Contextual tabs (#233, step 6; `docs/ui-architecture.md` §4, §5).
//
// Table and Notes are also the tabs the caret brings forward: standing in a
// table opens Table, standing in a note opens Notes. `contextbar.ts` says where
// the caret is (`contextOf`, from the structure around it and the note depth),
// and `setContext` does the rest. What is held here:
//
//   1. the answer, from real documents: a table, a note, a table in a note, prose;
//   2. the tab opens, marked; leaving puts back the writer's tab, unless they
//      chose another while inside; the same answer twice is nothing;
//   3. the context bar is what calls it, on every caret move.

import { check, ok, installChrome, fakeView } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";
import { commands } from "../tools/commands.mjs";
import * as runtime from "../.tmp-test/runtime.mjs";
import { settings } from "../.tmp-test/settings.mjs";
import { SHELL_DEFAULTS } from "../.tmp-test/shellsettings.mjs";
import { structureNear } from "../.tmp-test/structure.mjs";
import { noteDepthAt } from "../.tmp-test/notes.mjs";
import { buildRibbon, contextOf, setContext } from "../.tmp-test/shelltabs.mjs";

const src = (f) => readFileSync(path.join(dirOf(import.meta.url), "..", "src", f), "utf8");

export async function run() {
  // ------------------------------------------------- 1. the answer
  const at = (doc, word) => {
    const pos = doc.indexOf(word);
    return contextOf(structureNear(doc, pos)?.structure, noteDepthAt(doc, pos));
  };
  const TABLE = `#טבלה(עמודות: 2,\n  תא[ג], תא[ד],\n)\n`;
  check("in a table, Table", at(TABLE, "ג"), "table");
  check("in a note, Notes", at("טקסט#הערה[הערה פנימית] סוף", "פנימית"), "notes");
  check("in prose, nothing", at("טקסט פשוט כאן", "פשוט"), null);
  check("a table wins over the note around it", contextOf("table", 1), "table");
  check("a list is not a contextual tab", contextOf("list", 0), null);

  // ------------------------------------------------- 2. the tab
  installChrome();
  runtime.setView(fakeView("שלום"));
  runtime.setRegistries(commands(), []);
  const before = settings.shell;
  try {
    settings.shell = { ...SHELL_DEFAULTS };
    setContext(null);
    const strip = buildRibbon().children[0].children[0];
    const open = () => strip.children.find((b) => b["aria-selected"] === "true")["data-tab"];
    const marked = () => strip.children.filter((b) => b["data-contextual"] === "true").map((b) => b["data-tab"]);
    strip.children.find((b) => b["data-tab"] === "insert").click();

    setContext("table");
    check("entering a table opens Table", open(), "table");
    check("and marks it contextual", marked(), ["table"]);
    setContext("table");
    check("the same answer again changes nothing", [open(), marked()], ["table", ["table"]]);
    setContext("notes");
    check("table to note opens Notes", [open(), marked()], ["notes", ["notes"]]);
    setContext(null);
    check("leaving puts back the writer's tab", open(), "insert");
    check("and unmarks", marked(), []);

    setContext("table");
    strip.children.find((b) => b["data-tab"] === "view").click();
    setContext(null);
    check("a tab chosen inside the table is kept on leaving", open(), "view");

    // The open tab is module state: hand Home back to the files that follow.
    strip.children.find((b) => b["data-tab"] === "home").click();
  } finally {
    settings.shell = before;
    setContext(null);
  }

  // ------------------------------------------------- 3. who calls it
  const bar = src("contextbar.ts");
  ok("the context bar reports the caret's context", bar.includes("runtime.caretContext(around, noteDepthAt(doc, pos))"));
  ok("before any early return", bar.indexOf("runtime.caretContext(") > 0 && bar.indexOf("runtime.caretContext(") < bar.indexOf("if (here.length === 0)"));
  ok("and the tabs hear it, through runtime (no import cycle)", src("shelltabs.ts").includes("runtime.onCaretContext((structureHere, noteDepth) => setContext(contextOf(structureHere, noteDepth)))"));
}
