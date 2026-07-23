// Tracked changes.
//
// The rule this module lives or dies by: accepting or rejecting a mark is an
// *edit to the document*, not a rendering option — a decision that only changed
// the view would be lost the moment the file was reopened. So every assertion
// here is about the text that comes out.

import { check, ok } from "./harness.mjs";
import * as review from "../.tmp-test/review.mjs";

export async function run() {
  // ------------------------------------------------------------ scanning
  {
    const doc = 'כתב #הוספה[מוסיף] ו#מחיקה[מוחק]#הערת_עורך(מאת: "עורך")[לבדוק] סוף.';
    const marks = review.scanMarks(doc);
    check("every mark is found", marks.map((m) => m.kind), ["insert", "delete", "comment"]);
    check("in document order", marks.map((m) => m.from).every((v, i, a) => i === 0 || v > a[i - 1]), true);
    check("bodies are read", marks.map((m) => m.body), ["מוסיף", "מוחק", "לבדוק"]);
    check("the author is read from the arguments", marks[2].author, "עורך");
    check("a mark with no author says so", marks[0].author, null);
    check("the range covers the whole call", doc.slice(marks[0].from, marks[0].to), "#הוספה[מוסיף]");
  }

  {
    // English aliases are the same marks.
    const marks = review.scanMarks("a #inserted[x] b #deleted[y] c #comment_[z]");
    check("English aliases scan", marks.map((m) => m.kind), ["insert", "delete", "comment"]);
  }

  {
    // An escaped quote inside the author name must not end the name early.
    const marks = review.scanMarks('#הוספה(מאת: "ר\\" יוסי")[x]');
    check("an escaped quote in the author survives", marks[0].author, 'ר" יוסי');
  }

  {
    check("a document with no marks scans to nothing", review.scanMarks("סתם טקסט").length, 0);
    check("an unclosed mark is not a mark", review.scanMarks("#הוספה[לא נסגר").length, 0);
  }

  // ------------------------------------------------------------ decisions
  //
  // The four cases, plus the comment. Getting any of these backwards silently
  // corrupts someone's manuscript, which is the reason to write them all down.
  {
    const one = (doc, i, decision) => {
      const m = review.scanMarks(doc)[i];
      return review.decide(doc, m, decision);
    };
    check("accept an insertion → the text stays, the mark goes", one("א#הוספה[חדש]ב", 0, "accept"), "אחדשב");
    check("reject an insertion → the text goes", one("א#הוספה[חדש]ב", 0, "reject"), "אב");
    check("accept a deletion → the text goes", one("א#מחיקה[ישן]ב", 0, "accept"), "אב");
    check("reject a deletion → the text stays", one("א#מחיקה[ישן]ב", 0, "reject"), "אישןב");
    check("resolving a comment removes it entirely", one("א#הערת_עורך[הערה]ב", 0, "accept"), "אב");
    check("rejecting a comment also removes it", one("א#הערת_עורך[הערה]ב", 0, "reject"), "אב");
  }

  // ------------------------------------------------------------ nesting
  //
  // Marks nest — a comment on a deleted phrase, an insertion inside a deletion.
  // Rewriting a nested pair in one pass would apply one edit to offsets the
  // other had already moved.
  {
    const doc = "א#מחיקה[ישן #הוספה[חדש] סוף]ב";
    check("nested marks are all seen", review.scanMarks(doc).length, 2);
    check(
      "accept-all resolves the outer first, then what it surfaced",
      review.decideAll(doc, "accept"),
      "אב",
    );
    check(
      "reject-all keeps the deletion and drops the insertion inside it",
      review.decideAll(doc, "reject"),
      "אישן  סוףב",
    );
  }

  {
    // Deciding everything leaves no marks behind, whatever the arrangement.
    for (const doc of [
      "א#הוספה[x]ב#מחיקה[y]ג",
      "#מחיקה[#הוספה[#הערת_עורך[deep]]]",
      "#הוספה[a #מחיקה[b #הוספה[c]] d]",
      "no marks at all",
      "",
    ]) {
      for (const decision of ["accept", "reject"]) {
        const out = review.decideAll(doc, decision);
        check(`decideAll(${decision}) leaves nothing: ${JSON.stringify(doc).slice(0, 30)}`,
          review.scanMarks(out).length, 0);
      }
    }
  }

  {
    // Deciding one kind must leave the other kinds alone.
    const doc = "א#הוספה[x]ב#הערת_עורך[note]ג";
    const out = review.decideAll(doc, "accept", ["insert"]);
    check("a kind filter accepts only that kind", out, "אxב#הערת_עורך[note]ג");
  }

  // ------------------------------------------------------------ excerpts
  {
    check("an excerpt strips the markup", review.excerpt("#הדגשה[מודגש] רגיל"), "מודגש רגיל");
    check("an excerpt collapses whitespace", review.excerpt("א   \n  ב"), "א ב");
    const long = review.excerpt("א".repeat(200));
    ok(`an excerpt is bounded (${long.length})`, long.length <= 60);
    check("…and says it was cut", long.endsWith("…"), true);
  }

  // ------------------------------------------------------------ the view
  {
    check("markup is the default view", review.viewFromValue(null), "markup");
    check("an unknown value falls back to markup", review.viewFromValue("nonsense"), "markup");
    for (const [view, value] of Object.entries(review.VIEW_VALUE)) {
      check(`${view} round-trips through its Typst value`, review.viewFromValue(value), view);
    }
  }
}
