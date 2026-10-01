// Which whitespace is worth showing, and the two halves that must not drift.
//
// A space is a character that renders as nothing, and in this application it is
// also **typographic**: `main.ts` says *"Typst turns a newline into a **space** and a
// blank line into a **paragraph break**"*. So `first⏎second` prints `first second`,
// a blank line prints two paragraphs, and runs of spaces collapse — three different
// things producing different pages, none of them visible.
//
// The marking is a decoration and cannot be asserted without a browser, the same
// limitation `focus.test.mjs` names for its own dimming. What **can** be asserted
// here is the judgement, which is a pure function of the document: *which* runs get
// marked. That is also the only part of this feature that can be **wrong** rather
// than merely ugly — the glyphs are in `styles.css` and a fence holds the two
// together.

import { check, ok, notOk } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";
import { whitespaceRuns, CLASSES } from "../.tmp-test/whitespace.mjs";
import { DEFAULTS } from "../.tmp-test/settings.mjs";

const SRC = path.resolve(dirOf(import.meta.url), "..", "src");

/** The classes a scan of `text` produces, in order, as `cls:from-to`. */
const marked = (text) => whitespaceRuns(text).map((r) => `${r.cls}:${r.from}-${r.to}`);

/** Comments stripped before grepping source. `focus.test.mjs:135` gives the
 *  reason: a fence that its own explanation can fail is a fence nobody keeps. */
const code = (file) =>
  readFileSync(path.join(SRC, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/.*/gu, "");

export function run() {
  // ------------------------------------------------------ what is not shown
  //
  // The first assertion of all, because it is the reason the setting is off by
  // default: a space between two words is **prose**, and marking every one turns
  // a paragraph of Hebrew into a field of dots.
  check("a space between two words is prose and stays unmarked", marked("שתי מילים עם רווח"), []);
  check(
    "…however many of them there are",
    marked("שתי מילים עם רווח עם רווח עם רווח עם רווח"),
    [],
  );
  // …but a *leading* space is not, and that is the asymmetry the whole judgement
  // turns on: a space between words is prose and a space at the start of a line is
  // an indentation nothing on screen is showing you.
  check("a single leading space is marked — it is an indent", marked(" שתי מילים"), [
    `${CLASSES.SPACE}:0-1`,
  ]);

  // ------------------------------------------------------ what is shown
  //
  // Four cases, and each is a mistake or an accident that produces a **different
  // page** while looking identical.

  check("two spaces in a row", marked("מילה  מילה"), [`${CLASSES.SPACE}:4-6`]);
  check("a trailing space", marked("מילה "), [`${CLASSES.SPACE}:4-5`]);
  check("a leading space", marked(" מילה"), [`${CLASSES.SPACE}:0-1`]);
  check("and a line of nothing but them", marked("   "), [`${CLASSES.SPACE}:0-3`]);

  // A tab is **never** legitimate here: Typst has no tab semantics and the source
  // is RTL prose, so one is always something that arrived by accident. It is also
  // the only character with its own class, and the only one marked at any length
  // or position.
  check("a tab, anywhere, is marked", marked("מילה\tמילה"), [`${CLASSES.TAB}:4-5`]);
  check("a lone tab", marked("\t"), [`${CLASSES.TAB}:0-1`]);
  // Leading spaces and the tab are **separate runs**, and both are marked — a tab is
  // not "part of" the spaces beside it, and merging them would hide one of the two.
  check("a tab among spaces is its own mark", marked("  \t"), [
    `${CLASSES.SPACE}:0-2`,
    `${CLASSES.TAB}:2-3`,
  ]);

  // ----------------------------------------------------------- the judgement
  //
  // "Runs of spaces, a leading space, a trailing one" — and the middle case is the
  // one a naive implementation gets wrong: a run *between* words is marked, which
  // is different from a single space between words, and it is the whole difference
  // between a usable feature and an unusable one.
  check(
    "a run in the middle is marked, and a single space beside it is not",
    marked("א  ב"),
    [`${CLASSES.SPACE}:1-3`],
  );
  // `מילה` is 4 characters, a space, `ראשונה` is 6, so the run starts at 11. Written
  // out by hand rather than computed, because a fixture whose expectation is
  // computed by the thing under test proves nothing about the arithmetic.
  check("…at the end of a line, with prose before it", marked("מילה ראשונה  "), [
    `${CLASSES.SPACE}:11-13`,
  ]);

  // Scanned **per line**, because that is what the editor has: a newline is a line
  // boundary, so nothing may span one, and a trailing space at the end of one line
  // is trailing even though the next line continues the sentence.
  check(
    "the scan is per line, so a line's trailing space is trailing",
    marked("מילה  \nמילה"),
    [`${CLASSES.SPACE}:4-6`],
  );

  // ------------------------------------------------------ the two halves
  //
  // The glyphs are CSS and the decision is TypeScript, and nothing at runtime
  // connects them: a class renamed on one side and not the other draws nothing and
  // says nothing. So the joining is asserted here, by name.
  {
    const css = readFileSync(path.join(SRC, "styles.css"), "utf8");
    for (const cls of [CLASSES.SPACE, CLASSES.TAB]) {
      ok(`${cls} has a rule`, css.includes(`.${cls}::after`), cls);
    }
    ok(
      "and both rules draw through `::after`, so no text is added to the document",
      /content:\s*"\\00b7"/u.test(css) && /content:\s*"\\2192"/u.test(css),
      "a space dot and a tab arrow",
    );
    // The escape form rather than the character: the file is UTF-8 and a Hebrew
    // catalogue sits beside it, and `prohibitions.test.mjs` already records a
    // hand-written mark range being wrong three times in this product.
    ok(
      "…written as escapes, not as literal glyphs",
      !css.includes("content: \"·\"") && !css.includes("content: \"→\""),
      "the glyphs must be \\00b7 and \\2192",
    );
  }

  // ------------------------------------------------- the composing property
  //
  // **The reason this is a mark and not a `highlightSpecialChars`.** That replaces
  // ranges of the document, and `bidi.ts:452` records what two replacements over
  // an overlapping range do: *"CodeMirror rejects the decoration set outright
  // ('Ran out of text content') and the editor goes blank."* Whitespace is inside
  // prose mode and inside every bidi mark, so a replacement here would blank the
  // editor on exactly the input the feature is for.
  {
    const src = code("whitespace.ts");
    ok(
      "it uses `Decoration.mark`, which changes no text",
      /Decoration\.mark\(/u.test(src),
      "a replacement would collide with prose mode and with bidi marks",
    );
    notOk("…and not `highlightSpecialChars`, which does", /highlightSpecialChars\(/u.test(src));
    notOk("…and no `replaceWith` anywhere in it", /replaceWith\(/u.test(src));

    const main = code("main.ts");
    // Its own compartment, because all three must be free **together** — a writer
    // wants whitespace and bidi marks at once and neither is "turn the other off".
    ok(
      "it has its own compartment, not the pairing switches' one",
      /whitespaceCompartment/u.test(main) &&
        !/pairCompartment\.of\(whitespaceExtension\(\)\)/u.test(main),
    );
    // **In the extension list, and this is the assertion that was missing.** It was
    // added because a mutation deleted the whole `whitespaceCompartment.of(...)` line
    // and the suite stayed green — the feature could be entirely dead code, wired to
    // a setting that reconfigures nothing, and every assertion above would pass.
    //
    // That is #83's lesson arriving in a new place: `Located` sat there declared,
    // documented and imported by nobody, for the whole life of a bug, reading like a
    // contract. **A fence that cannot fail on "this is not used" is not a fence.**
    ok(
      "…and is in the editor's extension list, not merely reconfigured",
      /whitespaceCompartment\.of\(whitespaceExtension\(\)\)/u.test(main),
      "without this the whole feature is dead code",
    );
    // And the toggle reconfigures, so turning it off takes the marks with it — a
    // `ViewPlugin` reading `settings` once would keep them until a swap.
    ok(
      "…and the setting reconfigures it",
      /whitespaceCompartment\.reconfigure\(whitespaceExtension\(\)\)/u.test(main),
    );
  }

  // -------------------------------------------------------------- the setting
  {
    check("it exists", "showWhitespace" in DEFAULTS, true);
    check(
      "and ships off — a paragraph of dotted Hebrew is unreadable",
      DEFAULTS.showWhitespace,
      false,
    );
    ok("and the row is in the drawer", /checkRow\("showWhitespaceLabel", "showWhitespace"\)/u.test(code("main.ts")));
    ok(
      "with a note saying why it is off",
      /t\("showWhitespaceNote"\)/u.test(code("main.ts")),
    );
    // Both languages, or an English interface reads a Hebrew key — which is the
    // exact failure #3 was closed for.
    // **Read raw, not through `code()`.** `i18n.ts` holds a `/*` inside a Hebrew
    // string, and `prohibitions.test.mjs:87` records what a comment stripper does
    // with that: it swallows everything to the next `*/`, which here is a few
    // hundred lines of catalogue. A fence that deletes the thing it is reading is a
    // fence that reports green — so this one does not strip.
    const i18n = readFileSync(path.join(SRC, "i18n.ts"), "utf8");
    const count = (k) => (i18n.match(new RegExp(`\\b${k}:`, "gu")) ?? []).length;
    check("the label is in the catalogue twice — Hebrew and English", count("showWhitespaceLabel"), 2);
    check("…and so is the note", count("showWhitespaceNote"), 2);
  }
}