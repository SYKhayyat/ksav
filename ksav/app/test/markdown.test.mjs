// Ksav → Markdown / plain text.
//
// A deliberately lossy conversion, so the assertions are about which losses are
// acceptable. The one that is not acceptable — and the reason this module
// exists — is markup leaking through: a document exported with `#הדגשה[…]` still
// in it has not been exported, it has been renamed.

import { check, ok, notOk } from "./harness.mjs";
import { toMarkdown, toPlainText } from "../.tmp-test/markdown.mjs";

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
}
