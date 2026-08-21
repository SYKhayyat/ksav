// Select a construct, unwrap it, remove it.
//
// # The report
//
// > *"Deleting a construct currently means hand-deleting a command name, its
// > parentheses, its brackets and its arguments. It is confusing and easy to get
// > wrong, leaving unbalanced delimiters that then fail to compile."*
//
// The second sentence is the one these assertions are really about. Losing a
// note is a mistake a writer sees; leaving `#הערה(ערוץ: "ביאור")[` behind stops
// the sefer compiling, and the writer is then reading a diagnostic about a
// bracket instead of the sentence they were writing. So every act here is
// checked by **what the document is afterwards**, not by whether the call
// returned something.
//
// # Generic, and checked generically
//
// The handoff asks that this work *"for every construct the editor knows, not
// only notes: styles, notes, siman/seif, tables, lists, callouts, fixed
// regions"*. A per-command list would have been the fourth such list in this
// repository and the one missing whichever construct the writer was standing
// in — so `entity.ts` is written against `Node`, and the sweep below walks one
// document holding one of each and asserts the same three things about all of
// them.

import { check, ok, notOk } from "./harness.mjs";
import * as entity from "../.tmp-test/entity.mjs";
import { scan, nodeAt } from "../.tmp-test/spans.mjs";

/** The construct at `pos`, or a failure that names the document. */
function at(doc, from, to = from) {
  return entity.entityAt(doc, from, to);
}

export async function run() {
  // --------------------------------------------------------------- selecting

  {
    const doc = "אלף #הדגשה[בית] גימל";
    const node = at(doc, doc.indexOf("בית") + 1);
    check("the construct around the caret is found", node?.name, "הדגשה");
    const sel = entity.select(doc, doc.indexOf("בית") + 1);
    check("...and selecting it covers the whole call", doc.slice(sel.caret, sel.to), "#הדגשה[בית]");
  }

  {
    // Widening, which is the reason select is the first of the three: pressing
    // again asks about the construct *around* this one, so the writer sees what
    // they are about to lose before either removal touches it.
    const doc = "#כותרת1[פרק #הדגשה[אחד]]";
    const inner = entity.select(doc, doc.indexOf("אחד") + 1);
    check("the innermost construct comes first", doc.slice(inner.caret, inner.to), "#הדגשה[אחד]");
    const outer = entity.select(doc, inner.caret, inner.to);
    check("...and pressing again widens to the one around it", doc.slice(outer.caret, outer.to), doc);
    // And stops. Nothing contains the outermost call, so the answer is null
    // rather than the same selection again — a control that appears to work and
    // does nothing is the failure mode this repository is named for.
    check("...and then there is nothing wider", entity.select(doc, outer.caret, outer.to), null);
  }

  {
    check("body text is not inside a construct", at("סתם מלים", 3), null);
  }

  // -------------------------------------------------------------- unwrapping

  {
    const doc = "אלף #הדגשה[בית] גימל";
    const node = at(doc, doc.indexOf("בית") + 1);
    const e = entity.unwrap(doc, node);
    check("unwrapping keeps the words", e.text, "אלף בית גימל");
    check("...and selects them, so the next act is on what was kept", doc.slice(0, 0) + e.text.slice(e.caret, e.to), "בית");
  }

  {
    // Arguments go with the wrapper. This is the case the report describes:
    // hand-deleting `#הערה(ערוץ: "ביאור")[` is where the unbalanced bracket
    // comes from, because the argument list is easy to miss.
    const doc = 'אלף#הערה(ערוץ: "ביאור")[הפירוש] בית';
    const node = at(doc, doc.indexOf("הפירוש") + 1);
    check("an argument list goes with the command", entity.unwrap(doc, node).text, "אלףהפירוש בית");
  }

  {
    // The refusal, and it is a refusal rather than a silent best effort:
    // `#סימן` carries the siman number as an *argument*, so unwrapping to the
    // body would drop text the writer typed. The same rule `headings.ts`
    // already applies to a heading whose level the prelude fixes.
    const doc = '#סימן("א", [דיני תפילה])';
    const node = at(doc, doc.indexOf("דיני") + 1);
    check("a construct whose words are not all in its body refuses", entity.unwrap(doc, node), null);
    notOk("...and says so through canUnwrap", entity.canUnwrap(doc, node));
    // Removing it is still offered, which is what makes the refusal honest.
    check("...but it can still be removed whole", entity.remove(doc, node).text, "");
  }

  {
    // Two bodies: `#גוף_הערה[א][…]` names a deferred note in the first group
    // and carries its prose in the second. Keeping the first would keep the
    // label and throw away the note, which is the wrong half.
    const doc = "#גוף_הערה[א][הפירוש עצמו]";
    const node = at(doc, doc.indexOf("הפירוש") + 1);
    check("the last body is the one kept", entity.unwrap(doc, node).text, "הפירוש עצמו");
  }

  {
    // A construct with no body at all has nothing to keep, so unwrap and remove
    // are the same act and the caller is told to offer the one that says so.
    const doc = "אלף #מעבר_עמוד בית";
    const node = at(doc, doc.indexOf("מעבר") + 1);
    check("a construct with no body keeps nothing", entity.unwrap(doc, node), null);
    check("...and removing it leaves the prose", entity.remove(doc, node).text, "אלף  בית");
  }

  // ---------------------------------------------------------------- the sweep

   {
    // One of each of the kinds the handoff names, in one document, asserted
    // together — so a construct that stops being reachable fails here rather
    // than in whichever surface somebody happens to press next.
    //
    // The caret is written into each document as `|`, because *which* construct
    // is in hand is the whole question: a caret inside `#פריט` is standing in
    // the item and not in the list around it, and the first draft of this sweep
    // asserted otherwise and was wrong rather than the code being wrong.
    const cases = [
      ["a note", "אלף#הערה[הפי|רוש] בית", "הערה", "אלףהפירוש בית", "אלף בית"],
      ["a style", "#כותרת2[פרק| שני]", "כותרת2", "פרק שני", ""],
      // The caret sits *after* the item, not before it: a caret at the very
      // first character of a child is inside that child, which is what
      // `nodeAt` says and what an editor's expand-selection also says. Widening
      // is how you get from the item to the list, and that is tested above.
      ["a list", "#רשימה[#פריט[אחד] |]", "רשימה", "#פריט[אחד] ", ""],
      ["a list item", "#רשימה[#פריט[אח|ד]]", "פריט", "#רשימה[אחד]", "#רשימה[]"],
      ["a table", "#טבלה(עמודות: 2)[#תא[א] |]", "טבלה", "#תא[א] ", ""],
      ["a callout", "#אזהרה[זהי|רות]", "אזהרה", "זהירות", ""],
      ["an emphasis", "#נטוי[מל|ה]", "נטוי", "מלה", ""],
      ["a fold", "#קיפול[טק|סט]", "קיפול", "טקסט", ""],
    ];
    for (const [what, marked, name, unwrapped, removed] of cases) {
      const doc = marked.replace("|", "");
      const pos = marked.indexOf("|");
      const node = at(doc, pos);
      check(`${what} is found`, node?.name, name);
      const e = node && entity.unwrap(doc, node);
      ok(`${what} unwraps`, !!e, () => `${what}: unwrap refused`);
      check(`...and keeps its own words`, e && e.text, unwrapped);
      check(`${what} can be removed whole`, node && entity.remove(doc, node).text, removed);
    }
  }

  {
    // Every one of those survives its own removal as *valid source*: no orphan
    // bracket, no orphan parenthesis. This is the report's second sentence as
    // an assertion, and it is the one that would have caught the hand-deletion
    // it describes.
    const balanced = (s) => {
      let square = 0;
      let round = 0;
      for (const ch of s) {
        if (ch === "[") square++;
        else if (ch === "]") square--;
        else if (ch === "(") round++;
        else if (ch === ")") round--;
        if (square < 0 || round < 0) return false;
      }
      return square === 0 && round === 0;
    };
    const docs = [
      'אלף#הערה(ערוץ: "ביאור")[הפירוש] בית',
      "#כותרת1[פרק #הדגשה[אחד]] סוף",
      "#טבלה(עמודות: 2)[#תא[א]#תא[ב]] אחרי",
    ];
    for (const doc of docs) {
      const node = nodeAt(scan(doc), doc.indexOf("[") + 1);
      const un = entity.unwrap(doc, node);
      ok(`unwrapping leaves balanced source: ${doc.slice(0, 18)}…`, un === null || balanced(un.text));
      ok(`removing leaves balanced source: ${doc.slice(0, 18)}…`, balanced(entity.remove(doc, node).text));
    }
  }
}
