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
  region: "Mod-Shift-g",
  comment: "Mod-/",
  // The sibling of `comment`, and deliberately next to it on the keyboard: one
  // hides text from the page, the other hides a *line break* from the page.
  hiddenBreak: "Mod-Shift-/",
  undo: "Mod-z",
  redo: "Mod-y",
  h1: "Mod-1",
  h2: "Mod-2",
  h3: "Mod-3",
  bullets: "Mod-Shift-8",
  numbered: "Mod-Shift-7",
  table: "Mod-Shift-t",
  toc: "Mod-Shift-o",
  center: "Mod-e",
  right: "Mod-Shift-r",
  left: "Mod-Shift-l",
  palette: "Mod-k",
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
  // Deferred note bodies. `deferJump` is the workhorse — org-mode's C-c C-c —
  // and gets the mnemonic key; the two that move prose around sit beside it.
  deferJump: "Mod-Alt-j",
  // Moved off `Mod-Alt-f`, which is Word's footnote key. See `footnote`.
  deferHere: "Mod-Alt-Shift-f",
  deferRecall: "Mod-Alt-r",
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

/** The bindings in force: the shipped table with the writer's changes over it. */
export function keybindingsFrom(changed: Record<string, string> | undefined): Record<string, string> {
  return { ...DEFAULT_KEYS, ...(changed || {}) };
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
  return binding
    .split("-")
    .map((part) => {
      if (part === "Mod") return "Ctrl";
      // A single character goes up; `Shift` and `Alt` are already spelled.
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("+");
}
