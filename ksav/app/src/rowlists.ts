// The lists of rows, and what a row does when it is pressed.
//
// Owns: the four drawer/pane renders the outline, notes and marks (and the
// find drawer's list half), their toggles (`toggleOutline`, `togglePanelPane`,
// `toggleNotesPane`, `toggleMarksPane`), the note's right-click menu, and the
// shared list machinery every other panel draws through: `LOOKS`,
// `listReconcilers`, `drawList`, `drawRow`, `updateRow`, `expandable`,
// `goToOffset`, `revealPrinted` and the row runner `runRow`.
// Defers: what a row *chooses* to `panels.ts` (taxonomy) — this is where the
// choice is performed; the pane estate to `panestate.ts`/`panes.ts`; the
// shell-held dispatch verbs (action runner, snapshot restore, document swap,
// caret reveal) to the wiring object registered at boot.
// Refuses: keeping a list of its own. Every list here is a view over
// `panelrows`' shapes, filled from the scan or the registry.

import { t, tf } from "./i18n";
import { el } from "./dom";
import { docTextOf } from "./spans";
import * as runtime from "./runtime";
import * as panelrows from "./panelrows";
import type { PanelRow, PanelList } from "./panelrows";
import { togglePanel, mountPanel } from "./panels";
import { setTree, paneTree } from "./panestate";
import { marksIn } from "./marks";
import { notesIn, markersFor, noteAt, noteDestination, destinationTargets, retargetNote, scaffold, deleteNote } from "./notes";
import { closeNoteMenu } from "./spellcheck";
import { outline } from "./ksav-lang";
import { keyedReconciler, type KeyedReconciler } from "./reconcile";
import { closeSpellMenu } from "./spellcheck";
import { insertSnippet, tieredNoteHere, dirLang } from "./insert";
import { setStatus } from "./runtime";
import * as panes from "./panes";
import { settings, saveSettings } from "./settings";
import { jumpTo } from "./runtime";
import { closePalette } from "./palette";
import { pageBox, currentPages, currentPageText } from "./preview";
import { pixelInPage } from "./jump";
import { matchFraction, clampScroll } from "./panescroll";
import * as docs from "./docs";
import * as marks from "./marks";
import * as find from "./find";
// # The wiring
//
// What the rows dispatch to that is still shell-held arrives as one registered
// object — the same contract as the chrome's. The row runner gives the dispatch
// the verbs the region does not own.

export interface RowWiring {
  /** Run a shell action id, through the action registry. */
  runAction(id: string): void;
  /** Restore a snapshot, through the shell's guarded verb. */
  restore(snapshot: docs.Snapshot): void;
  /** Swap the whole document (the swaps a note menu needs). */
  swapDoc(text: string, caret: number): void;
  /** The reveal half of a jump: the caret follows the page. */
  revealCaret(): void;
}

let rowsWired: RowWiring | undefined;

/** Register the row wiring. Called once, from main.ts's boot. */
export function wireRows(w: RowWiring): void {
  rowsWired = w;
}

/** The wiring, registered at boot. */
export const rowsWiring = (): RowWiring => {
  if (!rowsWired) throw new Error("wireRows was never called: the row wiring is missing");
  return rowsWired;
};

// ---- outline / document map ----
//
// Two ways to show it, and the writer picks which. *"Maybe there should be a
// toggle to have this shift the other panes open, because now it covers
// source"* — a panel that covers the source is a panel you have to close to read
// what it is telling you about, which is the opposite of what an outline is for.
//
// Once the window is a tree, "shift the other panes open" is not a mode to
// build; it is what a pane already is. `settings.panelPlacement` decides, and
// it decides for the notes list too, because the second margin comment about
// this said "maybe also for all of them".
export function toggleOutline() {
  settings.outline = !settings.outline;
  saveSettings();
  if (settings.panelPlacement === "pane") togglePanelPane("outline", settings.outline);
  else togglePanel("outline-drawer", settings.outline);
  runtime.rerenderChrome();
}

/**
 * Put a side panel in the pane tree, or take it out.
 *
 * Docked at the inline start of the whole window rather than beside whatever
 * pane happens to be focused: an outline is about the *document*, not about one
 * view of it, and a writer who splits the source twice does not want a third
 * outline. It is the one pane whose position is decided rather than chosen.
 */
export function togglePanelPane(role: "outline" | "notes" | "marks", on: boolean) {
  const existing = panes.leaves(paneTree).find((l) => l.role === role);
  if (on && !existing) {
    setTree(panes.split(paneTree, paneTree.id, "row", panes.leaf(role, null, { linked: false }), true));
  } else if (!on && existing) {
    setTree(panes.closePane(paneTree, existing.id));
  }
}

// ---- the notes pane ----
//
// Word's navigation pane, for notes. Anyone with more than ten notes works by
// scanning a list and jumping, not by scrolling the source hunting for the one
// that began "ועיין" — and the notes are the text a writer most often needs to
// get back to. Ksav had an outline of the headings and nothing for the notes,
// which in a sefer is the larger half of the document.

export function toggleNotesPane() {
  settings.notesPane = !settings.notesPane;
  saveSettings();
  if (settings.panelPlacement === "pane") togglePanelPane("notes", !!settings.notesPane);
  else togglePanel("notes-drawer", !!settings.notesPane);
  runtime.rerenderChrome();
}

// ---- the marks pane ----
//
// The third list surface, and the one the mark register was asked for by name:
// *"you should be able to … see just these in some list somewhere."* A collection
// that only exists once the document is printed is a collection a writer has to
// take on trust while they are writing it.
//
// Grouped by class rather than in reading order, because the question is always
// about one class — every lemma, every siman, every place in Shas. What a row
// shows and how the groups are ordered is `panelrows.markList`; what a mark *is*
// is `marks.ts`; this is the two of them drawn into every home the list has.

export function toggleMarksPane() {
  settings.marksPane = !settings.marksPane;
  saveSettings();
  if (settings.panelPlacement === "pane") togglePanelPane("marks", !!settings.marksPane);
  else togglePanel("marks-drawer", !!settings.marksPane);
  runtime.rerenderChrome();
}

export function renderMarksPane() {
  if (!runtime.view) return;
  const doc = docTextOf(runtime.view.state.doc);
  const rows = panelrows.markList(marksIn(doc), marks.MARK_CLASSES);
  // The class rows carry their Hebrew class name; `panelrows` does not resolve
  // language, so the translation happens here, once, where every other string in
  // this file is translated.
  for (const r of rows.rows) {
    if (r.id?.startsWith("markclass:")) r.label = t("markClass." + r.label);
  }
  for (const host of document.querySelectorAll<HTMLElement>(".marks-list")) {
    drawList(host, rows, LOOKS.marks);
  }
}

/**
 * The find drawer: every place a phrase appears, in whichever sefer was asked
 * for.
 *
 * The source half is read off the buffer that is on screen. The printed half is
 * read off `pages_text`, which the engine filled in on the last compile because
 * `compile.searchingThePage` asked it to — never off the source under a second
 * name, which is the fake the item warns about and the only way this feature
 * can be got wrong while looking right.
 */
export function renderFindPane() {
  const host = document.getElementById("find-list");
  if (!host || !runtime.view) return;
  const query = (document.getElementById("find-query") as HTMLInputElement | null)?.value ?? "";
  const scope = settings.searchScope ?? "source";
  // The chooser on the drawer follows the setting, wherever the setting was
  // changed. The same question is asked in two places by design — here and in
  // the settings drawer — and a control that shows one answer while the search
  // uses another is worse than having only one of them.
  const chooser = document.getElementById("find-scope") as HTMLSelectElement | null;
  if (chooser && chooser.value !== scope) chooser.value = scope;
  const result = find.findIn(
    docTextOf(runtime.view.state.doc),
    currentPageText(),
    query,
    { scope, caseSensitive: !!settings.searchCaseSensitive },
  );
  const rows = panelrows.findList(result, query, scope);
  // The group headings and the two empty states carry i18n keys rather than
  // words: `panelrows` does not resolve language. The same arrangement as the
  // marks pane's class rows, and translated in the same place — here, once.
  for (const r of rows.rows) {
    if (r.id?.startsWith("findgroup:") || r.id?.startsWith("findempty:")) r.label = t(r.label);
  }
  drawList(host, rows, LOOKS.find);
}

export function renderNotesPane() {
  if (!runtime.view) return;
  // A row jumps to wherever the prose actually is. For a deferred note that is
  // the `#גוף_הערה` at the end of the file, which is the whole point of the row:
  // the marker is easy to find and the prose is not.
  const doc = docTextOf(runtime.view.state.doc);
  const notes = notesIn(doc);
  // The markers the last compile printed, where it printed any. The drawer is
  // redrawn on a keystroke and a compile is seconds behind it, so an offset that
  // no longer names the same note simply matches nothing and that row counts
  // instead — which is why the marker is matched against the *current* scan
  // rather than cached against the one the compile saw.
  const rows = panelrows.noteList(notes, doc, markersFor(notes, runtime.lastResult?.note_markers ?? []));
  for (const host of document.querySelectorAll<HTMLElement>(".notes-list")) {
    drawList(host, rows, LOOKS.notes);
  }
}

/**
 * Right-click on a note: convert it, delete it, or hang another note off it.
 *
 * The consolation prize from §1.4 and rather more. `#הערה` is now genuinely
 * tier 1, so a sub-note hangs off it with no conversion at all — but the band
 * apparatuses collect their own markers and cannot adopt a native footnote
 * without printing its text twice, so for those, converting in place beats
 * retyping the note.
 */
export function openNoteMenu(e: MouseEvent, at: number) {
  closeSpellMenu();
  const doc = docTextOf(runtime.view.state.doc);
  const note = noteAt(doc, at);
  if (!note) return;
  // Where it prints, not what it is called. A note does not change *command* to
  // move any more, it changes **argument** — so the menu offers the five
  // destinations plus whatever regions this document declared, and the note the
  // writer right-clicked keeps its prose, its name and its tier through the
  // change.
  //
  // Derived from the document rather than hand-listed. This was six Hebrew
  // literals out of eighteen note commands, so twelve layouts were unreachable
  // from the menu and the English spellings were unreachable from anywhere.
  const here = noteDestination(doc, note);
  const targets = destinationTargets(doc, note);
  const menu = el("div", { class: "spell-menu note-menu" }, [
    el("div", { class: "menu-cat" }, [t("dest." + here.dest) + (here.region ? " · " + here.region : "")]),
    el(
      "button",
      {
        class: "menu-item",
        onClick: () => {
          closeNoteMenu();
          // At the end of the note's prose, which for a deferred note is not
          // `to - 1` — the marker has no body to sit inside, and a sub-note
          // written after it would have hung off the sentence, not the note.
          runtime.view.dispatch({ selection: { anchor: note.bodyTo } });
          insertSnippet(tieredNoteHere(doc, note.bodyTo));
        },
      },
      [el("b", {}, ["⁑ " + t("sc.tieredNote")])],
    ),
    el("div", { class: "menu-cat" }, [t("noteConvert")]),
    ...targets.map((pick) =>
      el(
        "button",
        {
          class: "menu-item menu-cmd",
          "data-note-to": pick.region ?? pick.dest,
          onClick: () => {
            closeNoteMenu();
            const e2 = retargetNote(docTextOf(runtime.view.state.doc), note, pick, dirLang());
            // …and then whatever the destination needs in order to print, which
            // is what `applyNotePick` — docstringed *"The only place that
            // does"* — has always done for an inserted note. Without it,
            // sending a footnote to the back produced a stream nothing printed:
            // the "collected and never rendered" failure, performed by the
            // product and then reported back to the writer as a lint.
            const done = scaffold(e2.text, e2.caret, pick, dirLang());
            rowsWiring().swapDoc(done.text, done.caret ?? e2.caret);
            setStatus(tf("noteConverted", t("dest." + pick.dest)), "ok");
          },
        },
        [el("span", {}, [pick.region ?? t("dest." + pick.dest)])],
      ),
    ),
    el("div", { class: "menu-sep" }),
    el(
      "button",
      {
        class: "menu-item",
        onClick: () => {
          closeNoteMenu();
          const e2 = deleteNote(docTextOf(runtime.view.state.doc), note);
          rowsWiring().swapDoc(e2.text, e2.caret);
          setStatus(t("noteDeleted"), "ok");
        },
      },
      [el("b", {}, ["✕ " + t("noteDelete")])],
    ),
  ]);
  menu.style.position = "fixed";
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
  // Through the registry, not `document.body.append`. It was dismissible all
  // along — but only because `.spell-menu`, which it wears for its styling, is
  // what the spell menu's sweep selects on. See the `note-menu` row in
  // `panels.ts` for why that is a fragility rather than a fix.
  mountPanel("note-menu", menu, document.body);
}




export function renderOutline() {
  if (!runtime.view) return;
  const rows = panelrows.outlineList(outline(docTextOf(runtime.view.state.doc)));
  // Every home the list has: the drawer, and a pane if the writer docked it.
  // A class rather than an id, for the same reason the preview stopped being
  // `#preview` — "the outline" is however many of them are on screen.
  for (const host of document.querySelectorAll<HTMLElement>(".outline-list")) {
    drawList(host, rows, LOOKS.outline);
  }
}

/**
 * How a panel's rows are dressed.
 *
 * Four panels, four sets of classes, and they are genuinely different: the
 * outline is one line of text with an ellipsis on the button, a note row is a
 * flex row with an ordinal, and the palette and history are `.pal-item`. What
 * they share is the *row model*, which is now in `panelrows.ts` and testable;
 * what differs is the stylesheet, and that stays here.
 */
export interface Look {
  row: string;
  /** The leading chip's class — an ordinal in the notes pane, a category badge elsewhere. */
  chip: string;
  /** The words: `b` where the row is a flex line of parts, `span` where it is a line of text. */
  label: "b" | "span";
  /** This panel has a keyboard selection, so row 0 opens selected and the mouse moves it. */
  selectable?: boolean;
}

export const LOOKS: Record<string, Look> = {
  outline: { row: "outline-item", chip: "pal-cat", label: "span" },
  notes: { row: "outline-item note-item", chip: "note-item-n", label: "span" },
  // The same dress as the notes pane: a leading count where that has an ordinal,
  // and one line of words. A third stylesheet for a third list of clickable lines
  // would be the copy this module exists to stop.
  marks: { row: "outline-item note-item", chip: "note-item-n", label: "span" },
  history: { row: "pal-item", chip: "pal-cat", label: "b" },
  palette: { row: "pal-item", chip: "pal-cat", label: "b", selectable: true },
  // The commands drawer wears the palette's row, because a row that inserts a
  // command should look the same wherever it is offered. It is not selectable:
  // the drawer is browsed with the mouse and the search field, and a keyboard
  // selection that Enter runs belongs to the modal that closes afterwards.
  commands: { row: "pal-item", chip: "pal-cat", label: "b" },
  // The notes pane's row again: a chip carrying a page or a line, and one line
  // of words. A fourth stylesheet for a fourth list of clickable lines is the
  // copy `panelrows` exists to stop.
  find: { row: "outline-item note-item", chip: "note-item-n", label: "span" },
};

const listReconcilers = new WeakMap<HTMLElement, KeyedReconciler<PanelRow, HTMLElement>>();
const focusAfterRowReplace = new WeakSet<HTMLElement>();

/**
 * Draw a [`PanelList`] — the one place the four list panels turn rows into DOM.
 *
 * What a row *is* is `panelrows.ts`'s question and is answered without a
 * browser. What is left here is the effect: the empty state, the indent, the
 * click, and the sentence about what a cap left out.
 */
export function drawList(host: HTMLElement, list: PanelList, look: Look, snaps: docs.Snapshot[] = []) {
  // `refreshPanes` fires this for every docked pane and drawer five times a
  // second while typing. Reconcile rows by their source identity instead of
  // clearing the host: an unchanged row keeps its node, focus and selection,
  // while a long outline keeps its scroll position.
  const keepScroll = host.scrollTop;
  const oldFooter = [...host.children].find((child) => child.classList.contains("outline-empty"));
  oldFooter?.remove();

  let reconciler = listReconcilers.get(host);
  if (!reconciler) {
    reconciler = keyedReconciler<PanelRow, string, HTMLElement>({
      key: (row) => panelrows.panelRowKey(row),
      equal: (previous, next) => JSON.stringify(previous) === JSON.stringify(next),
      create: (row, index) => drawRow(row, look, index === 0, snaps),
      update: (node, next, _previous) => updateRow(node, next, look, snaps),
      afterReplace: (_previous, replacement) => {
        if (!focusAfterRowReplace.has(replacement)) return;
        focusAfterRowReplace.delete(replacement);
        replacement.querySelector<HTMLElement>(".row-expand")?.focus();
      },
    });
    listReconcilers.set(host, reconciler);
  }

  if (list.empty) {
    reconciler.reconcile(host, []);
    host.querySelectorAll<HTMLElement>(".outline-empty").forEach((node) => node.remove());
    host.append(el("div", { class: "outline-empty", "data-i18n": list.empty }, [t(list.empty)]));
    host.scrollTop = keepScroll;
    return;
  }
  reconciler.reconcile(host, list.rows);
  if (look.selectable) {
    // Filtering can retain a row that used to be second while removing the
    // previously selected first row. Selection belongs to the filtered result,
    // so always make its first visible row the selected one.
    const selectable = [...host.querySelectorAll<HTMLElement>(".pal-item")];
    selectable.forEach((row) => row.classList.remove("sel"));
    selectable[0]?.classList.add("sel");
  }
  // A cap that says nothing reads as completeness. This is the sentence that
  // was missing from a palette showing 60 of the registry's 115 commands.
  if (list.hidden) {
    host.append(el("div", { class: "outline-empty" }, [tf("moreHidden", String(list.hidden))]));
  }
  host.scrollTop = keepScroll;
}

/**
 * Take the writer to a place in the document, in whichever panes they asked for.
 *
 * The outline's whole job is *"take me to that chapter"*, and it moved the caret
 * in the source and left the preview showing whatever it had been showing — so
 * on a screen where the preview is the pane being read, the one control for
 * getting around answered in the pane that was not. `outlineJump` makes it a
 * choice, because which pane you want to land in depends on how the panes are
 * arranged and nothing here can work that out.
 *
 * The caret moves in all three cases, including `preview`, and that is not a
 * compromise: the preview half is `revealCursor`, which asks the compiler where
 * the *caret* printed, so there is no way to move the preview that does not go
 * through the caret first. What the three answers really choose is which pane
 * **scrolls** — and `preview` deliberately leaves the source where it was, so a
 * writer reading the laid-out sefer is not also dragged down their own file.
 *
 * `revealCursor` is quiet here. A jump that lands nowhere on the page is
 * ordinary rather than exceptional — a heading inside a folded region, a mark in
 * a part of the sefer this compile did not reach — and the source half has
 * already done something the writer can see.
 */
export function goToOffset(at: number) {
  const where = settings.outlineJump ?? "source";
  jumpTo(at, where !== "preview");
  if (where !== "source") rowsWiring().revealCaret();
}

/**
 * Perform a [`panelrows.RowAction`] — the six lines every list-shaped surface
 * shares.
 *
 * Out of `drawRow` because help now speaks the same vocabulary: a help entry
 * that names an operation can run it, and a second copy of this `switch` beside
 * the help panel is how one of them would come to disagree with the other.
 */
export function runRow(does: panelrows.RowAction, snaps: docs.Snapshot[] = []) {
  panelrows.dispatchRowAction(does, {
    jump: goToOffset,
    action: (id) => {
      closePalette();
      rowsWiring().runAction(id);
    },
    insert: (snippet) => {
      insertSnippet(snippet);
      closePalette();
    },
    restore: (snapshot) => rowsWiring().restore(snapshot),
    hit: (row) => {
      // Both, when both are known, and in this order: the caret first, because
      // that is where the writer will type, and the page second so the eye can
      // follow. A printed hit that no source line answers for — a running head,
      // a note's marker, an auto-numbered siman — shows the page and leaves the
      // caret alone rather than putting it somewhere plausible.
      if (row.at !== undefined) goToOffset(row.at);
      if (row.page !== undefined && row.y !== undefined) revealPrinted(row.page, row.y, 0);
    },
  }, snaps);
}

/**
 * Scroll every preview to a point on a page, given in Typst points.
 *
 * The tail of `revealCursor`, and it is the tail rather than a copy of it: what
 * `revealCursor` does that this does not is *ask the engine where the caret
 * printed*, which a find hit already knows. Everything from there down — the
 * page element, the box, the inverse of `jump.ts`'s arithmetic, the match point
 * — is the same problem and would have been the same code written twice.
 */
export function revealPrinted(page: number, y: number, anchor?: number) {
  const pages = currentPages();
  const index = page - 1;
  const box = pageBox(pages[index]);
  if (!box) return;
  for (const host of document.querySelectorAll<HTMLElement>(".preview-host")) {
    const node = host.querySelector<HTMLElement>(`.page[data-page="${index}"]`);
    if (!node) continue;
    const spot = pixelInPage({ page: index, x_pt: 0, y_pt: y }, node.getBoundingClientRect(), box);
    const pageTop = node.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop;
    const mp = anchor !== undefined ? anchor : matchFraction();
    host.scrollTo({
      top: clampScroll(pageTop + spot.y - mp * host.clientHeight, host),
      behavior: "smooth",
    });
  }
}

export function drawRow(r: PanelRow, look: Look, first: boolean, snaps: docs.Snapshot[]): HTMLElement {
  const run = () => runRow(r.does, snaps);
  const attrs: Record<string, unknown> = {
    class: look.row + (look.selectable && first ? " sel" : ""),
    onClick: run,
    ...(r.indent ? { style: `padding-inline-start:${panelrows.indentPx(r.indent)}px` } : {}),
    ...(r.title ? { title: t(r.title) } : {}),
    ...(r.does.kind === "action" ? { "data-action": r.does.id } : {}),
  };
  if (look.selectable) {
    // Hover moves the selection so the mouse and the keyboard never disagree
    // about which row Enter would run.
    attrs.onMouseEnter = (e: Event) => {
      const row = e.currentTarget as HTMLElement;
      row.parentElement?.querySelectorAll(".pal-item.sel").forEach((x) => x.classList.remove("sel"));
      row.classList.add("sel");
    };
  }
  if (r.does.kind === "note") {
    const marker = r.does.marker;
    attrs.onContextMenu = (e: Event) => {
      e.preventDefault();
      openNoteMenu(e as MouseEvent, marker);
    };
  }
  const when = r.when !== undefined ? new Date(r.when) : null;
  const button = el("button", attrs, [
    ...(r.chip ? [el("span", { class: look.chip }, [t(r.chip)])] : []),
    ...(when ? [el("span", { class: look.chip }, [when.toLocaleDateString()])] : []),
    ...(r.note ? [el("span", { class: "note-item-def" }, [r.note])] : []),
    el(look.label, {}, [r.label]),
    ...(r.trailing ? [el("code", {}, [r.trailing])] : []),
    ...(when ? [el("code", {}, [when.toLocaleTimeString()])] : []),
  ]);
  return r.full || r.context ? expandable(button, r) : button;
}

/** Update one retained row with a fresh outer shape and listener set. */
export function updateRow(node: HTMLElement, r: PanelRow, look: Look, snaps: docs.Snapshot[]): HTMLElement {
  const selected = node.classList.contains("sel") || !!node.querySelector(".sel");
  const expanded = node.classList.contains("expanded");
  const active = document.activeElement;
  const focusExpand = active instanceof HTMLElement && node.contains(active) && active.classList.contains("row-expand");
  const fresh = drawRow(r, look, false, snaps);
  const target = fresh.matches(".pal-item") ? fresh : fresh.querySelector<HTMLElement>(".pal-item");
  if (selected) {
    target?.classList.add("sel");
  }
  if (expanded) fresh.classList.add("expanded");
  const toggle = fresh.querySelector<HTMLElement>(".row-expand");
  if (expanded) toggle?.setAttribute("aria-expanded", "true");
  if (focusExpand) focusAfterRowReplace.add(fresh);
  // `drawRow` is also the authority for the outer tag, attributes and event
  // listeners. Replacing the outer element avoids stale listeners when a row's
  // action changes and handles a plain button becoming an expandable wrapper
  // (or the reverse) without trying to copy an incomplete attribute set.
  return fresh;
}

/**
 * A row that can be opened where it stands.
 *
 * Asked for the notes pane — *"it should expand to the whole note, and to the
 * line the note sits on"*. A row shows a gist, which is enough to recognise a
 * note and never enough to read one, and the only way to read it was to leave
 * the list and go to the text. The jump is still what the row itself does; this
 * is the other question a writer has about a note, which is what it says.
 */
function expandable(button: HTMLElement, r: PanelRow): HTMLElement {
  const body = el("div", { class: "row-more" }, [
    ...(r.full ? [el("div", { class: "row-full" }, [r.full])] : []),
    ...(r.context ? [el("div", { class: "row-context" }, [r.context])] : []),
  ]);
  const toggle = el("button", {
    class: "row-expand",
    type: "button",
    title: t("expandRow"),
    "aria-label": t("expandRow"),
    "aria-expanded": "false",
    onClick: (e: Event) => {
      const wrap = (e.currentTarget as HTMLElement).parentElement!;
      // `expanded`, not `open`: `open` belongs to the panel registry, which
      // owns every panel's visibility and has a guard saying so. A row that
      // opens in place is not a panel and must not borrow the word.
      const shown = wrap.classList.toggle("expanded");
      (e.currentTarget as HTMLElement).setAttribute("aria-expanded", String(shown));
    },
  }, ["⌄"]);
  return el("div", { class: "row-wrap" }, [button, toggle, body]);
}
