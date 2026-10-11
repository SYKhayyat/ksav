# 2026-10-11 · A row keeps its place when the model moves

Closes #7. The editor's list panels already skipped a redraw when their serialized
model was unchanged, but any actual change cleared the whole host. Preview pages
had a similar positional cache: a page that moved was treated as a different
position, even when the engine's page identity was unchanged. Both shapes discard
browser-owned state — focus, selection and scroll — for a change that may affect
one row or page.

The right seam is a small framework-free keyed reconciler in
`ksav/app/src/reconcile.ts`. A caller supplies the key, equality predicate, node
factory and in-place updater. The reconciler indexes old entries by key, updates
only changed models, removes absent entries, moves retained nodes into the new
order, and restores the host's scroll offsets around the mutation. It never
owns application markup or event policy. That keeps it smaller than a rendering
framework and lets the panel and preview surfaces retain their existing DOM
builders.

Panel rows use their stable source id, or their row action as a fallback, rather
than translated label text. The panel path retains unchanged row nodes and updates
changed rows in place, preserving a selected row and a focused expand control.
Named preview pages use the engine hash to match moved pages and retain a page-slot
identity for an edited page, so insertion, removal, movement and page-content
updates all go through the same keyed operation. The existing un-named/old-webview
path stays the deliberately conservative full redraw because it has no identity
contract to trust.

`reconcile.test.mjs` covers unchanged identity and no-op updates, changed-model
updates, moves, removal, selection and scroll. `pagecache.test.mjs` covers the
actual preview call site and asserts that moved page nodes and scroll survive.

The two new identity fences were mutation-tested: forcing the reconciler to call
`update` for every model failed the unchanged/no-op and changed-neighbor checks;
replacing the preview key with the page index failed the moved-node assertion.
