// A diagnostic's line, in the writer's own document.
//
// The engine reports a line in the body it was *sent*, and what it is sent is
// `customCommands + "\n\n" + document` — sometimes the *healed* copy of the
// document at that. Two arithmetic facts have to hold or every line number the
// status bar prints is a lie:
//
//   1. the preamble's line count is subtracted, and
//   2. healing does not move any line.
//
// The second one is asserted here against the real `analyze`, because it is a
// property of a module that could change without anybody thinking about this file.

import { check, ok, notOk } from "./harness.mjs";
import { preambleLines, lineInDocument, show, shown, markedLines, shorten, MAX_MESSAGE_CHARS } from "../.tmp-test/diagview.mjs";
import { analyze } from "../.tmp-test/brackets.mjs";

const err = (over) => ({ severity: "error", message: "m", raw: "r", line: null, column: null, ...over });

export async function run() {
  // ---------------------------------------------------------- preamble offset

  check("no preamble is no offset", preambleLines(undefined), 0);
  check("an empty preamble is no offset", preambleLines("   \n  "), 0);
  // `pre + "\n\n" + body`: one line of preamble, then a blank line, so the
  // document's line 1 arrives as the engine's line 3.
  check("one line of preamble offsets by two", preambleLines("#let a = 1"), 2);
  check("three lines of preamble offset by four", preambleLines("a\nb\nc"), 4);

  check("an engine line becomes a document line", lineInDocument(3, 2), 1);
  check("and deeper down too", lineInDocument(27, 4), 23);
  check("with no preamble it is itself", lineInDocument(7, 0), 7);
  // A line inside the preamble is not a line in the document. Saying nothing
  // beats pointing at the writer's line 1.
  check("a line inside the preamble is withheld", lineInDocument(2, 2), null);
  check("no line stays no line", lineInDocument(null, 2), null);
  check("an absent line stays absent", lineInDocument(undefined, 0), null);

  // ---------------------------------------------------------- what is shown

  const located = show(err({ line: 9, column: 4, message: "משהו" }), 2);
  check("the line leads the sentence", located.said, "שורה 7:4 · משהו");
  check("and is the document's line", located.line, 7);

  const noColumn = show(err({ line: 3, column: null, message: "משהו" }), 0);
  check("no column, no colon", noColumn.said, "שורה 3 · משהו");

  const unlocated = show(err({ line: null, message: "משהו" }), 0);
  check("no line, no prefix", unlocated.said, "משהו");
  check("and no line to go to", unlocated.line, null);

  // A line that resolves into the preamble is not shown as a location either.
  const inPreamble = show(err({ line: 1, column: 2, message: "משהו" }), 4);
  check("a preamble line is not offered as a place", inPreamble.said, "משהו");

  // ---------------------------------------------------------- marks

  const list = shown(
    [
      err({ line: 5, column: 1 }),
      err({ line: 5, column: 9 }),
      err({ line: 2, column: 1 }),
      err({ line: null }),
      { severity: "warning", message: "w", line: 8, column: 1 },
    ],
    0,
  );
  // Two diagnostics on one line is one mark: two underlines reads as two
  // mistakes.
  check("lines are deduplicated and sorted", markedLines(list), [2, 5]);
  notOk("a warning does not mark a line as an error", markedLines(list).includes(8));

  // ---------------------------------------------------------- shortening

  check("a short message is untouched", shorten("boom"), "boom");
  check("whitespace is flattened", shorten("a\n  b"), "a b");
  const long = shorten("z".repeat(500));
  check("a long one is capped", long.length, MAX_MESSAGE_CHARS);
  ok("and the truncation is visible", long.endsWith("…"));

  // ---------------------------------------------------------- healing keeps lines
  //
  // The whole location feature rides on this. `runCompile` sends the *healed* copy
  // to the engine, so if healing moved any line the engine's line numbers would be
  // about text the writer never typed.
  //
  // The property is not "the line count is the same" — the unterminated-comment
  // heal appends `"\n*/"`, which adds a line *after* everything. It is that no
  // character the writer typed changes the line it is on. That is what a reported
  // line number depends on, and it is strictly weaker and strictly correct.
  const documents = [
    "#הערה[פתוח\nשורה\nשורה",
    "#רשימה[\n#פריט[א]\n#פריט[ב\n",
    "#כותרת1[א\n\n#הדגשה[ב",
    "טקסט ]מיותר[ ועוד",
    "/* פתוח\nשורה\nשורה",
    "#טבלה(עמודות: 2)[א][ב",
    "שורה אחת ללא בעיה\n",
    "א\nב\n/* פתוח #הערה[\nג",
  ];
  const lineOf = (text, at) => text.slice(0, at).split("\n").length;
  for (const doc of documents) {
    const { healed, problems, edits } = analyze(doc);
    // Where each original offset ended up, walking the same edits.
    let moved = 0;
    let bad = null;
    let shift = 0;
    let cursor = 0;
    for (const e of [...edits].sort((a, b) => a.from - b.from)) {
      // Everything before this edit keeps its line, at its shifted offset.
      for (let at = cursor; at < e.from; at++) {
        if (lineOf(doc, at) !== lineOf(healed, at + shift)) bad = { doc, at };
        moved++;
      }
      cursor = e.to;
      shift += e.insert.length - (e.to - e.from);
    }
    // `< doc.length`, not `<=`: the end-of-document position itself does move when
    // the comment heal appends `"\n*/"` after it, and that is exactly the
    // position no diagnostic is ever reported at.
    for (let at = cursor; at < doc.length; at++) {
      if (lineOf(doc, at) !== lineOf(healed, at + shift)) bad = { doc, at };
      moved++;
    }
    check(`healing moves no line (${problems.length} problems, ${moved} offsets)`, bad, null);
  }
}
