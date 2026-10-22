// The command palette: Mod+K's surface and the keyboard that answers in it.
// Owns: `openPalette`/`closePalette`, the arrow-key lineage (`paletteKey`,
// `movePaletteSelection`, `runPaletteSelection`), the operations list
// (`paletteActions`) and the filtered render (`renderPaletteList`).
// Defers: what the rows can *do* — the shell's action arrangement, the macro
// names and the shared renderer — to the wiring object registered at boot;
// the row shapes to `panelrows.ts` (taxonomy) and the legal-here filter to
// `structure.ts`.
// Refuses: keeping a list of its own. Every row is the registry's or the
// structure's; a second list here would be a second opinion about what the
// product can do.

import * as runtime from "./runtime";
import * as structure from "./structure";
import * as commands from "./commands";
import * as panelrows from "./panelrows";
import { openPanel, closePanel } from "./panels";
import { keybindings } from "./keyhint";
import { getLang } from "./i18n";
import { docTextOf } from "./spans";

// ---------------------------------------------------------------- command palette
export function openPalette() {
  openPanel("palette");
}
export function closePalette() {
  closePanel("palette");
}
/**
 * Move the palette selection, and run the selected command.
 *
 * The palette styled its first row `.sel` but nothing ever moved it: you opened
 * it, typed to filter, and then had to reach for the mouse. A command palette
 * that needs the mouse defeats its own purpose.
 */
function movePaletteSelection(delta: number) {
  const rows = [...document.querySelectorAll<HTMLElement>("#palette-list .pal-item")];
  if (!rows.length) return;
  const cur = rows.findIndex((r) => r.classList.contains("sel"));
  const next = Math.min(rows.length - 1, Math.max(0, (cur < 0 ? 0 : cur) + delta));
  rows.forEach((r) => r.classList.remove("sel"));
  rows[next].classList.add("sel");
  rows[next].scrollIntoView({ block: "nearest" });
}

function runPaletteSelection() {
  const sel = document.querySelector<HTMLElement>("#palette-list .pal-item.sel");
  // With nothing selected (an empty result set) do nothing, rather than firing
  // whatever happens to be first.
  sel?.click();
}

/** Arrow keys / Enter for the palette input. Returns true if it handled the key. */
export function paletteKey(e: KeyboardEvent): boolean {
  switch (e.key) {
    case "ArrowDown":
      movePaletteSelection(1);
      return true;
    case "ArrowUp":
      movePaletteSelection(-1);
      return true;
    case "PageDown":
      movePaletteSelection(8);
      return true;
    case "PageUp":
      movePaletteSelection(-8);
      return true;
    case "Home":
      movePaletteSelection(-9999);
      return true;
    case "End":
      movePaletteSelection(9999);
      return true;
    case "Enter":
      runPaletteSelection();
      return true;
    case "Escape":
      closePalette();
      return true;
    default:
      return false;
  }
}

/**
 * The operations the palette offers, with the key that also runs them.
 *
 * **The palette used to contain no commands.** It read
 * `commands.available(runtime.commandsReg)` — the engine's *content* registry —
 * so typing "table" into Ctrl+K offered `#טבלה` and nothing else. Not "insert
 * row below", not "save", not "export PDF", not "record macro": none of the ~30
 * shell actions and none of the 43 structural operations appeared. The one
 * surface in the product labelled **Commands** was a symbol picker.
 *
 * Structural operations are filtered to the ones that apply where the caret is,
 * the same rule the ribbon and the hydra use. Offering "delete row" outside a
 * table and having it silently do nothing is how a palette teaches people not to
 * trust it.
 */
// The palette lists what the shell can run beyond the content registry: the
// shell action arrangement (`actions()`), the macro ids' names, and the shared
// list renderer (whose home is main.ts until its own wave). Rule 4 of the
// split: those arrive as one registered object; the registration is main's
// boot, exactly as `wireChrome` is for the chrome.

export interface PaletteWiring {
  /** The shell's run-list, to be named and keyed by the palette. */
  shellActions(): { id: string }[];
  /** What a macro's action id prints when the palette lists it. */
  macroName(id: string): string;
  /** Draw the assembled list into the palette's surface. */
  render(list: panelrows.PanelList): void;
}

let paletteWired: PaletteWiring | undefined;

/** Register the palette wiring. Called once, from main.ts's boot. */
export function wirePalette(w: PaletteWiring): void {
  paletteWired = w;
}

/** The wiring, registered at boot. */
export const paletteWiring = (): PaletteWiring => {
  if (!paletteWired) throw new Error("wirePalette was never called: the palette wiring is missing");
  return paletteWired;
};


function paletteActions(): { id: string; label: string; key: string }[] {
  const kb = keybindings();
  const doc = docTextOf(runtime.view.state.doc);
  const here = new Set(
    structure
      .availableAt(doc, runtime.view.state.selection.main.head)
      .filter((a) => a.enabled)
      .map((a) => a.action.id),
  );
  return panelrows.paletteActionsAt(paletteWiring().shellActions().map((a) => ({
    id: a.id,
    label: paletteWiring().macroName(a.id),
    key: kb[a.id] ?? "",
  })), here, (id) => !!structure.actionById(id));
}

export function renderPaletteList(q: string) {
  // Operations first, then the same command list the completions use — and both
  // caps reported rather than applied in silence. See `panelrows.paletteList`.
  paletteWiring().render(
    panelrows.paletteList(paletteActions(), commands.available(runtime.commandsReg), q, getLang()),
  );
}
