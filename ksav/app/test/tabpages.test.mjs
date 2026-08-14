// What a tab that is not on screen shows when you come back to it.
//
// A compile is 0.4–3 seconds. `openDoc` used to end at `scheduleCompile()`, so
// for that whole time every preview pane went on showing **the document you had
// just left** — under the new document's title, beside the new document's
// outline, with click-to-jump measuring against pages belonging to neither. A
// pane stating one document while the editor holds another is the family this
// application is audited for, and this is the mechanism that closes it: the
// pages each document was last seen with are kept, and switching draws its own.
//
// Three properties, and each is the reason a different half exists:
//
//   * **the pages are filed per document.** Not "the last page set", which is
//     what the preview already had and is exactly what made the stale pane
//     possible.
//   * **the cap evicts the least recently seen**, and re-filing counts as
//     seeing. Any other policy can throw away the tab you are switching to.
//   * **`idle` really compiles.** A setting that offers a third option and does
//     nothing with it is a lie in a `<select>`; the option means background
//     layouts of the other open documents, from the *open editor state* and each
//     with its own page setup.
//
// And one that belongs to nothing here and was found on the way: `current` — the
// record Print reads — is written even when there is no preview pane to draw
// into. See `drawPagesEverywhere`.

import { check, ok, notOk, installChrome, resetStorage } from "./harness.mjs";
import {
  clearPages,
  currentPages,
  drawPagesEverywhere,
  drawRemembered,
  filePages,
  forgetPages,
  rememberPages,
  rememberedCount,
  REMEMBERED_DOCUMENTS,
} from "../.tmp-test/preview.mjs";
import { compileUnfocused } from "../.tmp-test/compile.mjs";
import * as opendocs from "../.tmp-test/opendocs.mjs";
import * as docs from "../.tmp-test/docs.mjs";
import * as runtime from "../.tmp-test/runtime.mjs";
import { settings } from "../.tmp-test/settings.mjs";

/** An open-set entry whose text is whatever we say, which is all this needs. */
const entry = (id, text) => ({
  id,
  state: { doc: { toString: () => text } },
  scrollTop: 0,
  prose: false,
});

/** An engine that records every body it was handed and answers with one page. */
function backendRecording() {
  const seen = [];
  runtime.setBackend({
    async compile(body, config) {
      seen.push({ body, config });
      return {
        ok: true,
        pages_svg: [`<svg id="${seen.length}"/>`],
        pages_hash: [`h${seen.length}`],
        diagnostics: [],
      };
    },
  });
  return seen;
}

export async function run() {
  const chrome = installChrome();
  const wasPolicy = settings.tabCompile;
  try {
    // ------------------------------------------------- filed per document
    {
      for (const id of ["a", "b", "c"]) forgetPages(id);
      filePages("a", ["<svg>A</svg>"], ["ha"]);
      filePages("b", ["<svg>B</svg>"], ["hb"]);
      ok("a document with kept pages has something to draw", drawRemembered("a"));
      ok("…and so does the other one", drawRemembered("b"));
      notOk("a document never seen has not", drawRemembered("c"));
      check("and the two did not become one", rememberedCount(), 2);
    }

    // A page set with no names is still a page set. An engine too old to send
    // hashes would otherwise remember nothing at all — the same defect
    // `drawPages` already carried once, in the other direction.
    {
      forgetPages("nameless");
      filePages("nameless", ["<svg/>"], undefined);
      ok("pages with no hashes are still kept", drawRemembered("nameless"));
      forgetPages("nameless");
    }

    // Nothing is not something. An empty page set is what a *failed* compile
    // produces, and filing it would replace a good page with a blank one.
    {
      forgetPages("a");
      filePages("a", [], []);
      notOk("an empty page set is not filed", drawRemembered("a"));
    }

    // ------------------------------------------------- the cap, and eviction
    {
      for (let i = 0; i < REMEMBERED_DOCUMENTS + 4; i++) forgetPages(`d${i}`);
      forgetPages("b");
      for (let i = 0; i < REMEMBERED_DOCUMENTS + 3; i++) {
        filePages(`d${i}`, [`<svg>${i}</svg>`], [`h${i}`]);
      }
      check("the kept set is capped", rememberedCount(), REMEMBERED_DOCUMENTS);
      notOk("the oldest went", drawRemembered("d0"));
      ok("the newest stayed", drawRemembered(`d${REMEMBERED_DOCUMENTS + 2}`));
    }

    // Re-filing counts as seeing. Without this the document you keep returning
    // to is the one evicted, which is the only outcome that makes the cap worse
    // than no cap at all.
    {
      const oldest = `d${REMEMBERED_DOCUMENTS + 3 - REMEMBERED_DOCUMENTS}`;
      ok("the oldest survivor is there to start with", drawRemembered(oldest));
      filePages(oldest, ["<svg>again</svg>"], ["again"]);
      for (let i = 0; i < 3; i++) filePages(`fresh${i}`, [`<svg>${i}</svg>`], [`f${i}`]);
      ok("a document re-filed is not evicted by the next three", drawRemembered(oldest));
      for (let i = 0; i < 3; i++) forgetPages(`fresh${i}`);
    }

    // ------------------------------------------------- what a switch draws
    //
    // `rememberPages` files *what is on screen*, which is the half `openDoc`
    // calls on the way out. With no preview pane in this harness the drawing is
    // a no-op; what is asserted is the record, which is what the next switch
    // reads.
    {
      forgetPages("out");
      drawPagesEverywhere(["<svg>on screen</svg>"], ["hs"]);
      rememberPages("out");
      ok("leaving a document keeps the pages it was showing", drawRemembered("out"));
    }

    // The bug this whole file is about, stated as a property: after clearing,
    // nothing claims to be showing the pages of the document that has gone.
    {
      drawPagesEverywhere(["<svg>previous sefer</svg>"], ["hp"]);
      check("the previous document's pages are what is current", currentPages().length, 1);
      clearPages();
      check("and switching away leaves nothing standing under the new name", currentPages().length, 0);
    }

    // Found on the way, and it belongs to Print rather than to tabs: a
    // source-only layout has no preview host, and `drawPagesEverywhere` used to
    // return before recording anything. `currentPages()` is what the print path
    // and the page-range chooser read.
    {
      drawPagesEverywhere(["<svg>one</svg>", "<svg>two</svg>"], ["h1", "h2"]);
      check(
        "the pages are recorded even with no pane to draw them into",
        currentPages().length,
        2,
      );
    }

    // ------------------------------------------------- the `idle` policy
    {
      await resetStorage();
      opendocs.reset();
      const one = await docs.createDoc("ראשון", "גוף ראשון");
      const two = await docs.createDoc("שני", "גוף שני");
      const three = await docs.createDoc("שלישי", "גוף שלישי");
      opendocs.put(entry(one.id, one.body));
      opendocs.put(entry(two.id, "גוף שני, ולא נשמר"));
      opendocs.put(entry(three.id, three.body));
      opendocs.focus(one.id);
      for (const d of [one, two, three]) forgetPages(d.id);

      settings.tabCompile = "keep";
      const quiet = backendRecording();
      check("under `keep`, nothing is compiled behind your back", await compileUnfocused(), 0);
      check("…and the engine was not asked", quiet.length, 0);

      settings.tabCompile = "onSwitch";
      check("under `onSwitch` either", await compileUnfocused(), 0);
      check("…and the engine was not asked then either", quiet.length, 0);

      settings.tabCompile = "idle";
      const seen = backendRecording();
      check("under `idle`, the other open documents are laid out", await compileUnfocused(), 2);
      check("one layout each, and none for the focused one", seen.length, 2);
      notOk(
        "the focused document is not compiled twice",
        seen.some((r) => r.body.includes("גוף ראשון")),
      );
      ok(
        "the body comes from the open editor state, not from storage",
        seen.some((r) => r.body.includes("גוף שני, ולא נשמר")),
      );
      ok("and the pages are filed where a switch will find them", drawRemembered(two.id));
      ok("for both of them", drawRemembered(three.id));
      notOk(
        "the focused document's own pages are left to its own compile",
        seen.some((r) => r.body.includes("גוף ראשון")),
      );

      // Each document's own page setup. Laying an unfocused sefer out with the
      // focused one's margins would file pages of the right text on the wrong
      // paper — and they are the pages a switch then shows.
      two.config = { margin_cm: 5 };
      await docs.putDoc(two);
      const setups = backendRecording();
      await compileUnfocused();
      const forTwo = setups.find((r) => r.body.includes("גוף שני"));
      check("an unfocused document is laid out with its own page setup", forTwo?.config.margin_cm, 5);
      const forThree = setups.find((r) => r.body.includes("גוף שלישי"));
      notOk(
        "…and its neighbour does not inherit it",
        forThree?.config.margin_cm === 5,
      );

      // A background layout that fails is a background layout that fails. The
      // writer asked for nothing and must be told nothing — and, crucially, the
      // kept pages must survive, so the switch still has something true to draw.
      {
        runtime.setBackend({
          async compile() {
            throw new Error("the engine went away");
          },
        });
        check("a failed background layout lays out nothing", await compileUnfocused(), 0);
        ok("and the pages already kept are still there", drawRemembered(two.id));
      }

      opendocs.reset();
    }
  } finally {
    settings.tabCompile = wasPolicy;
    chrome.restore?.();
  }
}
