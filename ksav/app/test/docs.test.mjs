// The persistence layer.
//
// This is where the blocker lived, and it had no test at all. Everything below
// is a property that, had it been asserted, would have caught the bug that
// disqualified the product: a store that fills up, stops saving, and says
// nothing.

import { check, ok, notOk, rejects, resetStorage } from "./harness.mjs";
import * as docs from "../.tmp-test/docs.mjs";
import { StorageFullError } from "../.tmp-test/store.mjs";

export async function run() {
  // ------------------------------------------------------------ round trip
  {
    await resetStorage();
    const opened = await docs.init("STARTER", "Untitled");
    check("first run: the starter document is opened", opened.body, "STARTER");
    check("first run: it is in the library", docs.library().length, 1);

    opened.body = "כתבתי משהו";
    await docs.putDoc(opened);
    const back = await docs.getDoc(opened.id);
    check("a saved document reads back", back.body, "כתבתי משהו");
    check("…and its assets survive as an array", back.assets, []);
  }

  // ------------------------------------------------------------ the blocker
  //
  // A save that cannot be completed must *reject*. The whole failure was that
  // one threw from a place nobody was catching; the contract has to be loud.
  {
    await resetStorage();
    const doc = await docs.createDoc("t", "body");
    // The index cache lives in localStorage and a full localStorage must not be
    // able to stop a document being written to IndexedDB, where it belongs.
    localStorage.quota = 0;
    await docs.putDoc({ ...doc, body: "still saved" });
    const back = await docs.getDoc(doc.id);
    check("a full index cache does not stop the document being saved", back.body, "still saved");
    localStorage.quota = Infinity;
  }

  {
    // A storage failure is surfaced as a StorageFullError, not swallowed and
    // not disguised as success.
    const err = new StorageFullError();
    check("StorageFullError names itself", err.name, "StorageFullError");
    ok("StorageFullError is an Error", err instanceof Error);
  }

  // ------------------------------------------------------------ the index
  {
    await resetStorage();
    await docs.init("s", "Untitled");
    const a = await docs.createDoc("Alef", "א");
    const b = await docs.createDoc("Beis", "ב");
    const titles = docs.library().map((e) => e.title);
    ok("the library lists every document", titles.includes("Alef") && titles.includes("Beis"));
    // Two documents created in the same millisecond tie on `updated`, and a
    // stable sort would then put the older one first — "New document" appearing
    // below the document it was made from.
    check("newest first, even within one millisecond", docs.library()[0].id, b.id);

    // The index is a cache in localStorage; the documents are the truth in
    // IndexedDB. A browser that clears one and keeps the other must not look
    // like the work has been lost.
    localStorage.removeItem("ksav.library");
    localStorage.removeItem("ksav.currentDoc");
    const reopened = await docs.init("s", "Untitled");
    check("a lost index is rebuilt from the documents", docs.library().length, 3);
    ok("…and one of them is opened", !!reopened.id);
    ok(
      "…and it is one of the documents that exist",
      docs.library().some((e) => e.id === reopened.id),
    );
    // Cross-check that the rebuilt entries are real.
    for (const e of docs.library()) ok(`rebuilt entry ${e.title} resolves`, !!(await docs.getDoc(e.id)));
    void a;
  }

  // ------------------------------------------------------------ deletion
  {
    await resetStorage();
    await docs.init("s", "Untitled");
    const doomed = await docs.createDoc("Doomed", "x");
    await docs.pushSnapshot(doomed.id, "x");
    await docs.deleteDoc(doomed.id);
    check("a deleted document is gone from the index", docs.library().filter((e) => e.id === doomed.id).length, 0);
    check("…and from the store", await docs.getDoc(doomed.id), null);
    check("…and takes its history with it", (await docs.snapshots(doomed.id)).length, 0);
  }

  // ------------------------------------------------------------ history
  //
  // Blocker #2. Snapshots used to be `{t, body}` in one global key with no
  // document id in them, so the list shown in document A was every snapshot of
  // every document — and restoring one silently replaced A's text with B's.
  {
    await resetStorage();
    await docs.init("s", "Untitled");
    const a = await docs.createDoc("A", "aaa");
    const b = await docs.createDoc("B", "bbb");

    await docs.pushSnapshot(a.id, "aaa");
    await docs.pushSnapshot(b.id, "bbb");
    await docs.pushSnapshot(a.id, "aaa v2");

    check("A's history is A's", (await docs.snapshots(a.id)).map((s) => s.body), ["aaa", "aaa v2"]);
    check("B's history is B's", (await docs.snapshots(b.id)).map((s) => s.body), ["bbb"]);
    ok(
      "no snapshot of B can appear in A's list",
      (await docs.snapshots(a.id)).every((s) => s.body !== "bbb"),
    );
  }

  {
    // An unchanged document does not accumulate identical snapshots.
    await resetStorage();
    const doc = await docs.createDoc("t", "same");
    check("first snapshot is stored", await docs.pushSnapshot(doc.id, "same"), true);
    check("an identical snapshot is not", await docs.pushSnapshot(doc.id, "same"), false);
    check("only one is kept", (await docs.snapshots(doc.id)).length, 1);
  }

  {
    // The count ceiling. Eighty uncapped copies of a document under one key is
    // how the store filled in the first place.
    await resetStorage();
    const doc = await docs.createDoc("t", "");
    for (let i = 0; i < docs.MAX_SNAPSHOTS + 20; i++) {
      await docs.pushSnapshot(doc.id, `v${i}`);
    }
    const list = await docs.snapshots(doc.id);
    check("history is capped by count", list.length, docs.MAX_SNAPSHOTS);
    check("…and it keeps the newest", list[list.length - 1].body, `v${docs.MAX_SNAPSHOTS + 19}`);
  }

  {
    // The byte ceiling. A count cap alone is not enough: fifty snapshots of a
    // 200 KB sefer is ten megabytes.
    await resetStorage();
    const doc = await docs.createDoc("t", "");
    const big = "x".repeat(300 * 1024);
    for (let i = 0; i < 12; i++) await docs.pushSnapshot(doc.id, big + i);
    const list = await docs.snapshots(doc.id);
    const bytes = list.reduce((n, s) => n + s.body.length, 0);
    ok(`history is capped by size (${bytes} bytes)`, bytes <= docs.MAX_HISTORY_BYTES);
    ok("…and never empties itself", list.length >= 1);
    check("…and the newest survives", list[list.length - 1].body, big + 11);
  }

  // ------------------------------------------------------------ migration
  //
  // Losing someone's work to a storage refactor would be unforgivable, so both
  // localStorage shapes that ever existed have to arrive intact.
  {
    await resetStorage();
    localStorage.setItem(
      "ksav.doc.old1",
      JSON.stringify({ id: "old1", title: "Sefer", body: "גוף הספר", updated: 1 }),
    );
    localStorage.setItem("ksav.library", JSON.stringify([{ id: "old1", title: "Sefer", updated: 1 }]));
    await docs.init("s", "Untitled");
    const moved = await docs.getDoc("old1");
    ok("a per-document localStorage record is carried over", !!moved);
    check("…with its text", moved.body, "גוף הספר");
    check("…and the old key is cleared", localStorage.getItem("ksav.doc.old1"), null);
  }

  {
    await resetStorage();
    localStorage.setItem("ksav.doc", "the very first document, before there was a library");
    const opened = await docs.init("STARTER", "Untitled");
    check(
      "the pre-library single document is opened, not the starter",
      opened.body,
      "the very first document, before there was a library",
    );
    check("…and its key is cleared", localStorage.getItem("ksav.doc"), null);
  }

  {
    // The old global history cannot be attributed to a document, so it is
    // dropped rather than offered under a document it may not belong to.
    await resetStorage();
    localStorage.setItem("ksav.history", JSON.stringify([{ t: 1, body: "whose is this?" }]));
    const opened = await docs.init("s", "Untitled");
    check("unattributable history is dropped", localStorage.getItem("ksav.history"), null);
    check("…and does not appear under the open document", (await docs.snapshots(opened.id)).length, 0);
  }

  // ------------------------------------------------------------ pure helpers
  {
    check("a heading becomes the title", docs.guessTitle("= פרק א\nגוף", "—"), "פרק א");
    check("#שער becomes the title", docs.guessTitle("#שער[ספר הזכרון]", "—"), "ספר הזכרון");
    check("a comment is not the title", docs.guessTitle("// note\nשורה", "—"), "שורה");
    check("an empty document falls back", docs.guessTitle("   ", "—"), "—");

    check("a document without assets serialises as plain text", docs.serializeDoc({ body: "טקסט", assets: [] }), "טקסט");
    const withAsset = docs.serializeDoc({ title: "T", body: "b", assets: [{ name: "a.png", data: "d", kind: "image" }] });
    ok("a document with assets serialises as JSON", withAsset.trimStart().startsWith("{"));
    const parsed = docs.parseDoc(withAsset, "fallback");
    check("…and round-trips", parsed.assets.length, 1);
    check("…keeping the title", parsed.title, "T");

    check("plain text parses as a body", docs.parseDoc("just text", "F").body, "just text");
    check("…taking the fallback title", docs.parseDoc("just text", "F").title, "F");
    check("foreign JSON is treated as text, not swallowed", docs.parseDoc('{"a":1}', "F").body, '{"a":1}');
    check("broken JSON is treated as text", docs.parseDoc("{oops", "F").body, "{oops");

    const existing = [{ name: "image.png" }, { name: "image-2.png" }];
    check("a free name is used as-is", docs.uniqueAssetName(existing, "other.png"), "other.png");
    check("a taken name is numbered past the gap", docs.uniqueAssetName(existing, "image.png"), "image-3.png");
    check("a name with no extension still works", docs.uniqueAssetName([{ name: "x" }], "x"), "x-2");

    const split = docs.requestAssets([
      { name: "a.png", data: "1", kind: "image" },
      { name: "b.ttf", data: "2", kind: "font" },
    ]);
    check("images and fonts are split for the request", [split.assets.length, split.fonts.length], [1, 1]);
    check("…by kind", split.fonts[0].name, "b.ttf");
  }

  // ------------------------------------------------------------ ids
  {
    const ids = new Set();
    for (let i = 0; i < 2000; i++) ids.add(docs.newId());
    check("ids do not collide", ids.size, 2000);
  }

  await rejects(
    "a document that cannot be structured-cloned rejects rather than half-saving",
    () => docs.putDoc({ id: "fn", title: "t", body: "b", assets: [], updated: 0, boom: () => {} }),
  );
}
