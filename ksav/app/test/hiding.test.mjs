import { check, ok } from "./harness.mjs";
import {
  BLOCK_CLOSE,
  BLOCK_OPEN,
  FOLD_OPEN,
  FOLD_CLOSE,
  LINE,
  blockAround,
  foldAround,
  foldCloser,
  hideBlock,
  hideLines,
  isFoldMark,
} from "../.tmp-test/hiding.mjs";

// The three constructs, and the one question that separates them: does this
// reach the page?
//
// Two hide (`//` and `/* … */`) and one does not (`//{ … //}`, a fold, which
// prints in full). All three shipped; the line comment had no door at all, and
// the fold's door was a toolbar button labelled "Region" — a word that says
// nothing about folding, nothing about printing, and which `#אזור` has since
// taken for something else entirely.
//
// The other half of the promise is `engine/tests/hiding.rs`: that the marks
// change nothing about the page, not even the paragraph they sit in.

/** Apply an edit to a document, the way the editor's dispatch would. */
const applied = (doc, e) => doc.slice(0, e.from) + e.text + doc.slice(e.to);
/** What ends up selected after it. */
const selected = (doc, e) => applied(doc, e).slice(e.select[0], e.select[1]);

export async function run() {
  // ----------------------------------------------------- why a fold is free
  //
  // `engine/tests/hiding.rs` proves the page's half: a fold prints in full, the
  // two that hide print nothing, and none of the three so much as breaks the
  // paragraph it sits in. That proof rests on one property of these marks, and
  // this is it — **a fold's marks are comments**. It is the whole reason the
  // opener is three characters rather than one: a bare `{` is a Typst code
  // block, and it would print, or fail to. Assert the property rather than the
  // spelling, so a shorter opener that is still a comment is free to arrive and
  // one that is not is refused here, in the language that writes it.
  ok("marks: a fold opens with a comment", FOLD_OPEN.startsWith(LINE) && FOLD_OPEN !== LINE);
  ok("marks: and closes with one", FOLD_CLOSE.startsWith(LINE) && FOLD_CLOSE !== LINE);
  ok("marks: the two that hide are Typst's own", LINE === "//" && BLOCK_OPEN === "/*" && BLOCK_CLOSE === "*/");

  // ------------------------------------------------------------------ folds

  {
    // The `//{` must begin its own line or the fold service does not see it,
    // and the fold a writer just made silently refuses to fold. Mid-line is the
    // case that gets this wrong.
    const doc = "שלום עולם";
    const r = foldAround(doc, 5, 9, "קיפול");
    ok("fold: mid-line starts on a new one", r.text.startsWith("\n" + FOLD_OPEN + " "), JSON.stringify(r.text));
    check("fold: the label is selected so it can be renamed", selected(doc, r), "קיפול");
  }
  {
    const doc = "שלום עולם";
    const r = foldAround(doc, 0, 5, "קיפול");
    ok("fold: at a line start it needs no newline", r.text.startsWith(FOLD_OPEN + " "), JSON.stringify(r.text));
    check("fold: the label is still selected", selected(doc, r), "קיפול");
  }
  {
    const r = foldAround("א\nב", 2, 3, "קיפול");
    ok("fold: after a newline it needs no newline either", r.text.startsWith(FOLD_OPEN + " "), r.text);
    ok("fold: it closes on its own line", r.text.endsWith("\n" + FOLD_CLOSE + "\n"), JSON.stringify(r.text));
  }
  {
    // Every word between the marks survives. This is the whole difference from
    // the two that hide, and the reason the word "region" had to go.
    const doc = "אחת\nשתים\nשלש";
    const r = foldAround(doc, 4, 9, "קיפול");
    ok("fold: the text between the marks is untouched", applied(doc, r).includes("שתים"), applied(doc, r));
  }

  // ------------------------------------------- the closer the editor writes

  {
    // Three characters is the floor — a fold's marks must be comments or the
    // page prints them, and `//` plus one brace is the shortest brace-like
    // comment there is. So the writer types the opener and nothing else.
    const doc = FOLD_OPEN;
    const c = foldCloser(doc, doc.length);
    ok("closer: finishing `//{` writes the rest", !!c, JSON.stringify(c));
    const after = doc + c.insert;
    check("closer: a blank line and the closing mark", after, FOLD_OPEN + " \n\n" + FOLD_CLOSE);
    // On the opener, not the body: the name is the whole value of a fold once
    // it is collapsed, and it is the thing a writer would have to come back for.
    check("closer: the caret waits for the name", after.slice(0, c.caret), FOLD_OPEN + " ");
  }
  {
    const doc = "  " + FOLD_OPEN;
    const c = foldCloser(doc, doc.length);
    check("closer: the closer keeps the opener's indent", doc + c.insert, "  " + FOLD_OPEN + " \n  \n  " + FOLD_CLOSE);
  }
  {
    // A `//{` being *renamed* is not a fold being made, and a fold that already
    // has a closer below it does not want a second one.
    ok("closer: not when the opener already has a label", foldCloser(FOLD_OPEN + " שם", 3) === null);
    const open = FOLD_OPEN + "\nגוף\n" + FOLD_CLOSE;
    ok("closer: not when a closer is already below", foldCloser(open, 3) === null);
  }
  {
    // …but a fold opened *inside* one that is already closed gets its own
    // closer. The `//}` below belongs to the outer fold, and a scan looking for
    // the next one cannot tell those apart — which is why the question is asked
    // of the whole file as a balance.
    const doc = FOLD_OPEN + " חוץ\n" + FOLD_OPEN + "\nגוף\n" + FOLD_CLOSE;
    const at = doc.indexOf("\n" + FOLD_OPEN) + 1 + FOLD_OPEN.length;
    ok("closer: a fold nested in a closed one still gets one", !!foldCloser(doc, at));
  }
  ok("closer: not in the middle of a line", foldCloser(FOLD_OPEN + "x", 3) === null);

  // ------------------------------------------------------------- hide lines

  {
    const doc = "אחת\nשתים\nשלש";
    const e = hideLines(doc, 0, doc.length);
    check("hide line: every line takes the mark", applied(doc, e), "// אחת\n// שתים\n// שלש");
  }
  {
    // A toggle, because `Ctrl+/` is a toggle everywhere and because the writer
    // who hid a paragraph to see the page without it needs it back.
    const doc = "// אחת\n// שתים";
    check("hide line: pressed again it comes back", applied(doc, hideLines(doc, 0, doc.length)), "אחת\nשתים");
  }
  {
    // A blank line inside the passage must not be what stops it coming back.
    const doc = "// אחת\n\n// שתים";
    check("hide line: a blank line is left alone", applied(doc, hideLines(doc, 0, doc.length)), "אחת\n\nשתים");
  }
  {
    const doc = "  אחת\n    שתים";
    check("hide line: the mark goes after the indent", applied(doc, hideLines(doc, 0, doc.length)),
      "  // אחת\n    // שתים");
  }
  {
    // Hiding a passage that contains a fold and then unhiding it must give the
    // fold back, not a `{` sitting in the prose.
    const doc = FOLD_OPEN + " שם\nגוף\n" + FOLD_CLOSE;
    const hidden = applied(doc, hideLines(doc, 0, doc.length));
    check("hide line: a fold's own marks are not ordinary comments", hidden,
      "// " + FOLD_OPEN + " שם\n// גוף\n// " + FOLD_CLOSE);
    check("hide line: and they survive the trip back", applied(hidden, hideLines(hidden, 0, hidden.length)), doc);
  }
  {
    const doc = "אחת\nשתים\nשלש";
    const e = hideLines(doc, 5, 6); // inside the middle line
    check("hide line: the caret alone hides its whole line", applied(doc, e), "אחת\n// שתים\nשלש");
  }
  ok("hide line: a fold's opener is a mark, not a comment", isFoldMark("  " + FOLD_OPEN + " x"));
  ok("hide line: an ordinary comment is not", !isFoldMark("// x"));

  // ------------------------------------------------------------ hide a block

  {
    const doc = "שלום עולם";
    const e = hideBlock(doc, 0, 4, "טקסט מוסתר");
    check("hide passage: the selection is wrapped", applied(doc, e), "/* שלום */ עולם");
    check("hide passage: and stays selected", selected(doc, e), "שלום");
  }
  {
    const doc = "שלום";
    const e = hideBlock(doc, 4, 4, "טקסט מוסתר");
    check("hide passage: with no selection the placeholder is offered", selected(doc, e), "טקסט מוסתר");
  }
  {
    // The way out. Without it the block comment was a one-way door, which is
    // how "I have no clue what this does" starts.
    const doc = "לפני /* בפנים */ אחרי";
    const e = hideBlock(doc, 10, 10, "טקסט מוסתר");
    check("hide passage: the caret inside reveals it", applied(doc, e), "לפני בפנים אחרי");
  }
  {
    const doc = "לפני /* בפנים */ אחרי";
    ok("hide passage: the block around a position is found", !!blockAround(doc, 10));
    ok("hide passage: …and there is none outside it", blockAround(doc, 2) === null);
    // A `//` line comment is a comment too, and is not this construct: revealing
    // it here would strip marks this function never wrote.
    ok("hide passage: a line comment is not a block", blockAround("// שלום", 3) === null);
  }
}
