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

export type Role = "source" | "preview";

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
