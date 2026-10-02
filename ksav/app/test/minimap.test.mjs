// #89 — the minimap's configuration, held without a DOM.
//
// What is testable here is **which configuration the facet is given**, because that is
// where the three answers live: shape by default, colours on request, and *closed costs
// nothing* — which is `null` to the facet, not an empty object.
//
// What cannot be tested here is that the strip looks right, which is `tools/eyes.mjs`.

import { check, ok } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { minimapExtension, configFor } from "../.tmp-test/minimap.mjs";

export async function run() {


  {
    // # Closed is `null`, and that is the whole cost argument.
    //
    // Not `{}` — `null` is what the facet is given when there is nothing to show, and
    // it is the difference between "draws an empty strip" and "does not exist".
    const cfg = configFor({ on: false, colors: false });
    check("a closed minimap is null, not an empty config", cfg, null);
  }

  {
    const cfg = configFor({ on: true, colors: false });
    ok("an open minimap has a config", cfg !== null);
    check("which draws shape, not text", cfg.displayText, "blocks");
    check("with no gutters, because colours are off", cfg.gutters, undefined);
    check("and the viewport overlay on", cfg.showOverlay, "always");
  }

  {
    // # Colours on request — the setting, and nothing else changes.
    //
    // `blocks` and the overlay must be identical either way, or turning colours on would
    // also change what the thing draws. That is the assertion a "just pass the option
    // through" implementation gets wrong by rebuilding the whole object.
    const plain = configFor({ on: true, colors: false });
    const coloured = configFor({ on: true, colors: true });
    check("colours on still draws shape", coloured.displayText, plain.displayText);
    check("and still shows the overlay", coloured.showOverlay, plain.showOverlay);
    ok("but now has gutters", Array.isArray(coloured.gutters) && coloured.gutters.length > 0);
  }

  {
    // `characters` is the other mode and it is what we do **not** want: at minimap width
    // the actual text is unreadable, and "shows everything in small" means shape.
    ok("the unreadable mode is not what ships",
      configFor({ on: true, colors: false }).displayText !== "characters");
  }

  // The wiring fence. Everything above can pass with the feature absent.
  {
    const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
    ok("the minimap is in the editor's extension list", /minimapExtension\(/u.test(main),
      "without this every assertion above still passes");
    ok("and both settings reach it", /settings\.minimap\b/u.test(main) && /settings\.minimapColors/u.test(main));
    // # The cost claim, as a source fact rather than a timing.
    //
    // The claim is that there is no second copy of the document. That is decided by
    // *where* the extension is placed: in this editor's own list, and not in a panel
    // that builds a view of its own.
    const pkg = readFileSync(
      new URL("../node_modules/@replit/codemirror-minimap/dist/index.js", import.meta.url),
      "utf8",
    );
    ok("and the package never builds an editor of its own",
      !pkg.includes("new EditorView"),
      "a second EditorView would mean a second copy of the sefer");
  }
}
