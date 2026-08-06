// The two repairs a writer can click, and what they do to a real document.
//
// `bracket-lint.ts` and `apparatus-lint.ts` are the editor halves of
// `brackets.ts` and `apparatus.ts`. Both were unreachable from the test suite —
// neither was on `run.mjs`'s module list — and both are one-click *edits*, which
// is the most expensive kind of untested code in a writing tool: the model can
// be right and the dispatch still delete the wrong span.
//
// That is not hypothetical here. §1 of the audit found `brackets.ts` condemning
// documents the compiler accepts and its one-click heal then *deleting the real
// closing paren*. The model was fixed; nothing ever asserted the button.
//
// So both are driven end to end: a document, the repair, and then the check that
// the repaired text is what the model now says it should be — `analyze` reports
// no problems, `unrendered` reports no unrendered streams. A repair that leaves
// its own diagnosis standing is the failure both of these can have.

import { check, ok, notOk, fakeView, installChrome } from "./harness.mjs";
import { healAll } from "../.tmp-test/bracket-lint.mjs";
import { renderAllNotes } from "../.tmp-test/apparatus-lint.mjs";
import { analyze } from "../.tmp-test/brackets.mjs";
import { unrendered } from "../.tmp-test/apparatus.mjs";

export async function run() {
  const chrome = installChrome();
  try {
    // ------------------------------------------------ healing brackets

    {
      const doc = "פתיחה#הערה[הגוף לא נסגר\nעוד שורה\n";
      const v = fakeView(doc, 0);
      check("the document is diagnosed as unbalanced", analyze(doc).problems.length, 1);
      check("the heal reports what it closed", healAll(v), 1);
      check("and the document is balanced afterwards", analyze(v.text()).problems, []);
      ok("the writer's own text survived it", v.text().includes("הגוף לא נסגר"));
    }

    {
      // Several at once. Healing one at a time and re-scanning is what the
      // module does internally; what matters here is that the answer is stable.
      const doc = "א#הערה[אחת\nב#הדגשה[שתיים\nג#נטוי[שלוש\n";
      const v = fakeView(doc, 0);
      check("three problems", analyze(doc).problems.length, 3);
      check("all three close", healAll(v), 3);
      check("and nothing is left", analyze(v.text()).problems, []);
    }

    {
      // The documents §1 established the compiler *accepts*. A heal that fires
      // on these is the bug that was live: it deleted a real closing paren, a
      // real closing bracket, and appended a bogus `]` — and the preview then
      // rendered the corrupted text, because the preview compiles the healed
      // copy. Asserted as "changes nothing", from both ends.
      const legal = [
        `#רשימה(פריט[דברי רש"י],)\n`,
        `#הערה_זרם("a)b")[גוף]\n`,
        `#הדגשה[סוגר \\] בתוך]\n`,
      ];
      for (const doc of legal) {
        const v = fakeView(doc, 0);
        check(`nothing to heal in ${JSON.stringify(doc.slice(0, 18))}`, analyze(doc).problems, []);
        check("and the heal declines", healAll(v), 0);
        check("leaving the source byte-identical", v.text(), doc);
      }
    }

    {
      // A stray closer is deleted, not "closed". The two repairs are different
      // edits and the module picks between them by kind.
      const doc = "טקסט רגיל) המשך\n";
      const v = fakeView(doc, 0);
      ok("a stray closer is a problem", analyze(doc).problems.length > 0);
      ok("it is repaired", healAll(v) > 0);
      check("and the result is clean", analyze(v.text()).problems, []);
      ok("by removing it rather than adding more", v.text().length < doc.length);
    }

    {
      // An unterminated block comment is closed, and closed *without* adding a
      // line. This is not cosmetic: `compile.ts` compiles the healed copy on
      // every keystroke and maps the engine's line numbers straight back onto
      // the writer's text, which is only sound while the repair leaves the line
      // count alone. It used to append a newline before the closer, and this
      // was the one document shape where that invariant was false.
      const doc = "/* פתוח ולא נסגר\nהמשך\n";
      const v = fakeView(doc, 0);
      ok("it is diagnosed", analyze(doc).problems.length > 0);
      ok("and repaired", healAll(v) > 0);
      check("the comment is closed", analyze(v.text()).problems, []);
      check(
        "and the line count is exactly what the writer left",
        v.text().split(String.fromCharCode(10)).length,
        doc.split(String.fromCharCode(10)).length,
      );
    }

    // ------------------------------------------------ rendering collected notes

    {
      // The lint `registry.rs` wrote a comment asking for, and the bug it
      // describes: `#מדור_א` collects its text and prints nothing at all until
      // a `#הערות_מדורגות()` exists somewhere. Pick it from the Insert menu and
      // your sentence is silently off the page.
      const doc = "פתיחה#מדור_א[הביאור] סוף.\n";
      ok("the stream is diagnosed as never rendered", unrendered(doc).length > 0);
      const v = fakeView(doc, 0);
      check("one dump call is written", renderAllNotes(v), 1);
      check("and nothing is left unrendered", unrendered(v.text()), []);
      ok("the dump call is in the document", v.text().includes("#הערות_מדורגות"));
      ok("and the note itself is untouched", v.text().includes("#מדור_א[הביאור]"));
    }

    {
      // Several markers of the same stream need *one* dump, not one each. The
      // module says so — "adding one dump can satisfy several markers at once,
      // and writing one call per marker would pile up duplicates" — and that is
      // exactly the kind of claim that rots without a test.
      const doc = "א#מדור_א[ראשונה] ב#מדור_א[שנייה] ג#מדור_א[שלישית].\n";
      const v = fakeView(doc, 0);
      check("one call covers all three", renderAllNotes(v), 1);
      check(
        "and there is exactly one of it",
        (v.text().match(/#הערות_מדורגות/g) ?? []).length,
        1,
      );
      check("nothing left unrendered", unrendered(v.text()), []);
    }

    {
      // Two different apparatuses need two different dumps.
      const doc = "א#מדור_א[בנד] ב#הערתסיום[בסוף].\n";
      const v = fakeView(doc, 0);
      check("two calls", renderAllNotes(v), 2);
      ok("the banded one", v.text().includes("#הערות_מדורגות"));
      ok("and the endnote one", v.text().includes("#הערות_בסוף"));
      check("nothing left unrendered", unrendered(v.text()), []);
    }

    {
      // A document that already renders its notes gets nothing added. The
      // opposite failure — a lint that keeps "fixing" a correct document — is
      // the one that makes people turn lints off.
      const doc = "פתיחה#מדור_א[הביאור] סוף.\n\n#הערות_מדורגות()\n";
      check("nothing is wrong with it", unrendered(doc), []);
      const v = fakeView(doc, 0);
      check("so nothing is added", renderAllNotes(v), 0);
      check("and the source is byte-identical", v.text(), doc);
    }

    {
      // An ordinary note needs no dump at all: `#הערה` prints where it stands.
      const doc = "פתיחה#הערה[עיין שם] סוף.\n";
      const v = fakeView(doc, 0);
      check("a plain footnote is not a collected stream", unrendered(doc), []);
      check("and nothing is written for it", renderAllNotes(v), 0);
      check("source unchanged", v.text(), doc);
    }

    {
      // Both repairs on one document, in the order a writer would hit them.
      // They must not fight: healing brackets must not disturb the streams, and
      // writing a dump must not unbalance the document.
      const doc = "א#מדור_א[פתוח\n";
      const v = fakeView(doc, 0);
      ok("it is both unbalanced and unrendered", analyze(doc).problems.length > 0);
      healAll(v);
      renderAllNotes(v);
      check("after both repairs the brackets balance", analyze(v.text()).problems, []);
      check("and the notes render", unrendered(v.text()), []);
      notOk("and the writer's word is still there", !v.text().includes("פתוח"));
    }
  } finally {
    chrome.restore();
  }
}
