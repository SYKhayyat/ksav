// Reading and writing the document's own `#הגדרות_*` styling commands.
//
// The property that matters most here is the conservative one: a `#הגדרות_*`
// call is Typst source and may contain anything, and the panel understands only
// a specific set of keys. Opening the panel must never silently discard styling
// a writer typed by hand — so every key the UI does not recognise has to survive
// a write untouched.

import { check, ok } from "./harness.mjs";
import * as styles from "../.tmp-test/styles.mjs";

export async function run() {
  // ------------------------------------------------------------ finding
  {
    const doc = '#הגדרות_כותרות(מספור: "1.1", קו: true)\n#כותרת1[פרק]';
    const call = styles.findStyleCall(doc, "headings");
    ok("the call is found", !!call);
    check("its arguments are read", [...call.args.keys()], ["מספור", "קו"]);
    check("values keep their source form", call.args.get("מספור"), '"1.1"');
    check("the range covers the whole call", doc.slice(call.from, call.to), '#הגדרות_כותרות(מספור: "1.1", קו: true)');
    check("a document without one says so", styles.findStyleCall("סתם", "headings"), null);
  }

  {
    // Nested parens and brackets inside a value must not end the argument early.
    const doc = "#הגדרות_רשימות(סמן: ([◆], [–]), הזחה: 1.5em)";
    const args = styles.findStyleCall(doc, "lists").args;
    check("a nested value is read whole", args.get("סמן"), "([◆], [–])");
    check("…and the argument after it is still found", args.get("הזחה"), "1.5em");
  }

  {
    // A comma inside a string is not an argument separator.
    const args = styles.findStyleCall('#הגדרות_טבלאות(כותרת: "א, ב", פסים: true)', "tables").args;
    check("a comma inside a string does not split arguments", args.get("כותרת"), '"א, ב"');
    check("…and the next argument survives", args.get("פסים"), "true");
  }

  {
    // An unbalanced call is left alone rather than half-parsed.
    check("an unbalanced call is not claimed", styles.findStyleCall("#הגדרות_כותרות(קו: true", "headings"), null);
  }

  {
    // English aliases resolve to the same command.
    ok("English aliases are found", !!styles.findStyleCall('#headings_config(מספור: "1.")', "headings"));
  }

  // ------------------------------------------------------------ writing
  {
    const doc = "#כותרת1[פרק]";
    const out = styles.setStyleArgs(doc, "headings", { קו: "true" });
    check("a new call goes at the very top", out, "#הגדרות_כותרות(קו: true)\n#כותרת1[פרק]");
  }

  {
    // The conservative property, stated as plainly as it can be.
    const doc = '#הגדרות_כותרות(מספור: "1.1", גודל: (2em, 1.4em), משהו_שלי: 42)\nגוף';
    const out = styles.setStyleArgs(doc, "headings", { קו: "true" });
    const args = styles.findStyleCall(out, "headings").args;
    check("an unrecognised argument survives a write", args.get("משהו_שלי"), "42");
    check("…as does one the UI does expose", args.get("גודל"), "(2em, 1.4em)");
    check("…and the new one is there", args.get("קו"), "true");
    check("the body is untouched", out.endsWith("\nגוף"), true);
  }

  {
    const doc = '#הגדרות_כותרות(מספור: "1.1", קו: true)\nגוף';
    const out = styles.setStyleArgs(doc, "headings", { קו: null });
    check("null removes one argument", styles.findStyleCall(out, "headings").args.has("קו"), false);
    check("…and keeps the rest", styles.findStyleCall(out, "headings").args.get("מספור"), '"1.1"');
  }

  {
    // Removing the last argument removes the call, rather than leaving an empty
    // one sitting at the top of the document doing nothing.
    const doc = "#הגדרות_כותרות(קו: true)\n\nגוף";
    const out = styles.setStyleArgs(doc, "headings", { קו: null });
    check("the empty call is removed entirely", styles.findStyleCall(out, "headings"), null);
    check("…without leaving a run of blank lines", /\n{3,}/.test(out), false);
  }

  {
    check(
      "writing nothing to a document that has nothing changes nothing",
      styles.setStyleArgs("גוף", "headings", { קו: null }),
      "גוף",
    );
  }

  {
    // Round trip: write, read, get back what was written.
    let doc = "גוף";
    doc = styles.setStyleArgs(doc, "tables", { פסים: "true", מרווח: "10pt" });
    doc = styles.setStyleArgs(doc, "review", { תצוגה: styles.typstString("סופי") });
    check("two different commands coexist", !!styles.findStyleCall(doc, "tables") && !!styles.findStyleCall(doc, "review"), true);
    check("…and each reads back", styles.readString(styles.findStyleCall(doc, "review").args.get("תצוגה")), "סופי");
    check("…including the other's", styles.readLength(styles.findStyleCall(doc, "tables").args.get("מרווח"), "pt"), 10);
  }

  // ------------------------------------------------------------ value coding
  {
    check("a string is quoted", styles.typstString("א"), '"א"');
    check("a quote inside is escaped", styles.typstString('a"b'), '"a\\"b"');
    check("a backslash is escaped first", styles.typstString("a\\"), '"a\\\\"');
    check("…and survives the round trip", styles.readString(styles.typstString("a\\")), "a\\");
    check("…as does a quote", styles.readString(styles.typstString('a"b')), 'a"b');

    check("booleans", [styles.typstBool(true), styles.typstBool(false)], ["true", "false"]);
    check("readBool reads them back", [styles.readBool("true"), styles.readBool("false")], [true, false]);
    check("readBool refuses anything else", styles.readBool("maybe"), null);
    check("readBool on nothing is null", styles.readBool(undefined), null);

    check("a colour round-trips", styles.readColor(styles.typstColor("#b91c1c")), "#b91c1c");
    check("a luma is read as grey", styles.readColor("luma(40)"), "#282828");
    check("an out-of-range luma is clamped", styles.readColor("luma(999)"), "#ffffff");
    check("a non-colour is null", styles.readColor("something"), null);

    check("a length is read", styles.readLength("1.5em", "em"), 1.5);
    check("a negative length is read", styles.readLength("-2pt", "pt"), -2);
    check("the wrong unit is refused", styles.readLength("1.5em", "pt"), null);
    check("a bare number is refused", styles.readLength("1.5", "em"), null);
  }
}
