// Hydras: a transient keymap with its own legend on screen.
//
// Emacs's `hydra` package, and the right shape for this product. A ribbon is
// discoverable and slow — mouse to the strip, click, come back. A shortcut is
// fast and invisible. A hydra is both: one key opens a panel that *shows* every
// operation available where the caret is, each key stays live so five row
// insertions are `t r r r r r`, and Escape leaves.
//
// It is generated from `structure.ts`, like everything else, and that is the
// whole design. A hand-written list of hydra keys would be a second place to
// forget an operation, which is precisely the failure this codebase keeps
// producing: something built, and then not reachable from the surface a person
// actually uses.
//
// Keys are assigned deterministically from each action's own id, so a new
// operation gets a key the day it is written, and the key never moves under a
// writer's fingers because the list happened to grow.

import { STRUCTURE_ACTIONS } from "./structure";
import type { Structure, StructureAction } from "./structure";

export interface HydraEntry {
  /** The key as generated from the action's own id — a Latin letter. */
  key: string;
  /**
   * The same operation's key on a Hebrew keyboard.
   *
   * The hydra keys are `a s b d i o m v u n h`, in a Hebrew interface, for a
   * writer who is by definition typing Hebrew. Press `a` on a Hebrew layout and
   * the operating system sends `ש`: the panel is showing a key the keyboard
   * cannot produce. So every entry carries both, the legend shows whichever the
   * interface language calls for, and `entryFor` answers to either — a writer
   * switching layouts mid-sentence (which is the normal case in a bilingual
   * document) never finds the hydra has stopped listening.
   *
   * Positional rather than mnemonic: the ids are Latin words, so there is no
   * Hebrew initial to take, and inventing one per action would be a second list
   * to forget an operation in. Registry order, so it is deterministic and stable
   * for exactly the same reason the Latin keys are.
   */
  he: string;
  action: StructureAction;
}

/** The Hebrew alphabet, in order, as hydra keys. */
const HEBREW_KEYS = "אבגדהוזחטיכלמנסעפצקרשתםןץףך";

export interface Hydra {
  structure: Structure;
  entries: HydraEntry[];
}

/**
 * The letters an action would like, best first.
 *
 * Taken from the id's own words — `table.rowBelow` offers r, b, o, w… — so the
 * key has a reason a writer can feel even before they have learned it. Digits
 * come last, and only for the levels, where a digit *is* the natural key.
 */
function preferences(action: StructureAction): string[] {
  const tail = action.id.slice(action.id.indexOf(".") + 1);
  const out: string[] = [];
  const push = (c: string) => {
    const k = c.toLowerCase();
    if (/[a-z0-9]/.test(k) && !out.includes(k)) out.push(k);
  };
  // A level action is its own number: `heading.level7` should be `7`, not `l`.
  const digits = /(\d+)$/.exec(tail);
  if (digits) for (const d of digits[1]) push(d);
  // Then the initial of each word in the id — rowBelow gives r, then b.
  for (const word of tail.split(/(?=[A-Z])/)) push(word[0] ?? "");
  // Then every remaining letter of the name, in order.
  for (const c of tail) push(c);
  // And finally the whole alphabet, so an operation whose every letter is
  // already spoken for still gets *a* key. `table.delete` reached this: d, e, l,
  // t and the rest were all taken by the seventeen operations declared before
  // it, and it came out of the generator keyless — an operation in the registry,
  // in the ribbon, in the menu, and unreachable from its own hydra. Which is the
  // exact bug this whole architecture exists to make impossible, reproduced by
  // the mechanism meant to prevent it.
  for (const c of "abcdefghijklmnopqrstuvwxyz0123456789") push(c);
  return out;
}

/**
 * Assign one key per action, deterministically.
 *
 * Order matters and is the registry's own: an operation added later never
 * displaces the key of one that was already there, so a writer's fingers keep
 * working across releases. Anything that cannot get a letter falls through to
 * the digits, and then simply has no key rather than stealing one.
 */
export function assignKeys(
  actions: StructureAction[],
  overrides: Record<string, string> = {},
): HydraEntry[] {
  const taken = new Set<string>();
  // A writer's own choices are placed first and win outright — the same rule as
  // the main keymap, where a rebinding displaces the default rather than
  // queueing behind it.
  for (const a of actions) {
    const want = overrides[a.id];
    if (want && !taken.has(want)) taken.add(want);
  }
  const out: HydraEntry[] = [];
  for (const action of actions) {
    const he = HEBREW_KEYS[out.length] ?? "";
    const want = overrides[action.id];
    if (want) {
      out.push({ key: want, he, action });
      continue;
    }
    const key = preferences(action).find((k) => !taken.has(k));
    if (!key) continue; // no key rather than a stolen one
    taken.add(key);
    out.push({ key, he, action });
  }
  return out;
}

/** The hydra for one kind of structure. */
export function hydraFor(
  structure: Structure,
  overrides: Record<string, string> = {},
): Hydra {
  return {
    structure,
    entries: assignKeys(
      STRUCTURE_ACTIONS.filter((a) => a.structure === structure),
      overrides,
    ),
  };
}

/** Every hydra, in registry order. */
export function allHydras(overrides: Record<string, string> = {}): Hydra[] {
  const kinds: Structure[] = [];
  for (const a of STRUCTURE_ACTIONS) if (!kinds.includes(a.structure)) kinds.push(a.structure);
  return kinds.map((k) => hydraFor(k, overrides));
}

/**
 * The entry a keystroke selects, if any — in either alphabet.
 *
 * Both, always, whatever the interface language says: the legend has to pick
 * one to show, but refusing the other would mean a writer who switched layouts
 * to type a Latin word found the panel deaf.
 */
export function entryFor(hydra: Hydra, key: string): HydraEntry | undefined {
  const k = key.toLowerCase();
  return hydra.entries.find((e) => e.key === k || (e.he && e.he === key));
}

/**
 * Operations after which the hydra should close.
 *
 * Almost nothing: staying open is the point, and `t r r r` inserting four rows
 * is the behaviour that makes a hydra worth having over a menu. The exceptions
 * are the ones that destroy the thing the hydra is about — after deleting the
 * table there is no table to keep operating on, and a panel still offering
 * "merge cells" would be lying.
 */
export function closesAfter(action: StructureAction): boolean {
  return action.id === "table.delete" || action.id === "heading.delete";
}
