// Which way each line reads, and which runs are held apart from the prose.
//
// Both of these are decided by rules whose failures are silent and cosmetic
// right up until they are not: a line given the wrong base direction looks
// slightly odd and then swallows the caret, and an isolate placed over the wrong
// range moves text on screen while CodeMirror still measures the old order.
// Neither shows up in a screenshot of a document that happens to be all Hebrew,
// which is most of the documents anybody will open.

import { check, ok, notOk } from "./harness.mjs";
import {
  naturalDirection,
  resolveLineDirections,
  isolateSpans,
  toggleIsolate,
  BIDI_MARKS,
  BIDI_MARK_RE,
  SCAN_LIMIT,
} from "../.tmp-test/bidi.mjs";

export function run() {
  // ------------------------------------------------- what decides a direction

  check("Hebrew reads right to left", naturalDirection("שלום עולם"), "rtl");
  check("English reads left to right", naturalDirection("hello world"), "ltr");
  check("the first strong character decides, not the majority", naturalDirection("a שלום שלום שלום"), "ltr");
  check("...in the other order too", naturalDirection("ש hello hello hello"), "rtl");
  check("leading punctuation is not strong", naturalDirection("#[( שלום"), "rtl");
  check("nor are digits", naturalDirection("123 hello"), "ltr");
  check("nor is a number in front of Hebrew", naturalDirection("42 שלום"), "rtl");

  check("a blank line says nothing", naturalDirection(""), null);
  check("nor does a line of only punctuation", naturalDirection("  ])  "), null);
  check("nor one of only digits", naturalDirection("2026"), null);

  // Nikud is a combining mark — bidi class NSM — and takes the direction of the
  // letter under it. On its own it decides nothing, which matters because a
  // truncated paste really can be a run of bare marks.
  check("bare nikud decides nothing", naturalDirection("ְִּ"), null);
  check("but a pointed word is still Hebrew", naturalDirection("בְּרֵאשִׁית"), "rtl");
  check("Arabic is right to left too", naturalDirection("مرحبا"), "rtl");
  check("and Cyrillic is not", naturalDirection("привет"), "ltr");

  // An isolate is a promise that the run inside decides nothing for the run
  // outside. Ignoring it is how a `#footnote` makes a Hebrew paragraph English.
  check("text inside an isolate does not decide", naturalDirection("⁦hello⁩ שלום"), "rtl");
  check("an unterminated isolate swallows the rest", naturalDirection("⁧hello"), null);
  check("and a stray PDI does not go negative", naturalDirection("⁩hello"), "ltr");

  // The cap is the only cost this imposes on a pathological line.
  check("nothing past the scan limit counts", naturalDirection(" ".repeat(SCAN_LIMIT) + "a"), null);
  check("and one character inside it does", naturalDirection(" ".repeat(SCAN_LIMIT - 1) + "a"), "ltr");

  // ------------------------------------------------------ the fallback chain

  {
    const dirs = resolveLineDirections(["שלום", "", "עולם"], "ltr");
    check(
      "a blank line between two Hebrew lines is Hebrew, not the app's locale",
      dirs.join(" "),
      "rtl rtl rtl",
    );
  }
  check(
    "a line with its own letters ignores the chain entirely",
    resolveLineDirections(["שלום", "hello", "שלום"], "rtl").join(" "),
    "rtl ltr rtl",
  );
  check(
    "with nothing before it, a directionless line takes the document's",
    resolveLineDirections(["", "  ", "]"], "ltr").join(" "),
    "ltr ltr ltr",
  );
  check(
    "and the seed wins over the document when there is one",
    resolveLineDirections(["", "]"], "ltr", "rtl").join(" "),
    "rtl rtl",
  );

  {
    // The group stack, which is the whole reason this is not a one-liner. The
    // closing bracket of an English block should read the way the block does,
    // even though the line above it is Hebrew.
    const dirs = resolveLineDirections(
      [
        "שלום עולם", //          0 rtl, its own
        "#raw(lang: \"js\")[", // 1 ltr, its own — and opens a group
        "  const x = 1;", //      2 ltr, its own
        "  שלום", //              3 rtl, its own
        "", //                    4 inside the group: the opener's ltr, not line 3's rtl
        "]", //                   5 the closer: still the opener's
        "", //                    6 out of the group again: the previous line's
      ],
      "rtl",
    );
    check("a blank line inside a block reads the way the block opened", dirs[4], "ltr");
    check("and so does the line that closes it", dirs[5], "ltr");
    check("a Hebrew line inside it still reads for itself", dirs[3], "rtl");
    check("and after the group closes, inheritance resumes", dirs[6], "ltr");
  }

  check(
    "an unbalanced closer cannot underflow the stack",
    resolveLineDirections(["]]]]", "", "שלום"], "ltr").join(" "),
    "ltr ltr rtl",
  );

  {
    // Every line gets exactly one answer, and it is one of the two.
    const lines = ["", "שלום", "x", "]", "[", "", "١٢٣", "⁦en⁩"];
    const dirs = resolveLineDirections(lines, "rtl");
    check("every line is answered", dirs.length, lines.length);
    ok("and every answer is a direction", dirs.every((d) => d === "rtl" || d === "ltr"));
  }

  // ------------------------------------------------------------ the isolates

  {
    const text = 'שלום #צבע(rgb("#b91c1c"))[טקסט] עולם';
    const spans = isolateSpans(text);
    check("one command head is one isolate", spans.length, 1);
    check(
      "the head is the name and its arguments, and stops before the body",
      text.slice(spans[0].from, spans[0].to),
      '#צבע(rgb("#b91c1c"))',
    );
    check("and it reads the way its own name does", spans[0].dir, "rtl");
  }

  {
    // The nesting this exists to swallow: the scanner sees `#b91c1c` inside the
    // string as a command, because it has no way not to.
    const text = '#color(rgb("#b91c1c"))[x]';
    const spans = isolateSpans(text);
    check("a command inside another's arguments does not get its own isolate", spans.length, 1);
    check("the outer one covers it", text.slice(spans[0].from, spans[0].to), '#color(rgb("#b91c1c"))');
    check("a Latin-named command reads left to right", spans[0].dir, "ltr");
  }

  {
    const text = "שלום // a note about שלום\n#הערה[גוף]";
    const spans = isolateSpans(text);
    check("a comment is isolated too", spans.length, 2);
    check("the comment first", text.slice(spans[0].from, spans[0].to), "// a note about שלום");
    check("then the command", text.slice(spans[1].from, spans[1].to), "#הערה");
  }

  {
    // A command with no arguments is just its name, and the body is never part
    // of an isolate — it is the writer's prose and belongs to the paragraph.
    const text = "#הדגשה[מילה חשובה]";
    const spans = isolateSpans(text);
    check("the body stays out of it", text.slice(spans[0].from, spans[0].to), "#הדגשה");
  }

  {
    // The invariant the whole mechanism rests on: overlapping isolated ranges
    // are exactly what CodeMirror's bidi pass cannot make sense of.
    const text =
      '/* #הערה[a] */ #צבע(rgb("#fff"))[ב] // #x\n#a(1)#b(2) #ג[#ד[עמוק]] #ה';
    const spans = isolateSpans(text);
    ok("spans come out sorted", spans.every((s, i) => i === 0 || spans[i - 1].from <= s.from));
    ok("and none overlaps the next", spans.every((s, i) => i === 0 || spans[i - 1].to <= s.from));
    ok("and none is empty", spans.every((s) => s.to > s.from));
  }

  {
    const spans = isolateSpans("שלום עולם, בלי שום פקודה");
    check("prose with no syntax in it needs no isolates", spans.length, 0);
  }

  // A command whose name is Hebrew but whose arguments are English: the head
  // reads by its first strong character, which is the name. That is the answer
  // Unicode's FSI would give, and the reason `dir` is derived rather than fixed.
  check("the head's direction comes from the head", isolateSpans('#זרם("sources")')[0].dir, "rtl");
  notOk("a head of pure punctuation gets no fixed direction", isolateSpans("#a")[0].dir === "rtl");

  // ------------------------------------------------------ the manual override

  {
    const wrapped = toggleIsolate("רש\"י");
    check("wrapping puts an FSI in front", wrapped[0], "⁨");
    check("and a PDI behind", wrapped[wrapped.length - 1], "⁩");
    check("a second press takes it off again", toggleIsolate(wrapped), "רש\"י");
    check("an explicit direction is honoured", toggleIsolate("x", "rtl")[0], "⁧");
    check("...and so is the other one", toggleIsolate("x", "ltr")[0], "⁦");
    // An LRI-wrapped run unwraps as readily as an FSI-wrapped one: the writer
    // did not necessarily put it there with this command.
    check("any isolate opener unwraps", toggleIsolate("⁦x⁩"), "x");
    check("an unpaired opener is not an isolate", toggleIsolate("⁦x"), "⁨⁦x⁩");
    check("and neither is a lone character", toggleIsolate("⁩"), "⁨⁩⁩");
  }

  // The table and the regex are two spellings of one set, and the regex is
  // generated from the table so they cannot come apart — asserted because the
  // failure mode is a mark that silently stops being drawn.
  {
    const codes = Object.keys(BIDI_MARKS).map(Number);
    check("every mark is named", codes.length, 12);
    for (const code of codes) {
      BIDI_MARK_RE.lastIndex = 0;
      ok(`${BIDI_MARKS[code].tag} is matched by the regex`, BIDI_MARK_RE.test(String.fromCodePoint(code)));
    }
    BIDI_MARK_RE.lastIndex = 0;
    notOk("and an ordinary letter is not", BIDI_MARK_RE.test("a"));
    BIDI_MARK_RE.lastIndex = 0;
    notOk("nor is a Hebrew one", BIDI_MARK_RE.test("א"));
  }
}
