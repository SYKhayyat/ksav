# 2026-10-11 · Shared assets earn a SHA-256 digest

Closes #56. The process-wide asset cache used a client-supplied key made from two
32-bit FNV-1a lanes. A local caller without an `Origin` header can reach the compile
service, and a feasible collision let it install one image under a key belonging to
another image; the next hash-only compile could print the planted image.

The wire and cache key is now the lowercase hexadecimal SHA-256 digest of the
**decoded bytes**. Rust and TypeScript implement the same operation and the engine
installs bytes only under the digest it computed. A claimed digest that disagrees is
not installed, while the bytes on that request are still used. A request without a
claim can still cache bytes under the digest they earn; knowing a key is not enough to
make different bytes resolve to it. This keeps the existing local, header-less
caller contract without leaving a collision-sized write primitive.

Hashing decoded bytes is intentional. A `data:` prefix, standard versus URL-safe
alphabet, and padding are transport spellings, not different images. Malformed data
has no digest on the Rust side and is refused before cache insertion; the browser's
safe fallback cannot create an empty cache entry because the engine refuses empty
assets.

The file format remains readable. Existing `.ksav` files carry their bytes, so the
new client recomputes a SHA-256 key when they are opened and writes the migrated key
on the next save. Existing local records likewise hydrate through their old key and
are refiled when saved. A hand-edited hash-only legacy entry is reported missing and
asks for bytes again; it is never interpreted as a SHA-256 key or resolved to an
unrelated image.

The focused fences are the Rust asset tests and the app document tests: known
cross-language vectors, cache round trips, digest mismatch poisoning, malformed
payloads, equivalent encodings, and a legacy `.ksav` migration. The digest is kept
synchronous in TypeScript because asset requests and local asset storage are both
synchronous at their call sites; the per-object `WeakMap` still prevents repeated
hashing during compile scheduling.

The compile response now advertises `asset_cache: "sha256"`. A new client sends
bytes until it sees that capability, then may send hash-only entries. A pre-SHA
engine omits the field, so the client deliberately stays byte-full instead of
confirming a SHA key that the old engine cannot retain and paying a hidden
missing-asset retry on every request. The reverse pairing remains safe as well:
the new engine never installs bytes under an old client's unverified short key;
an old client receives the existing `missing_assets` answer and re-sends bytes,
so its assets render but it should be upgraded to regain cache savings. This is
an explicit compatibility downgrade, not a claim that the old cache protocol is
safe to revive.

The new insertion fence was mutation-checked: making every claimed digest
acceptable made `bytes_sent_under_a_hash_that_is_not_theirs_do_not_poison_the_cache`
fail, and storing under the claim instead of the earned digest was also exercised
with the same test and was caught once the condition was bypassed.
