import { check, ok, notOk } from "./harness.mjs";
import {
  PALETTE_COMMANDS,
  commandGroups,
  gist,
  historyList,
  indentPx,
  noteList,
  outlineList,
  paletteList,
} from "../.tmp-test/panelrows.mjs";
import { notesIn } from "../.tmp-test/notes.mjs";
import { outline } from "../.tmp-test/ksav-lang.mjs";

// What the four list panels list, asked directly.
//
// The outline, the notes pane, the version history and the command palette each
// built their rows inline in `main.ts`, and between them they answered four
// questions four times: how far to indent, what a row's words are, what to say
// when there is nothing, and what to do about a cap. Two of those had two
// answers and two had none, and not one of them was reachable from a test.

/** A body with a title page, three levels of heading and two notes. */
const DOC = [
  "#שער[קונטרס בעניני שבת]",
  "",
  "#כותרת1[פרק א]",
  "",
  "פתיחה#הערה[עיין שם היטב] וכאן.",
  "",
  "#כותרת2[סימן א]",
  "",
  "עוד#הערה[ועיין עוד] דבר.",
  "",
].join("\n");

export async function run() {
  // ------------------------------------------------------------ one indent rule

  {
    // It was `8 + level * 14` in the outline and `8 + depth * 14` in the notes
    // pane — one rule, two spellings, in two functions neither of which could
    // see the other.
    check("no indent is the base padding", indentPx(0), 8);
    check("one step is one step", indentPx(1), 22);
    check("three steps", indentPx(3), 50);
    // A negative depth is a bug upstream, not a negative padding.
    check("nothing indents backwards", indentPx(-2), 8);
  }

  // ---------------------------------------------------------------- the outline

  {
    const list = outlineList(outline(DOC));
    check("nothing is hidden from the outline", list.hidden, 0);
    check("…and it is not empty", list.empty, null);
    ok("every heading is a row", list.rows.length >= 3, `${list.rows.length} rows`);
    check("every row jumps", list.rows.filter((r) => r.does.kind !== "jump"), []);
    // Relative to the shallowest heading in the document, not absolute: a
    // document whose only headings are `#כותרת3` is not a document indented
    // three levels, it is a document whose headings all sit at one place.
    check("the shallowest row is flush", Math.min(...list.rows.map((r) => r.indent)), 0);
  }
  {
    const only3 = "#כותרת3[א]\n\nגוף\n\n#כותרת3[ב]\n\nעוד\n";
    const list = outlineList(outline(only3));
    check(
      "headings all at one level all sit flush",
      list.rows.map((r) => r.indent),
      [0, 0],
    );
  }
  {
    const list = outlineList([]);
    check("a document with no headings says so", list.empty, "noHeadings");
    check("…and lists nothing", list.rows, []);
  }

  // ------------------------------------------------------------- the notes pane

  {
    const list = noteList(notesIn(DOC));
    check("both notes are rows", list.rows.length, 2);
    check("…numbered in reading order", list.rows.map((r) => r.chip), ["1", "2"]);
    // The row's words are the note's own, flattened. A pane listing "#הערה"
    // twice is a pane listing nothing.
    check("…and named by their prose", list.rows[0].label, "עיין שם היטב");
    check("…jumping to the prose, not the marker", list.rows[0].does.kind, "note");
    ok(
      "…and carrying the marker for the right-click menu",
      typeof list.rows[0].does.marker === "number",
    );
  }
  {
    // A marker whose body has not been written yet has no words. Naming the
    // command is the only honest thing left to show, and showing nothing is not
    // an option — a blank row is a row that looks broken.
    const list = noteList(notesIn("טקסט#הערה[]\n"));
    ok("an empty note still says what it is", list.rows[0].label.startsWith("#"), list.rows[0].label);
  }
  {
    check("a document with no notes says so", noteList([]).empty, "notesPaneEmpty");
  }

  // ------------------------------------------- the number is the note's, not the row's
  //
  // Notes are numbered **per series**. The chip was `i + 1` — the row's position
  // in a flat list — in the slot a reader takes for the note's number, so a
  // sefer whose pages numbered its notes 1, 2 in a ביאור band and א, ב in a
  // mareh-mekomos band had a drawer that said 1 to 10. The panel whose whole job
  // is *find the note you are looking at* printed an ordinal on no page.
  //
  // What it still does not do is render each series' own scheme: a stream
  // configured `מספור: "א"` counts 1, 2 here where the page prints א, ב.
  // Reproducing that would be a second implementation of numbering the engine
  // already owns. The count and the series are right; the glyph is the engine's
  // to hand back.

  {
    const doc =
      "ראשון#הערה_זרם(\"ביאור\")[ביאור־א]\n" +
      "שני#הערה_זרם(\"מקורות\")[מקור־א]\n" +
      "שלישי#הערה_זרם(\"מקורות\")[מקור־ב]\n" +
      "רביעי#הערה_זרם(\"ביאור\")[ביאור־ב]\n";
    const list = noteList(notesIn(doc), doc);
    check("four notes, four rows", list.rows.length, 4);
    check(
      "each series counts from one",
      list.rows.map((r) => r.chip),
      ["1", "1", "2", "2"],
    );
    check(
      "and every row says which series it is in",
      list.rows.map((r) => r.note),
      ["ביאור", "מקורות", "מקורות", "ביאור"],
    );
  }

  {
    // With one series there is nothing to tell apart, and a label on every row
    // repeating the only answer is noise. The ordinal is the marker here.
    const doc = "א#הערה[ראשונה]\nב#הערה[שנייה]\nג#הערה[שלישית]\n";
    const list = noteList(notesIn(doc), doc);
    check("one series still counts 1, 2, 3", list.rows.map((r) => r.chip), ["1", "2", "3"]);
    check("and says nothing about the series", list.rows.map((r) => r.note), [
      undefined,
      undefined,
      undefined,
    ]);
  }

  {
    // The four spellings that name a series, through one function. A named
    // argument, a positional stream, a command that names its stream, and a
    // tier — `channels.seriesOf` is where they meet, and a reader of this list
    // should not have to know which spelling produced which row.
    const doc =
      "א#הערה(ערוץ: \"ביאור\")[בשם]\n" +
      "ב#הערה_זרם(\"ביאור\")[במיקום]\n" +
      "ג#הערת_מקור[מקור]\n" +
      "ד#הערה[רגילה]\n";
    const list = noteList(notesIn(doc), doc);
    check(
      "one series however it was written",
      list.rows.map((r) => r.note),
      ["ביאור", "ביאור", "מקורות", "הערה"],
    );
    check("…and the two ביאור notes are 1 and 2", list.rows.slice(0, 2).map((r) => r.chip), ["1", "2"]);
  }
  {
    // "The notes drawer should expand to the whole note, and to the line the
    // note sits on." One line of a note is enough to recognise it and never
    // enough to read it.
    const long = "פתיחה#הערה[" + "מילה ".repeat(40).trim() + "] וכאן.\n\nשורה אחרת\n";
    const row = noteList(notesIn(long), long).rows[0];
    ok("the label is cut", row.label.endsWith("…"));
    notOk("…and the whole note is not", row.full.endsWith("…"));
    ok("…and is the note's own words", row.full.startsWith("מילה מילה"));
    check("the line the note sits on comes with it", row.context, "פתיחה † וכאן.");
  }
  {
    // The marker's line, not the note's — for a deferred note those are two
    // different lines, and the one worth reading is the sentence.
    const doc = "פתיחה#הערה_בשם(\"א\") וכאן.\n\n#גוף_הערה(\"א\")[דברי הערה]\n";
    const row = noteList(notesIn(doc), doc).rows[0];
    check("the sentence is the context", row.context, "פתיחה † וכאן.");
    check("and the note's own words are the expansion", row.full, "דברי הערה");
  }
  {
    // Without the document there is nothing to quote, and a row must not
    // invent one.
    const row = noteList(notesIn(DOC)).rows[0];
    check("no document, no context line", row.context, undefined);
    check("the note itself is still there", row.full, "עיין שם היטב");
  }
  {
    // A note on a line of its own: nothing but the marker, so there is no
    // sentence to show and the row says so by not offering one.
    const doc = "#הערה[לבד]\n";
    check("a line that is only the note offers no context", noteList(notesIn(doc), doc).rows[0].context, undefined);
  }

  // ----------------------------------------------------------------- the history

  {
    // The finding. The history panel took the first non-blank line **verbatim**,
    // so every snapshot of a document that opens with a title page was listed as
    // `#שער[קונטרס בעניני שבת]` — markup, in a list of versions. The notes pane
    // had been flattening its rows with `plainText` all along; the two panels
    // were asked the same question and one of them answered with the source.
    const list = historyList([{ t: 1000, body: DOC }]);
    ok(
      "a version is named by its words",
      list.rows[0].label.startsWith("קונטרס בעניני שבת פרק א"),
      list.rows[0].label,
    );
    ok("…and not by its markup", !list.rows[0].label.includes("#"), list.rows[0].label);
    check("…and carries when it was taken", list.rows[0].when, 1000);
  }
  {
    // Newest first, decided here rather than by whoever calls it — "which end is
    // the newest" is exactly the sort of thing that is right in one caller and
    // wrong in the next.
    const list = historyList([
      { t: 1, body: "ראשון" },
      { t: 2, body: "שני" },
      { t: 3, body: "שלישי" },
    ]);
    check("the newest version is first", list.rows.map((r) => r.when), [3, 2, 1]);
    // …and the index still points into the list that was passed in, not into
    // the reversed one. Restoring the wrong snapshot is a data loss.
    check(
      "…and each row still points at its own snapshot",
      list.rows.map((r) => r.does.index),
      [2, 1, 0],
    );
  }
  {
    check("no versions says so", historyList([]).empty, "noHistory");
    check("a blank version still gets a row", historyList([{ t: 1, body: "" }]).rows[0].label, "—");
  }

  // ------------------------------------------------------------------ the gist

  {
    check("markup is flattened away", gist("#הדגשה[שלום] עולם"), "שלום עולם");
    check("whitespace collapses", gist("שלום\n\n   עולם"), "שלום עולם");
    check("a short line is left alone", gist("שלום"), "שלום");
    const long = "מילה ".repeat(40);
    const cut = gist(long);
    ok("a long line is cut", cut.endsWith("…"), cut);
    ok("…to about the limit", [...cut].length <= 61, `${[...cut].length} characters`);
    // Counted in characters, not in UTF-16 units. Every nikud point is a unit of
    // its own, so a `slice(0, 42)` gives a pointed line half the words of an
    // unpointed one — and the history panel's did exactly that.
    const pointed = "בְּרֵאשִׁית ".repeat(12);
    const plain = "בראשית ".repeat(12);
    check(
      "nikud does not count as words",
      gist(pointed).split(" ").length,
      gist(plain).split(" ").length,
    );
  }

  // ------------------------------------------------------------------ the palette

  const action = (id, label = id, key = "") => ({ id, label, key });
  const command = (name, extra = {}) => ({
    name,
    insert: `#${name}[|]`,
    from: "registry",
    category: "style",
    desc_he: name + " בעברית",
    desc_en: name + " in English",
    ...extra,
  });

  {
    const list = paletteList([action("save", "שמור")], [command("הדגשה")], "", "he");
    // Operations first. They are what the word "command" means to somebody who
    // opened this looking for one, and they are the half that was missing.
    check("operations come first", list.rows[0].does, { kind: "action", id: "save" });
    check("…then the commands", list.rows[1].does.kind, "insert");
    check("an operation row is labelled by its name", list.rows[0].label, "שמור");
    check("a command row is labelled by its description", list.rows[1].label, "הדגשה בעברית");
    check("…in the interface's language", paletteList([], [command("הדגשה")], "", "en").rows[0].label, "הדגשה in English");
  }
  {
    // A user-defined command says where it came from instead of a category —
    // *this document's* or *yours*, which is the distinction that matters when
    // both exist and the compiler runs one of them.
    const mine = command("שלי", { from: "yours", category: "", desc_he: undefined, desc_en: undefined });
    const theirs = command("שלהם", { from: "document", category: "", desc_he: undefined, desc_en: undefined });
    check("yours says so", paletteList([], [mine], "", "he").rows[0].chip, "fromYou");
    check("the document's says so", paletteList([], [theirs], "", "he").rows[0].chip, "fromDocument");
    check("…and is named by itself", paletteList([], [mine], "", "he").rows[0].label, "שלי");
  }
  {
    const acts = [action("save", "שמור"), action("open", "פתח")];
    const cmds = [command("הדגשה"), command("נטוי")];
    check("a query filters operations", paletteList(acts, cmds, "שמור", "he").rows.length, 1);
    check("…and commands", paletteList(acts, cmds, "נטוי", "he").rows.map((r) => r.label), [
      "נטוי בעברית",
    ]);
    ok("…and an operation matches by its id too", paletteList(acts, [], "open", "he").rows.length === 1);
  }
  {
    // **The finding.** A query nothing matches produced a blank rectangle — from
    // the one surface in this application whose entire job is finding things.
    const list = paletteList([action("save")], [command("הדגשה")], "zzzz", "he");
    check("nothing matched is said out loud", list.empty, "paletteNothing");
    check("…and nothing is listed", list.rows, []);
  }
  {
    // **The other finding.** The caps are 30 and 60 and they were applied in
    // silence: an empty query listed 60 of the registry's 115 commands and said
    // nothing at all, which is a list that reads as *all of them*.
    const many = Array.from({ length: PALETTE_COMMANDS + 7 }, (_, i) => command("פקודה" + i));
    const list = paletteList([], many, "", "he");
    check("the cap still caps", list.rows.length, PALETTE_COMMANDS);
    check("…and says how many it left out", list.hidden, 7);
    check("…and a list that fits hides nothing", paletteList([], many.slice(0, 3), "", "he").hidden, 0);
  }

  // ---------------------------------------------- the commands drawer
  //
  // The inventory's reader could not reach the registry from any of the four
  // surfaces that advertise it, and asked for a drawer holding every command,
  // searchable and grouped, instead. The two properties that make it *not* the
  // palette again are that it is grouped and that nothing is capped.
  {
    const cmds = [
      command("הדגשה", { category: "style", en: "bold" }),
      command("נטוי", { category: "style", en: "italic" }),
      command("הערה", { category: "footnote", en: "fnote" }),
      command("שלי", { from: "yours", category: "", desc_he: undefined, desc_en: undefined }),
    ];
    const { groups, empty, shown } = commandGroups(cmds, { bold: "Mod-b" }, "", "he", "default");
    check("nothing is left out", shown, 4);
    check("the groups are the registry's categories", groups.map((g) => g.title), [
      "cat.style",
      "cat.footnote",
      "fromYou",
    ]);
    check("in the order the commands arrived", groups[0].rows.map((r) => r.id), ["הדגשה", "נטוי"]);
    check("a row inserts its command", groups[0].rows[0].does, {
      kind: "insert",
      snippet: "#הדגשה[|]",
    });
    // **The shortcut, at last.** `#הדגשה` has answered to Ctrl+B since the
    // beginning and no surface listing commands has ever said so.
    check("a command with a key prints it", groups[0].rows[0].note, "Ctrl+B");
    check("…and one without prints nothing", groups[0].rows[1].note, undefined);
    check("a rebound key is the one shown", commandGroups(cmds, { bold: "F9" }, "", "he", "default").groups[0].rows[0].note, "F9");
    // Under a mode that chord is not installed at all — `buildShortcutKeymap`
    // returns nothing — so printing it would be this list telling a writer to
    // press a key that does nothing. What it prints instead is the way in.
    check(
      "under Emacs the row names the command, not the dead chord",
      commandGroups(cmds, { bold: "Mod-b" }, "", "he", "emacs").groups[0].rows[0].note,
      "M-x bold",
    );
    check(
      "…and under Vim it is the ex command",
      commandGroups(cmds, { bold: "Mod-b" }, "", "he", "vim").groups[0].rows[0].note,
      ":bold",
    );
    check(
      "a command with no action of its own still says nothing",
      commandGroups(cmds, {}, "", "he", "emacs").groups[2].rows[0].note,
      undefined,
    );
    check("a row names the command in both languages", groups[0].rows[0].trailing, "#הדגשה · bold");
    check("nothing is said about a cap", empty, null);
  }
  {
    const cmds = [command("הדגשה"), command("נטוי")];
    check("a query filters", commandGroups(cmds, {}, "נטוי", "he", "default").shown, 1);
    check("…and empty groups do not appear", commandGroups(cmds, {}, "נטוי", "he", "default").groups.length, 1);
    const none = commandGroups(cmds, {}, "zzzz", "he", "default");
    check("nothing matched is said out loud", none.empty, "paletteNothing");
    check("…and no group is drawn", none.groups, []);
  }
  {
    // No cap, and this is the point of the surface: an inventory that stops at
    // sixty is the failure the palette's `hidden` count exists to confess to.
    const many = Array.from({ length: PALETTE_COMMANDS + 40 }, (_, i) => command("פקודה" + i));
    check("every command is listed", commandGroups(many, {}, "", "he", "default").shown, many.length);
  }
}
