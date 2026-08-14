// Reading a Word document in.
//
// Ksav solved the hard direction first — Typst's reflowable HTML in a Word
// envelope, so a rebbi can edit what he is sent — and skipped the easy one. That
// is backwards for adoption: every bochur already has half a sefer in Word, and
// "start again in this new thing" is a much harder sentence to say than "open
// what you have".
//
// A `.docx` is a zip of XML. `word/document.xml` holds the body, and the shape
// of it is dull and regular: `w:p` paragraphs of `w:r` runs of `w:t` text, with
// properties in `w:pPr` and `w:rPr`. Reading the ninety per cent that is
// actually in a bochur's file — headings, bold, italic, lists, tables,
// footnotes, alignment — is a few hundred lines and no dependencies.
//
// Three things are deliberately *not* attempted, because a bad conversion is
// worse than an honest gap: images (they would need to travel onto the assets
// channel and be renamed), styles as styles rather than as their effects, and
// anything Word calls a "field". `importReport` says what was dropped.

import { mostlyHebrew, type ImportResult } from "./interchange";
import { typstContent } from "./typst-escape";

// ---------------------------------------------------------------- the zip

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;

/**
 * The files in a zip, by name.
 *
 * A hand-rolled reader rather than a library, because the format's central
 * directory is a hundred lines and the only decompression needed is raw
 * deflate, which every target platform now has natively. A dependency here
 * would be 8 KB in every bundle to read a file most writers never import.
 */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record is at the end, after a comment of up to
  // 64 KB — so it is found by scanning backwards for its signature rather than
  // by arithmetic.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65536; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);

  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== CDIR_SIG) break;
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;

    // The local header repeats the name and extra field, and its *own* lengths
    // are the ones that count: Word writes a different extra field there.
    const localNameLen = view.getUint16(localAt + 26, true);
    const localExtraLen = view.getUint16(localAt + 28, true);
    const dataAt = localAt + 30 + localNameLen + localExtraLen;
    const raw = bytes.subarray(dataAt, dataAt + compressedSize);
    out.set(name, method === 0 ? raw : await inflateRaw(raw));
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------------------------------------------------------------- the XML

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: (XmlNode | string)[];
}

/**
 * A minimal XML tree.
 *
 * `DOMParser` would do this, and is not used for one reason: it does not exist
 * in Node, and the whole conversion below is a pure string-to-string function
 * that has to be testable without a browser. WordprocessingML is also
 * exceptionally well-behaved XML — no DTDs, no entities beyond the five, no
 * processing instructions past the declaration — so the parser can be small
 * without being a liability.
 */
export function parseXml(src: string): XmlNode {
  const root: XmlNode = { tag: "#root", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  const tagRe = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[^>]*\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src))) {
    const text = src.slice(last, m.index);
    if (text) stack[stack.length - 1].children.push(decodeEntities(text));
    last = tagRe.lastIndex;
    if (m[5] !== undefined) {
      stack[stack.length - 1].children.push(m[5]);
      continue;
    }
    if (!m[2]) continue; // a declaration or a comment
    if (m[1]) {
      // A close tag. Unwinding to the matching open rather than popping blindly
      // keeps one stray `</w:x>` from reparenting the rest of the document.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === m[2]) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const node: XmlNode = { tag: m[2], attrs: parseAttrs(m[3] ?? ""), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!m[4]) stack.push(node);
  }
  const tail = src.slice(last);
  if (tail) stack[stack.length - 1].children.push(decodeEntities(tail));
  return root;
}

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out[m[1]] = decodeEntities(m[2] ?? m[3] ?? "");
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    // Ampersand last, or `&amp;lt;` would decode twice into `<`.
    .replace(/&amp;/g, "&");
}

/** Direct children with this tag. */
function kids(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter((c): c is XmlNode => typeof c !== "string" && c.tag === tag);
}

/** The first descendant with this tag, at any depth. */
function find(node: XmlNode, tag: string): XmlNode | null {
  for (const c of node.children) {
    if (typeof c === "string") continue;
    if (c.tag === tag) return c;
    const deeper = find(c, tag);
    if (deeper) return deeper;
  }
  return null;
}

/** Every descendant with this tag, in document order. */
function findAll(node: XmlNode, tag: string): XmlNode[] {
  const out: XmlNode[] = [];
  for (const c of node.children) {
    if (typeof c === "string") continue;
    if (c.tag === tag) out.push(c);
    out.push(...findAll(c, tag));
  }
  return out;
}

// ---------------------------------------------------------------- conversion

// `ImportResult` and `mostlyHebrew` moved to `interchange.ts` when Org became a
// second way in: both are about importing, not about Word, and `main.ts` reports
// what did not come across in one sentence for every route there is.

const HEADING_LEVELS: Record<string, number> = {
  heading1: 1, heading2: 2, heading3: 3, heading4: 4, heading5: 5, heading6: 6,
  title: 1, subtitle: 2,
};

/** The `w:val` of a property element, or null when the element is absent. */
function val(node: XmlNode | null): string | null {
  return node ? (node.attrs["w:val"] ?? "") : null;
}

/**
 * Is a boolean run property on?
 *
 * `<w:b/>` means on, `<w:b w:val="0"/>` means off. Reading presence alone would
 * turn every "explicitly not bold" run bold — which Word writes constantly,
 * because that is how it cancels a style's own bold.
 */
function flagOn(rPr: XmlNode | null, tag: string): boolean {
  if (!rPr) return false;
  const el = kids(rPr, tag)[0];
  if (!el) return false;
  const v = el.attrs["w:val"];
  return v !== "0" && v !== "false" && v !== "none";
}

/** One run's text, wrapped in whatever the run's properties ask for. */
function convertRun(run: XmlNode): string {
  const rPr = kids(run, "w:rPr")[0] ?? null;
  // Escaped text and generated commands, kept apart until the end.
  //
  // This built one string and escaped the whole of it, so the `#מעבר_שורה` it
  // had just written was escaped too: what came out was `\#מעבר\_שורה`, which
  // Typst sets as the literal words rather than breaking the line. A `.docx`
  // with a shift-return in it imported as visible markup in the middle of the
  // sentence.
  //
  // The test asserted `.includes("#מעבר_שורה")` and passed, because
  // `\#מעבר_שורה` *contains* that substring — right up to the day `typstContent`
  // learned to escape `_` as well, which is what the ten-character list from
  // `girsa-ksav` brought with it. The bug was there the whole time and the
  // assertion could not see it.
  const parts: string[] = [];
  let text = "";
  const flush = () => {
    if (text) parts.push(typstContent(text));
    text = "";
  };
  for (const child of run.children) {
    if (typeof child === "string") continue;
    if (child.tag === "w:t") text += textOf(child);
    else if (child.tag === "w:tab") text += " ";
    // A `w:br` inside a run is a line break that does not start a paragraph.
    // `#מעבר_שורה` is exactly that; a bare "\n" would be a paragraph break in
    // Ksav's source and would silently restructure the document.
    else if (child.tag === "w:br") {
      flush();
      parts.push(child.attrs["w:type"] === "page" ? "\n\n#מעבר_עמוד\n\n" : "#מעבר_שורה\n");
    }
  }
  flush();
  if (!parts.length) return "";
  let out = parts.join("");
  // Innermost first, so the nesting reads the way it was written.
  const vert = rPr ? val(kids(rPr, "w:vertAlign")[0] ?? null) : null;
  if (vert === "superscript") out = `#עילי[${out}]`;
  else if (vert === "subscript") out = `#תחתי[${out}]`;
  if (flagOn(rPr, "w:strike")) out = `#קו_חוצה[${out}]`;
  if (flagOn(rPr, "w:u")) out = `#קו_תחתון[${out}]`;
  if (flagOn(rPr, "w:i")) out = `#נטוי[${out}]`;
  if (flagOn(rPr, "w:b")) out = `#הדגשה[${out}]`;
  return out;
}

/** The text of a `w:t`, honouring `xml:space="preserve"`. */
function textOf(node: XmlNode): string {
  const raw = node.children.filter((c): c is string => typeof c === "string").join("");
  return node.attrs["xml:space"] === "preserve" ? raw : raw;
}

/** A paragraph's runs, converted and concatenated, footnote markers included. */
function paragraphText(p: XmlNode, footnotes: Map<string, string>): string {
  let out = "";
  for (const child of p.children) {
    if (typeof child === "string") continue;
    if (child.tag === "w:r") {
      const ref = find(child, "w:footnoteReference");
      if (ref) {
        const id = ref.attrs["w:id"] ?? "";
        const note = footnotes.get(id);
        // A reference to a footnote that is not in footnotes.xml is Word's own
        // separator entries (-1 and 0). Dropping the marker is right; printing
        // an empty footnote would put a stray number on the page.
        if (note) out += `#הערה[${note}]`;
        continue;
      }
      out += convertRun(child);
    } else if (child.tag === "w:hyperlink") {
      for (const r of kids(child, "w:r")) out += convertRun(r);
    }
  }
  return out;
}

interface ListState {
  /** The `w:numId` of the list currently open, or null. */
  numId: string | null;
  items: string[];
  ordered: boolean;
}

/**
 * Turn `word/document.xml` into Ksav markup.
 *
 * Pure: a string in, a string out. Everything that needs a zip, a file picker or
 * a browser is above this line, which is what lets the whole conversion be
 * tested against hand-written WordprocessingML.
 */
export function convertDocument(
  documentXml: string,
  footnotesXml = "",
  numberingXml = "",
): ImportResult {
  const doc = parseXml(documentXml);
  const dropped = new Set<string>();
  const footnotes = collectFootnotes(footnotesXml);
  const ordered = orderedNumIds(numberingXml);
  const body = kids(doc, "w:document")[0] ?? doc;
  const bodyEl = find(body, "w:body") ?? body;

  const out: string[] = [];
  let list: ListState = { numId: null, items: [], ordered: false };

  const flushList = () => {
    if (!list.items.length) return;
    const command = list.ordered ? "ממוספרת" : "רשימה";
    out.push(`#${command}(\n${list.items.map((i) => `  פריט[${i}],`).join("\n")}\n)`);
    list = { numId: null, items: [], ordered: false };
  };

  for (const block of bodyEl.children) {
    if (typeof block === "string") continue;
    if (block.tag === "w:tbl") {
      flushList();
      out.push(convertTable(block, footnotes));
      continue;
    }
    if (block.tag !== "w:p") {
      if (block.tag === "w:sdt") dropped.add("sdt");
      continue;
    }
    const pPr = kids(block, "w:pPr")[0] ?? null;
    const text = paragraphText(block, footnotes);
    const numPr = pPr ? kids(pPr, "w:numPr")[0] : null;

    if (numPr) {
      const numId = val(kids(numPr, "w:numId")[0] ?? null) ?? "";
      if (list.numId !== null && list.numId !== numId) flushList();
      list.numId = numId;
      list.ordered = ordered.has(numId);
      if (text) list.items.push(text);
      continue;
    }
    flushList();

    if (!text.trim()) {
      // An empty paragraph is a blank line, and a run of them is still one.
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }

    const style = (val(pPr ? (kids(pPr, "w:pStyle")[0] ?? null) : null) ?? "").toLowerCase();
    const level = HEADING_LEVELS[style.replace(/\s/g, "")];
    if (level) {
      out.push(`#כותרת${level}[${text}]`);
      continue;
    }
    const align = val(pPr ? (kids(pPr, "w:jc")[0] ?? null) : null);
    if (align === "center") out.push(`#מרכז[${text}]`);
    else if (align === "right") out.push(`#ימין[${text}]`);
    else if (align === "left") out.push(`#שמאל[${text}]`);
    else out.push(text);
  }
  flushList();

  if (findAll(bodyEl, "w:drawing").length || findAll(bodyEl, "w:pict").length) dropped.add("images");
  if (findAll(bodyEl, "w:fldSimple").length || findAll(bodyEl, "w:instrText").length) {
    dropped.add("fields");
  }

  const text = out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return { body: text + "\n", dir: mostlyHebrew(text) ? "rtl" : "ltr", dropped: [...dropped] };
}

/** Footnote bodies by id, flattened to a single line of markup each. */
function collectFootnotes(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!xml) return out;
  const root = parseXml(xml);
  for (const note of findAll(root, "w:footnote")) {
    const id = note.attrs["w:id"] ?? "";
    // Word's separator and continuation entries carry ids -1 and 0 and hold a
    // horizontal rule, not a note.
    if (id === "-1" || id === "0") continue;
    const text = kids(note, "w:p")
      .map((p) => paragraphText(p, out))
      .filter(Boolean)
      .join(" ");
    if (text) out.set(id, text);
  }
  return out;
}

/**
 * Which `w:numId`s are numbered rather than bulleted.
 *
 * `numbering.xml` maps a `w:numId` to an abstract list, and the abstract list
 * says whether level 0 is `bullet` or a number format. Without it every list
 * would import as bullets, which silently renumbers a sefer's simanim into dots.
 */
function orderedNumIds(xml: string): Set<string> {
  const out = new Set<string>();
  if (!xml) return out;
  const root = parseXml(xml);
  const abstractOrdered = new Set<string>();
  for (const abs of findAll(root, "w:abstractNum")) {
    const id = abs.attrs["w:abstractNumId"] ?? "";
    const lvl = kids(abs, "w:lvl").find((l) => (l.attrs["w:ilvl"] ?? "0") === "0");
    const fmt = lvl ? val(kids(lvl, "w:numFmt")[0] ?? null) : null;
    if (fmt && fmt !== "bullet" && fmt !== "none") abstractOrdered.add(id);
  }
  for (const num of findAll(root, "w:num")) {
    const numId = num.attrs["w:numId"] ?? "";
    const absId = val(kids(num, "w:abstractNumId")[0] ?? null) ?? "";
    if (abstractOrdered.has(absId)) out.add(numId);
  }
  return out;
}

function convertTable(tbl: XmlNode, footnotes: Map<string, string>): string {
  const rows = kids(tbl, "w:tr");
  if (!rows.length) return "";
  const columns = Math.max(...rows.map((r) => kids(r, "w:tc").length));
  const cells: string[] = [];
  for (const row of rows) {
    const tcs = kids(row, "w:tc");
    for (let i = 0; i < columns; i++) {
      const tc = tcs[i];
      const text = tc ? kids(tc, "w:p").map((p) => paragraphText(p, footnotes)).join(" ") : "";
      cells.push(`תא[${text}]`);
    }
  }
  const lines: string[] = [];
  for (let i = 0; i < cells.length; i += columns) {
    lines.push("  " + cells.slice(i, i + columns).join(", ") + ",");
  }
  return `#טבלה(עמודות: ${columns},\n${lines.join("\n")}\n)`;
}

/** Read a `.docx` file into Ksav markup. */
export async function importDocx(bytes: Uint8Array): Promise<ImportResult> {
  const files = await unzip(bytes);
  const read = (name: string) => {
    const raw = files.get(name);
    return raw ? new TextDecoder().decode(raw) : "";
  };
  const documentXml = read("word/document.xml");
  if (!documentXml) throw new Error("no word/document.xml — is this a .docx?");
  return convertDocument(documentXml, read("word/footnotes.xml"), read("word/numbering.xml"));
}
