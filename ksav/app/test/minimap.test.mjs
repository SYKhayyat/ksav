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
import { minimapExtension, configFor, clampPlacement, defaultPlacement, KEEP_ONSCREEN } from "../.tmp-test/minimap.mjs";
import { MINIMAP_WIDTH, minimapIsOpen } from "../.tmp-test/minimapstrip.mjs";

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

  // # The placement, which is pure and therefore held properly.
  //
  // "The writer drags it" makes the **recovery** the interesting question: a strip
  // dragged off the bottom of the window and remembered there is a feature that cannot
  // be used again without restarting the application.
  {
    const size = { w: 92, h: 540 };
    const bounds = { w: 1400, h: 900 };

    check("a position inside the window is left alone",
      clampPlacement({ x: 300, y: 300 }, size, bounds), { x: 300, y: 300 });

    // Too far out, and far enough still to be got back.
    const offBottom = clampPlacement({ x: 300, y: 5000 }, size, bounds);
    ok("a strip dragged off the bottom is pulled back", offBottom.y <= bounds.h - KEEP_ONSCREEN,
      `y=${offBottom.y}`);
    const offLeft = clampPlacement({ x: -5000, y: 300 }, size, bounds);
    ok("and off the left", offLeft.x >= KEEP_ONSCREEN - size.w, `x=${offLeft.x}`);
    ok("both keep a usable grab of the strip", offBottom.y >= 0 && offLeft.x <= 0);

    // And the clamp is idempotent — a drag event arrives many times, and a clamp that
    // moved the strip a little further on each pass would walk it off the screen.
    const once = clampPlacement({ x: 300, y: 5000 }, size, bounds);
    check("clamping twice changes nothing more", clampPlacement(once, size, bounds), once);
  }

  {
    // # The reading edge decides the default side.
    //
    // The question I asked and had not had answered: a minimap on the side the text
    // *starts* on fights the reading. Default to the far side in both directions, and
    // let a drag override it.
    const size = { w: 92, h: 540 };
    const bounds = { w: 1400, h: 900 };
    const rtl = defaultPlacement(size, bounds, "rtl");
    const ltr = defaultPlacement(size, bounds, "ltr");
    ok("Hebrew opens on the left", rtl.x < bounds.w / 2, `x=${rtl.x}`);
    ok("English opens on the right", ltr.x > bounds.w / 2, `x=${ltr.x}`);
    ok("both are inside the window",
      rtl.x >= 0 && rtl.x + size.w <= bounds.w && ltr.x + size.w <= bounds.w);
    // Vertically a quarter down: near the top is where the text starts and the strip
    // would cover the first thing a writer opens a document to read.
    ok("a quarter of the way down, not at the very top", rtl.y > 50 && rtl.y < bounds.h * 0.5);
  }

  {
    // Degenerate windows must not produce a strip that is unreachable.
    const tiny = { w: 200, h: 120 };
    const p = defaultPlacement({ w: 92, h: 540 }, tiny, "rtl");
    ok("a window smaller than the strip still gets it on screen", p.y >= 0 && p.y < tiny.h);
    const zero = defaultPlacement({ w: 92, h: 540 }, { w: 0, h: 0 }, "ltr");
    ok("and a zero-sized window does not divide by anything",
      Number.isFinite(zero.x) && Number.isFinite(zero.y));
  }

  // # The strip's own two facts, held.
  //
  // `MINIMAP_WIDTH` is not decorative: it is the width `clampPlacement` and
  // `defaultPlacement` are given, so a width that disagreed with the CSS would make
  // the clamp compute against a box the writer cannot see.
  {
    ok("the strip is narrow — it is a picture, not a pane", MINIMAP_WIDTH < 140,
      `${MINIMAP_WIDTH}px`);
    ok("and wide enough to drag", MINIMAP_WIDTH >= 60);
    // Nothing is open in a test, and `open` is module state — so this is also the
    // fence that a stray `openMinimap` in module scope has not happened.
    ok("no strip is open without somebody opening it", minimapIsOpen() === false);
  }
}
