// Vim and Emacs: whether the build leaves anything of them.
//
// The report was *"emacs mode does nothing"*, and it had two independent causes
// stacked on top of each other. Both are worth a test, and neither could have
// been found by reading `keymodes.ts`, which is correct and always was.
//
// **One: the mode was never switched on.** `boot` reads `settings.editingMode`,
// and `loadSettings` threw on every boot and returned the defaults — see
// `settings.test.mjs`. Nothing to do with the modes at all.
//
// **Two: the build deletes the package's keyboard.** That is this file.
// `@replit/codemirror-emacs` registers its whole key table and every command
// implementation at module scope, and marks both calls `/*@__PURE__*/`:
//
//     for (let i in emacsKeys) {
//         /*@__PURE__*/EmacsHandler.bindKey(i, emacsKeys[i]);
//     }
//     /*@__PURE__*/EmacsHandler.addCommands({ killLine: …, yank: …, … });
//
// The annotation promises the bundler those calls may be dropped when nobody
// reads their result. Nobody does — they exist for their side effect — so a
// production build drops both, and what ships is a mode that loads without
// error, adds its CSS class and cannot answer one keystroke. The dev server does
// not tree-shake, so the same code works there. That is exactly the split the
// investigation before this one recorded and could not explain.
//
// Measured on the real bundle, before the fix: the emacs chunk contained the
// `emacsKeys` table and the `bindKey` method, and zero calls registering the one
// with the other, and zero command implementations.

import { check, ok, notOk } from "./harness.mjs";
import { MODE_PACKAGES, stripStatementPure } from "../tools/pure-annotations.mjs";
import { MODES, isMode, loadError } from "../.tmp-test/keymodes.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const HERE = dirOf(import.meta.url);
const EMACS = path.resolve(HERE, "..", "node_modules", "@replit", "codemirror-emacs", "dist", "index.js");

export async function run() {
  // ---------------------------------------------------------------- the rule

  {
    // A call in statement position whose result nobody takes is being made for
    // its side effect, by definition. An annotation there is always the false
    // kind, and every spelling of "statement position" has to be caught.
    check("after a newline", stripStatementPure("a();\n/*@__PURE__*/b();"), "a();\nb();");
    check("after a brace", stripStatementPure("{/*@__PURE__*/b();}"), "{b();}");
    check("after a semicolon", stripStatementPure("a();/*@__PURE__*/b();"), "a();b();");
    check("with space in the annotation", stripStatementPure("\n/* @__PURE__ */b();"), "\nb();");
  }

  {
    // The other half, and the one that keeps the rule from being a blunt
    // instrument: an annotation inside an expression is honest — the value is
    // only worth computing if something takes it — and is where the size these
    // packages save actually comes from.
    const expr = "const p = /*@__PURE__*/ViewPlugin.fromClass(X);";
    check("an expression annotation is left alone", stripStatementPure(expr), expr);
    const arg = "install(/*@__PURE__*/make());";
    check("...and so is one inside an argument list", stripStatementPure(arg), arg);
  }

  {
    check("the rule knows which packages it is about", MODE_PACKAGES.test("/x/@replit/codemirror-emacs/dist/index.js"), true);
    check("...on Windows paths too", MODE_PACKAGES.test("C:\\x\\@replit\\codemirror-vim\\dist\\index.js"), true);
    check("...and claims nothing about anything else", MODE_PACKAGES.test("/x/@codemirror/view/dist/index.js"), false);
  }

  // ------------------------------------------------- against the real dependency
  //
  // Read off disk rather than fixtured, so a package upgrade that changes the
  // shape of this problem is reported here instead of shipping a mode that
  // silently does nothing again.

  {
    const src = readFileSync(EMACS, "utf8");

    // The premise. If upstream ever fixes this, these two go red and whoever is
    // reading can retire the build rule rather than carrying it forever.
    ok("the package still registers its keys at module scope", /for \(let \w+ in emacsKeys\)/.test(src));
    ok("...and still calls its own bindKey there", src.includes("EmacsHandler.bindKey("));
    ok("...and still defines its commands with addCommands", src.includes("EmacsHandler.addCommands("));

    const statementPure = src.match(/([;{}\n])\s*\/\*\s*@__PURE__\s*\*\//g) ?? [];
    ok("and it still annotates statements as pure, which is the bug", statementPure.length > 0);

    const fixed = stripStatementPure(src);
    notOk(
      "after the rule, no annotation introduces a statement",
      /([;{}\n])\s*\/\*\s*@__PURE__\s*\*\//.test(fixed),
    );
    ok("the registration loop survives it", /for \(let \w+ in emacsKeys\)/.test(fixed));
    ok("...and so does the command table", fixed.includes("EmacsHandler.addCommands("));
    // Nothing else may be touched: this is a comment-stripping rule, and a rule
    // that also moved code would be a much harder thing to trust. Compared with
    // *all* annotations gone from both sides, so what is left is the code —
    // and by length, because a mismatch here should print a number rather than
    // half a megabyte of minified dependency.
    const bare = (s) => s.replace(/\/\*\s*@__PURE__\s*\*\//g, "").length;
    check("and nothing but annotations changed", bare(fixed), bare(src));
    ok("...while some annotations did survive, as intended", fixed.includes("@__PURE__"));
  }

  // ------------------------------------------------------------- the module itself

  {
    check("the three modes are the three modes", MODES, ["default", "vim", "emacs"]);
    ok("a stored value is checked before it is trusted", isMode("emacs") && !isMode("evil"));
    // Nothing has been asked to load in this process, so there is nothing to
    // report. The point of `loadError` is that it now has a *caller* —
    // `editingModeNote` in `main.ts` — where for the life of the feature its
    // only reference was an assertion that it was null.
    check("no mode has failed, because none was asked for", loadError(), null);
  }
}
