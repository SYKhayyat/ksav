import { check, ok, notOk } from "./harness.mjs";
import {
  compact,
  describe,
  validate,
  isEmpty,
  newId,
  actionIdOf,
  macroIdOf,
  parseAll,
} from "../.tmp-test/macros.mjs";

// A macro records *actions*, never keystrokes and never positions. Keystrokes
// break when a binding changes; positions break the moment the document is a
// character longer — which the macro's own second repetition guarantees.

const A = (id) => ({ kind: "action", id });
const T = (text) => ({ kind: "text", text });

export async function run() {

// ---------------------------------------------------------------- compaction

{
  // Typing is one transaction per character. Four steps in, one out.
  const raw = [T("ר"), T("ש"), T("״"), T("י")];
  const out = compact(raw);
  check("consecutive typing folds into one step", out.length, 1);
  check("with the text intact", out[0].text, "רש״י");
}

{
  const out = compact([T("א"), A("list.addItem"), T("ב"), T("ג")]);
  check("an action breaks the run", out.length, 3);
  check("first is text", out[0].text, "א");
  check("then the action", out[1].id, "list.addItem");
  check("then the rest of the typing", out[2].text, "בג");
}

{
  check("empty text is dropped", compact([T(""), A("x"), T("")]).length, 1);
  check("an empty recording stays empty", compact([]).length, 0);
}

// ---------------------------------------------------------------- description

{
  const m = { id: "m1", name: "רש״י", steps: [A("list.addItem"), T("עיין שם")] };
  const line = describe(m, (id) => (id === "list.addItem" ? "פריט חדש" : id));
  check("a macro reads as what it does", line, 'פריט חדש → "עיין שם"');
}

// ---------------------------------------------------------------- surviving a release

{
  // A macro outlives the release it was recorded in. An operation that no longer
  // exists is dropped, not thrown on: four of five things done is recoverable,
  // a throw on step three is a half-edited document plus a stack trace.
  const m = { id: "m1", name: "x", steps: [A("list.addItem"), A("list.gone"), T("ב")] };
  const v = validate(m, (id) => id === "list.addItem");
  check("the unknown step is gone", v.steps.length, 2);
  check("the known one survived", v.steps[0].id, "list.addItem");
  check("and so did the typing", v.steps[1].text, "ב");
  ok("text steps never need validating", validate({ id: "m", name: "m", steps: [T("א")] },
    () => false).steps.length === 1);
}

{
  ok("an empty macro is recognised", isEmpty({ id: "m", name: "m", steps: [] }));
  notOk("a real one is not", isEmpty({ id: "m", name: "m", steps: [T("א")] }));
}

// ---------------------------------------------------------------- ids

{
  // Two tabs recording at the same moment must not both claim `macro-3`.
  const a = newId(1000, 0.1);
  const b = newId(1000, 0.9);
  ok("same instant, different random — different ids", a !== b);
  check("the same inputs give the same id", newId(1000, 0.1), a);
  ok("ids are identifier-safe", /^m[a-z0-9]+$/.test(newId(1723000000000, 0.5)));
}

{
  const m = { id: "mabc", name: "x", steps: [] };
  check("a macro's action id", actionIdOf(m), "macro.mabc");
  check("and back again", macroIdOf("macro.mabc"), "mabc");
  check("a non-macro action is not one", macroIdOf("list.addItem"), null);
}

// ---------------------------------------------------------------- reading storage

{
  const raw = [
    { id: "m1", name: "one", steps: [{ kind: "text", text: "א" }] },
    { id: "m2", steps: [{ kind: "action", id: "list.addItem" }] },
  ];
  const out = parseAll(raw);
  check("both are read", out.length, 2);
  check("a missing name falls back to the id", out[1].name, "m2");
}

{
  // Preferences are worth less than the application starting.
  check("garbage is not a macro list", parseAll(null).length, 0);
  check("nor is a string", parseAll("nope").length, 0);
  check("an entry with no id is dropped", parseAll([{ name: "x", steps: [] }]).length, 0);
  check("an entry with no steps is dropped", parseAll([{ id: "m", name: "x" }]).length, 0);
  const mixed = parseAll([{ id: "m", name: "x", steps: [{ kind: "text" }, { kind: "action", id: "a" }, 7] }]);
  check("malformed steps are dropped, the rest kept", mixed[0].steps.length, 1);
  check("and the good one survived", mixed[0].steps[0].id, "a");
}

// ------------------------------------------------- a command with no action
//
// The third kind of step, and it exists because there are three ways a writer
// changes a document and the recorder used to model two. The toolbar, the
// Insert menu and the palette insert a *registry command* — there is no action
// id behind it, and recording it as text would replay `#הדגשה[|]` including the
// caret marker as eight literal characters.

{
  const m = {
    id: "m",
    name: "x",
    steps: [
      { kind: "snippet", snippet: "#הדגשה[|]" },
      { kind: "text", text: "רש\"י" },
      { kind: "action", id: "list.addItem" },
    ],
  };
  check("a snippet step reads back", parseAll([m])[0].steps.length, 3);
  check(
    "…and keeps its snippet verbatim, caret marker and all",
    parseAll([m])[0].steps[0].snippet,
    "#הדגשה[|]",
  );
  check(
    "it describes itself by the command, not by the scaffolding",
    describe(m, (id) => id),
    '#הדגשה → "רש\\"י" → list.addItem',
  );
  // A snippet refers to nothing that can be renamed away, so unlike an action
  // step it never goes stale. If the command it names stops existing the
  // compiler says so, in the document, which is where that belongs.
  check(
    "an unknown action is dropped and the snippet is not",
    validate(m, () => false).steps.map((s) => s.kind),
    ["snippet", "text"],
  );
  // Two snippets in a row are two operations, not one string to be glued.
  const pair = compact([
    { kind: "snippet", snippet: "#הדגשה[|]" },
    { kind: "snippet", snippet: "#נטוי[|]" },
  ]);
  check("consecutive snippets stay separate steps", pair.length, 2);
}

{
  const bad = parseAll([
    { id: "m", name: "x", steps: [{ kind: "snippet" }, { kind: "snippet", snippet: "#א[]" }] },
  ]);
  check("a snippet step with no snippet is dropped", bad[0].steps.length, 1);
}

}
