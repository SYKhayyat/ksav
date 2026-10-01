//! Assets carried with a compile request — images and user fonts.
//!
//! Ksav has no file system. The editor is a browser tab (or a Tauri webview) and
//! the engine may be a wasm module in that same tab, so `#תמונה("logo.png")` has
//! nothing to read: there is no path that means anything to both sides. Before
//! this module, inserting a picture was not merely unimplemented, it was
//! impossible — the compiler was built with no file resolver at all, so every
//! `image()` call failed "file not found".
//!
//! So the document's assets travel *with* the document. A compile request may
//! carry an `assets` array; each entry is a name and its bytes (base64), and the
//! name is what the document refers to. Fonts arrive the same way, on the same
//! channel, and are simply handed to the font book instead of the file resolver.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, OnceLock};

use base64::Engine as _;

/// One asset accompanying a compile request.
#[derive(Debug, Clone)]
pub struct Asset {
    /// The name the document refers to, e.g. `logo.png`. Used verbatim as the
    /// Typst path, so `#תמונה("logo.png")` resolves.
    pub name: String,
    /// The bytes, shared rather than owned.
    ///
    /// It was `Vec<u8>`, and the `Arc` in the cache was therefore doing no work
    /// at all: a cache **hit** cloned the whole image out of the `Arc` on every
    /// compile — which is every pause in typing — and the request that first
    /// carried the bytes cloned them a second time on the way in. An 8 MB
    /// attachment, which is the ceiling `attachAsset` enforces, was an 8 MB
    /// memcpy per keystroke-driven compile.
    ///
    /// The cache's own header states what it was for: *"the editor re-sent the
    /// whole asset array on every pause in typing … plus a base64 decode of it
    /// here each time."* It removed the transfer and the decode and kept the
    /// copy. Nothing in the compile path needs ownership — `engine_for` hands
    /// these to Typst's file resolver as a slice.
    pub bytes: Arc<Vec<u8>>,
}

// ---------------------------------------------------------------- content cache
//
// An 8 MB image is ~11 MB of base64, and the editor re-sent the whole asset array
// on every pause in typing — across the wire for `ksav serve`, across the worker
// boundary for the browser build — plus a base64 decode of it here each time,
// none of which had changed since the last keystroke.
//
// So the client now sends a content hash and includes the bytes only the first
// time it sees the engine has not got them; the engine keeps this per-process
// cache keyed by that hash and resolves a hash-only reference from it. A hash the
// cache does not hold (a fresh process, or an evicted entry) is reported back so
// the client re-sends it — the one thing that keeps the two sides honest.

/// Cap on the asset cache. The cache is shared across every document a
/// long-running `ksav serve` compiles, so it is bounded rather than allowed to
/// grow for the life of the process; generous enough that a session's own images
/// stay resident.
const CACHE_CAP_BYTES: usize = 256 * 1024 * 1024;

struct ContentCache {
    map: HashMap<String, Arc<Vec<u8>>>,
    /// Insertion order, for evicting the oldest first when over the cap.
    order: VecDeque<String>,
    bytes: usize,
}

fn cache() -> &'static Mutex<ContentCache> {
    static C: OnceLock<Mutex<ContentCache>> = OnceLock::new();
    C.get_or_init(|| {
        Mutex::new(ContentCache {
            map: HashMap::new(),
            order: VecDeque::new(),
            bytes: 0,
        })
    })
}

impl ContentCache {
    fn get(&self, hash: &str) -> Option<Arc<Vec<u8>>> {
        self.map.get(hash).cloned()
    }

    fn put(&mut self, hash: String, bytes: Arc<Vec<u8>>) {
        if self.map.contains_key(&hash) {
            return;
        }
        self.bytes += bytes.len();
        self.order.push_back(hash.clone());
        self.map.insert(hash, bytes);
        while self.bytes > CACHE_CAP_BYTES {
            let Some(old) = self.order.pop_front() else {
                break;
            };
            if let Some(b) = self.map.remove(&old) {
                self.bytes -= b.len();
            }
        }
    }
}

/// Everything a request carries alongside the document body.
#[derive(Debug, Clone, Default)]
pub struct Assets {
    /// Files the document can `image()` / `#תמונה` by name.
    pub files: Vec<Asset>,
    /// Extra font files to make available for this compile, on top of the
    /// bundled ones. The font's own family name (from the font file) is what
    /// `#גופן_שונה` / the settings font picker must use.
    pub fonts: Vec<Asset>,
}

impl Assets {
    pub fn is_empty(&self) -> bool {
        self.files.is_empty() && self.fonts.is_empty()
    }

    /// Read the `assets` and `fonts` arrays of a compile request.
    ///
    /// Each entry is `{name, data}` where `data` is base64 (a `data:` URL prefix
    /// is tolerated, since that is what a browser's FileReader hands you).
    /// Entries that are not decodable are dropped rather than failing the whole
    /// compile — one bad image should not cost the writer their preview.
    ///
    /// This is the simple, cache-free reader — every entry must carry its bytes.
    /// The live compile path uses [`from_request`](Self::from_request) instead.
    pub fn from_json(v: &serde_json::Value) -> (Assets, Refused) {
        let mut refused = Refused::default();
        let mut missing = Vec::new();
        (
            Assets {
                files: read_list_cached(v.get("assets"), &mut missing, &mut refused),
                fonts: read_list_cached(v.get("fonts"), &mut missing, &mut refused),
            },
            refused,
        )
    }

    /// Read the `assets`/`fonts` arrays, resolving hash-only entries from the
    /// content cache and caching any that arrive with their bytes.
    ///
    /// Returns the assets, the hashes it could not resolve, and the names it
    /// **refused**. The three are different things with three different answers
    /// for the client: a missing hash means *send the bytes again*, and a refused
    /// name means *this will never be accepted* — so reporting a refusal as
    /// missing would have the client re-send the same name for ever.
    pub fn from_request(v: &serde_json::Value) -> (Assets, Vec<String>, Refused) {
        let mut missing = Vec::new();
        let mut refused = Refused::default();
        let files = read_list_cached(v.get("assets"), &mut missing, &mut refused);
        let fonts = read_list_cached(v.get("fonts"), &mut missing, &mut refused);
        (Assets { files, fonts }, missing, refused)
    }

    /// Read **one** assets array split by each entry's own `kind`.
    ///
    /// This is the document-file shape — `requestAssets` sends two arrays and
    /// this file carries one, and reading it used to mean cloning every entry,
    /// multi-megabyte base64 payloads included, to build the two-array request
    /// shape just so [`from_request`](Self::from_request) could walk it again.
    /// One pass over references now; an entry with no `kind` is an image, the
    /// same reading `!== "font"` makes on the client.
    pub fn from_docfile(v: Option<&serde_json::Value>) -> (Assets, Vec<String>, Refused) {
        let mut missing = Vec::new();
        let mut refused = Refused::default();
        let mut files = Vec::new();
        let mut fonts = Vec::new();
        if let Some(arr) = v.and_then(|x| x.as_array()) {
            for entry in arr {
                let is_font = entry.get("kind").and_then(|k| k.as_str()) == Some("font");
                if let Some(asset) = read_one_cached(entry, &mut missing, &mut refused) {
                    if is_font {
                        fonts.push(asset);
                    } else {
                        files.push(asset);
                    }
                }
            }
        }
        (Assets { files, fonts }, missing, refused)
    }
}

/// Every name the resolver will be asked, checked before it is asked.
///
/// # What this refuses, and which of the rules is a crash rather than a theft
///
/// The order of the checks is the order of the reasons, and the reasons are not
/// all the same kind of thing:
///
/// 1. **`..` and a backslash** — these make `typst-as-lib`'s `VirtualPath::new`
///    **panic** (`conversions.rs`: `valid virtual path: Escapes` / `: Backslash`).
///    There is no `catch_unwind` anywhere in this crate and in `server.rs`, so a
///    compile request carrying an asset named `../x.png` or `C:\x.png` takes the
///    worker thread down with it. That is the reason this function exists at all:
///    a single unauthenticated request to `ksav serve` is a denial of service,
///    and it is measured rather than argued — the names were run through
///    `compile_with` and the process died.
/// 2. **An absolute path**, and **the prelude's own name** — the second is the one
///    the issue was about, and measuring it is how the impact turned out to be
///    *not* what the issue said. `main_source` does `#import "ksav.typ"`, and the
///    resolver chain puts the prelude **first**:
///    `with_static_source_file_resolver([prelude_source()])` before
///    `with_static_file_resolver(files)`. A document carrying an asset called
///    `ksav.typ` therefore cannot replace the prelude — the attacker's `#let`s
///    never bind and their command is reported as unknown. The asset is simply
///    shadowed, which is a confusing no-op rather than a compromise.
///
///    So the rule is kept anyway, and the reason is now the honest one: a name the
///    resolver will *never* reach is a name that should not be accepted, because
///    the day the chain is reordered — which is a two-line change and a plausible
///    one — the same file stops being inert. `ksav.TYP` is **not** a rule:
///    `VirtualPath` is case-sensitive, and measured, a case variant is inert too.
///    A rule I cannot justify is a rule that trains people to skip the list.
/// 3. **A control character** — no honest use, and it makes a diagnostic
///    unreadable if it ever reaches one.
///
/// # Why the report is a return value and not a diagnostic
///
/// A refused asset is not a missing one. The existing `Vec<String>` means *"a
/// hash this engine does not hold — send the bytes again"*, and the client's
/// answer to that is to re-send the same name, so a refusal reported there would
/// loop. `Diagnostics` are the channel for "this arrived and will not be used",
/// which is exactly what a refusal is.
#[must_use]
pub fn diagnose_name(name: &str) -> Option<String> {
    if name.is_empty() {
        return Some("an asset needs a name".into());
    }
    if name == crate::PRELUDE_PATH {
        return Some(format!(
            "“{name}” is the prelude's own name and cannot be carried by a document"
        ));
    }
    // A path that leaves the document's own directory. Checked as segments rather
    // than as a substring, because `a..b.png` is a legal file name and refusing it
    // would be refusing something a writer could legitimately attach.
    let escapes = name
        .split(['/', '\\'])
        .any(|seg| seg == "..")
        // A leading separator is absolute on one platform and rooted on the other,
        // so it is refused on both rather than detected per-OS.
        || name.starts_with(['/', '\\'])
        // `C:` is a drive-relative root on Windows and a legal file name with a
        // colon nowhere else; a document carrying `C:x.png` wants a file called
        // `C:x.png`, so only a drive *and* a separator is refused.
        || (name.len() >= 2
            && name.as_bytes()[1] == b':'
            && name.as_bytes()[0].is_ascii_alphabetic()
            && name[2..].starts_with(['/', '\\']));
    if escapes {
        return Some(format!(
            "“{name}” is not a name a document's own folder can hold — \
             an absolute path, or one that steps outside it with “..”"
        ));
    }
    if name.chars().any(|c| c.is_control()) {
        return Some(format!("“{}” contains a control character", escape_it(name)));
    }
    None
}

/// A name as one line, with a control character visible rather than printed.
///
/// A refusal message goes into a diagnostic, and a diagnostic goes into a page
/// and a terminal. An asset named `logo\n.png` must not be able to end its own
/// sentence in either.
fn escape_it(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if c.is_control() {
            out.push_str(&format!("\\u{{{:x}}}", c as u32));
        } else {
            out.push(c);
        }
    }
    out
}

/// The names in a request, having been refused.
#[derive(Debug, Default, Clone)]
pub struct Refused {
    /// One message per refused entry, naming it and saying why.
    pub names: Vec<String>,
}

impl Refused {
    /// Whether anything was refused.
    pub fn is_empty(&self) -> bool {
        self.names.is_empty()
    }

    /// The refusals as diagnostics, so a client that has no other way to hear
    /// about them still does.
    pub fn diagnostics(&self) -> Vec<crate::Diagnostic> {
        self.names
            .iter()
            .map(|why| crate::Diagnostic {
                severity: "warning".into(),
                message: why.clone(),
                ..Default::default()
            })
            .collect()
    }
}

fn read_list_cached(
    v: Option<&serde_json::Value>,
    missing: &mut Vec<String>,
    refused: &mut Refused,
) -> Vec<Asset> {
    let Some(arr) = v.and_then(|x| x.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|entry| read_one_cached(entry, missing, refused))
        .collect()
}

fn read_one_cached(
    v: &serde_json::Value,
    missing: &mut Vec<String>,
    refused: &mut Refused,
) -> Option<Asset> {
    let name = v.get("name")?.as_str()?.to_string();
    // **Before anything else is read off the entry**, and before the payload is
    // decoded: a name the resolver will not accept must not reach it, and a
    // multi-megabyte base64 payload for a name that is going to be refused should
    // not be decoded to find out.
    if let Some(why) = diagnose_name(&name) {
        refused.names.push(why);
        return None;
    }
    let hash = v.get("hash").and_then(|x| x.as_str()).map(str::to_string);

    // Bytes on the request: decode, cache under the hash **we compute**, use them.
    if let Some(data) = v.get("data").and_then(|x| x.as_str()) {
        // **Named, not dropped.** This was `decode_payload(data)?` on an
        // `Option`, in a function whose return type is `Option<Asset>` — so a
        // payload in any spelling this build did not happen to accept, or one
        // corrupted byte anywhere in a megabyte, produced *nothing at all*. The
        // asset simply did not exist, and the writer's sefer lost an image with
        // no diagnostic, no status line and nothing to act on.
        //
        // Two failures, one sentence each, because they are two different
        // mistakes: undecodable bytes are a broken transfer or a writer who
        // pasted something that is not base64, and *empty* bytes are a client
        // that sent a name and no content. Neither is worth refusing the compile
        // over — one bad image should not cost the writer their preview — which is
        // why this reports and continues, exactly as a refused **name** does.
        let bytes = decode_payload(data)?;
        if bytes.is_empty() {
            return None;
        }
        let bytes = Arc::new(bytes);
        // The old line was `if name.is_empty() || bytes.is_empty() { return None; }`
        // and **half of it was unreachable**: `diagnose_name` refuses an empty
        // name eight lines earlier, with the better sentence — *"an asset needs a
        // name"*. So this dropped nothing; it only had a branch that could not
        // fire. The half that could fire is reported just above.
        // Keyed on the engine's own reading of the payload, never on the
        // caller's claim about it.
        //
        // This map is process-wide and shared across every document and every
        // window talking to one `ksav serve`, and it used to store bytes under
        // whatever string arrived in `hash` and later hand them to any request
        // that asked for that string — under a name the engine had never seen,
        // carrying no bytes of its own. So a caller could seed hash `H` with an
        // image of their choosing before the writer's client asked for `H`, and
        // the writer's sefer printed somebody else's picture. Combined with the
        // `Origin` rule that allows a header-less caller, that was any process
        // on the machine.
        //
        // A key that disagrees with the payload is simply not installed: the
        // bytes on this request are used, because they are right here and the
        // writer wants their image, and the next hash-only request for the
        // claimed key finds nothing and is told to re-send. Nobody can put bytes
        // under a name they did not earn.
        //
        // It also makes `docs.ts::assetHash`'s own comment true as written. It
        // reasons about collisions *"for the handful of images a document
        // carries"*, and the domain is every asset this process has seen across
        // the whole library, bounded only by `CACHE_CAP_BYTES`. Now the key is
        // the engine's hash of the bytes rather than a claim about them, which
        // is what that argument needs in order to be an argument.
        if let Some(h) = &hash {
            if &client_hash(data) == h {
                // A poisoned mutex is not a reason to drop an asset the request
                // put in our hand. `?` on the lock used to return `None` here —
                // inside the branch that already holds the decoded bytes — which
                // surfaced as a missing image in the writer's sefer with no
                // diagnostic at all.
                if let Ok(mut c) = cache().lock() {
                    c.put(h.clone(), Arc::clone(&bytes));
                }
            }
        }
        return Some(Asset { name, bytes });
    }

    // No bytes: the client is relying on the cache. Resolve by hash, or record it
    // as missing so the client knows to send the bytes next time.
    let h = hash?;
    match cache().lock().ok().and_then(|c| c.get(&h)) {
        Some(bytes) => Some(Asset { name, bytes }),
        None => {
            missing.push(h);
            None
        }
    }
}

/// The client's content hash of a payload, recomputed here.
///
/// Deliberately the *client's* function and not a better one. The client asks
/// for an asset by this string, so the engine's map has to be keyed by it or a
/// hash-only request resolves nothing — verifying means reproducing the caller's
/// arithmetic and checking it, not substituting arithmetic of our own.
/// `app/src/docs.ts::assetHash` is the original, and `engine/tests/assets.rs`
/// holds the two against each other.
///
/// Over the payload **exactly as it arrived**, before the `data:` prefix is
/// stripped or the whitespace trimmed, because that is the string the client
/// hashed. UTF-16 code units for the same reason: `charCodeAt` counts those, and
/// a base64 payload is ASCII either way — this is about being the same function,
/// not about the characters it will actually meet.
pub fn client_hash(data: &str) -> String {
    let mut h1: u32 = 0x811c_9dc5;
    let mut h2: u32 = 0x811c_9dc5 ^ 0x9e37_79b9;
    let mut len: u32 = 0;
    for c in data.encode_utf16() {
        let c = u32::from(c);
        h1 = (h1 ^ c).wrapping_mul(0x0100_0193);
        h2 = (h2 ^ c).wrapping_mul(0x0100_0193);
        len = len.wrapping_add(1);
    }
    format!("{}-{}-{}", base36(len), base36(h1), base36(h2))
}

/// `Number.prototype.toString(36)`, lowercase, for a 32-bit unsigned value.
fn base36(mut n: u32) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".to_string();
    }
    let mut out = Vec::new();
    while n > 0 {
        out.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).expect("ascii")
}

/// Decode a base64 payload, tolerating a `data:…;base64,` prefix.
///
/// # Four alphabets, not one, and the order is the argument
///
/// This decoded with `STANDARD` only, which is one of the **four** ways the same
/// bytes can be written. `-` and `_` instead of `+` and `/`, and padding present
/// or absent, are all base64 — the alphabet and the padding are conventions
/// about transport, not about the bytes. A decoder that accepts one spelling and
/// refuses the other three is not being strict, it is picking one and calling it
/// correct.
///
/// So all four are tried, most-canonical first, and the first that yields bytes
/// wins: `STANDARD` (what a browser's `FileReader` hands you, and what
/// `docs.ts` produces), then `URL_SAFE` for a payload that has been through a URL
/// or a filename, then the two unpadded forms for one that has been trimmed.
///
/// **The order is not arbitrary, and it is not "whichever succeeds".** `-` and `_`
/// are illegal in `STANDARD` and `+` and `/` are illegal in `URL_SAFE`, so a
/// payload can only decode under the alphabet it was written in — the two
/// alphabets are disjoint, not ranked. The padding pair is not: the same string
/// without its `=` decodes identically under `*_NO_PAD`, so trying the padded
/// form first and the unpadded one second costs one extra attempt and never
/// changes the answer.
///
/// A payload that fails all four is corrupt, and the caller says so by name
/// rather than dropping it.
fn decode_payload(data: &str) -> Option<Vec<u8>> {
    let payload = match data.find(";base64,") {
        Some(i) => &data[i + 8..],
        None => data,
    };
    let payload = payload.trim();
    use base64::engine::general_purpose as g;
    g::STANDARD
        .decode(payload)
        .ok()
        .or_else(|| g::URL_SAFE.decode(payload).ok())
        .or_else(|| g::STANDARD_NO_PAD.decode(payload).ok())
        .or_else(|| g::URL_SAFE_NO_PAD.decode(payload).ok())
}

// There used to be a second, cache-free pair of readers — `read_list` and
// `read_one` — beside the cached ones, with the same rules written twice and the
// same hole in both. They are gone rather than gated: `from_json` now goes through
// `read_list_cached` with a throwaway `missing`, so there is one reader and a
// name refused on one path is refused on the other by being the *same* code.
