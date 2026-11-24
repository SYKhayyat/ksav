import "./styles.css";
import { EditorView } from "@codemirror/view";
import { buildExtensions } from "./editorstate";
import { applyTheme, applySourceZoom, updateCounts, rerenderChrome } from "./layout";
import { wireHeader } from "./appheader";
import { EditorState } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import { setRevealAll } from "./ksav-lang";
import { tagContaining, selectTag } from "./tagselect";
import { minimapIsOpen, wireMinimapPanel } from "./minimapstrip";
import { scheduleRenumber } from "./numbering-lint";
import * as panelviews from "./panelviews";
import { setLang, t, tf } from "./i18n";
import type { Lang } from "./i18n";
import * as docs from "./docs";
import { aliasesInForce } from "./bindings";
import * as sefarim from "./sefarim";
import * as spell from "./spell";
import { clearSpellCheck, forceFullSpellCheck, markSpellDirty, scheduleSpellCheck } from "./spellcheck";
import { keybindings } from "./keyhint";
// The modules `main.ts` was split into, wave by wave, and what each one took —
// the map the refactor's end-state acceptance promised would live here:
//
//   store/save/compile/api — the bottom shelf: bytes, writes, the engine pipe.
//   runtime.ts — the seam: state and verbs every module shares (the open
//     document, the view, the status line, rerenderChrome). Nothing below
//     imports upwards past it.
//   settings + settingsdrawer — the app's own record, and its drawer.
//   rowlists/panelviews/snapshots/gitui/commandsdrawer/help — the list-dressed
//     panels and drawers (wave 6/7): rows, version control, help.
//   macros/hydra — the recorder and the structure keyboard (wave 5/7), the
//     engine vocabulary each in one file.
//   stylespanel/customstyles/stylecontrols — the formatting panel, the
//     writer's own styles (wave 8), and the knob family the borrowings share
//     (the audit's #152).
//   formmodal/destinations/reviewpanel/sectionsetup/formulas/noteschooser/
//     assets — the form's doors and the document's tenants (wave 9).
//   templates/fileui — the template doors and the bound file's UI half
//     (wave 11); applifecycle — the app's own life: crash, recovery, updates,
//     the service worker (the audit's #154).
//   starter/docswitch — the first screen, the welcome overlay and the switch
//     machine (wave 10, and the audit's #147 for the overlay's move),
//     borrowing makeState and syncGlobals through their wirings.
//   girsa — the panel feature (linkify, sources, mekoros) and now the handoff
//     poll beside it (spec.md §10.6; the audit's #147 for the move).
//   reveal — the source-says-here direction (wave 12 part 1, the audit's #147).
//   wiring/lintkit — the registration container every borrowing shares
//     (#145) and the lint glue three lints re-derived (#150).
//   What stayed: makeState and its extension composition, the compartments,
//   buildShortcutKeymap + reconfigureShortcuts, syncGlobals/setEditingMode,
//   boot(), and the header bar (its three main-locals are the settings
//     machinery wave 6 held — see #147's record) — the recipe for how the
//     whole app is assembled.
import { dictionaryOf } from "./api";
import * as runtime from "./runtime";
import { setStatus, closeMenus, editDoc } from "./runtime";
import { docTextNow, wireChrome } from "./ribbon";
import { updateContextBar } from "./contextbar";
import { openPanel, closePanel, togglePanel, isPanelOpen, wirePanel, closeOnEscape, handleEscape, closeOnOutsideClick } from "./panels";
import {
  settings,
  saveSettings,
  applyPreset,
  undoPreset,
  docConfig,
  setSetting,
  setPageSetup,
  now,
  wireSettingsWrite,
} from "./settings";
// The alignment pair is read and written as a unit rather than field by field —
// see `alignRow` — so it comes in under a namespace instead of as four more
// names in the list above.
import { action, voidAction } from "./asyncaction";
import { actionName } from "./actions";
import { savedNameMap } from "./macros";
import * as save from "./save";
import { scheduleSave, reportSaveFailure } from "./save";
import { scheduleCompile, compileNow, onStale, onAfterCompile, onSchedule } from "./compile";
import { scanForBackend } from "./scanmemo";
import { applyPreview, drawCurrentInto } from "./preview";
import { sourceViews, toEveryPane, wirePanes } from "./panestate";
import { renderPanes, refreshPaneHeads } from "./panehost";
import { invalidateScrollMap, followCaretInPreview } from "./panescroll";
import { refreshPanes } from "./tabstrip";
import * as keymodes from "./keymodes";
import { troubleSaid } from "./diagnostics";
import * as structure from "./structure";
import { renderHelp } from "./help";
import { renderOutline, renderNotesPane, renderMarksPane, renderFindPane, drawList, LOOKS, wireRows } from "./rowlists";
import { captureShortcut, resetShortcuts, wireSettings } from "./settingsdrawer";
import { applyCustomStyle, unwrapCustomStyle, openNewStyle, openStyleEditor } from "./customstyles";
import { openStylesFor, renderStylesPanel, wireStyles } from "./stylespanel";
import { destinationRows, wireDestinations } from "./destinations";
import { settlePendingModals, ask, askText } from "./formmodal";
import { isReviewOpen, renderReviewPanel } from "./reviewpanel";
import { applyNotePick, bodyHome, renderNotesChooser } from "./noteschooser";
import { addFont, removeAsset } from "./assets";
import { searchPhrases, swapUntouchedStarter, wireStarter, maybeOnboard } from "./starter";
import { wireTemplates } from "./templates";
import { boot, scheduleAutoSnapshots, wireBoot } from "./boot";
import { actions, actionById, runAction, toggleMinimap, minimapDeps, isRunningAction } from "./actionsurface";
import { insertFold, hideBlockHere, hideLineHere, hiddenBreak, makeListHere, addContentsHere, replaceAll, foldToLevel, foldListsToDepth, runStructureAction, entityAct, adoptPageSetupAsDefault } from "./editorcommands";
import { saveFileAs } from "./fileui";
import { showChromeNotice, clearChromeNotice } from "./ribbon";
import { openDoc, refreshBaseline, updateTitleBar, loadBody, wireDocswitch } from "./docswitch";
import { restoreSnapshot, renderHistory, wireSnapshots } from "./snapshots";
import { refreshGit, renderGitPanel, wireGit } from "./gitui";
import { renderCommands } from "./commandsdrawer";
import { openKeys } from "./keysdrawer";
import { noteTyped, noteSnippet, isRecording, wireMacros } from "./macros";
import { resetHydra, wireHydra } from "./hydra";
import { revealCursor, renderPlaces } from "./reveal";
import { docLang, wireInsert } from "./insert";
import { renderPaletteList, wirePalette } from "./palette";
import { syncGlobals, setEditingMode, reconfigureShortcuts, proseHere, whose, phraseCompartment, themeCompartment, proseCompartment, dirCompartment, autoCompartment, pairCompartment, whitespaceCompartment, motionCompartment, editorTheme, proseOrRaw, autoExtension, pairExtension, whitespaceExtension } from "./compartments";
import { focusCompartment, focusExtension } from "./focus";
import { wireCompartments } from "./compartments";
// The source's movement keys (#126) are read at keypress time, so the shell
// asks the module for them rather than holding a copy — the same reason the
// structure keys are a function and not an array.
import * as P from "./sourcemotion";
// ---- configurable keyboard shortcuts ----
// Each action has an id (localized in Settings) and a runner. Keys are CM key
// strings ("Mod-b" etc.; Mod = Ctrl on Win/Linux, Cmd on macOS) and are user-
// overridable, persisted in settings.keybindings.
/**
 * Everything the writer can do, minus the macros.
 *
 * The macros are **not** in here, and that is the fix. They were —
 * `...macros.parseAll(settings.macros).map(…)`, spread into this array at
 * *module load*, under a comment saying `reconfigureShortcuts` runs after a
 * macro is saved. It does, and it rebuilds the keymap from this array, which by
 * then is the one that was frozen before the macro existed.
 *
 * So a macro recorded this session was denied by the palette and by Settings
 * while **Help listed it** — because `help.ts` re-parses `settings.macros` at
 * render time and is the only surface that did. Three views of one list, two of
 * them looking at a snapshot.
 */
/**
 * How deep a list-depth chooser goes.
 *
 * Three, and unlike the heading levels this one is a genuine judgement rather
 * than a leak: a list nested past three is rare and a chooser offering nine
 * depths of it would be nine rows nobody reads. The commands themselves have no
 * such limit — `foldAll` still takes everything.
 */
/**
 * Every action, including the macros saved since the page loaded.
 *
 * A function and not an array: a macro recorded this session has to be
 * bindable, findable in the palette and listed in Settings *now*, and the only
 * way an array can promise that is by being rebuilt — which is what the module
 * comment above `BUILT_IN` says was assumed and was not happening.
 *
 * Macros last, so an ordinary action keeps the position it has always had in
 * the shortcut list.
 */
/**
 * The open document's own styles, as bindable actions.
 *
 * Guarded on the view existing: `actions()` is reachable before the editor is
 * built (the palette and the keymap are both assembled early), and reading the
 * document then is a crash on the first keystroke of the session.
 */
/** Convert a keydown event to a CodeMirror key string ("Mod-Shift-k").
 *
 * **From `e.code`, deliberately, and the cost is on record.** `e.code` is the
 * physical key, so a chord means the same keycap on every layout — a Hebrew
 * writer pressing the key printed `B` gets the binding printed beside the menu
 * item. CodeMirror's own keymaps match `e.key`, which *is* layout-dependent:
 * on the same layout CM reads that press as its Hebrew letter. So the two
 * resolvers in this application disagree about what a press *is* — this one
 * names keycaps, CM names characters — and a binding whose `DEFAULT_KEYS`
 * value is a character with no keycap identity (`"-"`, `"?"`) resolves only
 * on the layout that produced it. The table in `bindings.ts` is written in
 * letters and digits, which is what keeps the two honest; a character-key
 * binding added there will work in the editor and not outside it, and
 * `runShortcutOutsideEditor`'s comment is where the mode rule lives.
 */
function eventToKey(e: KeyboardEvent): string | null {
  const code = e.code;
  if (["ControlLeft", "ControlRight", "MetaLeft", "MetaRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight"].includes(code)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(codeToKey(code));
  return parts.join("-");
}
/** Convert a physical key code to the logical key name CodeMirror expects. */
function codeToKey(code: string): string {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("F") && /^F\d+$/.test(code)) return code;
  if (code.startsWith("Arrow")) return code;
  const special: Record<string, string> = {
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
    Escape: "Escape",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    CapsLock: "CapsLock",
    ContextMenu: "ContextMenu",
  };
  return special[code] ?? code;
}
// What commands this document has is `commands.ts`'s question, and the compiler,
// the completions and the palette all ask it there. `userCommandNames` used to live
// here, read `settings.customCommands` only — disagreeing with `compile.ts` about a
// shared sefer's own commands — and had exactly one caller (B27).
/**
 * Wrap the selection in a directional isolate, or take one off.
 *
 * The escape hatch for when the automatic isolation in `bidi.ts` does not cover
 * a case — an inline raw run, a citation with brackets in it — which is a real
 * category rather than a hypothetical one, and until now had no answer but
 * pasting an invisible character in from somewhere else.
 *
 * With nothing selected there is nothing to isolate, and saying so is better
 * than dropping an empty pair into the document where it will never be found.
 */
function structureKeymap() {
  const kb = keybindings();
  const out: KeyBinding[] = [];
  for (const a of structure.STRUCTURE_ACTIONS) {
    const key = kb[a.id];
    // No `preventDefault`: returning false has to let the key through, which is
    // exactly how Enter stays Enter in ordinary prose.
    //
    // The two column arrows are handed to the action the *document's* direction
    // says they mean. Resolved when the keymap is built and again whenever
    // direction changes, which is what `reconfigureShortcuts` is already for.
    if (!key) continue;
    const want = columnStepFor(a.id);
    const act = want === a.id ? a : structure.actionById(want);
    if (act) out.push({ key, run: () => runStructureAction(act) });
  }
  // #86 — the two tag selections. Not in `STRUCTURE_ACTIONS`: a tag is not the
  // kind of structure the registry's ribbon view is for. They read the same
  // `keybindings()` registry, so a
  // rebind in Settings moves the click's keyboard twin with it.
  //
  // Returning `false` when the caret is not in a tag is the arrangement
  // `structureKeymap` already uses, and the reason `Mod-Shift-]` stays unbound in
  // ordinary prose rather than eating a bracket.
  for (const mode of ["whole", "body"] as const) {
    const key = kb[mode === "whole" ? "selectTagWhole" : "selectTagBody"];
    if (!key) continue;
    out.push({
      key,
      run: (view) => {
        const tag = tagContaining(view.state.doc.toString(), view.state.selection.main.head);
        if (!tag) return false;
        selectTag(view, tag, mode);
        return true;
      },
    });
  }
  return out;
}
/**
 * A fresh editor state for one document.
 *
 * The extensions used to be spelled inline in `new EditorView({…})`, which meant
 * there was exactly one state for the life of the tab and therefore exactly one
 * text, one caret and one undo history — the whole of the "no concept of an open
 * document" finding, expressed as a constructor call. A state per open document
 * is CodeMirror's own answer, and `opendocs.ts` is where they are kept.
 *
 * `prose` is a parameter rather than a read of `settings.prose` because it is a
 * property of the document now: a writer marking up somebody else's source and
 * one composing a sefer want opposite answers and may hold both open at once.
 * The setting remains the default a newly opened document starts from.
 *
 * `at` is where the caret starts, and it is optional because most callers are
 * opening a document rather than opening a second window onto one somebody is
 * already reading. A split is the case that needs it: see `renderLeaf`.
 */
function makeState(body: string, prose: boolean, at?: number): EditorState {
  return EditorState.create({
    doc: body,
    ...(at === undefined ? {} : { selection: { anchor: Math.max(0, Math.min(at, body.length)) } }),
    // The stack itself lives in `editorstate.ts`, which is where a decision
    // about what the editor *is* can be imported and tested. What stays here is
    // the listener below, because it is behaviour: it schedules, marks dirty and
    // renumbers, and every one of those is a `main.ts` function.
    extensions: [...buildExtensions(prose, { structureKeymap, motionKeymap: P.motionKeymap }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged || u.selectionSet) updateContextBar();
      // The caret moved and the text did not — an arrow key, a click, a jump.
      // Bring the preview to it. Not on `docChanged`: typing moves the caret
      // every keystroke, and the compile-and-follow already handles that; doing
      // it here too would fight the writer's own scroll.
      if (u.selectionSet && !u.docChanged) followCaretInPreview();
      // The recorder's other half: what the writer typed. Read off the
      // transaction rather than off keydown, so an IME, a paste and a nikud
      // button all record as the text they produced rather than as the keys
      // that produced them — which is the difference between a macro that
      // replays Hebrew and one that replays a keyboard layout.
      if (u.docChanged && isRecording()) {
        for (const tr of u.transactions) {
          if (!tr.isUserEvent("input")) continue;
          let typed = "";
          tr.changes.iterChanges((_fa, _ta, _fb, _tb, ins) => {
            typed += ins.toString();
          });
          noteTyped(typed);
        }
      }
      if (u.docChanged) {
        // Remember which paragraph moved, so the next spell check re-tokenises
        // only that region rather than the whole sefer.
        markSpellDirty(u.changes);
        // What prints has moved, so the scroll map is stale. Dropped rather
        // than rebuilt: a scroll event will rebuild it if one comes, and most
        // keystrokes are never followed by a scroll.
        invalidateScrollMap();
        // Saving and rendering are scheduled independently. One must never be
        // able to stop the other — that coupling is what silently lost text.
        scheduleSave();
        scheduleCompile();
        updateCounts();
        refreshPanes();
        // Delete and move, which are the two the insertion path cannot see:
        // a writer deletes a siman by selecting it and pressing a key, and
        // drags one by cut and paste, and this application is asked no
        // question at either moment. So the *document* is watched instead of
        // the gesture — which is also the honest shape for a sefer opened
        // from a file, or edited by somebody else, or merged.
        scheduleRenumber();
      }
    }),
    ],
  });
}
/**
 * #89 — open or close the minimap strip.
 *
 * One function owns both directions and the placement memory, because three callers
 * want them (the settings toggle, the key, and Escape) and the placement has to be
 * remembered by whichever of them opened it. "Was it open before the toggle?" is the
 * whole of a toggle's behaviour, and it cannot live in three places.
 */
/**
 * Move the caret past the closing bracket of the pair around it.
 *
 * `all` takes every pair at once instead of the innermost one — the difference
 * between stepping out of `#הערה[…]` and stepping out of the whole
 * `#גוף[… #הערה[…] …]` — and `toNextLine` lands at the start of the following
 * line rather than just past the closer.
 *
 * The *where* is `brackets.ts`'s, asked of the delimiter stack: one paragraph of
 * logic rather than a second walker with its own idea of nesting (#121). What is
 * here is only the caret arithmetic, which needs a document to ask.
 *
 * Next-line is deterministic: the line after the closer if there is one, and the
 * end of this one if there is not. At EOF the caret stays where the closer left
 * it, because a "next line" that does not exist is not a place to put a caret —
 * and the text between the closer and the line break is skipped deliberately:
 * pressing the key says *leave this*, and stopping mid-sentence would be the key
 * doing something it did not say.
 */
// Hebrew-aware word + character count — of the TEXT, not the markup.
//
// This used to count the raw document string, so `#הדגשה[...]`, `//` comments and
// every command name inflated the number the writer watches. Strip the markup
// first with four regexes of its own — and `\([^()]*\)` stops at the first inner
// `)`, so `#צבע(rgb("#b91c1c"))[…]` left a stray paren in the number a writer
// watches. One question, asked of the scanner that already knows the answer:
// `spans.ts` tells a string from a bracket, which is what all six askers lacked.
/**
 * The count, on a short beat rather than on every keystroke.
 *
 * `plainText` runs the whole document through five regular expressions, and
 * this was called synchronously from the update listener: 1.9 ms per keystroke on
 * a 64 KB document, 6.4 ms on a 192 KB one, inside a frame budget of 16 ms that
 * prose mode and CodeMirror are also spending from. Nobody reads a word count at
 * sixty frames a second; a fifth of a second late it is still the same number,
 * and the keystroke it is late for is the one being typed.
 */
/**
 * The three constructs, through one door each.
 *
 * `hiding.ts` decides what the text becomes; this decides nothing at all, which
 * is the point — the padding rules, the toggle-back and the "the mark must
 * start its own line" rule are testable there and were not testable here.
 */
/**
 * Make what is written here a real list.
 *
 * The bullet and number buttons do this too, for the kind they name; this is
 * the one that *reads* — `1.` makes a numbered list, `א.` a Hebrew-lettered
 * one, `-` bullets — and it is the answer to a document whose 156 numbered
 * items are typed numbers in bold. Refuses out loud rather than doing nothing,
 * because "nothing happened" is what the greyed controls were already saying.
 */
/**
 * A table of contents, after the title block, once.
 *
 * The one door, and there used to be two. `heading.contents` was a structural
 * operation on headings — so it refused unless the caret was inside a section,
 * which is nowhere near where a table of contents goes — and the `toc` action
 * spliced `#תוכן()` in wherever the caret happened to be, mid-word included.
 * Now both are this: `headings.addContents` places it and refuses a second one,
 * and the refusal is a sentence rather than a button that does nothing.
 *
 * *Where* it places it is its own decision and was wrong until 17 August: at
 * character zero, which put the contents above the document's own title. See
 * `headings.afterTitleBlock`.
 */
/**
 * Take a running head out of the settings drawer and put it in the document.
 *
 * The one-way door the finding asks for, and it is one-way on purpose: the
 * command can express things the field cannot — bold, a mixed run, a different
 * line per chapter — so there is no honest way to read one back into a text box
 * afterwards. It carries the text across, clears the field so the two cannot
 * disagree, and puts the caret in the new call.
 *
 * The insertion goes at the **top** of the document rather than at the caret: a
 * running head set halfway down governs from there on, which is a real and
 * useful thing to do deliberately and never what somebody means by pressing a
 * button in Settings.
 */
function moveRunningIntoDoc(which: "header" | "footer") {
  if (!runtime.view) return;
  const he = which === "header" ? "כותרת_עליונה" : "כותרת_תחתונה";
  const en = which === "header" ? "running_head" : "running_foot";
  const name = docLang() === "en" ? en : he;
  const text = String(docConfig()[which] ?? "");
  const call = `#${name}[${text}]`;
  const doc = docTextNow();
  editDoc(`${call}\n\n${doc.replace(/^\s*/, "")}`, call.length - 1);
  // Cleared, so the document and the panel cannot give two answers about one
  // running head. The command wins in the prelude either way; leaving the field
  // filled would make that precedence something a writer has to discover.
  setSetting(which, "");
  // Redrawn, or the box goes on showing the text it no longer holds. The drawer
  // is built once and toggled — it is not a `lazyMenu` — so clearing the model
  // leaves the input exactly as the writer typed it, and the next time they open
  // Settings the field and the document each claim the running head. Found by
  // pressing the button and opening the drawer again.
  rerenderChrome();
  closePanel("settings-drawer");
  runtime.view.focus();
}
/** A fold: collapsible while writing, and every word of it prints. */
/** Hide a passage from the page with `/* … *\/`, or reveal the one we are in. */
/** Hide these lines from the page with `//`, or bring them back. */
/**
 * Collapse the outline to a depth: chapters only, or chapters and simanim.
 *
 * The ranges come from the fold service rather than from a second reckoning of
 * where a section ends, so this collapses exactly what a click on the gutter
 * arrow would — one authority for "what does this heading fold", asked twice.
 */
/**
 * Fold every list item nested at least `depth` deep.
 *
 * The same shape as `foldToLevel` and deliberately so: ask the fold service for
 * the range, so this collapses exactly what a click on the gutter arrow would.
 * A second reckoning of where a list item ends is the thing that eventually
 * disagrees with the arrow beside it.
 */
/**
 * A line break in the source that prints nothing.
 *
 * Typst turns a newline into a **space** and a blank line into a **paragraph
 * break**, so the writer who breaks a long line for the sake of reading the
 * source pays for it on the page. The escape exists — whitespace *inside* a
 * block comment is consumed, so a comment opened at the end of one line and
 * closed at the start of the next glues the two together with nothing between
 * them — but it is Typst's, not Ksav's, and it appears in no menu, no palette
 * and no document. A feature nobody can find is not a feature.
 *
 * A `//` comment will not do this: it ends *at* the newline, so the newline is
 * still outside it and still prints a space. Only the block form spans the break.
 *
 * The other whitespace needs no escape at all — runs of spaces, tabs and leading
 * indentation already collapse to one space before they reach the page. The line
 * break is the only one that misbehaves, which is why this is one action and not
 * a family of them.
 *
 * With a selection this *is* [`hideBlockHere`] — "make this not print" is one
 * idea, and two implementations of it would eventually disagree about the padding.
 */
function applySkin(name: string) {
  applyPreset(name, setPageSetup);
  closeMenus();
  scheduleCompile();
  // rerenderChrome rebuilds the whole chrome, which drops the panel's contents
  // and its open state — so restore both, or applying a preset from inside the
  // panel closes the panel and hides the undo it just made available.
  const wasOpen = isPanelOpen("styles-panel");
  rerenderChrome();
  if (wasOpen) openPanel("styles-panel");
  setStatus(tf("presetApplied", t("skin." + name)), "ok");
}
function undoSkin() {
  if (!undoPreset(setPageSetup)) return;
  scheduleCompile();
  const wasOpen = isPanelOpen("styles-panel");
  rerenderChrome();
  if (wasOpen) openPanel("styles-panel");
}
function toggleNikud() {
  settings.nikud = !settings.nikud;
  saveSettings();
  togglePanel("nikud-bar", settings.nikud);
  reconfigureShortcuts();
  rerenderChrome();
}
/**
 * What each chip does when it is pressed.
 *
 * The other half of `header.chips`, which says what each one *is*. Separate
 * because one half is a decision about state — glyph, name, on, unavailable —
 * and this half is an effect, and the decision is the part that was
 * untestable. A chip named here with no description there (or the reverse) is a
 * `tsc` error, because both are keyed by the same union.
 */
/**
 * Open whichever search the writer asked for.
 *
 * One action and two surfaces, rather than two actions: *"find"* is one thing a
 * writer wants, and a second binding for "find, but in the preview" would be a
 * chord to remember for a question they have already answered in the settings.
 */
/** Swap the whole document and put the caret somewhere sensible. */
/** What the keys drawer's search box holds. Lives here because the view is a
 *  pure function of it and the drawer is rebuilt on every keystroke. */
let keysQuery = "";
/**
 * Every rebindable action, drawn into the keys drawer.
 *
 * The rows come from `actions()` — the same function the keymap is built from
 * and the palette is filled from — so a macro recorded a minute ago is in this
 * list without any further wiring, and an action that cannot be bound cannot
 * appear here.
 *
 * `macroName` covers all three kinds of name: a structural operation names
 * itself from `STRUCTURE_ACTIONS`, a macro from its own title, and everything
 * else from its `sc.` string. Without it a bound macro appeared as the raw text
 * `sc.macro.m1a2b3` — a row nobody could identify, which is the same "shipped
 * unnamed" failure `bindings.test.mjs` exists to catch. Resolved here rather
 * than in the view, because all three registries are the shell's.
 */
function renderKeysPanel(): void {
  const box = document.getElementById("keys-body");
  if (!box) return;
  const kb = keybindings();
  const mode = keymodes.activeMode();
  box.replaceChildren(
    ...panelviews.keysPanel(
      {
        rows: actions().map((a) => ({
          id: a.id,
          name: actionName(a.id, savedNameMap()),
          key: kb[a.id] ?? "",
          // What this action answers to under a mode. Carried on the row rather
          // than resolved in the view, so the view spells a key exactly one way:
          // `bindings.keyHint`, the same call every menu makes.
          command: keymodes.commandName(a.id),
        })),
        query: keysQuery,
        mode: mode === "default" ? null : { kind: mode },
      },
      {
        search: (q) => {
          keysQuery = q;
          renderKeysPanel();
          // The box is rebuilt with the rows, so the caret has to be put back —
          // and at the end, or typing a second character moves it to the front.
          const input = document.getElementById("keys-search") as HTMLInputElement | null;
          input?.focus();
          input?.setSelectionRange(q.length, q.length);
        },
        capture: (id, button) => captureShortcut(id, button as HTMLButtonElement),
        clear: (id) => {
          // The empty string, not a delete: `keybindingsFrom` reads an empty
          // value as *this action is deliberately unbound* and a missing key as
          // *use the default*, and deleting it would put the shipped chord back
          // rather than take it off.
          settings.keybindings = { ...(settings.keybindings || {}), [id]: "" };
          saveSettings();
          reconfigureShortcuts();
          renderKeysPanel();
        },
        reset: () => {
          resetShortcuts();
          renderKeysPanel();
        },
      },
    ),
  );
}
function columnStepFor(id: string): string {
  const rtl = docConfig().dir !== "ltr";
  if (id === "table.cellStartward") return rtl ? "table.cellStartward" : "table.cellEndward";
  if (id === "table.cellEndward") return rtl ? "table.cellEndward" : "table.cellStartward";
  return id;
}
/** Any action by id — built-in, structural, or a saved macro. */
/**
 * Run an action by id. **The only way an action should be invoked.**
 *
 * This did not exist, and its absence was the macro recorder's whole bug.
 * `noteAction` had exactly one caller — inside `runStructureAction` — so the
 * recorder saw the forty-three structural operations and nothing else. Press
 * F3, Ctrl+B, F4 and the answer was *"Nothing was recorded."* Bold, italic,
 * footnote, endnote, the headings, bullets, tables, alignment, the three review
 * marks and all three defer operations are first-class `ACTIONS` entries with
 * shipped key bindings, and every one of them was invisible — because the keymap
 * called `a.run` directly and there was no one place in between.
 *
 * It also gives the palette something to run: a surface labelled **Commands**
 * that could not reach "insert row below", "save" or "record macro" was a symbol
 * picker with the wrong sign on it.
 */
/**
 * Depth of `runAction`, so `insertSnippet` can tell a command arriving from the
 * toolbar apart from one an action is inserting on its own account.
 *
 * The toolbar, the Insert menu and the palette all call `insertSnippet`
 * directly with a registry command — there is no action id to record — so the
 * snippet itself is the step. An action that inserts a snippet must not be
 * recorded twice, and replaying the action is the better of the two: it is the
 * one that survives the registry snippet changing under it.
 */
/**
 * Run one structural operation, wherever the caret is.
 *
 * `sticky` is the ribbon's and the menus' reading of the caret: one character
 * further in, so an operation offered while the caret rests just past a list's
 * closing `)` actually acts (see `structureNear`). It is deliberately **off**
 * for the keyboard. Bare Enter and Tab are bound to `list.splitItem` and
 * `list.indent`, and a sticky Enter would split a list item while the writer
 * was typing the paragraph after the list — the ribbon lingering is a
 * convenience, a key that acts on something the caret has left is a bug.
 */
/**
 * Select, unwrap or remove the construct the caret is in.
 *
 * One door for the three, because they are one act at three depths and because
 * the refusals are shared: there may be no construct here at all, and the
 * construct there is may be one whose words do not all live in its body.
 *
 * A refusal says which of those it was. *"Deleting a construct is confusing and
 * easy to get wrong"* is a report about silence as much as about typing — a key
 * that does nothing and says nothing is why a writer goes back to deleting
 * brackets by hand.
 */
// ---------------------------------------------------------------- setting mutations
/**
 * What a setting reads as **now** (B26).
 *
 * Page setup comes from the open document; everything else from the application.
 * One reader, because a panel that writes to the document and reads from the app
 * is a panel whose numbers jump back the moment you reopen it.
 */
/**
 * Change a setting — of the document, or of the application (B26).
 *
 * > *"opening an English document and then a Hebrew one means changing direction
 * > by hand."*
 *
 * Page setup is a property of the document now, so the fourteen fields in
 * `PAGE_FIELDS` are written **to the open document** and travel with it. The rest —
 * theme, layout, zoom, spell-check — are about the person and stay where they were.
 *
 * The side effects below are unchanged and run either way: flipping the direction
 * has to re-point the editor and the preview whether the flip was saved in a
 * document or in a preference file.
 */
/**
 * Write page setup onto the open document (B26).
 *
 * Merged into whatever it already said rather than replacing it, so setting the
 * margin does not silently reset the paper. Saved through `docs.update`, which is
 * where every other change to a document goes.
 */
/**
 * Make the open document's layout what a **new** document starts with (B26).
 *
 * The affordance page setup being per-document takes away and has to give back:
 * a writer who has got their sefer looking right wants the next one to start
 * there, and without this they would have to set fourteen fields again. Word
 * calls it *set as default*; so does this.
 */
// ---------------------------------------------------------------- layout / theme / chrome
/**
 * The source's zoom, as a number the stylesheet multiplies by.
 *
 * One custom property rather than a rule per view: the editor theme's `15px` and
 * page view's `17px` are two different base sizes for two different ways of
 * reading the same text, and both are correct. Multiplying is the only shape
 * that leaves that difference intact — a zoom that set a font size outright
 * would have flattened page view back to a code pane.
 */
/**
 * Zoom the surface the writer is in. `by` is +1, -1, or 0 for "back to 100%".
 *
 * The caret test is `runtime.view.hasFocus`, which is the honest reading of
 * *"which of these two am I working in"*: a writer who has clicked into the page
 * to read it is not typing, and the thing under their eyes is the preview.
 */
/**
 * Start, restart or stop the automatic snapshot timer.
 *
 * Called at boot and again whenever either of the two settings changes, which is
 * the part a `setInterval` at the bottom of `boot` could not do: the cadence was
 * fixed at load and the only way to change it was to reload the application.
 */
// Preview placement is not a setting any more, and the two cycling chips it fed
// are gone with it. Which side the preview sits on is *which child of a split it
// is*, which the tree says directly and a splitter drag changes; how much of the
// split it takes is that split's own fraction. Both used to be application-wide
// values, which is the shape a window with exactly one divider has.
//
// The page view survived, because it is a different question wearing the same
// word: how one pane is *drawn*, not how the window is divided. It is
// `settings.pageView` and `applyPageView` now, and it sits in the arrangement
// picker beside the arrangements because from a writer's side it is the same
// kind of choice.
//
// The layout chip also switched **prose mode on** as a side effect of reaching
// page view. The margin comment was *"this seems to turn on prose mode — a side
// effect, which it should advertise, and probably not do"*, right on both
// counts, and it is gone rather than announced: whether the source is prose or
// raw is a separate question with a separate control, and the writer had already
// answered it.
// The splitter is per split now, and built by `splitterFor` beside the tree it
// resizes. The old one was a single element with an id, which is the shape a
// window with exactly one divider has — and the reason `settings.previewFrac`
// was a global: there was only ever one fraction to store. A tree keeps its
// fractions on its splits, where a second divider has somewhere to put its own.
/**
 * Tell the change gutter what its three marks mean.
 *
 * From `help.MARKS`, which is the legend the help panel prints, so the wedge in
 * the margin and the line in the help say the same sentence — a legend and a
 * tooltip that are two hand-written lists are two lists that disagree.
 */
// ---------------------------------------------------------------- boot
// global keys: Ctrl/Cmd+K palette; Alt reveals raw markup in prose mode
/**
 * What a settings change moves, once the value itself is written.
 *
 * Registered with `settings.ts` at boot. This half stayed in `main.ts` when the
 * value writer moved there (wave 3 of #188) because every arm below reaches for a
 * subsystem — `settings.ts` is imported by nearly all of them and importing them
 * back closed 28 cycles.
 */
function applySettingChange(key: import("./settings").Field, value: unknown): void {
  if (key === "lang") {
    setLang(value as Lang);
    swapUntouchedStarter();
    // Replacing the header and flipping the root direction reflows everything
    // below, and CodeMirror keeps its pixel offset against a layout that just
    // moved — so the source visibly jumps. Capture each scroller's position and
    // put it back after the chrome is rebuilt.
    const wasAt = new Map<EditorView, number>();
    for (const v of sourceViews()) wasAt.set(v, v.scrollDOM.scrollTop);
    // Every source pane, and the search panel with them: `rerenderChrome`
    // rebuilds our own DOM and cannot reach a panel CodeMirror owns.
    for (const v of sourceViews()) {
      v.dispatch({ effects: phraseCompartment.reconfigure(EditorState.phrases.of(searchPhrases())) });
    }
    rerenderChrome();
    for (const [v, at] of wasAt) v.scrollDOM.scrollTop = at;
  } else if (key === "shell") {
    // A different shell over the same document (#233, §7): the header is
    // rebuilt from the placements and the editor is not touched — so the caret
    // stays where it was, and each pane's scroll is put back after the header
    // above it changed height.
    const wasAt = new Map<EditorView, number>();
    for (const v of sourceViews()) wasAt.set(v, v.scrollDOM.scrollTop);
    rerenderChrome();
    for (const [v, at] of wasAt) v.scrollDOM.scrollTop = at;
  } else if (key === "theme") {
    applyTheme();
    toEveryPane(themeCompartment.reconfigure(editorTheme(settings.theme === "dark")));
    // …and the chip that reports the theme, which is the one thing this branch
    // did not do. Found by pressing it: the page went dark, the editor went
    // dark, and the chip went on saying 🌙 — "switch to dark" — for as long as
    // the session lasted, because nothing rebuilt the header. Its four siblings
    // (`lang`, `prose`, `layout`, `editingMode`) all rerender; this one was the
    // odd one out, and it is the toggle a writer presses first.
    rerenderChrome();
  } else if (key === "sourceMotions") {
    // The keys, not the text: a writer who flips this mid-document keeps the
    // caret where it is, and every pane hears the change — the rule the
    // shortcut rebinding is written to, applied to the arrows.
    toEveryPane(motionCompartment.reconfigure(P.motionExtension()));
  } else if (key === "prose") {
    toEveryPane(proseCompartment.reconfigure(proseOrRaw()));
    rerenderChrome();
  } else if (key === "dir") {
    toEveryPane(dirCompartment.reconfigure(EditorView.contentAttributes.of({ dir: docConfig().dir })));
    // The preview pane reads in the document's direction, so flipping the
    // document has to re-point the pane in the same act.
    applyPreview();
    scheduleCompile();
  } else if (key === "editingMode") {
    // **After**, not beside. The mode is fetched over the network, so a
    // `rerenderChrome()` on the next line runs while `activeMode()` is still
    // "default" and the chrome is rebuilt describing the mode that is on its way
    // out — the shortcut list goes on printing keys the mode is about to take.
    // Caught by driving it: the settings list never showed a single `M-x` row.
    void action("save_file", () => setEditingMode(value)).then(rerenderChrome);
  } else if (key === "focusMode" || key === "typewriter" || key === "typewriterAnchor") {
    toEveryPane(
      focusCompartment.reconfigure(
        focusExtension(
          !!settings.focusMode,
          !!settings.typewriter,
          settings.typewriterAnchor ?? "center",
        ),
      ),
    );
  } else if (key === "zoom" || key === "fitWidth") {
    applyPreview();
  } else if (key === "sourceZoom") {
    applySourceZoom();
  } else if (key === "autoSnapshot" || key === "autoSnapshotMinutes") {
    // The timer is rebuilt rather than left to the next reload, which is the
    // whole difference between a setting and a constant.
    scheduleAutoSnapshots();
    // …and so is the sentence under the switch. `snapshotNote` says which of the
    // two states the history is in and how to keep a version by hand; without
    // this, turning the clock off left it reading *"a version is kept by itself
    // whenever the text has changed"* — the switch moved and the line under it
    // went on describing the state before. Found by pressing it.
    if (isPanelOpen("settings-drawer")) rerenderChrome();
  } else if (key === "autocomplete") {
    toEveryPane(autoCompartment.reconfigure(autoExtension()));
  } else if (key === "spellcheck") {
    // Turning it off must take the existing squiggles with it, not just stop
    // adding new ones.
    if (settings.spellcheck) scheduleSpellCheck();
    else clearSpellCheck();
  } else if (key === "spellModernHebrew" || key === "spellTalmudicHebrew") {
    // A different dictionary, so every word on screen has a different answer —
    // full, not incremental, and the squiggles the old answer put there are
    // cleared rather than left until the next keystroke.
    clearSpellCheck();
    forceFullSpellCheck();
  } else if (key === "spellcheckComments") {
    // A wider or narrower checkable text, so the answer on screen is stale
    // either way — and turning it *off* has to clear the squiggles it put in
    // comments rather than leave them there until the next keystroke.
    clearSpellCheck();
    forceFullSpellCheck();
  } else if (key === "autoPairBrackets" || key === "autoPairQuotes") {
    toEveryPane(pairCompartment.reconfigure(pairExtension()));
  } else if (key === "minimap") {
    // The strip is a **surface**, so the setting is a request to open or close it
    // rather than something reconfigured in place. Two directions because a setting
    // can be loaded as `true` at startup and must come up with the strip, not with a
    // canvas nobody asked for.
    if (settings.minimap && !minimapIsOpen()) toggleMinimap();
    else if (!settings.minimap && minimapIsOpen()) toggleMinimap();
  } else if (key === "showWhitespace") {
    // `[]` rather than the plugin emptied: reconfigure **is** the toggle, so there
    // is no state to clear and nothing to leave behind.
    toEveryPane(whitespaceCompartment.reconfigure(whitespaceExtension()));
  } else {
    scheduleCompile();
  }
}
/**
 * Is this keystroke somebody typing into a field?
 *
 * `.cm-content` is `contenteditable`, so the editor is covered by the same
 * test: when the caret is in a document, CodeMirror's own keymaps have already
 * had the event and the fallback below must keep its hands off it.
 */
function typingIntoSomething(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.("input, textarea, select, [contenteditable='true']");
}
/**
 * Run a shortcut that arrived while the editor did not have focus.
 *
 * # The finding
 *
 * Every shortcut in this application lived in a CodeMirror keymap, which means
 * every shortcut required the caret to be in a document. Click a chip, a panel,
 * the outline, a tab — anything at all — and `Mod-k` stopped opening the
 * command palette, `Mod-f` stopped finding, help stopped opening. Nothing said
 * so; the key simply did nothing, which reads as the shortcut not existing.
 *
 * That is most of what the inventory means by *113 commands are advertised
 * across four surfaces and the reader could not reach them: zero of four*. The
 * palette is the route to the registry, and the route was conditional on
 * standing somewhere the reader had just left in order to look at a panel.
 *
 * # Modifier keys only
 *
 * A binding with no modifier — Enter, Tab, an arrow — belongs to whatever has
 * focus. Swallowing Enter here would break every button in the chrome, which is
 * a far worse bug than the one being fixed. So this handles the combinations
 * that are unambiguously application shortcuts and leaves the rest alone.
 *
 * The action runs against `runtime.view`, the primary editor, which is what the
 * writer means: they are looking at a document and pressing a key about it.
 */
function runShortcutOutsideEditor(e: KeyboardEvent): boolean {
  if (!runtime.view) return false;
  // The mode's takeover is not editor-scoped. Inside the editor the takeover
  // works by standing `buildShortcutKeymap` down (main, `buildShortcutKeymap`:
  // "a mode that is really here takes the whole keyboard"); if this window
  // listener kept resolving chords while vim held the keyboard, `dd` outside
  // the editor would still open a document — the rule would hold only where
  // nobody was typing. A mode here means this resolver stands down too.
  if (keymodes.activeMode() !== "default") return false;
  if (typingIntoSomething(e.target)) return false;
  // A handler that already answered owns the keystroke: this sweep runs on the
  // window *bubble* phase, so anything that preventDefault'ed below us has said
  // so. Without this, two resolvers (the editor's and this one) can answer the
  // same chord once each.
  if (e.defaultPrevented) return false;
  if (!e.ctrlKey && !e.metaKey && !e.altKey) return false;
  const key = eventToKey(e);
  if (!key) return false;
  const kb = keybindings();
  const aliases = aliasesInForce(kb);
  let id = Object.keys(kb).find((k) => kb[k] === key);
  if (!id) id = Object.keys(aliases).find((k) => aliases[k].includes(key));
  if (!id || !actionById(id)) return false;
  e.preventDefault();
  runAction(id, runtime.view);
  return true;
}
function wireKeys() {
  window.addEventListener("keydown", (e) => {
    // The two Girsa errands used to be answered here, by comparing `e.key` to a
    // letter. They are `citePhrase` and `linkifyCitations` in `DEFAULT_KEYS`
    // now, which is the only place a combination is allowed to be decided —
    // `prohibitions.test.mjs` holds that. What that arrangement cost: neither
    // was rebindable, neither reached the card, the key list or `F1`, both
    // fired straight through a keyboard mode that had taken the keyboard, and
    // `Ctrl+Shift+L` ran `left` *as well*, because that is what it is bound to.
    if (e.key === "Escape") {
      // Every surface that says Escape closes it, and nothing else. This used to
      // be twelve close calls written out by hand, which meant the answer to
      // "does Escape reach this panel?" was "did somebody remember" — and for
      // the hydra, the one surface here that takes over the keyboard, the answer
      // was no. `closeOnEscape` reads `PANELS`, so a new modal is covered by
      // being declared.
      handleEscape(closeOnEscape, () => runtime.view?.focus());
    } else if (e.key === "Alt" && proseHere()) {
      runtime.view.dispatch({ effects: setRevealAll.of(true) });
    } else {
      // Last, so nothing above it changes, and only when the editor did not get
      // the event itself. See `runShortcutOutsideEditor`.
      runShortcutOutsideEditor(e);
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt" && proseHere()) runtime.view.dispatch({ effects: setRevealAll.of(false) });
  });
  window.addEventListener("click", (e) => {
    closeMenus();
    closeOnOutsideClick(e.target as Element | null);
  });
}
/**
 * Hand the shell's own operations to the modules that need them.
 *
 * `runtime.ts` and `save.ts` are imported *by* the panels, so they cannot import
 * the shell back without a cycle. Installing the three things they need as hooks
 * says the dependency is deliberate and one-directional, where a circular import
 * would only hide it. Registered before anything is drawn, so no code path can
 * fire one of them while it is still the default no-op.
 */
/**
 * What each surface does beyond appearing and disappearing.
 *
 * This is the half of the panel registry that makes it safe to derive the Escape
 * sweep. `PANELS` says a surface exists and how a person gets out of it; this
 * says what opening it has to fill in and what closing it has to put back — the
 * pending callback the form modal is holding, the operation set the hydra is
 * driving, the preference the outline pane's visibility *is*. A sweep that only
 * stripped a class would leave the application holding all three, so it would
 * have been a weaker Escape than the twelve hand-written calls it replaced.
 *
 * Focus is the exception and is handled at the keydown site: Escape means "put
 * me back in the text" whether or not anything was open, and a close hook by
 * definition only runs when something was.
 */
function wirePanels() {
  // Drawers whose open state *is* a saved preference. The × closes them through
  // `closePanel` like every other ×, so persisting has to happen here — a close
  // control that hid the pane and left the setting saying "shown" would put it
  // back on the next launch, which is the same class of lie as a menu item that
  // does nothing.
  wirePanel("outline-drawer", {
    rebuild: renderOutline,
    open: () => {
      settings.outline = true;
      saveSettings();
      renderOutline();
      rerenderChrome();
    },
    close: () => {
      settings.outline = false;
      saveSettings();
      rerenderChrome();
      runtime.view?.focus();
    },
  });
  wirePanel("notes-drawer", {
    rebuild: renderNotesPane,
    open: () => {
      settings.notesPane = true;
      saveSettings();
      renderNotesPane();
      rerenderChrome();
    },
    close: () => {
      settings.notesPane = false;
      saveSettings();
      rerenderChrome();
      runtime.view?.focus();
    },
  });
  wirePanel("marks-drawer", {
    rebuild: renderMarksPane,
    open: () => {
      settings.marksPane = true;
      saveSettings();
      renderMarksPane();
      rerenderChrome();
    },
    close: () => {
      settings.marksPane = false;
      saveSettings();
      rerenderChrome();
      runtime.view?.focus();
    },
  });
  wirePanel("find-drawer", {
    rebuild: renderFindPane,
    open: () => {
      const scope = document.getElementById("find-scope") as HTMLSelectElement | null;
      if (scope) scope.value = settings.searchScope ?? "source";
      // The scope decides whether the engine is asked for the printed text at
      // all, and it is asked *while the drawer is open* — so opening one that
      // reads the page has to trigger the compile that fills it in.
      if ((settings.searchScope ?? "source") !== "source") compileNow();
      renderFindPane();
      (document.getElementById("find-query") as HTMLInputElement | null)?.focus();
    },
    close: () => runtime.view?.focus(),
  });
  wirePanel("settings-drawer", { close: () => runtime.view?.focus() });
  wirePanel("commands-drawer", {
    open: () => {
      renderCommands("");
      (document.getElementById("commands-search") as HTMLInputElement | null)?.focus();
    },
    close: () => runtime.view?.focus(),
  });
  wirePanel("help-panel", {
    open: () => {
      renderHelp("");
      (document.getElementById("help-search") as HTMLInputElement | null)?.focus();
    },
    close: () => runtime.view?.focus(),
  });
  wirePanel("styles-panel", { open: renderStylesPanel, rebuild: renderStylesPanel });
  wirePanel("review-panel", { open: renderReviewPanel, rebuild: renderReviewPanel });
  // Opening it is what asks git. Nothing polls: `git status` is a subprocess,
  // and a drawer nobody has opened must not be starting one every second.
  wirePanel("git-panel", { open: () => voidAction("general", () => refreshGit()), rebuild: () => renderGitPanel() });
  wirePanel("keys-drawer", {
    open: () => {
      // A fresh search every time. A drawer that reopens holding the last query
      // is a drawer that looks empty for a reason nobody can see.
      keysQuery = "";
      renderKeysPanel();
      (document.getElementById("keys-search") as HTMLInputElement | null)?.focus();
    },
    close: () => runtime.view?.focus(),
  });
  wirePanel("palette", {
    open: () => {
      const input = document.getElementById("palette-input") as HTMLInputElement;
      input.value = "";
      renderPaletteList("");
      // Which is why the class goes on before this runs: `focus()` on a
      // `display: none` input does nothing, and a command palette that opens
      // with the caret still in the document is a command palette nobody uses.
      input.focus();
    },
    close: () => runtime.view.focus(),
  });
  wirePanel("notes-chooser", {
    rebuild: renderNotesChooser,
    open: renderNotesChooser,
    close: () => runtime.view.focus(),
  });
  wirePanel("history-modal", { open: () => voidAction("general", () => renderHistory()), rebuild: () => voidAction("general", () => renderHistory()) });
  wirePanel("places-chooser", {
    // `renderPlaces` is **synchronous** — it draws an answer that already arrived,
    // so wrapping it in `voidAction` (which takes a promise) would be wrapping a
    // value in the wrong shape rather than adding anything.
    open: renderPlaces,
    rebuild: renderPlaces,
    close: () => runtime.view.focus(),
  });
  wirePanel("preview-modal", {
    open: () => {
      // Drawn from the pages themselves, not copied out of the other pane. It
      // used to be `body.innerHTML = preview.innerHTML`, which serialises ten
      // megabytes of SVG the browser has already parsed and then parses all of
      // it again — and it would now copy the *windowing* too, so every page the
      // reader had not scrolled past would arrive in the full-screen view as an
      // empty box.
      drawCurrentInto(document.getElementById("preview-modal-body")!);
      // The modal is a second pane over the same pages, so it needs the same
      // direction and the same page width. One call, both panes.
      applyPreview();
    },
  });
  // The pending callback is the reason this hook exists: a form modal dismissed
  // by Escape must not leave an "insert" waiting to fire at whatever opens next.
  wirePanel("form-modal", { close: settlePendingModals });
  // Likewise the operation set. The hydra reads the caret's structure once and
  // drives keys against it; outliving that structure is how it came to eat
  // keystrokes aimed at ordinary prose.
  wirePanel("hydra", {
    // The reset is hydra's own state and machine; the hook is the one path
    // every way of closing runs through, so it calls out rather than deletes.
    close: () => resetHydra(),
  });
  wirePanel("welcome", { close: () => localStorage.setItem("ksav.onboarded", "1") });
}
function installHooks() {
  wirePanels();
  runtime.onRerenderChrome(rerenderChrome);
  runtime.onOpenDoc(openDoc);
  // The pane system's wiring: the callbacks that stay in main.ts, registered
  // once, so the pane modules read nothing more of this file than this list.
  wirePanes({
    rebuildPanes: () => renderPanes(),
    refreshHeads: () => refreshPaneHeads(),
    makePaneState: (body, prose, at) => makeState(body, prose, at),
    proseHere: () => proseHere(),
    applyEditingModes: () => voidAction("save_file", () => setEditingMode(settings.editingMode)),
    fillSidePanes: () => {
      renderOutline();
      renderNotesPane();
    },
    refreshSidePanes: () => {
      // **The scan is asked for, not taken.** `scanForBackend` is the shared memo,
      // and in the browser build it is a worker round trip: the whole-document walk
      // happens somewhere else and this thread only builds the rows over the answer
      // (#219). Two panes used to walk the document themselves here — 634 KB cost
      // ~55 ms of main thread every 200 ms of typing, five frames for one redraw.
      //
      // An answer that arrives after another keystroke is dropped: the rows for a
      // text that is no longer on screen are the stale surface this app is
      // repeatedly reported for, and the next debounce is already scheduled.
      const text = docTextNow();
      return scanForBackend(runtime.backend, text).then((scanned) => {
        if (text !== docTextNow()) return;
        if (isReviewOpen()) renderReviewPanel(scanned);
        if (settings.outline) renderOutline(scanned);
        if (settings.notesPane) renderNotesPane(scanned);
        if (settings.marksPane) renderMarksPane(scanned);
        // The find drawer is a view of the document too — of two of them. The
        // source half moves on every keystroke and the printed half moves when
        // the compile lands, and a list of hits into a document that has since
        // been edited is the stale surface this application is repeatedly
        // reported for.
        if (isPanelOpen("find-drawer")) renderFindPane();
      });
    },
    openDocHanded: (id) => openDoc(id, { handedOver: true }),
    askText: (message, initial) => askText(message, initial),
  });
  // The chrome wiring: the verbs the ribbon and the context strip name that
  // their own waves have not moved yet, registered once, read through
  // `chromeWiring()` — the same shape `wirePanes` gives the pane modules.
  // Thirteen members, the ones that are genuinely main-held: the editor verbs
  // wave 12 has not claimed (entityAct, the folds, the hidden break,
  // runStructureAction, makeListHere, addContentsHere), the compartment
  // machinery (reconfigureShortcuts), and the three refreshers whose subjects
  // import this file's docTextNow and cannot take a reverse edge
  // (refreshContextBar via contextbar, refreshStylesPanel via stylespanel,
  // saveFileAs via fileui's ribbon import). The other twenty-five were direct
  // imports in their own modules all along — see ribbon.ts.
  wireSettingsWrite({
    applyChange: applySettingChange,
    setPageSetup: (change) => {
      const doc = runtime.currentDoc;
      if (!doc) return;
      const config = { ...(doc.config ?? {}), ...change };
      runtime.setCurrentDoc({ ...doc, config });
      void docs.rememberConfig(doc.id, config).catch(reportSaveFailure);
    },
    rememberConfig: (id, config) => void docs.rememberConfig(id, config as never).catch(reportSaveFailure),
  });
  wireHeader({
    setSetting,
    toggleNikud,
  });
  wireChrome({
    entityAct,
    insertFold,
    hideBlockHere,
    hideLineHere,
    foldToLevel,
    foldListsToDepth,
    hiddenBreak,
    runStructureAction,
    makeListHere,
    applyCustomStyle,
    unwrapCustomStyle,
    openNewStyle,
    openStyleEditor,
    openStylesFor,
    addContentsHere,
    saveFileAs,
    refreshContextBar: updateContextBar,
    reconfigureShortcuts,
    refreshStylesPanel: () => {
      if (isPanelOpen("styles-panel")) renderStylesPanel();
    },
  });
  // The palette's wiring: what the rows beyond the content registry can be.
  wirePalette({
    macroName: (id) => actionName(id, savedNameMap()),
    shellActions: actions,
      render: (list) => drawList(document.getElementById("palette-list")!, list, LOOKS.palette),
  });
  // The insertion path's wiring: the macro recorder and the chooser's apply
  // stay main-held until the macros' and the chooser's own waves.
  wireInsert({
    noteSnippet: (raw) => {
      if (!isRunningAction()) noteSnippet(raw);
    },
    applyNotePick,
  });
  // The macros' modal, rebind and action door; the recorder is macros.ts's.
  wireMacros({
    actionById: (id) => actionById(id) as { id: string; run: (v: unknown) => boolean } | undefined,
    askText,
    reconfigureShortcuts,
  });
  // The hydra: a structural operation performed where the caret is.
  wireHydra({ runStructure: (action, sticky) => runStructureAction(action, sticky) });
  // The git drawer's modal and the body swap of a commit restore.
  wireGit({ loadBody });
  wireStyles({
    destinationRows: () => destinationRows(),
    applySkin: (name) => applySkin(name),
    undoSkin: () => undoSkin(),
    reconfigureShortcuts,
    openStyleEditor: (name) => openStyleEditor(name),
  });
  // The destinations' editor write-back.
  wireDestinations({ replaceAll: (text, caret) => replaceAll(text, caret) });
  // The starter follows a language switch with a body swap and a setting write.
  wireStarter({ setSetting });
  // A template's direction arrives through the shell's setting write.
  wireTemplates({ setSetting });
  // The switch machine borrows the state factory and the compartment sweep.
  wireDocswitch({ makeState, syncGlobals });
  // The machinery's one borrow of the shell's own dispatcher — main's action
  // table and runAction — through the same one-directional wiring docswitch
  // uses. `structureKeymap` stays main's (it calls `runStructureAction`), and
  // is handed over at boot.
  wireCompartments({
    runAction,
    actionsForKeys: () => actions(),
    structureKeymap,
    motionExtension: P.motionExtension,
  });
  // The rows' wiring: the dispatch verbs the list-shaped surfaces share.
  wireRows({
    runAction: (id) => {
      runAction(id);
    },
    restore: (snapshot) => {
      voidAction("save_file", () => restoreSnapshot(snapshot));
    },
    swapDoc: replaceAll,
    revealCaret: () => {
      voidAction("general", () => revealCursor({ quiet: true, anchor: 0 }));
    },
  });
  // The settings drawer's wiring: what a row can ask the shell for.
  wireSettings({
    runList: actions,
    openKeys,
    eventToKey,
    whose,
    reconfigure: reconfigureShortcuts,
    swapRunningHead: moveRunningIntoDoc,
    confirm: ask,
    noteHome: bodyHome,
    attachFont: () => {
      voidAction("save_file", () => addFont());
    },
    dropAsset: (name) => {
      voidAction("save_file", () => removeAsset(name));
    },
    live: now,
    pageSet: setPageSetup,
    adoptDefault: adoptPageSetupAsDefault,
    write: setSetting,
  });
  // Snapshots reach the shell through the same register-once contract.
  wireSnapshots({
    confirm: ask,
    refreshBaseline,
    loadBody,
  });
  save.onUpdateTitleBar(updateTitleBar);
  // Spell-check rides the compile timer: one pause in typing, both schedules.
  onSchedule(scheduleSpellCheck);
  // Every preview pane on screen, told at once. Not a re-render: a banner
  // appearing must not scroll the page the writer is reading, which is the
  // whole reason to look at a stale preview in the first place.
  onStale((v) => {
    for (const b of document.querySelectorAll<HTMLElement>(".preview-stale")) b.hidden = !v;
  });
  // A compile is the only thing that can say what a note's marker printed as,
  // and it lands seconds after the edit that caused it — long after the drawer
  // last redrew. Without this the markers appear on the next keystroke and not
  // on the compile that fetched them, which reads as a drawer that lags a word
  // behind the page.
  onAfterCompile(() => {
    if (settings.notesPane) renderNotesPane();
  });
}
const REGISTRY_RETRY_MS = 2000;
/**
 * Load the command and template registries, retrying before giving up.
 *
 * These drive the toolbar, the menus, the palette and the completions, so
 * without them the editor still takes text but has no visible way to format it.
 * The failure used to be swallowed with a comment calling the registries
 * "optional for first paint" — which is true of the *paint* and false of the
 * app: the writer got an empty ribbon, empty menus and an empty palette, with
 * nothing said and nothing that would ever fetch them again.
 *
 * The notice is a banner and not a status-bar line for a mechanical reason as
 * much as a design one: boot runs the first compile straight after this, and
 * that compile writes the status bar — so a message left there would flash once
 * and vanish, which is barely better than silence.
 *
 * Only the *first* attempt is worth awaiting. Boot waits for it so the chrome
 * can be drawn with the registries in hand, but the retry happens on a timer
 * with nobody waiting: holding the editor's first render behind a second
 * network attempt would make a failed fetch cost the writer two seconds of
 * blank screen, which is a worse bug than the one being fixed.
 */
async function loadRegistries(): Promise<void> {
  if (await fetchRegistries()) return;
  showChromeNotice("registriesFailed");
  window.setTimeout(async () => {
    if (await fetchRegistries()) return;
    // Out of automatic attempts: hand the retry over rather than leaving a
    // "retrying…" that will never resolve.
    showChromeNotice("registriesGaveUp", { key: "retrySave", press: () => void loadRegistries() });
  }, REGISTRY_RETRY_MS);
}
/** One attempt. Returns whether the chrome now has what it needs. */
async function fetchRegistries(): Promise<boolean> {
  try {
    const [commands, templates] = await Promise.all([
      runtime.backend!.commands(),
      runtime.backend!.templates(),
    ]);
    // An empty command list is a **failure**, not a state this product can be
    // in: every surface that offers a command is built from it, so the editor
    // would take text and have no visible way to format any of it — with the
    // fetch itself reporting success (#105). Treated as a failed attempt, which
    // is what reaches `registriesFailed` rather than a silently shorter ribbon.
    if (!runtime.registriesArrived(commands)) return false;
    runtime.setRegistries(commands, templates);
    // Not awaited and not in the `Promise.all`: the chrome does not need the
    // sefer catalogue to be built, and a catalogue that never arrives must not
    // be able to hold the toolbar hostage.
    void sefarim.load(runtime.backend);
    clearChromeNotice();
    rerenderChrome();
    maybeOnboard();
    return true;
  } catch {
    // silent: the attempt failed, and `false` is the answer the caller reports —
    // the same one an empty command list gets, so a server that is down reaches
    // `registriesFailed` instead of a shorter ribbon (#105).
    return false;
  }
}
/**
 * Move the dictionary into a file, where there is a filesystem to put it in (B29).
 *
 * > *"The user dictionary lives in one browser profile — invisible to the desktop
 * > app, gone if the profile is cleared."*
 *
 * Silent when it works and silent when there is no file to use. It says something
 * in exactly one case: words that were in this browser's `localStorage` have just
 * been folded into the file — because a writer who taught the checker a hundred
 * words in the browser build is entitled to be told they came across.
 *
 * A failure costs the *file*, not the dictionary: `localStorage` is still there
 * behind it, so the worst case is the behaviour Ksav has always had.
 */
async function adoptDictionary(): Promise<void> {
  // The capability, asked once in one place (`api.ts`) rather than probed here
  // with two casts — a build's answer to "is there a dictionary file" is a
  // contract, not a duck-typing accident (`#221`).
  const keptFile = dictionaryOf(runtime.backend);
  if (!keptFile) return;
  try {
    const kept = await keptFile.dictionary();
    const moved = spell.keepDictionaryIn(kept.text, (next) =>
      kept.write(next).catch((e: unknown) => {
        const bad = troubleSaid(e, "save_file");
        setStatus(bad.said, "err", bad.detail);
      }),
    );
    if (moved > 0) {
      showChromeNotice(`${moved} · ${kept.where}`);
    }
  } catch (e) {
    // The dictionary still works out of localStorage; nothing a writer needs to
    // act on, and a modal at startup over a word list would be absurd.
    console.error("could not open the dictionary file:", e);
  }
}
/** True when this session's autosave should be quiet. */
/**
 * The recurring write-back job, gated and guarded.
 *
 * It suspends while the tab is hidden (the writer is not looking, and `save.ts`
 * already flushes on the way out), and holds a `busy` flag so a slow call
 * cannot pile up behind itself — the shape `watch.ts` uses. The other
 * background job, the Girsa inbox poll, lives beside this one in `girsa.ts`.
 */
/**
 * #89 — open the strip if it was left open.
 *
 * `setSetting` is the only thing that drives the per-key chain above, and it runs on a
 * **change**. A `minimap: true` restored from `localStorage` at startup therefore never
 * reaches the `key === "minimap"` branch, so the setting says the minimap is on, the
 * canvas draws in the gutter, and **no strip appears** — a screenshot of which is
 * indistinguishable from the feature being broken.
 *
 * Which is the third time in this project that a saved preference is read by a handler
 * that only runs on change. The setting is honoured here, once, after boot.
 */
function openMinimapIfSaved(): void {
  // Wired before the strip is ever opened, because the registry's own close — the
  // `×` and Escape both go through it — is what has to run this teardown.
  wireMinimapPanel(minimapDeps());
  if (settings.minimap && !minimapIsOpen()) toggleMinimap();
}
/**
 * The strip's one set of dependencies.
 *
 * A function and not a literal so the hook and the opener cannot disagree about what
 * closing means — which is exactly how it went wrong before, when the `×` closed
 * through the registry and the opener closed through a closure.
 */
wireBoot({
  installHooks,
  wireKeys,
  actions,
  runAction,
  adoptDictionary,
  loadRegistries,
});
void action("general", boot).then(openMinimapIfSaved);