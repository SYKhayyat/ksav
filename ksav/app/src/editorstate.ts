// The editor's extension stack, assembled.
//
// This was the body of `makeState` in `main.ts`, where it was the largest single
// function in a file already under a size debt. Nothing about an extension list
// is assembly: every entry is a decision about what the editor *is* — "the
// minimap lives in this editor, so there is no second copy of the document",
// "a fold's marks have to be comments or the page would print them", "`//{` is
// the floor, not a choice". `CONTRIBUTING.md` §5 asks whether a thing could be
// wrong without crashing: a dropped `tagDim` or a mis-ordered `keymap` runs fine
// and is wrong, and a function nobody can import is not somewhere a test can
// reach.
//
// What stayed in `main.ts` is the update listener, and the line between them is
// the readable one. This list is configuration, read once when a state is built.
// The listener is behaviour — it schedules saves and compiles, marks the spell
// check dirty, renumbers — and it calls nine `main.ts` functions to do it.
//
// Two things come in from the caller: `deps.structureKeymap`, which resolves
// keys through `runStructureAction`, and the two compartments a live state owns.

import { EditorSelection, EditorState, Prec, Compartment } from "@codemirror/state";
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import type { KeyBinding } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";

import * as hiding from "./hiding";
import * as spell from "./spell";
import { sourcesOf } from "./api";
import { apparatusLint } from "./apparatus-lint";
import { bidiSupport } from "./bidi";
import { bracketLint } from "./bracket-lint";
import { changeGutter, changeHighlight, changes } from "./changes";
import {
  autoCompartment,
  autoExtension,
  buildShortcutKeymap,
  dirCompartment,
  editorTheme,
  pairCompartment,
  pairExtension,
  phraseCompartment,
  proseCompartment,
  proseOrRaw,
  shortcutCompartment,
  themeCompartment,
  whitespaceCompartment,
  whitespaceExtension,
} from "./compartments";
import { scheduleCompile } from "./compile";
import { deferredNotes } from "./deferred-editor";
import { troubleSaid } from "./diagnostics";
import { errorLineDecorations, errorLines } from "./errorlines";
import { focusCompartment, focusExtension } from "./focus";
import { t, tf } from "./i18n";
import { DEFAULT_INDENT, indentView } from "./indent";
import { snippetTab } from "./insert";
import { isPlainClick } from "./jump";
import { hintFor } from "./keyhint";
import { ksavFold, ksavFolding, ksavHighlighter, revealAll } from "./ksav-lang";
import { minimapExtension } from "./minimap";
import { narrowing } from "./narrowing";
import { noteAt } from "./notes";
import { numberingMarks } from "./numbering-lint";
import { revealFromSourceClick } from "./reveal";
import { openNoteMenu } from "./rowlists";
import { overviewRuler } from "./ruler";
import * as runtime from "./runtime";
import { setStatus } from "./runtime";
import * as keymodes from "./keymodes";
import { docConfig, settings } from "./settings";
import { sourceNoteMarks } from "./sourcenote-lint";
import { docTextOf } from "./spans";
import { openSpellMenu } from "./spellcheck";
import { searchPhrases } from "./starter";
import { tagDim } from "./tagdim";
import { tagSelectExtension } from "./tagselect";
import { motionCompartment } from "./compartments";

/** The one `main.ts` member an extension stack cannot import. */
export interface StateDeps {
  /** The structure keymap; it resolves keys through `runStructureAction`. */
  structureKeymap: () => KeyBinding[];
  /**
   * The source's movement keys (#126). Empty while the setting is `"raw"`, so
   * the editor's own arrow behaviours are exactly what remains — which is the
   * promise the setting makes.
   */
  motionKeymap: () => KeyBinding[];
}

/**
 * The editor's extensions, in the order they take precedence.
 *
 * `structureCompartment` is created per call and stays private: it belongs to one
 * state, and nothing outside this file reconfigures it (`reconfigureShortcuts`
 * goes through `compartments.ts`).
 */
export function buildExtensions(prose: boolean, deps: StateDeps): Extension[] {
  const structureCompartment = new Compartment();
  const extensions: Extension[] = [
    // In a compartment, and owned by `runtime.ts`, because a document swap
    // has to be able to throw the stack away. See `swapDocument` there.
    runtime.historyExtension(),
    drawSelection(),
    highlightActiveLine(),
    ksavFolding,
    foldGutter(),
    bracketMatching(),
    // #86 — click an opening `[` and the tag selects. `Alt`+click gives the other
    // answer, so the setting below is about what a bare click means and not about
    // which of the two is reachable.
    tagSelectExtension(() => settings.clickSelectsTag ?? "whole"),
    // #85 — dim every line outside the tag the caret is in, with the fade
    // graded by nesting. `0` means off, and off is free.
    tagDim(() => (settings.dimOutsideTag ?? 0) / 100),
    // #89 — the minimap. It lives in *this* editor and draws on a canvas, so
    // there is no second copy of the document; `null` is a closed panel.
    minimapExtension(() => ({
      on: !!settings.minimap,
      colors: !!settings.minimapColors,
    })),
    // #84 — the indent view. Every dial is the writer's own number, read per
    // rebuild so the toggle and the settings reconfigure rather than being
    // captured once at construction.
    indentView(() => ({
      ...DEFAULT_INDENT,
      on: !!settings.indentView,
      amount: settings.indentAmount ?? DEFAULT_INDENT.amount,
      minWords: settings.indentMinWords ?? DEFAULT_INDENT.minWords,
      percent: settings.indentPercent ?? DEFAULT_INDENT.percent,
    })),
    // The answer to "three characters is too many to type all day". A fold's
    // marks have to be comments or the page would print them, Typst's comment
    // is `//`, and one brace after it is the shortest brace-like thing that
    // can follow — so `//{` is the floor, not a choice. What can be bought is
    // the rest: finish the opener and the editor writes the closer, the line
    // between them and the caret. Above `closeBrackets`, which would otherwise
    // answer the same `{` with a `}` that prints.
    EditorView.inputHandler.of((view, from, to, text) => {
      if (text !== "{") return false;
      const sel = view.state.selection.main;
      if (!sel.empty || from !== sel.from || to !== sel.to) return false;
      const doc = docTextOf(view.state.doc);
      const closer = hiding.foldCloser(doc, from);
      if (!closer) return false;
      view.dispatch({
        changes: { from, to, insert: "{" + closer.insert },
        selection: { anchor: closer.caret },
        userEvent: "input.type",
      });
      return true;
    }),
    closeBrackets(),
    // What it is allowed to close: two switches, in a compartment because they
    // are settings. Typst's `$…$` pairs with the brackets — typstify's
    // `editor/typst.go` does the same, and `$…$` works in a Ksav body because
    // the body *is* Typst. The gershayim ships **off**, for the reason
    // `brackets.ts` gives at length: `"` is not a delimiter in a Hebrew
    // document, because רש״י and שו״ע are everywhere and pairing quotes
    // swallows whole tables. Off is a default, not a refusal — see
    // `pairExtension`.
    pairCompartment.of(pairExtension()),
    whitespaceCompartment.of(whitespaceExtension()),
    search({ top: true }),
    phraseCompartment.of(EditorState.phrases.of(searchPhrases())),
    // The hydra is *not* here, and that is the fix rather than an omission.
    // It was `Prec.highest(keymap.of(hydraKeymap()))` a dozen lines below,
    // under a comment claiming it was "ahead of everything, including the
    // mode keymaps". It was not, and no position in this array could have
    // made it so: `@replit/codemirror-vim` handles keys from a **ViewPlugin
    // event handler** (`vimPlugin`, `keydown`), and a plugin's DOM handlers
    // run before the `keymap` facet regardless of precedence. See
    // `captureHydraKeys`, which owns the keyboard by actually being first.
    //
    // Vim / Emacs, when one is chosen. Deliberately *before* the shortcut
    // keymap: both are Prec.highest and CodeMirror breaks that tie by array
    // order, so the mode gets first refusal on every key. See `keymodes.ts`
    // for why the mode wins rather than Ksav's own bindings.
    keymodes.modeCompartment.of([]),
    // Dim everything but the paragraph in hand, and keep the caret line
    // centred. Two settings, in one compartment because they are reconfigured
    // together and never independently.
    focusCompartment.of(
      focusExtension(
        !!settings.focusMode,
        !!settings.typewriter,
        settings.typewriterAnchor ?? "center",
      ),
    ),
    shortcutCompartment.of(Prec.highest(keymap.of(buildShortcutKeymap()))),
    autoCompartment.of(autoExtension()),
    // Structural keys, above the defaults: inside a list, Enter makes the next
    // bullet and Tab indents it, exactly as in Word and every outliner. They
    // fall through untouched everywhere else, so Enter is still Enter in
    // ordinary prose.
    structureCompartment.of(Prec.high(keymap.of(deps.structureKeymap()))),
    // Above the defaults, because `defaultKeymap` owns `Mod-ArrowLeft` and the
    // arrow keys have to be this mode's while it is on. The compartment is the
    // application's (`compartments.ts`), not this state's, so a setting change
    // reaches every pane without rebuilding a document.
    motionCompartment.of(Prec.high(keymap.of(deps.motionKeymap()))),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...completionKeymap,
      ...foldKeymap,
      snippetTab,
      indentWithTab,
    ]),
    EditorView.lineWrapping,
    ksavHighlighter,
    ksavFold,
    bracketLint,
    // Notes collected and never rendered: valid source, finished-looking page,
    // and the prose missing from it.
    apparatusLint,
    // A source note that is not in the source index says so, on its own line.
    // See `sourcenote-lint.ts`: the whole value of the command is the half
    // that does not print, and nothing on screen said which kind you had.
    sourceNoteMarks,
    // A siman or a se'if whose number no longer says where it is. The
    // insertion path resequences on insert; this is the half that catches a
    // delete and a move, neither of which asks this application anything.
    numberingMarks,
    deferredNotes,
    revealAll,
    // A pane locked to one section. Per state and therefore per pane, which is
    // the whole feature: the point of narrowing is that the pane beside it is
    // still showing the whole sefer. See `narrowing.ts` for why the anchor
    // lives here rather than on the `Leaf` in `panes.ts`.
    narrowing,
    dirCompartment.of(EditorView.contentAttributes.of({ dir: docConfig().dir })),
    // The document's direction above is the *fallback*; every line that has a
    // letter in it answers for itself, and the syntax is held apart from the
    // prose so a command stops migrating through the sentence it is in.
    bidiSupport(() => (docConfig().dir === "ltr" ? "ltr" : "rtl")),
    // The parameter, not `proseHere()`: a state may be built for a document
    // that is not the focused one, and asking "what mode is the screen in"
    // would give it somebody else's answer.
    proseCompartment.of(proseOrRaw(prose)),
    themeCompartment.of(editorTheme(settings.theme === "dark")),
    spell.misspellings,
    spell.spellDecorations,
    // What the squiggle means, and both ways to act on it. The left button
    // used to be the only route to the suggestions, and it cost the caret;
    // this is the route that costs nothing. The key it names is read live off
    // the bindings, so rebinding `spellSuggest` moves the sentence with it.
    spell.spellTooltip((m) => {
      const which = m.lang === "en" ? t("spellLexEn") : t("spellLexHe");
      return tf("spellTip", which, hintFor("spellSuggest"));
    }),
    errorLines,
    errorLineDecorations,
    // What has moved since the last snapshot: the gutter, the faint line
    // highlight, and the ticks the overview ruler reads off the same field.
    changes,
    changeGutter,
    changeHighlight,
    // Everything wrong with the document, on one strip beside the scrollbar.
    // Purely a view over the four fields above it — it computes no marks of
    // its own, which is why it can be added last and removed with one line.
    overviewRuler,
    // A squiggle answers to a plain click, not only a right-click: on a
    // touchscreen there is no right-click at all.
    EditorView.domEventHandlers({
      /**
       * A paste that might be a source Girsa put down (spec.md §10.2).
       *
       * Girsa's Ctrl+C writes three flavours: `text/plain`, `text/html`, and
       * a **real native clipboard format** carrying the Source Packet — eighty
       * -six careful lines to do it, because a webview can only write
       * Chromium's *web custom format*, which no native application can read.
       * Nothing here read the third one, so that copy landed in an editor
       * that only ever took the first.
       *
       * The packet cannot be read off this event — a `paste` exposes
       * `text/plain`, `text/html` and files, and a custom native format is
       * not among them on any platform — so the engine is asked, in the
       * process that can open the real clipboard.
       *
       * Which makes the ordering the whole of the care needed here. The ask
       * is asynchronous and `preventDefault` is not, so the plain text is
       * taken *now*, the default is stopped, and the text is put in
       * immediately; if a packet turns up, the same text is replaced by the
       * markup. A reader pasting from anywhere else sees an ordinary paste
       * and never waits for a clipboard round-trip.
       */
      paste(e, v) {
        const plain = e.clipboardData?.getData("text/plain") ?? "";
        const sources = sourcesOf(runtime.backend);
        if (!sources || !plain) return false;
        e.preventDefault();
        const at = v.state.selection.main;
        // Every range, not just the main one.
        //
        // CodeMirror's own paste inserts into all of them; this replaced
        // `selection.main` and left every other cursor untouched with no
        // indication at all. A writer holding four carets pasted into one of
        // them and had to find out by looking.
        //
        // And `userEvent`, because without it the macro recorder never sees
        // this transaction: its filter is `if (!tr.isUserEvent("input"))
        // continue`, and the comment directly above that filter says the
        // opposite — *"so an IME, **a paste** and a nikud button all record as
        // the text they produced"*. A macro recorded with a paste in it
        // replayed without it.
        v.dispatch(
          v.state.changeByRange((r) => ({
            changes: { from: r.from, to: r.to, insert: plain },
            range: EditorSelection.cursor(r.from + plain.length),
          })),
          { userEvent: "input.paste" },
        );
        const from = at.from;
        void sources
          .clipboardSource()
          .then((markup) => {
            if (!markup) return;
            // Only if the text this put in is still there. A reader who kept
            // typing while the clipboard was being read has moved on, and
            // rewriting what is under their caret now would be worse than
            // the plain paste they already have.
            const here = docTextOf(v.state.doc).slice(from, from + plain.length);
            if (here !== plain) return;
            v.dispatch({
              changes: { from, to: from + plain.length, insert: markup },
              selection: { anchor: from + markup.length },
              userEvent: "input.paste",
            });
            setStatus(t("sourcePasted"), "ok");
            scheduleCompile();
          })
          .catch((err) => {
            // A packet that arrived and could not be read — a schema
            // mismatch carries both version numbers. The plain text is
            // already in, so this is a line and not a failure.
            const bad = troubleSaid(err, "reach_girsa");
            setStatus(bad.said, "warn", bad.detail);
          });
        return true;
      },
      // **There is no `mousedown` here, and that is the fix.**
      //
      // It used to open the suggestion menu on any press over a squiggle,
      // with `preventDefault()` in front of it — so the left button, whose
      // one job in a text editor is to put the caret somewhere, could not
      // put the caret on a misspelled word. `misspellingAt` counted the
      // boundary *after* the word as a hit too, which is why the report was
      // "on or after". A writer with a page of unrecognised Torah
      // terminology could not click into their own sentences.
      //
      // Suggestions are a right-click and a key now — which is what they are
      // in Word, in the browser and in every code editor — and the squiggle
      // says so on hover, so nothing is lost with the gesture. See
      // `spellTooltip` in `spell.ts`.
      contextmenu(e, v) {
        const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos == null) return false;
        if (settings.spellcheck) {
          // `misspellingUnder`, not `misspellingAt`: a pointer landed on a
          // character, and the boundary after the last one is the next word.
          const m = spell.misspellingUnder(v, pos);
          if (m) {
            e.preventDefault();
            void openSpellMenu(m, e.clientX, e.clientY);
            return true;
          }
        }
        // Right-click on a note: convert it, delete it with its marker, or
        // hang another note off it. The operations existed as commands and
        // nowhere a pointer could reach them.
        if (noteAt(docTextOf(v.state.doc), pos)) {
          e.preventDefault();
          openNoteMenu(e, pos);
          return true;
        }
        return false;
      },
      // The mirror of clicking a rendered page to move the caret: a plain
      // left-click in the source scrolls the preview to where that word — or
      // that footnote marker — printed. CodeMirror has already placed the
      // caret by the time `mouseup` fires, so the deferred reveal reads the
      // caret the click set. A drag is a selection, not a click, and is left
      // alone; the reveal is quiet and only fires when `clickToPreview` is on.
      //
      // The event is handed on rather than dropped because `clickTarget: keep`
      // needs the one fact only the click carries: how far down its own pane
      // it was made. Read here, at the moment it happens, since the reveal
      // runs 120 ms later and the pane may have scrolled by then.
      mouseup(e) {
        if (e.button !== 0) return false;
        if (!isPlainClick(window.getSelection())) return false;
        revealFromSourceClick(e);
        return false;
      },
    }),
  ];
  return extensions;
}
