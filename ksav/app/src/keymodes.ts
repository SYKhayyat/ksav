// Vim and Emacs editing, for the people who cannot type without them.
//
// Genuine implementations, not a handful of rebindings: `@replit/codemirror-vim`
// is the CodeMirror 5 vim mode carried forward — operators, motions, text
// objects, counts, registers, macros, marks, `:` commands — and
// `@replit/codemirror-emacs` is the same for the kill ring, the mark, prefix
// arguments and the M-x commands. Writing either by hand would take months and
// be worse in every particular; the interesting engineering here is not the mode
// but the three places it meets this application.
//
// **Loaded on demand.** Both packages together are around a quarter of a
// megabyte, and they are wanted by a small minority of writers. A dynamic import
// keeps them out of the bundle everyone else downloads, at the cost of the mode
// arriving a frame or two after it is switched on.
//
// **The mode wins because Ksav stands down, not because it out-ranks anything.**
//
// This used to rest on a tie-break. Both keymaps were installed at
// `Prec.highest` and the mode's was placed first in the extension array, under a
// comment explaining that CodeMirror breaks that tie by array order. It does —
// and the arrangement still failed, in the way a tie-break fails: **Emacs mode
// did nothing at all in the production build.** Driven at the keyboard against
// `vite preview`, `C-k` killed nothing and `Ctrl+K` opened Ksav's command
// palette; the *same page* switched to Vim worked, because
// `@replit/codemirror-vim` handles keys from a ViewPlugin DOM handler and never
// enters the contest. Emacs uses the keymap facet, tied, and lost. On the dev
// server the same array order gave the opposite answer, and why has never been
// established.
//
// It does not need to be. A promise that rests on a tie is a promise that will
// be broken again by the next thing that reorders anything, and the honest fix
// is to leave nothing to break: while a mode is on, `buildShortcutKeymap` in the
// shell returns **no bindings at all**. There is no contest, in any build, on
// any machine — Ksav's keys are simply not installed.
//
// That is also the design the inventory asked for in its own words: *"the mode's
// keys on and Ksav's own off — a full takeover, not only on collisions."* Every
// one of Ksav's 113 actions is still reachable, and by the route the mode's own
// users already know: as a `:` command in Vim and under `M-x` in Emacs, both
// generated from the same registry the palette and the menus read. See
// `registerCommands` below. Somebody who turns Emacs mode on has asked for
// Emacs, and gets it without losing a single door.
//
// **Saving** keeps its own idiom on top of that: **C-x C-s** in Emacs and **:w**
// in Vim, both registered below, so the key a mode's user was going to press
// anyway is the one that works.
//
// **Direction.** Neither mode is told about RTL, and neither needs to be: their
// motions are *logical*, so `l` and C-f move forward through the text, which in
// a Hebrew document is leftward on screen. That is what vim does in an RTL
// terminal too.

import { Compartment, Prec } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type EditingMode = "default" | "vim" | "emacs";

export const MODES: EditingMode[] = ["default", "vim", "emacs"];

/** Whether a stored value names a mode this build knows. */
export function isMode(value: unknown): value is EditingMode {
  return typeof value === "string" && (MODES as string[]).includes(value);
}

export const modeCompartment = new Compartment();

/** The plain-editing extension: no mode, and the thing a failed load returns. */
const EMPTY: Extension = [];

/** Modes already fetched, so switching back is instant and costs no network. */
const loaded = new Map<EditingMode, Extension>();

/**
 * The mode that is actually installed and answering keys.
 *
 * Not the setting. `buildShortcutKeymap` reads this to decide whether to install
 * Ksav's own bindings at all, so it has to mean "a mode is really here" — a
 * writer who is offline, picks Vim, and gets a failed fetch must keep the
 * shortcuts they had. See `applyMode`.
 */
let active: EditingMode = "default";
export function activeMode(): EditingMode {
  return active;
}

/** What the last load failed with, for the settings note to be honest about. */
let lastError: string | null = null;
export function loadError(): string | null {
  return lastError;
}

/**
 * What the shell lends the modes.
 *
 * Installed rather than imported, so this module stays free of the rest of the
 * application — and so every route below is the *same* one the toolbar, the
 * palette and the keyboard use, rather than a second one that will one day
 * forget to flush something.
 */
export interface ModeBridge {
  /** Every action id the application has, now — macros recorded this session included. */
  commands: () => string[];
  /** Run one, through `runAction`, which is what the macro recorder watches. */
  run: (id: string) => void;
  /** Ksav's own command prompt. What `M-x` is bound to; see `registerCommands`. */
  prompt: () => void;
  /** Save. `:w` and `C-x C-s` both come here. */
  save: () => void;
}

let bridge: ModeBridge = {
  commands: () => [],
  run: () => {},
  prompt: () => {},
  save: () => {},
};

export function setBridge(b: ModeBridge): void {
  bridge = b;
  // Now, not when a mode is first loaded.
  //
  // Otherwise the clash list is empty until somebody switches to Vim, and the
  // test asserting it is empty passes by never having looked — a check that
  // cannot fail, which is the shape `skips.test.mjs` exists to forbid.
  clashes = clashingNames(b.commands());
}

/**
 * An action id as a `:` command or an `M-x` name.
 *
 * Lowercase letters and digits only. Vim's ex parser reads a command name as a
 * run of word characters, so `table.rowBelow` would be read as `table` and the
 * rest thrown away — silently running the wrong command, which is worse than
 * running none.
 */
export const commandName = (id: string): string => id.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Two action ids that would answer to the same `:` command.
 *
 * Recorded rather than resolved, because there is no honest way to resolve it
 * here: whichever registered last would win and the other id would be
 * unreachable under a name that looks like it works. `keymodes.test.mjs` holds
 * this empty, so a new action whose id collides with an existing one turns the
 * suite red with both names in the message.
 */
let clashes: [string, string][] = [];
export function nameClashes(): [string, string][] {
  return clashes;
}

/** Which ids would answer to the same name. Pure, so it can be held to it. */
export function clashingNames(ids: readonly string[]): [string, string][] {
  const taken = new Map<string, string>();
  const out: [string, string][] = [];
  for (const id of ids) {
    const name = commandName(id);
    if (!name) continue;
    const already = taken.get(name);
    if (already) out.push([already, id]);
    else taken.set(name, id);
  }
  return out;
}

/**
 * Every command in the registry, as a `:` command and as `M-x`.
 *
 * Generated from the registry rather than listed, which is the whole reason a
 * full takeover is affordable: Ksav's own keymap standing down would otherwise
 * cost a writer the doors to 113 commands and give nothing back.
 *
 * `M-x` itself is bound to **Ksav's command palette** rather than to the emacs
 * package's own minibuffer, and that is a decision rather than a shortcut. M-x
 * is a prompt over the command list; this application already has one, with the
 * same list, fuzzy matching, the key each command answers to and a description
 * beside it. Building a second, worse prompt so that it could be spelled the
 * same way would be the costume this file's opening paragraph refuses.
 */
function registerCommands(register: (name: string, id: string) => void): void {
  const ids = bridge.commands();
  clashes = clashingNames(ids);
  // The losers of a clash are skipped rather than allowed to overwrite: a name
  // that runs the wrong command is worse than one that runs none, and
  // `nameClashes()` says which pair to go and rename.
  const lost = new Set(clashes.map(([, id]) => id));
  const done = new Set<string>();
  for (const id of ids) {
    const name = commandName(id);
    if (!name || lost.has(id) || done.has(name)) continue;
    done.add(name);
    register(name, id);
  }
}

/**
 * The extension for a mode, fetching the package the first time it is asked for.
 *
 * Returns the plain-editing extension (nothing) when the fetch fails, rather
 * than throwing: a writer who is offline and picks Vim should get an editor that
 * still works and a note saying why the mode did not arrive — not a dead
 * editor. The failure is recorded rather than swallowed.
 */
export async function extensionFor(mode: EditingMode): Promise<Extension> {
  lastError = null;
  if (mode === "default") return EMPTY;
  const already = loaded.get(mode);
  if (already) return already;
  try {
    if (mode === "vim") {
      const { vim, Vim } = await import("@replit/codemirror-vim");
      // `:w` and `:wq`. Vim mode takes Ctrl+S along with everything else, and
      // this is the key a vim user was going to press anyway.
      Vim.defineEx("write", "w", () => bridge.save());
      Vim.defineEx("wq", "wq", () => bridge.save());
      Vim.defineEx("xit", "x", () => bridge.save());
      // Every action, as `:name`. The prefix is the whole name rather than an
      // abbreviation: `defineEx`'s second argument is the shortest unambiguous
      // prefix, and inventing 113 of those by hand is how two of them end up the
      // same and one command becomes unreachable.
      registerCommands((name, id) => Vim.defineEx(name, name, () => bridge.run(id)));
      // And the palette, for the same reason `M-x` opens it in Emacs mode.
      Vim.defineEx("ksav", "ksav", () => bridge.prompt());
      // `status: true` is the `-- INSERT --` line. Without it a modal editor
      // gives no indication of which mode it is in, which is the single most
      // disorienting thing modal editing can do to somebody.
      loaded.set(mode, Prec.highest(vim({ status: true })));
    } else {
      const { emacs, EmacsHandler } = await import("@replit/codemirror-emacs");
      EmacsHandler.addCommands({
        ksavSave: { exec: () => bridge.save() },
        ksavPrompt: { exec: () => bridge.prompt() },
      });
      EmacsHandler.bindKey("C-x C-s", "ksavSave");
      // The package binds `M-x` to its own `focusCommandLine`. Ksav's palette is
      // the better prompt over the same list — see `registerCommands`.
      EmacsHandler.bindKey("M-x", "ksavPrompt");
      registerCommands((name, id) => {
        EmacsHandler.addCommands({ [name]: { exec: () => bridge.run(id) } });
      });
      loaded.set(mode, Prec.highest(emacs()));
    }
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    return EMPTY;
  }
  return loaded.get(mode) ?? EMPTY;
}

/**
 * Switch the editor into a mode.
 *
 * Awaits the import before dispatching, so the editor never spends a frame in a
 * half-configured state — reconfiguring to nothing and then to the mode would
 * drop a keystroke typed in between, and in a modal editor a dropped keystroke
 * is not a lost character but a command that silently did something else.
 */
export async function applyMode(view: EditorView | undefined, mode: EditingMode): Promise<void> {
  if (!view) return;
  const extension = await extensionFor(mode);
  // What actually arrived, which is not always what was asked for: a mode whose
  // package could not be fetched returns the plain-editing extension, and
  // `loadError()` says why. Recording the request rather than the outcome would
  // stand Ksav's own keys down in favour of a mode that is not there — an editor
  // with no bindings at all, which is the one failure worse than the one this
  // whole section is about.
  active = extension === EMPTY || (Array.isArray(extension) && extension.length === 0)
    ? "default"
    : mode;
  view.dispatch({ effects: modeCompartment.reconfigure(extension) });
}
