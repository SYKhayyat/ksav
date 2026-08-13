// Reading and writing the document's own `#הגדרות_*` styling commands.
//
// The property that matters most here is the conservative one: a `#הגדרות_*`
// call is Typst source and may contain anything, and the panel understands only
// a specific set of keys. Opening the panel must never silently discard styling
// a writer typed by hand — so every key the UI does not recognise has to survive
// a write untouched.

import { check, notOk, ok } from "./harness.mjs";
import * as styles from "../.tmp-test/styles.mjs";
import { hasKey } from "../.tmp-test/i18n.mjs";
import { readFile } from "node:fs/promises";

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

  // ------------------------------------------------------------ the language it is written in
  //
  // The panel speaks Hebrew internally. Writing that straight out turned an
  // English document Hebrew the moment a writer clicked a control:
  // `#headings_config(numbering: "1.1")` came back as
  // `#הגדרות_כותרות(מספור: "1.1")` — still correct Typst, since both are
  // accepted, and still not the document they were writing.
  {
    const en = `#headings_config(numbering: "1.1", indent: 1em)

Body`;
    const call = styles.findStyleCall(en, "headings");
    check("an English call is recognised", call.lang, "en");
    check("…and its keys are read in the panel's own vocabulary",
      [...call.args.keys()], ["מספור", "הזחה"]);

    const after = styles.setStyleArgs(en, "headings", { "יישור": "center" });
    ok("a rewrite keeps the English command", after.includes("#headings_config("));
    ok("…writes the new argument in English", after.includes("align: center"));
    ok("…keeps the existing ones in English", after.includes('numbering: "1.1"'));
    ok("…and adds no Hebrew", !/[א-ת]/.test(after.split("\n")[0]));
  }

  {
    // A Hebrew document is untouched by any of this.
    const he = `#הגדרות_כותרות(מספור: "1.1")

גוף`;
    const after = styles.setStyleArgs(he, "headings", { "יישור": "center" });
    ok("a Hebrew call stays Hebrew", after.includes("#הגדרות_כותרות(מספור: \"1.1\", יישור: center)"));
  }

  {
    // A brand-new call follows the document being written, not the panel.
    const fresh = styles.setStyleArgs("Body text", "lists", { "סמן": "([-])" }, "en");
    ok("a new call in an English document is English", fresh.startsWith("#lists_config(marker:"));
    const heFresh = styles.setStyleArgs("גוף", "lists", { "סמן": "([-])" }, "he");
    ok("…and in a Hebrew one, Hebrew", heFresh.startsWith("#הגדרות_רשימות(סמן:"));
    ok("…with Hebrew the default when nothing says otherwise",
      styles.setStyleArgs("x", "lists", { "סמן": "([-])" }).startsWith("#הגדרות_רשימות("));
  }

  {
    // The conservative property, across languages: a key the panel knows nothing
    // about survives a write under exactly the name it had.
    const en = `#tables_config(striped: true, מרווח_מיוחד: 3pt)

Body`;
    const after = styles.setStyleArgs(en, "tables", { "צבע_כותרת": "luma(235)" });
    ok("an unknown key survives verbatim", after.includes("מרווח_מיוחד: 3pt"));
    ok("…alongside the new one in English", after.includes("header_fill: luma(235)"));
  }

  // ------------------------------------------------ the per-instance layer
  //
  // "Global by default, per-instance by override": the document's `#הגדרות_*` sets
  // the default, one element's own named arguments overrule it, and `כפה` on the
  // default overrules them back. The engine resolves all three — `engine/tests/
  // overrides.rs` reads the resolution off the rendered page — and this half is
  // what lets a control write the middle one.

  {
    const doc = "פתיחה\n\n#רשימה(פריט[א], פריט[ב])\n";
    const at = doc.indexOf("פריט");
    const inst = styles.findInstance(doc, "lists", at);
    ok("the list the caret is in is found", !!inst);
    check("…by name", inst.name, "רשימה");
    check("…and it carries no settings of its own yet", [...inst.args.keys()], []);
    check("a caret in the prose is inside nothing", styles.findInstance(doc, "lists", 2), null);
    check("…and there is no heading here either", styles.findInstance(doc, "headings", at), null);
  }

  {
    // Innermost, because a note inside a heading is both at once and a control has
    // to act on the one the caret is actually in.
    const doc = "#כותרת1[פרק#הערה[הערה קטנה]]\n";
    const at = doc.indexOf("קטנה");
    check("the note wins over the heading around it", styles.findInstance(doc, "notes", at).name, "הערה");
    check("…and the heading is still there when asked for", styles.findInstance(doc, "headings", at).name, "כותרת1");
  }

  {
    // Both spellings, because a document may be written in either and a control
    // that sees only one stops working in English.
    const doc = "#bullets(item[a])\n";
    check("an English list is a list", styles.findInstance(doc, "lists", 10).name, "bullets");
  }

  {
    // A command with no style of its own has no instance layer to write on.
    check("emphasis is not a styleable element", styles.findInstance("#הדגשה[חזק]\n", "lists", 8), null);
  }

  // -------------------------------------- writing one element's own settings

  {
    // **The property that matters most here.** A list is written across lines,
    // with a trailing comma, in the writer's own formatting. Adding a setting must
    // add a setting — not reflow the call, which is what rebuilding the argument
    // list from parsed pieces would do the first time anybody ticked a box.
    const doc = "#רשימה(\n  פריט[א],\n  פריט[ב],\n)\n";
    const inst = styles.findInstance(doc, "lists", doc.indexOf("א"));
    check(
      "the setting goes in and the items stay exactly where they were",
      styles.setInstanceArgs(doc, inst, { סמן: "[◆]" }),
      "#רשימה(סמן: [◆], \n  פריט[א],\n  פריט[ב],\n)\n",
    );
  }

  {
    const doc = "#רשימה(סמן: [◆], פריט[א])\n";
    const inst = () => styles.findInstance(doc, "lists", doc.indexOf("א"));
    check(
      "an existing setting is replaced in place",
      styles.setInstanceArgs(doc, inst(), { סמן: "[–]" }),
      "#רשימה(סמן: [–], פריט[א])\n",
    );
    check(
      "…and cleared with its comma, rather than leaving `(, `",
      styles.setInstanceArgs(doc, inst(), { סמן: null }),
      "#רשימה(פריט[א])\n",
    );
  }

  {
    const doc = "#כותרת1[פרק]\n";
    const inst = styles.findInstance(doc, "headings", 8);
    check(
      "a call with no argument list grows one, keeping its body",
      styles.setInstanceArgs(doc, inst, { גודל: "2em" }),
      "#כותרת1(גודל: 2em)[פרק]\n",
    );
  }

  {
    // Two at once, computed against the document as passed: an earlier edit that
    // shifted a later one's offsets would corrupt the call.
    const doc = "#כותרת1(גודל: 2em)[פרק]\n";
    const inst = styles.findInstance(doc, "headings", doc.indexOf("פרק"));
    check(
      "two settings in one write",
      styles.setInstanceArgs(doc, inst, { גודל: "3em", קו: "true" }),
      "#כותרת1(קו: true, גודל: 3em)[פרק]\n",
    );
  }

  {
    // The document's own language wins, the same way it does for the global call:
    // a control must not turn an English document Hebrew.
    const doc = "#h1(size: 2em)[Chapter]\n";
    const inst = styles.findInstance(doc, "headings", doc.indexOf("Chapter"));
    check("an English argument reads as its Hebrew key", inst.args.get("גודל"), "2em");
    check(
      "…and a new one is written in English",
      styles.setInstanceArgs(doc, inst, { צבע: 'rgb("#b91c1c")' }),
      '#h1(colour: rgb("#b91c1c"), size: 2em)[Chapter]\n',
    );
  }

  {
    // The conservative property, on this layer too.
    const doc = "#טבלה(עמודות: 3, מרווח_מיוחד: 3pt, תא[א])\n";
    const inst = styles.findInstance(doc, "tables", doc.indexOf("תא"));
    const after = styles.setInstanceArgs(doc, inst, { פסים: "true" });
    ok("an unknown argument survives", after.includes("מרווח_מיוחד: 3pt"));
    ok("…and so does the column count", after.includes("עמודות: 3"));
  }

  // ---------------------------------------------------- the overrule switch

  {
    notOk("a document with no styling is not overruling", styles.isOverruled("גוף", "lists"));
    notOk(
      "…nor is one that merely carries a setting",
      styles.isOverruled("#הגדרות_רשימות(סמן: [◆])", "lists"),
    );
    ok("…and one that says so, is", styles.isOverruled("#הגדרות_רשימות(סמן: [◆], כפה: true)", "lists"));
    ok("…in English too", styles.isOverruled("#lists_config(marker: [◆], force: true)", "lists"));
    check(
      "the switch is written like any other setting",
      styles.setStyleArgs("גוף", "lists", { [styles.OVERRULE]: "true" }),
      "#הגדרות_רשימות(כפה: true)\nגוף",
    );
    check(
      "…and in an English document it is `force`",
      styles.setStyleArgs("#lists_config(marker: [◆])", "lists", { [styles.OVERRULE]: "true" }),
      "#lists_config(marker: [◆], force: true)",
    );
  }

  {
    // Every knob the panel offers per element has a control and a name, because
    // the list and the controls are one table. The other direction — that the set
    // is what the *engine* accepts — is `enginefacts.test.mjs`, reading the prelude.
    for (const [kind, fields] of Object.entries(styles.INSTANCE_FIELDS)) {
      check(
        `every ${kind} knob offered per element has a control and a name`,
        Object.values(fields).filter((f) => !f.kind || !f.label),
        [],
      );
    }
    check(
      "…and the key list is that same table rather than a second one",
      [...styles.INSTANCE_KEYS.notes],
      Object.keys(styles.INSTANCE_FIELDS.notes),
    );
    // A label is an i18n key, and a key with no entry renders as the key: a row
    // reading `knobStripeColour` is a control nobody can identify, in the panel
    // whose last finding was a drawer titled "untitled".
    const nameless = [];
    for (const [kind, fields] of Object.entries(styles.INSTANCE_FIELDS)) {
      for (const [key, f] of Object.entries(fields)) {
        if (!hasKey(f.label)) nameless.push(`${kind}.${key} → ${f.label}`);
      }
    }
    check("every knob's label is a translated name and not a key", nameless, []);
  }

  // -------------------------------------- every argument this panel writes, in English
  {
    // The gap that was live: eight knobs the panel already wrote had no English
    // spelling here, so a control pressed on an English document put a Hebrew
    // argument name on an English command. Legal Typst; not the writer's document.
    //
    // The prelude is the authority — `_en_params` in `engine/typst/ksav.typ` — so
    // the fence reads it rather than restating it. Two failures are caught: a key
    // with no spelling at all, and one spelt differently from the engine's, which
    // would write an argument the compiler then refuses.
    const prelude = await readFile(
      new URL("../../engine/typst/ksav.typ", import.meta.url),
      "utf8",
    );
    const at = prelude.indexOf("#let _en_params = (");
    ok("the prelude declares _en_params", at >= 0);
    const block = prelude.slice(at, prelude.indexOf("\n)", at));
    // A set per Hebrew key, not one name: two English spellings map to `צבע`
    // (`colour` and `color`, and the prelude means both), so the question is
    // whether the panel writes *one the engine reads* rather than one particular
    // one.
    const enParams = new Map();
    for (const m of block.matchAll(/([A-Za-z_][A-Za-z0-9_]*):\s*"([^"]+)"/gu)) {
      if (!enParams.has(m[2])) enParams.set(m[2], new Set());
      enParams.get(m[2]).add(m[1]);
    }
    const wrong = new Set();
    for (const fields of Object.values(styles.INSTANCE_FIELDS)) {
      for (const key of Object.keys(fields)) {
        const want = enParams.get(key);
        const got = styles.englishArg(key);
        if (!want) wrong.add(`${key}: the prelude has no English name for it`);
        else if (!got) wrong.add(`${key}: the panel has no English name for it`);
        else if (!want.has(got)) wrong.add(`${key}: panel writes ${got}, engine reads ${[...want]}`);
      }
    }
    check("every knob the panel writes has the engine's own English name", [...wrong], []);
  }

  // ------------------------------------------------ a knob keyed by mark class
  {
    // The mark register's globals are knob-major: one dictionary per knob, keyed by
    // class. A **plain value** instead of a dictionary is the answer for every
    // class, and that second shape is the one a scalar-blind reader gets wrong.
    check("a class reads its own entry", styles.classValue('("ציון": 0.8em)', "ציון"), "0.8em");
    check("…and nothing when the dictionary does not mention it", styles.classValue('("ציון": 0.8em)', "גמרא"), undefined);
    check("a scalar is every class's answer", styles.classValue("0.8em", "גמרא"), "0.8em");
    check("an absent argument is nobody's", styles.classValue(undefined, "גמרא"), undefined);
    // Typst writes a dictionary key either way, and only one of them used to read.
    check("an unquoted key is the same key", styles.classValue("(ציון: 0.8em)", "ציון"), "0.8em");
  }

  {
    const CLASSES = ["ציון", "גמרא", "דיבור_המתחיל"];
    check(
      "setting one class writes a dictionary",
      styles.withClassKey(undefined, "ציון", "0.8em", CLASSES),
      '("ציון": 0.8em)',
    );
    check(
      "…and leaves the classes already in it alone",
      styles.withClassKey('("גמרא": 1em)', "ציון", "0.8em", CLASSES),
      '("גמרא": 1em, "ציון": 0.8em)',
    );
    // The `withTier` reasoning, one shape along: a document that said `גודל: 0.9em`
    // said it for every class, and setting one of them must not quietly restyle the
    // other two back to their shipped sizes.
    check(
      "a scalar becomes a dictionary that keeps what the scalar said",
      styles.withClassKey("0.9em", "ציון", "0.8em", CLASSES),
      '("גמרא": 0.9em, "דיבור_המתחיל": 0.9em, "ציון": 0.8em)',
    );
    check(
      "clearing the last class clears the argument",
      styles.withClassKey('("ציון": 0.8em)', "ציון", null, CLASSES),
      null,
    );
    check(
      "…and clearing one of two leaves the other",
      styles.withClassKey('("ציון": 0.8em, "גמרא": 1em)', "ציון", null, CLASSES),
      '("גמרא": 1em)',
    );
  }

  {
    // The section is the eighth, and it is the same machinery: one `#הגדרות_*` call
    // read and written, in either language.
    check(
      "the marks global is found in Hebrew",
      styles.findStyleCall('#הגדרות_סימונים(גודל: ("ציון": 0.8em))', "marks").args.get("גודל"),
      '("ציון": 0.8em)',
    );
    const en = styles.findStyleCall('#marks_config(size: ("refmark": 0.8em))', "marks");
    check("…and in English, under the Hebrew key", en.args.get("גודל"), '("refmark": 0.8em)');
    check("…keeping the language it was written in", en.lang, "en");
    check(
      "a new marks setting is written in the document's language",
      styles.setStyleArgs("Body", "marks", { גודל: '("refmark": 0.8em)' }, "en"),
      '#marks_config(size: ("refmark": 0.8em))\nBody',
    );
  }

  {
    // One mark's own arguments, which is the per-instance layer for a set rather
    // than for a kind — and the two switches that are not a look at all.
    const doc = "פתיחה #ציון[רמב״ם] סוף";
    const inst = styles.findInstance(doc, "marks", doc.indexOf("רמב״ם"));
    ok("the mark under the caret is found", !!inst);
    check("its class is the command", inst.name, "ציון");
    check(
      "an exemption is written on the mark itself",
      styles.setInstanceArgs(doc, inst, { פטור: "true" }),
      "פתיחה #ציון(פטור: true)[רמב״ם] סוף",
    );
    const enDoc = "Body #refmark[Rambam] end";
    const enInst = styles.findInstance(enDoc, "marks", enDoc.indexOf("Rambam"));
    check(
      "…and in English it is `exempt`",
      styles.setInstanceArgs(enDoc, enInst, { פטור: "true" }),
      "Body #refmark(exempt: true)[Rambam] end",
    );
    check(
      "keeping it out of the list is a second, separate switch",
      styles.setInstanceArgs(doc, inst, { ברשימה: "false" }),
      "פתיחה #ציון(ברשימה: false)[רמב״ם] סוף",
    );
  }
}
