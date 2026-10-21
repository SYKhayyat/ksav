// The chord a surface shows beside an action: the writer's rebindings read
// from settings, then handed to the active mode's own answer.
//
// Owns: the two-step question and nothing else — `keybindings()` rebuilds
// the writer's table from settings on each read, `hintFor()` turns an
// action id into the readable chord under the mode that holds the keyboard,
// and `hintIsMode()` answers for callers whose class changes with it.
//
// Defers to `bindings.ts` for the table itself and the mode-aware hint, both
// pure there; `keymodes.ts` for which mode is on and what its commands
// are called; and `settings.ts` for the rebindings.
//
// Refuses to answer for drawing `<code>` cells (`keyCode` stays in
// main.ts — it builds a node, it does not answer a question) and for the
// shortcut editor, which writes the settings this module only reads.
import * as keymodes from "./keymodes";
import { keyHint, keybindingsFrom } from "./bindings";
import { settings } from "./settings";

/**
 * The writer's table as the settings have it, now.
 *
 * The keys themselves — the shipped table and the parser that overwrites it —
 * live in `bindings.ts` (B31, B36), and `tools/card.mjs` reads the bindings
 * there to generate the shortcut card, so the card cannot drift from the keys.
 * This is the read half: what the writer changed, rebuilt on each read, never
 * captured, because the Shortcuts editor and the settings write it between
 * two draws of any chord.
 */
export function keybindings(): Record<string, string> {
  return keybindingsFrom(settings.keybindings);
}

/**
 * The key to print beside an action — or, under a mode, the way to reach it.
 *
 * Every surface that shows a chord goes through here, and `prohibitions.test.mjs`
 * holds it that way: `readable(keybindings()…)` at a twenty-first call site
 * would print a chord that `buildShortcutKeymap` has just refused to install.
 * The rule itself is `bindings.keyHint`, where it is pure and testable; this is
 * the shell's half — which mode is on, and what this action is called in it.
 */
export function hintFor(id: string, kb: Record<string, string> = keybindings()): string {
  return keyHint(kb[id] ?? "", keymodes.activeMode(), keymodes.commandName(id));
}

/** Whether what `hintFor` returns is a mode's name rather than a chord. */
export function hintIsMode(): boolean {
  return keymodes.activeMode() !== "default";
}
