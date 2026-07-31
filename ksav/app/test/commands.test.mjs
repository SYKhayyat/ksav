// What commands *this document* has (B27).
//
// `compile.ts` used the document's own `#let` preamble when it had one — its own doc
// comment says so: *"a shared sefer compiles for its reader"* — and `main.ts`'s
// `userCommandNames` read the app-wide set only. So open a shared sefer and `#`
// completion offered **your** commands while the compiler ran **theirs**, and a
// global `#דגש` meaning something else would be offered by the editor and ignored by
// the compiler.
//
// And `userCommandNames` had exactly one caller: the command palette never called it,
// so a user-defined command was invisible there in every case.
//
// One function answers it now, and the compiler, the completions and the palette all
// read it. These assert the three things that were wrong.

import { check, ok, notOk } from "./harness.mjs";
import { available, definedIn, matches } from "../.tmp-test/commands.mjs";

/** Yours, as the settings drawer would hold them. */
const YOURS = { text: "#let דגש(x) = x\n#let שלי(y) = y", from: "yours" };
/** A shared sefer that carries its own. */
const SHARED = { text: "#let מיוחד(x) = x", from: "document" };
/** One that shadows a registry name. */
const SHADOW = { text: "#let הדגשה(x) = x", from: "document" };
const NONE = { text: "", from: "yours" };

/** A stand-in for the 104-entry registry. */
const REGISTRY = [
  { he: "הדגשה", en: "bold", category: "style", desc_he: "טקסט מודגש", desc_en: "Bold text", insert: "#הדגשה[|]" },
  { he: "כותרת1", en: "h1", category: "heading", desc_he: "כותרת", desc_en: "Heading", insert: "#כותרת1[|]" },
];

export async function run() {
  // ------------------------------------------------------------- the preamble
  check("a `#let` is a definition", definedIn("#let דגש(x) = x"), ["דגש"]);
  check("so is a bare `let`", definedIn("let אחר(x) = x"), ["אחר"]);
  check("several, in order", definedIn("#let א(x)=x\n#let ב(y)=y"), ["א", "ב"]);
  check("Hebrew and Latin both", definedIn("#let mine(x)=x\n#let שלי(y)=y"), ["mine", "שלי"]);
  check("nothing is nothing", definedIn(""), []);
  check("prose is not a definition", definedIn("סתם טקסט"), []);

  // ------------------------------------------------- the document's own win
  let names = available(REGISTRY, YOURS).map((c) => c.name);
  ok("with no document, yours are offered", names.includes("דגש"));
  ok("and the registry's too", names.includes("הדגשה"));

  // A shared sefer that carries its own.
  const shared = available(REGISTRY, SHARED);
  names = shared.map((c) => c.name);
  ok("the document's own command is offered", names.includes("מיוחד"));
  // This is the finding: the editor used to offer yours while the compiler ran the
  // document's.
  notOk("and yours are not, because the compiler will not run them", names.includes("דגש"));
  notOk("nor the other one of yours", names.includes("שלי"));
  check(
    "the document's command says whose it is",
    shared.find((c) => c.name === "מיוחד")?.from,
    "document",
  );

  // ---------------------------------------------------- shadowing is the writer's
  const shadowed = available(REGISTRY, SHADOW);
  const bold = shadowed.filter((c) => c.name === "הדגשה");
  check("a command that shadows a registry name appears once", bold.length, 1);
  check("and it is the document's, because that is what compiles", bold[0].from, "document");
  check("with the document's insertion", bold[0].insert, "#הדגשה[|]");

  // ------------------------------------------------------------------ the palette
  //
  // Both readers filter through one function, so the palette and the completions
  // cannot disagree about what a query matches.
  const list = available(REGISTRY, SHARED);
  ok("a query finds a registry command by its Hebrew", list.filter((c) => matches(c, "הדגש")).length === 1);
  ok("and by its English alias", list.filter((c) => matches(c, "bold")).length === 1);
  ok("and by its description", list.filter((c) => matches(c, "Heading")).length === 1);
  ok("and a user-defined one by its name", list.filter((c) => matches(c, "מיוחד")).length === 1);
  check("an empty query matches everything", list.filter((c) => matches(c, "  ")).length, list.length);

  // And with no preamble at all, the registry stands alone.
  check("no preamble is the registry", available(REGISTRY, NONE).length, REGISTRY.length);
}
