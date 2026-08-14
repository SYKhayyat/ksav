// What every keyboard shortcut is bound to (B31, B36).
//
// # Why this is its own module
//
// It was inside `main.ts`, which is 3,400 lines and the one module in `src`
// without a test file. The grade's line about it is the reason this file exists:
//
// > *"The pattern is the tell: in Ksav, every module that got extracted got
// > tested, and the god module didn't."*
//
// And B36 needs it out here for a second reason:
//
// > *"no keyboard-shortcut card (Ksav has 29 bindings, discoverable only by
// > hovering)"*
//
// A card written by hand is right on the day it is typed. `tools/card.mjs` reads
// this file, so the card is wrong only if the application is.
//
// # What a binding looks like
//
// CodeMirror's spelling, which is what these are fed to: `Mod-` is Ctrl on Windows
// and ⌘ on a Mac, and the modifier order is `Mod-Alt-Shift-key`. Kept in
// CodeMirror's form rather than translated into ours, because there is exactly one
// consumer and translating would put a second spelling of every binding into the
// world for no gain.

/** Every action's shipped binding. */
export const DEFAULT_KEYS: Record<string, string> = {
  bold: "Mod-b",
  italic: "Mod-i",
  underline: "Mod-u",
  footnote: "Mod-Shift-f",
  // The two Word puts on `Ctrl+Alt+F` and `Ctrl+Alt+D`, and the reason two other
  // actions moved off those combinations. Someone who has only ever used Word
  // reaches for them without thinking, and an editor that answers with "isolate
  // this bidi run" has told them the program is not for them. `footnote` keeps
  // its own `Ctrl+Shift+F` as well, through KEY_ALIASES; the endnote had no key
  // at all — nor a button, nor a menu entry — so it simply takes Word's.
  endnote: "Mod-Alt-d",
  // A note *on* a note, at whatever tier the caret is standing in.
  tieredNote: "Mod-Shift-n",
  // A fold: the writer marks off a span so it can be collapsed, and every word
  // of it still prints. Was `region`, which named the one thing it is not.
  fold: "Mod-Shift-g",
  // The three of them share the slash, because they are one question — *does
  // this reach the page?* — asked three ways. `Mod-/` is the line toggle
  // everywhere there is an editor, and it used to hide a *passage* here; the
  // line form, which is what a writer reaches for, had no key at all.
  hideLine: "Mod-/",
  hideBlock: "Mod-Shift-/",
  // The third of the family: this one hides a *line break* rather than text.
  hiddenBreak: "Mod-Alt-/",
  // A paragraph break that is not a blank line. Beside `list.paraInItem` on
  // `Mod-Enter` because they are the same intention in two contexts — end the
  // paragraph, stay where you are — and the one that works everywhere takes the
  // combination the more specific one leaves free.
  paraBreak: "Mod-Alt-Enter",
  // Fold to a depth — the outline collapsed to chapters, or to simanim. `foldAll`
  // takes everything down at once and answers a different question.
  foldLevel1: "Mod-Alt-1",
  foldLevel2: "Mod-Alt-2",
  foldLevel3: "Mod-Alt-3",
  undo: "Mod-z",
  redo: "Mod-y",
  h1: "Mod-1",
  h2: "Mod-2",
  h3: "Mod-3",
  bullets: "Mod-Shift-8",
  numbered: "Mod-Shift-7",
  // Make what is written here a list, reading the numbering the writer typed by
  // hand. The two above name a kind; this one asks the text.
  makeList: "Mod-Shift-9",
  table: "Mod-Shift-t",
  toc: "Mod-Shift-o",
  center: "Mod-e",
  right: "Mod-Shift-r",
  left: "Mod-Shift-l",
  palette: "Mod-k",
  // The whole registry, grouped and searchable, beside the palette's key
  // because they are the two answers to "which command was it": the modal for
  // when you know, the drawer for when you are looking.
  commandsDrawer: "Mod-Shift-k",
  // The keyboard itself: every action, what it is bound to, and a way to change
  // it.
  //
  // Beside `F1` rather than in the `k` family with the two above, and both
  // halves of that are decisions. The `k` family is full — `Mod-k`,
  // `Mod-Shift-k` and `Mod-Alt-k` are the palette, the command list and the
  // hydra. `Shift-F1` is what Windows has meant by "tell me about this" since
  // long before any of us, so a reader who knows `F1` opens the help can guess
  // this one, which is the only kind of key worth choosing.
  //
  // It was `Mod-Alt-/` for about ten minutes, which is **already the hidden
  // line break**. Two things caught that and neither was the survey: a grep of
  // this file for `Mod-...-[A-Za-z0-9]` cannot see a `/`, so it reported the
  // chord free. `bindings.test.mjs` counted seventy-one distinct combinations
  // where seventy-two actions ship one, and said so in one line.
  keysDrawer: "Shift-F1",
  // Version control. `Mod-Alt-v` because `Mod-Shift-v` is paste-without-
  // formatting everywhere and `Mod-Alt-g` is not free — and because the drawer
  // is the only way into a whole feature, which every other drawer here has a
  // key for. A surface reachable only by mouse is also a surface that never
  // appears in the generated shortcut list or in `F1`, which is where a writer
  // looks for what exists.
  gitPanel: "Mod-Alt-v",
  find: "Mod-f",
  foldAll: "Mod-Alt-[",
  unfoldAll: "Mod-Alt-]",
  save: "Mod-s",
  open: "Mod-o",
  newDoc: "Mod-Alt-n",
  markInsert: "Mod-Alt-i",
  // Moved off `Mod-Alt-d` to give the endnote Word's own key. See `endnote`.
  markDelete: "Mod-Alt-Shift-d",
  addComment: "Mod-Alt-m",
  // Structural keys. Bare Enter/Tab rather than a modifier chord because that
  // is what they are in Word and in every outliner — and they are only consulted
  // while the caret is inside a list, falling through to ordinary Enter and Tab
  // everywhere else. Rebindable like the rest; see `structureKeymap`.
  "list.splitItem": "Enter",
  "list.breakInItem": "Shift-Enter",
  // The third reading of Enter inside a list: a new *paragraph* under the same
  // number, which is what a se'if with two paragraphs is. Word puts nothing
  // here because Word has no third reading; `Ctrl+Enter` is free and adjacent.
  "list.paraInItem": "Mod-Enter",
  "list.indent": "Tab",
  "list.outdent": "Shift-Tab",
  "list.moveUp": "Alt-ArrowUp",
  "list.moveDown": "Alt-ArrowDown",
  // Heading tree editing, on org-mode's chords — promote/demote sideways, move
  // the section vertically. Distinct from the list chords rather than shared:
  // the two contexts are mutually exclusive so one key *could* serve both, but
  // "no two actions on one combination" is a rule worth keeping literal, and a
  // writer reading the shortcut list should not have to reason about context to
  // know what a key does.
  "heading.promote": "Alt-Shift-ArrowLeft",
  "heading.demote": "Alt-Shift-ArrowRight",
  "heading.moveUp": "Alt-Shift-ArrowUp",
  "heading.moveDown": "Alt-Shift-ArrowDown",
  // Record and replay. Emacs puts these on F3/F4 and so does everybody who has
  // ever used them; the muscle memory is worth more than the mnemonic.
  help: "F1",
  macroRecord: "F3",
  macroPlay: "F4",
  hydra: "Mod-Alt-k",
  healBrackets: "Mod-Alt-b",
  renderNotes: "Mod-Alt-e",
  // Forward search — "where am I on the page?". The other direction is a click
  // on the preview and needs no key.
  revealCursor: "Mod-Alt-p",
  // Bidi isolation by hand, for the run the automatic pass does not cover.
  isolate: "Mod-Alt-x",
  // Spelling suggestions for the word the caret is in. On `Mod-.` because that
  // is where VS Code and every editor since have put "fix the thing I am
  // standing on", and because the gesture it replaces was a left click — which
  // is the caret's, and taking it cost a writer the ability to click into their
  // own spell-checked words at all.
  spellSuggest: "Mod-.",
  // Straight back to the document you were just in. Not a convenience: with
  // several documents open, no strip of chrome can be an inventory of what is
  // open *and* stay out of the way, so the keyboard is the surface that tells
  // that truth. `Mod-Alt-Tab` rather than the bare `Ctrl+Tab` a browser uses,
  // because a browser tab is what would swallow it.
  lastDoc: "Mod-Alt-Tab",
  // The full list, most recently used first, as a panel.
  switcher: "Mod-Alt-o",
  // Put this document away. Deliberately **not** `Mod-w`: that is the browser's
  // close-tab and the desktop shell's close-window, and a key that sometimes
  // puts a document away and sometimes ends the session is not one anybody can
  // press without checking first.
  closeDoc: "Mod-Alt-w",
  // Arrangements. The strip hides itself at one tab, so these are not a
  // shortcut for something already on screen — for a writer with one tab they
  // are the *only* route besides the arrangement picker, which is the reason
  // the record says the strip "must never be the only route in".
  newTab: "Mod-Alt-t",
  // Not `Mod-Alt-]`, which is `unfoldAll` — caught by the fence that refuses two
  // actions on one combination, which is the whole reason that fence exists.
  nextTab: "Mod-Alt-PageDown",
  // Deferred note bodies. `deferJump` is the workhorse — org-mode's C-c C-c —
  // and gets the mnemonic key; the two that move prose around sit beside it.
  deferJump: "Mod-Alt-j",
  // Moved off `Mod-Alt-f`, which is Word's footnote key. See `footnote`.
  deferHere: "Mod-Alt-Shift-f",
  deferRecall: "Mod-Alt-r",
  // Zoom, where every application on the machine puts it. Which surface they act
  // on is `zoom.surfaceOf` — the text when the caret is in it, the page
  // otherwise — so one pair of keys does not need two pairs of bindings.
  //
  // These are the browser's own zoom keys as well, and that is the point: in the
  // desktop shell they are ours outright, and in a tab `preventDefault` on a
  // handled key keeps the browser from zooming the chrome out from under the
  // writer. A tool whose text cannot be made bigger with Ctrl+= is a tool that
  // has told the reader it is not for them.
  zoomIn: "Mod-=",
  zoomOut: "Mod--",
  zoomReset: "Mod-0",
  // Take a snapshot by hand. Beside `save` on purpose: they are the two things a
  // writer does deliberately to keep what they have, and the difference between
  // them — one writes the file, one keeps a point to come back to — is worth a
  // key each rather than one key and a panel.
  snapshot: "Mod-Alt-s",
};

/**
 * Extra keys for an action beyond its configured one.
 *
 * Redo answered only to `Mod-y`, and a great many people press `Mod-Shift-z` and
 * simply conclude that redo is broken. An alias is not a second setting: it is
 * dropped as soon as the writer binds that combination to something themselves —
 * see [`aliasesInForce`].
 */
export const KEY_ALIASES: Record<string, string[]> = {
  redo: ["Mod-Shift-z"],
  // Word's footnote key, alongside Ksav's own.
  footnote: ["Mod-Alt-f"],
};

/**
 * Actions that have been renamed, old name to new.
 *
 * A writer's rebindings are stored by action id, so renaming an action silently
 * throws their key away — the setting is still in the file, keyed to a name
 * nothing answers to any more, and the shipped default quietly comes back. This
 * table is how a rename stays a rename rather than a reset.
 */
export const RENAMED_ACTIONS: Record<string, string> = {
  // Both from the day the three source constructs got names that say which one
  // reaches the page. `region` is now `#אזור`, a fixed area on the page, and
  // `comment` was too close to `addComment`, which is a review mark.
  region: "fold",
  comment: "hideBlock",
};

/** The bindings in force: the shipped table with the writer's changes over it. */
export function keybindingsFrom(changed: Record<string, string> | undefined): Record<string, string> {
  const mine: Record<string, string> = {};
  for (const [id, key] of Object.entries(changed || {})) {
    // Not filtered against `DEFAULT_KEYS`: an action may be bound without
    // shipping a key of its own — the settings panel offers every action, not
    // only the ones with a default — so a filter here would quietly throw those
    // away, which is the exact failure this rename table exists to prevent.
    mine[RENAMED_ACTIONS[id] ?? id] = key;
  }
  return { ...DEFAULT_KEYS, ...mine };
}

/**
 * Which aliases still apply, given what is bound.
 *
 * An alias yields to a real binding. If the writer has put `Mod-Shift-z` on
 * something of their own, redo does not also answer to it — two actions on one
 * combination is a keystroke whose effect depends on which list was consulted
 * first, which is not a thing anybody can debug from the writing side.
 */
export function aliasesInForce(bound: Record<string, string>): Record<string, string[]> {
  const claimed = new Set(Object.values(bound));
  const out: Record<string, string[]> = {};
  for (const [id, keys] of Object.entries(KEY_ALIASES)) {
    const free = keys.filter((key) => !claimed.has(key));
    if (free.length) out[id] = free;
  }
  return out;
}

/**
 * Which action already holds a combination, if any — for the settings panel, so a
 * writer rebinding a key is told what they are taking it from rather than finding
 * out later that something stopped working.
 */
export function whoHolds(
  bound: Record<string, string>,
  key: string,
  except: string,
): string | null {
  const found = Object.entries(bound).find(([id, k]) => id !== except && k === key);
  return found ? found[0] : null;
}

/**
 * A binding as a person reads it: `Ctrl+Shift+F`, not `Mod-Shift-f`.
 *
 * For the card and for the panel. `Mod` prints as `Ctrl` because the card is a
 * printed page and cannot know which machine is reading it — and the row after it
 * says so once, rather than every row hedging.
 */
export function readable(binding: string): string {
  return (
    binding
      // Not a plain `split("-")`. The separator is also a key: `Mod--` is
      // Ctrl and the minus key, and splitting naively gives `["Mod","",""]`,
      // which prints as `Ctrl++` — the wrong key, in the shortcut list, on the
      // card, and in every menu that shows a binding. The lookahead is
      // CodeMirror's own rule from `normalizeKeyName`, which is what these
      // strings are fed to, so the two halves read one spelling.
      .split(/-(?!$)/)
      .map((part) => {
        if (part === "Mod") return "Ctrl";
        // A single character goes up; `Shift` and `Alt` are already spelled.
        return part.length === 1 ? part.toUpperCase() : part;
      })
      .join("+")
  );
}

/**
 * An action id as a `:` command or an `M-x` name.
 *
 * Lowercase letters and digits only. Vim's ex parser reads a command name as a
 * run of word characters, so `table.rowBelow` would be read as `table` and the
 * rest thrown away — silently running the wrong command, which is worse than
 * running none.
 *
 * Here rather than in `keymodes.ts`, which is where it was and which re-exports
 * it: `keyHint` below needs it, and so does every view that draws a key. This
 * module imports nothing, so all of them can reach it; `keymodes` imports
 * CodeMirror, so none of them could.
 */
export const commandName = (id: string): string => id.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * What to print where a key goes — which is not always a key.
 *
 * `buildShortcutKeymap` returns *nothing at all* while an editing mode is
 * really installed: that is how Vim and Emacs win the keyboard, rather than by
 * out-ranking anything. But `keybindings()` goes on handing out the chords, and
 * twenty surfaces printed them — every menu's `<code>`, the toolbar tooltips,
 * the snapshot note, the spelling tooltip, the switcher's heading, the fold
 * levels, the help panel, the palette rows. Under a mode, every one of those
 * named a chord that does nothing. The shortcut list was the only surface that
 * knew, because it was the only one that had been told.
 *
 * So the rule lives here, once, and the answer under a mode is not a blank: it
 * is the way the action is actually reached, `:makelist` or `M-x makelist`.
 * Blanking would be honest and useless — the writer who came looking for a key
 * would learn only that there isn't one, which is false.
 *
 * `name` is passed in rather than derived from the id, because two of the three
 * callers already have it: `commandName` above spells it, and
 * `keymodes.nameClashes` is what holds those names distinct from each other.
 */
export function keyHint(key: string, mode: string, name: string): string {
  if (mode === "vim") return ":" + name;
  if (mode === "emacs") return "M-x " + name;
  return key ? readable(key) : "";
}
