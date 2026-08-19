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

  // ------------------------------------------------------------ swapping
  //
  // *"There is no way to swap right and left (swap panes)"*, and then, asked
  // what the command should flip: *"there should be a command to move any window
  // to swap it with another window (like in hyprland)"*. So: any two panes,
  // anywhere in the tree, and the direction decided by where they are on screen
  // rather than by which side of a split they happen to be on.

  {
    const t = panes.defaultTree();
    const [prev, src] = panes.leaves(t);
    const swapped = panes.swap(t, prev.id, src.id);
    check("swapping two panes trades their places", panes.leaves(swapped).map((l) => l.role), [
      "source",
      "preview",
    ]);
    check("…and it is still two panes", panes.leaves(swapped).length, 2);
    // The property the renderer depends on. `renderPanes` carries an editor
    // across only for a leaf it can find by id, and every caret, scroll and fold
    // in that pane rides on the object being the same one.
    ok("the panes themselves come through by reference", panes.leaves(swapped)[0] === src);
    ok("both of them", panes.leaves(swapped)[1] === prev);
    check(
      "swapping twice is where you started",
      panes.shapeOf(panes.swap(swapped, prev.id, src.id)),
      panes.shapeOf(t),
    );
  }

  {
    // The size stays with the *place*, not with the pane — which is what makes a
    // swap reversible, and what every tiling window manager does.
    const base = panes.defaultTree();
    const sized = panes.resize(base, panes.splits(base)[0].id, 0.75);
    const [a, b] = panes.leaves(sized);
    const after = panes.swap(sized, a.id, b.id);
    check("the wide slot stays wide", panes.splits(after)[0].frac, 0.75);
    check("and the pane that moved into it is the other one", panes.leaves(after)[0].id, b.id);
  }

  {
    const t = panes.defaultTree();
    const [a] = panes.leaves(t);
    check("swapping a pane with itself is a no-op", panes.swap(t, a.id, a.id), t);
    check("…as is swapping with a pane that is not here", panes.swap(t, a.id, "nope"), t);
  }

  {
    // Geometry. A row divided 0.5, then its right half split into two rows: the
    // arrangement `twoPreviews` is, and the one where "which pane is on my
    // right" has more than one candidate.
    let t = panes.leaf("source");
    const src = t.id;
    t = panes.split(t, src, "row", panes.leaf("preview")); // source | preview
    const prev = panes.leaves(t).find((l) => l.role === "preview").id;
    t = panes.split(t, prev, "col", panes.leaf("preview")); // …the preview stacked
    const lower = panes.leaves(t)[2].id;

    const boxes = panes.rects(t);
    check("three panes have three places", boxes.length, 3);
    check("the source takes the left half", boxes.find((r) => r.id === src).w, 0.5);
    check("…and its full height", boxes.find((r) => r.id === src).h, 1);
    check("the lower preview starts halfway down", boxes.find((r) => r.id === lower).y, 0.5);

    check("right of the source is the pane it is level with", panes.neighbor(t, src, "right"), prev);
    check("nothing is left of the source", panes.neighbor(t, src, "left"), undefined);
    check("nor above it", panes.neighbor(t, src, "up"), undefined);
    check("below the upper preview is the lower one", panes.neighbor(t, prev, "down"), lower);
    check("and left of the lower preview is the source", panes.neighbor(t, lower, "left"), src);
    // A corner touch is not a neighbour: the lower preview and the source share
    // a real edge, but a pane that met one only at a point would not.
    check("nothing is right of the previews", panes.neighbor(t, prev, "right"), undefined);
  }

  {
    // Right-to-left, where a flex row lays its first child out on the right. The
    // tree is identical and every answer flips, which is the whole reason the
    // direction is an argument rather than an assumption.
    const t = panes.defaultTree();
    const [prev, src] = panes.leaves(t);
    check("in LTR the first child is on the left", panes.rects(t)[0].x, 0);
    check("in RTL it is on the right", panes.rects(t, { rtl: true })[0].x, 0.5);
    check("so 'right' finds the source", panes.neighbor(t, prev.id, "right"), src.id);
    check("and mirrored, 'left' does", panes.neighbor(t, prev.id, "left", { rtl: true }), src.id);
    check("with nothing the other way", panes.neighbor(t, prev.id, "right", { rtl: true }), undefined);
  }

  {
    // Under the narrow breakpoint every split is a column whatever it says, so a
    // window with no left and right must not answer for one.
    const t = panes.defaultTree();
    const [prev, src] = panes.leaves(t);
    check("stacked, the second pane is below", panes.neighbor(t, prev.id, "down", { stacked: true }), src.id);
    check("…and there is nothing beside it", panes.neighbor(t, prev.id, "right", { stacked: true }), undefined);
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

  // ------------------------------------------------------- zooming a region
  //
  // *"There should be an easier way to zoom in on a window — it should be with
  // its split etc."* The second clause is what decides the shape: the thing
  // zoomed is a **region**, not a pane, because a writer reading a sefer in two
  // columns wants both columns big and the node that means "both columns" is
  // their parent. So one key walks out through the regions a pane sits in and
  // comes back round to the whole window, and this is the arithmetic of that
  // walk, tested away from any DOM.
  {
    panes._resetIds();
    // ((source | preview) / notes) — a pane, its split, and an outer split, so
    // there are two genuine stops on the way out and not just one.
    const src = panes.leaf("source");
    const inner = panes.split(src, src.id, "row", panes.leaf("preview"));
    const outer = panes.split(inner, inner.id, "col", panes.leaf("notes"));

    check("the chain runs from the pane out to the window", panes.zoomChain(outer, src.id), [
      src.id,
      inner.id,
      outer.id,
    ]);
    // The whole point of the request, in one assertion: the second press does
    // not zoom a different pane, it widens to take the split with it.
    check("the first press shows the pane", panes.nextZoom(outer, src.id, null), src.id);
    check("the second takes its split with it", panes.nextZoom(outer, src.id, src.id), inner.id);
    // The root is not a zoom — showing the root alone is showing everything — so
    // it is spelled the way every other caller spells "no zoom", and the cycle
    // gets back to normal without a second key.
    check("and the third is the way out", panes.nextZoom(outer, src.id, inner.id), null);

    // A region left over from another pane, or from an arrangement that has been
    // replaced. Not an error: the walk starts again from this pane rather than
    // guessing where in it somebody else's region belonged.
    check("a foreign region restarts the walk", panes.nextZoom(outer, src.id, "p999"), src.id);

    // Any node, not just a leaf, which is the whole reason `find` was not enough.
    check("a split can be looked up by id", panes.nodeById(outer, inner.id).kind, "split");
    check("and a pane still can", panes.nodeById(outer, src.id).id, src.id);
    check("the split holding a pane", panes.parentOf(outer, src.id).id, inner.id);
    check("and nothing above the root", panes.parentOf(outer, outer.id), undefined);
  }

  {
    // One pane is not zoomable, and must not pretend to be: the only region it
    // sits in is the window, and showing the window alone is showing the window.
    panes._resetIds();
    const only = panes.leaf("source");
    check("a lone pane has nowhere to zoom to", panes.nextZoom(only, only.id, null), null);
    // And a pane that has been closed while zoomed. The stale id is over, not
    // broken — the alternative is a window showing a region that is gone.
    const t = panes.defaultTree();
    check("a pane that is no longer there zooms to nothing", panes.nextZoom(t, "p999", null), null);
    check("and no focused pane means no zoom", panes.nextZoom(t, null, "p1"), null);
  }

  // -------------------------------------------------- what a drop would mean
  //
  // *"Dragging is not great — it tends to split in half the other way, not
  // switch."* The gesture had swap-on-the-middle from the day it was written,
  // and a comment claiming the middle was "the easy target". The geometry said
  // otherwise: four edge bands of a quarter each leave `(1 - 2×0.25)²` of the
  // pane meaning swap, which is **a quarter of it**. Three quarters of every
  // pane meant split.
  {
    // A 1000×600 pane: bands of 96px, which is the cap, on every side.
    const at = (x, y) => panes.dropIntentAt(1000, 600, x, y);
    check("the middle swaps", at(500, 300), "swap");
    check("the left edge splits to the left", at(20, 300), "left");
    check("the right edge to the right", at(980, 300), "right");
    check("the top to the top", at(500, 10), "up");
    check("the bottom to the bottom", at(500, 590), "down");
    // The band ends where it says it ends, on both sides of the line.
    check("just inside the band is still an edge", at(95, 300), "left");
    check("and just outside it is a swap", at(97, 300), "swap");
  }

  {
    // The share, on a pane small enough that the cap does not bite: 15% of 400
    // is 60. Which is the number that matters — the middle is now 49% of the
    // area rather than 25%, so a drop aimed at nothing in particular swaps.
    const at = (x, y) => panes.dropIntentAt(400, 400, x, y);
    check("a small pane's band is a share of it", at(59, 200), "left");
    check("…and no more", at(61, 200), "swap");
    // A corner belongs to whichever band the pointer is *deeper* into, measured
    // per band rather than in raw pixels — or a wide short pane's top band wins
    // every corner simply because the pane is short.
    check("a corner picks the nearer band", panes.dropIntentAt(1000, 200, 5, 20), "left");
    check("and the other corner the other one", panes.dropIntentAt(200, 1000, 20, 5), "up");
  }

  {
    // The whole pane is reachable: no point in a pane is undefined, and every
    // one of the five answers is producible. A sweep rather than five points,
    // because the failure this replaces was a *distribution* — every individual
    // point behaved exactly as written.
    const seen = new Set();
    let inside = 0;
    const W = 800;
    const H = 600;
    for (let x = 0; x <= W; x += 10) {
      for (let y = 0; y <= H; y += 10) {
        const what = panes.dropIntentAt(W, H, x, y);
        seen.add(what);
        if (what === "swap") inside++;
      }
    }
    check("every intent is reachable", [...seen].sort(), ["down", "left", "right", "swap", "up"]);
    // The claim the old comment made and the geometry did not keep. 800×600 with
    // a 96px cap leaves 608×408 of middle, which is 51.7% of the pane.
    const share = inside / ((W / 10 + 1) * (H / 10 + 1));
    ok(`swapping is the majority of the pane, not a quarter of it (${Math.round(share * 100)}%)`, share > 0.5);
  }
}
