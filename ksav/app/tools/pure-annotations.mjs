// Which `/*@__PURE__*/` annotations are true, and which are a lie the bundler
// believes.
//
// `@__PURE__` is a promise to the bundler: *this call has no side effect, so you
// may delete it when nobody uses its result*. Rollup and esbuild take the
// promise at face value, because there is nothing else they could do with it.
//
// `@replit/codemirror-emacs` makes that promise about the two calls that *are*
// the feature:
//
//     for (let i in emacsKeys) {
//         /*@__PURE__*/EmacsHandler.bindKey(i, emacsKeys[i]);
//     }
//     /*@__PURE__*/EmacsHandler.addCommands({ killLine: …, yank: …, … });
//
// Neither returns anything anybody reads, so a production build deletes both.
// What ships is the key *table*, the `bindKey` *method*, and nothing that puts
// them together — plus no command implementations at all. The mode loads
// without error, adds its CSS class, and cannot answer a single keystroke. In
// the dev server, which does not tree-shake, the same code works perfectly.
//
// That is the whole of the "emacs mode does nothing" report, and it is why the
// investigation before this one could find nothing wrong: every part of it was
// present and correct in the source, and the defect was introduced by the build.
//
// # The rule
//
// Drop the annotation **only where it introduces a statement** — where the
// character before it is `;`, `{`, `}` or a newline. A call in statement
// position whose result nobody takes is being made for its side effect by
// definition, so an annotation there is always the false kind.
//
// An annotation inside an expression is the honest kind and is left alone:
//
//     const emacsPlugin = /*@__PURE__*/ViewPlugin.fromClass(…)
//
// That one really is pure — the plugin is only worth building if something
// installs it — and it is where the size win these packages earn actually lives.
//
// Kept out of `vite.config.ts` so it can be tested against the real dependency
// on disk. A build-time transform nothing exercises is how the original
// annotation went unnoticed for the life of the feature.

/** Which packages this rule is a claim about. */
export const MODE_PACKAGES = /@replit[\\/]codemirror-(emacs|vim)/;

/** Remove statement-position `@__PURE__` annotations, keeping expression ones. */
export function stripStatementPure(code) {
  return code.replace(/([;{}\n])(\s*)\/\*\s*@__PURE__\s*\*\//g, "$1$2");
}
