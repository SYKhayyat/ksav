import { check, ok } from "./harness.mjs";
import {
  modeAt,
  withMode,
  snippetAt,
  insertionAt,
  legalAt,
  enclosing,
  orphanChildren,
} from "../.tmp-test/mode.mjs";

// The rule the UI never knew: `#` is required in content mode and illegal in
// code mode. Clicking "list" with the caret between two list items wrote
// `#רשימה(` inside an argument list and blanked the document — and the writer
// had done nothing but press the list button while inside a list.

export async function run() {

// ---------------------------------------------------------------- 1. the basics

check("an empty document is content", modeAt("", 0), "content");
check("plain prose is content", modeAt("שלום עולם", 5), "content");

{
  const d = "#רשימה(פריט[א],)";
  check("before the call", modeAt(d, 0), "content");
  check("inside the argument list", modeAt(d, 8), "code");
  check("inside an item body", modeAt(d, d.indexOf("א") + 1), "content");
  check("back in the argument list after the item closes", modeAt(d, d.indexOf("],") + 1), "code");
  check("after the call closes", modeAt(d, d.length), "content");
}

// ---------------------------------------------------------------- 2. alternation
//
// Modes nest and alternate without limit; a body inside an argument list inside
// a body is content again.

{
  const d = "#טבלה(עמודות: 2, תא[א #הדגשה[ב] ג], תא[ד],)";
  check("table argument list", modeAt(d, 8), "code");
  check("cell body", modeAt(d, d.indexOf("א #")), "content");
  check("inside the emphasis in the cell", modeAt(d, d.indexOf("ב]")), "content");
}

{
  // Three levels: content → code → content → code.
  const d = "#רשימה(פריט[טקסט #טבלה(עמודות: 1, תא[פנימי],)],)";
  check("innermost argument list is code", modeAt(d, d.indexOf("עמודות")), "code");
  check("innermost body is content", modeAt(d, d.indexOf("פנימי")), "content");
}

// ---------------------------------------------------------------- 3. what is not a call
//
// A parenthesis in prose is prose. Reading every `(` as an argument list would
// put the rest of a sentence into code mode and strip hashes out of it.

{
  const d = "כתוב כאן (ועיין שם) ואחר כך #הדגשה[טקסט]";
  check("a bare parenthesis in prose stays content", modeAt(d, d.indexOf("ועיין")), "content");
  check("after it, still content", modeAt(d, d.length), "content");
}

// ---------------------------------------------------------------- 4. strings and comments
//
// A bracket inside a string or a comment opens nothing.

{
  const d = '#הערה_בשם("א[ב") אחרי';
  check("a bracket inside a string is inert", modeAt(d, d.length), "content");
}
{
  const d = "// #רשימה(\nאחרי";
  check("a bracket in a line comment is inert", modeAt(d, d.length), "content");
}
{
  const d = "/* #רשימה( */ אחרי";
  check("a bracket in a block comment is inert", modeAt(d, d.length), "content");
}
{
  // In content mode a double quote is a quotation mark, not a string delimiter.
  const d = 'אמר "שלום" ואז #הדגשה[כאן]';
  check("quotes in prose do not swallow the line", modeAt(d, d.length), "content");
}
{
  const d = "לפני \\[ אחרי";
  check("an escaped bracket opens nothing", modeAt(d, d.length), "content");
}

// ---------------------------------------------------------------- 5. the rewrite

check("content mode keeps the hash", withMode("#רשימה(|)", "content"), "#רשימה(|)");
check("code mode drops the hash", withMode("#רשימה(|)", "code"), "רשימה(|)");
check("content mode adds a missing hash", withMode("תא[|]", "content"), "#תא[|]");
check("code mode leaves a bare snippet bare", withMode("תא[|]", "code"), "תא[|]");
check("a non-command snippet is untouched", withMode("//{ אזור", "content"), "//{ אזור");

// ---------------------------------------------------------------- 6. the reported bug
//
// The exact sequence: a list, the caret between two items, the list button.

{
  const doc = "#רשימה(\n  פריט[ראשון],\n  \n  פריט[שני],\n)\n";
  const at = doc.indexOf("\n  \n") + 3;
  check("between two items is code mode", modeAt(doc, at), "code");
  check(
    "so the list button writes a legal nested list",
    snippetAt(doc, at, "#רשימה(|)"),
    "רשימה(|)",
  );
  // And inside an item's body, the same button writes the hash form.
  const inItem = doc.indexOf("ראשון");
  check("inside an item it keeps the hash", snippetAt(doc, inItem, "#רשימה(|)"), "#רשימה(|)");
}

// ---------------------------------------------------------------- 7. every registry snippet
//
// Whatever the registry says, the mode decides. This is the invariant that
// makes the fix general rather than a patch for the list button.

{
  const snippets = ["#הדגשה[|]", "#טבלה(עמודות: 2)", "תא[|]", "כותרת_תא[|]", "פריט[|]"];
  for (const s of snippets) {
    ok(`${s}: never carries a hash into code mode`, !withMode(s, "code").startsWith("#"));
    ok(`${s}: always carries one in content mode`, withMode(s, "content").startsWith("#"));
  }
}


// ---------------------------------------------------------------- 8. delimiters
//
// The mode was only half of it, and the half that was easy to see. A snippet
// that arrives in an argument list with the right shape and no comma is still a
// document that will not compile — 342 of the 384 failures in the insertion
// sweep were exactly that, in three caret positions where *every* command in the
// registry was broken. A snippet is responsible for arriving correctly delimited
// on both sides, and that responsibility lives here, once, beside the mode.

{
  const doc = "#רשימה(\n  פריט[ראשון],\n  פריט[שני],\n)";
  const between = doc.indexOf("],") + 2;
  check(
    "between two items: a comma after, none before",
    insertionAt(doc, between, "#נטוי[|]"),
    "נטוי[|],",
  );
  const afterOpen = doc.indexOf("(") + 1;
  check(
    "straight after the opening paren: nothing before, a comma after",
    insertionAt(doc, afterOpen, "#נטוי[|]"),
    "נטוי[|],",
  );
  // A trailing comma is already a separator, so nothing is added on either side.
  const beforeClose = doc.lastIndexOf(")");
  check(
    "before the closing paren of a trailing-comma list: nothing needed",
    insertionAt(doc, beforeClose, "#נטוי[|]"),
    "נטוי[|]",
  );
  // Without one, the previous argument's `]` is what has to be separated from.
  const tight = "#רשימה(פריט[ראשון])";
  check(
    "after an argument that does not end in a comma: one is added before",
    insertionAt(tight, tight.lastIndexOf(")"), "#נטוי[|]"),
    ", נטוי[|]",
  );
}

{
  // A named argument's colon already separates; a comma after it is a syntax
  // error, not a nicety.
  const doc = "#טבלה(עמודות: )";
  const afterColon = doc.indexOf(": ") + 2;
  ok("after a named argument's colon, no comma is added", !insertionAt(doc, afterColon, "#נטוי[|]").startsWith(","));
}

{
  // Content mode. A bracket-less command has no terminator, so it swallows the
  // next word into a command name the writer never typed — and the error then
  // *names* that invented command, which is worse than useless.
  const doc = "פרק ראשון";
  check(
    "a parameterless command is terminated before a word",
    insertionAt(doc, 4, "#קו_מפריד"),
    "#קו_מפריד ",
  );
  check(
    "and not padded when nothing follows it",
    insertionAt(doc, doc.length, "#קו_מפריד"),
    "#קו_מפריד",
  );
  check(
    "a command that closes itself needs no terminator",
    insertionAt(doc, 4, "#הדגשה[|]"),
    "#הדגשה[|]",
  );
}

{
  // `to` differs from the caret when the snippet replaces a half-typed name.
  const doc = "#רשימה(פריט[א],#נט פריט[ב],)";
  const from = doc.indexOf("#נט");
  const to = from + 3;
  check(
    "an autocompletion looks past what it replaces",
    insertionAt(doc, from, "#נטוי[|]", to),
    "נטוי[|],",
  );
}

// ---------------------------------------------------------------- 9. legality

{
  const inHeading = "#כותרת1[פרק ראשון]";
  check("a table of contents inside a heading is refused", legalAt(inHeading, 10, "תוכן").ok, false);
  check("and says why", legalAt(inHeading, 10, "תוכן").reason, "illegalInHeading");
  check("outside one it is fine", legalAt("שלום", 2, "תוכן").ok, true);
  // The indexes print marks, not headings, so they do not recurse — greying
  // them would be a refusal of something that works, which the engine's
  // `every_refused_insertion_would_really_have_failed` caught the first time.
  check("the source index is not refused in a heading", legalAt(inHeading, 10, "מפתח_מקורות").ok, true);
}

{
  check("a page break in prose is fine", legalAt("שלום עולם", 3, "מעבר_עמוד").ok, true);
  check(
    "a page break inside a list item is not",
    legalAt("#רשימה(פריט[אחד],)", 12, "מעבר_עמוד").ok,
    false,
  );
  check(
    "nor is a page section",
    legalAt("#הערה[גוף]", 7, "מקטע_עמוד").reason,
    "illegalPageLevel",
  );
}

{
  const table = "#טבלה(עמודות: (1fr, 1fr),\n  תא[אחד], תא[שתים],\n)";
  const betweenCells = table.indexOf("], ") + 2;
  check(
    "a merge spliced between cells is refused",
    legalAt(table, betweenCells, "מיזוג").ok,
    false,
  );
  // A merge *inside a cell body* is not a cell of anything — it is a
  // `table.cell(colspan:)` nested in another cell's content, which the engine
  // badges. This asserted the opposite, on the reasoning that the raw command is
  // "for writing a merge into a cell you are composing"; a writer does that by
  // replacing `תא[…]` with `מיזוג(2)[…]`, not by nesting one in the other.
  check(
    "a merge inside a cell body is refused",
    legalAt(table, table.indexOf("אחד"), "מיזוג").reason,
    "illegalChildOutside",
  );
  // And the position that actually works is allowed. Between the two rules the
  // command used to be offered nowhere at all: refused throughout the one place
  // it is valid, offered in the one place it does nothing.
  check(
    "appending a merge to a table is fine",
    legalAt("#טבלה(עמודות: 2, תא[א],)", "#טבלה(עמודות: 2, תא[א],".length, "מיזוג").ok,
    true,
  );
  check(
    "and so is one in an empty table",
    legalAt("#טבלה(עמודות: 2,)", "#טבלה(עמודות: 2,".length, "מיזוג").ok,
    true,
  );
}

// ---------------------------------------------------------------- 10. enclosing

{
  const doc = "#כותרת(רמה: 2)[פרק #הערה[גוף]]";
  check("the heading's body knows its command", enclosing(doc, doc.indexOf("פרק")).join(","), "כותרת");
  check(
    "and a note inside it stacks",
    enclosing(doc, doc.indexOf("גוף")).join(","),
    "כותרת,הערה",
  );
  check("a bare group encloses nothing", enclosing("שלום (ועיין שם) עולם", 10).join(","), "");
  check(
    "a second bracket still belongs to its command",
    enclosing("#גמרא[ברכות][ב.]", 14).join(","),
    "גמרא",
  );
}

// ------------------------------------------------- 11. children of a container

// `#פריט` is one entry of a `#רשימה` and `#תא` is one cell of a `#טבלה`: they
// are arguments, not commands, and outside their parent they used to be the
// identity function — `#פריט[א]` printed the word, drew no bullet, and said
// nothing at all. Of the five, `#מיזוג` alone was guarded here, and for an
// unrelated question; the other four were offered everywhere.
//
// The parents come from `STRUCTURAL_CHILDREN`, generated from the prelude's own
// `_kd_parents`, so this asserts the same fact the engine draws its badge on.

{
  check("an item at the top of a document is refused", legalAt("שלום", 2, "פריט").ok, false);
  check(
    "and names what is wrong",
    legalAt("שלום", 2, "פריט").reason,
    "illegalChildOutside",
  );
  {
    // In the argument list, not inside an item's body — one frame further in and
    // the item is content, not an argument.
    const d = "#רשימה(פריט[א],)";
    check("an item inside a list is fine", legalAt(d, d.indexOf(",") + 1, "פריט").ok, true);
    check(
      "but not inside another item's body",
      legalAt(d, d.indexOf("א"), "פריט").reason,
      "illegalChildOutside",
    );
  }
  check(
    "an item inside a bracketed list is fine too",
    legalAt("#רשימה[#פריט[א]]", 9, "פריט").ok,
    true,
  );
  {
    const d = "#ממוספרת(פריט[א],)";
    check("an item inside a numbered list is fine", legalAt(d, d.indexOf(",") + 1, "פריט").ok, true);
  }
  check("a cell inside a list is refused", legalAt("#רשימה(פריט[א],)", 12, "תא").ok, false);
  {
    const d = "#טבלה(עמודות: 2, תא[א],)";
    check("a cell inside a table is fine", legalAt(d, d.lastIndexOf(",") + 1, "תא").ok, true);
    check(
      "but not inside another cell's body",
      legalAt(d, d.indexOf("א]"), "תא").reason,
      "illegalChildOutside",
    );
  }
  check(
    "the English spelling is the same command",
    legalAt("hello", 2, "item").reason,
    "illegalChildOutside",
  );
  {
    const d = "#bullets(item[a],)";
    check("and an English list is a parent for it", legalAt(d, d.indexOf(",") + 1, "item").ok, true);
  }
  // The merge rule is a second and narrower question about one of the five, and
  // both have to pass — a merge outside a table is refused by this new rule and
  // a merge between two existing cells by the old one.
  check("a merge outside a table is refused", legalAt("שלום", 2, "מיזוג").ok, false);
}

{
  // The linter's half: what a writer *typed*, rather than what a button may
  // write. This is the case that actually happens — every automated path in the
  // product already emits the paren form.
  const found = orphanChildren("יתום: #פריט[בודד] וזהו");
  check("a typed orphan is found", found.length, 1);
  check("and named", found[0]?.name, "פריט");
  check("and pointed at", found[0]?.from, "יתום: ".length);
  check("a correct list is clean", orphanChildren("#רשימה(פריט[א], פריט[ב])").length, 0);
  check("a bracketed list is clean", orphanChildren("#רשימה[#פריט[א] #פריט[ב]]").length, 0);
  check(
    "a correct table is clean",
    orphanChildren("#טבלה(עמודות: 2, כותרת_תא[א], תא[ב])").length,
    0,
  );
  // Correct, compiles, and sits in the exact position `legalAt`'s merge rule
  // refuses — so linting through `legalAt` would underline a working table.
  check(
    "a merge written into a table is not an orphan",
    orphanChildren("#טבלה(עמודות: 2, מיזוג(2)[רחב], תא[א], תא[ב])").length,
    0,
  );
  check(
    "a definition row inside its list is clean",
    orphanChildren("#רשימת_הגדרות(הגדרה[א][ב])").length,
    0,
  );
  check("but outside it is not", orphanChildren("#הגדרה[א][ב]").length, 1);
}

}
