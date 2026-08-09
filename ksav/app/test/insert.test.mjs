import { check, ok } from "./harness.mjs";
import { plan, regionAround, commandOf } from "../.tmp-test/insert.mjs";

// What a click on the toolbar turns into, asked directly.
//
// This decision — refuse, or a note layout, or text and a caret — lived in
// `main.ts`, the one module no test can import. The insertion *grid* checked
// 1,026 strings against the compiler; nothing checked the function that chooses
// which string, whether it is legal where the caret is, or where the caret lands
// afterwards. That is the seam §7 of the 7 August report is about, and this file
// is the half of it that was missing.

const at = (doc, needle) => doc.indexOf(needle);

export async function run() {
  // ------------------------------------------------------------ plain text

  {
    const doc = "שלום עולם";
    const p = plan(doc, 5, 5, "", "#הדגשה[|]");
    check("a command inserts its snippet", p.kind, "edit");
    check("…with the pipe removed", p.text, "#הדגשה[]");
    check("…and the caret where the pipe was", p.cursor, "#הדגשה[".length);
  }
  {
    // A selection is wrapped, not replaced — what every word processor does, and
    // what the toolbar's own buttons rely on.
    const doc = "שלום עולם";
    const p = plan(doc, 0, 4, "שלום", "#הדגשה[|]");
    check("a selection is wrapped", p.text, "#הדגשה[שלום]");
    check("…and the caret lands after it", p.cursor, "#הדגשה[שלום".length);
  }
  {
    const p = plan("", 0, 0, "", "#קו_מפריד");
    check("a snippet with no pipe puts the caret at its end", p.cursor, "#קו_מפריד".length);
  }

  // ------------------------------------------------------------- refusals

  {
    // `#מעבר_עמוד` ends a page. Typst refuses it inside a container and says so
    // in English from the middle of a blanked preview, so the editor refuses it
    // first, in Hebrew, with the page intact — which is the whole difference
    // between a word processor and a text editor with a build step.
    const doc = "#כותרת1[פרק]";
    const p = plan(doc, at(doc, "פרק"), at(doc, "פרק"), "", "#מעבר_עמוד");
    check("a page break inside a container is refused", p.kind, "refuse");
    check("…naming what is wrong", p.reason, "illegalPageLevel");
  }
  {
    // And at the top level it is not, or the refusal would be a blanket ban
    // rather than a judgement about position. This is the pair that makes the
    // rule falsifiable: `ONLY_AT_TOP` in reverse.
    const p = plan("שלום עולם", 5, 5, "", "#מעבר_עמוד");
    check("…and at the top level it is offered", p.kind, "edit");
  }
  {
    // The third case, and the one this pair used to get wrong in the example it
    // chose: **not everything with brackets is a container.** `#הדגשה` is a
    // `strong()`, `#שער` is `align(center, text(…))`, and Typst puts a page
    // break through both of them without complaint. The rule was
    // `frames.length === 0` and the test that guarded it stood inside `#הדגשה`
    // and called it a container — so the fence and the bug agreed, and a writer
    // in bold text was refused an operation that works.
    //
    // Which commands are containers is measured against the compiler
    // (`engine/tests/containers.rs`); these two are the assertion that the
    // measurement is *reaching* the editor.
    for (const doc of ["#הדגשה[שלום]", "#שער[שלום]"]) {
      const p = plan(doc, at(doc, "שלום"), at(doc, "שלום"), "", "#מעבר_עמוד");
      check(`…and inside ${doc.slice(0, 6)}…], which is not a container`, p.kind, "edit");
    }
  }
  {
    // A table of contents inside a heading renders the heading, which renders
    // the contents, until Typst's nesting guard fires and the page goes blank.
    const doc = "#כותרת1[פרק]";
    const p = plan(doc, at(doc, "פרק"), at(doc, "פרק"), "", "#תוכן()");
    check("a table of contents inside a heading is refused", p.kind, "refuse");
    check("…naming what is wrong", p.reason, "illegalInHeading");
  }

  // ---------------------------------------------------------------- notes

  {
    // A note is a layout, not a string: the answer is *which* layout, so that
    // the scaffolding — the dump call, the wrapper, the configuration line —
    // goes in with it. Returning `edit` here is the bug that produced endnotes
    // collected and never printed.
    const p = plan("שלום", 4, 4, "", "#הערה[|]");
    check("a footnote is answered as a layout", p.kind, "note");
    ok("…and names the choice that carries its scaffolding", !!p.choice?.id, p.choice?.id);
  }
  {
    const p = plan("שלום", 4, 4, "", "#הערתסיום[|]");
    check("an endnote is a layout too", p.kind, "note");
    ok("…and a different one from the footnote", p.choice?.id !== "footnote", p.choice?.id);
  }

  // ------------------------------------------------------------- numbering

  {
    // A siman's number is a value, so inserting a second one after
    // `#סימן[א׳]` must continue the series rather than write `א׳` again.
    const doc = "#סימן[א׳][פתיחה]\n\nגוף.\n\n";
    const p = plan(doc, doc.length, doc.length, "", "#סימן[|][]");
    ok("a second siman continues the series", p.kind === "edit" && !p.text.includes("|"), JSON.stringify(p));
    ok("…and does not repeat the first one's number", !p.text.startsWith("#סימן[א׳]"), p.text);
  }

  // --------------------------------------------------------------- regions

  {
    // The `//{` must begin its own line or the fold service does not see it, and
    // the region a writer just made silently refuses to fold. Mid-line is the
    // case that gets this wrong.
    const doc = "שלום עולם";
    const r = regionAround(doc, 5, 9, "אזור");
    ok("a region mid-line starts on a new one", r.text.startsWith("\n//{ "), JSON.stringify(r.text));
    check("…and the label is selected so it can be renamed",
      r.text.slice(r.select[0] - r.from, r.select[1] - r.from), "אזור");
  }
  {
    const doc = "שלום עולם";
    const r = regionAround(doc, 0, 5, "אזור");
    ok("a region at a line start needs no newline", r.text.startsWith("//{ "), JSON.stringify(r.text));
    check("…and the label is still selected",
      r.text.slice(r.select[0], r.select[1]), "אזור");
  }
  {
    const r = regionAround("א\nב", 2, 3, "אזור");
    ok("a region after a newline needs no newline either", r.text.startsWith("//{ "), r.text);
    ok("…and closes on its own line", r.text.endsWith("\n//}\n"), JSON.stringify(r.text));
  }

  // ---------------------------------------------------------- command names

  check("a command name is read off the snippet", commandOf("#הדגשה[|]"), "הדגשה");
  check("…including an English one", commandOf("#bold[|]"), "bold");
  check("…and underscores are part of it", commandOf("#קו_תחתון[|]"), "קו_תחתון");
  check("plain text names no command", commandOf("שלום"), null);
}
