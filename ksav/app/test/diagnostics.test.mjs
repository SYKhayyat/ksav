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
    // The three coded refusals, spelled the way `girsa_post::PostError` prints
    // them: the name Rust put on it, then a colon, then prose that is *not* API.
    ["post-not-running: girsa is not running", "reach_girsa", "אינה פועלת"],
    ["post-unreachable: could not reach girsa: connection timed out", "reach_girsa", "נסגר שלא כשורה"],
    ["post-refused: girsa refused it: 413 body too large", "reach_girsa", "נדחה"],
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

  // ------------------------------------------- the prose is not the API
  //
  // The three above used to be matched by their English words — here, and
  // character for character in `Girsa/app/src/trouble.ts`. Two repositories
  // keying on the `Display` impl of a type in a third, which is the crate that
  // exists so the two sides need not agree in prose.
  //
  // `engine/tests/from_girsa.rs` holds `PostError::CODES` against this file, so
  // a code Rust can send with no line here is a red build rather than English
  // printed into a Hebrew UI. This is the other half: the sentence follows the
  // **name**, and the words after the colon can say anything at all.
  {
    const same = "אינה פועלת";
    for (const detail of [
      "post-not-running: girsa is not running",
      "post-not-running: Girsa has not been started",
      "post-not-running: ",
    ]) {
      ok(`rewording the prose changes nothing: ${JSON.stringify(detail)}`,
        troubleSaid(detail, "reach_girsa").said.includes(same));
    }
    // …and a code nobody has ever heard of is not silently treated as one.
    const unknown = troubleSaid("post-nonsense: whatever", "reach_girsa");
    notOk("an unknown code does not borrow another's sentence", unknown.said.includes(same));
    ok("…and still names what failed", unknown.said.includes("הקשר עם"));
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
