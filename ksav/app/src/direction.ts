// Which direction a surface reads in — the two answers that were one (#122).
//
// # The finding
//
// The page's root element took its `dir` from the **document**:
//
//     document.documentElement.dir = docConfig().dir;
//
// which was added to fix a real complaint — the caret in a Hebrew document
// behaved badly when the interface was English. The fix reached for the only
// element that was certain to be an ancestor of the editor and changed the
// direction of the entire page instead: an English interface with a Hebrew
// document rendered right-to-left, drawers and menus included, and the physical
// pane layout (which `styles.css` deliberately keeps left-to-right so that
// "preview on the right" means the right of the screen) started mirroring.
//
// The two directions are not the same question and never were:
//
//   - the **interface** reads in the interface language's direction. That is
//     `i18n.ts`'s `isRtlUi()`, and it decides the chrome: menus, drawers,
//     labels, the settings panel.
//   - the **text** reads in the document's direction. That is `docConfig().dir`,
//     and it belongs on the surfaces that carry text: the editor's content
//     element (`main.ts`'s `dirCompartment`, `EditorView.contentAttributes`),
//     the bidi support, and each preview pane (`preview.ts`'s `applyPreview`).
//
// A Hebrew document in an English interface is a normal thing to have — it is
// most of this product's use — and so is an English document in a Hebrew
// interface. Only the second was reachable, and only by accident.
//
// The caret fix survives this: the editor was already being told the document's
// direction twice (`contentAttributes.of({ dir })` on the content element and
// `bidiSupport` reading the same config), so the root's direction was never
// what made it work.

/** The direction of the page's root element — the interface's, never a document's. */
export function rootDir(rtlUi: boolean): "rtl" | "ltr" {
  return rtlUi ? "rtl" : "ltr";
}

/**
 * The direction a text surface carrying this document gets.
 *
 * Anything that is not exactly `"ltr"` reads right-to-left, which is the
 * engine's shipped default and the product's: a Hebrew writing instrument with
 * no configuration is an RTL document.
 */
export function textDir(configDir: string | undefined | null): "rtl" | "ltr" {
  return configDir === "ltr" ? "ltr" : "rtl";
}
