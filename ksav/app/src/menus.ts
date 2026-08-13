// Which menu a command belongs in — one table, and a rule behind it.
//
// # The finding
//
// The Insert menu was every category the registry publishes, in registry order,
// with no statement anywhere about why. So Insert held bold, italic, underline,
// strikethrough, superscript, letter spacing, three alignments and two direction
// runs: eighteen ways to change text that is already written, in the menu named
// for putting something new into the document. The inventory's line was exactly
// that — *"Insert holds a great deal that is not insertion — bold, alignment.
// The menu taxonomy needs revisiting"* — and the reason it had never been
// revisited is that there was nothing to revise. A menu built by iterating a
// registry has no taxonomy to be wrong; it has an accident.
//
// # The rule
//
// **Insert puts something new on the page. Format changes text that is already
// there.** Everything else follows from that one sentence:
//
//   - `#הדגשה` needs a word to make bold, and `#מרכז` needs a paragraph to
//     centre. Neither adds anything the page did not have. They are Format.
//   - `#רשימה`, `#הערה`, `#תמונה`, `#מעבר_עמוד` and `#נוסחה` all put something
//     on the page that was not there. They are Insert.
//   - Tables have their own menu, because a table brings twenty operations of
//     its own with it and they need somewhere to be.
//
// It is Word's split, which matters less than it sounds: the point is not that
// Word is right, it is that a writer arriving from Word already holds one
// answer to *"where would that be?"*, and disagreeing with it costs them the
// only guess they have.
//
// # Why a table and not a field on the command
//
// The category is the engine's — it is what a command *is about*, and it feeds
// the palette's chip, the help page's sections and the completion list, none of
// which are menus. Where a category is *shown* is the client's question, and
// putting the answer in `commands.rs` would be the engine deciding the shape of
// a menubar it has never seen.
//
// The fallback is deliberate and it is the safe direction: a category nobody
// has placed goes to Insert rather than nowhere. A command that turns up in the
// wrong menu is a nuisance; a command that turns up in no menu is a feature the
// writer cannot find and has no way to know exists — which is the mute-surface
// family this repository has spent its history on. `menus.test.mjs` still fails
// the build for an unplaced category, so the fallback is a floor and never a
// habit.

/** The menubar menus that show registry commands. */
export type MenuId = "insert" | "format" | "table";

/**
 * Registry category → the menu that shows it.
 *
 * Keyed by the engine's category strings. Checked against the registry itself
 * by `menus.test.mjs`, in both directions: a category with no placement fails,
 * and a placement naming a category the engine does not publish fails too —
 * because a stale row here is a menu quietly missing a section.
 */
export const MENU_OF: Readonly<Record<string, MenuId>> = {
  // ---- Format: it changes what is written ----
  style: "format",
  align: "format",

  // ---- Table: it brings its own twenty operations ----
  table: "table",

  // ---- Insert: it puts something on the page ----
  heading: "insert",
  list: "insert",
  footnote: "insert",
  block: "insert",
  layout: "insert",
  torah: "insert",
  reference: "insert",
  review: "insert",
  math: "insert",
  image: "insert",
};

/** Where this category is shown. Unplaced categories go to Insert; see above. */
export function menuOf(category: string): MenuId {
  return MENU_OF[category] ?? "insert";
}

/**
 * The categories one menu shows, in the order the registry declares them.
 *
 * The order is the engine's on purpose. A menu that sorted its own sections
 * would be a second opinion about which command a writer reaches for first, and
 * the registry's order is already that opinion — it is what the palette, the
 * completions and the help page all present.
 */
export function categoriesIn(menu: MenuId, categories: readonly string[]): string[] {
  return categories.filter((c) => menuOf(c) === menu);
}
