// Importing a file, driven through the real File menu in the built application.
//
// #134's UAT 4 (Org) and UAT 16 (Word), both reported as *Ksav crashed*:
//
//   UAT 4  — "choosing Import from Org caused a fatal crash"
//   UAT 16 — "Import from Word crashed Ksav"
//
// The fix in the source is `importAs`, which puts the conversion inside a `try`
// and reports `importFailed` with a bilingual sentence. What it has never had is
// a test that goes through the **menu** and the **hidden file input** — the two
// places a crash's user actually stands. `docx.test.mjs` converts strings and
// `org`'s tests parse text; neither touches `fileui`, and a `catch` that is never
// thrown at is a claim, not a fact.
//
// So this boots the built bundle (the real engine, the real menus), replaces
// `HTMLInputElement.prototype.click` for the duration of one import so the
// picker answers with a `File` this file built, and then reads the window:
// the status line, the document text, and whether a crash panel is on screen.
//
// What the picker stub does *not* do is decide anything for the app: `change`
// fires, `importAs` continues on its own path. The stub is the operating
// system's file dialog, which is the one part a browser test cannot have.

import { check, ok, notOk } from "./harness.mjs";
import { engineInBundle, openApp } from "./pageserve.mjs";

/** A stored (uncompressed) `.docx` around one paragraph of Hebrew. */
function docx(text) {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;
  const name = "word/document.xml";
  const content = new TextEncoder().encode(xml);
  const nameBytes = new TextEncoder().encode(name);
  const LOCAL_EXTRA = 8;
  const CDIR_EXTRA = 0;

  const local = new Uint8Array(30 + nameBytes.length + LOCAL_EXTRA + content.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint32(18, content.length, true);
  lv.setUint32(22, content.length, true);
  lv.setUint16(26, nameBytes.length, true);
  lv.setUint16(28, LOCAL_EXTRA, true);
  local.set(nameBytes, 30);
  local.set(content, 30 + nameBytes.length + LOCAL_EXTRA);

  const cdir = new Uint8Array(46 + nameBytes.length + CDIR_EXTRA);
  const cv = new DataView(cdir.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint32(20, content.length, true);
  cv.setUint32(24, content.length, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint16(30, CDIR_EXTRA, true);
  cdir.set(nameBytes, 46);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, cdir.length, true);
  ev.setUint32(16, local.length, true);

  const zip = new Uint8Array(local.length + cdir.length + eocd.length);
  zip.set(local, 0);
  zip.set(cdir, local.length);
  zip.set(eocd, local.length + cdir.length);
  return [...zip];
}

/**
 * Answer the next file dialog with `file`, or with nothing at all.
 *
 * `files` is read-only on an `HTMLInputElement`, so the stub defines it — which
 * is exactly what a real picker does from the page's point of view. The original
 * `click` is kept for everything that is not a file input, so the stub cannot
 * quietly break a button somewhere else.
 */
const ARM = ({ name, bytes }) => {
  window.__ksavPicked = false;
  const proto = HTMLInputElement.prototype;
  if (!proto.__ksavOriginal) proto.__ksavOriginal = proto.click;
  proto.click = function () {
    if (this.type !== "file") return proto.__ksavOriginal.call(this);
    window.__ksavPicked = true;
    if (!name) return; // a dismissed dialog fires nothing
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], name));
    Object.defineProperty(this, "files", { value: dt.files, configurable: true });
    this.dispatchEvent(new Event("change"));
  };
};

const DISARM = () => {
  const proto = HTMLInputElement.prototype;
  if (proto.__ksavOriginal) proto.click = proto.__ksavOriginal;
};

/** Everything this file judges, read out of the window in one go. */
const READ = () => ({
  status: document.getElementById("status")?.textContent ?? "",
  crash: !!document.getElementById("crash-panel"),
  text: document.querySelector(".cm-content")?.textContent ?? "",
  title: document.getElementById("doc-title")?.textContent ?? "",
});

/**
 * Wait for the status slot to settle, rather than for a number of milliseconds.
 *
 * The import's own work is synchronous with respect to the click only as far as
 * the conversion; what follows it is `enterDoc`, a compile, and the compile's own
 * `rendering…` → verdict, and `scheduleQuiet` can put another one behind that.
 * A fixed wait measured the slot *while it was still changing*: it passed alone
 * and failed inside the full suite, where the machine is busier — the worst kind
 * of fence, green until it is inconvenient. The predicate says what "done" is;
 * the ceiling is only there so a hang fails instead of hanging.
 */
async function waitStatus(page, fits, ms = 8000) {
  const end = Date.now() + ms;
  let seen = await page.evaluate(READ);
  while (Date.now() < end && !fits(seen.status)) {
    await page.waitForTimeout(100);
    seen = await page.evaluate(READ);
  }
  return seen;
}

/**
 * Wait until the application has stopped moving.
 *
 * Two equal reads of the status slot, with none of the in-flight sentences in
 * them. That is the only idle signal the window offers from outside, and it is
 * what the assertions below read against: the click returns long before
 * `enterDoc` has swapped the editor and the compile behind it has landed, and a
 * fence that reads in that gap passes when run alone and fails inside the full
 * suite, where everything is a few hundred milliseconds later. It did both.
 */
async function settle(page, ms = 8000) {
  const end = Date.now() + ms;
  let prev = null;
  while (Date.now() < end) {
    const seen = await page.evaluate(READ);
    if (prev === seen.status && seen.status && !/מייבא|מרנדר/.test(seen.status)) return seen;
    prev = seen.status;
    await page.waitForTimeout(150);
  }
  return page.evaluate(READ);
}

/** Open File ▸ `label`, press it, and wait for the status to say something. */
async function importVia(page, label, arm) {
  await page.evaluate(DISARM);
  if (arm) await page.evaluate(ARM, arm);
  await page.click('.menu[data-menu="file"] .menu-btn');
  await page.locator(".menu-item", { hasText: label }).first().click();
  const seen = await settle(page);
  await page.evaluate(DISARM);
  return seen;
}

export async function run() {
  const app = await openApp();
  if (app.skip) {
    console.log(`SKIPPED importui: ${app.skip}`);
    return;
  }
  // **Which bundle this is, asked rather than assumed** — the same question
  // `browserlang.test.mjs` asks, for a reason this file found the hard way.
  //
  // Two builds are legitimate: `npm run build:wasm` puts the engine *in* the
  // bundle, and `npx vite build` (what `ci.yml`'s editor job builds) leaves it at
  // the other end of a wire, with no server running in this test. On the second,
  // an import still converts and still lands — but the compile it triggers
  // answers `✗ שגיאת רשת`, which is the *correct* reply to a service nothing is
  // listening on, and that error takes the status slot **by design**:
  // `holdStatus` in `runtime.ts` says an error compile outranks a held report,
  // because a document that no longer compiles is the more urgent fact.
  //
  // So exactly two assertions are about a compile having answered — the import
  // report *and* the report that survives it (#231) — and in a wire bundle they
  // are measuring the absent engine rather than the import. They skip, out loud,
  // and the rest of the file runs: the conversion, the document, the name, the
  // failure sentences and the crash panel are all the editor's own work. The two
  // that skip are fenced where an engine exists — `ci.yml`'s `browser engine` job
  // builds the offline bundle and runs `node test/run.mjs importui browserlang`
  // against it, which is the only build where a compile can answer.
  const engine = engineInBundle();
  const noEngine =
    "SKIPPED the import report: this dist keeps the engine at the other end of a wire, so the " +
    "compile answers `network error` and outranks the report by design — build with " +
    "`npm run build:wasm` to read it (CI does, in `browser engine`)";
  const { page, close } = app;
  try {
    const start = await page.evaluate(READ);
    ok("the application booted", start.status.length > 0, start.status);
    notOk("and it is not showing a crash panel before anything happened", start.crash);

    // -------------------------------------------------- UAT 16: Word, valid
    //
    // The one case that must *succeed* — because a test suite where every import
    // fails cannot tell "reported honestly" from "nothing ever worked".
    const good = await importVia(page, "ייבוא מ־Word", { name: "מבחן.docx", bytes: docx("שלום מעולם") });
    if (engine) ok("a valid .docx imports", good.status.includes("יובא"), good.status);
    else console.log(noEngine);
    notOk("and no crash panel appears", good.crash);
    ok("its words are on the page", good.text.includes("שלום מעולם"), good.text.slice(0, 80));
    ok("and the document is named after the file", good.title.includes("מבחן"), good.title);
    // **#231, which is why this file has a second clock in it.** The report is
    // written into the same slot the compile writes `rendering…` and `✓ N pages`
    // into, and for a while it lost: a writer importing forty pages with images
    // read *"✓ 40 pages"* and got a document without images. Read again after the
    // compile has had every chance to overwrite it.
    await page.waitForTimeout(1500);
    const afterCompile = await settle(page);
    if (engine) {
      ok(
        "and the report is still there once the compile has finished (#231)",
        afterCompile.status.includes("יובא"),
        afterCompile.status,
      );
    }

    // -------------------------------------------------- UAT 16: Word, broken
    //
    // Not a zip at all: the case the report was about. The writer gets a sentence
    // naming what failed, the document they were writing is still on screen, and
    // nothing reaches the crash panel.
    const before = await page.evaluate(READ);
    const broken = await importVia(page, "ייבוא מ־Word", { name: "שבור.docx", bytes: [1, 2, 3, 4, 5] });
    ok("a broken .docx is reported as a failed import", broken.status.includes("הייבוא נכשל"), broken.status);
    notOk("and it does not crash the application", broken.crash);
    check("the document that was open is still open", broken.text, before.text);
    check("and its name did not change", broken.title, before.title);
    ok("the sentence carries the disk's or the parser's own words", broken.status.length > 12, broken.status);

    // An empty file is a different failure on the same path — no header to read.
    const empty = await importVia(page, "ייבוא מ־Word", { name: "ריק.docx", bytes: [] });
    ok("an empty .docx is reported, not crashed", empty.status.includes("הייבוא נכשל") && !empty.crash, empty.status);
    check("the document survives that too", empty.text, before.text);

    // -------------------------------------------------- UAT 4: Org
    const org = await importVia(page, "ייבוא מ־Org", {
      name: "פרק.org",
      bytes: [...new TextEncoder().encode("* פרק ראשון\nטקסט בעברית\n")],
    });
    // Gated for the reason the docx report is: this reads the slot a compile
    // writes into, and a successful import schedules one.
    if (engine) ok("a valid .org imports", org.status.includes("יובא"), org.status);
    else console.log(noEngine);
    notOk("and no crash panel appears", org.crash);
    ok("its heading is on the page", org.text.includes("פרק ראשון"), org.text.slice(0, 80));

    const orgBefore = await page.evaluate(READ);
    const orgBroken = await importVia(page, "ייבוא מ־Org", { name: "שבור.org", bytes: [0xff, 0xfe, 0x00] });
    notOk("a broken .org does not crash the application", orgBroken.crash);
    // The bytes carry no text at all, so either answer is honest: the importer
    // makes an empty document and says it imported, or it refuses. What is not
    // honest is a crash, and what the old test asserted — that the document on
    // screen is not blank — was wrong: a file with no readable text producing an
    // empty document is the importer working. Both branches are checked, and
    // **which branch it is comes from the status slot**, so the whole judgement
    // is gated on there being a compile to overwrite that slot: in a wire bundle
    // with no server the slot answers `network error` and the branch would be
    // chosen by the absent engine.
    if (engine) {
      ok(
        "it either imports or says why — one of the two, never nothing",
        orgBroken.status.includes("יובא") || orgBroken.status.includes("הייבוא נכשל"),
        orgBroken.status,
      );
      if (orgBroken.status.includes("יובא")) {
        ok("the .org with no text in it imported as an empty document", orgBroken.text.length === 0, orgBroken.text);
      } else {
        check("the document survived the refusal unchanged", orgBroken.text, orgBefore.text);
      }
    } else {
      console.log(noEngine);
    }
    ok("the Org import did not delete what was there", orgBefore.text.length > 0);

    // -------------------------------------------------- cancelling
    //
    // A dismissed dialog is not an error and must not be reported as one: the
    // `focus` fallback in `importAs` resolves `null` after 800 ms, and the whole
    // handler returns. `CANCELLED` says nothing on purpose.
    const cancelled = await importVia(page, "ייבוא מ־Word", { name: "" });
    notOk("a cancelled dialog does not crash", cancelled.crash);
    ok(
      "and it says nothing — no failure sentence for a decision",
      !cancelled.status.includes("הייבוא נכשל"),
      cancelled.status,
    );
    check("the document is untouched by a cancel", cancelled.text, orgBroken.text);
  } finally {
    await close();
  }
}
