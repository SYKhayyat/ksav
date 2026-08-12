// Tabs: arrangements, not documents.
//
// # The rule that makes this work
//
// **A tab does not own its documents.** The open set is global (`opendocs.ts`);
// a tab only remembers what was shown where. Break that and the same document is
// open in two tabs with two carets and two dirty flags, which is exactly the
// forked text the open set exists to prevent — and it is the mistake every
// editor that started with document tabs and grew splits later has had to undo.
//
// So a tab holds a **pane tree** (`panes.ts`) and nothing else that matters: the
// arrangement, which document sits in each pane, and which pane the writer was
// in. The text, the undo history and the dirty flag belong to the document,
// wherever it is shown.
//
// # Three consequences, and they are the argument for the design
//
// **Plain document tabs are the degenerate case.** With no splits and one
// document per arrangement, a tab is indistinguishable from an ordinary document
// tab: the label defaults to the title of the document in its focused pane, so
// until somebody deliberately builds a split the strip reads and behaves exactly
// like the tabs anybody expects. Renaming a tab — "gemara", "letter" — is the
// moment it becomes a real arrangement, and it is also the moment a writer would
// want to.
//
// **Closing a tab closes the arrangement, not the documents.** They stay in the
// open set. Which is precisely why the keyboard switcher is not a convenience:
// with arrangement tabs the strip stops being an inventory of what is open, so
// the switcher is the only surface that tells that truth. Tabs for the eye,
// switcher for the hand — two different facts, not two doors into one room.
//
// **The `×` must never read as delete.** The Documents menu's `×` deletes from
// the library. This application now has three things that could all be spelled
// with a cross — close a pane, close a document, delete a document — and one
// glyph for all of them is not survivable. A tab's control is a `×` only because
// closing a tab is the *least* destructive of the three and the one every reader
// already knows; the other two moved off it.
//
// # What is deliberately not here
//
// Shipped default tabs. The record that specified this leaves "which shipped
// arrangements are worth having as default tabs" open, and inventing an answer
// would be worse than the blank the writer starts with: a strip of tabs nobody
// asked for is the chrome budget spent before a word is typed, in a window whose
// first recorded complaint was that sixteen things already compete for the top
// of it. One tab, hidden, until somebody makes a second.

import type { Leaf, PaneNode } from "./panes";

export interface Tab {
  id: string;
  /**
   * What the writer called it, or null to follow the focused pane's document.
   *
   * Null is the ordinary state and is what makes a tab look like a document tab
   * until it stops being one. A name is not a decoration: it is the writer
   * saying *this arrangement is a thing I return to*, which is the whole
   * difference between a tab strip and a list of documents.
   */
  name: string | null;
  tree: PaneNode;
  /** Which pane was focused in this arrangement. */
  focusedPane: string | null;
}

let tabs: Tab[] = [];
let active = 0;
let nextId = 0;

function tabId(): string {
  return `t${++nextId}`;
}

/** For tests. */
export function reset(): void {
  tabs = [];
  active = 0;
  nextId = 0;
}

export function all(): Tab[] {
  return tabs;
}

export function count(): number {
  return tabs.length;
}

export function activeIndex(): number {
  return active;
}

export function current(): Tab | undefined {
  return tabs[active];
}

/**
 * Whether the strip should be on screen at all.
 *
 * **One tab is pure noise**, and the record is explicit about why: the first
 * observation in the whole inventory was that sixteen things compete for the top
 * of the window before a word is typed. A strip showing a single tab spends a
 * row of chrome to tell a writer something they can already see. It appears when
 * there is a choice to make and not before — and it must never be the only route
 * in, which is what the keyboard switcher is for.
 */
export function stripVisible(): boolean {
  return tabs.length > 1;
}

/** Start a tab holding this arrangement, and make it the active one. */
export function add(tree: PaneNode, focusedPane: string | null = null): Tab {
  const tab: Tab = { id: tabId(), name: null, tree, focusedPane };
  tabs.splice(active + 1, 0, tab);
  active = tabs.indexOf(tab);
  return tab;
}

/** Record what the active tab is currently holding, before leaving it. */
export function stash(tree: PaneNode, focusedPane: string | null): void {
  const tab = tabs[active];
  if (!tab) return;
  tab.tree = tree;
  tab.focusedPane = focusedPane;
}

/** Switch to a tab by index. Returns it, or undefined if there is no such tab. */
export function select(index: number): Tab | undefined {
  if (index < 0 || index >= tabs.length) return undefined;
  active = index;
  return tabs[active];
}

/**
 * Close a tab. Returns the tab that should be shown next, or null if none.
 *
 * **Nothing is closed but the arrangement.** Every document it was showing stays
 * in the open set, with its text, its caret and its undo history — which is what
 * makes this the least destructive of the three things in this application that
 * could be spelled with a cross, and the only one that keeps the glyph.
 *
 * The last tab cannot be closed: a window with no arrangement is not a state
 * this application has, and a writer pressing × on their only tab means "clear
 * this", not "give me nothing".
 */
export function close(index: number): Tab | null {
  if (tabs.length <= 1 || index < 0 || index >= tabs.length) return tabs[active] ?? null;
  tabs.splice(index, 1);
  if (active >= tabs.length) active = tabs.length - 1;
  else if (index < active) active--;
  return tabs[active] ?? null;
}

/** Give a tab a name of its own, or take it back to following its document. */
export function rename(index: number, name: string | null): void {
  const tab = tabs[index];
  if (!tab) return;
  const trimmed = name?.trim();
  tab.name = trimmed ? trimmed : null;
}

/**
 * What a tab is called.
 *
 * Its own name if it has one; otherwise the title of the document in its focused
 * pane, which is what makes an unnamed tab indistinguishable from an ordinary
 * document tab. `titleOf` is passed in rather than imported so this module keeps
 * no opinion about where documents live.
 */
export function label(tab: Tab, titleOf: (docId: string) => string | undefined, fallback: string): string {
  if (tab.name) return tab.name;
  const docId = focusedDoc(tab);
  return (docId && titleOf(docId)) || fallback;
}

/** The document in a tab's focused pane, if it names one. */
export function focusedDoc(tab: Tab): string | null {
  const found: Leaf[] = [];
  const walk = (n: PaneNode): void => {
    if (n.kind === "leaf") found.push(n);
    else {
      walk(n.a);
      walk(n.b);
    }
  };
  walk(tab.tree);
  // The focused pane, or the first source pane, or whatever there is. A tab
  // whose focused pane has been closed still has to be able to name itself.
  const pick = found.find((l) => l.id === tab.focusedPane) ?? found.find((l) => l.role === "source") ?? found[0];
  return pick?.docId ?? null;
}

/** Everything, for persisting. */
export function serialise(): { tabs: Tab[]; active: number } {
  return { tabs, active };
}

/** Put a persisted strip back. Refuses a shape it does not recognise. */
export function restore(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as { tabs?: unknown; active?: unknown };
  if (!Array.isArray(d.tabs) || !d.tabs.length) return false;
  const ok = d.tabs.every(
    (t) => t && typeof t === "object" && "tree" in (t as object) && (t as Tab).tree?.kind,
  );
  if (!ok) return false;
  tabs = d.tabs as Tab[];
  active = typeof d.active === "number" && d.active >= 0 && d.active < tabs.length ? d.active : 0;
  // Ids come back with the strip, so a session that restores two tabs does not
  // hand both of them the same generated id the first time one is added.
  nextId = tabs.length;
  return true;
}
