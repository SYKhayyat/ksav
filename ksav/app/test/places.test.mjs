// #82 — a part included twice: one click still goes to the first place, and a
// second gesture opens every place.
//
// The engine half has its own fences (`engine/tests/includes.rs`): `lines_of`
// enumerates, and `line_of` is its first element by construction because the two
// share one predicate. What was missing is the **other half of a feature** —
// `lines_of` had no caller anywhere, so the engine could answer and nothing
// asked. That is invisible from the engine side: every engine test passes, and
// no writer can see it.
//
// So this covers the three places the missing half had to touch, and each one
// because it is a place where "it compiles" is not the claim:
//
//  1. the **service** exists and is reachable — a new name in the registry is a
//     row in `services.rs`, a generated table, and a route;
//  2. the **client reads `first` off the wire** rather than taking `places[0]`.
//     The temptation is real and the difference is not: `first` is `line_of`,
//     the same value `reveal` uses, and a client that recomputed it would be a
//     second implementation of *"first is reading order"* across a JSON
//     boundary;
//  3. the **gesture exists** — a key, a command, and a panel in the registry, so
//     that a feature cannot be "shipped" as a function nobody calls, which is how
//     `lines_of` spent its life.

import { check, ok, notOk } from "./harness.mjs";
import { SERVICE, SERVICE_PATH } from "../.tmp-test/services.gen.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const APP = path.resolve(dirOf(import.meta.url), "..");
const src = (name) => readFileSync(path.join(APP, "src", name), "utf8");

export function run() {
  const api = src("api.ts");
  // The wire vocabulary is api.ts's; the readers and the transport bodies are
  // transports.ts's (the audit's #166 split). The fence reads whichever file
  // the code it watches actually lives in — so it cannot pass on a search that
  // nothing is there to fail.
  const transports = src("transports.ts");
  const main = src("main.ts");
  const panels = src("panels.ts");
  const bindings = src("bindings.ts");
  const sw = readFileSync(path.join(APP, "public", "sw-services.gen.js"), "utf8");

  // ------------------------------------------------------------- the service

  {
    // `SERVICE` is keyed by name — the generated table's own shape — so this asks
    // for the row rather than searching a list for one.
    const row = SERVICE.places;
    ok("the engine answers `places`", !!row);
    // A POST, and it costs a layout: it has to know where anything printed, which
    // is the same work a compile does. A `Quick` row here would let it into the
    // foreground lane and put a compile behind a non-compile.
    check("it is a POST", row?.method, "POST");
    check("and it costs a layout", row?.cost, "layout");
    check("with a path, because the route is generated from it", row?.path, "/places");
    check("and that path is the one the client would use", SERVICE_PATH.places, "/places");
    ok("the service worker knows the path", sw.includes('"/places"'));
  }

  // ------------------------------------------------- `first` read, not derived

  {
    ok("the client has a `Places` shape", api.includes("export interface Places"));
    ok("and a reader for it", transports.includes("function readPlaces"));
    ok(
      "the reader takes `first` from the wire",
      /first:\s*typeof o\?\.first === "number"/.test(transports),
    );
    // **The one that matters**, and it has to be stated as a *property* rather
    // than as a guess at syntax. An earlier version of this test looked for the
    // literal `first: list[0]`, and a mutation that wrote the same derivation
    // through `o.places[0]` walked straight past it — a fence that cannot see
    // the bug it exists for, which is worse than no fence because it reads green.
    //
    // So the `first:` line is taken **by its own line**, out of `readPlaces`'s
    // body only. Brace-matching was tried and is wrong: the reader's first `}`
    // belongs to the ternary building `list`, which is *before* the `first`
    // clause, so a slice taken to the first brace never reaches the line under
    // test and the assertion passes on an empty string.
    const reader = transports.slice(transports.indexOf("function readPlaces"));
    const firstLine = reader.split("\n").find((l) => /^\s*first:/.test(l)) ?? "";
    ok("readPlaces assigns `first`", !!firstLine);
    ok("…from the wire field", /first:[^\n]*\.first\b/.test(firstLine));
    notOk(
      "…and not by indexing the list",
      /first:[^\n]*\.places\s*\[/.test(firstLine),
    );
    notOk(
      "…nor through a local array",
      /first:[^\n]*\b(list|lines|places)\s*\[/.test(firstLine),
    );

    // And every backend answers it the same way — one service, one body, written
    // once on `ServiceClient` (the audit's #149: it was copy-pasted into all
    // three, byte-identical between HTTP and Tauri). The fence holds the
    // consolidation: the single implementation lives on the shared client, and
    // no backend re-declares it.
    ok("the one body lives on ServiceClient", /abstract class ServiceClient[\s\S]*?async places\(/.test(transports));
    check("and no backend re-declares it", (transports.match(/async places\(/g) ?? []).length, 1);
    ok(
      "and none of them invents an answer",
      !/async places\([^}]*\{\s*places:\s*\[/.test(transports),
    );
  }

  // ------------------------------------------------------------ the gesture

  {
    ok("there is a command", /id: "revealPlaces"/.test(main));
    ok("with a key", /revealPlaces:\s*"/.test(bindings));
    // The pair, and it is the whole design: `revealCursor` must be untouched,
    // because one click going to the first place is *correct* — reading order is
    // the right default and a cursor has one place to be.
    ok("and the single-place reveal beside it", /id: "revealCursor"/.test(main));
    // A panel, or somewhere for the list to be drawn.
    ok("and a panel to draw it in", panels.includes("places-chooser"));
    // Registered with the exits it claims. The registry exists so that a
    // thirteenth panel cannot silently not get Escape, which is the whole cost a
    // hand-written list of twelve close calls buys.
    const row = panels.match(/id: "places-chooser"[^}]*}/);
    ok("the panel declares its exits", row && /exits:/.test(row[0]));
    ok("and that Escape is one of them", row && /escape:\s*true/.test(row[0]));
    // …and the label, in both languages, because a command with no name is a
    // command nobody can find in the palette.
    const i18n = ["i18n-he.ts", "i18n-en.ts"].map(src).join("\n");
    check("the command is named in Hebrew", (i18n.match(/"sc\.revealPlaces"/g) ?? []).length, 2);
  }

  // ------------------------------------------------- the "nothing to choose" case

  {
    // The one a list UI usually gets wrong: a line that is **not** in a part has
    // nothing to choose, and the honest answer is a sentence. A writer who
    // pressed a key is owed one — an empty panel is a dead gesture.
    const reveal = src("reveal.ts");
    ok("there is a sentence for one place", reveal.includes("placesOnlyHere"));
    // Held as **structure**: the empty branch and the sentence inside it. A
    // character-count window was tried and is wrong — the explanatory comment
    // between them is longer than the window, so the assertion was measuring the
    // length of a comment rather than the shape of the code.
    const emptyBranch = reveal.slice(
      reveal.indexOf("if (lines.length === 0)"),
      reveal.indexOf("if (one)"),
    );
    ok(
      "and it is used when the list is empty",
      emptyBranch.includes("placesOnlyHere") && emptyBranch.includes("replaceChildren"),
    );
    // `placesRows` separated from the DOM so the decision is data.
    ok(
      "the decision is one function, not a walk over buttons",
      /function placesRows\(/.test(reveal),
    );
    ok(
      "and it says a single place is not a choice",
      /one:\s*lines\.length <= 1/.test(reveal),
    );
  }
}
