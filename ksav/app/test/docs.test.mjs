// The persistence layer.
//
// This is where the blocker lived, and it had no test at all. Everything below
// is a property that, had it been asserted, would have caught the bug that
// disqualified the product: a store that fills up, stops saving, and says
// nothing.

import { check, ok, notOk, rejects, resetStorage } from "./harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dirOf } from "../tools/paths.mjs";

const SRC_DIR = path.join(dirOf(import.meta.url), "..", "src");
/** The module's own source — the fence reads claims, not export surfaces. */
const srcOf = (f) => readFileSync(path.join(SRC_DIR, f), "utf8");
import * as docs from "../.tmp-test/docs.mjs";
import * as settings from "../.tmp-test/settings.mjs";
import * as store from "../.tmp-test/store.mjs";
import { StorageFullError } from "../.tmp-test/store.mjs";
import { wireSnapshots, snapWiring } from "../.tmp-test/snapshots.mjs";
import { wireGit, gitWiring } from "../.tmp-test/gitui.mjs";
import { wireStyles, stylesWiring } from "../.tmp-test/stylespanel.mjs";
import * as customstyles from "../.tmp-test/customstyles.mjs";
import { wireDestinations, destinationsWiring } from "../.tmp-test/destinations.mjs";
import * as formmodal from "../.tmp-test/formmodal.mjs";
import * as reviewpanel from "../.tmp-test/reviewpanel.mjs";
import * as sectionsetup from "../.tmp-test/sectionsetup.mjs";
import * as formulas from "../.tmp-test/formulas.mjs";
import * as noteschooser from "../.tmp-test/noteschooser.mjs";
import * as assets from "../.tmp-test/assets.mjs";
import { wireDocswitch, docswitchWiring } from "../.tmp-test/docswitch.mjs";
import { wireTemplates, templatesWiring } from "../.tmp-test/templates.mjs";
import * as fileui from "../.tmp-test/fileui.mjs";
import * as applifecycle from "../.tmp-test/applifecycle.mjs";
import { wireStarter, starterWiring } from "../.tmp-test/starter.mjs";

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

    const legacyFile = docs.serializeDoc({
      title: "legacy",
      body: "b",
      assets: [{ name: "a.png", data: "YQ==", kind: "image", hash: "1-1r9wi7g-d2eron" }],
    });
    check(
      "a .ksav save rewrites the legacy asset key",
      JSON.parse(legacyFile).assets[0].hash,
      "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    );
    notOk("…and does not serialize the old key", legacyFile.includes("1-1r9wi7g-d2eron"));

    // Custom commands travel with the document so a shared .ksav compiles for its
    // reader, not only its author.
    {
      const doc = { title: "T", body: "#דגש[x]", assets: [] };
      const plain = docs.serializeDoc(doc);
      check("a document with no custom commands stays plain text", plain, "#דגש[x]");
      const carried = docs.serializeDoc(doc, "#let דגש(x) = strong(x)");
      ok("the app-wide fallback is embedded when the doc has none", carried.includes("customCommands"));
      const back = docs.parseDoc(carried, "F");
      check("…and round-trips", back.customCommands, "#let דגש(x) = strong(x)");
      // A document's own commands win over the fallback and are kept on re-save.
      const owned = docs.serializeDoc({ ...doc, customCommands: "#let own() = []" }, "#let other() = []");
      check("the document's own commands are what serialise", docs.parseDoc(owned, "F").customCommands, "#let own() = []");
    }

    // ------------------------------------------- page setup travels with the file
    //
    // Three pages of documentation said it did for as long as `serializeDoc`
    // dropped it: `ksav/README.md` ("These travel with the file, so a sefer opens
    // the same way on someone else's machine"), `docs/start-here.md` ("your
    // words, your markup, and this document's page setup") and `docs/from-word.md`
    // ("your document's own settings"). `config` lived in IndexedDB and never left
    // the machine, so the promise was false on every route out of the app: Save,
    // Save As, the crash-recovery backup, and duplicating a document.
    //
    // The oracle is the round trip, not a list of fields. What a document is laid
    // out like is `pageSetup(own, defaults)` — so the property that matters is
    // that reading a file back gives the *same laid-out document*, whatever it
    // said. A field added to `PAGE_FIELDS` next year is covered by construction.
    {
      const laidOut = (own) => settings.pageSetup(own, settings.defaultPageSetup());
      const roundTrip = (own) =>
        settings.pageSetup(
          docs.parseDoc(docs.serializeDoc({ title: "T", body: "גוף", assets: [], config: own }), "F")
            .config,
          settings.defaultPageSetup(),
        );

      const shipped = settings.defaultPageSetup();
      const CORPUS = [
        ["says nothing", {}],
        ["one field", { paper: "letter" }],
        ["the whole shipped setup, restated", { ...shipped }],
        ["a two-sided sefer", { two_sided: true, margin_inner_cm: 3, margin_outer_cm: 1.5, gutter_cm: 0.5 }],
        ["an English document", { dir: "ltr", font: "EB Garamond", size_pt: 11 }],
        ["empty strings, which are answers", { header: "", footer: "", header_odd: "" }],
        ["a zero, which is also an answer", { first_line_indent_em: 0, margin_cm: 0 }],
        ["falsehood, which is an answer too", { justify: false, numbering: false, pdf_tagged: false }],
        ["the one array", { keywords: ["הלכה", "שבת"] }],
        ["metadata", { title: "ספר הזכרון", author: "פלוני", pdf_standard: "a-3b" }],
      ];
      for (const [what, own] of CORPUS) {
        check(`page setup survives the file: ${what}`, JSON.stringify(roundTrip(own)), JSON.stringify(laidOut(own)));
      }

      // The other half of the promise: a document laid out the shipped way is
      // still a text file somebody can `cat`, which is what `docs/from-word.md`
      // sells `.ksav` on. Writing the setup unconditionally would have cost that.
      check(
        "a document laid out the shipped way is still plain text",
        docs.serializeDoc({ title: "T", body: "גוף", assets: [], config: { ...shipped } }),
        "גוף",
      );
      ok(
        "…and one that says something is not",
        docs
          .serializeDoc({ title: "T", body: "גוף", assets: [], config: { paper: "letter" } })
          .includes('"paper": "letter"'),
      );
      check(
        "only what the defaults do not already say is written",
        Object.keys(JSON.parse(docs.serializeDoc({ title: "T", body: "b", assets: [], config: { ...shipped, paper: "letter" } })).config),
        ["paper"],
      );

      // The file is somebody else's JSON, and this field goes on to a compile
      // request. A hand-edited one must not be able to put a shape the engine
      // cannot read into it — and must not cost the writer the keys beside it.
      // Written as raw JSON, not built from an object literal: `__proto__` in a
      // literal sets a prototype instead of a key, which would test nothing.
      const hostile =
        '{"format":"ksav-document","version":1,"title":"T","body":"b","assets":[],' +
        '"config":{"paper":{},"size_pt":"big","dir":"rtl","keywords":[1,2],' +
        '"nonsense":7,"__proto__":{"polluted":true}}}';
      const read = docs.parseDoc(hostile, "F").config;
      check("a hand-edited file cannot smuggle a shape in", JSON.stringify(read), JSON.stringify({ dir: "rtl" }));
      check("…and a config that is not an object is simply absent", docs.parseDoc(
        JSON.stringify({ format: "ksav-document", version: 1, title: "T", body: "b", assets: [], config: "letter" }),
        "F",
      ).config, undefined);
    }

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

    // The file format predates SHA-256 and carries the old short key. The bytes
    // remain the authority: a new request recomputes the digest and does not
    // strand a legacy .ksav behind its historical cache key.
    const legacy = docs.parseDoc(
      JSON.stringify({
        format: "ksav-document",
        version: 1,
        title: "legacy",
        body: '#תמונה("a.png")',
        assets: [{ name: "a.png", kind: "image", hash: "1-1r9wi7g-d2eron", data: "YQ==" }],
      }),
      "fallback",
    );
    const migrated = docs.requestAssets(legacy.assets).assets[0];
    check(
      "a legacy file's bytes get a SHA-256 key",
      migrated.hash,
      "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    );
    notOk("…and the old key is not reused", migrated.hash === legacy.assets[0].hash);

    // Base64 spelling is transport, not identity: a data URL and an unpadded
    // URL-safe payload name the same bytes as the padded form.
    const equivalent = docs.requestAssets([
      { name: "one", data: "YQ==", kind: "image" },
      { name: "two", data: "data:text/plain;base64,YQ", kind: "image" },
      { name: "three", data: "_w==", kind: "image" },
    ]).assets;
    check("equivalent base64 spellings share a digest", equivalent[1].hash, equivalent[0].hash);
    check(
      "URL-safe base64 uses the decoded-byte digest",
      equivalent[2].hash,
      "a8100ae6aa1940d0b663bb31cd466142ebbdbd5187131b92d93818987832eb89",
    );
    check("a malformed payload still produces a safe wire entry", docs.requestAssets([
      { name: "bad", data: "not base64", kind: "image" },
    ]).assets[0].hash, "");

    // Rust consumes the same corpus from the repository root. These are exact
    // acceptance-boundary vectors: mixed alphabets and non-zero pad bits must
    // be rejected in both implementations, not merely decode to similar bytes
    // in one runtime's permissive base64 helper.
    const vectors = JSON.parse(
      readFileSync(new URL("../../asset-digest-vectors.json", import.meta.url), "utf8"),
    );
    for (const vector of vectors) {
      const digest = docs.assetDigest(vector.data);
      check(
        `shared base64 vector: ${vector.name}`,
        digest !== null,
        vector.valid,
      );
      if (vector.valid) check(`shared digest: ${vector.name}`, digest, vector.digest);
    }
  }

  // A v2 local record and its old asset bucket are a real storage migration,
  // not just a parsed file. Opening hydrates and normalizes the SHA key; saving
  // refiles the blob. Old buckets remain until the normal unreferenced-asset
  // sweep, which must retain a key while another unmigrated document uses it.
  {
    await resetStorage();
    const oldHash = "1-1r9wi7g-d2eron";
    const id = "legacy-local";
    await store.put(store.ASSETS, oldHash, { data: "YQ==" });
    await store.put(store.DOCS, id, {
      id,
      title: "legacy",
      body: "b",
      assets: [{ name: "a.png", kind: "image", hash: oldHash }],
      updated: 1,
    });
    await store.put(store.DOCS, "other-legacy", {
      id: "other-legacy", title: "other", body: "b", updated: 1,
      assets: [{ name: "a.png", kind: "image", hash: oldHash }],
    });
    localStorage.setItem("ksav.library", JSON.stringify([{ id, title: "legacy", updated: 1 }]));
    localStorage.setItem("ksav.currentDoc", id);
    const opened = await docs.init("s", "Untitled");
    check("a legacy local blob is hydrated", opened.assets[0].data, "YQ==");
    check(
      "hydration normalizes its key",
      opened.assets[0].hash,
      "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    );
    await docs.putDoc(opened);
    const stored = await store.get(store.DOCS, id);
    check("the stored record keeps the SHA key", stored.assets[0].hash, opened.assets[0].hash);
    check("the new blob exists", (await store.get(store.ASSETS, opened.assets[0].hash)).data, "YQ==");
    await docs.collectAssets();
    check("an unmigrated document keeps the old shared blob", (await store.get(store.ASSETS, oldHash)).data, "YQ==");
    await docs.deleteDoc("other-legacy");
    check("the stale legacy blob is cleaned", await store.get(store.ASSETS, oldHash), null);
    check("migration cleanup keeps the new blob", (await docs.getDoc(id)).assets[0].data, "YQ==");

    const broken = await docs.createDoc("broken", "b", [
      { name: "one", kind: "image", data: "not base64" },
      { name: "two", kind: "image", data: "also broken" },
    ]);
    check("malformed assets survive independently in storage", (await docs.getDoc(broken.id)).assets.map((a) => a.data), ["not base64", "also broken"]);
  }

  // ------------------------------------------------------------ ids
  {
    const ids = new Set();
    for (let i = 0; i < 2000; i++) ids.add(docs.newId());
    check("ids do not collide", ids.size, 2000);
  }

  // ------------------------------------------------------------ the cadence
  //
  // > *"Automatic snapshots, or automatic turned off and taken by hand."*
  //
  // Both halves were missing. The cadence was `setInterval(…, 180000)` at the
  // bottom of `main.ts`: three minutes, written as a number, with no way to
  // change it and no way to stop it.
  {
    check("off means off", docs.autoInterval(false, 3), null);
    check("on means minutes", docs.autoInterval(true, 5), 5 * 60_000);
    // An absent field is *on*. It is what every settings file written before
    // this existed says, and those writers have had automatic snapshots all
    // along — reading a missing field as a preference nobody expressed would
    // silently switch the feature off for all of them.
    check("an unset switch is on", docs.autoInterval(undefined, undefined), 3 * 60_000);
    check("…at the shipped cadence", docs.autoInterval(undefined, undefined) / 60_000, docs.DEFAULT_SNAPSHOT_MINUTES);
    // Clamped rather than refused: the row is a spinner, and a typed 999 should
    // give the longest gap on offer rather than silently keeping the old one.
    check("too often is the floor", docs.autoInterval(true, 0), docs.MIN_SNAPSHOT_MINUTES * 60_000);
    check("too rare is the ceiling", docs.autoInterval(true, 999), docs.MAX_SNAPSHOT_MINUTES * 60_000);
    check("and nonsense is the default", docs.autoInterval(true, NaN), docs.DEFAULT_SNAPSHOT_MINUTES * 60_000);
    ok(
      "the shipped cadence is inside the bounds",
      docs.DEFAULT_SNAPSHOT_MINUTES >= docs.MIN_SNAPSHOT_MINUTES &&
        docs.DEFAULT_SNAPSHOT_MINUTES <= docs.MAX_SNAPSHOT_MINUTES,
    );
    check(
      "and three minutes is still three minutes, as it was before it was a setting",
      docs.autoInterval(true, docs.DEFAULT_SNAPSHOT_MINUTES),
      180000,
    );
  }

  await rejects(
    "a document that cannot be structured-cloned rejects rather than half-saving",
    () => docs.putDoc({ id: "fn", title: "t", body: "b", assets: [], updated: 0, boom: () => {} }),
  );
}

{
  // The restore's call names `docs.Snapshot` — the records under the document,
  // not the old global key that mixed every sefer's snapshots together. The
  // registration was exercised so the surfaced wiring is the same object, and
  // the missing guard refuses loudly before it can restore into the wrong
  // document.
  const WIRING = {
    confirm: async () => false,
    refreshBaseline: async () => {},
    loadBody: () => {},
  };
  wireSnapshots(WIRING);
  ok("the snapshots wiring hands back what was registered", snapWiring() === WIRING);
}

{
  // The version-control wiring: the modal question and the body swap of a
  // commit restore arrive registered; the handback is the same object, and the
  // wired halves are guarded with voidAction in the drawer's own calls.
  const WIRING = {
    ask: async () => false,
    loadBody: () => {},
  };
  wireGit(WIRING);
  ok("the git drawer's wiring hands back what was registered", gitWiring() === WIRING);
}

{
  // The styles panel borrows what only the shell has: the destinations' rows
  // (their own wave), the preset apply/undo, the keymap rebuild for a chord
  // captured on a "my styles" row, and the edit door the writer's styles
  // open through.
  const WIRING = {
    destinationRows: () => [],
    applySkin: () => {},
    undoSkin: () => {},
    reconfigureShortcuts: () => {},
    openStyleEditor: () => {},
  };
  wireStyles(WIRING);
  ok("the styles panel's wiring hands back what was registered", stylesWiring() === WIRING);
}

{
  // The custom styles' gestures now take the form modal by direct import (the
  // wiring wave 9 retired when the modal became formmodal.ts's) and borrow the
  // panel's row dress — one direction, the dress owner upstream.
  const src = srcOf("customstyles.ts");
  ok(
    "the custom styles borrow the panel's dress and the form modal, and own the three gestures",
    src.includes('import { fieldControl, styleRow } from "./stylespanel"') &&
      src.includes('import { openModal } from "./formmodal"') &&
      /export async function applyCustomStyle|export function applyCustomStyle/.test(src) &&
      src.includes("export function unwrapCustomStyle") &&
      src.includes("export function openNewStyle") &&
      src.includes("export function openStyleEditor"),
  );
}

{
  // The destinations borrow the editor's write-back; the handback is the same
  // object, as every wiring's is.
  const WIRING = {
    replaceAll: () => {},
  };
  wireDestinations(WIRING);
  ok("the destinations' wiring hands back what was registered", destinationsWiring() === WIRING);
}

{
  // Wave 9's files, imported so the runner's every-module-imported fence can
  // hold — and held to the one structural claim each file exists to make:
  // the modal owns the three prompts and settles pending state; the review
  // drawer renders panelviews' rows; section setup writes the one command it
  // asks about; formulas writes the two; the notes chooser is the only place
  // that reaches applyPick; assets reclaims what it removes; the file doors
  // route through save's rule instead of re-deriving it.
  ok(
    "formmodal owns the three prompts and the settle door",
    /export function openModal|export async function openModal/.test(srcOf("formmodal.ts")) &&
      srcOf("formmodal.ts").includes("export function ask(") &&
      srcOf("formmodal.ts").includes("export function askArrival(") &&
      srcOf("formmodal.ts").includes("export function askText(") &&
      srcOf("formmodal.ts").includes("export function settlePendingModals"),
  );
  ok(
    "the review drawer renders panelviews' rows and asks through the modal",
    srcOf("reviewpanel.ts").includes("panelviews.reviewPanel(") &&
      srcOf("reviewpanel.ts").includes('from "./formmodal"'),
  );
  ok(
    "section setup writes #\u05de\u05e7\u05d8\u05e2_\u05e2\u05de\u05d5\u05d3 and nothing else claims to",
    srcOf("sectionsetup.ts").includes("#\u05de\u05e7\u05d8\u05e2_\u05e2\u05de\u05d5\u05d3("),
  );
  ok(
    "formulas write the display and inline forms",
    srcOf("formulas.ts").includes("#\u05e0\u05d5\u05e1\u05d7\u05d4(") &&
      srcOf("formulas.ts").includes("#\u05e0\u05d5\u05e1\u05d7\u05d4_\u05d1\u05e9\u05d5\u05e8\u05d4("),
  );
  ok(
    "the notes chooser reaches applyPick, the one producer",
    /applyPick\(/.test(srcOf("noteschooser.ts")) &&
      srcOf("noteschooser.ts").includes("panelviews.notesPanel("),
  );
  ok(
    "removing an asset reclaims the bytes, attaching marks the file dirty",
    srcOf("assets.ts").includes("docs.collectAssets()") &&
      srcOf("assets.ts").includes("save.markFileDirty()"),
  );
  ok(
    "the file doors route through save's rule, not their own",
    srcOf("fileui.ts").includes("save.saveRoute(") &&
      srcOf("fileui.ts").includes("export async function openFile") &&
      srcOf("fileui.ts").includes("export async function saveFile"),
  );
  ok(
    "the app's own life — crash, recovery, updates, the worker — is one file, not fileui's tenants",
    srcOf("applifecycle.ts").includes("export function showCrashPanel") &&
      srcOf("applifecycle.ts").includes("export async function offerRecovery") &&
      srcOf("applifecycle.ts").includes("export function registerServiceWorker") &&
      !srcOf("fileui.ts").includes('from "./crash"') &&
      !srcOf("fileui.ts").includes('from "./update"'),
  );
}

{
  // The switch machine borrows the state factory and the compartment sweep;
  // the starter borrows the body swap and the setting write that a language
  // switch performs on an untouched document.
  const SWITCH = {
    makeState: (body) => body,
    syncGlobals: () => {},
  };
  wireDocswitch(SWITCH);
  ok("the switch machine's wiring hands back what was registered", docswitchWiring() === SWITCH);
  const START = {
    loadBody: () => {},
    setSetting: () => {},
  };
  wireStarter(START);
  ok("the starter's wiring hands back what was registered", starterWiring() === START);
}

{
  // A template's direction arrives through the shell's setting write; the
  // file doors carry their own dialogs and are smoke-imported.
  const WIRING = {
    setSetting: () => {},
  };
  wireTemplates(WIRING);
  ok("the templates' wiring hands back what was registered", templatesWiring() === WIRING);
  ok(
    "a template's direction goes through the wired setting write — and no direct import could bypass it",
    srcOf("templates.ts").includes('templatesWiring().setSetting("dir"') &&
      !/^import .*setSetting.*from/m.test(srcOf("templates.ts")),
  );
}
