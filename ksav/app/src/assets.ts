// ---------------------------------------------------------------- assets
//
// The bytes a document carries: the images the reader sees and the fonts the
// engine sets with. Attach goes through the store (`docs.ts`, and `store.ts`
// as the bottom shelf) and then does its one document edit; the point of the
// module is that nothing else has a reason to touch this document's assets.
//
// This file refuses to answer for: where an attachment room comes from
// (`store.ts` — `estimate` is a read of the browser's own quota) and the
// sweep that frees dropped blobs (`docs.collectAssets`), reached here so the
// removal *reclaims* rather than only delists.

import * as store from "./store";
import * as docs from "./docs";
import type { DocAsset } from "./docs";
import * as runtime from "./runtime";
import * as save from "./save";
import { reportSaveFailure, saveNow } from "./save";
import { setStatus, closeMenus, rerenderChrome } from "./runtime";
import { t, tf } from "./i18n";
import { insertSnippet } from "./insert";
import { scheduleCompile } from "./compile";
import { pickFile, readAsDataUrl, humanSize } from "./dom";
// ---------------------------------------------------------------- assets
//
// An image belongs to the document, not to a path on someone's disk: the engine
// has no file system, so the bytes travel with every compile request. Attaching
// one therefore means storing it on the document and referring to it by name.

/**
 * Refuse enormous attachments.
 *
 * The old ceiling was 4 MB, which base64 turns into 5.3 MB — larger than the
 * entire ~4.5 MB localStorage quota it existed to protect. A guard set above the
 * limit it guards is not a guard. Documents live in IndexedDB now, which is
 * measured in hundreds of megabytes, so the real constraints are different ones:
 * every asset is re-sent on every compile, and every asset is carried inside the
 * .ksav file. 8 MB is generous for a scan or a font and still keeps a compile
 * request something a browser can hand across in one piece.
 */
const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/**
 * Refuse an attachment that would not fit, *before* reading it.
 *
 * `navigator.storage.estimate()` is advisory and absent in some browsers, so a
 * `null` answer means "go ahead and find out" rather than "refuse" — but when it
 * does answer, telling the writer now beats failing after the read.
 */
export async function roomFor(bytes: number): Promise<boolean> {
  const e = await store.estimate();
  if (!e) return true;
  // base64 costs a third on top, and the store wants headroom to work in.
  const needed = Math.ceil(bytes * 1.4);
  return e.usage + needed < e.quota;
}

export async function attachAsset(f: File, kind: DocAsset["kind"]): Promise<string | null> {
  if (f.size > MAX_ASSET_BYTES) {
    setStatus(tf("assetTooBig", humanSize(f.size), humanSize(MAX_ASSET_BYTES)), "err");
    return null;
  }
  if (!(await roomFor(f.size))) {
    setStatus(t("storageFull"), "err");
    return null;
  }
  const name = docs.uniqueAssetName(runtime.currentDoc.assets, f.name);
  const added: DocAsset = { name, data: await readAsDataUrl(f), kind };
  runtime.currentDoc.assets.push(added);
  try {
    await docs.putDoc(runtime.currentDoc);
  } catch (e) {
    // Take the attachment back out rather than leaving the in-memory document
    // referring to bytes that were never stored.
    runtime.currentDoc.assets = runtime.currentDoc.assets.filter((a) => a !== added);
    reportSaveFailure(e);
    return null;
  }
  // The bound file has changed too, and only `insertImage` used to say so.
  //
  // It says it by accident: it attaches and then inserts `#תמונה(…)`, which is a
  // document edit and therefore schedules a save and marks the file dirty.
  // `addFont` attaches and inserts **nothing** — the writer types the family
  // name into the font box themselves, which is documented and correct — so the
  // font was written to the library copy (`putDoc` above) and never to the bound
  // `.ksav` on disk. Send that file to somebody and the font is not in it,
  // silently, with the document still referring to it by family name.
  //
  // Here rather than in `addFont`, because attaching is the fact: whatever the
  // caller does next, this document's bytes are not the file's bytes any more.
  save.markFileDirty();
  return name;
}

export async function insertImage() {
  closeMenus();
  const f = await pickFile("image/*");
  if (!f) return;
  const name = await attachAsset(f, "image");
  if (!name) return;
  if (insertSnippet(`#תמונה("${name}", רוחב: 60%)`)) scheduleCompile();
}

export async function addFont() {
  const f = await pickFile(".ttf,.otf,.ttc,font/*");
  if (!f) return;
  const name = await attachAsset(f, "font");
  if (!name) return;
  // The document must ask for the font by its FAMILY name, which lives inside
  // the file and which we cannot read here — so say what happened and let the
  // writer type the family into the font box.
  setStatus(`${name} ✓`, "ok");
  scheduleCompile();
  rerenderChrome();
}

export async function removeAsset(name: string) {
  runtime.currentDoc.assets = runtime.currentDoc.assets.filter((a) => a.name !== name);
  await saveNow();
  // And reclaim the blob, which nothing did.
  //
  // `collectAssets()` — the sweep that drops unreferenced blobs — had exactly
  // one caller, `deleteDoc`. Removing an asset wrote a document record with one
  // fewer hash in it and left the bytes in the `ASSETS` store forever. A writer
  // who attaches a scan, changes their mind, attaches another, and repeats
  // accumulated every rejected 8 MB image in IndexedDB with nothing that would
  // ever free it; the store's own quota banner is what they eventually met.
  //
  // Safe to call at any time by construction: it sweeps rather than
  // reference-counts, which is precisely so that this is true. Awaited but not
  // fatal — a sweep that fails costs space, and the removal itself has already
  // been written.
  try {
    await docs.collectAssets();
  } catch {
    /* the asset is off the document either way; the bytes can be swept later */
  }
  scheduleCompile();
  rerenderChrome();
}