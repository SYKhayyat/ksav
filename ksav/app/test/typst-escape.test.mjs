// Escaping user text into Typst markup.
//
// Two panels generated calls out of a `prompt()` or a text field with no
// escaping, so a `]` in a comment closed the call early and a trailing `\` in a
// header escaped its own closing quote — both corrupting the document with no
// diagnostic. These assert that the shared escaper closes those holes, and that
// what it produces is balanced.

import { check, ok } from "./harness.mjs";
import { typstString, typstContent } from "../.tmp-test/typst-escape.mjs";

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
    // The whole point: wrapping escaped content in a call yields balanced markup.
    const text = "a ] that used to break [ everything";
    const call = `#הערת_עורך[${typstContent(text)}]`;
    // Count unescaped brackets — the call's own pair is the only one.
    const unescaped = (call.match(/(^|[^\\])[[\]]/g) || []).length;
    check("only the call's own brackets are unescaped", unescaped, 2);
  }
}
