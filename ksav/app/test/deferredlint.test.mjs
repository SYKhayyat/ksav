// The one key, and what it does to the document.
//
// `deferred-lint.ts` is the editor half of `deferred.ts`: the org-mode `C-c C-c`
// that walks between a marker and its prose, the two commands that exile a note
// to the end and bring it back, and the linter over the three ways the pairing
// can be broken. `deferred.ts` has 228 assertions on the text transformations;
// this file had none on the half that *dispatches* them, because it was one of
// the nineteen modules missing from the runner's list.
//
// The distinction matters more here than anywhere else in the app. `deferred.ts`
// answers "what should the text become"; this module answers "what happened to
// the writer" — where the caret ended up, what the status bar said, and whether
// the key reported that it handled the event. A key that computes the right text
// and returns `false` is a key CodeMirror passes on to the next handler, and the
// document gets the edit *and* whatever the next binding does.

import { check, ok, notOk, fakeView, installChrome } from "./harness.mjs";
import { jumpDeferred, deferHere, recallHere, deferAll } from "../.tmp-test/deferred-lint.mjs";
import { notesIn } from "../.tmp-test/notes.mjs";

/** Where in `doc` the caret should sit — the offset just after `mark`. */
const at = (doc, mark) => doc.indexOf(mark) + mark.length;

const PAIR = `פתיחה#הערה_בשם("1") סוף.\n\n#גוף_הערה("1")[עיין שם]\n`;
const INLINE = `פתיחה#הערה[עיין שם] סוף.\n`;

export async function run() {
  const chrome = installChrome();
  try {
  // ------------------------------------------------ walking between the halves

  {
    // Caret on the marker: the key takes you to the prose.
    const v = fakeView(PAIR, at(PAIR, `#הערה_בשם("1"`));
    const handled = jumpDeferred(v);
    ok("the key reports that it handled the event", handled);
    ok(
      "and the caret is now inside the body",
      v.caret() > PAIR.indexOf("#גוף_הערה"),
    );
    check("the document is untouched by a jump", v.text(), PAIR);
    ok("and the writer is told which note they went to", chrome.status().includes("1"));
  }

  {
    // And back again, from the body to the marker.
    const v = fakeView(PAIR, at(PAIR, `#גוף_הערה("1")[עיין`));
    ok("the return trip is handled too", jumpDeferred(v));
    ok("and lands on the marker", v.caret() <= PAIR.indexOf("סוף"));
  }

  {
    // A marker whose prose has not been written yet: the line is written rather
    // than an error being reported. This is the behaviour the module's own
    // comment says is the entire reason anybody tolerates footnotes this way.
    const doc = `פתיחה#הערה_בשם("7") סוף.\n`;
    const v = fakeView(doc, at(doc, `#הערה_בשם("7"`));
    ok("a missing body is written, not complained about", jumpDeferred(v));
    ok("the definition now exists", v.text().includes(`#גוף_הערה("7")`));
    ok(
      "and the caret is in it, ready to type",
      v.caret() > v.text().indexOf(`#גוף_הערה("7")`),
    );
  }

  {
    // Nowhere in particular: the key declines, and says so. Returning `true`
    // here would swallow the keystroke from every binding below it.
    const v = fakeView("סתם טקסט בלי שום הערה.\n", 4);
    chrome.clear();
    notOk("the key declines when there is nothing under the caret", jumpDeferred(v));
    ok("but says why rather than doing nothing visible", chrome.status().length > 0);
    check("and leaves the document alone", v.text(), "סתם טקסט בלי שום הערה.\n");
  }

  {
    // A body nothing points at. The module's comment is explicit that only the
    // writer knows where the marker belongs, so it must *not* invent one.
    const doc = `טקסט רגיל.\n#גוף_הערה("9")[יתומה]\n`;
    const v = fakeView(doc, at(doc, `#גוף_הערה("9")[יתו`));
    chrome.clear();
    ok("an orphan body is reported", jumpDeferred(v));
    check("as a warning — it is a real defect in the document", chrome.statusClass(), "warn");
    check("and no marker is invented for it", v.text(), doc);
  }

  // ------------------------------------------------ exile and recall

  {
    const v = fakeView(INLINE, at(INLINE, "#הערה[עיין"));
    ok("an inline note can be exiled", deferHere(v));
    ok("a marker is left behind", /#הערה_בשם\(/.test(v.text()));
    ok("and the prose has moved to a definition", /#גוף_הערה\(/.test(v.text()));
    notOk("the inline form is gone", /#הערה\[/.test(v.text()));

    // The round trip is the real assertion: exile then recall is the identity,
    // and it is the property that would break silently under a bad offset.
    const back = fakeView(v.text(), v.text().indexOf("#הערה_בשם") + 3);
    ok("and it comes back", recallHere(back));
    ok("as an inline note again", /#הערה\[עיין שם\]/.test(back.text()));
    notOk("with no definition left over", /#גוף_הערה/.test(back.text()));
  }

  {
    // Recall where there is nothing deferred: declines, no edit.
    const v = fakeView(INLINE, 2);
    notOk("recall declines when there is nothing to recall", recallHere(v));
    check("and changes nothing", v.text(), INLINE);
  }

  {
    // `deferHere` in ordinary prose starts a new note rather than refusing —
    // "leave a marker here and put me where the prose goes."
    const doc = "פתיחה אמצע סוף.\n";
    const v = fakeView(doc, 6);
    ok("a new deferred note can be started from nothing", deferHere(v));
    ok("with a marker at the caret", v.text().includes("#הערה_בשם("));
    ok("and a body to type into", v.text().includes("#גוף_הערה("));
  }

  {
    // Language: an English document must not have Hebrew written into it. This
    // is the defect §9a fixed on the notes-pane axis, asserted here on the
    // insertion axis, because the module takes the language as an argument and
    // nothing checked that it uses it.
    const doc = "Opening middle end.\n";
    const v = fakeView(doc, 8);
    ok("a note can be started in an English document", deferHere(v, "en"));
    notOk("and nothing Hebrew was written into it", /[א-ת]/.test(v.text()));
  }

  // ------------------------------------------------ all of them at once

  {
    const doc = `א#הערה[ראשונה] ב#הערה[שנייה] ג#הערה[שלישית].\n`;
    const v = fakeView(doc, 0);
    ok("every inline note can be exiled at once", deferAll(v));
    check("three markers", (v.text().match(/#הערה_בשם\(/g) ?? []).length, 3);
    check("three bodies", (v.text().match(/#גוף_הערה\(/g) ?? []).length, 3);
    ok("and the count is reported to the writer", chrome.status().includes("3"));

    // The equivalence that matters: the notes pane sees the same notes before
    // and after. `notesIn` is the index both spellings feed, and "the two
    // spellings of one note" is precisely what §9a was about — so the exile is
    // checked against the surface that reads it, not only against the text.
    check(
      "and the notes pane still counts three",
      notesIn(v.text()).length,
      notesIn(doc).length,
    );
  }

  {
    // Nothing to move: declines rather than reporting a move of zero.
    const v = fakeView(PAIR, 0);
    notOk("deferring all declines when nothing is inline", deferAll(v));
    check("and rewrites nothing", v.text(), PAIR);
  }
  } finally {
    chrome.restore();
  }
}
