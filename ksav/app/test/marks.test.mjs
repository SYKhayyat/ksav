// The mark register, from the editor's side.
//
// A semantic mark says what a piece of text *is*. Until the register existed the
// only thing separating `#דיבור_המתחיל` from typing bold by hand was a name in
// the source — *"if not, it is just bold"* — and the third of the three things
// asked for was *"see just these in some list somewhere"*, which is a question
// about the file rather than about the print and therefore this module's.
//
// What is worth testing here is precisely what a regular expression over
// `#name[…]` would get wrong: a command name inside a string, inside a comment,
// inside a raw block, and a named argument mistaken for the mark's own words.

import { check, notOk, ok } from "./harness.mjs";
import * as marks from "../.tmp-test/marks.mjs";
import * as panelrows from "../.tmp-test/panelrows.mjs";
import { hasKey } from "../.tmp-test/i18n.mjs";

const found = (doc) => marks.marksIn(doc).map((m) => [m.cls, m.text]);

export async function run() {
  // ---------------------------------------------------------------- the classes
  {
    // Styled and collected are two registers, and they no longer nest. They did
    // while *having a look* and *being in an index* happened to coincide; the
    // rule that every separate command has its own look separates them, and the
    // claim worth holding is that each list is exactly what the prelude says —
    // which `enginefacts.test.mjs` does against `_mk_defaults` and `_mk_titles`.
    // What is asserted here is that neither list is empty and neither has a
    // duplicate, because a class listed twice is a chooser with two identical
    // rows and nothing else would notice.
    ok("both registers are populated", marks.STYLED_CLASSES.length > 5 && marks.MARK_CLASSES.length > 5);
    for (const [what, list] of [
      ["styled", marks.STYLED_CLASSES],
      ["collected", marks.MARK_CLASSES],
    ]) {
      check(`no class is ${what} twice`, [...list].filter((c, i) => list.indexOf(c) !== i), []);
    }
    // The two directions the split actually has, named. Both used to be
    // impossible: every styled class was collected and two collected classes
    // were unstyleable, which is the arrangement the rule replaced.
    ok(
      "a seif has a look and is in no index",
      marks.STYLED_CLASSES.includes("סעיף") && !marks.MARK_CLASSES.includes("סעיף"),
    );
    ok(
      "a siman has both",
      marks.STYLED_CLASSES.includes("סימן") && marks.MARK_CLASSES.includes("סימן"),
    );
    // Every class needs a name a reader can see, in both languages. A class with
    // no key would show its own Hebrew identifier in an English interface —
    // and *both* registers are shown: the marks pane lists the collected ones,
    // the Styles drawer's chooser offers the styled ones, and a class in one and
    // not the other is exactly what the rule about separate commands produced.
    const shown = [...new Set([...marks.MARK_CLASSES, ...marks.STYLED_CLASSES])];
    const missing = shown.filter((c) => !hasKey("markClass." + c));
    check("every class has a name in both languages", missing, []);
  }

  // ----------------------------------------------------------- finding the marks
  {
    const doc = "דבר #ציון[רמב״ם] ועוד #דיבור_המתחיל[ותנא קמא] סוף.";
    check("both marks are found, in reading order", found(doc), [
      ["ציון", "רמב״ם"],
      ["דיבור_המתחיל", "ותנא קמא"],
    ]);
  }

  {
    // Two positional arguments are two halves of one reference.
    check("a two-part mark reads as one entry", found('#גמרא("ברכות", "ב.")'), [["גמרא", "ברכות ב."]]);
    check("…written with brackets too", found("#גמרא[ברכות][ב.]"), [["גמרא", "ברכות ב."]]);
  }

  {
    // The English spelling is the same mark and files under the same class, or the
    // marks pane is empty on exactly the documents the English half produced.
    check("an English alias is the same class", found("#dh[Lemma] and #refmark[Rambam]"), [
      ["דיבור_המתחיל", "Lemma"],
      ["ציון", "Rambam"],
    ]);
  }

  {
    // A named argument is styling, not the mark's words. A row reading `red רמב״ם`
    // would be showing the writer their own configuration.
    check("named arguments are not the mark's words", found("#ציון(צבע: red)[רמב״ם]"), [
      ["ציון", "רמב״ם"],
    ]);
    check("…including the register's own two switches", found("#ציון(פטור: true, ברשימה: false)[רמב״ם]"), [
      ["ציון", "רמב״ם"],
    ]);
  }

  {
    // The one that a regular expression cannot do, and the reason this goes
    // through the scanner: a command name is only a command where markup is read.
    check("a name inside a string is not a mark", found('#ציון_מקור("#ציון בגמרא")'), [
      ["ציון_מקור", "#ציון בגמרא"],
    ]);
    check("a name in a comment is not a mark", found("// #ציון[לא]\nגוף."), []);
    // A raw block is **not** asserted here, and that is a defect rather than a
    // design: `scan` does not skip raw at all — inline or fenced — so every
    // consumer of it, this module included, reads a command inside backticks as a
    // call. One scanner, a fixture of 3,213 documents behind it, and a dozen
    // surfaces downstream, so it is recorded as its own piece of work rather than
    // patched here for one caller.
  }

  {
    // A mark with no words yet is what the Insert menu writes before the writer
    // types. It is still a mark and still has to be findable — that is the state a
    // writer is most likely to be looking for the list in.
    check("an empty mark is found with no words", found("#גמרא[][]"), [["גמרא", ""]]);
  }

  {
    const doc = "#סימן[א׳][דיני תפילין]\n\nגוף #ציון[רמב״ם].";
    check("a heading mark registers like the rest", found(doc), [
      ["סימן", "א׳ דיני תפילין"],
      ["ציון", "רמב״ם"],
    ]);
    check("the classes present are in the register's order", marks.classesIn(doc), ["ציון", "סימן"]);
    check("a document with no marks has no classes", marks.classesIn("סתם טקסט"), []);
  }

  {
    // Where each row jumps to is the `#`, so a click puts the caret on the command
    // and not in the middle of its words.
    const doc = "פתיחה #ציון[רמב״ם] סוף";
    const m = marks.marksIn(doc)[0];
    check("a mark points at its own hash", doc.slice(m.from, m.from + 1), "#");
    check("…and ends past its arguments", doc.slice(m.from, m.to), "#ציון[רמב״ם]");
  }

  // ---------------------------------------------------------------- the rows
  {
    const doc = "#ציון[א] #ציון[ב] #דיבור_המתחיל[ג]";
    const list = panelrows.markList(marks.marksIn(doc), marks.MARK_CLASSES);
    check(
      "grouped by class, in the register's order",
      list.rows.map((r) => [r.indent, r.label, r.chip ?? ""]),
      [
        [0, "ציון", "2"],
        [1, "א", ""],
        [1, "ב", ""],
        [0, "דיבור_המתחיל", "1"],
        [1, "ג", ""],
      ],
    );
    check("nothing is hidden", list.hidden, 0);
    check("and there is no empty state to show", list.empty, null);
  }

  {
    // The count is on the class row, which is the answer to the question a writer
    // opened the list with. Without it the pane says "here they are" and leaves
    // the counting to the reader.
    const list = panelrows.markList(marks.marksIn("#ציון[א] #ציון[ב] #ציון[ג]"), marks.MARK_CLASSES);
    check("the class row carries the count", list.rows[0].chip, "3");
  }

  {
    const empty = panelrows.markList([], marks.MARK_CLASSES);
    check("an empty document says so rather than showing a blank", empty.empty, "marksPaneEmpty");
    check("…with no rows", empty.rows, []);
    ok("and the empty state is a real key", hasKey("marksPaneEmpty"));
  }

  {
    // A class the caller does not ask for is not printed, which is what makes a
    // filtered list possible without a second row builder.
    const list = panelrows.markList(marks.marksIn("#ציון[א] #דיבור_המתחיל[ב]"), ["דיבור_המתחיל"]);
    check("only the asked-for class is listed", list.rows.map((r) => r.label), ["דיבור_המתחיל", "ב"]);
  }

  {
    // A mark with no words falls back to naming its command, the way a note with
    // no body does in the notes pane. Blank rows in a list of clickable things are
    // rows nobody can tell apart.
    const list = panelrows.markList(marks.marksIn("#גמרא[][]"), marks.MARK_CLASSES);
    check("an empty mark is labelled by its command", list.rows[1].label, "#גמרא");
    notOk("and carries no full text", list.rows[1].full);
  }

  {
    // What the Styles drawer may offer for one class. A door stops the compile
    // on a knob its class has no answer for, so this is not a tidiness question:
    // a panel that offers a fill on a gemara reference writes a document that
    // does not compile. The shared command it replaced could not refuse one — it
    // stored the fill and never read it, which is the same failure quieter.
    ok("a block command answers to the block knobs", marks.knobsOf("תיבה").includes("גוון"));
    notOk("a run of text does not", marks.knobsOf("גמרא").includes("גוון"));
    for (const cls of marks.STYLED_CLASSES) {
      // …except a rule, which prints no glyphs: a size on a line is a control
      // with nothing behind it, and the prelude refuses one by name.
      if (marks.RULE_CLASSES.includes(cls)) continue;
      ok(cls + " answers to a size", marks.knobsOf(cls).includes("גודל"));
    }
    check("a rule answers to four knobs of its own", [...marks.knobsOf("קו_מפריד")], [
      "עובי",
      "צבע",
      "רוחב",
      "יישור",
    ]);
    notOk("…and to no text knob", marks.knobsOf("קו_מפריד").includes("משקל"));
    // The two switches are a mark's own and never a class's: a class that exempts
    // itself from its own styling is a class with no styling.
    for (const cls of marks.STYLED_CLASSES) {
      notOk(cls + " has no exemption of its own", marks.knobsOf(cls).includes("פטור"));
    }
  }

  {
    // Every part the panel offers has a label in both languages, and only the
    // parts that print words the command invents are offered a text of their own.
    for (const [cls, parts] of Object.entries(marks.CLASS_PARTS)) {
      for (const part of parts) {
        ok("the part " + cls + "." + part + " is named", hasKey("markPart." + cls + "." + part));
      }
    }
    check("a siman invents two of its four pieces", [...marks.PART_TEXT["סימן"]], ["קידומת", "מפריד"]);
    for (const cls of Object.keys(marks.PART_TEXT)) {
      for (const part of marks.PART_TEXT[cls]) {
        ok(part + " is a part of " + cls, marks.CLASS_PARTS[cls].includes(part));
      }
    }
  }
}
