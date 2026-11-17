// Decompression, with a ceiling.
//
// Two things in this application inflate bytes that came from somebody else: a
// `.docx` the writer imported, and the `#ksav=…` fragment of a link a stranger
// sent. Both used `DecompressionStream` straight into `new Response(stream)`,
// which reads to the end and buffers whatever comes out. Deflate's ratio is
// bounded only by its window — a few hundred kilobytes of input can describe
// gigabytes of output — so both routes let the *input* decide how much memory the
// application allocates.
//
// That is not a crash the writer can recognise. In a browser tab it is a tab
// that dies with no message; in the desktop shell it is a process that
// disappears. Neither leaves a trace a bug report can name, and neither is a
// narrative anybody would connect to "I opened the file my colleague sent".
//
// So there is one bounded inflate and both routes use it. The ceiling is argued
// from the documents themselves rather than picked out of the air: the largest
// `.ksav` in the engine's own templates is a few hundred kilobytes and a Word
// document of the same sefer is under ten megabytes, so a limit an order of
// magnitude above that refuses only files that were never going to open.
//
// **The declared size is not the control.** A zip's central directory states what
// each entry *claims* to decompress to, and an archive is free to lie; the number
// is checked as well, because refusing a bomb before inflating it is cheaper and
// gives a better sentence, but only the bytes actually produced are counted.

/** What one inflate may produce. */
export interface Ceiling {
  /** Bytes for a single entry. */
  readonly entry: number;
  /** Bytes across a whole archive, so many entries cannot add up to a bomb. */
  readonly total: number;
}

const MB = 1024 * 1024;

/**
 * A Word document: one `word/document.xml` and its footnotes.
 *
 * 48 MB per entry because WordprocessingML is verbose — every run carries its
 * `w:rPr` — and a long sefer with tables measured at roughly 1:400 against the
 * text's own size. 128 MB in total across the entries the importer reads.
 */
export const DOCX_CEILING: Ceiling = { entry: 48 * MB, total: 128 * MB };

/**
 * A share link.
 *
 * A link is a URL, and the practical ceiling on a URL is what a browser and a
 * chat client will carry — a couple of megabytes. 96 MB of document out of that
 * is already far past anything a writer would paste; the limit exists so that a
 * *hostile* fragment cannot ask for a gigabyte.
 */
export const SHARE_CEILING: Ceiling = { entry: 96 * MB, total: 96 * MB };

/** A refusal a writer can read, in the voice of the thing that was refused. */
export function tooBig(what: string, bytes: number, limit: number): string {
  return `${what} would decompress to ${show(bytes)}, more than the ${show(limit)} this application will read`;
}

/** Bytes as a writer would say them — `1.4 MB`, not `1468006`. */
export function show(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/**
 * Raw-deflate bytes, bounded by `ceiling`.
 *
 * `what` names the entry in the sentence, because "a file would decompress to
 * 3.9 GB" tells a writer nothing about which file in the archive it was.
 *
 * The counter is checked *as chunks arrive*, which is the whole point: reading
 * the stream to completion and then measuring what it produced would allocate
 * exactly the memory this exists to prevent. Throwing out of the read loop
 * cancels the stream through `reader.cancel()`, so the decompressor stops rather
 * than finishing into a discarded buffer.
 */
export async function inflateBounded(
  data: Uint8Array,
  ceiling: Pick<Ceiling, "entry">,
  what: string,
): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > ceiling.entry) {
        await reader.cancel();
        throw new Error(tooBig(what, total, ceiling.entry));
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * Decompression that is allowed to fail quietly, for a caller that has a good
 * answer to "there is no document here" — a share link that does not decode is
 * null, not an exception in the middle of boot.
 */
export async function inflateOrNull(
  data: Uint8Array,
  ceiling: Pick<Ceiling, "entry">,
  what: string,
): Promise<Uint8Array | null> {
  try {
    return await inflateBounded(data, ceiling, what);
  } catch {
    return null;
  }
}