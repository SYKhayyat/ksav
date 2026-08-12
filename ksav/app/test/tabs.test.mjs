// Tabs: arrangements, and the one rule that keeps them from forking documents.
//
// **A tab does not own its documents.** The open set does. A tab remembers a
// pane tree and which pane was focused, and nothing else — so closing one closes
// an arrangement and every document it was showing is still open, with its text,
// its caret and its undo history. Break that rule and the same document is open
// in two tabs with two carets and two dirty flags, which is the forked state the
// open set exists to prevent and the mistake every editor that grew splits after
// document tabs has had to undo.
//
// The assertions below are mostly about that: what a tab holds, what it does not
// hold, and what closing one is allowed to destroy (nothing).
//
// The other half is the degenerate case, which is the argument for the whole
// design: with no splits and one document per arrangement, a tab is
// indistinguishable from an ordinary document tab, because its label follows the
// document in its focused pane. Renaming is the moment it stops being one, and
// that is also the moment a writer would want to.

import { check, ok, notOk } from "./harness.mjs";
import * as tabs from "../.tmp-test/tabs.mjs";
import * as panes from "../.tmp-test/panes.mjs";

/** A one-pane arrangement showing a named document. */
function on(docId) {
  return panes.leaf("source", docId);
}

export async function run() {
  // ------------------------------------------------------------- the strip

  {
    tabs.reset();
    check("nothing to begin with", tabs.count(), 0);
    const a = tabs.add(on("doc-a"));
    check("one tab", tabs.count(), 1);
    check("and it is the active one", tabs.current().id, a.id);

    // The first observation in the whole inventory was that sixteen things
    // compete for the top of the window before a word is typed. A strip showing
    // one tab spends a row of chrome telling a writer what they can already see.
    notOk("a single tab shows no strip", tabs.stripVisible());
    tabs.add(on("doc-b"));
    ok("two do", tabs.stripVisible());
  }

  {
    // A new tab lands *beside* the one you were in, not at the end. Somebody who
    // splits off a second view of what they are doing expects it next to them.
    tabs.reset();
    const a = tabs.add(on("a"));
    const c = tabs.add(on("c"));
    tabs.select(0);
    const b = tabs.add(on("b"));
    check("a new tab opens next to the active one", tabs.all().map((t) => t.id), [a.id, b.id, c.id]);
    check("…and becomes active", tabs.activeIndex(), 1);
  }

  // ------------------------------------------------------------ what a tab is

  {
    tabs.reset();
    const src = on("gemara");
    const tree = panes.split(src, src.id, "row", panes.leaf("preview", "gemara"));
    const tab = tabs.add(tree, null);
    ok("a tab holds a pane tree", !!tab.tree);
    check("…with its panes in it", panes.leaves(tab.tree).length, 2);
    // The thing it must *not* hold. Documents belong to the open set, and a tab
    // that carried its own copy is how one ends up open twice.
    notOk("a tab holds no documents of its own", "docs" in tab || "openSet" in tab);
  }

  // --------------------------------------------------------------- the label

  {
    tabs.reset();
    const titles = { "doc-a": "קונטרס", "doc-b": "מכתב" };
    const titleOf = (id) => titles[id];

    const tab = tabs.add(on("doc-a"));
    check("an unnamed tab is called after its document", tabs.label(tab, titleOf, "?"), "קונטרס");

    tabs.rename(0, "גמרא");
    check("…and after itself once named", tabs.label(tabs.all()[0], titleOf, "?"), "גמרא");

    // Blank takes it back to following the document, which is the only sensible
    // reading of clearing the field — and the alternative, a tab called "", is
    // a tab nobody can find.
    tabs.rename(0, "   ");
    check("a blank name goes back to the document", tabs.label(tabs.all()[0], titleOf, "?"), "קונטרס");
  }

  {
    // A tab whose focused pane names no document, or whose focused pane has been
    // closed, still has to be able to call itself something.
    tabs.reset();
    const tab = tabs.add(panes.leaf("preview", null));
    check("a tab with nothing to name itself after falls back", tabs.label(tab, () => undefined, "ללא שם"), "ללא שם");

    tabs.reset();
    const src = panes.leaf("source", "doc-a");
    const withBoth = panes.split(src, src.id, "row", panes.leaf("preview", "doc-a"));
    const t2 = tabs.add(withBoth, "a-pane-that-no-longer-exists");
    check("…and a stale focused pane falls back to the source", tabs.label(t2, () => "קונטרס", "?"), "קונטרס");
  }

  // -------------------------------------------------------------- switching

  {
    tabs.reset();
    tabs.add(on("a"));
    const second = tabs.add(on("b"));
    // Stashing is how the arrangement a writer altered survives leaving it.
    const altered = panes.split(second.tree, second.tree.id, "col", panes.leaf("preview"));
    tabs.stash(altered, null);
    tabs.select(0);
    check("the other tab is showing", tabs.activeIndex(), 0);
    tabs.select(1);
    check("and coming back finds what was left", panes.leaves(tabs.current().tree).length, 2);
  }

  {
    tabs.reset();
    tabs.add(on("a"));
    check("selecting a tab that is not there is refused", tabs.select(9), undefined);
    check("…and changes nothing", tabs.activeIndex(), 0);
  }

  // ---------------------------------------------------------------- closing

  {
    tabs.reset();
    const a = tabs.add(on("a"));
    const b = tabs.add(on("b"));
    const c = tabs.add(on("c")); // active: c, at index 2
    check("closing the active tab lands on the one before it", tabs.close(2).id, b.id);
    check("…and it is gone", tabs.count(), 2);

    // Closing something to the left of the active tab must not change which tab
    // is showing — only its index moves.
    tabs.select(1); // b
    check("closing to the left keeps you where you are", tabs.close(0).id, b.id);
    check("…with the index corrected", tabs.activeIndex(), 0);
    ok("and the other one really went", !tabs.all().some((t) => t.id === a.id));
  }

  {
    // A window with no arrangement is not a state this application has.
    tabs.reset();
    const only = tabs.add(on("a"));
    check("the last tab cannot be closed", tabs.close(0).id, only.id);
    check("…and it is still there", tabs.count(), 1);
  }

  // -------------------------------------------------------------- persisting

  {
    tabs.reset();
    tabs.add(on("a"));
    tabs.add(on("b"));
    tabs.rename(1, "letter");
    const saved = JSON.parse(JSON.stringify(tabs.serialise()));

    tabs.reset();
    check("a fresh session has nothing", tabs.count(), 0);
    ok("a stored strip comes back", tabs.restore(saved));
    check("…with both tabs", tabs.count(), 2);
    check("…the right one showing", tabs.activeIndex(), 1);
    check("…and the name intact", tabs.all()[1].name, "letter");
  }

  {
    // Storage is not to be trusted: a hand-edited or half-written blob must read
    // as "nothing stored" rather than putting a window together out of it.
    tabs.reset();
    notOk("nothing is not a strip", tabs.restore(undefined));
    notOk("nor is a string", tabs.restore("tabs"));
    notOk("nor an empty list", tabs.restore({ tabs: [], active: 0 }));
    notOk("nor a tab with no tree", tabs.restore({ tabs: [{ id: "x", name: null }], active: 0 }));
    check("and none of that left anything behind", tabs.count(), 0);
  }

  {
    // An out-of-range active index in a stored blob is a real possibility — a
    // crash between closing a tab and writing the strip — and landing on the
    // first tab beats landing on undefined.
    tabs.reset();
    ok("a strip with a bad index still restores", tabs.restore({ tabs: [{ id: "x", name: null, tree: panes.leaf("source"), focusedPane: null }], active: 7 }));
    check("…showing the first tab", tabs.activeIndex(), 0);
  }
}
