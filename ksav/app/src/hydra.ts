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

import { STRUCTURE_ACTIONS, structureAt, isEnabled } from "./structure";
import { makeWiring } from "./wiring";
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
const HYDRA_KINDS: Structure[] = ["list", "table", "heading"];
export function allHydras(overrides: Record<string, string> = {}): Hydra[] {
  // The registry's kinds, not `STRUCTURE_ACTIONS`' union: a note body carries
  // one operation, and a hydra of one — when the operation already holds its own
  // key — is a second route answering slower than the direct one. `hydra.test.mjs`
  // pins this list so the accidental adding of a kind does not arrive silently.
  return HYDRA_KINDS.map((k) => hydraFor(k, overrides));
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


// # The panel half
//
// The transient keymap above is the whole mechanism; the half below is its one
// legend on screen and the keys it listens to while open. It sits in the same
// file because the legend's rows, the capture's entries and the module's own
// kinds contract are one vocabulary — a pinned-legend test reading two files
// would assert an adjacency nothing maintains.
//
// Owns: the open-hydra state, the render, the capture listener, the reset the
// panel's close hook runs. Defers: what a structural operation does when a key
// fires (the shell's runStructureAction, via the wiring) and the panel system's
// own hook registration (main's boot wires "hydra"'s close through resetHydra).
// Refuses: a hydra that stays open after its structure is gone — seen from the
// hook, and by the chrome wiring's dismiss-foreign gate.

import { el } from "./dom";
import { t, getLang } from "./i18n";
import * as settings from "./settings";
import { setStatus } from "./runtime";
import * as runtime from "./runtime";
import { openPanel, closePanel, panelHead } from "./panels";
import { docTextOf } from "./spans";

export interface HydraWiring {
  /** Perform the structural operation, wherever the caret is. */
  runStructure(action: StructureAction, sticky: boolean): boolean;
}

const Hydra = makeWiring<HydraWiring>("wireHydra");
export const wireHydra = Hydra.wire;
const hydraWiring = Hydra.get;

// ---------------------------------------------------------------- hydra
//
// One key opens a panel listing every operation available where the caret is,
// each on a single letter, and the panel stays up so repeating is one keystroke.
// Escape or `q` leaves. It is a third view over `STRUCTURE_ACTIONS` — not a
// third list — so an operation added to the registry appears here the same day.

let openHydraState: Hydra | null = null;

/** Whatever the caret is in, opened as a hydra. */
export function openHydra() {
  if (!runtime.view) return;
  const doc = docTextOf(runtime.view.state.doc);
  const pos = runtime.view.state.selection.main.head;
  const kind = structureAt(doc, pos);
  if (!kind) {
    setStatus(t("hydraNothingHere"), "");
    return;
  }
  openHydraState = hydraFor(kind, settings.settings.hydraKeys ?? {});
  // Capture phase, on `window`, so the hydra genuinely gets the key before the
  // vim and emacs plugins do. See `captureHydraKeys` for why no arrangement of
  // the editor's extensions could achieve that. Removed by the panel's own
  // `close` hook, which is the one path every way of closing goes through —
  // the ×, the backdrop, Escape, and `closePanel` alike.
  window.addEventListener("keydown", captureHydraKeys, true);
  renderHydra();
}

export function closeHydra() {
  closePanel("hydra");
}

export function renderHydra() {
  const panel = document.getElementById("hydra")!;
  const h = openHydraState;
  if (!h) return;
  const doc = docTextOf(runtime.view.state.doc);
  const pos = runtime.view.state.selection.main.head;

  let group = "";
  const cells: Node[] = [];
  for (const entry of h.entries) {
    if (group && entry.action.group !== group) cells.push(el("span", { class: "hydra-break" }));
    group = entry.action.group;
    // Greyed rather than hidden, for the same reason the menus grey: a hydra
    // whose contents shuffle between openings is one nobody memorises.
    const enabled = isEnabled(entry.action, doc, pos);
    cells.push(
      el("button", {
        class: "hydra-key" + (enabled ? "" : " disabled"),
        disabled: enabled ? null : "true",
        onClick: () => runHydraEntry(entry),
      }, [
        // The key the writer's own keyboard can actually produce. On a Hebrew
        // layout the physical `a` sends `ש`, so a Hebrew-interface hydra
        // labelled `a s b d i o m v u n h` was showing eleven keys none of which
        // existed. Both alphabets are accepted either way (see `entryFor`); this
        // only decides which one to print.
        el("kbd", {}, [getLang() === "he" && entry.he ? entry.he : entry.key]),
        el("span", {}, [t(entry.action.label)]),
      ]),
    );
  }
  // A visible exit as well as Escape and `q`. The rule this codebase learned the
  // hard way: a surface that takes over the keyboard and can only be dismissed
  // by a key you have to already know is a surface people get stuck in. The head
  // is built by `panelHead` like every other, which is also what put the hydra
  // into the Escape sweep it had been missing from.
  const head = panelHead("hydra", "structure." + h.structure, {
    level: "h3",
    cls: "hydra-head",
    extra: [el("span", {}, [t("hydraHint")]), el("div", { class: "spacer" })],
  });
  panel.replaceChildren(head, el("div", { class: "hydra-keys" }, cells));
  openPanel("hydra");
}

export function runHydraEntry(entry: HydraEntry) {
  // The hydra is opened by a chord and driven by a pointer-free keyboard, but
  // it is offered from the same sticky reading the ribbon uses, so it acts on
  // the same structure the writer can see listed.
  const ran = hydraWiring().runStructure(entry.action, true);
  if (!ran) return;
  if (closesAfter(entry.action)) {
    closeHydra();
    return;
  }
  // Still open, and redrawn: what is possible changes as the document does —
  // after deleting the second-to-last row, "delete row" has to grey out.
  requestAnimationFrame(renderHydra);
}

/**
 * The hydra's keys, while it is open — on `window`, in the capture phase.
 *
 * Swallowing every plain letter, because a transient keymap that let `r`
 * through to the document would type an `r` into the table it was meant to add
 * a row to. That much was always true. What was not true was *where* it sat.
 *
 * This was a `Prec.highest(keymap.of(…))` entry in the editor's extensions,
 * under a comment saying it was ahead of the vim and emacs keymaps. Driven in a
 * browser with vim mode on, it was not: open a list hydra, press the `a` its own
 * legend offers for "new item", and vim goes to INSERT instead. Press `b` and
 * the caret moves back a word, leaves the list, and the structure watch closes
 * the panel — eleven operations on screen with their keys beside them, and not
 * one of them doing what it said. Escape did not close it either; vim took that
 * to leave visual mode.
 *
 * No place in that array would have fixed it. `@replit/codemirror-vim` handles
 * keys from a **ViewPlugin event handler** (`vimPlugin`'s `keydown`), and a
 * plugin's DOM handlers run ahead of the whole `keymap` facet whatever its
 * precedence. Precedence orders facet inputs against each other; it does not
 * order a facet against a plugin.
 *
 * So the listener goes where being first is a property of the DOM rather than a
 * hope about a library: `window`, capture phase, above the content element every
 * one of those handlers is attached to. Installed when a hydra opens and removed
 * when it closes, so there is nothing listening the rest of the time — which
 * also means a mode gets every key exactly as it did before, because this is not
 * there to be got past.
 */
export function captureHydraKeys(event: KeyboardEvent) {
  if (!openHydraState) return;
  const stop = () => {
    event.preventDefault();
    event.stopPropagation();
    // `stopImmediatePropagation` as well: the point is that nothing else on the
    // way down or back up sees this key, and vim's handler is on a descendant.
    event.stopImmediatePropagation();
  };
  if (event.key === "Escape" || event.key === "q") {
    stop();
    closeHydra();
    return;
  }
  // Let modified keys through: Mod-S while a hydra is up should still save.
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // Tab, Enter, the arrows: not hydra keys, and swallowing them would trap the
  // keyboard in a panel whose own × is reachable by Tab.
  if (event.key.length !== 1) return;
  const entry = entryFor(openHydraState, event.key);
  stop(); // swallowed either way: an unbound letter must not be typed
  if (entry) runHydraEntry(entry);
}

/** The panel-close hook: forgotten state and no listener left behind. */
export function resetHydra(): void {
  openHydraState = null;
  // Paired with `openHydra`'s `addEventListener`, deliberately here rather than
  // in `closeHydra`: this hook is what *every* way of closing the panel runs
  // through — the ×, the backdrop, the Escape sweep and `closePanel` — so a
  // capture listener on `window` cannot outlive the panel that installed it
  // down some path nobody thought about.
  window.removeEventListener("keydown", captureHydraKeys, true);
  runtime.view?.focus();
}

/** A new structure arrived under the caret; a foreign hydra must not outlive it. */
export function dismissForeignHydra(structure: string | null): void {
  if (!openHydraState) return;
  if (structure !== openHydraState.structure) closeHydra();
}
