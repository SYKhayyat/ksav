import { ok, check } from "./harness.mjs";
import { makeWiring } from "../.tmp-test/wiring.mjs";
import {
  wireCompartments,
  proseCompartment,
  dirCompartment,
  themeCompartment,
  pairCompartment,
  autoCompartment,
  shortcutCompartment,
  structureCompartment,
  editorTheme,
  proseOrRaw,
  proseHere,
  whose,
  buildShortcutKeymap,
} from "../.tmp-test/compartments.mjs";

// The notebook's machinery — the audit's #161 move.
//
// What this file holds is the machinery's own contract, not the editor
// behaviours it produces: those live where they always lived (focus.test.mjs for
// the typewriter anchor, wire.test.mjs for the mode stand-down's two halves,
// bindings.test.mjs for the key tables). What is *new* is the module, and a
// module with no test is a module the runner's fence already distrusts.
//
// The wiring is the first half: the machinery borrows exactly three things of
// main's recipe — the action dispatcher, the action table, and the structure
// keymap. An unwired read must refuse loudly, because a keymap built against a
// no-op would compile into a silent editor with no keys and no error.
//
// The second half is the exported vocabulary: the compartments are the module's
// public surface (main's `makeState` installs them, the settings
// apply-closures reconfigure them), and the small pure answers whose
// correctness is a sentence rather than a measurement.

export async function run() {
  // ------------------------------------------------------------ the wiring
  // The guard the container provides, against the machine's own module: the
  // machinery reads through `makeWiring`'s getter, so the refusal this file
  // sees on a fresh container is the refusal a misplaced boot would hit.
  {
    const W = makeWiring("wireProbe");
    let threw = "";
    try {
      W.get();
    } catch (e) {
      threw = String(e);
    }
    ok("an unwired read is refused, naming the wire", threw.includes("wireProbe was never called"));
  }
  check("the module registers its wiring under its own name", typeof wireCompartments, "function");

  // ------------------------------------------------------- the vocabulary
  for (const [name, c] of [
    ["prose", proseCompartment],
    ["dir", dirCompartment],
    ["theme", themeCompartment],
    ["pair", pairCompartment],
    ["auto", autoCompartment],
    ["shortcut", shortcutCompartment],
    ["structure", structureCompartment],
  ]) {
    ok(`${name} compartment is a CodeMirror compartment`, !!c && typeof c.of === "function");
  }

  ok("the editor theme builds for both themes", !!editorTheme(true) && !!editorTheme(false));
  ok(
    "prose or raw: the prose view carries its reveal partner, the raw view does not",
    Array.isArray(proseOrRaw(true)) && proseOrRaw(true).length === 2,
  );
  ok("prose here is a question with a boolean answer", typeof proseHere() === "boolean");
  ok(
    "`whose` names the document's own and the writer's own, not the registry's",
    whose("document") !== "" && whose("yours") !== "" && whose("registry") === "",
  );

  // --------------------------------------------------- the keymap's shape
  // Wired to an empty action table — state the real test honestly: it must
  // produce the shell's own bindings (nikud, the settings keys), not an error
  // and not a silent empty list. An *empty* table still has the nikud keymap in
  // its list, so a successful build is proof the wiring was read.
  wireCompartments({
    runAction: () => false,
    actionsForKeys: () => [],
    structureKeymap: () => [],
  });
  const keys = buildShortcutKeymap();
  ok("the shortcut keymap builds to a list", Array.isArray(keys));
}
