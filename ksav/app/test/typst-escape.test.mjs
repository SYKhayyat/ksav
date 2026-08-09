// Escaping user text into Typst markup.
//
// Two panels generated calls out of a `prompt()` or a text field with no
// escaping, so a `]` in a comment closed the call early and a trailing `\` in a
// header escaped its own closing quote — both corrupting the document with no
// diagnostic. These assert that the shared escaper closes those holes, and that
// what it produces is balanced.

import { check, ok } from "./harness.mjs";
import { typstString, typstContent } from "../.tmp-test/typst-escape.mjs";
import { MARKUP_ESCAPES } from "../.tmp-test/engine.gen.mjs";

export async function run() {
  // ---- string literals ("…") ----
  check("a plain string is quoted", typstString("hello"), '"hello"');
  check("a quote is escaped", typstString('a"b'), '"a\\"b"');
  check("a backslash is doubled", typstString("a\\b"), '"a\\\\b"');

  {
    // The ordering that matters: a trailing backslash must not escape the closing
    // quote. Backslash-first makes `\` into `\\`, so the final `"` still closes.
    const out = typstString("path\\");
    check("a trailing backslash cannot escape the closing quote", out, '"path\\\\"');
    ok("…so the literal ends in an even run of backslashes then a quote", /\\\\"$/.test(out));
  }

  {
    // A header ending in a backslash — the audit's section-page case.
    const out = typstString('Header\\');
    ok("the literal is well-formed", out.startsWith('"') && out.endsWith('"'));
    // Strip the surrounding quotes; the interior must have no lone quote.
    const inner = out.slice(1, -1);
    ok("no unescaped quote survives inside", !/(^|[^\\])(\\\\)*"/.test(inner));
  }

  // ---- content bodies ([…]) ----
  check("plain content is unchanged", typstContent("שלום עולם"), "שלום עולם");

  {
    // The comment case: a `]` in the text must not close the call.
    const out = typstContent("see item [3] and note ]");
    ok("every bracket is escaped", !/(^|[^\\])[[\]]/.test(out));
    check("both brackets and the stray one are escaped", out, "see item \\[3\\] and note \\]");
  }

  check("a hash is escaped so it starts no command", typstContent("C# and #tag"), "C\\# and \\#tag");
  check("a dollar is escaped so it opens no maths", typstContent("$5 or $10"), "\\$5 or \\$10");
  check("a backslash is doubled in content too", typstContent("a\\b"), "a\\\\b");

  {
    // The five this side used to be missing, and the reason it mattered:
    // `girsa-ksav`'s escaper had ten characters, this one had five, and both
    // write `#מראה_מקום(מקור: …)[…]` out of the same Girsa `display` string.
    // `*` is strong, `_` is emph, `<…>` is a label, `@` is a ref — and Sefaria
    // titles contain them, so one source landed as two different documents
    // depending on which door it came through.
    check("strong and emph markers are escaped", typstContent("*Rashi* on _Genesis_"),
      "\\*Rashi\\* on \\_Genesis\\_");
    check("a label and a ref are escaped", typstContent("<tag> @ref"), "\\<tag\\> \\@ref");
  }

  {
    // And the list is not this module's to hold. It comes from
    // `engine/src/escape.rs` through `facts.gen.json`, which is what stops the
    // two doors drifting again — a fence over a list one side owns would be a
    // fence over one side's opinion.
    ok("the list arrives from the engine", MARKUP_ESCAPES.length === 10);
    const missed = [...MARKUP_ESCAPES].filter((c) => typstContent(c) !== "\\" + c);
    check("every character the engine names is escaped", missed, []);
  }

  {
    // The whole point: wrapping escaped content in a call yields balanced markup.
    const text = "a ] that used to break [ everything";
    const call = `#הערת_עורך[${typstContent(text)}]`;
    // Count unescaped brackets — the call's own pair is the only one.
    const unescaped = (call.match(/(^|[^\\])[[\]]/g) || []).length;
    check("only the call's own brackets are unescaped", unescaped, 2);
  }
}
