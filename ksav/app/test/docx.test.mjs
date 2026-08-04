// Reading a Word document in.
//
// The conversion is a pure string-to-string function, which is the whole reason
// it can be held here: WordprocessingML is verbose but entirely predictable, so
// the cases below are the real thing, hand-written, rather than a mock of it.
//
// The zip half is tested separately at the end, against a zip this file builds
// byte by byte — because the one part of a zip reader that is easy to get wrong
// is reading the *central directory's* extra-field length where the *local
// header's* was meant, and a hand-built archive is the only way to catch that
// without shipping a binary fixture into the repository.

import { check, ok, notOk } from "./harness.mjs";
import { convertDocument, parseXml, mostlyHebrew, unzip } from "../.tmp-test/docx.mjs";

/** Wrap body XML in the document element Word writes. */
const doc = (inner) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${inner}</w:body></w:document>`;

const para = (text, pPr = "") => `<w:p>${pPr}<w:r><w:t>${text}</w:t></w:r></w:p>`;

export function run() {
  // ----------------------------------------------------------------- the XML
  {
    const tree = parseXml('<a x="1"><b/>text<c y="2">deep</c></a>');
    const a = tree.children[0];
    check("elements and attributes", a.tag, "a");
    check("…with their values", a.attrs.x, "1");
    check("a self-closing tag has no children", a.children[0].children.length, 0);
    check("text is a child", a.children[1], "text");
    check("and nesting nests", a.children[2].children[0], "deep");
  }
  {
    // Entities, and the ampersand decoded last — decoding it first would turn
    // `&amp;lt;` into `<`, which is how a document that talks about markup ends
    // up with markup in it.
    const t = parseXml("<a>&amp;lt; &lt;b&gt; &#1488; &#x5D0;</a>").children[0];
    check("entities decode", t.children[0], "&lt; <b> א א");
  }
  {
    // A stray close tag must not reparent the rest of the document.
    const tree = parseXml("<a><b>one</b></zzz><c>two</c></a>");
    const a = tree.children[0];
    check("a stray close tag is ignored", a.children.length, 2);
    check("…and the following element stays put", a.children[1].tag, "c");
  }

  // ------------------------------------------------------------- paragraphs
  check("a plain paragraph is plain text", convertDocument(doc(para("שלום עולם"))).body.trim(), "שלום עולם");

  {
    const out = convertDocument(doc(para("פרק ראשון", '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'))).body;
    check("a Heading 1 style is a heading", out.trim(), "#כותרת1[פרק ראשון]");
  }
  {
    const out = convertDocument(doc(para("תת", '<w:pPr><w:pStyle w:val="Heading3"/></w:pPr>'))).body;
    ok("…at its own level", out.includes("#כותרת3["));
  }
  {
    const out = convertDocument(doc(para("במרכז", '<w:pPr><w:jc w:val="center"/></w:pPr>'))).body;
    check("alignment survives", out.trim(), "#מרכז[במרכז]");
  }

  // ------------------------------------------------------------------- runs
  {
    const p = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>מודגש</w:t></w:r></w:p>';
    check("bold", convertDocument(doc(p)).body.trim(), "#הדגשה[מודגש]");
  }
  {
    // `<w:b w:val="0"/>` means *not* bold. Word writes this constantly, to
    // cancel a style's own bold — reading presence alone would embolden half of
    // every imported document.
    const p = '<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>רגיל</w:t></w:r></w:p>';
    check("an explicitly-off flag is off", convertDocument(doc(p)).body.trim(), "רגיל");
  }
  {
    const p = '<w:p><w:r><w:rPr><w:b/><w:i/><w:u w:val="single"/></w:rPr><w:t>הכול</w:t></w:r></w:p>';
    const out = convertDocument(doc(p)).body.trim();
    ok("bold, italic and underline nest", out.includes("#הדגשה[#נטוי[#קו_תחתון[הכול]]]"));
  }
  {
    const p = '<w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r></w:p>';
    check("superscript", convertDocument(doc(p)).body.trim(), "#עילי[2]");
  }
  {
    // A `w:br` inside a run is a line break, not a paragraph break. Emitting a
    // bare newline would be a *paragraph* break in Ksav's source and would
    // silently restructure the document.
    const p = '<w:p><w:r><w:t>א</w:t><w:br/><w:t>ב</w:t></w:r></w:p>';
    ok("a line break is a line break", convertDocument(doc(p)).body.includes("#מעבר_שורה"));
    const pg = '<w:p><w:r><w:t>א</w:t><w:br w:type="page"/><w:t>ב</w:t></w:r></w:p>';
    ok("a page break is a page break", convertDocument(doc(pg)).body.includes("#מעבר_עמוד"));
  }

  // --------------------------------------------------------------- escaping
  {
    // Word text is arbitrary. A `]` in it would close the enclosing call and a
    // `#` would start a code expression — both corrupt the document with no
    // diagnostic the writer could act on.
    const p = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>a]b #c $d</w:t></w:r></w:p>';
    const out = convertDocument(doc(p)).body.trim();
    check("markup characters are escaped", out, "#הדגשה[a\\]b \\#c \\$d]");
  }

  // ------------------------------------------------------------------ lists
  {
    const numbering = `<w:numbering xmlns:w="w">
      <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
      <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
      <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
    </w:numbering>`;
    const item = (t, id) =>
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${id}"/></w:numPr></w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`;

    const bullets = convertDocument(doc(item("א", "1") + item("ב", "1")), "", numbering).body;
    ok("consecutive items become one list", bullets.includes("#רשימה("));
    check("…with each item", bullets.match(/פריט\[/g).length, 2);

    const numbered = convertDocument(doc(item("א", "2")), "", numbering).body;
    ok("a decimal list is a numbered list", numbered.includes("#ממוספרת("));

    // Without numbering.xml everything would be bullets, which silently turns a
    // sefer's numbered simanim into dots.
    const bare = convertDocument(doc(item("א", "2"))).body;
    ok("with no numbering.xml a list is still a list", bare.includes("#רשימה("));

    // Two different lists do not merge into one.
    const two = convertDocument(doc(item("א", "1") + item("ב", "2")), "", numbering).body;
    check("two lists stay two", (two.match(/#(רשימה|ממוספרת)\(/g) || []).length, 2);
  }

  // -------------------------------------------------------------- footnotes
  {
    const footnotes = `<w:footnotes xmlns:w="w">
      <w:footnote w:id="-1"><w:p><w:r><w:t>separator</w:t></w:r></w:p></w:footnote>
      <w:footnote w:id="2"><w:p><w:r><w:t>עיין רש״י שם</w:t></w:r></w:p></w:footnote>
    </w:footnotes>`;
    const p = '<w:p><w:r><w:t>בראשית</w:t></w:r><w:r><w:footnoteReference w:id="2"/></w:r></w:p>';
    const out = convertDocument(doc(p), footnotes).body;
    ok("a footnote comes across", out.includes("#הערה[עיין רש״י שם]"));
    notOk("Word's separator entry does not", out.includes("separator"));

    // A reference with no matching body prints nothing rather than an empty
    // footnote, which would put a stray number on the page.
    const orphan = '<w:p><w:r><w:footnoteReference w:id="99"/></w:r></w:p>';
    notOk("an orphaned reference prints nothing", convertDocument(doc(orphan), footnotes).body.includes("#הערה"));
  }

  // ----------------------------------------------------------------- tables
  {
    const cell = (t) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
    const tbl = `<w:tbl><w:tr>${cell("א")}${cell("ב")}</w:tr><w:tr>${cell("ג")}${cell("ד")}</w:tr></w:tbl>`;
    const out = convertDocument(doc(tbl)).body;
    ok("a table is a table", out.includes("#טבלה(עמודות: 2"));
    check("…with every cell", out.match(/תא\[/g).length, 4);
  }
  {
    // A ragged row must not shift the following cells into the wrong column.
    const cell = (t) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
    const tbl = `<w:tbl><w:tr>${cell("א")}${cell("ב")}</w:tr><w:tr>${cell("ג")}</w:tr></w:tbl>`;
    const out = convertDocument(doc(tbl)).body;
    check("a short row is padded", out.match(/תא\[/g).length, 4);
  }

  // -------------------------------------------------------------- direction
  ok("a Hebrew document is right-to-left", mostlyHebrew("שלום עולם"));
  notOk("an English one is not", mostlyHebrew("hello world"));
  // A document with no prose at all must not be declared English by the Latin
  // letters in its own generated markup.
  ok("no prose defaults to Hebrew", mostlyHebrew(""));
  check("the direction is reported", convertDocument(doc(para("hello"))).dir, "ltr");
  check("…and for Hebrew", convertDocument(doc(para("שלום"))).dir, "rtl");

  // ---------------------------------------------------------------- honesty
  {
    const withImage = '<w:p><w:r><w:drawing><wp:inline/></w:drawing></w:r></w:p>';
    const out = convertDocument(doc(withImage));
    ok("an image is reported as dropped", out.dropped.includes("images"));
    check("and a clean document reports nothing", convertDocument(doc(para("שלום"))).dropped, []);
  }

  // -------------------------------------------------------------- the blanks
  {
    const out = convertDocument(doc(para("א") + "<w:p/><w:p/>" + para("ב"))).body;
    check("a run of empty paragraphs is one blank line", out.trim(), "א\n\nב");
  }

  // ------------------------------------------------------------------- zip
  return (async () => {
    // A stored (uncompressed) zip, built here. The trap this catches: the
    // central directory's extra-field length is *not* the local header's, and
    // Word writes different ones — reading the wrong one lands the data offset
    // in the middle of the file with no error, just garbage.
    const name = "word/document.xml";
    const content = new TextEncoder().encode(doc(para("שלום")));
    const nameBytes = new TextEncoder().encode(name);
    const LOCAL_EXTRA = 8; // the local header carries an extra field…
    const CDIR_EXTRA = 0; // …and the central directory carries a different one.

    const local = new Uint8Array(30 + nameBytes.length + LOCAL_EXTRA + content.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint32(18, content.length, true);
    lv.setUint32(22, content.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, LOCAL_EXTRA, true);
    local.set(nameBytes, 30);
    local.set(content, 30 + nameBytes.length + LOCAL_EXTRA);

    const cdir = new Uint8Array(46 + nameBytes.length + CDIR_EXTRA);
    const cv = new DataView(cdir.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(20, content.length, true);
    cv.setUint32(24, content.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, CDIR_EXTRA, true);
    cv.setUint32(42, 0, true); // local header offset
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

    const files = await unzip(zip);
    ok("the archive's entry is found", files.has(name));
    ok(
      "…and its bytes are the file's, not an offset short of them",
      new TextDecoder().decode(files.get(name)).includes("שלום"),
    );
  })();
}
