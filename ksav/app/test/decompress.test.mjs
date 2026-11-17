// Decompression that cannot be talked into allocating a gigabyte.
//
// Two routes in this application inflate bytes from somebody else: a `.docx` the
// writer imported, and the `#ksav=…` fragment of a link a stranger sent. Both used
// `DecompressionStream` straight into `new Response(stream)`, which reads to the
// end and buffers whatever came out — and deflate's ratio is bounded only by its
// window, so the *input* decided how much memory the application allocated.
//
// A tab that dies with no message, or a desktop process that disappears, is not a
// failure anybody can report. This file is the fence on the ceiling, and it is
// deliberately built out of real archives and real deflate rather than a mock:
// the defect was in the interaction with the platform's decompressor, and a stub
// would have agreed with whatever the code believed.

import { check, ok, notOk } from "./harness.mjs";
import { inflateBounded, inflateOrNull, tooBig, show, DOCX_CEILING } from "../.tmp-test/decompress.mjs";
import { unzip, importDocx } from "../.tmp-test/docx.mjs";

/** Raw deflate, the way the application compresses. */
async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A zip, with the declared uncompressed size under the caller's control.
 *
 * `declared` is the field an archive is free to lie about, which is the reason
 * `unzip` cannot use it as its control — and why one of the assertions below is a
 * lying archive.
 */
function zip(entries) {
  const enc = new TextEncoder();
  const locals = [];
  const dirs = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.data;
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, e.method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, e.declared ?? data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);

    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(10, e.method, true);
    dv.setUint32(20, data.length, true);
    dv.setUint32(24, e.declared ?? data.length, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true);
    dir.set(name, 46);

    locals.push(local);
    dirs.push(dir);
    offset += local.length;
  }
  const localBytes = locals.reduce((n, l) => n + l.length, 0);
  const dirBytes = dirs.reduce((n, d) => n + d.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, dirBytes, true);
  ev.setUint32(16, localBytes, true);

  const out = new Uint8Array(localBytes + dirBytes + eocd.length);
  let at = 0;
  for (const l of locals) {
    out.set(l, at);
    at += l.length;
  }
  for (const d of dirs) {
    out.set(d, at);
    at += d.length;
  }
  out.set(eocd, at);
  return out;
}

export async function run() {
  // ------------------------------------------------------------ the sentence
  {
    ok("a refusal says how big it would have been", tooBig("“x”", 3 * 1024 * 1024, 1024 * 1024).includes("3.0 MB"));
    ok("…and what the ceiling is", tooBig("“x”", 3 * 1024 * 1024, 1024 * 1024).includes("1.0 MB"));
    check("bytes are shown the way a writer would say them", show(1468006), "1.4 MB");
  }

  // ------------------------------------------------ the control that counts
  {
    // 40 MB of one byte compresses to a few tens of kilobytes. Nothing in this
    // file's own numbers is large; the *output* is, which is the whole point.
    const bomb = await deflate(new Uint8Array(40 * 1024 * 1024));
    ok("the fixture compresses small enough to be a plausible file", bomb.length < 200 * 1024, `${bomb.length} bytes`);

    let said = "";
    try {
      await inflateBounded(bomb, { entry: 1024 * 1024 }, "“bomb”");
    } catch (e) {
      said = String(e?.message ?? e);
    }
    ok("a bomb is refused rather than inflated", said.includes("would decompress to"), said);
    ok("…and the sentence names the entry", said.includes("bomb"), said);
    // The number in the sentence is the count at the moment of crossing, not the
    // size of the finished output — which is how this assertion tells "stopped
    // early" from "measured afterwards". A version that inflated first and
    // measured second would say 40 MB here.
    const reported = /would decompress to ([\d.]+) MB/u.exec(said)?.[1];
    ok("…and it stopped early, rather than measuring afterwards", Number(reported) < 4, said);
  }

  {
    // A ceiling is not the same thing as a refusal of everything: the ordinary
    // path has to keep working, or the fix broke imports.
    const text = new TextEncoder().encode("<w:document/>".repeat(1000));
    const out = await inflateBounded(await deflate(text), { entry: 1024 * 1024 }, "“small”");
    check("an ordinary entry comes back byte for byte", out.length, text.length);
    ok("…and is quiet", out[0] === text[0]);
    check("inflateOrNull gives null rather than throwing", await inflateOrNull(
      await deflate(new Uint8Array(8 * 1024 * 1024)),
      { entry: 1024 },
      "“big”",
    ), null);
  }

  // ------------------------------------------------- the importer, end to end
  {
    const xml = '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>שלום</w:t></w:r></w:p></w:body></w:document>';
    const doc = new TextEncoder().encode(xml);

    // A bomb filed where the importer never looks. It used to be inflated anyway,
    // because `unzip` decompressed every entry into a map three keys were read
    // from.
    const mediaBomb = await deflate(new Uint8Array(40 * 1024 * 1024));
    const archive = zip([
      { name: "word/document.xml", data: doc, method: 0 },
      { name: "word/media/big.png", data: mediaBomb, method: 8, declared: 40 * 1024 * 1024 },
    ]);
    const result = await importDocx(archive);
    ok("a file with an image bomb imports the text it needs", result.body.includes("שלום"), result.body.slice(0, 40));
    const only = await unzip(archive, { only: ["word/document.xml"] });
    check("…and nothing else is even decompressed", [...only.keys()], ["word/document.xml"]);

    // The same bomb in the entry that *is* read: refused, with the name in it.
    // Past the Word ceiling on purpose — 60 MB against 48 — because a bomb the
    // ceiling genuinely admits is not a bomb this test can ask about.
    const wantedBomb = zip([
      { name: "word/document.xml", data: await deflate(new Uint8Array(60 * 1024 * 1024)), method: 8, declared: 60 * 1024 * 1024 },
    ]);
    let refused = "";
    try {
      await importDocx(wantedBomb);
    } catch (e) {
      refused = String(e?.message ?? e);
    }
    ok("a bomb where the text should be is refused", refused.includes("word/document.xml"), refused);
    ok("…with a size a writer can read", refused.includes("MB"), refused);

    // **The lying archive.** Declared tiny, inflates past the ceiling: the
    // declared-size check passes and only the byte counter refuses it, which is
    // the assertion that proves which of the two checks is the control.
    const liar = zip([
      { name: "word/document.xml", data: await deflate(new Uint8Array(60 * 1024 * 1024)), method: 8, declared: 128 },
    ]);
    let lied = "";
    try {
      await importDocx(liar);
    } catch (e) {
      lied = String(e?.message ?? e);
    }
    ok("an archive that understates its size is still refused", lied.includes("would decompress to"), lied);
    notOk("…and not by the declared-size check", lied.includes("128 bytes"), lied);
  }

  // ------------------------------------------ the numbers this file rests on
  {
    // The ceilings are chosen, not measured, so they are stated: an ordinary Word
    // document of a sefer is a few megabytes, and the cap is an order of magnitude
    // past that. A test that only asserted "there is a number" would pass with the
    // number set to 1 KB and break every import.
    ok("the Word ceiling leaves room for a real sefer", DOCX_CEILING.entry >= 16 * 1024 * 1024, `${DOCX_CEILING.entry}`);
    ok("…and is not unbounded", DOCX_CEILING.total <= 512 * 1024 * 1024, `${DOCX_CEILING.total}`);
  }
}