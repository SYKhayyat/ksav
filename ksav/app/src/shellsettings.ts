// The `shell` settings (#233, step 3; `docs/ui-architecture.md` §7).
//
// What the writer can change about the furniture: which of the three shells is
// drawn, whether the tabs variant folds the menu bar into `☰ תפריט`, which tab
// the toolbar variant pins, how buttons are labelled, and whether the contextual
// tabs appear. Every one of them changes the *view* of one action list; none of
// them changes what an action is or which key runs it (§7: "the keyboard map is
// the same under every setting").
//
// # Why a leaf
//
// `settings.ts` reads its stored blob at module scope, and the reader below runs
// inside that read. A module it imported that imported it back would be
// evaluated with `settings.ts` half-built, and a `const` here would be in its
// temporal dead zone when `loadSettings` reached it — the exact failure
// `loadSettings`'s doc comment records ("no preference has ever survived a
// reload"). So this file imports nothing at all, and the boot fence in
// `test/shellsettings.test.mjs` holds it to that.

/** The three shells. `menus` is the floor; `toolbar` adds one row; `tabs` is the ribbon. */
export type ShellVariant = "menus" | "toolbar" | "tabs";

export interface ShellSettings {
  /** Which shell is drawn. */
  variant: ShellVariant;
  /** The tabs variant: `auto` folds the menu bar into `☰ תפריט`, `always` keeps it. */
  menubar: "auto" | "always";
  /** The tab the toolbar variant pins. An unknown id falls back to Home where it is drawn. */
  toolbarTab: string;
  /** A button always has its name; this says whether its glyph sits beside it. */
  labels: "names" | "names+glyphs";
  /** The table and notes tabs that appear while the caret stands in one. */
  contextual: boolean;
}

export const SHELL_VARIANTS: readonly ShellVariant[] = ["menus", "toolbar", "tabs"];

export const SHELL_DEFAULTS: Readonly<ShellSettings> = {
  variant: "toolbar",
  menubar: "auto",
  toolbarTab: "home",
  labels: "names+glyphs",
  contextual: true,
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * The stored `shell` value, made whole.
 *
 * Field by field, so one hand-edited or out-of-date field costs that field and
 * not the rest: a blob that says `variant: "tabs"` and `labels: 7` keeps its
 * tabs. Anything that is not an object is the defaults.
 */
export function readShell(raw: unknown): ShellSettings {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    variant: pick(r.variant, SHELL_VARIANTS, SHELL_DEFAULTS.variant),
    menubar: pick(r.menubar, ["auto", "always"] as const, SHELL_DEFAULTS.menubar),
    toolbarTab:
      typeof r.toolbarTab === "string" && /^[a-z]+$/.test(r.toolbarTab) ? r.toolbarTab : SHELL_DEFAULTS.toolbarTab,
    labels: pick(r.labels, ["names", "names+glyphs"] as const, SHELL_DEFAULTS.labels),
    contextual: typeof r.contextual === "boolean" ? r.contextual : SHELL_DEFAULTS.contextual,
  };
}
