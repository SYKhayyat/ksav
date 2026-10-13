# 2026-10-13 · A scan belongs to its text

The first #20 change established the editor's `spans.ts` `Scan` as the shared
source seam. Its remaining work was smaller but important: one bulk deferred-note
operation still searched the changing output with a fresh scan for every body,
and callers could pass a scan whose offsets belonged to another document.

## What changed

`deferAllInlineNotes` now records each generated marker's offset while it builds
the replacement text. The body-filing loop carries those offsets across each
insertion, using the insertion position returned by `fileNewBody`, instead of
lexing the output merely to rediscover a marker it just wrote.

All optional `Scan` parameters in deferred notes, numbering and bidi now validate
`Scan.text` against the text being read. A mismatched scan is rejected before its
offsets can produce a plausible edit in the wrong document. The cache miss counter
also has an explicit reset operation; clearing the scan cache continues to reset
the counter, while tests that keep a prepared scan warm can reset instrumentation
alone.

The seam regression no longer calls the implementation to create its expected
answer. It contains a real `#גופי_הערות[…]` region, independently describes the
marker, body, region bounds and two numbering members, and checks that deferred,
numbering and bidi consumers reject a scan from another text.

## Boundary

The deferred body-filing helper still owns placement policy (file, section,
region and companion homes). This change removes the redundant marker lookup and
protects the shared offset contract without replacing that policy with a second
placement algorithm.
