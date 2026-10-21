// The tab strip: arrangements as tabs, and the one open-door for documents.
// Owns: the strip and its buttons, tab switching and closing and renaming, the
// page hand-over that runs between two documents on one pane tree, `enterDoc`
// — the one function every route into a document passes through — and the
// debounced side-pane refresh.
// Defers: the panes and their tree to `panestate` (the wiring object carries
// everything main.ts owns: the state factory, the document switcher, the
// side-pane draws); the strip DOM's mounting to whoever asked for it.
// Refuses: opening a document by any other road. `enterDoc` reads
// `settings.openIn` and nothing else may; a second route is how "open" and
// "replace" came to mean the same thing.

import * as panestate from "./panestate";
import * as panes from "./panes";
import * as tabs from "./tabs";
import * as docs from "./docs";
import * as runtime from "./runtime";
import { rememberPages, showPagesFor } from "./preview";
import { settings } from "./settings";
import { scheduleCompile, supersedeCompiles } from "./compile";
import { t, tf } from "./i18n";
import { el, glyphBtn } from "./dom";
import { closeMenus } from "./panels";
import { flushSaves } from "./save";
import { setStatus } from "./runtime";
import { voidAction } from "./asyncaction";

/**
 * Give the preview to the document arriving, synchronously, right now.
 *
 * **Why this cannot wait for `openDoc`.** Three routes rebuild the panes before
 * the document changes — selecting a tab, closing one, and opening a sefer into
 * a new tab. `openDoc` is the one that swaps the document, and it `await`s
 * twice before it touches the preview, so between the render and those awaits
 * the pane shows **the sefer you just left, under the tab you just arrived in**.
 * Long enough for the departing document's own compile to land in it and report
 * its page count, which is how the acceptance run found this: the pane answered
 * "1 page" for a sefer that had four.
 *
 * A pane stating one document while the editor holds another is the exact
 * family this application is audited for, so the hand-over is done here, in one
 * turn, and `openDoc` is told not to do it again — doing it twice would file
 * the *arriving* document's pages under the departing one's name.
 */
function handOverPages(leaving: string | null, arriving: string) {
  if (leaving && leaving !== arriving) {
    panestate.rememberPlaces(leaving);
    rememberPages(leaving);
  }
  // Before the pages are drawn, not after: a layout of the document being left
  // is still in flight, and `runtime.currentDoc` still names it — truthfully,
  // for the few awaits it takes `openDoc` to reach the store — so nothing else
  // in the application has grounds to refuse it. It would land on the pages
  // drawn below and repaint them with the wrong sefer's.
  supersedeCompiles();
  showPagesFor(arriving);
}

/**
 * Move a pane into another arrangement — an existing tab, or a new one.
 *
 * **The document is not touched.** A tab holds a pane tree and nothing else that
 * matters (see `tabs.ts`), and the open set is global, so a pane arriving in
 * another tab arrives showing a document that was already open. That is what
 * makes this a window operation rather than a document one, and why the pane
 * keeps its id: `paneplaces` remembers where it was standing in each document,
 * and a pane that changed identity on the way would forget.
 *
 * Refused for the last pane in an arrangement. A tab with no panes is not a
 * state this application has — the same rule `closePane` holds — and saying so
 * is more useful than silently leaving the pane where it is.
 */
export function movePaneToTab(pane: panes.Leaf, index: number) {
  const without = panes.closePane(panestate.paneTree, pane.id);
  if (without === panestate.paneTree) {
    setStatus(t("cannotMoveLastPane"), "warn");
    return;
  }
  const carried = panes.find(panestate.paneTree, pane.id);
  if (!carried) return;
  // This arrangement first, so the tab being left is stored without the pane
  // before anything switches. `stash` writes into the active tab, which is still
  // this one.
  panestate.setPaneTree(without);
  tabs.stash(panestate.paneTree, panestate.focusedPane);

  const named = (tab: tabs.Tab) =>
    tabs.label(tab, (id) => docs.library().find((e) => e.id === id)?.title, t("untitled"));
  const all = tabs.all();
  if (index < 0 || index >= all.length) {
    // A new tab holding just this pane. `add` puts it after the current one and
    // makes it active, which is what "move it there" means — you go with it, so
    // there is no `selectTab` to call and the window is drawn from here.
    const made = tabs.add(carried, carried.id);
    panestate.setPaneTree(made.tree);
    panestate.setFocusedPane(made.focusedPane);
    panestate.paneWiring().rebuildPanes();
    refreshTabStrip();
    panestate.rememberPanes();
    scheduleCompile();
    setStatus(tf("movedToTab", named(made)), "ok");
    return;
  }
  const target = all[index];
  // Down the side of whatever is already there, which is the one answer that
  // needs no question asked: it is where a new pane goes when the window is
  // split, and it never displaces what the tab was arranged to show.
  target.tree = {
    kind: "split",
    id: panes.paneId(),
    dir: "row",
    frac: 1 - panes.EDGE_SHARE,
    a: target.tree,
    b: carried,
  };
  target.focusedPane = carried.id;
  selectTab(index);
  setStatus(tf("movedToTab", named(target)), "ok");
}

// ---------------------------------------------------------------- the tab strip
//
// A tab is an **arrangement**, not a document. See `tabs.ts` for the rule that
// makes that work and the three consequences that follow from it; what is here
// is the strip, which is deliberately small.
//
// It is not on screen with one tab. The very first observation in the marked-up
// inventory was that sixteen things compete for the top of the window before a
// word is typed, and a strip showing a single tab spends a row of chrome telling
// a writer something they can already see.

/** The strip, or nothing. */
export function buildTabStrip(): HTMLElement {
  const strip = el("div", { class: "tabstrip", id: "tabstrip" });
  if (!tabs.stripVisible(settings.tabStrip ?? "always")) return strip;
  const titleOf = (id: string) => docs.library().find((e) => e.id === id)?.title;
  tabs.all().forEach((tab, i) => {
    const here = i === tabs.activeIndex();
    strip.append(
      el("div", { class: "tab" + (here ? " active" : "") }, [
        el(
          "button",
          {
            class: "tab-main",
            // Double-click to rename, which is where every tab strip ever built
            // puts it — and the moment an arrangement stops being a document
            // tab is the moment somebody wants to name it.
            onDblClick: () => renameTab(i),
            onClick: () => selectTab(i),
          },
          [tabs.label(tab, titleOf, t("untitled"))],
        ),
        // A `×`, and this is the one place in the application that keeps it for
        // closing. Closing a tab destroys nothing at all — every document it
        // showed is still open — which is why it can afford the glyph that
        // closing a *document* and deleting one both had to give up.
        glyphBtn(
          "×",
          t("closeTab"),
          (e: Event) => {
            e.stopPropagation();
            closeTab(i);
          },
          "tab-close",
          { "data-i18n-both": "closeTab" },
        ),
      ]),
    );
  });
  strip.append(
    glyphBtn("+", t("newTab"), () => newTab(), "tab-new", { "data-i18n-both": "newTab" }),
  );
  return strip;
}

export function refreshTabStrip() {
  document.getElementById("tabstrip")?.replaceWith(buildTabStrip());
}

/**
 * Point this arrangement's panes at a document.
 *
 * A pane's `docId` is what lets a tab name itself, and it is the difference
 * between two tabs that are genuinely two things and two tabs that are the same
 * view twice. Panes that named *no* document follow the focus, which is what
 * `null` means; a pane that named the document being left follows too, because a
 * writer switching document inside an arrangement means "show me this here".
 *
 * Mutated in place rather than rebuilt, deliberately: this runs on every
 * document switch, and going through `panes.update` would hand `renderPanes` a
 * new tree, which would destroy and rebuild every editor in the window — the
 * carets, the scroll and the folds of panes nobody touched — to change a label.
 */
export function retargetPanes(from: string | null, to: string) {
  for (const l of panes.leaves(panestate.paneTree)) {
    if (l.docId === null || l.docId === from) l.docId = to;
  }
}

/**
 * A second arrangement, starting from the shipped one, showing `docId`.
 *
 * Every panel of it is pinned to that document, so the new tab is *a thing*
 * rather than a second window onto whatever happens to be focused — which is
 * what makes an arrangement worth naming and worth coming back to.
 *
 * It does not open the document; the three callers differ in exactly that, and
 * conflating them is how "new arrangement" would come to mean "and lose my
 * place". `newTab` shows what is already open, `openInNewTab` opens something
 * else into it, and `newDocTab` makes the document first.
 */
function newTabShowing(docId: string) {
  tabs.stash(panestate.paneTree, panestate.focusedPane);
  const tab = tabs.add(panes.defaultTree());
  panestate.setPaneTree(tab.tree);
  retargetPanes(null, docId);
  panestate.setFocusedPane(null);
  panestate.paneWiring().rebuildPanes();
  refreshTabStrip();
  panestate.rememberPanes();
}

/** A second arrangement onto the document already on screen. */
export function newTab() {
  newTabShowing(runtime.currentDoc.id);
  scheduleCompile();
}

/**
 * That document, in an arrangement of its own.
 *
 * The second half of *"both an empty new tab and to open a doc in a new tab"*,
 * and it had no door at all: every route into a document — the Documents menu,
 * the switcher, the library — opened it **here**, over the arrangement the
 * writer was standing in. Which is the right default and was the only
 * behaviour, so comparing two seforim side by side in two tabs was a thing the
 * data model supported and the interface could not express.
 *
 * The arrangement is made first and the document opened into it, rather than
 * the other way round: opening first would put the second sefer over the first
 * one for as long as the compile takes, which is the flicker that makes a
 * writer think they lost their place.
 */
export async function openInNewTab(docId: string) {
  closeMenus();
  const leaving = runtime.currentDoc?.id ?? null;
  newTabShowing(docId);
  // The same window as `selectTab`'s, and it is why this is not simply awaited:
  // `newTabShowing` has already drawn the new arrangement, and until `openDoc`
  // gets past its awaits that arrangement is showing the sefer being left.
  handOverPages(leaving, docId);
  await panestate.paneWiring().openDocHanded(docId);
}

/**
 * Open a document, the way the writer asked documents to open.
 *
 * **The one door.** Every route into a document used to call `openDoc`
 * directly, which puts the arriving sefer into the panes the writer was
 * standing in — the report *"opening a document replaces the one I had open"*,
 * true of the switcher, the Documents menu, the library, a file, an import, a
 * share link and a rescued draft alike. `openInNewTab` existed and was reachable
 * only from a `⧉` on two rows, so the capability was there and the default was
 * the wrong way round.
 *
 * `openIn` is the setting; see `Settings.openIn` for what the three answers
 * mean. This function is the only place that reads it, so a nineteenth route
 * into a document joins by calling this rather than by being remembered.
 *
 * What deliberately does **not** come through here: closing a document,
 * deleting one, `goToLastDoc`, and the session restore. Those pick a document
 * to show in an arrangement that already exists; a new tab for any of them is a
 * tab nobody asked for.
 */
export async function enterDoc(docId: string) {
  const how = settings.openIn ?? "reuse";
  // Already the document on screen: nothing to open, whatever the setting says.
  // Without this, `newTab` makes a second arrangement onto the sefer you are
  // already reading every time you click its own row in the switcher.
  if (how !== "newTab" && runtime.currentDoc?.id === docId) return;
  if (how === "current") {
    await runtime.openDoc(docId);
    return;
  }
  if (how === "reuse") {
    // The active tab's tree lives in `paneTree` until it is stashed, so ask
    // about the arrangement as it *is*, not as it was when last left.
    tabs.stash(panestate.paneTree, panestate.focusedPane);
    const found = tabs.showing(docId);
    // `selectTab` no-ops on the tab already active, which is right for a tab
    // switch and wrong here: this arrangement can name a document the view is
    // not showing — a tab restored from the session before its document
    // arrived. So the active tab means "open it here", not "do nothing".
    if (found >= 0 && found !== tabs.activeIndex()) {
      selectTab(found);
      return;
    }
    if (found >= 0) {
      await runtime.openDoc(docId);
      return;
    }
  }
  await openInNewTab(docId);
}

/** A blank document, in an arrangement of its own. */
export async function newDocTab() {
  closeMenus();
  await flushSaves();
  const doc = await docs.createDoc(t("untitled"), "");
  await openInNewTab(doc.id);
}

export function selectTab(i: number) {
  if (i === tabs.activeIndex()) return;
  tabs.stash(panestate.paneTree, panestate.focusedPane);
  const tab = tabs.select(i);
  if (!tab) return;
  panestate.setPaneTree(tab.tree);
  panestate.setFocusedPane(tab.focusedPane);
  panestate.paneWiring().rebuildPanes();
  refreshTabStrip();
  panestate.rememberPanes();
  // **And the document it was showing.** A tab remembers the arrangement *and*
  // which document sat in each pane; restoring only the geometry gives a writer
  // back the shape of the window they left with somebody else's text in it,
  // which is worse than not restoring it at all. `openDoc` does nothing when the
  // document is already on screen, so switching between two tabs on one document
  // costs nothing.
  const want = tabs.focusedDoc(tab);
  if (want && want !== runtime.currentDoc?.id) {
    handOverPages(runtime.currentDoc?.id ?? null, want);
    voidAction("save_file", () => panestate.paneWiring().openDocHanded(want));
  } else scheduleCompile();
}

export function closeTab(i: number) {
  // Stash first, or closing a tab that is not the active one writes the closed
  // tab's index over the active tab's arrangement.
  tabs.stash(panestate.paneTree, panestate.focusedPane);
  const next = tabs.close(i);
  if (!next) return;
  panestate.setPaneTree(next.tree);
  panestate.setFocusedPane(next.focusedPane);
  panestate.paneWiring().rebuildPanes();
  refreshTabStrip();
  panestate.rememberPanes();
  const want = tabs.focusedDoc(next);
  if (want && want !== runtime.currentDoc?.id) {
    handOverPages(runtime.currentDoc?.id ?? null, want);
    voidAction("save_file", () => panestate.paneWiring().openDocHanded(want));
  } else scheduleCompile();
}

async function renameTab(i: number) {
  const tab = tabs.all()[i];
  if (!tab) return;
  const name = await panestate.paneWiring().askText(t("renameTabPrompt"), tab.name ?? "");
  if (name === null) return;
  tabs.rename(i, name);
  refreshTabStrip();
  panestate.rememberPanes();
}

/**
 * The count, on a short beat rather than on every keystroke.
 *
 * `countableText` runs the whole document through five regular expressions, and
 * this was called synchronously from the update listener: 1.9 ms per keystroke on
 * a 64 KB document, 6.4 ms on a 192 KB one, inside a frame budget of 16 ms that
 * prose mode and CodeMirror are also spending from. Nobody reads a word count at
 * sixty frames a second; a fifth of a second late it is still the same number,
 * and the keystroke it is late for is the one being typed.
 */
/**
 * The three side panes, on the same beat as the word count.
 *
 * These were called synchronously from the update listener, on **every
 * keystroke**, and they are not cheap:
 *
 *   - `renderOutline()` scans the document and rebuilds the list.
 *   - `renderNotesPane()` scans it, then calls `plainText()` once per note — on
 *     a sefer with 200 notes that is 200 more scanner invocations and ~600 DOM
 *     nodes, per character typed.
 *   - `renderReviewPanel()` scans, rebuilds, and in doing so **destroys the
 *     reviewer-name input** — including while somebody is typing into it. That
 *     one is not a performance bug at all; it is why the field could not be
 *     filled in on a document that was also being edited.
 *
 * And these are precisely the two panes a writer keeps open *while writing*, so
 * the cost lands on the person the feature is for.
 *
 * The same 200 ms as the count, and for the same reason: nobody reads an outline
 * at sixty frames a second, and a fifth of a second later it is the same list.
 * The panes still refresh immediately when they are *opened* — `renderOutline`
 * and friends are called directly there — so only the typing path is delayed.
 */
let paneTimer: number | undefined;

export function refreshPanes() {
  clearTimeout(paneTimer);
  paneTimer = window.setTimeout(() => {
    // The review list is a view of the document's own marks, so an edit
    // anywhere — not only a decision taken in the panel — must refresh it.
    panestate.paneWiring().refreshSidePanes();
  }, PANE_DEBOUNCE_MS);
}

const PANE_DEBOUNCE_MS = 200;
