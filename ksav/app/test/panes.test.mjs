// The pane tree: how a window divides, and what survives dividing it.
//
// The margin comment that produced this module asked for one thing plainly:
// *"another helpful feature would be to be able to have multiple (you pick how
// many and how to split) previews or sources open at one time — meaning, all of
// the same doc, so you can look in one place as you type. We also should make
// that you can optionally unlink the scrolling."*
//
// Everything in `panes.ts` is a function from a tree to a tree, so all of that
// is testable without a DOM. What is asserted here is the shape: that splitting
// puts the new pane where it was asked for, that closing collapses rather than
// leaving a hole, and — the one that matters most — that changing one pane
// leaves every other pane **identical by reference**, because the renderer uses
// that to decide which editors it may leave alone. A pane rebuilt because a
// sibling resized is a pane that has lost its caret, its scroll and its folds,
// and a writer would experience that as the application forgetting where they
// were every time they dragged a divider.
//
// It also replaces two chips that cycled. That is not a shape assertion, but it
// is why the arrangements are data: a cycle is a picker with the options hidden.

import { check, ok, notOk } from "./harness.mjs";
import * as panes from "../.tmp-test/panes.mjs";

export async function run() {
  panes._resetIds();

  // ------------------------------------------------------------ the default

  {
    const t = panes.defaultTree();
    check("the window opens as a source beside a preview", panes.shapeOf(t), "(rowps)");
    check("which is two panes", panes.leaves(t).length, 2);
    check("and it is a shipped arrangement", panes.arrangementOf(t), "sourceAndPreview");
  }

  // ------------------------------------------------------------ splitting

  {
    const one = panes.leaf("source");
    check("one pane is a leaf", panes.leaves(one).length, 1);
    const two = panes.split(one, one.id, "col", panes.leaf("source"));
    check("splitting makes two", panes.leaves(two).length, 2);
    check("in the direction asked for", two.dir, "col");
    check("with the original first", two.a.id, one.id);
    check("and an even share", two.frac, 0.5);

    const before = panes.split(one, one.id, "row", panes.leaf("preview"), true);
    check("…or the new one first, when asked", before.a.role, "preview");
    check("with the original second", before.b.id, one.id);
  }

  {
    // Recursion is the whole reason this is a tree: "three previews beside a
    // source" needs no case of its own.
    let t = panes.leaf("source");
    const src = t.id;
    t = panes.split(t, src, "row", panes.leaf("preview"));
    const p1 = panes.leaves(t).find((l) => l.role === "preview");
    t = panes.split(t, p1.id, "col", panes.leaf("preview"));
    const p2 = panes.leaves(t).filter((l) => l.role === "preview")[1];
    t = panes.split(t, p2.id, "col", panes.leaf("preview"));
    check("three previews and a source", panes.leaves(t).length, 4);
    check("…of which three are previews", panes.leaves(t).filter((l) => l.role === "preview").length, 3);
  }

  // ------------------------------------------------------- structural sharing

  {
    // The property the renderer depends on. Everything the change did not touch
    // has to come back `===` to what it was, or rebuilding the DOM from the tree
    // throws away the carets of panes nobody touched.
    const a = panes.leaf("source");
    const b = panes.leaf("preview");
    const tree = panes.split(a, a.id, "row", b);
    const moved = panes.update(tree, a.id, { scrollTop: 900 });

    ok("the changed pane is a new object", panes.find(moved, a.id) !== a);
    check("…with the change in it", panes.find(moved, a.id).scrollTop, 900);
    ok("the untouched pane is the very same object", panes.find(moved, b.id) === b);

    // And a resize touches neither pane.
    const wider = panes.resize(tree, tree.id, 0.7);
    ok("resizing leaves both panes untouched", panes.find(wider, a.id) === a && panes.find(wider, b.id) === b);
    check("…and moves the split", wider.frac, 0.7);
  }

  {
    // A pane of zero width cannot be dragged back, so the fraction is clamped
    // rather than obeyed.
    const a = panes.leaf("source");
    const tree = panes.split(a, a.id, "row", panes.leaf("preview"));
    check("a drag past the edge stops short of it", panes.resize(tree, tree.id, 0).frac, 0.1);
    check("…at both ends", panes.resize(tree, tree.id, 1).frac, 0.9);
  }

  // ------------------------------------------------------------- closing

  {
    const a = panes.leaf("source");
    const b = panes.leaf("preview");
    const tree = panes.split(a, a.id, "row", b);
    const left = panes.closePane(tree, b.id);
    check("closing one pane leaves the other", panes.leaves(left).length, 1);
    check("…which takes the whole space", left.kind, "leaf");
    ok("…and is the very same pane", left === a);
  }

  {
    // Three deep: closing the middle one collapses its split and leaves the
    // other two where they were.
    let t = panes.leaf("source");
    const one = t.id;
    t = panes.split(t, one, "row", panes.leaf("preview"));
    const two = panes.leaves(t)[1].id;
    t = panes.split(t, two, "col", panes.leaf("preview"));
    const three = panes.leaves(t)[2].id;
    const after = panes.closePane(t, two);
    check("two panes are left", panes.leaves(after).length, 2);
    check("…and they are the right two", panes.leaves(after).map((l) => l.id).sort(), [one, three].sort());
  }

  {
    // A window with no panes is not a state this application has.
    const only = panes.leaf("source");
    check("the last pane cannot be closed", panes.closePane(only, only.id), only);
  }

  // ---------------------------------------------------------- what a pane owns

  {
    // Scroll, mode and the scroll link are per pane. That is the difference
    // between "a second view" and "the same view twice".
    const a = panes.leaf("source");
    const tree = panes.split(a, a.id, "col", panes.leaf("source", null, { linked: false }));
    const [first, second] = panes.leaves(tree);
    check("one pane follows its sibling", first.linked, true);
    check("…and the other does not", second.linked, false);

    const scrolled = panes.update(tree, first.id, { scrollTop: 120 });
    check("scroll is remembered per pane", panes.find(scrolled, first.id).scrollTop, 120);
    check("…and the sibling is where it was", panes.find(scrolled, second.id).scrollTop, 0);

    const raw = panes.update(scrolled, first.id, { prose: false });
    check("so is prose or raw", panes.find(raw, first.id).prose, false);
    check("…without touching the other", panes.find(raw, second.id).prose, undefined);
  }

  {
    // Which pane a linked pane follows: the one it shares a split with.
    const a = panes.leaf("source");
    const tree = panes.split(a, a.id, "row", panes.leaf("preview"));
    const b = panes.leaves(tree)[1];
    check("a pane's partner is across its own split", panes.sibling(tree, a.id).id, b.id);
    check("…and it is symmetric", panes.sibling(tree, b.id).id, a.id);
    check("a lone pane has no partner", panes.sibling(panes.leaf("source"), "nope"), undefined);
  }

  // ------------------------------------------------------------ arrangements

  {
    // Data, not a cycle. Each is a function so that two writers picking the same
    // arrangement do not end up sharing pane ids.
    ok("there are several to pick from", panes.ARRANGEMENTS.length >= 5);
    const ids = panes.ARRANGEMENTS.map((a) => a.id);
    check("…each named once", ids.filter((id, i) => ids.indexOf(id) !== i), []);
    for (const a of panes.ARRANGEMENTS) {
      const t = a.build();
      ok(`${a.id} builds panes`, panes.leaves(t).length >= 1);
      check(`${a.id} recognises itself`, panes.arrangementOf(t), a.id);
      // Two calls must not share ids, or closing a pane in one window would
      // close a pane in another.
      const again = a.build();
      check(`${a.id} builds fresh ids each time`, panes.leaves(t)[0].id === panes.leaves(again)[0].id, false);
    }
  }

  {
    // The one the margins asked for by name. The second source is unlinked,
    // because looking somewhere else is the entire reason to open it.
    const t = panes.ARRANGEMENTS.find((a) => a.id === "twoSources").build();
    const sources = panes.leaves(t).filter((l) => l.role === "source");
    check("two source panes", sources.length, 2);
    check("…and the second scrolls on its own", sources[1].linked, false);
  }

  {
    const t = panes.ARRANGEMENTS.find((a) => a.id === "twoPreviews").build();
    check("two previews of one document", panes.leaves(t).filter((l) => l.role === "preview").length, 2);
  }

  {
    // A tree a writer built by hand is recognised if it happens to match, and
    // stops being recognised the moment they change it — so the picker never
    // claims they are in something they are not.
    const t = panes.defaultTree();
    check("a shipped arrangement is named", panes.arrangementOf(t), "sourceAndPreview");
    const altered = panes.split(t, panes.leaves(t)[0].id, "col", panes.leaf("preview"));
    check("…and an altered one is not", panes.arrangementOf(altered), null);
  }

  {
    // The shape ignores ids and fractions, which is what lets it be compared —
    // and includes the scroll link, because a pane that follows its sibling and
    // one that does not are genuinely different arrangements.
    const a = panes.leaf("source");
    const t1 = panes.split(a, a.id, "row", panes.leaf("preview"));
    const t2 = panes.resize(t1, t1.id, 0.8);
    check("moving a divider does not change the shape", panes.shapeOf(t2), panes.shapeOf(t1));
    const unlinked = panes.update(t1, a.id, { linked: false });
    notOk("unlinking does", panes.shapeOf(unlinked) === panes.shapeOf(t1));
  }
}
