// Panes: a tree of views onto the open documents.
//
// # What a pane is
//
// A **pane** — a *box*, in the frontend design — shows one **view**: a scope of
// a document in a mode (`views.ts`). Panes form a split tree: every split is a row or a column with two
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
// Owns: its view (a scope in a mode), its caret, its scroll, its zoom, its fold
// state, and which box its scroll follows.
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

import { registerBuiltins } from "./views-builtin";
import { linkRefusal, viewRefusal, UNLINKED, type Link, type LinkMode, type Refusal, type View } from "./views";

/**
 * What draws a view today: one of the five renderers the window has.
 *
 * A box holds a **view** — a scope and a mode (`views.ts`) — and not a role.
 * The renderers are what exists to draw views with, and a view nothing draws
 * is refused in the picker before it can reach a box (`views.viewRefusal`).
 * Keeping the renderer a *derived* fact rather than a stored one is the point
 * of step 3 of `decisions/2026-11-23-frontends-are-views-in-boxes.md`: the
 * tree says what the writer asked to see, and this answers how it is drawn.
 *
 * `outline` and `notes` became boxes because of two margin comments that were
 * the same comment: *"maybe there should be a toggle to have this shift the
 * other panes open, because now it covers source"*. A drawer that covers the
 * source is a drawer you close to read what it is telling you about.
 */
export type Renderer = "source" | "preview" | "outline" | "notes" | "marks";

/** The view each renderer draws, as a view — the five boxes the window had. */
export const VIEW: Readonly<Record<Renderer, View>> = {
  source: { scope: { part: "file" }, mode: "source" },
  preview: { scope: { part: "body" }, mode: "preview" },
  outline: { scope: { part: "body" }, mode: "outline" },
  notes: { scope: { part: "notes" }, mode: "outline" },
  marks: { scope: { part: "body" }, mode: "marks" },
};

/**
 * The renderer that draws a view, or null when none does yet.
 *
 * By scope part and mode, ignoring the document: which sefer a box shows does
 * not change how it is drawn.
 */
export function rendererOf(view: View): Renderer | null {
  // What the registry refuses nothing draws, whatever its part and mode: a
  // notes list narrowed to one level is an outline over notes and still not
  // a view the notes list can show yet.
  if (viewRefusal(view)) return null;
  const { part } = view.scope;
  if (view.mode === "source") return part === "file" ? "source" : null;
  // The writer is a source editor drawn as prose: the same box, the same one
  // history, a different drawing (`compartments.proseOrRaw("writer")`).
  if (view.mode === "writer") return part === "body" ? "source" : null;
  if (view.mode === "preview") return part === "body" ? "preview" : null;
  if (view.mode === "marks") return part === "body" ? "marks" : null;
  if (view.mode === "outline") return part === "body" ? "outline" : part === "notes" ? "notes" : null;
  return null;
}

/**
 * How this box is drawn.
 *
 * Never null for a box in a tree: `leaf` refuses a view nothing draws, and
 * `validTree` refuses a stored one, so the only way to hold an undrawable box
 * is to build the object by hand.
 */
export function drawn(l: Leaf): Renderer {
  return rendererOf(l.view)!;
}

/**
 * The document a box shows, or null for *whichever is focused*.
 *
 * Null is the ordinary case and not a placeholder: a writer who splits the
 * window wants both halves to follow them when they switch document. A box
 * pinned to a document — for reading one sefer while typing another — is the
 * deliberate exception. It lives in the scope (`Scope.doc`) because *which
 * document* is part of what a view is a view of.
 */
export function docOf(l: Leaf): string | null {
  return l.view.scope.doc ?? null;
}

/** The same box showing another document (null: whichever is focused). */
export function withDoc(l: Leaf, doc: string | null): Leaf {
  const scope = { ...l.view.scope };
  if (doc === null) delete scope.doc;
  else scope.doc = doc;
  return { ...l, view: { ...l.view, scope } };
}

/** One box: a view, and how it follows another box. */
export interface Leaf {
  kind: "leaf";
  id: string;
  /** What the box shows: a scope, in a mode. */
  view: View;
  /**
   * Which box this one follows, and how.
   *
   * Asked for by name — *"we also should make that you can optionally unlink
   * the scrolling"* — and per box rather than per application, because the
   * answer differs between "a second view to look somewhere else" and "a
   * preview of what I am typing". The leader is explicit: a box follows the
   * box it was opened from, not whatever happens to share its split, so
   * swapping or moving a box never quietly re-pairs it.
   */
  link: Link;
  /** Where this box is scrolled to. Per box; that is most of the point. */
  scrollTop: number;
  /** 1 is unscaled. */
  zoom?: number;
}

// The link refusals read the registry, and a tree is a thing tests build
// before anything else has booted.
registerBuiltins();

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

/**
 * A new box. `what` is a view, or a renderer's name for the view it draws.
 *
 * Unlinked unless told otherwise: a link names a leader, and only the caller
 * knows which box that is (`split` with `follow`, `openBeside`).
 */
export function leaf(what: View | Renderer, doc: string | null = null, extra: Partial<Leaf> = {}): Leaf {
  const view = typeof what === "string" ? VIEW[what] : what;
  if (!rendererOf(view)) throw new Error(`no renderer draws ${JSON.stringify(view)}`);
  const made: Leaf = { kind: "leaf", id: paneId(), view, link: UNLINKED, scrollTop: 0, ...extra };
  return doc === null ? made : withDoc(made, doc);
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
 * Take a box out of the tree, and collapse the split that held it.
 *
 * Structural only: links are left as they were. A move (`moveToEdge`, a drag)
 * takes a box out to put the same box back, and its followers must still be
 * following it when it lands. Closing is `closePane`.
 *
 * The sibling takes the whole space, which is the only answer that does not
 * leave a hole. Removing the last box is refused rather than obeyed: a window
 * with no boxes is not a state this application has, and returning the tree
 * unchanged says so more usefully than an empty screen would.
 */
export function remove(tree: PaneNode, id: string): PaneNode {
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

/**
 * Close a box. Whatever followed it now follows what *it* followed.
 *
 * A chain — notes on notes following the notes, following the body — keeps
 * working when its middle closes, because the middle was only ever passing
 * the body's place along. A box at the head of a chain leaves its followers
 * unlinked: there is nothing left for them to follow, and picking one of them
 * to lead would be a guess.
 */
export function closePane(tree: PaneNode, id: string): PaneNode {
  const gone = find(tree, id);
  const rest = remove(tree, id);
  if (!gone || rest === tree) return tree;
  let out = rest;
  for (const f of followers(rest, id)) {
    const to = gone.link.leader && gone.link.mode !== "unlinked" ? gone.link : UNLINKED;
    out = update(out, f.id, { link: to.mode === "unlinked" ? UNLINKED : { leader: to.leader, mode: f.link.mode } });
  }
  return out;
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
  const rest = remove(tree, id);
  // `remove` refuses to remove the last pane, so an unchanged tree here means
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
const DROP_EDGE = 0.15;
const DROP_EDGE_MAX = 96;

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

// ---------------------------------------------------------------- links
//
// A link is a box's own: `{leader, mode}`. What a box scrolls with is its
// leader and the boxes following it — not a split sibling, which is what it
// was while there were only ever two boxes and they were always side by side.

/** The box this one follows, when it follows one that is here. */
export function leaderOf(tree: PaneNode, id: string): Leaf | undefined {
  const me = find(tree, id);
  if (!me || me.link.mode === "unlinked" || !me.link.leader) return undefined;
  return find(tree, me.link.leader);
}

/** The boxes following this one. */
export function followers(tree: PaneNode, id: string): Leaf[] {
  return leaves(tree).filter((l) => l.id !== id && l.link.mode !== "unlinked" && l.link.leader === id);
}

/** Everything this box scrolls with: its leader and its followers. */
export function partners(tree: PaneNode, id: string): Leaf[] {
  const lead = leaderOf(tree, id);
  return [...(lead ? [lead] : []), ...followers(tree, id)];
}

/**
 * Make a box follow another one, in a link mode — or refuse, saying why.
 *
 * The refusal is `views.linkRefusal`'s: a box following itself, a loop, a
 * link mode that does not fit. Unlinking always succeeds.
 */
export function follow(
  tree: PaneNode,
  id: string,
  leader: string | null,
  mode: LinkMode,
): { tree: PaneNode; refused: null } | { tree: PaneNode; refused: Refusal } {
  const me = find(tree, id);
  if (!me) return { tree, refused: { key: "view.linkNeedsLeader" } };
  if (mode === "unlinked") return { tree: update(tree, id, { link: UNLINKED }), refused: null };
  const lead = leader ? find(tree, leader) : undefined;
  const refused = linkRefusal(me, lead ?? null, mode, (x) => {
    const l = find(tree, x);
    return l && l.link.mode !== "unlinked" ? l.link.leader : null;
  });
  if (refused) return { tree, refused };
  return { tree: update(tree, id, { link: { leader, mode } }), refused: null };
}

// ---------------------------------------------------------------- persisted trees

/**
 * A stored tree, if it is one this version can draw — or null.
 *
 * Trees come back from settings and from the tab strip as whatever was
 * written, and a stored box whose view no renderer draws would be a box that
 * renders nothing. Null asks the caller for its default rather than drawing
 * a broken window; a tree from before boxes held views is such a tree.
 */
export function validTree(raw: unknown): PaneNode | null {
  const ok = (n: unknown): n is PaneNode => {
    if (!n || typeof n !== "object") return false;
    const x = n as Record<string, unknown>;
    if (typeof x.id !== "string") return false;
    if (x.kind === "split") {
      return (x.dir === "row" || x.dir === "col") && typeof x.frac === "number" && ok(x.a) && ok(x.b);
    }
    if (x.kind !== "leaf") return false;
    const v = x.view as View | undefined;
    const l = x.link as Link | undefined;
    if (!v || typeof v !== "object" || !v.scope || typeof v.mode !== "string") return false;
    if (!l || typeof l !== "object" || typeof l.mode !== "string") return false;
    return rendererOf(v) !== null && typeof x.scrollTop === "number";
  };
  if (!ok(raw)) return null;
  // The stored ids are kept — a tab's `focusedPane` names one, and renaming
  // them would come back from a restart with nothing focused — and claimed, so
  // the next box made this session cannot be handed one of them.
  const ids = new Set<string>();
  const claim = (n: PaneNode) => {
    ids.add(n.id);
    const m = /^p(\d+)$/.exec(n.id);
    if (m) nextId = Math.max(nextId, Number(m[1]));
    if (n.kind === "split") {
      claim(n.a);
      claim(n.b);
    }
  };
  claim(raw);
  // Two boxes with one id would be one box to everything keyed by id.
  if (ids.size !== leaves(raw).length + splits(raw).length) return null;
  // A link to a box that is not in this tree is no link.
  const relink = (n: PaneNode): PaneNode =>
    n.kind === "split"
      ? { ...n, a: relink(n.a), b: relink(n.b) }
      : n.link.mode !== "unlinked" && !(n.link.leader && ids.has(n.link.leader) && n.link.leader !== n.id)
        ? { ...n, link: UNLINKED }
        : n;
  return relink(raw);
}

/**
 * Every id in a tree replaced with a new one, and every link carried along.
 *
 * Not tidiness: box ids key `paneplaces` and decide which editors the
 * renderer may keep, and a saved tree used twice with its stored ids would
 * give two live boxes one identity. A link names its leader by id, so the
 * leaders are renamed in the same pass — a stored chain comes back a chain.
 */
export function freshIds(tree: PaneNode): PaneNode {
  const map = new Map<string, string>();
  const rename = (n: PaneNode): PaneNode => {
    const id = paneId();
    map.set(n.id, id);
    return n.kind === "leaf" ? { ...n, id } : { ...n, id, a: rename(n.a), b: rename(n.b) };
  };
  const relink = (n: PaneNode): PaneNode => {
    if (n.kind === "split") return { ...n, a: relink(n.a), b: relink(n.b) };
    const to = n.link.leader ? map.get(n.link.leader) : undefined;
    return { ...n, link: to ? { ...n.link, leader: to } : UNLINKED };
  };
  return relink(rename(tree));
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

/** A box following another one by scroll. */
function after(l: Leaf, what: Renderer): Leaf {
  return leaf(what, null, { link: { leader: l.id, mode: "scroll" } });
}

export const ARRANGEMENTS: Arrangement[] = [
  // What this application has always opened as, now nameable: the source
  // leads, the preview follows it.
  {
    id: "sourceAndPreview",
    build: () => {
      const s = leaf("source");
      return splitOf("row", after(s, "preview"), s);
    },
  },
  { id: "sourceOnly", build: () => leaf("source") },
  { id: "previewOnly", build: () => leaf("preview") },
  // The one the margins asked for by name: *"multiple previews or sources open
  // at one time — meaning, all of the same doc, so you can look in one place as
  // you type"*. The second source is unlinked, because looking somewhere else
  // is the entire reason to open it.
  {
    id: "twoSources",
    build: () => {
      const s = leaf("source");
      return splitOf("row", after(s, "preview"), splitOf("col", s, leaf("source")));
    },
  },
  {
    id: "twoPreviews",
    build: () => {
      const s = leaf("source");
      return splitOf("row", splitOf("col", after(s, "preview"), leaf("preview")), s);
    },
  },
  // Reading one place while typing in another, stacked rather than side by side
  // — a sefer is a tall page and a wide screen has room for two of them.
  {
    id: "stacked",
    build: () => {
      const s = leaf("source");
      return splitOf("col", after(s, "preview"), s);
    },
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

/**
 * A tree's structure, with the ids and the fractions left out.
 *
 * A box is its renderer's initial, and `!` when it scrolls with nothing —
 * neither following a box nor followed by one. Who leads whom is left out,
 * so a writer who builds the same window by hand from the other end is still
 * told they are in it.
 */
export function shapeOf(node: PaneNode, root: PaneNode = node): string {
  if (node.kind === "leaf") return (drawn(node) ?? "?")[0] + (partners(root, node.id).length ? "" : "!");
  return `(${node.dir}${shapeOf(node.a, root)}${shapeOf(node.b, root)})`;
}
