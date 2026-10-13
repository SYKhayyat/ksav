# 2026-10-11 · The editor scan is the seam

Issue #20 asked to move the deferred-note and source-numbering scans to Rust.
The request was right about the cost to control and too broad about the owner:
these are pure projections of the editor's source spans, not independent
grammars that the engine can safely replace.

## What the repository actually has

`app/src/spans.ts` already performs the context-aware document lex. Its `Scan`
contains the nodes, comments and, importantly, `closes` for every resolved
delimiter. The scan is memoised by document text and by CodeMirror document
identity. `deferred.ts` was still asking that seam repeatedly through
`matchGroup` and multiple separate `scanSpans` lookups inside one deferred scan;
`numbering.ts` rebuilt the same derived walk for each series, and the numbering
lint computed the out-of-sequence set twice during one repair.

That repetition is the fixable root. The deferred scanner now takes one
`SpanScan` and reads its nodes and `closes` directly. Numbering takes one scan
through `sequence`, reuses it for restart and heading discovery, and applies a
single computed edit set in the lint repair path. The public results and source
offsets remain the same.

## Why this is not a Rust service

The editor needs these answers synchronously while it is deciding decorations,
caret insertion, lint marks and source edits. A service call would be an
asynchronous second parser at exactly the boundary where the existing scanner
is required. Rust's detached Typst parser remains the offline oracle for
`spans.ts`, as recorded in `engine/src/parse.rs` and `engine/tests/scan_oracle.rs`,
but there is no existing generated service contract for editor spans or
deferred/numbering results. Adding one would create a registry entry with no
runtime editor caller and a second source-offset model. That is not a safe
optimization; it is a new parser boundary.

## Evidence and boundary

The focused editor regression supplies a precomputed `Scan` after clearing the
cache and proves that deferred and numbering consume it without another lex.
It also proves the ordinary path performs one uncached document lex and that
deferred refs/defs and numbering members are unchanged. Existing deferred-note
and renumbering suites remain the result oracles. A future service is justified
only by an actual asynchronous, non-editor consumer with a generated contract;
this issue does not provide one.
