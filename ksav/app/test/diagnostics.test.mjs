// Compiler output, and caught errors, as things a writer can act on.
//
// `friendlyPair` was already here and already good; it had no test file. What was
// missing entirely was the other half — a *caught* error — so six sites did
// `${t("saveFailed")} — ${String(e)}`: a translated label with an untranslated
// `Error` glued on. The same class of defect as Girsa's `${ksav.why}` in a Hebrew
// toolbar, one repository over.
//
// The rule both halves now hold: the sentence is the reader's, the machine's
// string is behind the details affordance, and it is never the sentence.

import { check, ok, notOk } from "./harness.mjs";
import {
  friendlyPair,
  friendlyError,
  troubleSaid,
  rawOf,
  MAX_DIAGNOSTIC_CHARS,
} from "../.tmp-test/diagnostics.mjs";

/** The four live errors the audit measured against the running server. */
const MEASURED = [
  "unknown variable: הדגשא",
  "unclosed delimiter",
  "expected auto, relative length, fraction, integer, or array, found string",
  "expected string, found content",
];

export async function run() {
  // ------------------------------------------------- compiler output, rephrased

  for (const msg of MEASURED) {
    const p = friendlyPair(msg);
    ok(`"${msg.slice(0, 30)}…" is recognised`, p !== null);
    ok(`…and says something in Hebrew`, /[֐-׿]/.test(p.he));
    ok(`…and something in English`, /[A-Za-z]/.test(p.en));
  }

  // The one that names the mistyped command back at the writer.
  const unknown = friendlyPair("unknown variable: הדגשא");
  ok("an unknown command is quoted back", unknown.he.includes("הדגשא"));

  // Typst's forty-item paper enumeration is replaced by the four in the menu,
  // not merely truncated.
  const paper = friendlyPair('expected "a4", "us-letter", "a3", "a5", "iso-b1", …, found string');
  ok("an unknown paper size names the four in the menu", paper.he.includes("A4"));
  notOk("and does not enumerate Typst's own", paper.he.includes("iso-b1"));

  // What we do not recognise is shortened, never swallowed.
  const long = "z".repeat(400);
  const short = friendlyError(long);
  check("an unrecognised message is capped", short.length, MAX_DIAGNOSTIC_CHARS);
  ok("and ends in an ellipsis so the truncation is visible", short.endsWith("…"));
  check("a short one is untouched", friendlyError("boom"), "boom");
  check("whitespace is flattened", friendlyError("a\n  b"), "a b");

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
