// Panes: a tree of views onto the open documents.
//
// # What a pane is
//
// A **pane** shows one document in one **role** — its source, or its printed
// preview. Panes form a split tree: every split is a row or a column with two
// children and a fraction saying how the space divides, and every leaf is a
// pane. That is the whole shape, and it is recursive, so "three previews beside
// a source" needs no special case.
//
// The reference point is Emacs, and the fidelity is deliberate: any number of
// windows onto one buffer, each with its own point, its own scroll and its own
// mode. What is deliberately **not** kept is Emacs making `buffer-undo-list`
// buffer-local per indirect buffer. One undo history per document, shared by
// every pane, is the lesson from the bug that ate a document: an undo stack with
// opinions about text it no longer owns is how a document goes missing.
//
// # What a pane owns, and what it does not
//
// Owns: its caret, its scroll, its zoom, its fold state, whether it shows prose
// or raw, and whether its scroll is tied to a sibling's.
//
// Does not own: the text. Typing in one pane appears in every pane showing that
// document, because they are views of one document and not copies of it. The
// document, its text and its undo history live in `opendocs.ts`.
//
// # Why this module is pure
//
// Everything here is a function from a tree to a tree. No DOM, no CodeMirror, no
// settings. The rendering lives in `main.ts` and reads the tree; the *shape* is
// decided here, where it can be tested — and where "closing the second of three
// panes leaves a sensible arrangement" is an assertion rather than a hope.
//
// # What this replaces
//
// Two chips that cycled. `Layout` cycled three fixed arrangements and `Preview
// side` cycled four positions, and the margin comment on both was the same: *"I
// don't like cycles — I like that people can pick which they want."* A cycle is
// a picker with the choices hidden and the wrong ones on the way to the right
// one. An arrangement is a tree you built or one this file ships, and both are
// chosen rather than arrived at.

/**
 * What a pane shows.
 *
 * `outline` and `notes` are here because of two margin comments that were the
 * same comment: *"maybe there should be a toggle to have this shift the other
 * panes open, because now it covers source"*, and, of the notes drawer, *"same
 * problem as the other drawers — there should be an option to have it resize the
 * panes (maybe also for all of them an option to float)."*
 *
 * A drawer that covers the source is a drawer you close to read what it is
 * telling you about. Once the window is a tree, "shift the other panes open" is
 * not a mode to add — it is what a pane already is.
 */
export type Role = "source" | "preview" | "outline" | "notes" | "marks";

/** The roles that show a document's text and can be typed in. */
export const EDITABLE: Role[] = ["source"];

/** One pane. */
export interface Leaf {
  kind: "leaf";
  id: string;
  role: Role;
  /**
   * The document this pane shows, or null for *whichever is focused*.
   *
   * Null is the ordinary case and not a placeholder: a writer who splits the
   * window wants both halves to follow them when they switch document. A pane
   * pinned to a document — for reading one sefer while typing another — is the
   * deliberate exception, and being able to say which is why this is nullable
   * rather than always resolved.
   */
  docId: string | null;
  /** Where this pane is scrolled to. Per pane; that is most of the point. */
  scrollTop: number;
  /**
   * Whether this pane's scroll follows the pane it was split from.
   *
   * Asked for by name — *"we also should make that you can optionally unlink
   * the scrolling"* — and per pane rather than per application, because the
   * answer differs between "a second view to look somewhere else" and "a
   * preview of what I am typing".
   */
  linked: boolean;
  /** Source panes: prose or raw. Undefined means *follow the document's*. */
  prose?: boolean;
  /** Both roles: 1 is unscaled. */
  zoom?: number;
}

/** A row or a column, with two children. */
export interface Split {
  kind: "split";
  id: string;
  dir: "row" | "col";
  /** The share of the space taken by `a`, between 0 and 1. */
  frac: number;
  a: PaneNode;
  b: PaneNode;
}

export type PaneNode = Leaf | Split;

let nextId = 0;
/** Ids are per session and never persisted, so a counter is enough. */
export function paneId(): string {
  return `p${++nextId}`;
}

/** For tests, so ids are predictable. */
export function _resetIds(): void {
  nextId = 0;
}

export function leaf(role: Role, docId: string | null = null, extra: Partial<Leaf> = {}): Leaf {
  return { kind: "leaf", id: paneId(), role, docId, scrollTop: 0, linked: true, ...extra };
}

/** Every pane in the tree, left to right and top to bottom. */
export function leaves(node: PaneNode): Leaf[] {
  return node.kind === "leaf" ? [node] : [...leaves(node.a), ...leaves(node.b)];
}

/**
 * Any node with this id — a pane **or** a split.
 *
 * `find` answers leaves only, which was right while every id anybody held was a
 * pane's. Zooming holds a *region*, and a region is usually a split: *"there
 * should be an easier way to zoom in on a window — it should be with its split
 * etc"*. A writer reading a sefer in two columns wants both columns big, not one
 * of them alone, and the node that means "both columns" is their parent.
 */
export function nodeById(node: PaneNode, id: string): PaneNode | undefined {
  if (node.id === id) return node;
  if (node.kind === "leaf") return undefined;
  return nodeById(node.a, id) ?? nodeById(node.b, id);
}

/** The split holding this node, or undefined at the root. */
export function parentOf(tree: PaneNode, id: string): Split | undefined {
  return splits(tree).find((s) => s.a.id === id || s.b.id === id);
}

/**
 * The regions a pane sits in, innermost first, ending at the whole window.
 *
 * This **is** the zoom control. One key rather than three, and each press widens
 * by one level: the pane, then the pane with whatever it is split against, then
 * that with its neighbour, and finally the window itself, which is the way out.
 *
 * A cycle rather than a toggle because the request was for the *easier* way and
 * a toggle is only easier when there are two panes. It is also the honest shape
 * of the answer: a window is a tree, so "bigger" is a walk up it, and every stop
 * on that walk is a region a writer might actually have meant.
 *
 * The last entry is the root, which is not a zoom at all — rendering the root
 * alone is rendering everything. Keeping it in the list is what makes the cycle
 * come back round to normal without a fourth key or a special case at the call
 * site.
 */
export function zoomChain(tree: PaneNode, leafId: string): string[] {
  if (!find(tree, leafId)) return [];
  const chain = [leafId];
  for (;;) {
    const up = parentOf(tree, chain[chain.length - 1]);
    if (!up) break;
    chain.push(up.id);
  }
  return chain;
}

/**
 * The next region to show, given what is shown now.
 *
 * `null` in and `null` out are both "the whole window", so a writer who has
 * closed the zoomed pane, or switched to an arrangement that never had one, gets
 * the window rather than a blank frame. Same for an id that is no longer in the
 * tree: a stale zoom is not an error state, it is just over.
 */
export function nextZoom(tree: PaneNode, leafId: string | null, now: string | null): string | null {
  if (!leafId) return null;
  const chain = zoomChain(tree, leafId);
  if (!chain.length) return null;
  const at = now === null ? -1 : chain.indexOf(now);
  // Somewhere else in the tree entirely — a zoom left over from another focused
  // pane. Start this pane's own walk from the beginning rather than guessing
  // where in it the old region belonged.
  const next = chain[at + 1];
  // The root is the end of the walk and means *no zoom*, so it is spelled the
  // way every other caller spells that.
  return next === undefined || next === tree.id ? null : next;
}

/** The pane with this id, if it is in the tree. */
export function find(node: PaneNode, id: string): Leaf | undefined {
  return leaves(node).find((l) => l.id === id);
}

/** Every split in the tree. */
export function splits(node: PaneNode): Split[] {
  return node.kind === "leaf" ? [] : [node, ...splits(node.a), ...splits(node.b)];
}

/**
 * Rebuild the tree with one node replaced.
 *
 * The engine under `split`, `closePane` and `update`. Structural sharing is not
 * an optimisation here — it is what keeps the panes that did not change
 * `===` to what they were, so the renderer can leave their DOM and their
 * `EditorView` alone. Rebuilding an editor because a sibling resized would throw
 * away the caret, the scroll and the folds of a pane nobody touched.
 */
function replace(node: PaneNode, id: string, make: (n: PaneNode) => PaneNode): PaneNode {
  if (node.id === id) return make(node);
  if (node.kind === "leaf") return node;
  const a = replace(node.a, id, make);
  const b = replace(node.b, id, make);
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

/**
 * Put something else where a node is, keeping every other pane identical.
 *
 * `replace` under a name callers may use. It is what `split` and `moveToEdge`
 * are both spelled with, and a caller building a split of its own — dropping a
 * pane onto the edge of another one — needs the same structural sharing or it
 * pays for its own cleverness in rebuilt editors.
 */
export function replaceLeaf(tree: PaneNode, id: string, make: (n: PaneNode) => PaneNode): PaneNode {
  return replace(tree, id, make);
}

/**
 * Split a pane in two, putting the new pane on one side of it.
 *
 * `before` puts the new pane first — left of, or above — which is what "split
 * left" means to everybody who has used a tiling editor. The fraction starts
 * even, because the writer asked for a split and not for a ratio.
 */
export function split(
  tree: PaneNode,
  id: string,
  dir: "row" | "col",
  fresh: Leaf,
  before = false,
): PaneNode {
  return replace(tree, id, (n) => ({
    kind: "split",
    id: paneId(),
    dir,
    frac: 0.5,
    a: before ? fresh : n,
    b: before ? n : fresh,
  }));
}

/**
 * Close a pane, and collapse the split that held it.
 *
 * The sibling takes the whole space, which is the only answer that does not
 * leave a hole. Closing the last pane is refused rather than obeyed: a window
 * with no panes is not a state this application has, and returning the tree
 * unchanged says so more usefully than an empty screen would.
 */
export function closePane(tree: PaneNode, id: string): PaneNode {
  if (tree.kind === "leaf") return tree; // the last one
  const drop = (n: PaneNode): PaneNode => {
    if (n.kind === "leaf") return n;
    if (n.a.kind === "leaf" && n.a.id === id) return n.b;
    if (n.b.kind === "leaf" && n.b.id === id) return n.a;
    const a = drop(n.a);
    const b = drop(n.b);
    return a === n.a && b === n.b ? n : { ...n, a, b };
  };
  return drop(tree);
}

/** Change one pane's own state, leaving every other pane identical. */
export function update(tree: PaneNode, id: string, patch: Partial<Leaf>): PaneNode {
  return replace(tree, id, (n) => (n.kind === "leaf" ? { ...n, ...patch } : n));
}

/** Move a splitter. Clamped, because a pane of zero width cannot be got back. */
export function resize(tree: PaneNode, id: string, frac: number): PaneNode {
  return replace(tree, id, (n) =>
    n.kind === "split" ? { ...n, frac: Math.max(0.1, Math.min(0.9, frac)) } : n,
  );
}

/**
 * Exchange two panes, wherever each of them is standing.
 *
 * The tiling-window-manager operation, asked for by name: *"there should be a
 * command to move any window to swap it with another window (like in
 * hyprland)"*. Two panes trade places and nothing else moves — not the split
 * they sit in, not the fractions, not the panes around them.
 *
 * **The fractions deliberately stay with the positions, not with the panes.**
 * Swapping a wide left pane with a narrow right one leaves the left slot wide
 * and puts the other pane in it. That is what every tiling manager does and it
 * is the only reading that makes a swap reversible: pressing the key twice has
 * to land you exactly where you started, and carrying the sizes along would
 * make the second press a different operation from the first.
 *
 * Both leaves come through **by reference**, so `renderPanes` keeps both
 * editors, both carets, both scrolls and both fold states. That is the same
 * property `update` and `resize` have and the reason `replace` exists; a swap
 * that rebuilt two `EditorView`s would be a swap that cost the writer the two
 * places they were standing in, which is the entire reason to have two panes.
 */
export function swap(tree: PaneNode, idA: string, idB: string): PaneNode {
  if (idA === idB) return tree;
  const a = find(tree, idA);
  const b = find(tree, idB);
  // Not both in this tree: return it untouched rather than half-swapped. The
  // caller is a keystroke, and a keystroke that half-applies is worse than one
  // that declines.
  if (!a || !b) return tree;
  const put = (n: PaneNode): PaneNode => {
    if (n.kind === "leaf") return n.id === idA ? b : n.id === idB ? a : n;
    const x = put(n.a);
    const y = put(n.b);
    return x === n.a && y === n.b ? n : { ...n, a: x, b: y };
  };
  return put(tree);
}

/**
 * How much of the window a pane moved to an edge takes.
 *
 * A margin, not a half. Somebody moving a pane to the side is putting it
 * *beside* their work; a splitter drag changes it in one gesture and the
 * fraction is remembered from then on.
 */
export const EDGE_SHARE = 0.3;

/**
 * Take a pane out of wherever it is and put it down along one edge of the window.
 *
 * The other half of what a tiling manager does, and the half a swap cannot do:
 * *"there should be a way to move from one to another"*. Swapping trades two
 * panes and leaves the shape alone, so a preview buried two levels down inside a
 * column can be exchanged with its neighbours for ever and never become the
 * right-hand third of the window. This **re-parents** it: the pane leaves its
 * split — which collapses behind it, exactly as closing would — and the whole of
 * what remains becomes its sibling.
 *
 * Refused, by returning the tree untouched, when there is nothing to move it out
 * of — a window of one pane has no edges that are not already this pane's, and
 * inventing a second pane to satisfy the request would be answering a different
 * question.
 */
export function moveToEdge(tree: PaneNode, id: string, side: Side, layout: Layout = {}): PaneNode {
  if (tree.kind === "leaf") return tree;
  const moved = find(tree, id);
  if (!moved) return tree;
  const rest = closePane(tree, id);
  // `closePane` refuses to remove the last pane, so an unchanged tree here means
  // the caller asked to move the only pane there is.
  if (rest === tree) return tree;
  const vertical = side === "up" || side === "down";
  // Which child of the new split the moved pane is. A row lays its first child
  // out on the *right* when the container is right-to-left, so the answer for
  // left and right flips with the direction — the same fact `rects` encodes, and
  // read from the same place rather than assumed.
  const first = vertical ? side === "up" : layout.rtl ? side === "right" : side === "left";
  // `stacked` is deliberately not consulted. Under the narrow breakpoint every
  // split renders as a column whatever it says, but that is a fact about the
  // stylesheet at this width — storing "col" for a sideways move would leave the
  // pane stacked for ever once the window was widened again.
  return {
    kind: "split",
    id: paneId(),
    dir: vertical ? "col" : "row",
    frac: first ? EDGE_SHARE : 1 - EDGE_SHARE,
    a: first ? moved : rest,
    b: first ? rest : moved,
  };
}

// ---------------------------------------------------------------- geometry
//
// Where each pane actually is, so that "swap this one with the one on my left"
// means the pane on the left of the *screen*.
//
// The tree cannot answer that on its own, for two reasons that both bite here:
//
//   • **The interface is right-to-left.** `<html dir="rtl">`, and a flex row in
//     an RTL container lays its first child out on the **right**. So `a` is the
//     left pane in English and the right pane in Hebrew, and a directional
//     command that read the tree order would send the pane the wrong way for
//     every writer this application was built for.
//   • **Narrow windows stack.** `styles.css` turns every split into a column
//     under the mobile breakpoint — `flex-direction: column !important`,
//     regardless of the direction the split was built with — so on a phone
//     there is no left and right at all.
//
// Both are facts about the rendering, so both arrive as arguments: this file
// stays a function from a tree to an answer, and `main.ts` reads the two live
// values off the document. Unit coordinates — x rightwards, y downwards, the
// window being 1 by 1 — because the only questions asked of them are which side
// of what, and a pixel would be a number this module has no way to know.

/** Where one pane sits, as a share of the window. */
export interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How the tree is being laid out at the moment the question is asked. */
export interface Layout {
  /** The interface is right-to-left, so a row's first child is on the right. */
  rtl?: boolean;
  /** Under the narrow breakpoint, where every split stacks whatever it says. */
  stacked?: boolean;
}

/** Every pane's place on screen, given how the tree is being laid out. */
export function rects(node: PaneNode, layout: Layout = {}): Rect[] {
  const out: Rect[] = [];
  const walk = (n: PaneNode, x: number, y: number, w: number, h: number) => {
    if (n.kind === "leaf") {
      out.push({ id: n.id, x, y, w, h });
      return;
    }
    if (layout.stacked || n.dir === "col") {
      walk(n.a, x, y, w, h * n.frac);
      walk(n.b, x, y + h * n.frac, w, h * (1 - n.frac));
    } else if (layout.rtl) {
      walk(n.a, x + w * (1 - n.frac), y, w * n.frac, h);
      walk(n.b, x, y, w * (1 - n.frac), h);
    } else {
      walk(n.a, x, y, w * n.frac, h);
      walk(n.b, x + w * n.frac, y, w * (1 - n.frac), h);
    }
  };
  walk(node, 0, 0, 1, 1);
  return out;
}

/** A screen direction, as the writer means it when they press an arrow. */
export type Side = "left" | "right" | "up" | "down";

/**
 * How deep a pane's edge band is: a share of the pane, capped in pixels.
 *
 * # The arithmetic that made the gesture feel broken
 *
 * This was a flat quarter of the pane on all four sides, with a comment
 * claiming *"the middle is still the easy target, since trading places is the
 * commoner intent"*. That is four bands of 25%, so the middle is `(1 - 2×0.25)²`
 * of the area — **a quarter of the pane**, with three quarters of it meaning
 * split. The comment had the intent right and the geometry exactly backwards,
 * and the report is what that feels like: *"dragging is not great — it tends to
 * split in half the other way, not switch"*.
 *
 * At 0.15 the middle is 49%, which is what "the easy target" actually looks
 * like. The pixel cap is the other half of it: a share alone means a tall pane
 * has a 200-pixel band at its top, so the further a writer drags into the
 * middle of a big pane the more of it means something they did not ask for.
 */
export const DROP_EDGE = 0.15;
export const DROP_EDGE_MAX = 96;

/**
 * What a drop at this point in a pane of this size means.
 *
 * Pure geometry, here rather than in the shell, because it is the whole
 * substance of the gesture and it was wrong for as long as it was untestable.
 * `x` and `y` are relative to the pane's top-left corner, in pixels.
 *
 * The nearest edge wins, and only when the pointer is inside its band; anywhere
 * else is a swap, which is both the commoner intent and the safer one — it
 * moves two panes and changes nothing else about the arrangement.
 */
export function dropIntentAt(w: number, h: number, x: number, y: number): Side | "swap" {
  const bx = Math.min(w * DROP_EDGE, DROP_EDGE_MAX);
  const by = Math.min(h * DROP_EDGE, DROP_EDGE_MAX);
  // Each edge, as *how far into its own band* the pointer is — so a wide short
  // pane's left band and its top band are compared on the same scale instead of
  // the top always winning because the pane is short.
  const near: [Side, number][] = [
    ["left", x / bx],
    ["right", (w - x) / bx],
    ["up", y / by],
    ["down", (h - y) / by],
  ];
  near.sort((a, b) => a[1] - b[1]);
  return near[0][1] < 1 ? near[0][0] : "swap";
}

/** How much two intervals share, which is 0 when they merely touch. */
function overlap(a: number, aLen: number, b: number, bLen: number): number {
  return Math.min(a + aLen, b + bLen) - Math.max(a, b);
}

/**
 * The pane on a given side of another one, or nothing.
 *
 * Nearest edge first, and the widest shared border to break a tie — so in a
 * window with a tall source beside two stacked previews, "right" from the
 * source picks the preview the caret is level with rather than whichever
 * happened to be built first. Panes that merely touch at a corner do not count:
 * the overlap has to be real, or a diagonal neighbour would answer for a
 * direction nothing is actually in.
 *
 * `undefined` is a real answer and callers must say so rather than swallow it.
 * Pressing "swap right" at the rightmost pane does nothing, and a command that
 * silently does nothing is indistinguishable from one that is broken.
 */
export function neighbor(
  tree: PaneNode,
  id: string,
  side: Side,
  layout: Layout = {},
): string | undefined {
  const all = rects(tree, layout);
  const me = all.find((r) => r.id === id);
  if (!me) return undefined;
  // A pane is never zero-sized, but the fractions are floating point and the
  // edges are compared for equality, so the slack has to be somewhere.
  const EPS = 1e-9;
  let best: string | undefined;
  let bestGap = Infinity;
  let bestShare = 0;
  for (const r of all) {
    if (r.id === id) continue;
    const gap =
      side === "left"
        ? me.x - (r.x + r.w)
        : side === "right"
          ? r.x - (me.x + me.w)
          : side === "up"
            ? me.y - (r.y + r.h)
            : r.y - (me.y + me.h);
    const share =
      side === "left" || side === "right"
        ? overlap(me.y, me.h, r.y, r.h)
        : overlap(me.x, me.w, r.x, r.w);
    if (gap < -EPS || share <= EPS) continue;
    if (gap < bestGap - EPS || (gap < bestGap + EPS && share > bestShare)) {
      best = r.id;
      bestGap = gap;
      bestShare = share;
    }
  }
  return best;
}

/** Which pane a linked pane follows: the one it shares a split with. */
export function sibling(tree: PaneNode, id: string): Leaf | undefined {
  for (const s of splits(tree)) {
    if (s.a.kind === "leaf" && s.a.id === id) return leaves(s.b)[0];
    if (s.b.kind === "leaf" && s.b.id === id) return leaves(s.a)[0];
  }
  return undefined;
}

// ---------------------------------------------------------------- arrangements
//
// The ones this application ships, offered as a **picker**. Not a cycle: a cycle
// is a picker with the options hidden, and it makes a writer press a chip twice
// to undo a choice they could see was wrong the moment it appeared.
//
// Each is a function rather than a value, because a tree carries pane ids and
// two writers picking the same arrangement must not share them.

export interface Arrangement {
  /** Stable key, for the picker and for what is stored. */
  id: string;
  build: () => PaneNode;
}

export const ARRANGEMENTS: Arrangement[] = [
  // What this application has always opened as, now nameable.
  { id: "sourceAndPreview", build: () => splitOf("row", leaf("preview"), leaf("source")) },
  { id: "sourceOnly", build: () => leaf("source") },
  { id: "previewOnly", build: () => leaf("preview") },
  // The one the margins asked for by name: *"multiple previews or sources open
  // at one time — meaning, all of the same doc, so you can look in one place as
  // you type"*. The second source is unlinked, because looking somewhere else
  // is the entire reason to open it.
  {
    id: "twoSources",
    build: () =>
      splitOf("row", leaf("preview"), splitOf("col", leaf("source"), leaf("source", null, { linked: false }))),
  },
  {
    id: "twoPreviews",
    build: () =>
      splitOf("row", splitOf("col", leaf("preview"), leaf("preview", null, { linked: false })), leaf("source")),
  },
  // Reading one place while typing in another, stacked rather than side by side
  // — a sefer is a tall page and a wide screen has room for two of them.
  {
    id: "stacked",
    build: () => splitOf("col", leaf("preview"), leaf("source")),
  },
];

function splitOf(dir: "row" | "col", a: PaneNode, b: PaneNode): Split {
  return { kind: "split", id: paneId(), dir, frac: 0.5, a, b };
}

/** The arrangement this application opens with. */
export function defaultTree(): PaneNode {
  return ARRANGEMENTS[0].build();
}

/**
 * Which shipped arrangement a tree is, if it is one of them.
 *
 * By shape rather than by a remembered name, so a writer who builds the same
 * arrangement by hand is told they are in it — and one who alters a shipped
 * arrangement stops being told they are in something they are not.
 */
export function arrangementOf(tree: PaneNode): string | null {
  const shape = shapeOf(tree);
  for (const a of ARRANGEMENTS) if (shapeOf(a.build()) === shape) return a.id;
  return null;
}

/** A tree's structure, with the ids and the fractions left out. */
export function shapeOf(node: PaneNode): string {
  if (node.kind === "leaf") return node.role[0] + (node.linked ? "" : "!");
  return `(${node.dir}${shapeOf(node.a)}${shapeOf(node.b)})`;
}
