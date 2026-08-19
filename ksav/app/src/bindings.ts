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
  // The margin note — `#הערת_גיליון`, so `Mod-Alt-g` for *gilyon*, in the
  // document's own vocabulary rather than a translation of it.
  //
  // Two wrong answers preceded it, and both were caught by a test rather than
  // by thought. `Mod-Shift-m` for *margin* is `citePhrase`, which this entry
  // asserted was "free in both keymaps" and was not. Then no key at all — on
  // the argument that what the margin note lacked was a *button*, since it had
  // none and writers were pressing the callout beside the footnote and getting
  // a blue box. That argument is right about the button and wrong about the
  // key: `actions.test.mjs` requires every action to be reachable from the
  // keyboard, which is not a formality but the difference between a feature and
  // a feature for people who can use a mouse.
  sidenote: "Mod-Alt-g",
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
  // A visible line break — Typst's `linebreak`, the shortest way to a break with
  // no paragraph gap. It had no key at all, and it is one of the commonest things
  // a writer reaches for. Placed one Shift away from `paraBreak`'s `Mod-Alt-Enter`
  // so the Enter-family reads as a ladder: paragraph, line, page.
  lineBreak: "Mod-Alt-Shift-Enter",
  // A paragraph break that is not a blank line. Beside `list.paraInItem` on
  // `Mod-Enter` because they are the same intention in two contexts — end the
  // paragraph, stay where you are — and the one that works everywhere takes the
  // combination the more specific one leaves free.
  paraBreak: "Mod-Alt-Enter",
  // Start the next page here. `#מעבר_עמוד` has always existed and was reachable
  // only by name, from the registry section of the Insert menu — which is to say
  // it was reachable by somebody who already knew Ksav had it.
  //
  // **Not `Mod-Enter`, which is Word's, and that is a real cost.** `Ctrl+Enter`
  // is a page break in Word everywhere, including inside a list; here it is
  // `list.paraInItem`, placed there on the reasoning that "Word has no third
  // reading" for Enter inside a list. That is true and it is the wrong question:
  // Word binds the combination *globally*, so checking what it means inside a
  // list found it free when it is not. The paragraph-under-one-number key is
  // kept where writers already have it, and this takes the free neighbour — so a
  // writer arriving from Word presses `Ctrl+Enter` outside a list and still gets
  // nothing. That is the trade, made deliberately, and it is the argument to
  // reopen if page breaks turn out to be the commoner ask.
  pageBreak: "Mod-Shift-Enter",
  // Lock this pane to the section the caret is in, and let it out again. The
  // same axis as the fold keys — *show me less of this document* — and a pair
  // rather than a toggle, because a key whose effect depends on a state the
  // writer has to remember is a key they press twice to find out where they are.
  //
  // Adjacent keys for a two-directional pair, which is the whole of the choice:
  // `,` and `.` sit under the same two fingers and carry `<` and `>` above them,
  // so the direction is on the keycap. `Mod-.` alone is `spellSuggest`; these
  // are the Alt forms and neither was taken.
  narrow: "Mod-Alt-,",
  widen: "Mod-Alt-.",
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
  // The two errands that go to Girsa, and they are here because until now they
  // were not anywhere: `wireKeys` answered `Ctrl+Shift+L` and `Ctrl+Shift+M`
  // with a literal `e.key` test on the window, outside this table entirely. So
  // neither was rebindable, neither appeared on the generated card, in the key
  // list or in `F1` — and both went on firing while Vim or Emacs held the
  // keyboard, which is precisely what `buildShortcutKeymap` returning nothing
  // exists to prevent.
  //
  // `Ctrl+Shift+M` is kept, because it was free. `Ctrl+Shift+L` could not be:
  // it is `left`, and has been since alignment was bound. Both ran — the editor
  // aligned the paragraph and the window handler linkified the selection, two
  // actions on one combination, which is the one rule this table has. Linkify
  // moves to `Mod-Alt-l`, beside the other application-scale errands.
  citePhrase: "Mod-Shift-m",
  linkifyCitations: "Mod-Alt-l",
  // Structural keys. Bare Enter/Tab rather than a modifier chord because that
  // is what they are in Word and in every outliner — and they are only consulted
  // while the caret is inside a list, falling through to ordinary Enter and Tab
  // everywhere else. Rebindable like the rest; see `structureKeymap`.
  "list.splitItem": "Enter",
  "list.breakInItem": "Shift-Enter",
  // The third reading of Enter inside a list: a new *paragraph* under the same
  // number, which is what a se'if with two paragraphs is. Word has no third
  // reading for Enter inside a list, so this took `Ctrl+Enter` as free —
  // and it is not: Word binds that combination *globally*, to a page break. The
  // combination stays here because writers already have it; see `pageBreak` for
  // what that cost and why it was still the choice.
  "list.paraInItem": "Mod-Enter",
  "list.indent": "Tab",
  "list.outdent": "Shift-Tab",
  // The same two keys, on the other structure — and this is the one place in
  // this table where a combination appears twice.
  //
  // It is allowed because a **structure** action is already scoped: `list.indent`
  // cannot fire outside a list and `table.nextCell` cannot fire outside a table,
  // `structureAt` resolves the innermost structure so the caret is in exactly one
  // of them, and `structureKeymap` binds without `preventDefault` so a decline
  // falls through to the next. The rule that matters — one keystroke, one effect —
  // holds; what does not hold is the cruder reading of it, that one key may name
  // only one action. `bindings.test.mjs` states the exception and proves the
  // exclusion rather than trusting it.
  //
  // It is worth the exception because `Tab` is how every table in every word
  // processor is filled in, and without it the only way into the next cell is a
  // mouse click on the source between two brackets.
  "table.nextCell": "Tab",
  "table.prevCell": "Shift-Tab",
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
  // And back. `nextTab` alone was defensible while it was round — with two or
  // three arrangements "next" reaches all of them — but round motion is only an
  // answer for somebody who knows how many tabs there are, and the report that
  // put this whole group under review was *"or to move from tab to tab"*. A
  // strip you can only walk in one direction is a strip you have to count.
  prevTab: "Mod-Alt-PageUp",
  // Put the arrangement away. Not `Mod-Alt-w`, which closes a *document*: these
  // are the two things in this application a writer might mean by "close", they
  // destroy very different amounts, and they must not be one key apart by
  // accident. Shift says "the bigger thing", which here is the whole window
  // layout rather than the text in it — and it destroys nothing, because every
  // document the arrangement showed stays open.
  closeTab: "Mod-Alt-Shift-w",
  // A blank document *and* an arrangement to put it in. Asked for in those
  // words — *"both an empty new tab and to open a doc in a new tab"* — and it is
  // genuinely a third thing: `newDoc` makes a document in the arrangement you
  // are standing in, `newTab` makes an arrangement showing the document you are
  // already reading, and neither of them is "somewhere clean to start".
  newDocTab: "Mod-Alt-Shift-t",
  // Move this pane to where the one beside it is, and that one to here. The
  // tiling-manager gesture, asked for in those words: *"there should be a
  // command to move any window to swap it with another window (like in
  // hyprland)"*. Four keys rather than one toggle because a window can hold
  // more than two panes, and "swap" with no direction is only an answer while
  // there are exactly two of them.
  //
  // Arrows, because the operation is directional and nothing else says a
  // direction as well. The modifier had to clear three neighbours: `Alt-Arrow`
  // moves a list item, `Alt-Shift-Arrow` moves a section, and `Mod-Shift-Arrow`
  // is select-by-word in every editor on the machine. `Mod-Alt-Shift-Arrow` is
  // free of all three, and free in the browser besides.
  //
  // The **screen's** left, not the tree's: the interface is right-to-left, so
  // `panes.neighbor` is asked with the live direction rather than reading the
  // tree order. See the geometry section of `panes.ts`.
  // Show this region alone, then this region with what it is split against, and
  // so on out to the whole window. One key for the whole walk — the request was
  // for the *easier* way, and three keys is not it.
  //
  // `Mod-Alt-Enter` is the tiling-window-manager fullscreen and would have been
  // the mnemonic choice; it is `paraBreak`, which a writer presses far more
  // often. `z` for zoom, in the modifier group that already holds every other
  // thing done to a pane.
  "pane.zoom": "Mod-Alt-z",
  "pane.swapLeft": "Mod-Alt-Shift-ArrowLeft",
  "pane.swapRight": "Mod-Alt-Shift-ArrowRight",
  "pane.swapUp": "Mod-Alt-Shift-ArrowUp",
  "pane.swapDown": "Mod-Alt-Shift-ArrowDown",
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
