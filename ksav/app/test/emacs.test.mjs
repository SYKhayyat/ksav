// The Emacs package, held to the engine it talks to — with no Emacs.
//
// `editors/emacs/ksav-tests.el` is the real suite for that package and it needs
// an Emacs to run, which is why it is a CI job rather than a gate check. This
// file is the half that must be checkable from a plain checkout: the claims
// where the elisp and the rest of the product have to *agree*, which are
// exactly the claims that go wrong silently.
//
// The failure being guarded against has already happened in this repository,
// four times over, in four other languages. `services.rs` opens with the count:
// a service missing from one of four hand-written dispatch tables, a dev proxy
// carrying five routes of twelve, thirteen Tauri command names for eleven
// functions. Every one silent. `ksav-services.el` is generated so it cannot
// drift — `test/run.mjs` checks that — and this file checks the part a
// generator cannot: that the elisp *asks for* services that exist, and that its
// own registry helpers are still the ones it uses.

import { check, ok } from "./harness.mjs";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../tools/paths.mjs";
import { SERVICES } from "../src/services.gen.ts";

const HOME = path.join(ROOT, "ksav", "editors", "emacs");
const read = (name) => readFileSync(path.join(HOME, name), "utf8");

/** Comments stripped, so the prose about a service does not count as a call. */
function code(elisp) {
  return elisp
    .split("\n")
    .map((line) => line.replace(/^\s*;.*$/, ""))
    .join("\n");
}

export async function run() {
  const files = readdirSync(HOME);
  check("the package is where it says it is", files.includes("ksav.el"), true);
  check("…with its generated registry", files.includes("ksav-services.el"), true);
  check("…and its own tests", files.includes("ksav-tests.el"), true);

  const el = read("ksav.el");
  const services = read("ksav-services.el");
  const tests = read("ksav-tests.el");

  // ------------------------------------------------- it asks for real services

  {
    // Every `(ksav-call "name" …)` in the package, against the engine's
    // registry. A name nothing answers is a 404 at the keyboard, and the elisp
    // spells these as literals so they are checkable from here.
    const names = [...code(el).matchAll(/\(ksav-call\s+"([^"]+)"/gu)].map((m) => m[1]);
    ok("the package calls services", names.length > 0, `${names.length}`);
    const known = new Set(SERVICES.map((s) => s.name));
    check(
      "every service the package asks for exists",
      names.filter((n) => !known.has(n)),
      [],
    );
    // And it does not ask for one the browser build cannot reach without
    // meaning to: this client always has a machine under it, so `nativeOnly` is
    // not a bar — but a call to a Girsa service from Emacs would be a feature
    // nobody has designed, and it should show up here as a decision rather than
    // as a surprise.
    const native = new Set(SERVICES.filter((s) => s.nativeOnly).map((s) => s.name));
    check(
      "…and none of them is one that needs Girsa or a repository",
      names.filter((n) => native.has(n)),
      [],
    );
  }

  // --------------------------------------------- the registry is the registry

  {
    // The generated table, read back out of the elisp. `test/run.mjs` already
    // checks the file is current against the generator; this checks the
    // *generator's output shape* is what the elisp actually reads — a row that
    // gained a column would leave `ksav-service-path` returning the wrong
    // field, and nothing else in the product would notice.
    // The trailing `\)*` is the list's own closing paren, which elisp puts on
    // the last row rather than on a line of its own. Written without it, this
    // read fifteen of sixteen services and the one it could not see was the one
    // most recently added — a check that is blind to exactly the change it
    // exists to catch.
    const rows = [...services.matchAll(/^\s*\("([^"]+)" "(GET|POST)" "([^"]+)" (t|nil)\)\)*$/gmu)];
    check("every service is a row in the elisp", rows.length, SERVICES.length);
    for (const s of SERVICES) {
      const row = rows.find((r) => r[1] === s.name);
      ok(`${s.name} is in the elisp table`, !!row);
      if (!row) continue;
      check(`…with ${s.name}'s method`, row[2], s.method);
      check(`…and ${s.name}'s path`, row[3], s.path);
      check(`…and whether ${s.name} needs the machine`, row[4] === "t", s.nativeOnly);
    }
    // `ksav-service-path` takes the third element and `ksav-service-method` the
    // second. Asserted because the row is positional: reordering the generator's
    // columns would compile, run, and build every URL out of the method.
    ok("the path is the third column", /\(defun ksav-service-path[\s\S]{0,200}\(nth 2 /u.test(services));
    ok("the method is the second", /\(defun ksav-service-method[\s\S]{0,200}\(nth 1 /u.test(services));
  }

  // ------------------------------------------------ the mode is a Ksav mode

  {
    const src = code(el);
    ok("it opens .ksav files", src.includes(String.raw`"\\.ksav\\'"`));
    // Hebrew-first, and the two lines that make it so. Both have been wrong in
    // other editors' Hebrew support and neither is visible in a screenshot.
    ok("paragraphs run right to left", src.includes("bidi-paragraph-direction"));
    ok(
      "Hebrew letters are letters",
      /modify-syntax-entry\s+'\(\?\\u0590 \. \?\\u05F4\)\s+"w"/u.test(src) ||
        src.includes(`'(?\\u0590 . ?\\u05F4) "w"`),
    );
    // The insertion convention. `|` in a command's `insert` template is where
    // the caret goes, and the engine's registry is full of them — a client that
    // pastes the bar into the document is one every insertion is wrong in.
    ok("it knows what the caret marker is", src.includes("ksav-insert-template"));
  }

  // ------------------------------------------------------- it says it is tested

  {
    // The live half exists and is guarded in the one way that cannot rot into
    // a silent skip. `skips.test.mjs` makes this claim about the JavaScript
    // suite; the elisp needs it made from here, because nothing else in this
    // repository reads that file.
    ok("there are tests that need a real engine", tests.includes("ksav-live-"));
    ok(
      "…and a way to make their absence an error",
      tests.includes("KSAV_EMACS_LIVE"),
      "a skip nobody can turn off is a test nobody runs",
    );
    const live = [...tests.matchAll(/\(ert-deftest (ksav-live-[a-z-]+)/gu)].map((m) => m[1]);
    ok("…covering more than one thing", live.length >= 4, live.join(", "));
    // Every live test goes through the macro that provides the guard. One
    // written without it would run unguarded, fail on a machine with no engine,
    // and be "fixed" by deleting it.
    const guarded = (tests.match(/ksav-tests--with-engine/gu) ?? []).length;
    ok(
      "every live test is guarded",
      // The macro's own definition, plus one use per test.
      guarded >= live.length + 1,
      `${guarded} uses for ${live.length} tests`,
    );
  }

  // ------------------------------------------------------------ and documented

  {
    const readme = read("README.md");
    for (const key of ["C-c C-c", "C-c C-i", "C-c C-e", "C-c C-s"]) {
      ok(`the README documents ${key}`, readme.includes(key));
    }
    // Every key the mode binds is in the table. A binding nobody is told about
    // is a feature that does not exist for anybody who did not write it.
    const bound = [...code(el).matchAll(/\(define-key map \(kbd "([^"]+)"\)/gu)].map((m) => m[1]);
    ok("the mode binds keys", bound.length >= 4, `${bound.length}`);
    check(
      "every key the mode binds is in the README",
      bound.filter((k) => !readme.includes(k)),
      [],
    );
  }
}
