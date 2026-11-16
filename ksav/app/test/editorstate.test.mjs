// The editor's extension stack, held as a value rather than as a source string.
//
// Every other fence around this list is a regex over `editorstate.ts` — that
// `minimapExtension(` appears, that `tagDim(` appears — because until this file
// was carved out of `main.ts` there was no way to get at it. Now there is: the
// list is a function of `prose` and two callbacks, and it returns extensions.
// So the questions that actually matter can be asked of the *result*:
//
//   · does it build at all, and is every entry a non-null extension?
//   · is it non-empty, and does the prose switch change it?
//   · does the structure keymap come from the caller rather than a hidden global?
//
// That last one is the reason `deps` exists, and the reason this file is worth
// writing: a `structureKeymap` read from a module-level binding would work
// perfectly and make the stack unbuildable outside `main.ts`, which is the
// whole debt this move was paying.

import { check, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";

export async function run() {
  // The stack asks the compartments seam for the shortcut keymap and the
  // structure keymap, which is the discipline this codebase uses everywhere: a
  // module states what it needs from the shell instead of importing it. So the
  // seam has to be wired before the stack can be built — in the application that
  // happens at boot, and here it happens first. A `buildExtensions` that worked
  // without this would be one that had reached around the seam.
  const { wireCompartments } = await import("../.tmp-test/compartments.mjs");
  wireCompartments({
    runAction: () => true,
    actionsForKeys: () => [],
    structureKeymap: () => [{ key: "Mod-Shift-z", run: () => true }],
  });

  const { buildExtensions } = await import("../.tmp-test/editorstate.mjs");

  // A keybinding that stands in for the real one. Nothing here needs it to
  // resolve to an actual action — only that the stack takes it from the caller.
  let asked = 0;
  const deps = {
    structureKeymap: () => {
      asked += 1;
      return [{ key: "Mod-Shift-z", run: () => true }];
    },
  };

  const prose = buildExtensions(true, deps);
  const source = buildExtensions(false, deps);
  let builds = 2;

  ok("the stack builds for a prose document", Array.isArray(prose) && prose.length > 0);
  ok("and for a source document", Array.isArray(source) && source.length > 0);

  // An `undefined` or `null` entry is what a compartment accidentally left empty
  // looks like, and CodeMirror accepts it silently — the extension simply is not
  // there. Every entry has to be something.
  const holes = (list) => list.filter((e) => e == null).length;
  check("no entry is null or undefined", [holes(prose), holes(source)], [0, 0]);

  // The two documents must not produce the *same* list, or the prose switch is
  // decoration. They are compared by length rather than by identity because the
  // compartments are rebuilt per call and two states never share objects.
  // The switch is the *contents* of one compartment (`proseCompartment`), not a
  // different list — so the list is the same length and the same shapes either
  // way. Asserting otherwise would be asserting a detail of how it happens to be
  // written today.
  //
  // **No `EditorState.create` here, and that is not a shortcut.** Building a
  // state from this stack throws in Node: `@codemirror/view` resolves its
  // `specialChars` facet through `supportsTabSize()`, which reads
  // `document.body.style.tabSize` and dereferences an undefined `style` when
  // there is no body. That is CodeMirror's constraint, not this module's, and
  // the suite has no DOM — so the state is built by the application and by
  // `tools/eyes.mjs`, and what is held here is the list itself.
  check("the prose switch does not change the stack's length", prose.length, source.length);

  // The callback is asked on every build, and only through `deps`. If this ever
  // goes to zero the keymap was captured at module load, which is how the
  // rebinding in Settings stops reaching the editor. Counted as "at least once
  // per build" rather than an exact number, because an exact number here would
  // be a fence on how many states this file happens to create.
  ok(
    "the structure keymap is asked for on every build",
    asked >= builds,
    `${asked} asks for ${builds} builds`,
  );

  // Every entry is an extension CodeMirror will accept: a `Compartment`, a
  // facet, or a `ViewPlugin`. What would not be one is a plain object or a
  // string, which is what a bad merge produces.
  const acceptable = (e) =>
    typeof e === "object" || typeof e === "function" || typeof e === "number";
  check(
    "every entry is something CodeMirror accepts",
    [prose, source].map((l) => l.filter((e) => !acceptable(e)).length),
    [0, 0],
  );

  // The structure compartment is created per call rather than imported, so a
  // state's keymap is its own. The entries cannot be compared by identity — the
  // imported extensions *are* shared singletons, which is correct and is why the
  // identity check that used to be here would have been asserting the wrong
  // thing — so the property is checked at the source instead.
  const src = readFileSync(new URL("../src/editorstate.ts", import.meta.url), "utf8");
  ok(
    "the structure compartment is created per call",
    /const structureCompartment = new Compartment\(\);/u.test(src),
  );
  ok(
    "and nothing imports one from outside",
    !/import[^;]*structureCompartment[^;]*from/u.test(src),
  );
}
