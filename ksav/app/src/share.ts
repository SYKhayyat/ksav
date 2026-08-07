// A link that opens a document, with nothing at the other end of it.
//
// The ask was "let a rebbi read this and comment on it without installing
// anything". Real-time collaboration is the wrong answer to that — it needs a
// server, an account system and somebody to keep them running, which is the same
// wall this project has been staring at since the beginning. The right answer is
// much smaller and already three quarters built: the review tools exist and
// rewrite the source, and the wasm build is a static site that compiles the
// document in the reader's own browser.
//
// So: put the document **in the URL**, in the fragment. A fragment is never sent
// to a server — not in the request line, not in a log, not to whoever is hosting
// the static files. The document travels inside the link and nowhere else, which
// for somebody's unpublished chiddushim is not a detail.
//
// The cost is a length limit, and it is stated rather than discovered: see
// `TOO_LONG`.

/**
 * How long a link may get before it stops being one.
 *
 * Browsers themselves handle far more, but a link is pasted into WhatsApp, into
 * an email, into a chat that wraps at some width nobody controls. Past about
 * this size the chance of it arriving intact drops sharply, and a link that
 * *nearly* works is worse than a refusal: the reader gets a document that
 * decodes to garbage rather than a message saying to send the file.
 */
export const TOO_LONG = 60_000;

export interface SharedDoc {
  title: string;
  body: string;
  /** The direction the document was written in, so it reads correctly. */
  dir?: "rtl" | "ltr";
  /** Set when the sender asked for comments back rather than for a read. */
  review?: boolean;
  /**
   * The writer's own `#let` definitions, and the page they set the document on.
   *
   * These carried in the `.ksav` file and not in the link, which is the whole
   * defect: a document with one custom command produced **"Link copied ✓"** at
   * this end and a compile error at the other, and a sefer set in two columns on
   * B5 arrived as one column on A4 — silently, because a document that lays out
   * differently still lays out.
   *
   * There are five definitions of "a document" in this application — the store
   * record, the `.ksav` file, this link, the crash rescue and the library index —
   * and the `.ksav` codec learned about these two (`docs.ts`) while the link did
   * not. `shareTest` in `test/share.test.mjs` now holds them to the same list, so
   * the next field to be added to one has to be added to both or go red.
   */
  customCommands?: string;
  config?: Record<string, unknown>;
}

/** base64url — the URL-safe alphabet, and no padding to waste characters. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deflate(text: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(text);
  const stream = new Blob([input as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

/**
 * The fragment for a document — `#ksav=…`.
 *
 * Compressed before encoding, and it matters far more than it sounds: Ksav
 * markup is extremely repetitive (`#הערה[`, `פריט[`, the same command names over
 * and over) and Hebrew is three bytes a character in UTF-8. Deflate typically
 * takes a sefer chapter to a quarter of its size, which is the difference
 * between a link that can be sent and one that cannot.
 */
export async function encodeShare(doc: SharedDoc): Promise<string> {
  // Single letters because every byte is a character of URL that a chat client
  // may wrap. `c` and `s` are omitted entirely when absent rather than sent as
  // `null`, which is what keeps a plain document's link exactly as short as it
  // was before these two were carried at all.
  const json = JSON.stringify({
    t: doc.title,
    b: doc.body,
    d: doc.dir,
    r: doc.review ? 1 : undefined,
    c: doc.customCommands?.trim() ? doc.customCommands : undefined,
    s: doc.config && Object.keys(doc.config).length ? doc.config : undefined,
  });
  return "ksav=" + toBase64Url(await deflate(json));
}

/**
 * Read a document out of a fragment, or null when there is not one.
 *
 * Null for anything that is not a Ksav link, and null for a Ksav link that does
 * not decode — a truncated one, most likely, which is exactly what a chat client
 * that wrapped the URL produces. Throwing would blank the app on a bad paste.
 */
export async function decodeShare(fragment: string): Promise<SharedDoc | null> {
  const raw = fragment.replace(/^#/, "");
  if (!raw.startsWith("ksav=")) return null;
  try {
    const json = await inflate(fromBase64Url(raw.slice(5)));
    const value = JSON.parse(json) as {
      t?: string;
      b?: string;
      d?: string;
      r?: number;
      c?: string;
      s?: Record<string, unknown>;
    };
    if (typeof value?.b !== "string") return null;
    return {
      title: typeof value.t === "string" ? value.t : "",
      body: value.b,
      dir: value.d === "ltr" ? "ltr" : "rtl",
      review: value.r === 1,
      // Absent stays absent. A link made before these were carried must open as
      // a document with no custom commands, not as one with an empty string of
      // them — `""` and "none" are different instructions to the assembler.
      ...(typeof value.c === "string" && value.c ? { customCommands: value.c } : {}),
      ...(value.s && typeof value.s === "object" ? { config: value.s } : {}),
    };
  } catch {
    return null;
  }
}

export interface ShareLink {
  url: string;
  /** True when the link is past `TOO_LONG` and should not be relied on. */
  tooLong: boolean;
  /** Characters, for the message that says how much too long. */
  length: number;
}

/**
 * A complete link to this document, against a given base URL.
 *
 * The base is passed in rather than read from `location`, so that this stays a
 * pure function — and so a desktop build, which has no useful URL of its own,
 * can name the hosted copy instead of producing a `tauri://localhost` link that
 * works on precisely one machine.
 */
export async function shareLink(base: string, doc: SharedDoc): Promise<ShareLink> {
  const fragment = await encodeShare(doc);
  // Everything before an existing fragment, so a link made from a page that was
  // itself opened from a link does not accumulate them.
  const clean = base.split("#")[0];
  const url = `${clean}#${fragment}`;
  return { url, tooLong: url.length > TOO_LONG, length: url.length };
}
