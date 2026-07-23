// The durable store.
//
// Two properties, and both of them are about failure. A write must not resolve
// until the transaction has committed — "saved" has to mean saved — and a
// browser refusing to store more must arrive as a distinguishable error rather
// than as a generic one the caller will lump in with everything else.

import { check, ok, rejects, resetStorage } from "./harness.mjs";
import * as store from "../.tmp-test/store.mjs";

export async function run() {
  await resetStorage();

  // ------------------------------------------------------------ round trip
  {
    ok("the store opens", await store.available());
    check("a missing key reads as null", await store.get(store.DOCS, "nope"), null);

    await store.put(store.DOCS, "k", { a: 1, b: "ב" });
    check("what went in comes out", await store.get(store.DOCS, "k"), { a: 1, b: "ב" });

    await store.put(store.DOCS, "k", { a: 2 });
    check("a second write replaces the first", await store.get(store.DOCS, "k"), { a: 2 });

    await store.del(store.DOCS, "k");
    check("a deleted key reads as null", await store.get(store.DOCS, "k"), null);
  }

  // ------------------------------------------------------------ buckets
  {
    // The buckets are separate namespaces: `docs`, `history` and `handles` all
    // key on a document id, and a collision between them would be silent.
    await store.put(store.DOCS, "same-id", "a document");
    await store.put(store.HISTORY, "same-id", "some history");
    await store.put(store.HANDLES, "same-id", "a file binding");
    check("docs bucket", await store.get(store.DOCS, "same-id"), "a document");
    check("history bucket", await store.get(store.HISTORY, "same-id"), "some history");
    check("handles bucket", await store.get(store.HANDLES, "same-id"), "a file binding");
  }

  // ------------------------------------------------------------ getAll
  {
    await resetStorage();
    for (const id of ["a", "b", "c"]) await store.put(store.DOCS, id, { id });
    const all = await store.getAll(store.DOCS);
    check("getAll returns every record", all.length, 3);
    check("…and only from its own bucket", (await store.getAll(store.HISTORY)).length, 0);
  }

  // ------------------------------------------------------------ durability
  {
    // The write resolves only once the transaction has committed, so a value
    // read immediately afterwards is always the value that was written. If the
    // promise resolved on `onsuccess` instead, this would be a race.
    await resetStorage();
    for (let i = 0; i < 40; i++) {
      await store.put(store.DOCS, "hot", { i });
      const back = await store.get(store.DOCS, "hot");
      if (back?.i !== i) {
        check(`write ${i} is readable immediately after it resolves`, back, { i });
        return;
      }
    }
    ok("forty writes are each readable the instant they resolve", true);
  }

  // ------------------------------------------------------------ failure
  {
    // Values IndexedDB cannot structured-clone must reject, not half-succeed.
    await rejects("an unclonable value rejects", () => store.put(store.DOCS, "fn", () => {}));
    check("…and nothing was stored under that key", await store.get(store.DOCS, "fn"), null);
  }

  {
    const err = new store.StorageFullError(new Error("underlying"));
    check("a full store is its own error type", err.name, "StorageFullError");
    ok("…which is an Error", err instanceof Error);
    ok("…and keeps what caused it", err.cause instanceof Error);
  }

  // ------------------------------------------------------------ estimate
  {
    // Advisory: absent in some browsers, and a null answer means "go ahead and
    // find out" rather than "refuse".
    const e = await store.estimate();
    ok("an estimate is either a pair of numbers or null",
      e === null || (typeof e.usage === "number" && typeof e.quota === "number"));
  }
}
