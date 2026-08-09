// What the two applications are called, in Hebrew.
//
// The sibling repository has this file already, and its existence there is what
// made the defect here findable: Girsa has a test literally named *"nowhere in
// src spells the sibling כסב"*, and it cannot read this tree. So `i18n.ts:405`
// said
//
//     "חיפוש מקורות פועל כשגרסא פתוחה לצד כסב (לא בדפדפן)"
//
// — the banned transliteration, in the application whose own name it is, in the
// string that tells the reader it needs Girsa.
//
// `כסב` is kaf-samekh-bet: a letter-by-letter transliteration of the Latin
// "Ksav" back into Hebrew. It is not a word. The application is `כְּתָב` —
// kaf-tav-bet, the Hebrew word for *writing*.
//
// The repo-wide sweep in `prohibitions.test.mjs` is what keeps a thirteenth
// site from spelling either name a third way. This file is the smaller half:
// what the names *are*, and that composing one with a preposition still reads
// as a name.

import { check, ok } from "./harness.mjs";
import { GIRSA, KSAV, withPrefix } from "../.tmp-test/names.mjs";
import { t } from "../.tmp-test/i18n.mjs";

export async function run() {
  check("this application is כְּתָב", KSAV, "כְּתָב");
  check("the sibling is גִּרְסָא", GIRSA, "גִּרְסָא");

  // Both are pointed, which is the whole reason `withPrefix` exists: a dagesh
  // and a sheva on the first letter, with a preposition glued straight onto
  // them, reads as one long word rather than as a preposition and a name.
  for (const [name, whose] of [[KSAV, "this application"], [GIRSA, "the sibling"]]) {
    ok(`${whose} is pointed`, /[ְ-ּ]/u.test(name), name);
    check(`…and a prefix is kept off it by a maqaf`, withPrefix("ל", name), `ל־${name}`);
  }

  // The name the interface prints, which is the one that was wrong.
  {
    const said = t("girsaNeedsApp");
    ok("the string that asks for Girsa names it correctly", said.includes(GIRSA), said);
    ok("…and names this application correctly", said.includes(KSAV), said);
  }

  // The unpointed spelling is not banned outright, and that is deliberate:
  // `גרסה` / `גרסאות` is the ordinary Hebrew word for *version*, which the
  // document history legitimately says. Only the shapes that can only be the
  // application are forbidden — see `prohibitions.test.mjs`.
  {
    const history = t("history");
    ok("the version history still says גרסאות", history.includes("גרסאות"), history);
  }
}
