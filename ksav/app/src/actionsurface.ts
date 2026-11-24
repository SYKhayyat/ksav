// The action surface: every command the shell can run, and the dispatcher.
//
// `BUILT_IN` is the table — what the palette lists, what a key can be bound to,
// what the ribbon's buttons call. It is the largest single constant `main.ts` had
// (293 lines) and it was there because everything it names was there. Wave 6 moved
// the structure commands and wave 7 the chrome rebuild, and by then the table
// needed **nothing** from `main.ts` at all: every name below is a module export.
//
// The dispatcher came with it (`actions`, `actionById`, `runAction`,
// `styleActions`, and the `inAction` re-entrancy counter). Splitting the table
// from the thing that looks entries up would have left two files agreeing about
// an id by convention.
//
// `startFind`, `toggleIsolateSelection`, `stepZoom`, `moveOutOfBracket`,
// `toggleMinimap` and `minimapDeps` are here because the table is their only
// caller — they are the last commands that lived in `main.ts`.

import * as heads from "./headings";
import * as panes from "./panes";
import * as spell from "./spell";
import * as structure from "./structure";
import * as styles from "./styles";
import * as tabs from "./tabs";
import * as zoom from "./zoom";
import { ACTION_COMMAND, BREAK_COMMAND, PLACED_COMMANDS, runRegisteredAction } from "./actions";
import { EditorView } from "@codemirror/view";
import { LIST_DEPTHS } from "./lists";
import { applyCustomStyle } from "./customstyles";
import { compileNow } from "./compile";
import { cyclePaneZoom } from "./panehost";
import { docTextNow } from "./ribbon";
import { docTextOf } from "./spans";
import { foldAll, unfoldAll } from "@codemirror/language";
import { healAll } from "./bracket-lint";
import { insertFold, hideBlockHere, hideLineHere, hiddenBreak, makeListHere, addContentsHere, foldToLevel, foldListsToDepth, runStructureAction, entityAct } from "./editorcommands";
import { insertSnippet, insertCommand, tieredNoteHere, docLang } from "./insert";
import { jumpDeferred, deferHere, recallHere, deferAll, inlineAll, sortDeferredBodies } from "./deferred-editor";
import { linkifySelection, refreshSources, askForMekor } from "./girsa";
import { markReview, addComment } from "./reviewpanel";
import { moveOutTarget } from "./brackets";
import { narrowHere, widenHere } from "./paneview";
import * as macros from "./macros";
import { noteAction, toggleRecording, savedMacros, playMacro } from "./macros";
import { openCommands } from "./commandsdrawer";
import { openFile, saveFile } from "./fileui";
import { openGit } from "./gitui";
import { openHelp } from "./help";
import { openHydra } from "./hydra";
import { openKeys } from "./keysdrawer";
import { openMinimap, closeMinimap, minimapIsOpen } from "./minimapstrip";
import { openPalette } from "./palette";
import { openPanel, isPanelOpen } from "./panels";
import { openSearchPanel } from "@codemirror/search";
import { openSpellMenu } from "./spellcheck";
import { openSwitcher, goToLastDoc, closeOpenDoc, newDoc, renameDoc, duplicateDoc } from "./docswitch";
import { renderAllNotes } from "./apparatus-lint";
import { renumberAll } from "./numbering-lint";
import { revealCursor, revealPlaces } from "./reveal";
import { selectTab, closeTab, newTab, newDocTab } from "./tabstrip";
import * as runtime from "./runtime";
import { setStatus } from "./runtime";
import { settings, saveSettings, docConfig, setSetting } from "./settings";
import { swapPaneToward } from "./panedrag";
import { t, tf } from "./i18n";
import { takeSnapshot } from "./snapshots";
import { toggleIsolate } from "./bidi";
import type { Placement } from "./minimap";
import { undo, redo } from "@codemirror/commands";
import { voidAction } from "./asyncaction";
import { EXPORTS } from "./header";
import { openNotesChooser } from "./noteschooser";
import { openFormula } from "./formulas";
import { openSectionSetup } from "./sectionsetup";
import { insertImage } from "./assets";

export const BUILT_IN: { id: string; run: (v: EditorView) => boolean }[] = [
  // Every action that inserts a registry command, generated from the one table
  // that says which. Hand-listing them here is what let the bullet list come out
  // two different ways depending on how you asked for it — see `actions.ts`.
  ...Object.entries(ACTION_COMMAND)
    .filter(([id]) => !(PLACED_COMMANDS as readonly string[]).includes(id))
    .map(([id, he]) => ({
      id,
      run: () => insertCommand(he),
    })),
  // The one door in that table that places its command rather than splicing it
  // in. See `addContentsHere`.
  { id: "toc", run: () => addContentsHere() },
  // #89 — the minimap strip. In `BUILT_IN` so the binding in `DEFAULT_KEYS`, the
  // palette and the Settings list all resolve it: a chord in `DEFAULT_KEYS` with
  // **no action behind it** is a chord that silently does nothing, which is how
  // `Ctrl-Alt-Shift-M` appeared to be a dead key rather than a missing one.
  { id: "minimap", run: () => (toggleMinimap(), true) },
  {
    id: "tieredNote",
    run: () => {
      const st = runtime.view.state;
      insertSnippet(tieredNoteHere(docTextOf(st.doc), st.selection.main.from));
      return true;
    },
  },
  {
    // Put every series back in sequence, on demand. The lint offers this on the
    // line it marks; an action makes it bindable, findable in the palette and
    // recordable in a macro — which is how everything a writer can do is
    // reachable here, and what a repair that only exists inside a lint is not.
    id: "renumber",
    run: (v) => {
      const n = renumberAll(v);
      setStatus(n ? tf("renumbered", n) : t("renumberedNothing"), n ? "ok" : "");
      return true;
    },
  },
  // The verb the product had no word for: take what is written and make it a
  // list, reading the numbers the writer typed by hand and throwing them away.
  { id: "makeList", run: () => makeListHere() },
  // Selecting a whole construct, and taking one off. See `entity.ts` for why
  // all three are generic over `Node` rather than a list of command names.
  //
  // `entitySelect` widens on every press, which is why it is the one bound
  // nearest to hand: *see the extent before you act on it* is the whole answer
  // to "hand-deleting a command name, its parentheses, its brackets and its
  // arguments", and the two that follow are then unmissable.
  { id: "entitySelect", run: () => entityAct("select") },
  { id: "entityUnwrap", run: () => entityAct("unwrap") },
  { id: "entityRemove", run: () => entityAct("remove") },
  // One question — does this reach the page? — asked three ways. See `hiding.ts`.
  { id: "fold", run: () => (insertFold(), true) },
  { id: "hideBlock", run: () => (hideBlockHere(), true) },
  { id: "hideLine", run: () => (hideLineHere(), true) },
  { id: "hiddenBreak", run: () => (hiddenBreak(), true) },
  // The visible line break, given a key of its own. Not in `ACTION_COMMAND`
  // because it lives in `BREAK_COMMAND` with the family — the same reason
  // `hiddenBreak` is hand-listed here rather than generated.
  { id: "lineBreak", run: () => insertCommand(BREAK_COMMAND.lineBreak) },
  // The fourth break. It had a menu row and no action, so it was the one break
  // a writer could not bind, find in the palette, or put on a tab (#233).
  { id: "columnBreak", run: () => insertCommand(BREAK_COMMAND.columnBreak) },
  // `paraBreak` and `pageBreak` used to be hand-written here. They are in
  // `ACTION_COMMAND` now, so their doors are generated with every other command
  // action above — which is what makes the registry row for each print the key
  // that also runs it. See `actions.BREAKS`.
  { id: "undo", run: (v) => undo(v) },
  { id: "redo", run: (v) => redo(v) },
  // Lay the sefer out now. Bound and in the palette under every setting, not
  // only `manual`: "compile now" in the middle of a relaxed wait is a thing
  // writers press, and a control that exists only under one setting is one
  // nobody learns.
  { id: "compileNow", run: () => (compileNow(), true) },
  { id: "palette", run: () => (openPalette(), true) },
  { id: "commandsDrawer", run: () => (openCommands(), true) },
  { id: "gitPanel", run: () => (openGit(), true) },
  { id: "keysDrawer", run: () => (openKeys(), true) },
  { id: "ribbonCustomize", run: () => (runtime.openCustomize(), true) },
  // Which sefer a search reads is a setting, so which surface opens is too.
  // `source` is the default and is what this has always done — the editor's own
  // find panel over the buffer. The other two open the find drawer, which is
  // the only surface that can show a hit on a page.
  { id: "find", run: (v) => startFind(v) },
  { id: "replace", run: (v) => startReplace(v) },
  // The clipboard, as buttons (§5, Home ▸ Edit). The keys need nothing: the
  // browser's own cut, copy and paste reach CodeMirror's handlers. A button is
  // not a key, so it asks for the same events.
  { id: "cut", run: (v) => clipboardOut(v, "cut") },
  { id: "copy", run: (v) => clipboardOut(v, "copy") },
  { id: "paste", run: (v) => (voidAction("general", () => pasteInto(v)), true) },
  { id: "foldAll", run: (v) => foldAll(v) },
  { id: "unfoldAll", run: (v) => unfoldAll(v) },
  // Lock this pane to the section the caret is in, and let it out again. On the
  // focused pane and nowhere else — `v` is `runtime.view`, which is the pane the
  // writer is typing in, and narrowing every pane at once would destroy the one
  // arrangement the feature exists for.
  { id: "narrow", run: (v) => (narrowHere(v), true) },
  { id: "widen", run: (v) => (widenHere(v), true) },
  // Move the caret past the closing bracket of the current bracket pair.
  { id: "moveOutOfBracket", run: (v) => moveOutOfBracket(v, false) },
  { id: "moveOutOfBracketToNextLine", run: (v) => moveOutOfBracket(v, true) },
  // All of them at once. The request in #121 was "move out of nested/all
  // brackets"; the pair below is what that means at a caret sitting three groups
  // deep, and `Mod-Alt-0` is the same family as `Mod-Alt-1..3` — those fold *to*
  // a depth, and zero depth is no grouping at all.
  { id: "moveOutOfAllBrackets", run: (v) => moveOutOfBracket(v, false, true) },
  // Fold *to a depth*: chapters only, or chapters and simanim. `foldAll` takes
  // every collapsible thing in the document down at once, which is a different
  // question and the only one this editor could answer.
  // Every level the editor can write, not the three that had chords. Three was
  // the count of *keys somebody had bound*, and it had become the count of
  // depths the product could fold to — the same six-versus-nine leak the
  // heading styling had. An action exists for each, so the palette and the menu
  // reach all of them and the keyboard keeps the three that are worth a chord.
  ...Array.from({ length: heads.MAX_LEVEL }, (_, i) => i + 1).map((level) => ({
    id: `foldLevel${level}`,
    run: (v: EditorView) => (foldToLevel(v, level), true),
  })),
  // The other nesting in this product, and the half of the report that had
  // nothing at all: *"the same for the siman/seif hierarchy and for lists, each
  // of which has its own nesting"*. Simanim are headings — `#סימן` is
  // `heading(level: 1, …)`, which is why the levels above already reach them —
  // but a list's depth is its own, and no surface could ask about it.
  ...LIST_DEPTHS.map((depth) => ({
    id: `foldListDepth${depth}`,
    run: (v: EditorView) => (foldListsToDepth(v, depth), true),
  })),
  { id: "save", run: () => (saveFile(), true) },
  { id: "open", run: () => (openFile(), true) },
  { id: "newDoc", run: () => (newDoc(), true) },
  // The Documents menu's two rows that were not actions (#233).
  { id: "renameDoc", run: () => (voidAction("save_file", () => renameDoc()), true) },
  { id: "duplicateDoc", run: () => (voidAction("save_file", () => duplicateDoc(runtime.currentDoc.id)), true) },
  { id: "markInsert", run: () => (markReview("insert"), true) },
  { id: "markDelete", run: () => (markReview("delete"), true) },
  { id: "addComment", run: () => (addComment(), true) },
  // Every structural operation, generated. Hand-listing them here would be the
  // same mistake the ribbon used to make: a second place to forget one.
  ...structure.STRUCTURE_ACTIONS.map((a) => ({
    id: a.id,
    run: () => runStructureAction(a),
  })),
  {
    id: "help",
    run: () => (openHelp(), true),
  },
  {
    // Record / stop. One action rather than two, because "am I recording?" is a
    // state the writer can see in the chip and the status line.
    id: "macroRecord",
    run: () => (toggleRecording(), true),
  },
  {
    // Replay the most recently recorded macro — the one people want immediately
    // after recording, without naming or binding anything.
    id: "macroPlay",
    run: () => {
      const all = savedMacros();
      if (!all.length) {
        setStatus(t("macroNone"), "");
        return true;
      }
      playMacro(all[all.length - 1]);
      return true;
    },
  },
  {
    // Every citation in the document, as the library has it now (spec.md
    // §10.2). An action rather than a bare key, so it is findable in the
    // palette, bindable, and listed in Settings — which is how everything else
    // a writer can do is reachable, and the reason this one had no way in was
    // that it had no entry anywhere at all.
    id: "refreshSources",
    run: () => (void refreshSources(), true),
  },
  {
    // Look this phrase up in the library (spec.md §10.4). It answered to
    // `Ctrl+Shift+M` from a literal `e.key` test on the window, which is the
    // same "no entry anywhere" the comment above describes — one rung further
    // down, because a key that is not in `DEFAULT_KEYS` is not merely
    // unlisted: it cannot be rebound, it survives a keyboard mode that has
    // taken the whole keyboard, and no test can see it.
    id: "citePhrase",
    run: () => (void askForMekor(), true),
  },
  {
    // The citations in the selection, made live (spec.md §10.5). Same story,
    // and worse: its chord was `left`'s. Both ran.
    id: "linkifyCitations",
    run: () => (void linkifySelection(), true),
  },
  {
    // The hydra for whatever the caret is in.
    id: "hydra",
    run: () => (openHydra(), true),
  },
  {
    // Notes that were collected and never rendered. Reachable as a command and
    // as a key, not only as a lint action: a writer who has already exported
    // the PDF needs to find this without a squiggle to click.
    id: "renderNotes",
    run: (v) => {
      const n = renderAllNotes(v);
      setStatus(n ? tf("renderedNotesCount", n) : t("renderedNotesNone"), n ? "ok" : "");
      return true;
    },
  },
  {
    id: "healBrackets",
    run: (v) => {
      const n = healAll(v);
      setStatus(n ? tf("healedCount", n) : t("healedNothing"), n ? "ok" : "");
      return true;
    },
  },
  // Deferred note bodies. `deferJump` is the one that gets used: it is org-mode's
  // C-c C-c — marker to prose, prose to marker, and it writes the prose when
  // there is none rather than complaining that there is none.
  // Forward search: where did what I am typing print? The pair to clicking the
  // preview, which needs no key because it has a mouse.
  { id: "revealCursor", run: () => (voidAction("general", () => revealCursor()), true) },
  // The same question asked a second way (#82). `revealCursor` goes to the first
  // place a line printed, because a cursor has one place to be and reading order
  // is the right default; this opens **every** place, so a part that is included
  // twice can be pointed at deliberately. The list is the answer to a question
  // the first-place answer cannot express.
  { id: "revealPlaces", run: () => (voidAction("general", () => revealPlaces()), true) },
  // The manual override for when the automatic isolation does not reach.
  { id: "isolate", run: (v) => toggleIsolateSelection(v) },
  {
    // Suggestions for the word the caret is in. The pointer route is a
    // right-click; this is the one that does not need a pointer at all, and it
    // is also what the hover tooltip names — a signpost pointing at a key that
    // does not exist is worse than no signpost.
    id: "spellSuggest",
    run: (v) => {
      if (!settings.spellcheck) {
        setStatus(t("spellOff"), "warn");
        return true;
      }
      const m = spell.misspellingAt(v, v.state.selection.main.head);
      if (!m) {
        setStatus(t("spellNothingHere"), "");
        return true;
      }
      // Anchored to the word rather than to a pointer that was never here.
      const at = v.coordsAtPos(m.start);
      void openSpellMenu(m, at ? at.left : 0, at ? at.bottom : 0);
      return true;
    },
  },
  // The open set, from the keyboard. Both of them, because they answer different
  // questions: `lastDoc` is "back to the one I was in" and needs no reading,
  // `switcher` is "show me what I am holding" and does.
  { id: "lastDoc", run: () => (goToLastDoc(), true) },
  { id: "switcher", run: () => (openSwitcher(), true) },
  { id: "closeDoc", run: () => (voidAction("save_file", () => closeOpenDoc(runtime.currentDoc.id)), true) },
  { id: "newTab", run: () => (newTab(), true) },
  { id: "pane.zoom", run: () => (cyclePaneZoom(), true) },
  { id: "newDocTab", run: () => (voidAction("save_file", () => newDocTab()), true) },
  { id: "closeTab", run: () => (closeTab(tabs.activeIndex()), true) },
  // Round, in both directions. Round because a key that stops at the end is a
  // key you have to look at the screen to use; **both** directions because
  // round motion in one direction is only an answer for a writer who knows how
  // many arrangements there are, which is the counting the report *"or to move
  // from tab to tab"* was complaining about.
  //
  // Generated from the pair, so the two cannot drift into disagreeing about
  // what the strip's order is.
  ...([["nextTab", 1], ["prevTab", -1]] as const).map(([id, step]) => ({
    id,
    run: () => {
      const n = tabs.count();
      if (n > 1) selectTab((tabs.activeIndex() + step + n) % n);
      return true;
    },
  })),
  // Move this pane to where its neighbour is. Four actions rather than one
  // toggle, because a window is a tree and not a pair — see `panes.swap` for
  // what the operation is and `panes.neighbor` for how the side is decided.
  // Generated, so the four cannot drift apart from each other.
  ...(["left", "right", "up", "down"] as panes.Side[]).map((side) => ({
    id: `pane.swap${side[0].toUpperCase()}${side.slice(1)}`,
    run: () => swapPaneToward(side),
  })),
  { id: "deferJump", run: (v) => (jumpDeferred(v), true) },
  { id: "deferHere", run: (v) => (deferHere(v, docLang()), true) },
  { id: "deferRecall", run: (v) => (recallHere(v), true) },
  // Both directions, both bindable, both findable in the palette. The bulk moves
  // lived only on two buttons inside the notes chooser, which meant "change where
  // the bodies live" was a thing you could do only if you first opened a modal
  // about note *layouts* — a different question.
  { id: "deferAll", run: (v) => (deferAll(v), true) },
  { id: "deferRecallAll", run: (v) => (inlineAll(v), true) },
  { id: "deferSort", run: (v) => (sortDeferredBodies(v), true) },
  // Zoom, on the surface the writer is standing in. `zoom.surfaceOf` is where
  // that rule is written down; this is the three doors to it.
  { id: "zoomIn", run: () => stepZoom(1) },
  { id: "zoomOut", run: () => stepZoom(-1) },
  { id: "zoomReset", run: () => stepZoom(0) },
  // Keep this point in the history, now. It existed only as a button inside the
  // history panel — a door you have to already be behind — which is half of what
  // *"or automatic turned off and taken by hand"* was asking for: turning the
  // clock off is no use if the hand has nowhere to press.
  { id: "snapshot", run: () => (void takeSnapshot(true), true) },
  // Every row the menus drew that was not an action (#233). The shell is drawn
  // from `placement.ts`, which places actions, so a menu row with no action
  // behind it is a row the data cannot state. Each one delegates to the table
  // that already ran it — the header's run tables, the insert menu's openers —
  // so there is still one implementation of each, and the async ones keep
  // their `voidAction` (`asyncaction.test.mjs` reads those tables).
  { id: "notesChooser", run: () => (openNotesChooser(), true) },
  { id: "insertImage", run: () => (voidAction("general", () => insertImage()), true) },
  { id: "insertFormula", run: () => (openFormula(), true) },
  { id: "sectionSetup", run: () => (openSectionSetup(), true) },
  ...(["saveAs", "importWord", "importOrg", "shareRead", "shareReview", "saveAsTemplate"] as const).map((id) => ({
    id,
    run: () => (runtime.runHeader("file", id), true),
  })),
  ...EXPORTS.map((id) => ({ id, run: () => (runtime.runHeader("export", id), true) })),
  // The chips' verbs, under the action ids the placements use. A chip id is
  // the header's word for its button (`theme`, `language`); the action id is
  // the verb (`toggleTheme`, `toggleLang`), because an action id is what a
  // writer binds and reads in the palette.
  ...(
    [
      ["stylesPanel", "styles"],
      ["outline", "outline"],
      ["notesPane", "notesPane"],
      ["marksPane", "marksPane"],
      ["reviewPanel", "review"],
      ["toggleLang", "language"],
      ["prose", "prose"],
      ["arrangement", "arrangement"],
      ["toggleTheme", "theme"],
      ["nikud", "nikud"],
      ["history", "history"],
      ["settingsDrawer", "settings"],
    ] as const
  ).map(([id, chip]) => ({ id, run: () => (runtime.runHeader("chip", chip), true) })),
];

let inAction = 0;

/**
 * Whether something is running an action right now.
 *
 * The counter is `runAction`'s, and `main.ts` reads it to decide whether a typed
 * keystroke is the writer's or a command's. Exposing the read keeps the counter
 * in one place instead of moving it back to be divisible.
 */
export function isRunningAction(): boolean {
  return inAction > 0;
}

export function actionById(id: string): { id: string; run: (v: EditorView) => boolean } | undefined {
  return actions().find((a) => a.id === id);
}

export function runAction(id: string, v: EditorView = runtime.view): boolean {
  // Once: `actionById` re-derives the whole action array (the per-document
  // style scan included), and this used to pay that twice — the guard and
  // the argument — on every invocation.
  const action = actionById(id);
  if (!action) return false;
  inAction++;
  try {
    return runRegisteredAction(
      id,
      v,
      () => action,
      (actionId) => !!structure.actionById(actionId),
      noteAction,
    );
  } finally {
    inAction--;
  }
}

export function actions(): { id: string; run: (v: EditorView) => boolean }[] {
  return [
    ...BUILT_IN,
    // Every saved macro, as an action — which is what makes a macro bindable to
    // a key, findable in the palette and listed in Settings with no extra
    // wiring.
    ...savedMacros().map((m) => ({
      id: macros.actionIdOf(m),
      run: () => (playMacro(m), true),
    })),
    // **Every style this document defines, as an action.** Which is the whole
    // of *"each style should be assignable a key combination, and that binding
    // must appear wherever the style appears and in the shortcut list"*: being
    // in this list is what makes something bindable, and everything that shows
    // a chord — the keys drawer, the palette, the style dropdown, the vim and
    // Emacs command names — reads from here. A styles-only binding table would
    // have been a second answer to a question already answered once, and it
    // would have been the one that went stale.
    //
    // Per *document*, because a style is: the keymap is reconfigured whenever
    // the set of names changes, which is the same moment the dropdown is
    // refilled.
    ...styleActions(),
  ];
}

export function styleActions(): { id: string; run: (v: EditorView) => boolean }[] {
  if (!runtime.view) return [];
  return styles.findCustomStyles(docTextNow()).map((st) => ({
    id: styles.styleActionId(st.name),
    run: () => applyCustomStyle(st.name),
  }));
}

export function startFind(view: EditorView): boolean {
  if ((settings.searchScope ?? "source") === "source") return openSearchPanel(view);
  openPanel("find-drawer");
  return true;
}

/** Find, with the replace field focused: the search panel is both. */
function startReplace(view: EditorView): boolean {
  if (!openSearchPanel(view)) return false;
  view.dom.querySelector<HTMLInputElement>(".cm-search input[name=replace]")?.focus();
  return true;
}

/**
 * Cut or copy the selection. `execCommand` raises the real event, so
 * CodeMirror's own handler writes what it writes for a key; where the browser
 * refuses it, the selected text goes to the clipboard plainly.
 */
function clipboardOut(view: EditorView, how: "cut" | "copy"): boolean {
  view.focus();
  if (document.execCommand(how)) return true;
  const sel = view.state.selection.main;
  if (sel.empty) return false;
  void navigator.clipboard?.writeText(view.state.sliceDoc(sel.from, sel.to));
  if (how === "cut") view.dispatch(view.state.replaceSelection(""));
  return true;
}

/**
 * Paste what the clipboard holds, through the editor's paste handler — the one
 * that reads a Girsa packet and pastes into every caret — by raising a paste
 * event carrying it. Only text and HTML: a button cannot read files.
 */
async function pasteInto(view: EditorView): Promise<void> {
  view.focus();
  const data = new DataTransfer();
  // `read` is the newer half and not everywhere, nor always allowed; plain text
  // is the fallback below, and the writer hears if that is refused too.
  const items = (await navigator.clipboard?.read?.().catch(() => undefined)) ?? [];
  for (const item of items) {
    for (const type of item.types.filter((t) => t === "text/plain" || t === "text/html")) {
      data.setData(type, await (await item.getType(type)).text());
    }
  }
  if (!data.getData("text/plain")) {
    const text = await navigator.clipboard?.readText?.().catch(() => "");
    if (!text) {
      setStatus(t("pasteDenied"), "warn");
      return;
    }
    data.setData("text/plain", text);
  }
  const ev = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
  if (view.contentDOM.dispatchEvent(ev)) view.dispatch(view.state.replaceSelection(data.getData("text/plain")));
}

export function toggleMinimap(): void {
  if (minimapIsOpen()) {
    closeMinimap();
    settings.minimap = false;
  } else {
    openMinimap(minimapDeps());
    settings.minimap = true;
  }
  saveSettings();
}

export function minimapDeps() {
  return {
    dir: (): "rtl" | "ltr" => (docConfig().dir === "rtl" ? "rtl" : "ltr"),
    saved: () => settings.minimapAt,
    remember: (p: Placement) => {
      settings.minimapAt = p;
      saveSettings();
    },
    close: () => {
      closeMinimap();
      settings.minimap = false;
      saveSettings();
    },
  };
}

function toggleIsolateSelection(v: EditorView): boolean {
  const range = v.state.selection.main;
  if (range.empty) {
    setStatus(t("isolateNeedsSelection"), "warn");
    return true;
  }
  const text = v.state.sliceDoc(range.from, range.to);
  const next = toggleIsolate(text);
  v.dispatch({
    changes: { from: range.from, to: range.to, insert: next },
    // Keep the writer's own text selected, not the marks around it — the
    // selection is what they chose, and a second press must undo the first.
    selection: { anchor: range.from, head: range.from + next.length },
  });
  setStatus(next.length < text.length ? t("isolateRemoved") : t("isolateAdded"), "ok");
  return true;
}

export function moveOutOfBracket(v: EditorView, toNextLine: boolean, all = false): boolean {
  const doc = docTextOf(v.state.doc);
  const pos = v.state.selection.main.head;
  const nextPos = moveOutTarget(doc, pos, all ? "outermost" : "innermost");
  if (nextPos === null) return false;
  let target = nextPos;
  if (toNextLine) {
    const line = v.state.doc.lineAt(nextPos);
    if (line.number < v.state.doc.lines) {
      target = v.state.doc.line(line.number + 1).from;
    }
  }
  if (target !== pos) v.dispatch({ selection: { anchor: target } });
  return true;
}

function stepZoom(by: number): boolean {
  const surface = zoom.surfaceOf(!!runtime.view?.hasFocus);
  const field = zoom.FIELD_OF[surface];
  const now = (settings[field] ?? zoom.DEFAULT);
  const next = by === 0 ? zoom.DEFAULT : zoom.step(now, by);
  setSetting(field, next as never);
  // Say what happened and to which of the two, because the difference between
  // "the text got bigger" and "the page got bigger" is invisible in a window
  // where only one of them is on screen.
  setStatus(`${t(surface === "source" ? "zoomSource" : "zoom")} ${zoom.percent(next)}`, "");
  // The panel is where the number lives; if it is open it must not go on showing
  // the old one.
  if (isPanelOpen("settings-drawer")) runtime.rerenderChrome();
  return true;
}
