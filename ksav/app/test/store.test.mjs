// The durable store.
//
// Two properties, and both of them are about failure. A write must not resolve
// until the transaction has committed — "saved" has to mean saved — and a
// browser refusing to store more must arrive as a distinguishable error rather
// than as a generic one the caller will lump in with everything else.

import { check, ok, rejects, resetStorage } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";
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

  // ------------------------------------------- a visitor that throws
  //
  // `lamdan/external-2026-08-18.md` §5.6: the visitor ran inside IndexedDB's own
  // event handler, so a throw escaped into it, `cursor.continue()` was never
  // called, the transaction never completed, and the returned promise neither
  // resolved nor rejected. It hung, and its callers are `rebuildIndex` — on the
  // recovery path, awaited by `docs.init`, awaited by `boot()`.
  //
  // A hang is not something a plain `await` can report, so this races the call
  // against a timer: the promise must *settle*, and settle as a rejection that
  // carries the visitor's own error.
  {
    const before = (await store.keys(store.DOCS)).length;
    await store.put(store.DOCS, "one", { id: "one", body: "a" });
    await store.put(store.DOCS, "two", { id: "two", body: "b" });
    const boom = new Error("visitor failed");
    const raced = await Promise.race([
      store
        .forEach(store.DOCS, () => {
          throw boom;
        })
        .then(() => "resolved")
        .catch((e) => e),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 500)),
    ]);
    check("a visitor that throws rejects the walk rather than hanging it", raced, boom);
    // …and the guard that makes it so is asserted on the file, because this
    // runtime cannot reproduce the failure without it.
    //
    // `fake-indexeddb` re-raises a throw from an event handler into the abort
    // path, so deleting the `try`/`catch` below leaves this test green: the
    // observable contract is the same here and different in a browser, which is
    // exactly the gap that let the defect ship. A behavioural test alone would
    // therefore be a fence that cannot go red; the source rule is what holds it.
    const src = readFileSync(path.join(dirOf(import.meta.url), "..", "src", "store.ts"), "utf8");
    ok(
      "the visitor runs inside a guard that rejects and aborts",
      /try\s*\{\s*visit\(cursor\.value as T, String\(cursor\.key\)\);\s*\}\s*catch \(e\)\s*\{\s*reject\(e\);\s*transaction\.abort\(\);/u.test(
        src,
      ),
    );
    // And the store is still usable afterwards: an aborted transaction must not
    // wedge the connection.
    const after = await store.keys(store.DOCS);
    check("…and the database still answers afterwards", after.length, before + 2);
    for (const k of ["one", "two"]) await store.del(store.DOCS, k);
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
