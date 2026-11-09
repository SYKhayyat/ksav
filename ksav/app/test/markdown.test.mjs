// Ksav → Markdown / plain text.
//
// A deliberately lossy conversion, so the assertions are about which losses are
// acceptable. The one that is not acceptable — and the reason this module
// exists — is markup leaking through: a document exported with `#הדגשה[…]` still
// in it has not been exported, it has been renamed.

import { check, ok, notOk } from "./harness.mjs";
import { toMarkdown, toPlainText } from "../.tmp-test/markdown.mjs";
import { toOrg } from "../.tmp-test/org.mjs";

/** Nothing that comes out of an export may still look like a Ksav command. */
function leaksMarkup(s) {
  return /#[A-Za-z֐-׿_]/.test(s);
}

export async function run() {
  // ------------------------------------------------------------ structure
  {
    check("a heading becomes a heading", toMarkdown("#כותרת1[פרק]").trim(), "# פרק");
    check("levels are kept", toMarkdown("#כותרת3[סעיף]").trim(), "### פרק".replace("פרק", "סעיף"));
    check("English aliases work too", toMarkdown("#h2[Section]").trim(), "## Section");
    check("a title is level one", toMarkdown("#שער[ספר]").trim(), "# ספר");
  }

  {
    check("bold", toMarkdown("#הדגשה[חזק]").trim(), "**חזק**");
    check("italic", toMarkdown("#נטוי[נטוי]").trim(), "*נטוי*");
    check("strikethrough", toMarkdown("#קו_חוצה[מחוק]").trim(), "~~מחוק~~");
    check("code", toMarkdown("#קוד[x]").trim(), "`x`");
  }

  {
    // Emphasis nests, because Typst parses the document and so does this.
    const out = toMarkdown("#הדגשה[חזק #נטוי[וגם נטוי]]").trim();
    check("nested emphasis composes", out, "**חזק *וגם נטוי***");
  }

  {
    const out = toMarkdown("#קו_מפריד");
    ok("a horizontal rule becomes one", out.includes("---"));
  }

  // ------------------------------------------------- the layout atoms, per dialect
  //
  // #129. The UAT report: *"exported text has extra line breaks for headers and
  // source line-break commands; the same problem appears in Markdown and Org"*,
  // and the plain-text export carried `---` and `______` — Markdown's spellings
  // of a rule and a fill — in a file whose whole purpose is that it has no
  // markup.
  //
  // The rule the three dialects follow, and the one asserted here: **an atom
  // becomes syntax only where the target format has that syntax.** A page break
  // is a rule in Markdown and Org because a sefer divided by page breaks would
  // otherwise arrive as one wall of text; in plain text it is a paragraph break,
  // because a text file has no pages and `---` is not a word.
  {
    const atoms = {
      rule: "#קו_מפריד",
      pagebreak: "#מעבר_עמוד",
      colbreak: "#מעבר_טור",
      gap: "#חסר(גובה: 2em)",
      vspace: "#מרווח(גובה: 1em)",
      hspace: "#רווח(רוחב: 1em)",
    };

    // Plain text: no marker of any format survives. This is the assertion that
    // fails on the old code for both `rule` (`---`) and `gap` (`______`).
    const stray = [];
    for (const [name, src] of Object.entries(atoms)) {
      const out = toPlainText(`א\n\n${src}\n\nב`);
      for (const mark of ["---", "_____", "\*", "#", "[^", "\\\\", "$"]) {
        if (out.includes(mark)) stray.push(`${name} → ${JSON.stringify(out)}`);
      }
      ok(`plain: ${name} keeps both paragraphs`, out.includes("א") && out.includes("ב"), out);
      notOk(`plain: ${name} leaves no marker`, out.includes("#"), out);
    }
    check("plain: none of the six atoms leaves a mark from another format", stray, []);

    // A rule still *separates* what it stood between, in both markups: dropping
    // it entirely would join two chapters into one.
    ok("markdown: a page break is a rule", toMarkdown("א\n\n#מעבר_עמוד\n\nב").includes("---"));
    check("org: a page break is Org's rule", toOrg("א\n\n#מעבר_עמוד\n\nב").trim(), "א\n\n-----\n\nב");
    // …and a fill is not a rule, in either: `______` was a second thematic break
    // that said nothing about a gap.
    notOk("markdown: a fill is not a rule", toMarkdown(atoms.gap).includes("___"));
    notOk("org: a fill is not a rule", toOrg(atoms.gap).includes("___"));
  }

  {
    // A line break is a line break, not a paragraph. The atom meets the source's
    // own newline — the writer typed the command at the end of a line — and the
    // two together used to read as a blank line, which is a paragraph in
    // Markdown, a paragraph in plain text, and (before `toOrg`'s collapse) a
    // stray `\\` above a blank line in Org.
    const src = "שורה ראשונה#מעבר_שורה\nשורה שנייה";
    check("markdown: a forced break is not a paragraph", toMarkdown(src).trim(), "שורה ראשונה\nשורה שנייה");
    check("plain: a forced break is a newline", toPlainText(src).trim(), "שורה ראשונה\nשורה שנייה");
    check("org: a forced break is Org's backslashes", toOrg(src).trim(), "שורה ראשונה\\\\\nשורה שנייה");
    // And a writer who left a blank line after the marker still gets the break,
    // not that blank line and a stray marker.
    check(
      "org: a marker followed by a blank line still breaks once",
      toOrg("א#מעבר_שורה\n\nב").trim(),
      "א\\\\\nב",
    );
  }

  {
    // Headings: "extra line breaks for headers" was the report's first half. A
    // heading is a block, so it gets exactly one blank line either side — not
    // two, whichever of the three ways the writer separated it in the source.
    const want = {
      markdown: "# פרק\n\nטקסט\n",
      plain: "פרק\n\nטקסט\n",
      org: "* פרק\n\nטקסט\n",
    };
    const dialects = { markdown: toMarkdown, plain: toPlainText, org: toOrg };
    for (const [how, src] of [
      ["nothing between them", "#כותרת1[פרק]\nטקסט"],
      ["a newline", "#כותרת1[פרק]\n\nטקסט"],
      ["a blank line and a space", "#כותרת1[פרק]\n \nטקסט"],
    ]) {
      for (const [name, fn] of Object.entries(dialects)) {
        check(`${name}: a heading with ${how} is a block and one paragraph`, fn(src), want[name]);
      }
    }
  }

  // ------------------------------------------------------------ the apparatus
  {
    // Markdown has no notion of an eleven-layer note apparatus. What it does
    // have is footnotes, so notes go there and the plumbing is dropped.
    const out = toMarkdown("טקסט#הערה[ביאור] סוף.\n#הערות_בסוף(כותרת: [הערות])");
    ok("a note leaves a marker", /\[\^\d+\]/.test(out));
    ok("…and its text at the bottom", out.includes("ביאור"));
    notOk("the endnote-dump plumbing is dropped", out.includes("הערות_בסוף"));
    notOk("nothing leaks markup", leaksMarkup(out));
  }

  {
    // Configuration commands are instructions to the typesetter, not content.
    const out = toMarkdown('#הגדרות_כותרות(מספור: "1.1")\n#כותרת1[פרק]');
    check("config commands are dropped", out.trim(), "# פרק");
  }

  // ------------------------------------------------------------ review marks
  {
    // An export is the document, not the review of it: it reads as if every
    // change had been accepted.
    const out = toMarkdown("א#הוספה[חדש]ב#מחיקה[ישן]ג#הערת_עורך[הערה]ד");
    ok("inserted text is kept", out.includes("חדש"));
    notOk("deleted text is gone", out.includes("ישן"));
    notOk("editorial comments are gone", out.includes("הערה"));
    notOk("nothing leaks markup", leaksMarkup(out));
  }

  // ------------------------------------------------------------ comments
  {
    const out = toMarkdown("// לא לייצוא\nטקסט\n/* גם לא */\n");
    notOk("line comments are not exported", out.includes("לא לייצוא"));
    notOk("block comments are not exported", out.includes("גם לא"));
    ok("the prose is", out.includes("טקסט"));
  }

  // ------------------------------------------------------------ plain text
  {
    const out = toPlainText("#כותרת1[פרק]\n\n#הדגשה[חזק] רגיל.");
    notOk("plain text carries no markdown syntax", /[*#~`]/.test(out));
    ok("…and keeps the words", out.includes("פרק") && out.includes("חזק") && out.includes("רגיל"));
  }

  // ---------------------------------------------------------- what it produces
  //
  // Not only what it must never do. The invariant below — no `#name[` in the
  // output — is the assertion this file was built around, and for as long as it
  // was the *only* one over a list, `#רשימה(פריט[א], פריט[ב])` exported as `- א`
  // followed by a line beginning `, - ב`: the source's own comma, copied through
  // because it fell between two nodes. A comma is not markup, so the invariant
  // was perfectly happy. Found by writing the same tests for Org.
  check("a list has no source punctuation in it", toMarkdown("#רשימה(פריט[א], פריט[ב])").trim(), "- א\n- ב");
  check(
    "…including when it is written the way the editor writes it",
    toMarkdown("#ממוספרת(\n  פריט[א],\n  פריט[ב],\n)").trim(),
    "1. א\n2. ב",
  );

  // ------------------------------------------------------------ the invariant
  {
    for (const src of [
      "",
      "סתם טקסט בלי שום פקודה",
      "#רשימה(פריט[א], פריט[ב])",
      "#טבלה(עמודות: 2, תא[א], תא[ב])",
      '#טבלה(עמודות: 2, תא[רש"י], תא[שו"ע])',
      "א#הערה[ב#הערה_על_הערה[ג]]",
      "#עם_הערות_צד[טקסט#הערת_גיליון[צד]]",
      "#מקטע_עמוד(טורים: 2)[טקסט]",
      "#לא_קיימת[גוף של פקודה שאיננה מוכרת]",
    ]) {
      const md = toMarkdown(src);
      const txt = toPlainText(src);
      notOk(`markdown leaks no markup: ${JSON.stringify(src).slice(0, 34)}`, leaksMarkup(md));
      notOk(`plain text leaks no markup: ${JSON.stringify(src).slice(0, 34)}`, leaksMarkup(txt));
    }
  }

  {
    // An unknown command must degrade to its content, not vanish and not print
    // its own name — a writer's `#let` is an unknown command to this module.
    const out = toMarkdown("#פקודה_שלי[התוכן שלי]");
    ok("an unknown command keeps its content", out.includes("התוכן שלי"));
    notOk("…without printing its name", out.includes("פקודה_שלי"));
  }

// ------------------------------------------------- lists written every way
//
// The engine takes three spellings of a list and lays them out identically, so
// an export that understands one of them loses the writer's words in the one
// direction where nothing on the page can show it. `#רשימה[א][ב]` — two bodies,
// no item command, two perfectly good bullets on the page — exported as the
// empty string: the second body was never visited, and the first had its text
// suppressed for not being inside an item.

{
  const want = ["- א", "- ב", ""].join("\n");
  check("the argument form", toMarkdown("#רשימה(פריט[א], פריט[ב])"), want);
  check("items inside the body", toMarkdown("#רשימה[#פריט[א] #פריט[ב]]"), want);
  check("bodies as items", toMarkdown("#רשימה[א][ב]"), want);
  check(
    "and numbered across the whole list, not per body",
    toMarkdown("#ממוספרת[א][ב]"),
    ["1. א", "2. ב", ""].join("\n"),
  );
  check(
    "a table written as bodies keeps its cells",
    toMarkdown("#טבלה(עמודות: 2)[א][ב]"),
    toMarkdown("#טבלה(עמודות: 2, תא[א], תא[ב])"),
  );
}

}
