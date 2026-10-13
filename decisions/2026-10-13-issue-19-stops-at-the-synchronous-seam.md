# 2026-10-13 · Issue #19 stops at the synchronous seam

Issue #19 asks for `app/src/spans.ts` to move behind a Rust/WASM scan service for
consumers that do not build CodeMirror decorations. Reviewing `87c1fe0` against
that request and the overlapping #20 request found one delivered change and no
runtime service: `scan()` and `delimiters()` now share the TypeScript lexical
pass, while the Rust parser remains an offline oracle.

That boundary is intentional. `bidi.ts`, `ksav-lang.ts` and `spell.ts` derive
editor decorations synchronously, and the current worker/service contract is an
asynchronous JSON request. The same synchronous constraint still applies to
bracket healing, render preparation, and the source transformations that #20
names. Registering a service without moving a real compatible consumer would
leave a dead registry row and would not satisfy the issue.

The branch therefore makes no Rust/WASM service claim. It adds no scan row to
the engine registry, no generated client entry and no worker dispatch path. The
deferred-note and numbering ports remain #20 work rather than being folded into
this branch. Focused tests cover the shared cache, malformed-input recovery,
quoted and nested Hebrew source, and the fact that decoration consumers still
read the synchronous TypeScript scanner.

Issue #19 remains open after this measured increment. Completing it requires a
real asynchronous consumer and a wire schema that preserves the scanner's
UTF-16 offsets, incomplete-document recovery and editor-role facts, followed by
using that service in the consumer it was designed for.
