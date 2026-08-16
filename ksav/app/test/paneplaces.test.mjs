// Where each pane was standing in each document.
//
// The open set holds one `EditorState` per document — one text, one undo
// history, one caret — and a window with three source panes onto one sefer has
// three places in it. Switching away and back put all three at the focused
// pane's caret, which makes the second pane something a writer rebuilds by hand
// every time they change document. `showInEveryPane` carried the limit as a
// comment; this is the fence for the fix.
//
// Two halves, because the fix has two. `paneplaces.ts` is pure and is tested as
// such. The wiring is in `main.ts`, which boots the application on import and
// so cannot be evaluated here — what is checked instead is that the switch path
// still calls both halves, in the order that makes them mean anything, read out
// of `openDoc`'s own body rather than out of a 10,000-line string.

import { check, ok, notOk } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as places from "../.tmp-test/paneplaces.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAIN = readFileSync(path.join(HERE, "..", "src", "main.ts"), "utf8");

/**
 * One top-level function's body, by name.
 *
 * Sliced rather than searched for in the whole file, which is the mistake
 * `chrome.test.mjs` documents at length: a match anywhere in ten thousand lines
 * credits the wrong function with somebody else's call, and stays green through
 * a refactor that moved the thing being checked out of the path entirely.
 */
function bodyOf(name) {
  const at = MAIN.indexOf(`function ${name}(`);
  if (at < 0) return null;
  const end = MAIN.indexOf("\n}\n", at);
  return end < 0 ? null : MAIN.slice(at, end);
}

export async function run() {
  places.reset();

  // ----------------------------------------------------- a place per pane

  {
    places.remember("p1", "aleph", { anchor: 10, head: 10, scrollTop: 40 });
    places.remember("p2", "aleph", { anchor: 900, head: 950, scrollTop: 1200 });
    // The same pane, in a second document. This is the pair the whole module is
    // for: one pane, two documents, two places.
    places.remember("p1", "beis", { anchor: 3, head: 3, scrollTop: 0 });

    check("a pane's place in one document", places.recall("p1", "aleph").anchor, 10);
    check("…is not another pane's place in it", places.recall("p2", "aleph").anchor, 900);
    check("…and not its own place in another document", places.recall("p1", "beis").anchor, 3);
    check("a selection keeps both ends", places.recall("p2", "aleph").head, 950);
    check("and the scroll, which is not the caret", places.recall("p2", "aleph").scrollTop, 1200);
  }

  // A pane that has never been in a document has no answer, and the caller must
  // not invent one: it opens at the *document's* caret — where the writer last
  // was — rather than at the top, and rather than at another pane's place.
  {
    notOk("a pane that has never been there remembers nothing", places.recall("p3", "aleph"));
    notOk("nor in a document nobody has opened", places.recall("p1", "gimel"));
  }

  // -------------------------------------------------------------- clamping

  {
    // The document can be edited from another pane, another tab, or by an
    // import, while this pane is showing something else — so a remembered
    // offset is a claim about a text that may no longer be that long.
    const far = places.within({ anchor: 900, head: 950, scrollTop: 1200 }, 100);
    check("a place past the end comes back inside the document", far.head, 100);
    check("…both ends of it", far.anchor, 100);
    // The end of a document is a worse answer than where you were and a much
    // better one than the top: clamping must not quietly become "go home".
    ok("…and not at the top", far.anchor > 0);
    const near = places.within({ anchor: 10, head: 12, scrollTop: 40 }, 100);
    check("a place inside it is untouched", near.anchor, 10);
    check("…exactly", near.head, 12);
    const negative = places.within({ anchor: -5, head: -1, scrollTop: -20 }, 100);
    check("nothing comes back negative", negative.anchor, 0);
    check("…including the scroll", negative.scrollTop, 0);
  }

  // ------------------------------------------------------------- forgetting

  {
    check("two panes are standing in this document", places.panesRemembering("aleph").length, 2);
    places.forgetPane("p2");
    check("closing a pane takes its places with it", places.panesRemembering("aleph"), ["p1"]);
    notOk("…all of them", places.recall("p2", "aleph"));
    ok("…and leaves every other pane alone", !!places.recall("p1", "aleph"));

    places.forgetDoc("aleph");
    check("closing a document takes it out of every pane", places.panesRemembering("aleph"), []);
    ok("…and leaves the same pane's other documents", !!places.recall("p1", "beis"));
  }

  // The sweep the wiring uses: which panes are known at all, so a pane that
  // went with an arrangement change can be forgotten without every way of
  // closing one having to say so.
  {
    check("the table knows which panes it holds", places.panesKnown(), ["p1"]);
    places.reset();
    check("and reset empties it", places.panesKnown(), []);
  }

  // ------------------------------------------------- the switch path uses it
  //
  // `main.ts` cannot be imported — it boots the application — so this is read
  // out of the one function that does the switching. Both halves have to be
  // there and the order is the whole meaning: remembering after the state has
  // been replaced records the incoming document's caret against the outgoing
  // document's name, which is worse than not remembering at all.

  {
    const openDoc = bodyOf("openDoc");
    ok("openDoc is still a function in main.ts", !!openDoc);
    if (openDoc) {
      const remember = openDoc.indexOf("rememberPlaces(");
      const show = openDoc.indexOf("showInEveryPane(");
      const restore = openDoc.indexOf("restorePlaces(");
      ok("the switch remembers where the panes were", remember >= 0);
      ok("…and puts them back", restore >= 0);
      ok("…before the document is taken away", remember >= 0 && remember < show);
      ok("…and after the incoming one is in", restore > show);
    }

    // And every half reaches every pane rather than the focused one, which is
    // the bug in one sentence: `stashFocused` was the whole of it.
    for (const name of ["rememberPlaces", "restorePlaces", "restorePreviewPlaces"]) {
      const body = bodyOf(name);
      ok(`${name} exists`, !!body);
      if (!body) continue;
      ok(`${name} walks the pane tree`, body.includes("panes.leaves(paneTree)"));
      ok(`${name} asks each pane what role it is`, body.includes('l.role'));
    }

    // The printed page is the same complaint one pane over — a preview pane's
    // scroll is per pane and was not per document either — and it is restored
    // *after* the pages are drawn, because a scroll into an empty element is
    // silently clamped to zero.
    const previews = openDoc.indexOf("restorePreviewPlaces(");
    const pages = openDoc.indexOf("showPagesFor(");
    ok("the previews are put back too", previews >= 0);
    ok("…once there are pages to scroll through", previews > pages);

    // A pane that no longer exists is forgotten, and from the tabs rather than
    // from the pane being closed: replacing an arrangement drops panes too, and
    // it does not look like closing one.
    const sweep = bodyOf("forgetClosedPanes");
    ok("closed panes are swept", !!sweep);
    if (sweep) {
      ok("…across every tab, not just the one on screen", sweep.includes("tabs.all()"));
      ok("…by asking the table what it holds", sweep.includes("panesKnown()"));
    }
    ok(
      "closing a document forgets where the panes were in it",
      /paneplaces\.forgetDoc\(/u.test(MAIN),
    );
  }
}
