// A caught error, as something a writer can act on.
//
// The compiler half of this file moved with the code it tested: rephrasing Typst's
// diagnostics is `engine/src/diagnostics.rs` now, with the span it needs and the
// registry that answers *did you mean*, and its assertions moved there too. What
// is asserted here is the half that never existed at all — six sites that did
// `${t("saveFailed")} — ${String(e)}`, a translated label with an untranslated
// browser or Rust `Error` glued on.

import { check, ok, notOk } from "./harness.mjs";
import { troubleSaid, rawOf } from "../.tmp-test/diagnostics.mjs";

export async function run() {
  // ------------------------------------------------------ caught errors

  const cases = [
    ["girsa is not running", "reach_girsa", "אינה פועלת"],
    ["could not reach girsa: connection timed out", "reach_girsa", "נסגר שלא כשורה"],
    ["TypeError: Failed to fetch", "compile", "בדקו שהמנוע פועל"],
    ["NotAllowedError: The request is not allowed", "save_file", "הרשאה"],
    ["NotFoundError: A requested file could not be found", "save_file", "אינו נמצא"],
    ["QuotaExceededError: quota exceeded", "save_file", "אחסון"],
  ];
  for (const [message, doing, wanted] of cases) {
    const t = troubleSaid(message, doing);
    ok(`"${message.slice(0, 32)}…" → says ${wanted}`, t.said.includes(wanted));
    check(`"${message.slice(0, 32)}…" → keeps the raw string`, t.detail, message);
    notOk(`"${message.slice(0, 32)}…" → raw is not the sentence`, t.said.includes(message));
    ok(`"${message.slice(0, 32)}…" → bilingual, Hebrew`, /[֐-׿]/.test(t.said));
    ok(`"${message.slice(0, 32)}…" → bilingual, English`, /[A-Za-z]/.test(t.said));
  }

  // Same error, two things being attempted, two sentences.
  const a = troubleSaid("connection timed out", "reach_girsa");
  const b = troubleSaid("connection timed out", "save_file");
  check("the same error gives two sentences", a.said === b.said, false);
  ok("one names Girsa", a.said.includes("גִּרְסָא"));
  ok("the other names the file", b.said.includes("קובץ"));

  // An unrecognised error is a worse message, never a missing one.
  const odd = troubleSaid("something nobody has ever seen", "compile");
  ok("an unrecognised error still names what failed", odd.said.includes("ההידור"));
  ok("and still points at one place to look", odd.said.includes("הצבה"));
  check("and still keeps the string", odd.detail, "something nobody has ever seen");

  // Whatever a `catch` can hold.
  check("a string", rawOf("plain"), "plain");
  check("an Error keeps its name", rawOf(new TypeError("boom")), "TypeError: boom");
  check("a rejection object", rawOf({ message: "nope" }), "nope");
  ok("undefined does not throw", troubleSaid(undefined).said.length > 0);
}
