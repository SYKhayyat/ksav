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
// **Precedence — the mode wins.** It is installed above Ksav's own shortcut
// keymap, which means five of Ksav's bindings stop working while Emacs mode is
// on: C-s, C-o, C-k, C-y and C-u belong to isearch, open-line, kill-line, yank
// and the universal argument. That is a decision, and the alternative was
// considered and rejected: leaving Ksav's shortcuts on top keeps Ctrl+S saving,
// but C-k and C-y are *the* kill-and-yank pair, and an Emacs mode without them
// is precisely the costume this was asked not to be. Somebody who turns Emacs
// mode on has asked for Emacs.
//
// What replaces them is what an Emacs or Vim user would actually reach for:
// **C-x C-s** saves in Emacs mode and **:w** saves in Vim mode, both registered
// below. Nothing becomes unreachable — every one of those actions is also in a
// menu — and the mode's own idiom is honoured rather than approximated.
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

/** Modes already fetched, so switching back is instant and costs no network. */
const loaded = new Map<EditingMode, Extension>();

/** What the last load failed with, for the settings note to be honest about. */
let lastError: string | null = null;
export function loadError(): string | null {
  return lastError;
}

/**
 * What each mode's own "save this file" command should do.
 *
 * Installed by the shell rather than imported, so this module stays free of the
 * rest of the application — and so the save path is the *same* one the toolbar
 * and Ctrl+S use, rather than a second one that will one day forget to flush
 * something.
 */
let onSave: () => void = () => {};
export function setSaveCommand(fn: () => void): void {
  onSave = fn;
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
  if (mode === "default") return [];
  const already = loaded.get(mode);
  if (already) return already;
  try {
    if (mode === "vim") {
      const { vim, Vim } = await import("@replit/codemirror-vim");
      // `:w` and `:wq`. Vim mode takes Ctrl+S along with everything else, and
      // this is the key a vim user was going to press anyway.
      Vim.defineEx("write", "w", () => onSave());
      Vim.defineEx("wq", "wq", () => onSave());
      Vim.defineEx("xit", "x", () => onSave());
      // `status: true` is the `-- INSERT --` line. Without it a modal editor
      // gives no indication of which mode it is in, which is the single most
      // disorienting thing modal editing can do to somebody.
      loaded.set(mode, Prec.highest(vim({ status: true })));
    } else {
      const { emacs, EmacsHandler } = await import("@replit/codemirror-emacs");
      EmacsHandler.addCommands({
        ksavSave: { exec: () => onSave() },
      });
      EmacsHandler.bindKey("C-x C-s", "ksavSave");
      loaded.set(mode, Prec.highest(emacs()));
    }
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    return [];
  }
  return loaded.get(mode) ?? [];
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
  view.dispatch({ effects: modeCompartment.reconfigure(extension) });
}
