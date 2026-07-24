// Escaping user text into Typst markup, for the panels that generate calls.
//
// The engine is careful about this — `typst_str` in `engine/src/lib.rs` doubles
// the backslash before escaping the quote, with a test pinning that order — but
// the editor generates far more markup than the engine and was not. Several
// panels interpolated a `prompt()` or a text field straight into a call:
//
//   #הערת_עורך[<text>]            a `]` in the text closed the call early
//   #מקטע_עמוד(כותרת_עליונה: "<h>")  a trailing `\` escaped the closing quote
//
// Both corrupt the document with no diagnostic the writer could act on. This is
// the one shared escaper every such panel now goes through.

/**
 * Escape a value for a Typst string literal — the `"…"` form.
 *
 * The backslash must be doubled *first*: escaping the quote first would turn `"`
 * into `\"`, and doubling backslashes afterwards would then turn that backslash
 * into `\\"`, closing the literal. Mirrors the engine's `typst_str` exactly.
 */
export function typstString(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/**
 * Escape a value for a Typst *content* body — the `[…]` form.
 *
 * Here the danger is different from a string literal: an unbalanced `]` closes
 * the enclosing call, a `#` starts a code expression, a `$` opens maths, and a
 * trailing `\` escapes whatever follows. Backslash is doubled first for the same
 * ordering reason, then every character Typst would read as markup is escaped so
 * the text lands on the page as itself. `[` is escaped too, so a balanced pair
 * the writer typed does not turn into a nested content block.
 */
export function typstContent(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/([[\]#$])/g, "\\$1");
}
