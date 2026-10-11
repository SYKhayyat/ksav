# 2026-10-11 · Spans share the lexical pass

Issue #19 asked to move `app/src/spans.ts` behind a Rust/WASM scan service for
consumers that do not need CodeMirror decorations. The existing service boundary
cannot safely carry that result yet. HTTP and the WASM worker both return through
an asynchronous JSON call, while the consumers that need the result today include
`bracket-lint.ts`, render planning in `compile.ts`, insertion numbering, deferred
note edits, and the synchronous Markdown/Org/plain-text renderers. The
CodeMirror decoration builders (`bidi.ts`, `ksav-lang.ts`, and `spell.ts`) are an
even harder boundary: they derive decorations inside an editor update and must
not await a worker round-trip. Making those callers asynchronous would change
editing and preview semantics, not merely move an implementation.

The Rust `parse` module remains the right authority for an offline oracle. It
uses Typst's detached parser and already checks the TypeScript scanner over the
generated corpus, but it does not have the scanner's editor-facing model: the
scanner must recognise incomplete text, bare calls, content groups that Typst
would treat as prose, and UTF-16 positions. Registering a service that returned
only parser facts would therefore be a second, incompatible scan rather than a
port.

The safe increment is in `spans.ts`: `scan()` and `delimiters()` now share one
four-entry lexical cache. The strict document view collects delimiter facts while
it lexes nodes. Balanced text uses that one pass for both consumers. Only text
with a mismatched structural closer gets the recovery-mode pass needed by the
bracket linter; unclosed-but-otherwise-ordered text does not pay for it. The
separate scan and delimiter result caches remain at the model boundary, but the
expensive context walk is shared and cannot silently acquire a second cache.

Focused tests drive the shared seam through deferred-note parsing and source
numbering with Hebrew quotes, quoted closing parentheses, and nested content;
they also keep recovery behavior for a malformed nested group. The Rust parser
oracle and the existing three-transport service tests remain the compatibility
checks: no new service, wire schema, generated registry row, or WASM dispatch
entry is claimed by this change.

The measured boundary is therefore explicit: the TypeScript scan stays the
synchronous source of truth for editor and synchronous source transformations;
the Rust parser remains an oracle, not a fake runtime service. A later service
can be added when a caller has an async contract and the wire schema covers the
scanner's UTF-16, incomplete-document, recovery, and editor-role facts together.
