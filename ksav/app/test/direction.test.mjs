// Two directions, and the page takes the interface's (#122).
//
// # The finding
//
// `applyUiDir()` set the root element's `dir` from the **document**:
//
//     document.documentElement.dir = docConfig().dir;
//
// It was added for a real complaint — the caret in a Hebrew document misbehaved
// when the interface was English — and it fixed that by changing the direction of
// the whole page. So an English interface with a Hebrew sefer opened right to
// left: drawers and menus flipped, and the pane tree (kept physical on purpose,
// so "preview on the right" is the right of the screen) laid itself out
// backwards.
//
// The two are different questions. The interface reads in its language's
// direction (`i18n.ts`'s `isRtlUi`); the document reads in its own
// (`docConfig().dir`), and that belongs on the surfaces carrying text.
//
// What this file asserts:
//
//   1. `rootDir` answers from the interface flag alone — there is no argument a
//      document could be passed through;
//   2. `textDir` normalizes a config value the way the product always has:
//      anything that is not exactly `ltr` reads RTL, which is the engine's
//      shipped default;
//   3. the editor is told the document's direction on its own element
//      (`dirCompartment` + `contentAttributes`), and the preview sets it per
//      pane — so the root was never what made either work;
//   4. `main.ts` assigns the root direction through `rootDir(...)` and no
//      assignment of `documentElement.dir` reaches for `docConfig()`.

import { readFileSync } from "node:fs";
import path from "node:path";
import { SRC } from "../tools/paths.mjs";
import { check, notOk, ok } from "./harness.mjs";
import { rootDir, textDir } from "../.tmp-test/direction.mjs";

const main = readFileSync(path.join(SRC, "main.ts"), "utf8");
const preview = readFileSync(path.join(SRC, "preview.ts"), "utf8");

export async function run() {
  // ------------------------------------------- the root is the interface's

  check("a Hebrew interface reads right to left", rootDir(true), "rtl");
  check("an English interface reads left to right", rootDir(false), "ltr");
  // One argument, so there is no way to smuggle a document into the answer:
  // this is the shape of the bug, asserted as a shape rather than as a value.
  check("the answer takes no document", rootDir.length, 1);

  // ---------------------------------------------- text takes the document's

  check("an LTR document reads left to right", textDir("ltr"), "ltr");
  check("an RTL document reads right to left", textDir("rtl"), "rtl");
  check("no configuration is the Hebrew default", textDir(undefined), "rtl");
  check("and neither is anything unrecognised", textDir("rtl-ish"), "rtl");

  // ------------------------------------------- and main.ts says so, in words

  const assignments = main
    .split("\n")
    .filter((l) => /documentElement\.dir\s*=/.test(l) && !l.trim().startsWith("//"));
  ok("main.ts sets the root direction somewhere", assignments.length > 0);
  ok(
    "the root direction is the interface's" +
      (assignments.every((l) => l.includes("rootDir("))
        ? ""
        : `\n    ${assignments.join("\n    ")}\n    The page's dir is the interface's (#122).`),
    assignments.every((l) => l.includes("rootDir(")),
  );
  notOk(
    "no assignment gives the root a document's direction" +
      (assignments.some((l) => l.includes("docConfig()"))
        ? `\n    ${assignments.filter((l) => l.includes("docConfig()")).join("\n    ")}`
        : ""),
    assignments.some((l) => l.includes("docConfig()")),
  );

  // ------------------------------------- the editor and the preview still get it
  //
  // The caret fix this replaced is kept, and kept where it belongs. Both of
  // these are load-bearing: remove either and a Hebrew document under an English
  // interface loses its bidi again — which is exactly the report that produced
  // the root-direction bug in the first place.
  ok(
    "the editor's content element is told the document's direction",
    /dirCompartment\.of\(\s*EditorView\.contentAttributes\.of\(\{\s*dir:\s*docConfig\(\)\.dir/.test(
      main.replace(/\s+/g, " ").replace(/ /g, " "),
    ) || (main.includes("dirCompartment.of") && main.includes("contentAttributes.of({ dir:")),
  );
  ok(
    "the bidi extension reads the document, not the interface",
    /bidiSupport\(\(\)\s*=>\s*\(docConfig\(\)\.dir/.test(main),
  );
  ok(
    "every preview pane takes the document's direction",
    preview.includes("docConfig().dir") && preview.includes("pane.style.direction"),
  );

  // The interface's own direction is still asked of `i18n.ts`, which is the one
  // module that knows what languages exist.
  ok("the UI direction is asked of i18n", main.includes("isRtlUi()"));
}
