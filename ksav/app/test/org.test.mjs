// Org mode, in and out.
//
// Two directions and two different risks, and the tests are shaped after them.
//
// **Going out** the risk is a construct silently arriving as nothing, or worse,
// as `#command[…]` — a file the writer pastes into Emacs with Ksav's own markup
// visible in it. So the last assertion here compiles a document that uses every
// classified construct and insists no `#name[` survives, in every dialect at
// once. That claim is about `interchange.ts` and it is made here because this is
// where the second dialect arrived and made it checkable.
//
// **Coming in** the risk is the opposite: Org text arriving as Ksav *markup* by
// accident. An asterisk in a sentence is not a heading, a slash in a path is not
// italics, and a `#` at the start of a line is Org's comment and Typst's command
// sigil at the same time. Half the assertions below are about text that must
// stay text.
//
// The round trip is checked but not over-claimed. These conversions are lossy by
// design — Org has no note apparatus and Ksav has no property drawers — so what
// is asserted is that the things both formats *have* survive the journey, not
// that the bytes come back.

import { check, ok, notOk } from "./harness.mjs";
import { toOrg, fromOrg, ORG } from "../.tmp-test/org.mjs";
import { MARKDOWN, PLAIN, toMarkdown } from "../.tmp-test/markdown.mjs";
import { CLASSIFIED_NAMES, render } from "../.tmp-test/interchange.mjs";

export async function run() {
  // ------------------------------------------------------------------ going out

  check("a heading becomes stars", toOrg("#כותרת2[פרק שני]").trim(), "** פרק שני");

  // The reason this format is worth having at all. Markdown stops at six and
  // `#########` is not a heading in any flavour of it; Org counts stars.
  ok("a ninth-level heading survives", toOrg("#כותרת(רמה: 9)[עמוק]").trim().startsWith("*********"));
  check(
    "…where Markdown flattens it to six",
    toMarkdown("#כותרת(רמה: 9)[עמוק]").trim(),
    "###### עמוק",
  );

  check("bold is one asterisk, not two", toOrg("#הדגשה[חזק]").trim(), "*חזק*");
  check("italic is a slash", toOrg("#נטוי[נטוי]").trim(), "/נטוי/");
  check("strike is a plus", toOrg("#קו_חוצה[מחוק]").trim(), "+מחוק+");
  check("code is a tilde", toOrg("#קוד[x]").trim(), "~x~");
  // The one Org has no word for. Underline is the nearest thing that survives to
  // HTML, PDF and a terminal alike; dropping it would lose the fact that the
  // writer marked the words at all.
  check("a highlight becomes underline", toOrg("#סימון[מודגש]").trim(), "_מודגש_");

  check(
    "a bulleted list",
    toOrg("#רשימה(פריט[אלף], פריט[בית])").trim(),
    "- אלף\n- בית",
  );
  check(
    "a numbered list counts",
    toOrg("#ממוספרת(פריט[אלף], פריט[בית])").trim(),
    "1. אלף\n2. בית",
  );

  // Org footnotes are labelled references with the prose at the end, which is
  // the same shape Ksav's own deferred notes have.
  {
    const out = toOrg('ועיין ברש"י#הערה[שם ד"ה כך]');
    ok("a note leaves a labelled reference", out.includes("[fn:1]"));
    ok("…and its prose goes to the end", /\[fn:1\] שם/.test(out));
  }

  check("a rule is five dashes", toOrg("#קו_מפריד").trim(), "-----");
  // Org has no pages. A page break becoming nothing would deliver a sefer whose
  // chapters were divided by them as one undivided wall of text.
  check("a page break is not silently dropped", toOrg("#מעבר_עמוד").trim(), "-----");
  // `\\` forces a break in Org only when a line follows it directly. The marker
  // meets the source's own newline, so without the collapse in `toOrg` the pair
  // reads as a paragraph break with a stray `\\` above it.
  check("a line break is Org's backslashes", toOrg("א#מעבר_שורה\nב").trim(), "א\\\\\nב");
  check("…and does not leave a blank line behind it", toOrg("א#מעבר_שורה\n\nב").trim(), "א\\\\\nב");

  check("a quote is a block", toOrg("#ציטוט[דברים]").trim(), "#+begin_quote\nדברים\n#+end_quote");
  check("an image is a file link", toOrg('#תמונה("a.png")').trim(), "[[file:a.png]]");
  check("inline maths", toOrg('#נוסחה_בשורה("x^2")').trim(), "$x^2$");
  check("display maths", toOrg('#נוסחה("x^2")').trim(), "\\[x^2\\]");

  // A table, and the one place Org and Markdown genuinely disagree: Markdown has
  // to invent a header row because a headerless table does not render at all,
  // and Org must not, because a rule under a row that is not a header asserts
  // something the document never said.
  {
    const plain = toOrg("#טבלה(עמודות: 2, תא[א], תא[ב], תא[ג], תא[ד])").trim();
    check("a table without a head has no rule", plain, "| א | ב |\n| ג | ד |");
    ok(
      "…and Markdown's does, because it must",
      toMarkdown("#טבלה(עמודות: 2, תא[א], תא[ב], תא[ג], תא[ד])").includes("| --- |"),
    );
  }

  // ------------------------------------------------------------------ coming in

  check("stars become a heading", fromOrg("** פרק שני").body.trim(), "#כותרת2[פרק שני]");
  // Past six there is only one spelling that carries the level.
  check(
    "nine stars need the generic command",
    fromOrg("********* עמוק").body.trim(),
    "#כותרת(רמה: 9)[עמוק]",
  );

  check("a bulleted list", fromOrg("- אלף\n- בית").body.trim(), "#רשימה(\n  פריט[אלף],\n  פריט[בית],\n)");
  check(
    "a numbered list",
    fromOrg("1. אלף\n2. בית").body.trim(),
    "#ממוספרת(\n  פריט[אלף],\n  פריט[בית],\n)",
  );
  // A list that changes kind is two lists, not one with a confused marker.
  ok(
    "a numbered list after a bulleted one starts a new list",
    fromOrg("- אלף\n1. בית").body.includes("#רשימה(") &&
      fromOrg("- אלף\n1. בית").body.includes("#ממוספרת("),
  );

  // An indented `*` is a bullet; at column 0 it is a headline. Refusing both was
  // the first version, and it deleted every starred sub-list without a word.
  {
    const r = fromOrg("- אלף\n  * בית");
    ok("an indented star is a bullet", r.body.includes("פריט[בית]"));
    ok("…and the flattening is reported", r.dropped.includes("nested list levels"));
  }

  check("bold comes back", fromOrg("*חזק*").body.trim(), "#הדגשה[חזק]");
  check("italic comes back", fromOrg("/נטוי/").body.trim(), "#נטוי[נטוי]");
  check("verbatim is code", fromOrg("=x=").body.trim(), "#קוד[x]");

  // The other half, and the one a regex gets wrong. Org requires its delimiters
  // to hug their content, so arithmetic and paths stay prose.
  {
    const arith = fromOrg("2 * 3 = 6").body;
    notOk("an asterisk between spaces is not emphasis", arith.includes("#הדגשה"));
    const path = fromOrg("see a / b for more").body;
    notOk("a slash between spaces is not italics", path.includes("#נטוי"));
  }

  // A heading is a line that *starts* with stars. `*bold*` on its own line is
  // emphasis, and reading it as a heading would restructure the document.
  {
    const body = fromOrg("*חזק*").body;
    notOk("a bold-only line is not a heading", body.includes("#כותרת"));
  }

  // Footnotes, both of Org's forms, and the resolution that has to happen across
  // the whole file rather than line by line.
  {
    const doc = "שורה[fn:1] וסופה\n\n[fn:1] גוף ההערה";
    const body = fromOrg(doc).body;
    ok("a labelled reference becomes a note", body.includes("#הערה[גוף ההערה]"));
    notOk("…and the definition line does not also arrive as prose", /^\[fn:1\]/m.test(body));
  }
  ok("an inline note", fromOrg("שורה[fn::מיד כאן]").body.includes("#הערה[מיד כאן]"));
  // Defined *after* it is used, which is the ordinary case in a real file and the
  // one a single-pass reader gets wrong.
  ok(
    "a note referenced before it is defined still resolves",
    fromOrg("ראש[fn:a]\n\n[fn:a] הגוף").body.includes("#הערה[הגוף]"),
  );
  // A note whose body has markup in it. The body is spliced in before the inline
  // passes run, which is the whole reason this works.
  ok(
    "markup inside a note body is converted",
    fromOrg("ראש[fn:b]\n\n[fn:b] עם *הדגשה*").body.includes("#הדגשה[הדגשה]"),
  );

  // Emacs bookkeeping. None of it can become anything here, and all of it has to
  // be named rather than vanish.
  {
    const r = fromOrg("* TODO לעשות  :work:home:\n:PROPERTIES:\n:ID: 1\n:END:\nגוף");
    notOk("a TODO keyword does not print", r.body.includes("TODO"));
    notOk("tags do not print", r.body.includes(":work:"));
    notOk("a property drawer does not print", r.body.includes(":ID:"));
    ok("the heading itself survives", r.body.includes("#כותרת1[לעשות]"));
    for (const what of ["TODO keywords", "heading tags", "property drawers"]) {
      ok(`…and "${what}" is reported`, r.dropped.includes(what));
    }
  }
  {
    const r = fromOrg("#+AUTHOR: פלוני\n#+TITLE: הספר");
    ok("a title becomes one", r.body.includes("#שער[הספר]"));
    ok("an unread keyword is reported", r.dropped.includes("#+keyword lines"));
  }

  // Blocks.
  ok("a quote block", fromOrg("#+begin_quote\nדברים\n#+end_quote").body.includes("#ציטוט["));
  ok("a source block keeps its lines", fromOrg("#+begin_src\na\nb\n#+end_src").body.includes("#מעבר_שורה"));
  // And a block this converter does not know is text, and says so.
  {
    const r = fromOrg("#+begin_verbatim\nx\n#+end_verbatim");
    ok("an unknown block is named", r.dropped.includes("#+begin_verbatim blocks"));
  }

  // A table, and the rule that says the row above it was a head — which `תא`
  // cannot express, so the fact is reported rather than pretended away.
  {
    const r = fromOrg("| א | ב |\n|---+---|\n| ג | ד |");
    ok("a table arrives", r.body.includes("#טבלה(עמודות: 2,"));
    ok("its cells are cells", r.body.includes("תא[א]") && r.body.includes("תא[ד]"));
    ok("and the header rule is reported", r.dropped.includes("table header rules"));
  }

  // Text that must stay text. `#` starts a comment in Org and a command in
  // Typst, and a `[` that is not markup would open a body that never closes.
  {
    const r = fromOrg("a [bracket] and 100% and a #hash");
    notOk("a stray hash does not become a command", /(^|[^\\])#hash/.test(r.body));
    ok("brackets are escaped", r.body.includes("\\[") || r.body.includes("\\]"));
  }
  // An Org comment line is not content.
  check("an Org comment is dropped", fromOrg("# a note to self").body.trim(), "");

  // Direction, which every import route has to answer.
  check("a Hebrew file is right-to-left", fromOrg("* שלום").dir, "rtl");
  check("an English one is not", fromOrg("* hello there friends").dir, "ltr");

  // ---------------------------------------------------------------- round trip

  // Not byte equality — these conversions are lossy on purpose. What has to
  // survive is what both formats have.
  {
    const source = "#כותרת1[ראש]\n\nגוף עם #הדגשה[חזק] ו#נטוי[נטוי].\n\n#רשימה(פריט[אלף], פריט[בית])";
    const back = fromOrg(toOrg(source)).body;
    ok("the heading came back", back.includes("#כותרת1[ראש]"));
    ok("the bold came back", back.includes("#הדגשה[חזק]"));
    ok("the italic came back", back.includes("#נטוי[נטוי]"));
    ok("the list came back", back.includes("#רשימה(") && back.includes("פריט[אלף]"));
  }

  // ------------------------------------------------- no dialect leaks Ksav markup
  //
  // The contract `interchange.ts` states and could not check while there was one
  // dialect: whatever a document contains, no `#name[` reaches the output. A
  // reader who pastes an export into an email must never meet this application's
  // own command names.
  {
    const everything = [
      "#כותרת3[ראש]",
      "#שער[שם]",
      "#הדגשה[א] #נטוי[ב] #קו_חוצה[ג] #קוד[ד] #סימון[ה]",
      "#קו_מפריד",
      "#מעבר_עמוד",
      "טקסט#הערה[הערה]",
      "#רשימה(פריט[אלף])",
      "#ממוספרת(פריט[בית])",
      "#טבלה(עמודות: 2, תא[א], תא[ב])",
      "#ציטוט[ציטוט]",
      '#תמונה("a.png")',
      '#נוסחה("x")',
      "#הפניה(<a>)",
      "#תוכן()",
      "#פיקציה[מה שלא הומצא]",
    ].join("\n\n");
    let dialects = 0;
    for (const [name, d] of [["Org", ORG], ["Markdown", MARKDOWN], ["plain text", PLAIN]]) {
      dialects++;
      const out = render(everything, d);
      notOk(`${name} leaks no command call`, /#[֐-׿\w_]+\[/.test(out));
      ok(`${name} kept the words`, out.includes("ראש") && out.includes("מה שלא הומצא"));
    }
    // The floor, so a rename that empties the list above cannot leave this loop
    // asserting nothing at all.
    check("every dialect was checked", dialects, 3);
    ok("there are constructs to check", CLASSIFIED_NAMES.length > 50);
  }
}
