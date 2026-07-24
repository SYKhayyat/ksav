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
    pub bytes: Vec<u8>,
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
            let Some(old) = self.order.pop_front() else { break };
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

    // Bytes on the request: decode, cache under the hash, and use them.
    if let Some(data) = v.get("data").and_then(|x| x.as_str()) {
        let bytes = decode_payload(data)?;
        if name.is_empty() || bytes.is_empty() {
            return None;
        }
        if let Some(h) = &hash {
            cache().lock().ok()?.put(h.clone(), Arc::new(bytes.clone()));
        }
        return Some(Asset { name, bytes });
    }

    // No bytes: the client is relying on the cache. Resolve by hash, or record it
    // as missing so the client knows to send the bytes next time.
    let h = hash?;
    match cache().lock().ok().and_then(|c| c.get(&h)) {
        Some(bytes) => Some(Asset {
            name,
            bytes: (*bytes).clone(),
        }),
        None => {
            missing.push(h);
            None
        }
    }
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
    Some(Asset { name, bytes })
}
