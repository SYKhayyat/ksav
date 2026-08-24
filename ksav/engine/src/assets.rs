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
    pub fn from_json(v: &serde_json::Value) -> Assets {
        Assets {
            files: read_list(v.get("assets")),
            fonts: read_list(v.get("fonts")),
        }
    }

    /// Read the `assets`/`fonts` arrays, resolving hash-only entries from the
    /// content cache and caching any that arrive with their bytes.
    ///
    /// Returns the assets plus the hashes it could not resolve — a hash the client
    /// believed was cached but the engine no longer holds. The caller passes those
    /// back so the client re-sends the bytes on the next compile.
    pub fn from_request(v: &serde_json::Value) -> (Assets, Vec<String>) {
        let mut missing = Vec::new();
        let files = read_list_cached(v.get("assets"), &mut missing);
        let fonts = read_list_cached(v.get("fonts"), &mut missing);
        (Assets { files, fonts }, missing)
    }

    /// Read **one** assets array split by each entry's own `kind`.
    ///
    /// This is the document-file shape — `requestAssets` sends two arrays and
    /// this file carries one, and reading it used to mean cloning every entry,
    /// multi-megabyte base64 payloads included, to build the two-array request
    /// shape just so [`from_request`](Self::from_request) could walk it again.
    /// One pass over references now; an entry with no `kind` is an image, the
    /// same reading `!== "font"` makes on the client.
    pub fn from_docfile(v: Option<&serde_json::Value>) -> (Assets, Vec<String>) {
        let mut missing = Vec::new();
        let mut files = Vec::new();
        let mut fonts = Vec::new();
        if let Some(arr) = v.and_then(|x| x.as_array()) {
            for entry in arr {
                let is_font = entry.get("kind").and_then(|k| k.as_str()) == Some("font");
                if let Some(asset) = read_one_cached(entry, &mut missing) {
                    if is_font {
                        fonts.push(asset);
                    } else {
                        files.push(asset);
                    }
                }
            }
        }
        (Assets { files, fonts }, missing)
    }
}

fn read_list_cached(v: Option<&serde_json::Value>, missing: &mut Vec<String>) -> Vec<Asset> {
    let Some(arr) = v.and_then(|x| x.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|entry| read_one_cached(entry, missing))
        .collect()
}

fn read_one_cached(v: &serde_json::Value, missing: &mut Vec<String>) -> Option<Asset> {
    let name = v.get("name")?.as_str()?.to_string();
    let hash = v.get("hash").and_then(|x| x.as_str()).map(str::to_string);

    // Bytes on the request: decode, cache under the hash **we compute**, use them.
    if let Some(data) = v.get("data").and_then(|x| x.as_str()) {
        let bytes = decode_payload(data)?;
        if name.is_empty() || bytes.is_empty() {
            return None;
        }
        let bytes = Arc::new(bytes);
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
fn decode_payload(data: &str) -> Option<Vec<u8>> {
    let payload = match data.find(";base64,") {
        Some(i) => &data[i + 8..],
        None => data,
    };
    base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .ok()
}

fn read_list(v: Option<&serde_json::Value>) -> Vec<Asset> {
    let Some(arr) = v.and_then(|x| x.as_array()) else {
        return Vec::new();
    };
    arr.iter().filter_map(read_one).collect()
}

fn read_one(v: &serde_json::Value) -> Option<Asset> {
    let name = v.get("name")?.as_str()?.to_string();
    let data = v.get("data")?.as_str()?;
    let bytes = decode_payload(data)?;
    if name.is_empty() || bytes.is_empty() {
        return None;
    }
    Some(Asset {
        name,
        bytes: Arc::new(bytes),
    })
}
